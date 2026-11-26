import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { courseStatus, durationLabel, normalizeEnrollment, enrollmentStatus, validateModules, gradeModule, activitiesFor, curriculumItems, activityComplete, youtubeId } from '@enzo/domain';

export type Question = { id: string; type: string; prompt: string; points: number; options?: {id:string;text:string}[]; correct?: string[]; answers?: string[] };
export type Activity = { id:string; title:string; type:string; content:string; exercise?:string; passPercent:number; questions:Question[]; videoId?:string; estimatedMinutes?:number; transcript?:string; resources?:{title:string;url:string}[] };
export type Module = { id:string; title:string; content:string; exercise?:string; passPercent:number; questions:Question[]; activities?:Activity[] };
export type Course = { id:string; title:string; description:string; category:string; level:string; color:string; symbol:string; project:string; topics:string[]; modules:Module[]; durationValue:number; durationUnit:string; active:boolean; enrollmentStart:string|null; enrollmentEnd:string|null; revision:number; archived?:boolean };
export type ActivityProgress = { completedAt?:string; position?:number; duration?:number; percent?:number; note?:string; response?:string };
export type Enrollment = { uid:string; courseId:string; courseTitle:string; enrolledAt:string; expiresAt:string; done:number[]; notes:Record<string,string>; curriculum:Module[]; status:string; completedAt?:string; quizAttempts:Record<string,Record<string,unknown>>; cancelledAt?:string; activityProgress?:Record<string,ActivityProgress>; certificates?:Record<string,string> };
type VideoWatch = {token:string;sequence:number;updatedAt:number;duration:number;ranges:{start:number;end:number}[];reachedEnd:boolean};
export type Identity = { uid:string; email?:string; name?:string };
export interface Transaction {
  get<T>(collection:string,id:string):Promise<T|null>;
  set(collection:string,id:string,value:unknown):void;
}
export interface Store {
  get<T>(collection:string,id:string):Promise<T|null>;
  list<T>(collection:string,filter?:{field:string;value:string}):Promise<T[]>;
  transaction<T>(work:(tx:Transaction)=>Promise<T>):Promise<T>;
}
export class ApiError extends Error { constructor(public statusCode:number,message:string){super(message);} }
export const fail=(code:number,message:string):never=>{throw new ApiError(code,message);};
const idPattern=/^[a-zA-Z0-9_-]{1,128}$/;
export function validId(value:string){if(typeof value!=='string'||!idPattern.test(value)||['__proto__','constructor','prototype'].includes(value))fail(400,'Invalid identifier.');return value;}
const enrollmentId=(uid:string,courseId:string)=>Buffer.from(JSON.stringify([uid,courseId])).toString('base64url');
function publicActivity(a:Activity,locked=false) {
  return {id:a.id,title:a.title,type:a.type,estimatedMinutes:a.estimatedMinutes??0,locked,content:locked?'':a.content,exercise:locked?'':a.exercise??'',passPercent:a.passPercent,
    videoId:locked?'':a.videoId??'',transcript:locked?'':a.transcript??'',resources:locked?[]:a.resources??[],
    questions:locked?[]:a.questions.map(q=>({id:q.id,type:q.type,prompt:q.prompt,points:q.points,options:q.options??[]}))};
}
export function publicCourse(c:Course){
  return {id:c.id,title:c.title,description:c.description,category:c.category,level:c.level,color:c.color,symbol:c.symbol,project:c.project,topics:c.topics,durationValue:c.durationValue,durationUnit:c.durationUnit,active:c.active,enrollmentStart:c.enrollmentStart,enrollmentEnd:c.enrollmentEnd,status:courseStatus(c),duration:durationLabel(c)};
}
export function publicEnrollment(e:Enrollment,now=Date.now()) {
  const status=e.cancelledAt?'Cancelled':enrollmentStatus({},e,now);
  let blocked=['Expired','Cancelled'].includes(status??'');
  const unavailable=blocked;
  const curriculum=e.curriculum.map((m,index)=>{
    const activities=activitiesFor(m).map((a:Activity)=>{
      const complete=activityComplete(e,a,index);
      const result=publicActivity(a,unavailable || (blocked && !complete));
      if(!complete)blocked=true;
      return {...result,completed:complete};
    });
    return m.activities?{id:m.id,title:m.title,content:'',exercise:'',questions:[],passPercent:100,activities}:activities[0];
  });
  return {...e,curriculum,status};
}
function text(value:unknown,label:string,max:number){if(typeof value!=='string'||!value.trim()||value.length>max)fail(400,`${label} must contain 1–${max} characters.`);return (value as string).trim();}
export function validateCourse(input:unknown,id:string,revision:number):Course {
  if(!input||typeof input!=='object'||Array.isArray(input))return fail(400,'Course is required.');
  const value=input as Record<string,unknown>;
  try { validateModules(value.modules); } catch(error) { return fail(400,(error as Error).message); }
  const cleanLesson=(m:Module|Activity):Module=>{
    validId(m.id);
    const questions=m.questions.map(q=>{
      validId(q.id);
      return {id:q.id,type:q.type,prompt:q.prompt.trim(),points:q.points,options:q.type==='identification'?[]:q.options!.map(o=>({id:validId(o.id),text:o.text.trim()})),correct:q.type==='identification'?[]:q.correct!,answers:q.type==='identification'?q.answers!:[]};
    });
    if(m.exercise && (typeof m.exercise!=='string'||m.exercise.length>5000))fail(400,'Practice instructions are too long.');
    return {id:m.id,title:m.title.trim(),content:m.content.trim(),exercise:m.exercise??'',passPercent:m.passPercent,questions};
  };
  const modules=(value.modules as Module[]).map(m=>m.activities?{
    id:validId(m.id),title:m.title.trim(),content:'',exercise:'',passPercent:100,questions:[],
    activities:m.activities.map(a=>({...cleanLesson({...a,content:a.content||' '}),content:a.content.trim(),type:a.type,videoId:a.type==='video'?youtubeId(a.videoId)!:'',estimatedMinutes:a.estimatedMinutes!,transcript:a.transcript!,resources:a.resources!.map(r=>({title:r.title.trim(),url:r.url}))}))
  }:cleanLesson(m));
  if(Buffer.byteLength(JSON.stringify(modules))>450000)fail(400,'Course content is too large. Split it into smaller courses.');
  if(!['Beginner','Intermediate','Advanced'].includes(String(value.level)))fail(400,'Select a course level.');
  if(!Number.isInteger(value.durationValue)||Number(value.durationValue)<1||Number(value.durationValue)>10000||!['days','weeks','months'].includes(String(value.durationUnit)))fail(400,'Invalid course duration.');
  const date=(v:unknown)=>{if(v===null||v==='')return null;if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))return fail(400,'Invalid enrollment date.');return new Date(v).toISOString();};
  const enrollmentStart=date(value.enrollmentStart??null),enrollmentEnd=date(value.enrollmentEnd??null);
  if(enrollmentStart&&enrollmentEnd&&enrollmentStart>=enrollmentEnd)fail(400,'Enrollment end must follow its start.');
  if(typeof value.active!=='boolean')fail(400,'Course availability is required.');
  return {id,revision,title:text(value.title,'Title',100),description:text(value.description,'Description',400),category:text(value.category,'Category',60),level:String(value.level),color:['yellow','purple','blue','green','pink','orange'].includes(String(value.color))?String(value.color):'green',symbol:typeof value.symbol==='string'?value.symbol.slice(0,8):'<>',project:typeof value.project==='string'?value.project.slice(0,200):'Complete all modules',topics:modules.map(m=>m.title),modules,durationValue:Number(value.durationValue),durationUnit:String(value.durationUnit),active:value.active as boolean,enrollmentStart,enrollmentEnd};
}

export function academy(store:Store,clock:()=>number=Date.now,beforeSave?:(tx:Transaction,e:Enrollment,now:number)=>Promise<void>){
  async function access(tx:Transaction,uid:string,id:string,activityId:string) {
    validId(activityId);
    const key=enrollmentId(uid,validId(id));
    const e=await tx.get<Enrollment>('academyEnrollments',key);
    if(!e)return fail(404,'Enroll before opening this activity.');
    const now=clock();
    if(e.cancelledAt||['Expired','Cancelled'].includes(enrollmentStatus({},e,now)??''))fail(403,'Your enrollment no longer permits access.');
    const items=curriculumItems(e.curriculum) as {activity:Activity;moduleIndex:number;module:Module}[];
    const index=items.findIndex(item=>item.activity.id===activityId);
    if(index<0)return fail(404,'Activity not found.');
    const item=items[index];
    if(!activityComplete(e,item.activity,item.moduleIndex)&&items.slice(0,index).some(previous=>!activityComplete(e,previous.activity,previous.moduleIndex)))fail(403,'Complete the previous activity first.');
    e.activityProgress??={};
    return {key,e,now,...item};
  }
  function finish(e:Enrollment,activity:Activity,moduleIndex:number,now:number) {
    const progress=e.activityProgress![activity.id]??={};
    progress.completedAt??=new Date(now).toISOString();
    if(activitiesFor(e.curriculum[moduleIndex]).every((a:Activity)=>activityComplete(e,a,moduleIndex))&&!e.done.includes(moduleIndex))e.done.push(moduleIndex);
    if(e.done.length===e.curriculum.length&&!e.completedAt)e.completedAt=new Date(now).toISOString();
    e.status=enrollmentStatus({},e,now)??'Active';
  }
  async function save(tx:Transaction,key:string,e:Enrollment,now:number) {
    await beforeSave?.(tx,e,now);
    if(Buffer.byteLength(JSON.stringify(e))>900000)fail(400,'Saved notes are too large. Shorten your notes before saving.');
    tx.set('academyEnrollments',key,e);
    return publicEnrollment(e,now);
  }
  async function submitActivity(uid:string,id:string,activityId:string,input:unknown,legacy=false) {return store.transaction(async tx=>{
    const {key,e,now,activity:a,moduleIndex,module}=await access(tx,uid,id,activityId);
    if(legacy&&module.activities)fail(400,'Submit an individual activity.');
    const body=(input??{}) as Record<string,unknown>;
    if(a.type==='video')fail(400,'Watch the video to complete this activity.');
    let passed=true;
    if(a.questions.length){
      const responses=body.responses;
      if(!responses||typeof responses!=='object'||Array.isArray(responses))fail(400,'Quiz responses are required.');
      const answers=responses as Record<string,unknown>;
      if(Object.keys(answers).some(id=>!a.questions.some(q=>q.id===id)))fail(400,'Unknown question.');
      for(const q of a.questions){const answer=answers[q.id];if(q.type==='identification'){if(typeof answer!=='string'||!answer.trim()||answer.length>200)fail(400,'Answer every question.');}else if(!Array.isArray(answer)||!answer.length||answer.length>10||answer.some(v=>typeof v!=='string'||!q.options?.some(o=>o.id===v))||new Set(answer).size!==answer.length||(q.type==='choice'&&answer.length!==1))fail(400,'Select valid answers for every question.');}
      const result=gradeModule(a,answers);passed=result.passed;
      e.quizAttempts[a.id]={...result,submittedAt:new Date(now).toISOString(),attemptNumber:Number(e.quizAttempts[a.id]?.attemptNumber??0)+1};
    }else if(a.type==='reading'){
      if(body.acknowledged!==true)fail(400,'Confirm that you have read this activity.');
    }else{
      const notes=text(body.notes,'Practice response',module.activities?2000:20000);
      if(notes.length<10)fail(400,'Write at least 10 characters.');
      if(!module.activities)e.notes[moduleIndex]=notes;
      else (e.activityProgress![a.id]??={}).response=notes;
    }
    if(passed)finish(e,a,moduleIndex,now);
    return save(tx,key,e,now);
  });}
  return {
    submitActivity,
    async saveNote(uid:string,id:string,activityId:string,input:unknown){return store.transaction(async tx=>{
      const {key,e,now,activity}=await access(tx,uid,id,activityId);
      const note=(input as {note?:unknown})?.note;
      if(typeof note!=='string'||note.length>2000)fail(400,'Notes must be at most 2,000 characters.');
      (e.activityProgress![activity.id]??={}).note=note as string;
      return save(tx,key,e,now);
    });},
    async startVideo(uid:string,id:string,activityId:string,input:unknown){return store.transaction(async tx=>{
      const {key,e,now,activity}=await access(tx,uid,id,activityId);
      if(activity.type!=='video')fail(400,'This activity is not a video.');
      const duration=(input as {duration?:number})?.duration;
      if(typeof duration!=='number'||!Number.isFinite(duration)||duration<1||duration>21600)fail(400,'Use an available, recorded video between 1 second and 6 hours.');
      const watchKey=`${key}_${activityId}`;
      const previous=await tx.get<VideoWatch>('academyVideoWatches',watchKey);
      if(previous&&Math.abs(previous.duration-duration!)>2)fail(409,'The video duration changed. Ask your administrator to publish a new activity.');
      const token=randomUUID();
      tx.set('academyVideoWatches',watchKey,{token,sequence:0,updatedAt:now,duration:previous?.duration??duration,ranges:previous?.ranges??[],reachedEnd:previous?.reachedEnd??false});
      return {token,position:e.activityProgress?.[activityId]?.position??0};
    });},
    async videoProgress(uid:string,id:string,activityId:string,input:unknown){return store.transaction(async tx=>{
      const {key,e,now,activity,moduleIndex}=await access(tx,uid,id,activityId);
      if(activity.type!=='video')fail(400,'This activity is not a video.');
      const watchKey=`${key}_${activityId}`;
      const watch=await tx.get<VideoWatch>('academyVideoWatches',watchKey);
      const body=(input??{}) as {token?:string;sequence?:number;position?:number;ended?:boolean;ranges?:{start:number;end:number}[]};
      if(!watch||body.token!==watch.token)fail(409,'This video was opened elsewhere. Reload the lesson to continue saving progress.');
      const w=watch!;
      if(body.sequence===w.sequence && w.sequence>0)return publicEnrollment(e,now); // Retrying an acknowledged packet is safe.
      if(body.sequence!==w.sequence+1)fail(409,'Video progress is out of sequence. Reload the lesson.');
      if(typeof body.position!=='number'||!Number.isFinite(body.position)||body.position<0||body.position>w.duration+1||typeof body.ended!=='boolean')fail(400,'Invalid playback position.');
      if(!Array.isArray(body.ranges)||body.ranges.length>60||body.ranges.some(r=>!r||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end>w.duration+1||r.end<=r.start))fail(400,'Invalid played sections.');
      const ranges=body.ranges!;
      const elapsed=Math.min(30,Math.max(0,(now-w.updatedAt)/1000));
      // Playback reports are untrusted: bound new coverage to server elapsed time at <=2x.
      if(ranges.reduce((sum,r)=>sum+r.end-r.start,0)>elapsed*2+0.5)fail(400,'Playback advanced too quickly. Reload and replay the unsaved section.');
      const merged:{start:number;end:number}[]=[];
      for(const r of [...w.ranges,...ranges].sort((a,b)=>a.start-b.start)){
        const last=merged.at(-1);
        if(last&&r.start<=last.end+0.05)last.end=Math.max(last.end,Math.min(r.end,w.duration));
        else merged.push({start:r.start,end:Math.min(r.end,w.duration)});
      }
      if(merged.length>2000)fail(400,'Too many playback fragments. Replay the video continuously.');
      const percent=Math.min(100,merged.reduce((sum,r)=>sum+r.end-r.start,0)/w.duration*100);
      w.reachedEnd ||= body.ended===true&&body.position!>=w.duration-1&&merged.some(r=>r.end>=w.duration-1);
      const progress=e.activityProgress![activityId]??={};
      Object.assign(progress,{position:Math.min(body.position!,w.duration),duration:w.duration,percent:Math.floor(percent)});
      if(percent>=95&&w.reachedEnd)finish(e,activity,moduleIndex,now);
      const result=await save(tx,key,e,now);
      tx.set('academyVideoWatches',watchKey,{...w,ranges:merged,sequence:body.sequence,updatedAt:now});
      return result;
    });},
    async courses(admin=false){const items=await store.list<Course>('academyCourses');return items.filter(c=>!c.archived).map(c=>admin?c:publicCourse(c));},
    async saveCourse(input:unknown,id?:string){
      const courseId=id?validId(id):randomUUID();
      return store.transaction(async tx=>{
        const existing=await tx.get<Course>('academyCourses',courseId);
        if(id&&!existing)fail(404,'Course not found.');
        if(existing&&existing.revision!==(input as Course).revision){
          // A restart can lose the response after Firestore commits. Confirm an exact retry
          // without writing again; genuinely different or older edits still conflict.
          if(existing.revision===(input as Course).revision+1){
            const retried=validateCourse(input,courseId,existing.revision);
            if(isDeepStrictEqual(retried,existing))return existing;
          }
          fail(409,'This course changed in another session. Your draft is kept. Reload the course before applying different edits.');
        }
        const course=validateCourse(input,courseId,(existing?.revision??0)+1);
        tx.set('academyCourses',courseId,course);return course;
      });
    },
    async archiveCourse(id:string){return store.transaction(async tx=>{const c=await tx.get<Course>('academyCourses',validId(id));if(!c)return fail(404,'Course not found.');tx.set('academyCourses',id,{...c,active:false,archived:true,revision:c.revision+1});return {ok:true};});},
    async me(user:Identity,admin:boolean){
      const existing=await store.get<Record<string,unknown>>('academyLearners',user.uid);
      const name=existing?.profile?String(existing.name):user.name??user.email??'Learner';
      if(!existing||existing.name!==name||existing.email!==(user.email??''))await store.transaction(async tx=>{const current=await tx.get<Record<string,unknown>>('academyLearners',user.uid);tx.set('academyLearners',user.uid,{...current,uid:user.uid,email:user.email??'',name:current?.profile?current.name:name,createdAt:current?.createdAt??new Date(clock()).toISOString()});});
      return {uid:user.uid,email:user.email??'',name,profile:existing?.profile??null,role:admin?'admin':'learner'};
    },
    async saveProfile(user:Identity,admin:boolean,input:unknown){
      if(!input||typeof input!=='object'||Array.isArray(input))return fail(400,'Profile information is required.');
      const value=input as Record<string,unknown>;
      const profile:Record<string,unknown>={};
      for(const field of ['firstName','lastName','country','region'])profile[field]=text(value[field],field,field.includes('Name')?60:100);
      for(const [field,allowed] of Object.entries({language:['English (English)'],gender:['Prefer not to say','Woman','Man','Non-binary','Self-describe'],disability:['Prefer not to say','Yes','No']})){
        if(!allowed.includes(String(value[field])))return fail(400,`Select a valid ${field}.`);
        profile[field]=value[field];
      }
      for(const field of ['goals','experience']){
        const values=value[field];
        if(!Array.isArray(values)||values.length>10||values.some(item=>typeof item!=='string'||!item.trim()||item.length>100))return fail(400,`Select valid ${field}.`);
        profile[field]=[...new Set(values)];
      }
      const photo=value.photoURL??'';
      if(typeof photo!=='string'||photo.length>180000||(photo!==''&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)&&!/^https:\/\/[^\s]+$/.test(photo)))return fail(400,'Choose a valid profile photo.');
      profile.photoURL=photo;
      const name=`${profile.firstName} ${profile.lastName}`;
      await store.transaction(async tx=>{const current=await tx.get<Record<string,unknown>>('academyLearners',user.uid);tx.set('academyLearners',user.uid,{...current,uid:user.uid,email:user.email??'',name,profile,createdAt:current?.createdAt??new Date(clock()).toISOString(),updatedAt:new Date(clock()).toISOString()});});
      return {uid:user.uid,email:user.email??'',name,profile,role:admin?'admin':'learner'};
    },
    async enroll(user:Identity,id:string){return store.transaction(async tx=>{
      const key=enrollmentId(user.uid,validId(id));
      const course=await tx.get<Course>('academyCourses',id);
      const previous=await tx.get<Enrollment>('academyEnrollments',key);
      if(previous)return publicEnrollment(previous,clock());
      if(!course||course.archived)return fail(404,'Course not found.');
      const now=clock();
      if(courseStatus(course,now)!=='Enrollment Open')fail(409,'This course is not open for enrollment.');
      const e:Enrollment={...normalizeEnrollment(course,{enrolledAt:new Date(now).toISOString(),done:[],notes:{}}),uid:user.uid,courseId:id,courseTitle:course.title,quizAttempts:{}};
      const learner=await tx.get<Record<string,unknown>>('academyLearners',user.uid);
      tx.set('academyLearners',user.uid,{...learner,uid:user.uid,name:learner?.profile?learner.name:user.name||learner?.name||'Learner',email:user.email||learner?.email||'',createdAt:learner?.createdAt??new Date(now).toISOString()});
      tx.set('academyEnrollments',key,e);return publicEnrollment(e,now);
    });},
    async enrollments(uid?:string){return (await store.list<Enrollment>('academyEnrollments',uid?{field:'uid',value:uid}:undefined)).map(e=>publicEnrollment(e,clock()));},
    async learners(){return store.list('academyLearners');},
    async cancel(uid:string,id:string){return store.transaction(async tx=>{const key=enrollmentId(uid,validId(id));const e=await tx.get<Enrollment>('academyEnrollments',key);if(!e)return fail(404,'Enrollment not found.');tx.set('academyEnrollments',key,{...e,status:'Cancelled',cancelledAt:new Date(clock()).toISOString()});return {ok:true};});},
    async submit(uid:string,id:string,moduleId:string,input:unknown){return submitActivity(uid,id,moduleId,input,true);},
  };
}
