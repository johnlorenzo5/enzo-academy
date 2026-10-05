import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountCourseBuilder, modulesFor } from '../src/course-builder.js';
import { lessonMarkup, readQuiz } from '../src/lesson-player.js';

test('admin can author and save a quiz; unsaved edits do not mutate the course', async t => {
  const window = new Window(); t.after(()=>window.happyDOM.close());
  const root=window.document.body;
  const course={id:'test',title:'Test',modules:modulesFor({id:'test',topics:['Basics']})};
  let saved;
  mountCourseBuilder(root,course,{onSave:modules=>saved=modules,onCancel:()=>{}});
  const input=(selector,value)=>{const el=root.querySelector(selector);el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
  const click=selector=>root.querySelector(selector).click();
  input('[data-module-field="title"]','New title');
  click('[data-action="add-question"]');
  input('[data-question-field="prompt"]','Choose the first answer');
  root.querySelectorAll('[data-option]').forEach((el,i)=>input(`[data-option="${el.dataset.option}"]`, `Answer ${i+1}`));
  click('[data-correct]');
  root.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(saved[0].title,'New title');
  assert.equal(saved[0].questions[0].correct.length,1);
  assert.equal(course.modules[0].title,'Basics');
  click('[data-action="add-module"]');
  input('[data-module-field="title"]','Second module');
  input('[data-module-field="content"]','Second lesson text');
  click('[data-action="up"]');
  root.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(saved.length,2); assert.equal(saved[0].title,'Second module');
});

test('learner form escapes content, requires every response and grades without rendering answer keys', async t => {
  const window=new Window();t.after(()=>window.happyDOM.close());
  const module={id:'m',title:'<script>bad()</script>',content:'<img src=x onerror=bad()>',exercise:'',passPercent:100,questions:[
    {id:'q1',type:'checkbox',prompt:'Both',points:1,options:[{id:'a',text:'A'},{id:'b',text:'B'}],correct:['a','b']},
    {id:'q2',type:'identification',prompt:'Name',points:1,answers:['secret accepted answer']},
  ]};
  window.document.body.innerHTML=lessonMarkup(module);
  assert.equal(window.document.querySelector('script,img'),null);
  assert.equal(window.document.body.textContent.includes('secret accepted answer'),false);
  const form=window.document.querySelector('form');
  assert.throws(()=>readQuiz(module,form),/every question/);
  form.querySelectorAll('[type=checkbox]').forEach(el=>el.checked=true);
  form.querySelector('[name=q2]').value=' SECRET accepted answer ';
  const result=readQuiz(module,form);assert.equal(result.passed,true);
  window.document.body.innerHTML=lessonMarkup(module,result);
  assert.match(window.document.querySelector('.quiz-result').textContent,/Passed: 2\/2/);
});
