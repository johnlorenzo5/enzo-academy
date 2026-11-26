import {renderExploreHero,renderLearningDashboard,renderHowItWorks} from '../src/academy-pages.js';
import {mountProfilePage} from '../src/profile-page.js';
import {createAccountMenu} from '../src/account-menu.js';
import test from 'node:test';
import {mountCertificates,renderCertificateVerification} from '../src/certificates.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate} from 'node:timers/promises';
import {Window} from 'happy-dom';
import {escapeHtml,mountCourseBuilder} from '../src/course-builder.js';
import {lessonMarkup,collectResponses} from '../src/lesson-player.js';
import {durationLabel,courseStatus} from '@enzo/domain';
import {mountLearningWorkspace} from '../src/learning-workspace.js';

const course={id:'c1',title:'Cloud course',category:'Programming',description:'Description',level:'Beginner',durationValue:4,durationUnit:'weeks',active:true,enrollmentStart:null,enrollmentEnd:null,revision:3,modules:[{id:'m1',title:'Lesson',content:'Read me',exercise:'',passPercent:100,questions:[{id:'q1',type:'identification',prompt:'Name it',points:1,options:[],answers:[],correct:[]}]}],topics:['Lesson']};
async function boot({role='learner',fail=false,saveFail=false,storage={},uid='u1',enrolled=true,signedIn=true,authFail=false,googleErrorCode=null}={}){
  const window=new Window({url:'http://localhost:5173/#learning'});
  for(const [key,value] of Object.entries(storage))window.localStorage.setItem(key,value);
  window.document.write(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  const calls=[];
  const enrollment={courseId:'c1',courseTitle:course.title,uid:'u1',done:[],notes:{},curriculum:course.modules,status:'Active',expiresAt:'2099-01-01',quizAttempts:{}};
  const api=async(path,options)=>{
    calls.push({path,options});if(fail)throw new Error('Firebase server credentials are not ready.');
    if(saveFail&&options?.method)throw new Error('Save failed. Try again.');
    if(path==='/certificates')return {certificates:[]};
    if(path==='/me/profile')return {account:{uid,name:`${options.body.firstName} ${options.body.lastName}`,email:'learner@example.com',role,profile:options.body}};
    if(path==='/me')return {account:{uid:'u1',name:'Learner',email:'learner@example.com',role}};
    if(path.endsWith('/courses'))return {courses:[course]};
    if(path.endsWith('/enrollments'))return {enrollments:enrolled?[enrollment]:[]};
    if(path.endsWith('/enroll'))return {enrollment};
    if(path.endsWith('/learners'))return {learners:[]};
    if(path.endsWith('/submit'))return {enrollment:{...enrollment,done:[0],status:'Completed',quizAttempts:{m1:{earned:1,possible:1,percent:100,passed:true,results:[{questionId:'q1',correct:true}]}}}};
    return {};
  };
  let callback;
  const user={uid,email:'learner@example.com',getIdToken:async()=> 'test-token'};
  const auth={currentUser:signedIn?user:null};
  const authenticate=async()=>{
    if(authFail)throw new Error('Incorrect email or password.');
    auth.currentUser=user;callback();return {user};
  };
  const googleSignIns=[];
  const authenticateGoogle=async()=>{
    googleSignIns.push(true);
    if(googleErrorCode)throw Object.assign(new Error('Google sign-in failed.'),{code:googleErrorCode});
    return authenticate();
  };
  window.__dependencies={signInWithGoogle:authenticateGoogle,renderExploreHero,renderLearningDashboard,renderHowItWorks,mountProfilePage,changeAccountEmail:async()=>{},createAccountMenu,mountCertificates,renderCertificateVerification,esc:escapeHtml,mountCourseBuilder,mountLearningWorkspace,lessonMarkup,collectResponses,durationLabel,courseStatus,api,auth,onAuthStateChanged:(_,fn)=>callback=fn,signInWithEmailAndPassword:authenticate,createUserWithEmailAndPassword:authenticate,updateProfile:async(user,profile)=>Object.assign(user,profile),signOut:async()=>{},sendPasswordResetEmail:async()=>{}};
  const source=(await readFile(new URL('../src/cloud.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
  window.eval(`const {${Object.keys(window.__dependencies).join(',')}}=window.__dependencies;\n${source}`);
  callback();await setImmediate();
  return {window,calls,auth,googleSignIns,fireAuth:()=>callback()};
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

const input=(window,selector,value)=>{const field=window.document.querySelector(selector);field.value=value;field.dispatchEvent(new window.Event('input',{bubbles:true}));};
const snapshot=window=>Object.fromEntries(Array.from({length:window.localStorage.length},(_,i)=>{const key=window.localStorage.key(i);return [key,window.localStorage.getItem(key)];}));

test('enrolling shows confirmation and immediately adds the course to My learning',async t=>{
  const {window,calls}=await boot({enrolled:false});t.after(()=>window.happyDOM.close());
  window.location.hash='#explore';window.dispatchEvent(new window.Event('hashchange'));
  window.document.querySelector('[data-course]').click();window.document.querySelector('[data-enroll]').click();await setImmediate();
  assert.equal(calls.filter(c=>c.path.endsWith('/enroll')).length,1);
  assert.equal(window.document.querySelector('#dialog').open,false);
  assert.equal(window.location.hash,'#learning');assert.equal(window.document.querySelector('#count').textContent,'1');
  assert.ok(window.document.querySelector('[data-learn]'));assert.match(window.document.querySelector('#toast').textContent,/You are enrolled/);
});

test('enrollment failure stays visible inside the course dialog and permits retry',async t=>{
  const {window}=await boot({enrolled:false,saveFail:true});t.after(()=>window.happyDOM.close());
  window.location.hash='#explore';window.dispatchEvent(new window.Event('hashchange'));
  window.document.querySelector('[data-course]').click();window.document.querySelector('[data-enroll]').click();await setImmediate();
  assert.equal(window.document.querySelector('#dialog').open,true);
  assert.match(window.document.querySelector('#detail [role=alert]').textContent,/Save failed/);
  assert.equal(window.document.querySelector('[data-enroll]').disabled,false);assert.equal(window.document.querySelector('#count').textContent,'0');
});

test('new course draft survives outside clicks, closing, and a fresh page; successful save clears it',async t=>{
  const {window}=await boot({role:'admin'});t.after(()=>window.happyDOM.close());
  window.document.querySelector('[data-edit=new]').click();
  input(window,'[name=title]','Unfinished course');input(window,'[name=category]','Science');input(window,'[name=description]','My lesson plan');
  input(window,'[name=durationValue]','12');input(window,'[name=durationUnit]','months');input(window,'[name=enrollmentStart]','2027-01-01T09:00');
  const dialog=window.document.querySelector('#dialog');
  dialog.dispatchEvent(new window.MouseEvent('click',{bubbles:true,clientX:-100,clientY:-100}));assert.equal(dialog.open,true);
  window.document.querySelector('.close').click();window.document.querySelector('[data-edit=new]').click();
  assert.equal(window.document.querySelector('[name=title]').value,'Unfinished course');
  const reloaded=await boot({role:'admin',storage:snapshot(window)});t.after(()=>reloaded.window.happyDOM.close());
  reloaded.window.document.querySelector('[data-edit=new]').click();
  assert.equal(reloaded.window.document.querySelector('[name=durationValue]').value,'12');
  assert.equal(reloaded.window.document.querySelector('[name=durationUnit]').value,'months');
  assert.equal(reloaded.window.document.querySelector('[name=enrollmentStart]').value,'2027-01-01T09:00');
  reloaded.window.document.querySelector('#course-form').dispatchEvent(new reloaded.window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.equal(reloaded.calls.find(c=>c.options?.method==='POST').options.body.title,'Unfinished course');
  assert.equal(reloaded.window.localStorage.length,0);
});

test('module and quiz drafts restore structure, answer keys and selected module after refresh',async t=>{
  const {window}=await boot({role:'admin'});t.after(()=>window.happyDOM.close());
  const click=selector=>window.document.querySelector(selector).click();
  click('[data-studio]');click('[data-action=add-module]');
  input(window,'[data-module-field=title]','Second lesson');input(window,'[data-module-field=content]','Unfinished lesson content');
  click('[data-action=add-question]');input(window,'[data-question-field=prompt]','Choose an answer');
  window.document.querySelectorAll('[data-option]').forEach((field,i)=>input(window,`[data-option="${field.dataset.option}"]`,`Answer ${i}`));
  click('[data-correct]');
  const stored=snapshot(window);
  const reloaded=await boot({role:'admin',storage:stored});t.after(()=>reloaded.window.happyDOM.close());
  reloaded.window.document.querySelector('[data-studio]').click();
  assert.equal(reloaded.window.document.querySelector('[data-module-field=title]').value,'Second lesson');
  assert.equal(reloaded.window.document.querySelector('[data-question-field=prompt]').value,'Choose an answer');
  assert.equal(reloaded.window.document.querySelector('[data-correct]').checked,true);
  assert.equal(reloaded.window.document.querySelectorAll('[data-module]').length,2);
  assert.match(reloaded.window.document.querySelector('#draft-status').textContent,/restored/);
  const other=await boot({role:'admin',uid:'another-admin',storage:stored});t.after(()=>other.window.happyDOM.close());
  other.window.document.querySelector('[data-studio]').click();assert.equal(other.window.document.querySelectorAll('[data-module]').length,1);
});

test('failed course save retains the draft and confirmed discard removes it',async t=>{
  const {window}=await boot({role:'admin',saveFail:true});t.after(()=>window.happyDOM.close());
  window.document.querySelector('[data-edit=new]').click();input(window,'[name=title]','Keep this draft');
  window.document.querySelector('#course-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.match(window.document.querySelector('#course-error').textContent,/Save failed/);
  window.document.querySelector('.close').click();window.document.querySelector('[data-edit=new]').click();
  assert.equal(window.document.querySelector('[name=title]').value,'Keep this draft');
  window.confirm=()=>false;window.document.querySelector('#discard-course-draft').click();assert.equal(window.localStorage.length,1);
  window.confirm=()=>true;window.document.querySelector('#discard-course-draft').click();assert.equal(window.localStorage.length,0);
});


test('Update Profile opens an editable full page for learners and admins and saves through the authenticated profile endpoint',async t=>{
  for(const role of ['learner','admin']){
    const {window,calls}=await boot({role});t.after(()=>window.happyDOM.close());
    const doc=window.document;
    doc.querySelector('#profile').click();
    doc.querySelector('[data-account-profile]').click();
    window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
    const form=doc.querySelector('#profile-form');assert.ok(form);
    assert.equal(doc.querySelector('#dialog').open,false);
    assert.equal(doc.querySelector('#account-drawer').open,false);
    for(const [name,value] of Object.entries({firstName:'John Lorenzo',lastName:'Flores',country:'Philippines',region:'Bohol'}))form.elements.namedItem(name).value=value;
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
    const save=calls.find(call=>call.path==='/me/profile');
    assert.equal(save.options.method,'PUT');assert.equal(save.options.body.region,'Bohol');
    assert.match(doc.querySelector('#profile').textContent,/John Lorenzo Flores/);
    assert.match(doc.querySelector('#profile-save-status').textContent,/saved/);
  }
});

test('profile save failure retains entered values and offers a retry',async t=>{
  const {window}=await boot({saveFail:true});t.after(()=>window.happyDOM.close());
  window.location.hash='profile';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  const doc=window.document,form=doc.querySelector('#profile-form');
  for(const [name,value] of Object.entries({firstName:'John',lastName:'Flores',country:'Philippines',region:'Bohol'}))form.elements.namedItem(name).value=value;
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.match(doc.querySelector('#profile-error').textContent,/Save failed/);
  assert.equal(form.elements.namedItem('region').value,'Bohol');
  assert.equal(doc.querySelector('.profile-save').disabled,false);
});


test('profile certificate and history tabs stay on the profile page and preserve unsaved inputs',async t=>{
  const {window,calls}=await boot();t.after(()=>window.happyDOM.close());
  window.location.hash='profile';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  const doc=window.document,hero=doc.querySelector('.profile-hero'),form=doc.querySelector('#profile-form');
  form.elements.namedItem('firstName').value='Unsaved name';
  doc.querySelector('.profile-tabs a[href="#achievements"]').click();await setImmediate();
  assert.equal(window.location.hash,'#profile');
  assert.equal(doc.querySelector('.profile-hero'),hero);
  assert.equal(doc.querySelector('#profile-information-panel').hidden,true);
  assert.equal(doc.querySelector('#profile-achievements-panel').hidden,false);
  assert.match(doc.querySelector('#profile-achievements-panel').textContent,/haven't earned any certificates yet/);
  assert.ok(calls.some(call=>call.path==='/certificates'));
  doc.querySelector('.profile-tabs a[href="#history"]').click();
  assert.equal(window.location.hash,'#profile');
  assert.equal(doc.querySelector('.profile-hero'),hero);
  assert.equal(doc.querySelector('#profile-achievements-panel').hidden,true);
  assert.equal(doc.querySelector('#profile-history-panel').hidden,false);
  assert.match(doc.querySelector('#profile-history-panel').textContent,/Cloud course/);
  assert.match(doc.querySelector('#profile-history-panel').textContent,/0%.*0\/1 modules/);
  assert.equal(doc.querySelector('.profile-tabs a[href="#history"]').getAttribute('aria-current'),'true');
  doc.querySelector('.profile-tabs a[href="#profile"]').click();
  assert.equal(doc.querySelector('#profile-form'),form);
  assert.equal(form.elements.namedItem('firstName').value,'Unsaved name');
  assert.equal(doc.querySelector('#profile-information-panel').hidden,false);
});


for(const register of [false,true])test(`guest enrollment resumes after ${register?'registration':'login'} and opens the first module once`,async t=>{
  const {window,calls,fireAuth}=await boot({signedIn:false,enrolled:false});t.after(()=>window.happyDOM.close());
  const doc=window.document;
  window.location.hash='explore';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  doc.querySelector('[data-course]').click();doc.querySelector('[data-enroll]').click();
  assert.equal(calls.filter(c=>c.path.endsWith('/enroll')).length,0);
  if(register)doc.querySelector('#auth-switch').click();
  const form=doc.querySelector('#cloud-auth');
  if(register)form.elements.name.value='New learner';
  form.elements.email.value='learner@example.com';form.elements.password.value='password123';
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.equal(calls.filter(c=>c.path.endsWith('/enroll')).length,1);
  assert.equal(calls.filter(c=>c.path==='/me').length,1);
  assert.equal(window.location.hash,'#learn/c1');
  assert.equal(doc.querySelector('#dialog').open,false);
  assert.ok(doc.querySelector('#quiz-form'));
  const workspace=doc.querySelector('.learning-workspace');
  fireAuth();await setImmediate();
  assert.equal(doc.querySelector('.learning-workspace'),workspace);
});

test('failed guest login never enrolls and keeps the sign-in form available',async t=>{
  const {window,calls}=await boot({signedIn:false,enrolled:false,authFail:true});t.after(()=>window.happyDOM.close());
  const doc=window.document;
  window.location.hash='explore';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  doc.querySelector('[data-course]').click();doc.querySelector('[data-enroll]').click();
  const form=doc.querySelector('#cloud-auth');form.elements.email.value='learner@example.com';form.elements.password.value='wrong-password';
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.equal(calls.filter(c=>c.path.endsWith('/enroll')).length,0);
  assert.match(doc.querySelector('#auth-error').textContent,/Incorrect email or password/);
  assert.equal(form.querySelector('button').disabled,false);
  assert.equal(doc.querySelector('#dialog').open,true);
});

test('enrollment failure after login shows a retry without opening an unconfirmed course',async t=>{
  const {window,calls}=await boot({signedIn:false,enrolled:false,saveFail:true});t.after(()=>window.happyDOM.close());
  const doc=window.document;
  window.location.hash='explore';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  doc.querySelector('[data-course]').click();doc.querySelector('[data-enroll]').click();
  const form=doc.querySelector('#cloud-auth');form.elements.email.value='learner@example.com';form.elements.password.value='password123';
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.equal(calls.filter(c=>c.path.endsWith('/enroll')).length,1);
  assert.equal(window.location.hash,'#explore');assert.equal(doc.querySelector('#dialog').open,true);
  assert.match(doc.querySelector('#enrollment-error').textContent,/Save failed/);
  assert.equal(doc.querySelector('[data-enroll]').disabled,false);
});


test('closing the auth prompt during login cancels automatic enrollment',async t=>{
  const {window,calls}=await boot({signedIn:false,enrolled:false});t.after(()=>window.happyDOM.close());
  const doc=window.document;
  window.location.hash='explore';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  doc.querySelector('[data-course]').click();doc.querySelector('[data-enroll]').click();
  const form=doc.querySelector('#cloud-auth');form.elements.email.value='learner@example.com';form.elements.password.value='password123';
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  doc.querySelector('.close').click();await setImmediate();
  assert.equal(calls.filter(c=>c.path.endsWith('/enroll')).length,0);
  assert.equal(window.location.hash,'#explore');
});


for(const register of [false,true])test(`Google sign-in from the ${register?'registration':'login'} form resumes guest enrollment without requiring password fields`,async t=>{
  const {window,calls,googleSignIns}=await boot({signedIn:false,enrolled:false});t.after(()=>window.happyDOM.close());
  const doc=window.document;
  window.location.hash='explore';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  doc.querySelector('[data-course]').click();doc.querySelector('[data-enroll]').click();
  if(register)doc.querySelector('#auth-switch').click();
  assert.equal(doc.querySelector('[name=password]').value,'');
  doc.querySelector('#google-signin').click();doc.querySelector('#google-signin').click();await setImmediate();
  assert.equal(googleSignIns.length,1);
  assert.equal(calls.filter(call=>call.path.endsWith('/enroll')).length,1);
  assert.equal(window.location.hash,'#learn/c1');assert.ok(doc.querySelector('#quiz-form'));
  assert.equal(doc.querySelector('#dialog').open,false);
});

for(const code of ['auth/popup-closed-by-user','auth/popup-blocked'])test(`Google ${code} keeps email sign-in available and does not enroll`,async t=>{
  const {window,calls}=await boot({signedIn:false,enrolled:false,googleErrorCode:code});t.after(()=>window.happyDOM.close());
  const doc=window.document;
  window.location.hash='explore';window.dispatchEvent(new window.Event('hashchange'));await setImmediate();
  doc.querySelector('[data-course]').click();doc.querySelector('[data-enroll]').click();
  doc.querySelector('#google-signin').click();await setImmediate();
  assert.equal(calls.filter(call=>call.path.endsWith('/enroll')).length,0);
  assert.match(doc.querySelector('#google-auth-error').textContent,code==='auth/popup-blocked'?/Allow pop-ups/:/cancelled/);
  assert.equal(doc.querySelector('#google-signin').disabled,false);
  assert.equal(doc.querySelector('#cloud-auth button').disabled,false);
  const form=doc.querySelector('#cloud-auth');form.elements.email.value='learner@example.com';form.elements.password.value='password123';
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  assert.equal(calls.filter(call=>call.path.endsWith('/enroll')).length,1);
  assert.equal(window.location.hash,'#learn/c1');
});
