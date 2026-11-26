import {mountProfilePage} from '../src/profile-page.js';
import {createAccountMenu} from '../src/account-menu.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import * as domain from '@enzo/domain';
import { courses as seedCourses, lessons as seedLessons } from '@enzo/catalog';
import { modulesFor, mountCourseBuilder } from '../src/course-builder.js';
import { lessonMarkup, readQuiz } from '../src/lesson-player.js';

// Run the real app entry in a virtual DOM, injecting its ESM dependencies and omitting CSS.
async function boot(storage = {}, session) {
  const window = new Window({url:'http://localhost:5173'});
  window.document.write(await readFile(new URL('../index.html', import.meta.url),'utf8'));
  window.setInterval=()=>0;
  Object.entries(storage).forEach(([key,value])=>window.localStorage.setItem(key,JSON.stringify(value)));
  if(session)window.sessionStorage.setItem('enzoAcademy-session-v1',session);
  const source=(await readFile(new URL('../src/main.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
  window.__dependencies={mountProfilePage,changeAccountEmail:async()=>{},createAccountMenu,...domain,seedCourses,seedLessons,modulesFor,mountCourseBuilder,lessonMarkup,readQuiz,structuredClone};
  window.eval(`const {${Object.keys(window.__dependencies).join(',')}}=window.__dependencies;\n${source}`);
  return window;
}

test('admin studio is reachable and saves a new module count to persistent catalog', async t=>{
  const window=await boot({},'enzoAcademy-admin');t.after(()=>window.happyDOM.close());
  const doc=window.document;
  doc.querySelector('[data-admin-section="courses"]').click();
  doc.querySelector('[data-admin-modules="js"]').click();
  assert.ok(doc.querySelector('#module-builder'));
  doc.querySelector('[data-action="add-module"]').click();
  const content=doc.querySelector('[data-module-field="content"]');content.value='Read the fifth lesson.';
  content.dispatchEvent(new window.Event('input',{bubbles:true}));
  doc.querySelector('#module-builder').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  const saved=JSON.parse(window.localStorage.getItem('enzoAcademy-admin-courses-v1'));
  assert.equal(saved.find(c=>c.id==='js').modules.length,5);
});

test('learner enrollment, failed quiz, successful retry, saved score and reload work end to end',async t=>{
  const module={id:'m',title:'Quiz lesson',content:'The answer is JavaScript.',exercise:'',passPercent:100,questions:[{id:'q',type:'identification',prompt:'Name the language',points:2,answers:['JavaScript'],options:[],correct:[]}]};
  const catalog=[{...seedCourses[0],topics:[module.title],modules:[module]}];
  const account={id:'learner',name:'Test learner',email:'test@example.com',hash:'demo',salt:'demo'};
  const initial={'enzoAcademy-admin-courses-v1':catalog,'enzoAcademy-accounts-v1':[account]};
  const window=await boot(initial,'learner');t.after(()=>window.happyDOM.close());
  const doc=window.document;
  doc.querySelector('[data-course="js"]').click();
  doc.querySelector('[data-enroll="js"]').click();
  doc.querySelector('[data-learn="js"]').click();
  const submit=value=>{doc.querySelector('[name="q"]').value=value;doc.querySelector('#quiz-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));};
  submit('wrong');
  let saved=JSON.parse(window.localStorage.getItem('enzoAcademy-learning-v2:learner'));
  assert.deepEqual(saved.enrollments.js.done,[]);
  assert.match(doc.querySelector('.quiz-result').textContent,/Try again/);
  submit(' JAVASCRIPT ');
  saved=JSON.parse(window.localStorage.getItem('enzoAcademy-learning-v2:learner'));
  assert.deepEqual(saved.enrollments.js.done,[0]);
  assert.equal(saved.enrollments.js.status,'Completed');
  assert.equal(saved.enrollments.js.quizAttempts.m.attemptNumber,2);
  assert.equal(saved.enrollments.js.quizAttempts.m.earned,2);
  const reload=await boot({...initial,'enzoAcademy-learning-v2:learner':saved},'learner');t.after(()=>reload.happyDOM.close());
  reload.document.querySelector('[data-course="js"]').click();
  reload.document.querySelector('[data-learn="js"]').click();
  assert.match(reload.document.querySelector('.quiz-result').textContent,/Passed: 2\/2/);
});
