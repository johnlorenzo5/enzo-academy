import { createHash, randomUUID } from 'node:crypto';
import { activitiesFor } from '@enzo/domain';
import { fail, validId, type Store, type Transaction, type Enrollment, type Identity, type Activity } from './academy.js';
import { certificatePdf, type CertificateContent } from './certificate-pdf.js';

type EmailState='pending'|'sending'|'accepted'|'failed'|'not_configured'|'needs_review';
export type Certificate=CertificateContent & {uid:string;courseId:string;moduleId:string;status:'valid'|'revoked';revokedAt?:string;revocationReason?:string;email:{status:EmailState;generation:number;attempts:number;nextAttemptAt:number;firstAttemptAt?:number;leaseUntil?:number;lastError?:string;providerId?:string;acceptedAt?:string}};
export type Mailer={configured:boolean;send:(c:Certificate,email:string,key:string)=>Promise<string>};
export function resendMailer():Mailer {
  const key=process.env.RESEND_API_KEY,from=process.env.CERTIFICATE_EMAIL_FROM;
  return {configured:!!(key&&from&&process.env.PUBLIC_APP_URL),async send(c,email,idempotencyKey){
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from,to:[email],subject:'Congratulations! Your Certificate of Completion Is Ready',text:`Hello ${c.holderName},\n\nCongratulations on successfully completing ${c.moduleTitle}!\n\nYour Certificate of Completion is now available. You can view and download your certificate using the link below.\n\nModule: ${c.moduleTitle}\nCompletion Date: ${c.completedAt.slice(0,10)}\nCertificate ID: ${c.id}\n\nView and Download Certificate:\n${new URL(c.verificationUrl).origin}/#certificate/${c.id}\n\nKeep learning and continue earning achievements!\n\nBest regards,\n${c.platformName}`})});
    if(!response.ok){
      let detail='';
      try{const error=await response.json() as {message?:unknown};if(typeof error.message==='string')detail=error.message.slice(0,1000);}catch{}
      throw new Error(`Email provider returned HTTP ${response.status}.${detail?' '+detail:''}`);
    }
    const body=await response.json() as {id?:string};if(!body.id)throw new Error('Email provider did not confirm acceptance.');return body.id;
  }};
}
export function certificates(store:Store,clock:()=>number,mailer:Mailer=resendMailer(),baseUrl=process.env.PUBLIC_APP_URL??'http://127.0.0.1:5173') {
  const origin=new URL(baseUrl).origin;
  function event(tx:Transaction,c:Certificate,action:string,actor:string,detail='') {const id=randomUUID();tx.set('academyCertificateEvents',id,{id,certificateId:c.id,at:new Date(clock()).toISOString(),action,actor,detail});}
  async function issue(tx:Transaction,e:Enrollment,now:number) {
    // Activity evidence is checked independently of the client's state and done array.
    const complete=e.curriculum.filter((m,index)=>m.activities
      ?m.activities.length>0&&activitiesFor(m).every((a:Activity)=>!!e.activityProgress?.[a.id]?.completedAt)
      :!!e.activityProgress?.[m.id]?.completedAt || (e.done.includes(index)&&(m.questions.length?e.quizAttempts[m.id]?.passed===true:!!e.notes[index]?.trim())));
    const candidates=await Promise.all(complete.map(async m=>{const id=`CERT-${createHash('sha256').update(JSON.stringify([e.uid,e.courseId,m.id])).digest('hex')}`;return {m,id,existing:await tx.get<Certificate>('academyCertificates',id)};}));
    const learner=await tx.get<Identity>('academyLearners',e.uid);
    const pending: {c:Certificate;pdf:string}[]=[];
    for(const {m,id,existing} of candidates){
      e.certificates??={};e.certificates[m.id]=id;
      if(existing)continue;
      const times=activitiesFor(m).map((a:Activity)=>e.activityProgress?.[a.id]?.completedAt).filter(Boolean) as string[];
      const completedAt=times.sort().at(-1)??e.completedAt??new Date(now).toISOString();
      const c:Certificate={id,uid:e.uid,courseId:e.courseId,moduleId:m.id,holderName:learner?.name&&learner.name!==learner.email?learner.name:'Learner',moduleTitle:m.title,courseTitle:e.courseTitle,platformName:'enzoAcademy',completedAt,issuedAt:new Date(now).toISOString(),verificationUrl:`${origin}/#verify/${id}`,status:'valid',email:{status:mailer.configured?'pending':'not_configured',generation:0,attempts:0,nextAttemptAt:now}};
      pending.push({c,pdf:(await certificatePdf(c)).toString('base64')});
    }
    // All Firestore transaction reads precede every write.
    for(const {c,pdf} of pending){tx.set('academyCertificates',c.id,c);tx.set('academyCertificatePdfs',c.id,{data:pdf});event(tx,c,'issued','system');}
  }
  async function get(id:string,uid?:string,admin=false){const c=await store.get<Certificate>('academyCertificates',validId(id));if(!c||(!admin&&uid!==c.uid))return fail(404,'Certificate not found.');return c;}
  async function send(id:string) {
    const claimed=await store.transaction(async tx=>{
      const c=await tx.get<Certificate>('academyCertificates',id);if(!c||c.status!=='valid')return null;
      const now=clock(),email=c.email;
      if(['accepted','needs_review'].includes(email.status)||email.nextAttemptAt>now||(email.status==='sending'&&(email.leaseUntil??0)>now))return null;
      if(!mailer.configured){if(email.status!=='not_configured'){email.status='not_configured';tx.set('academyCertificates',id,c);}return null;}
      // Resend retains idempotency keys for 24 hours. Never blindly retry an ambiguous older send.
      if(email.firstAttemptAt!==undefined&&now-email.firstAttemptAt>=23*3600000){email.status='needs_review';tx.set('academyCertificates',id,c);event(tx,c,'email_needs_review','system');return null;}
      const learner=await tx.get<Identity>('academyLearners',c.uid);
      email.status='sending';email.firstAttemptAt??=now;email.leaseUntil=now+60000;email.attempts++;tx.set('academyCertificates',id,c);
      return {c,to:learner?.email};
    });
    if(!claimed)return;
    let providerId='',error='';
    try{if(!claimed.to)throw new Error('The account has no registered email address.');providerId=await mailer.send(claimed.c,claimed.to,`${id}/${claimed.c.email.generation}`);}catch(e){error=(e as Error).message;}
    await store.transaction(async tx=>{const c=await tx.get<Certificate>('academyCertificates',id);if(!c||c.email.generation!==claimed.c.email.generation)return;
      c.email={...c.email,status:error?'failed':'accepted',lastError:error,providerId,leaseUntil:0,nextAttemptAt:clock()+Math.min(3600000,60000*2**Math.min(c.email.attempts,6)),...(error?{}:{acceptedAt:new Date(clock()).toISOString()})};
      tx.set('academyCertificates',id,c);event(tx,c,error?'email_failed':'email_accepted','system',error||providerId);
    });
  }
  let running:Promise<void>|undefined;
  function drain(){return running??=(async()=>{for(const c of await store.list<Certificate>('academyCertificates'))await send(c.id);})().finally(()=>{running=undefined;});}
  return {issue,drain,
    async list(uid?:string){return store.list<Certificate>('academyCertificates',uid?{field:'uid',value:uid}:undefined);},
    async details(id:string,uid:string,admin=false){const c=await get(id,uid,admin);return {certificate:c,...(admin?{history:await store.list('academyCertificateEvents',{field:'certificateId',value:id})}:{})};},
    async pdf(id:string,uid:string,admin=false){const c=await get(id,uid,admin);if(c.status!=='valid')fail(410,'This certificate has been revoked.');const file=await store.get<{data:string}>('academyCertificatePdfs',id);if(!file)return fail(404,'Certificate PDF not found.');return Buffer.from(file.data,'base64');},
    async verify(id:string){const c=await store.get<Certificate>('academyCertificates',validId(id));if(!c)return fail(404,'Certificate not found.');return {id:c.id,status:c.status,holderName:c.holderName,moduleTitle:c.moduleTitle,issuedAt:c.issuedAt,completedAt:c.completedAt,platformName:c.platformName};},
    async revoke(id:string,actor:string,input:unknown){const reason=(input as {reason?:unknown})?.reason;if(typeof reason!=='string'||!reason.trim()||reason.length>1000)fail(400,'Enter a revocation reason (1–1000 characters).');return store.transaction(async tx=>{const c=await tx.get<Certificate>('academyCertificates',validId(id));if(!c)return fail(404,'Certificate not found.');if(c.status==='revoked')return c;c.status='revoked';c.revokedAt=new Date(clock()).toISOString();c.revocationReason=(reason as string).trim();tx.set('academyCertificates',id,c);event(tx,c,'revoked',actor,c.revocationReason);return c;});},
    async resend(id:string,actor:string,input:unknown){const requestId=validId((input as {requestId:string})?.requestId);await store.transaction(async tx=>{
      const c=await tx.get<Certificate>('academyCertificates',validId(id));const previous=await tx.get('academyCertificateRequests',`${id}_${requestId}`);
      if(!c)return fail(404,'Certificate not found.');if(previous)return;if(c.status==='revoked')fail(409,'Revoked certificates cannot be emailed.');
      if(c.email.status==='sending'&&(c.email.leaseUntil??0)>clock())fail(409,'An email send is already in progress.');
      if(c.email.status==='accepted'&&clock()-Date.parse(c.email.acceptedAt!)<60000)fail(429,'Wait one minute before sending another notification.');
      if(['accepted','needs_review'].includes(c.email.status))c.email={status:'pending',generation:c.email.generation+1,attempts:0,nextAttemptAt:clock()};
      else c.email={...c.email,nextAttemptAt:clock()};
      tx.set('academyCertificateRequests',`${id}_${requestId}`,{certificateId:id,requestId,actor});tx.set('academyCertificates',id,c);event(tx,c,'email_requested',actor);
    });await send(id);return this.details(id,actor,true);},
  };
}
