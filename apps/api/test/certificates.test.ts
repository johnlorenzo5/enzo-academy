import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildFirebaseApp } from '../src/firebase-app.js';
import { certificates, type Certificate, type Mailer } from '../src/certificates.js';
import type { Store, Transaction, Enrollment } from '../src/academy.js';

// Serializes competing transactions and rejects reads after writes, like Firestore.
class StrictStore implements Store {
  data=new Map<string,unknown>();tail=Promise.resolve();
  async get<T>(c:string,id:string){return structuredClone(this.data.get(`${c}/${id}`)??null) as T|null;}
  async list<T>(c:string,filter?:{field:string;value:string}){return structuredClone([...this.data.entries()].filter(([key,v])=>key.startsWith(`${c}/`)&&(!filter||(v as Record<string,unknown>)[filter.field]===filter.value)).map(([,v])=>v)) as T[];}
  async transaction<T>(work:(tx:Transaction)=>Promise<T>){let release!:()=>void;const previous=this.tail;this.tail=new Promise(resolve=>release=resolve);await previous;const pending=new Map<string,unknown>();try{const result=await work({get:async<T>(c:string,id:string)=>{assert.equal(pending.size,0,'Firestore reads must precede writes');return this.get<T>(c,id);},set:(c,id,v)=>{pending.set(`${c}/${id}`,structuredClone(v));}});for(const [key,value] of pending)this.data.set(key,value);return result;}finally{release();}}
}
const course={title:'Certificate course',category:'Programming',description:'A real authored course.',level:'Beginner',durationValue:1,durationUnit:'days',active:true,enrollmentStart:null,enrollmentEnd:null,modules:[{id:'m1',title:'Assessment',content:'Learn this.',exercise:'',passPercent:100,questions:[{id:'q',type:'identification',prompt:'Answer',points:1,answers:['correct'],options:[],correct:[]}]}]};
function setup(mailer:Mailer={configured:false,send:async()=>{throw new Error('Not configured');}}){
  const store=new StrictStore();let now=Date.parse('2026-10-24T00:00:00Z');
  const app=buildFirebaseApp({store,clock:()=>now,mailer,emailWorker:false,adminUid:'admin',verify:async token=>{if(!['admin','student','other'].includes(token))throw new Error('Invalid');return {uid:token,name:'José Dela Cruz',email:`${token}@example.com`};}});
  const req=(method:string,url:string,token?:string,payload?:unknown)=>app.inject({method:method as 'GET',url,headers:token?{authorization:`Bearer ${token}`}:{},...(payload===undefined?{}:{payload:payload as object})});
  const awards=certificates(store,()=>now,mailer);
  async function enroll(value=course){const response=await req('POST','/api/admin/courses','admin',value);assert.equal(response.statusCode,201,response.body);const id=response.json().course.id;await req('POST',`/api/courses/${id}/enroll`,'student');return id;}
  const submit=(id:string,answer='correct')=>req('POST',`/api/enrollments/${id}/modules/m1/submit`,'student',{responses:{q:answer},passed:true,done:[0]});
  return {store,app,req,awards,enroll,submit,advance:(ms:number)=>now+=ms};
}

test('backend issues one persistent PDF, rejects forged completion, protects downloads and exposes minimal verification',async t=>{
  const {app,req,awards,enroll,submit}=setup();t.after(()=>app.close());const courseId=await enroll();
  await submit(courseId,'wrong');assert.equal((await awards.list()).length,0);
  const results=await Promise.all([submit(courseId),submit(courseId)]);for(const result of results)assert.equal(result.statusCode,200,result.body);
  const [c]=await awards.list();assert.equal((await awards.list()).length,1);assert.equal(c.holderName,'José Dela Cruz');assert.equal(c.email.status,'not_configured');
  assert.equal((await req('GET','/api/certificates','student')).json().certificates[0].id,c.id);
  assert.equal((await req('GET','/api/certificates','other')).json().certificates.length,0);
  for(const suffix of ['', '/pdf']){assert.equal((await req('GET',`/api/certificates/${c.id}${suffix}`)).statusCode,401);assert.equal((await req('GET',`/api/certificates/${c.id}${suffix}`,'other')).statusCode,404);}
  const pdf=await req('GET',`/api/certificates/${c.id}/pdf`,'student');assert.equal(pdf.statusCode,200);assert.equal(pdf.headers['content-type'],'application/pdf');assert.match(pdf.headers['cache-control'] as string,/no-store/);assert.equal((await PDFDocument.load(pdf.rawPayload)).getPageCount(),1);
  const again=await req('GET',`/api/certificates/${c.id}/pdf`,'student');assert.deepEqual(pdf.rawPayload,again.rawPayload);
  const verified=(await req('GET',`/api/certificates/verify/${c.id}`)).json().certificate;assert.equal(verified.status,'valid');assert.equal(verified.holderName,c.holderName);
  for(const privateKey of ['uid','email','courseId','revocationReason'])assert.equal(privateKey in verified,false);
  assert.equal((await req('GET','/api/certificates/verify/CERT-missing')).statusCode,404);
  assert.equal((await req('GET','/api/admin/certificates','student')).statusCode,403);
  assert.equal((await req('POST',`/api/admin/certificates/${c.id}/revoke`,'student',{reason:'forged'})).statusCode,403);
  assert.equal((await req('POST',`/api/admin/certificates/${c.id}/resend`,'other',{requestId:'retry1'})).statusCode,403);
});

test('email failures keep PDFs; concurrent workers and repeated resend requests share one provider idempotency key',async t=>{
  let attempts=0;const keys:string[]=[];const mailer={configured:true,async send(c:Certificate,to:string,key:string){assert.equal(to,'student@example.com');keys.push(key);if(++attempts===1)throw new Error('Temporary mail outage');return 'provider-message';}};
  const {app,req,awards,store,enroll,submit,advance}=setup(mailer);t.after(()=>app.close());await submit(await enroll());const [c]=await awards.list();
  await awards.drain();assert.equal((await awards.list())[0].email.status,'failed');assert.equal((await req('GET',`/api/certificates/${c.id}/pdf`,'student')).statusCode,200);
  advance(180000);const otherWorker=certificates(store,()=>Date.parse('2026-10-24T00:03:00Z'),mailer);await Promise.all([awards.drain(),otherWorker.drain()]);assert.equal(attempts,2);assert.equal(keys[0],keys[1]);assert.equal((await awards.list())[0].email.status,'accepted');
  await submit(c.courseId);await awards.drain();assert.equal(attempts,2);
  advance(61000);for(let i=0;i<2;i++){const result=await req('POST',`/api/admin/certificates/${c.id}/resend`,'admin',{requestId:'same-request'});assert.equal(result.statusCode,200,result.body);}
  assert.equal(attempts,3);assert.notEqual(keys[2],keys[1]);assert.equal((await awards.list()).length,1);
  const details=(await req('GET',`/api/admin/certificates/${c.id}`,'admin')).json();assert.ok(details.history.some((h:any)=>h.action==='email_failed'));assert.equal(details.history.filter((h:any)=>h.action==='issued').length,1);
});

test('revocation records a reason, invalidates verification and downloads, and is never undone by repeated completion',async t=>{
  const {app,req,awards,enroll,submit}=setup();t.after(()=>app.close());await submit(await enroll());const [c]=await awards.list();
  assert.equal((await req('POST',`/api/admin/certificates/${c.id}/revoke`,'admin',{})).statusCode,400);
  assert.equal((await req('POST',`/api/admin/certificates/${c.id}/revoke`,'admin',{reason:'Issued in error'})).statusCode,200);
  await submit(c.courseId);assert.equal((await awards.list()).length,1);
  assert.equal((await req('GET',`/api/certificates/verify/${c.id}`)).json().certificate.status,'revoked');
  assert.equal((await req('GET',`/api/certificates/${c.id}/pdf`,'student')).statusCode,410);
  assert.equal((await req('POST',`/api/admin/certificates/${c.id}/resend`,'admin',{requestId:'r1'})).statusCode,409);
  const result=(await req('GET',`/api/admin/certificates/${c.id}`,'admin')).json();assert.equal(result.certificate.revocationReason,'Issued in error');assert.ok(result.history.some((h:any)=>h.action==='revoked'));
});

test('guided modules require every activity; issuance keeps Firestore reads before video-watch writes',async t=>{
  const {app,req,awards,enroll,advance}=setup();t.after(()=>app.close());
  const activity=(id:string,type:string)=>({id,title:id,type,content:'Required lesson',questions:[],passPercent:100,estimatedMinutes:1,transcript:'',resources:[],videoId:type==='video'?'M7lc1UVf-VE':''});
  const id=await enroll({...course,modules:[{id:'m1',title:'Guided module',content:'',passPercent:100,questions:[],activities:[activity('read','reading'),activity('watch','video')]}]} as any);
  assert.equal((await req('POST',`/api/enrollments/${id}/activities/read/submit`,'student',{acknowledged:true})).statusCode,200);assert.equal((await awards.list()).length,0);
  const {token}=(await req('POST',`/api/enrollments/${id}/activities/watch/video-session`,'student',{duration:10})).json();advance(10000);
  const response=await req('POST',`/api/enrollments/${id}/activities/watch/video-progress`,'student',{token,sequence:1,position:10,ended:true,ranges:[{start:0,end:10}]});assert.equal(response.statusCode,200,response.body);assert.equal((await awards.list()).length,1);
});

test('ambiguous email sends older than provider deduplication window require review',async t=>{
  let attempts=0;const mailer={configured:true,async send(){attempts++;throw new Error('Connection reset after send');}};
  const {app,awards,enroll,submit,advance}=setup(mailer);t.after(()=>app.close());await submit(await enroll());await awards.drain();advance(24*3600000);await awards.drain();assert.equal(attempts,1);assert.equal((await awards.list())[0].email.status,'needs_review');
});

test('backfill ignores unsupported done arrays and never publishes email as a holder name',async()=>{
  const store=new StrictStore();const awards=certificates(store,Date.now,{configured:false,send:async()=>''});
  const e={uid:'u',courseId:'c',courseTitle:'C',curriculum:course.modules,done:[0],notes:{},quizAttempts:{},activityProgress:{}} as unknown as Enrollment;
  await store.transaction(tx=>awards.issue(tx,e,Date.now()));assert.equal((await awards.list()).length,0);
  store.data.set('academyLearners/u',{name:'private@example.com',email:'private@example.com'});e.quizAttempts.m1={passed:true};
  await store.transaction(tx=>awards.issue(tx,e,Date.now()));assert.equal((await awards.list())[0].holderName,'Learner');
});
