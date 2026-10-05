import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate} from 'node:timers/promises';
import {Window} from 'happy-dom';
import {escapeHtml,mountCourseBuilder} from '../src/course-builder.js';
import {lessonMarkup,collectResponses} from '../src/lesson-player.js';
import {durationLabel,courseStatus} from '@enzo/domain';

const course={id:'c1',title:'Cloud course',category:'Programming',description:'Description',level:'Beginner',durationValue:4,durationUnit:'weeks',active:true,enrollmentStart:null,enrollmentEnd:null,revision:3,modules:[{id:'m1',title:'Lesson',content:'Read me',exercise:'',passPercent:100,questions:[{id:'q1',type:'identification',prompt:'Name it',points:1,options:[],answers:[],correct:[]}]}],topics:['Lesson']};
async function boot({role='learner',fail=false}={}){
  const window=new Window({url:'http://localhost:5173/#learning'});
  window.document.write(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  const calls=[];
  const enrollment={courseId:'c1',courseTitle:course.title,uid:'u1',done:[],notes:{},curriculum:course.modules,status:'Active',expiresAt:'2099-01-01',quizAttempts:{}};
  const api=async(path,options)=>{
    calls.push({path,options});if(fail)throw new Error('Firebase server credentials are not ready.');
    if(path==='/me')return {account:{uid:'u1',name:'Learner',email:'learner@example.com',role}};
    if(path.endsWith('/courses'))return {courses:[course]};
    if(path.endsWith('/enrollments'))return {enrollments:[enrollment]};
    if(path.endsWith('/learners'))return {learners:[]};
    if(path.endsWith('/submit'))return {enrollment:{...enrollment,done:[0],status:'Completed',quizAttempts:{m1:{earned:1,possible:1,percent:100,passed:true,results:[{questionId:'q1',correct:true}]}}}};
    return {};
  };
  let callback;
  window.__dependencies={esc:escapeHtml,mountCourseBuilder,lessonMarkup,collectResponses,durationLabel,courseStatus,api,auth:{currentUser:{uid:'u1',email:'learner@example.com'}},onAuthStateChanged:(_,fn)=>callback=fn,signInWithEmailAndPassword:async()=>{},createUserWithEmailAndPassword:async()=>{},updateProfile:async()=>{},signOut:async()=>{},sendPasswordResetEmail:async()=>{}};
  const source=(await readFile(new URL('../src/cloud.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
  window.eval(`const {${Object.keys(window.__dependencies).join(',')}}=window.__dependencies;\n${source}`);
  callback();await setImmediate();
  return {window,calls};
}
test('cloud learner sends responses to the API and displays the returned grade',async t=>{
  const {window,calls}=await boot();t.after(()=>window.happyDOM.close());
  window.document.querySelector('[data-learn]').click();
  window.document.querySelector('[name=q1]').value='my answer';
  window.document.querySelector('#quiz-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  const submit=calls.find(c=>c.path.endsWith('/submit'));
  assert.equal(submit.options.body.responses.q1,'my answer');assert.equal(submit.options.body.earned,undefined);
  assert.match(window.document.querySelector('.quiz-result').textContent,/Passed: 1\/1/);
});
test('cloud admin saves module edits with the revision and waits for API success',async t=>{
  const {window,calls}=await boot({role:'admin'});t.after(()=>window.happyDOM.close());
  window.document.querySelector('[data-studio]').click();
  const input=window.document.querySelector('[data-module-field=title]');input.value='Edited';input.dispatchEvent(new window.Event('input',{bubbles:true}));
  // The fixture is a public learner question; replace it with an authored answer key for this admin test.
  const remove=window.document.querySelector('[data-action=remove-question]');remove.click();
  window.document.querySelector('#module-builder').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  const save=calls.find(c=>c.options?.method==='PUT');assert.equal(save.options.body.revision,3);assert.equal(save.options.body.modules[0].title,'Edited');
});
test('cloud setup errors are visible and account access stays available',async t=>{
  const {window}=await boot({fail:true});t.after(()=>window.happyDOM.close());
  assert.match(window.document.querySelector('#main').textContent,/Firebase server credentials are not ready/);
  window.document.querySelector('#profile').click();assert.ok(window.document.querySelector('#logout'));
});
