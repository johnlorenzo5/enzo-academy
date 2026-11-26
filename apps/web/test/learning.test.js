import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { mountLearningWorkspace } from '../src/learning-workspace.js';
import { mountCourseBuilder } from '../src/course-builder.js';
import { playedSegment, mountYouTube } from '../src/youtube-player.js';

const makeActivity=(id,type,extra={})=>({id,type,title:`Lesson ${id}`,content:'A useful lesson.',exercise:'',questions:[],passPercent:100,estimatedMinutes:2,transcript:'Read the transcript.',resources:[],videoId:'M7lc1UVf-VE',...extra});
const makeEnrollment=()=>({courseId:'course',courseTitle:'Introduction to computing',status:'Active',done:[],notes:{},quizAttempts:{},activityProgress:{},curriculum:[{id:'m1',title:'Getting started',activities:[makeActivity('a1','reading'),makeActivity('a2','video',{locked:true})]}]});

test('learning workspace unlocks only after an acknowledged reading save and exposes useful panels',async t=>{
  const window=new Window();t.after(()=>window.happyDOM.close());
  const e=makeEnrollment(),root=window.document.body;let fail=true,navigated;
  const dispose=mountLearningWorkspace(root,{enrollment:e,onUpdate:()=>{},onNavigate:id=>navigated=id,api:async(path,{body})=>{
    if(fail)throw new Error('Offline');
    const next=structuredClone(e);next.activityProgress.a1={completedAt:'2026-10-15',note:body.note??''};next.curriculum[0].activities[1].locked=false;return {enrollment:next};
  }});t.after(dispose);
  assert.equal(root.querySelector('#next-activity').disabled,true);
  assert.equal(root.querySelector('[data-lesson=a2]').disabled,true);
  const submit=()=>root.querySelector('#reading-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  submit();await setImmediate();assert.equal(root.querySelector('#next-activity').disabled,true);assert.match(root.querySelector('#learning-error').textContent,/Offline/);
  fail=false;submit();await setImmediate();assert.equal(root.querySelector('#next-activity').disabled,false);assert.equal(root.querySelector('[data-lesson=a2]').disabled,false);
  root.querySelector('#next-activity').click();assert.equal(navigated,'a2');
  root.querySelector('[data-panel=transcript]').click();assert.equal(root.querySelector('#panel-transcript').hidden,false);
  root.querySelector('[data-panel=notes]').click();root.querySelector('#personal-note').value='My saved note';
  root.querySelector('.curriculum-module').open=false;
  root.querySelector('#personal-note-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();assert.match(root.querySelector('#note-status').textContent,/Note saved/);
  assert.equal(root.querySelector('.curriculum-module').open,false);
});

test('direct locked-activity routes never instantiate a player or show lesson content',async t=>{
  const window=new Window();t.after(()=>window.happyDOM.close());let players=0;
  const dispose=mountLearningWorkspace(window.document.body,{enrollment:makeEnrollment(),activityId:'a2',api:()=>{},onUpdate:()=>{},onNavigate:()=>{},videoFactory:()=>{players++;}});t.after(dispose);
  assert.equal(players,0);assert.match(window.document.body.textContent,/activity is locked/);assert.equal(window.document.querySelector('#next-activity').disabled,true);
});

test('quiz retries collect new answers from the replacement form',async t=>{
  const window=new Window();t.after(()=>window.happyDOM.close());const e=makeEnrollment();const answers=[];
  e.curriculum[0].activities=[makeActivity('quiz','quiz',{questions:[{id:'q',type:'identification',prompt:'Name it',points:1}]})];
  const dispose=mountLearningWorkspace(window.document.body,{enrollment:e,api:async(path,{body})=>{answers.push(body.responses.q);const next=structuredClone(e);next.quizAttempts.quiz={passed:answers.length>1,earned:answers.length>1?1:0,possible:1,percent:answers.length>1?100:0,results:[{questionId:'q',correct:answers.length>1}]};if(answers.length>1)next.done=[0];return {enrollment:next};},onUpdate:()=>{},onNavigate:()=>{}});t.after(dispose);
  for(const answer of ['wrong','correct']){window.document.querySelector('[name=q]').value=answer;window.document.querySelector('#quiz-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();}
  assert.deepEqual(answers,['wrong','correct']);assert.match(window.document.querySelector('.quiz-result').textContent,/Passed/);assert.equal(window.document.querySelector('#next-activity').disabled,false);
});

test('admin converts a module, adds and reorders a video, previews it and saves metadata',async t=>{
  const window=new Window();t.after(()=>window.happyDOM.close());const root=window.document.body;let saved;
  mountCourseBuilder(root,{title:'Course',modules:[{id:'old',title:'Introduction',content:'Read this.',exercise:'Try this activity.',questions:[],passPercent:100}]},{onSave:modules=>saved=modules,onCancel:()=>{}});
  root.querySelector('[data-action=convert-activities]').click();root.querySelector('[data-add-activity=video]').click();
  const field=root.querySelector('[data-module-field=videoId]');field.value='https://youtu.be/M7lc1UVf-VE';field.dispatchEvent(new window.Event('input',{bubbles:true}));
  root.querySelector('[data-action=preview-video]').click();assert.match(root.querySelector('iframe').src,/youtube-nocookie.com\/embed\/M7lc1UVf-VE/);
  root.querySelector('[data-action=activity-up]').click();root.querySelector('[data-action=activity-up]').click();
  root.querySelector('#module-builder').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.ok(saved);assert.equal(saved[0].activities[0].type,'video');assert.equal(saved[0].activities.length,3);assert.equal(new Set(saved[0].activities.map(a=>a.id)).size,3);
});

test('playback sampling ignores seeks, pauses and sleeping tabs while allowing 2x',()=>{
  const first={position:0,time:0,playing:true,rate:1};
  assert.deepEqual(playedSegment(first,{...first,position:1,time:1000}),{start:0,end:1});
  assert.deepEqual(playedSegment(first,{...first,rate:2,position:2,time:1000}),{start:0,end:2});
  assert.equal(playedSegment(first,{...first,position:80,time:1000}),null);
  assert.equal(playedSegment(first,{...first,playing:false,position:1,time:1000}),null);
  assert.equal(playedSegment(first,{...first,position:50,time:50000}),null);
  assert.equal(playedSegment({...first,position:20},{...first,position:1,time:1000}),null);
});

test('YouTube adapter resumes, retries the same failed progress packet and cleans up the player',async t=>{
  const window=new Window({url:'http://localhost:5173'});t.after(()=>window.happyDOM.close());
  let now=0,instance;const timers=[],requests=[],saved=[],messages=[];let fail=true;
  t.mock.method(Date,'now',()=>now);
  window.setInterval=fn=>{timers.push(fn);return timers.length;};window.clearInterval=()=>{};
  window.YT={Player:class {
    constructor(target,options){this.events=options.events;this.position=0;this.state=2;instance=this;}
    getDuration(){return 100;} getCurrentTime(){return this.position;}getPlaybackRate(){return 1;}getPlayerState(){return this.state;}
    pauseVideo(){this.state=2;}seekTo(position){this.position=position;}playVideo(){this.state=1;this.events.onStateChange({data:1});}destroy(){this.destroyed=true;}
  }};
  const adapter=mountYouTube(window.document.body,{videoId:'M7lc1UVf-VE',endpoint:'/enrollments/c/activities/a',onStatus:m=>messages.push(m),onSaved:e=>saved.push(e),api:async(path,options)=>{
    requests.push({path,body:structuredClone(options.body)});
    if(path.endsWith('video-session'))return {token:'session',position:20};
    if(fail){fail=false;throw new Error('Network unavailable');}
    return {enrollment:{activityProgress:{a:{position:25,percent:5}}}};
  }});
  await setImmediate();instance.events.onReady();instance.playVideo();await setImmediate();assert.equal(instance.position,20);
  for(let i=1;i<=5;i++){now=i*1000;instance.position=20+i;timers[0]();}
  timers[1]();await setImmediate();assert.equal(saved.length,0);assert.match(messages.at(-1),/Progress not saved/);
  now=10000;timers[1]();await setImmediate();const packets=requests.filter(r=>r.path.endsWith('video-progress'));assert.deepEqual(packets[0].body,packets[1].body);assert.deepEqual(packets[0].body.ranges,[{start:20,end:25}]);assert.equal(saved.length,1);
  adapter.dispose();assert.equal(instance.destroyed,true);
});
