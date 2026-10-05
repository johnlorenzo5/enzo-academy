import { randomUUID } from 'node:crypto';
import { courseStatus, durationLabel, normalizeEnrollment, enrollmentStatus, validateModules, gradeModule } from '@enzo/domain';

export type Question = { id: string; type: string; prompt: string; points: number; options?: {id:string;text:string}[]; correct?: string[]; answers?: string[] };
export type Module = { id:string; title:string; content:string; exercise?:string; passPercent:number; questions:Question[] };
export type Course = { id:string; title:string; description:string; category:string; level:string; color:string; symbol:string; project:string; topics:string[]; modules:Module[]; durationValue:number; durationUnit:string; active:boolean; enrollmentStart:string|null; enrollmentEnd:string|null; revision:number; archived?:boolean };
export type Enrollment = { uid:string; courseId:string; courseTitle:string; enrolledAt:string; expiresAt:string; done:number[]; notes:Record<string,string>; curriculum:Module[]; status:string; completedAt?:string; quizAttempts:Record<string,Record<string,unknown>>; cancelledAt?:string };
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
export function validId(value:string){if(!idPattern.test(value))fail(400,'Invalid identifier.');return value;}
const enrollmentId=(uid:string,courseId:string)=>Buffer.from(JSON.stringify([uid,courseId])).toString('base64url');
export function publicModules(modules:Module[]) {
  return modules.map(m=>({id:m.id,title:m.title,content:m.content,exercise:m.exercise??'',passPercent:m.passPercent,questions:m.questions.map(q=>({id:q.id,type:q.type,prompt:q.prompt,points:q.points,options:q.options??[]}))}));
}
export function publicCourse(c:Course){
  return {id:c.id,title:c.title,description:c.description,category:c.category,level:c.level,color:c.color,symbol:c.symbol,project:c.project,topics:c.topics,durationValue:c.durationValue,durationUnit:c.durationUnit,active:c.active,enrollmentStart:c.enrollmentStart,enrollmentEnd:c.enrollmentEnd,status:courseStatus(c),duration:durationLabel(c)};
}
export function publicEnrollment(e:Enrollment,now=Date.now()) {
  const status=e.cancelledAt?'Cancelled':enrollmentStatus({},e,now);
  const modules=publicModules(e.curriculum);
  const curriculum=['Expired','Cancelled'].includes(status??'')?modules.map(m=>({...m,content:'',exercise:'',questions:[]})):modules;
  return {...e,curriculum,status};
}
function text(value:unknown,label:string,max:number){if(typeof value!=='string'||!value.trim()||value.length>max)fail(400,`${label} must contain 1–${max} characters.`);return (value as string).trim();}
export function validateCourse(input:unknown,id:string,revision:number):Course {
  if(!input||typeof input!=='object'||Array.isArray(input))return fail(400,'Course is required.');
  const value=input as Record<string,unknown>;
  try { validateModules(value.modules); } catch(error) { return fail(400,(error as Error).message); }
  const modules=(value.modules as Module[]).map(m=>{
    validId(m.id);
    const questions=m.questions.map(q=>{
      validId(q.id);
      return {id:q.id,type:q.type,prompt:q.prompt.trim(),points:q.points,options:q.type==='identification'?[]:q.options!.map(o=>({id:validId(o.id),text:o.text.trim()})),correct:q.type==='identification'?[]:q.correct!,answers:q.type==='identification'?q.answers!:[]};
    });
    if(m.exercise && (typeof m.exercise!=='string'||m.exercise.length>5000))fail(400,'Practice instructions are too long.');
    return {id:m.id,title:m.title.trim(),content:m.content.trim(),exercise:m.exercise??'',passPercent:m.passPercent,questions};
  });
  if(!['Beginner','Intermediate','Advanced'].includes(String(value.level)))fail(400,'Select a course level.');
  if(!Number.isInteger(value.durationValue)||Number(value.durationValue)<1||Number(value.durationValue)>10000||!['days','weeks','months'].includes(String(value.durationUnit)))fail(400,'Invalid course duration.');
  const date=(v:unknown)=>{if(v===null||v==='')return null;if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))return fail(400,'Invalid enrollment date.');return new Date(v).toISOString();};
  const enrollmentStart=date(value.enrollmentStart??null),enrollmentEnd=date(value.enrollmentEnd??null);
  if(enrollmentStart&&enrollmentEnd&&enrollmentStart>=enrollmentEnd)fail(400,'Enrollment end must follow its start.');
  if(typeof value.active!=='boolean')fail(400,'Course availability is required.');
  return {id,revision,title:text(value.title,'Title',100),description:text(value.description,'Description',400),category:text(value.category,'Category',60),level:String(value.level),color:['yellow','purple','blue','green','pink','orange'].includes(String(value.color))?String(value.color):'green',symbol:typeof value.symbol==='string'?value.symbol.slice(0,8):'<>',project:typeof value.project==='string'?value.project.slice(0,200):'Complete all modules',topics:modules.map(m=>m.title),modules,durationValue:Number(value.durationValue),durationUnit:String(value.durationUnit),active:value.active as boolean,enrollmentStart,enrollmentEnd};
}

export function academy(store:Store,clock:()=>number=Date.now){
  return {
    async courses(admin=false){const items=await store.list<Course>('academyCourses');return items.filter(c=>!c.archived).map(c=>admin?c:publicCourse(c));},
    async saveCourse(input:unknown,id?:string){
      const courseId=id?validId(id):randomUUID();
      return store.transaction(async tx=>{
        const existing=await tx.get<Course>('academyCourses',courseId);
        if(id&&!existing)fail(404,'Course not found.');
        if(existing&&existing.revision!==(input as Course).revision)fail(409,'This course changed in another session. Reload before saving.');
        const course=validateCourse(input,courseId,(existing?.revision??0)+1);
        tx.set('academyCourses',courseId,course);return course;
      });
    },
    async archiveCourse(id:string){return store.transaction(async tx=>{const c=await tx.get<Course>('academyCourses',validId(id));if(!c)return fail(404,'Course not found.');tx.set('academyCourses',id,{...c,active:false,archived:true,revision:c.revision+1});return {ok:true};});},
    async me(user:Identity,admin:boolean){
      const existing=await store.get<Record<string,unknown>>('academyLearners',user.uid);
      const name=user.name??user.email??'Learner';
      if(!existing||existing.name!==name||existing.email!==(user.email??''))await store.transaction(async tx=>{const current=await tx.get<Record<string,unknown>>('academyLearners',user.uid);tx.set('academyLearners',user.uid,{uid:user.uid,email:user.email??'',name,createdAt:current?.createdAt??new Date(clock()).toISOString()});});
      return {uid:user.uid,email:user.email??'',name:user.name??user.email??'Learner',role:admin?'admin':'learner'};
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
      tx.set('academyEnrollments',key,e);return publicEnrollment(e,now);
    });},
    async enrollments(uid?:string){return (await store.list<Enrollment>('academyEnrollments',uid?{field:'uid',value:uid}:undefined)).map(e=>publicEnrollment(e,clock()));},
    async learners(){return store.list('academyLearners');},
    async cancel(uid:string,id:string){return store.transaction(async tx=>{const key=enrollmentId(uid,validId(id));const e=await tx.get<Enrollment>('academyEnrollments',key);if(!e)return fail(404,'Enrollment not found.');tx.set('academyEnrollments',key,{...e,status:'Cancelled',cancelledAt:new Date(clock()).toISOString()});return {ok:true};});},
    async submit(uid:string,id:string,moduleId:string,input:unknown){return store.transaction(async tx=>{
      const key=enrollmentId(uid,validId(id));
      const e=await tx.get<Enrollment>('academyEnrollments',key);
      if(!e)return fail(404,'Enroll before submitting.');
      const now=clock();
      if(e.cancelledAt||['Expired','Cancelled'].includes(enrollmentStatus({},e,now)??''))fail(403,'Your enrollment no longer permits submissions.');
      const index=e.curriculum.findIndex(m=>m.id===moduleId);
      if(index<0)return fail(404,'Module not found.');
      const module=e.curriculum[index];
      const body=(input??{}) as Record<string,unknown>;
      let passed=true;
      if(module.questions.length){
        const responses=body.responses;
        if(!responses||typeof responses!=='object'||Array.isArray(responses))fail(400,'Quiz responses are required.');
        const answers=responses as Record<string,unknown>;
        if(Object.keys(answers).some(id=>!module.questions.some(q=>q.id===id)))fail(400,'Unknown question.');
        for(const q of module.questions){const a=answers[q.id];if(q.type==='identification'){if(typeof a!=='string'||!a.trim()||a.length>200)fail(400,'Answer every question.');}else if(!Array.isArray(a)||!a.length||a.length>10||a.some(v=>typeof v!=='string'||!q.options?.some(o=>o.id===v))||new Set(a).size!==a.length||(q.type==='choice'&&a.length!==1))fail(400,'Select valid answers for every question.');}
        const result=gradeModule(module,answers);passed=result.passed;
        e.quizAttempts[module.id]={...result,submittedAt:new Date(now).toISOString(),attemptNumber:Number(e.quizAttempts[module.id]?.attemptNumber??0)+1};
      }else{e.notes[index]=text(body.notes,'Practice notes',20000);if(e.notes[index].length<10)fail(400,'Write at least 10 characters.');}
      if(passed&&!e.done.includes(index))e.done.push(index);
      if(e.done.length===e.curriculum.length&&!e.completedAt)e.completedAt=new Date(now).toISOString();
      e.status=enrollmentStatus({},e,now)??'Active';
      tx.set('academyEnrollments',key,e);return publicEnrollment(e,now);
    });},
  };
}
