import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirebaseApp } from '../src/firebase-app.js';
import { createApi } from '../../web/src/api-client.js';
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

test('profile changes persist across reads and enrollment without trusting identity fields from the browser',async t=>{
  const {app,request}=setup();t.after(()=>app.close());
  const profile={firstName:'John Lorenzo',lastName:'Flores',language:'English (English)',country:'Philippines',region:'Bohol',goals:['Learn new skills'],experience:['Technology'],gender:'Prefer not to say',disability:'Prefer not to say',photoURL:'',uid:'other',role:'admin',email:'changed@example.com'};
  assert.equal((await request('PUT','/api/me/profile',undefined,profile)).statusCode,401);
  assert.equal((await request('PUT','/api/me/profile','student',{...profile,firstName:''})).statusCode,400);
  assert.equal((await request('PUT','/api/me/profile','student',{...profile,photoURL:'javascript:alert(1)'})).statusCode,400);
  const saved=await request('PUT','/api/me/profile','student',profile);
  assert.equal(saved.statusCode,200);
  assert.equal(saved.json().account.name,'John Lorenzo Flores');
  assert.equal(saved.json().account.uid,'student');
  assert.equal(saved.json().account.role,'learner');
  assert.equal(saved.json().account.email,'student@example.com');
  assert.equal(saved.json().account.profile.uid,undefined);
  const created=await request('POST','/api/admin/courses','admin',course);
  await request('POST',`/api/courses/${created.json().course.id}/enroll`,'student');
  const reload=(await request('GET','/api/me','student')).json().account;
  assert.equal(reload.name,'John Lorenzo Flores');
  assert.equal(reload.profile.region,'Bohol');
  assert.deepEqual(reload.profile.goals,['Learn new skills']);
  assert.equal((await request('GET','/api/me','other')).json().account.profile,null);
});

test('browser client can enroll without a JSON body and still sends JSON for course edits',async t=>{
  const {app}=setup();t.after(()=>app.close());
  let token='admin';
  const api=createApi({currentUser:{getIdToken:async()=>token}},async(url:string,options:RequestInit)=>{
    const response=await app.inject({method:options.method as 'POST',url,headers:options.headers as Record<string,string>,...(options.body===undefined?{}:{payload:options.body as string})});
    return {ok:response.statusCode<400,json:async()=>response.json()};
  });
  const created=await api('/admin/courses',{method:'POST',body:course});
  token='student';
  const result=await api(`/courses/${created.course.id}/enroll`,{method:'POST'});
  assert.equal(result.enrollment.courseId,created.course.id);
  assert.equal(result.enrollment.status,'Active');
  const again=await api(`/courses/${created.course.id}/enroll`,{method:'POST'});
  assert.equal(again.enrollment.enrolledAt,result.enrollment.enrolledAt);
  assert.equal((await api('/enrollments')).enrollments.length,1);
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
  assert.equal((await request('PUT',`/api/admin/courses/${original.id}`,'admin',edited)).statusCode,200);
  assert.equal((await request('PUT',`/api/admin/courses/${original.id}`,'admin',{...edited,title:'A conflicting change'})).statusCode,409);
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

const activity=(id:string,type:string,extra:Record<string,unknown>={})=>({id,title:`Activity ${id}`,type,content:`Private ${id} lesson`,exercise:'',passPercent:100,questions:[],videoId:'',estimatedMinutes:2,transcript:`Transcript ${id}`,resources:[{title:'Resource',url:'https://example.com/lesson'}],...extra});
function guidedCourse(){return {...course,modules:[{id:'guided',title:'Getting started',content:'',passPercent:100,questions:[],activities:[
  activity('video1','video',{videoId:'https://youtu.be/M7lc1UVf-VE'}),activity('read1','reading'),activity('quiz1','quiz',{questions:course.modules[0].questions}),
]},{id:'practice-module',title:'Apply it',content:'',passPercent:100,questions:[],activities:[activity('practice1','practice')]}]};}

test('guided content is gated on the server, including legacy endpoints and next modules',async t=>{
  const {app,request,setTime}=setup();t.after(()=>app.close());
  const created=await request('POST','/api/admin/courses','admin',guidedCourse());assert.equal(created.statusCode,201,created.body);
  const id=created.json().course.id,base=`/api/enrollments/${id}/activities`;
  const enrolled=(await request('POST',`/api/courses/${id}/enroll`,'student')).json().enrollment;
  assert.equal(enrolled.curriculum[0].activities[0].videoId,'M7lc1UVf-VE');
  const hidden=enrolled.curriculum[0].activities[1];assert.equal(hidden.locked,true);assert.equal(hidden.content,'');assert.equal(hidden.transcript,'');assert.deepEqual(hidden.resources,[]);
  assert.equal(JSON.stringify(enrolled).includes('secret answer'),false);
  assert.equal((await request('POST',`${base}/read1/submit`,'student',{acknowledged:true})).statusCode,403);
  assert.equal((await request('POST',`${base}/video1/submit`,'student',{completed:true})).statusCode,400);
  assert.equal((await request('POST',`/api/enrollments/${id}/modules/guided/submit`,'student',{notes:'I finished this'})).statusCode,404);
  assert.equal((await request('PUT',`${base}/read1/note`,'student',{note:'Bypass'})).statusCode,403);
  assert.equal((await request('POST',`${base}/video1/video-session`,'other',{duration:10})).statusCode,404);
  const {token}=(await request('POST',`${base}/video1/video-session`,'student',{duration:10})).json();
  setTime(Date.parse('2026-10-01T00:00:10Z'));
  const watched=await request('POST',`${base}/video1/video-progress`,'student',{token,sequence:1,position:10,ended:true,ranges:[{start:0,end:10}]});assert.equal(watched.statusCode,200,watched.body);
  assert.equal(watched.json().enrollment.curriculum[0].activities[1].locked,false);
  assert.deepEqual(watched.json().enrollment.done,[]);
  assert.equal((await request('POST',`${base}/read1/submit`,'student',{})).statusCode,400);
  await request('POST',`${base}/read1/submit`,'student',{acknowledged:true});
  const failQuiz=await request('POST',`${base}/quiz1/submit`,'student',{responses:{q1:'wrong'}});assert.deepEqual(failQuiz.json().enrollment.done,[]);
  assert.equal((await request('POST',`${base}/practice1/submit`,'student',{notes:'I did practice.'})).statusCode,403);
  const passed=await request('POST',`${base}/quiz1/submit`,'student',{responses:{q1:'secret answer'}});assert.deepEqual(passed.json().enrollment.done,[0]);assert.equal(passed.body.includes('secret answer'),false);
  const completed=await request('POST',`${base}/practice1/submit`,'student',{notes:'My practice solution.'});assert.equal(completed.json().enrollment.status,'Completed');
  const note=await request('PUT',`${base}/video1/note`,'student',{note:'A useful explanation.'});assert.equal(note.json().enrollment.activityProgress.video1.note,'A useful explanation.');
  const retry=await request('POST',`${base}/quiz1/submit`,'student',{responses:{q1:'wrong'}});assert.equal(retry.json().enrollment.status,'Completed');
});

test('video tracking rejects fast-forward credit, merges repeats, resumes and handles duplicate packets',async t=>{
  const {app,request,setTime}=setup();t.after(()=>app.close());
  const id=(await request('POST','/api/admin/courses','admin',guidedCourse())).json().course.id;
  await request('POST',`/api/courses/${id}/enroll`,'student');
  const url=`/api/enrollments/${id}/activities/video1`;
  const {token}=(await request('POST',`${url}/video-session`,'student',{duration:100})).json();
  const packet={token,sequence:1,position:100,ended:true,ranges:[{start:0,end:100}]};
  assert.equal((await request('POST',`${url}/video-progress`,'student',packet)).statusCode,400);
  setTime(Date.parse('2026-10-01T00:00:05Z'));
  const skipped={...packet,ranges:[{start:95,end:100}]};
  let result=await request('POST',`${url}/video-progress`,'student',skipped);
  assert.equal(result.json().enrollment.activityProgress.video1.percent,5);assert.equal(result.json().enrollment.activityProgress.video1.completedAt,undefined);
  assert.equal((await request('POST',`${url}/video-progress`,'student',skipped)).statusCode,200);
  setTime(Date.parse('2026-10-01T00:00:10Z'));
  result=await request('POST',`${url}/video-progress`,'student',{...skipped,sequence:2});assert.equal(result.json().enrollment.activityProgress.video1.percent,5);
  const resume=(await request('POST',`${url}/video-session`,'student',{duration:100})).json();assert.equal(resume.position,100);
  assert.equal((await request('POST',`${url}/video-progress`,'student',{...skipped,sequence:3})).statusCode,409);
  setTime(Date.parse('2026-10-01T00:00:35Z'));
  await request('POST',`${url}/video-progress`,'student',{token:resume.token,sequence:1,position:50,ended:false,ranges:[{start:0,end:50}]});
  setTime(Date.parse('2026-10-01T00:01:00Z'));
  result=await request('POST',`${url}/video-progress`,'student',{token:resume.token,sequence:2,position:95,ended:false,ranges:[{start:50,end:95}]});
  assert.equal(result.json().enrollment.activityProgress.video1.percent,100);assert.ok(result.json().enrollment.activityProgress.video1.completedAt);
  await request('POST',`/api/admin/enrollments/student/${id}/cancel`,'admin');
  assert.equal((await request('POST',`${url}/video-session`,'student',{duration:100})).statusCode,403);
  const cancelled=(await request('GET','/api/enrollments','student')).json().enrollments[0];assert.equal(cancelled.curriculum[0].activities[0].videoId,'');
});

test('guided authoring rejects unsupported video links, duplicate IDs and unsafe resources',async t=>{
  const {app,request}=setup();t.after(()=>app.close());
  for(const change of [
    (c:any)=>c.modules[0].activities[0].videoId='https://evil.example/embed/M7lc1UVf-VE',
    (c:any)=>c.modules[0].activities[1].id='video1',
    (c:any)=>c.modules[0].activities[1].id='__proto__',
    (c:any)=>c.modules[0].activities[0].resources=[{title:'Bad',url:'javascript:alert(1)'}],
    (c:any)=>c.modules[0].activities[2].questions=[],
  ]){const c=guidedCourse();change(c);assert.equal((await request('POST','/api/admin/courses','admin',c)).statusCode,400);}
});

test('existing completed modules retain credit while unfinished legacy modules gain server ordering',async t=>{
  const {app,request,store}=setup();t.after(()=>app.close());
  const c={...course,modules:[course.modules[0],{...course.modules[0],id:'m2',title:'Second'}]};
  const id=(await request('POST','/api/admin/courses','admin',c)).json().course.id;
  await request('POST',`/api/courses/${id}/enroll`,'student');
  assert.equal((await request('POST',`/api/enrollments/${id}/modules/m2/submit`,'student',{responses:{q1:'secret answer'}})).statusCode,403);
  const [key,value]=[...store.data.entries()].find(([key])=>key.startsWith('academyEnrollments/'))!;
  (value as any).done=[1];store.data.set(key,value); // A pre-upgrade learner completed module 2 out of order.
  const legacy=(await request('GET','/api/enrollments','student')).json().enrollments[0];assert.equal(legacy.curriculum[1].locked,false);assert.deepEqual(legacy.done,[1]);
  const complete=await request('POST',`/api/enrollments/${id}/modules/m1/submit`,'student',{responses:{q1:'secret answer'}});assert.equal(complete.json().enrollment.status,'Completed');
});

test('a lost course-save response is safely confirmed without a second revision or overwritten edits',async t=>{
  const {app,request,store}=setup();t.after(()=>app.close());
  const original=(await request('POST','/api/admin/courses','admin',course)).json().course;
  const edit={...original,title:'Saved despite lost response'};let attempts=0;
  const api=createApi({currentUser:{getIdToken:async()=> 'admin'}},async(url:string,options:RequestInit)=>{
    attempts++;
    const response=await app.inject({method:options.method as 'PUT',url,headers:options.headers as Record<string,string>,payload:options.body as string});
    if(attempts===1){
      assert.equal(response.statusCode,200);
      // Firestore map key ordering need not match the original JavaScript object.
      const key=`academyCourses/${original.id}`,saved=store.data.get(key) as object;
      store.data.set(key,Object.fromEntries(Object.entries(saved).reverse()));
      throw new TypeError('Connection reset after commit');
    }
    return {ok:response.statusCode<400,status:response.statusCode,json:async()=>response.json()};
  },{wait:async()=>{}});
  const result=await api(`/admin/courses/${original.id}`,{method:'PUT',body:edit});
  assert.equal(attempts,2);assert.equal(result.course.revision,original.revision+1);
  const conflicting={...edit,title:'Different stale edit'};
  assert.equal((await request('PUT',`/api/admin/courses/${original.id}`,'admin',conflicting)).statusCode,409);
  await request('PUT',`/api/admin/courses/${original.id}`,'admin',{...result.course,description:'A newer edit'});
  assert.equal((await request('PUT',`/api/admin/courses/${original.id}`,'admin',edit)).statusCode,409);
});
