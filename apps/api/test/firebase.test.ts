import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirebaseApp } from '../src/firebase-app.js';
import type { Store, Transaction } from '../src/academy.js';

class MemoryStore implements Store {
  data=new Map<string,unknown>();
  async get<T>(c:string,id:string){return structuredClone(this.data.get(`${c}/${id}`)??null) as T|null;}
  async list<T>(c:string,filter?:{field:string;value:string}){return structuredClone([...this.data.entries()].filter(([key,value])=>key.startsWith(`${c}/`)&&(!filter||(value as Record<string,unknown>)[filter.field]===filter.value)).map(([,value])=>value)) as T[];}
  async transaction<T>(work:(tx:Transaction)=>Promise<T>){const pending=new Map<string,unknown>();const result=await work({get:this.get.bind(this),set:(c,id,value)=>pending.set(`${c}/${id}`,structuredClone(value))});for(const [key,value] of pending)this.data.set(key,value);return result;}
}
const course={title:'Test course',category:'Programming',description:'Learn the basics.',level:'Beginner',durationValue:1,durationUnit:'days',active:true,enrollmentStart:null,enrollmentEnd:null,modules:[{id:'m1',title:'Quiz',content:'Private lesson content',exercise:'',passPercent:100,questions:[{id:'q1',type:'identification',prompt:'Name the language',points:2,answers:['secret answer'],options:[],correct:[]}]}]};
function setup(){
  const store=new MemoryStore();let now=Date.parse('2026-10-01T00:00:00Z');
  const app=buildFirebaseApp({store,clock:()=>now,adminUid:'admin',verify:async token=>{if(!['admin','student','other'].includes(token))throw new Error('Invalid token');return {uid:token,email:`${token}@example.com`};}});
  const request=(method:string,url:string,token?:string,payload?:unknown)=>app.inject({method:method as 'GET',url,headers:token?{authorization:`Bearer ${token}`}:{},...(payload===undefined?{}:{payload:payload as object})});
  return {app,store,request,setTime:(value:number)=>now=value};
}

test('Firebase API rejects anonymous, forged and non-admin mutations',async t=>{
  const {app,request}=setup();t.after(()=>app.close());
  assert.equal((await request('POST','/api/admin/courses',undefined,course)).statusCode,401);
  assert.equal((await request('POST','/api/admin/courses','forged',course)).statusCode,401);
  assert.equal((await request('POST','/api/admin/courses','student',course)).statusCode,403);
  assert.equal((await request('GET','/api/me','student')).json().account.role,'learner');
  assert.equal((await request('GET','/api/me','admin')).json().account.role,'admin');
});
test('catalog and enrollment never expose answer keys; grading ignores client scores and ownership',async t=>{
  const {app,request}=setup();t.after(()=>app.close());
  const created=await request('POST','/api/admin/courses','admin',course);assert.equal(created.statusCode,201);
  const id=created.json().course.id;
  const catalog=await request('GET','/api/courses');assert.equal(catalog.body.includes('secret answer'),false);assert.equal(catalog.body.includes('Private lesson content'),false);
  const enrolled=await request('POST',`/api/courses/${id}/enroll`,'student');assert.equal(enrolled.statusCode,200);assert.equal(enrolled.body.includes('secret answer'),false);
  assert.equal((await request('GET','/api/enrollments','other')).json().enrollments.length,0);
  assert.equal((await request('POST',`/api/enrollments/${id}/modules/m1/submit`,'other',{responses:{q1:'secret answer'}})).statusCode,404);
  const failed=await request('POST',`/api/enrollments/${id}/modules/m1/submit`,'student',{responses:{q1:'wrong'},passed:true,earned:2,uid:'admin'});
  assert.equal(failed.json().enrollment.quizAttempts.m1.earned,0);assert.deepEqual(failed.json().enrollment.done,[]);
  const passed=await request('POST',`/api/enrollments/${id}/modules/m1/submit`,'student',{responses:{q1:'SECRET ANSWER'}});
  assert.equal(passed.json().enrollment.status,'Completed');assert.equal(passed.json().enrollment.quizAttempts.m1.attemptNumber,2);
  assert.equal(passed.body.includes('secret answer'),false);
  await request('POST',`/api/admin/enrollments/student/${id}/cancel`,'admin');
  assert.equal((await request('GET','/api/enrollments','student')).json().enrollments[0].status,'Cancelled');
  assert.equal((await request('POST',`/api/enrollments/${id}/modules/m1/submit`,'student',{responses:{q1:'secret answer'}})).statusCode,403);
});
test('server deadlines block submission and hide lesson content after expiry',async t=>{
  const {app,request,setTime}=setup();t.after(()=>app.close());
  const id=(await request('POST','/api/admin/courses','admin',course)).json().course.id;
  await request('POST',`/api/courses/${id}/enroll`,'student');
  setTime(Date.parse('2026-10-02T00:00:00Z'));
  assert.equal((await request('POST',`/api/enrollments/${id}/modules/m1/submit`,'student',{responses:{q1:'secret answer'}})).statusCode,403);
  const list=await request('GET','/api/enrollments','student');assert.equal(list.json().enrollments[0].status,'Expired');assert.equal(list.body.includes('Private lesson content'),false);
});
test('enrolled curriculum survives edits and archive; stale admin writes are rejected',async t=>{
  const {app,request}=setup();t.after(()=>app.close());
  const original=(await request('POST','/api/admin/courses','admin',course)).json().course;
  await request('POST',`/api/courses/${original.id}/enroll`,'student');
  const edited={...original,modules:[{...original.modules[0],title:'Revised lesson'}]};
  assert.equal((await request('PUT',`/api/admin/courses/${original.id}`,'admin',edited)).statusCode,200);
  assert.equal((await request('PUT',`/api/admin/courses/${original.id}`,'admin',edited)).statusCode,409);
  assert.equal((await request('GET','/api/enrollments','student')).json().enrollments[0].curriculum[0].title,'Quiz');
  await request('DELETE',`/api/admin/courses/${original.id}`,'admin');
  assert.equal((await request('GET','/api/courses')).json().courses.length,0);
  assert.equal((await request('POST',`/api/courses/${original.id}/enroll`,'other')).statusCode,404);
  assert.equal((await request('GET','/api/enrollments','student')).json().enrollments.length,1);
});
test('invalid answer keys and malformed submissions are rejected without writing progress',async t=>{
  const {app,request}=setup();t.after(()=>app.close());
  const invalid=structuredClone(course);invalid.modules[0].questions[0].answers=[];
  assert.equal((await request('POST','/api/admin/courses','admin',invalid)).statusCode,400);
  const id=(await request('POST','/api/admin/courses','admin',course)).json().course.id;
  await request('POST',`/api/courses/${id}/enroll`,'student');
  assert.equal((await request('POST',`/api/enrollments/${id}/modules/m1/submit`,'student',{responses:{}})).statusCode,400);
  assert.equal((await request('GET','/api/enrollments','student')).json().enrollments[0].quizAttempts.m1,undefined);
});
