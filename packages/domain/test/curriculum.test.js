import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModules, gradeModule, normalizeEnrollment, enrollmentStatus, moduleCount } from '@enzo/domain';

const module = { id: 'm1', title: 'Basics', content: 'Read this.', passPercent: 70, questions: [
  { id: 'q1', type: 'choice', prompt: 'Pick A', points: 2, options: [{id:'a',text:'A'},{id:'b',text:'B'}], correct:['a'] },
  { id: 'q2', type: 'checkbox', prompt: 'Pick both', points: 3, options: [{id:'a',text:'A'},{id:'b',text:'B'},{id:'c',text:'C'}], correct:['a','b'] },
  { id: 'q3', type: 'identification', prompt: 'Name it', points: 5, answers:['JavaScript', 'JS'] },
] };

test('all question types grade correctly; checkbox order and identification whitespace are normalized', () => {
  const result = gradeModule(module, {q1:['a'],q2:['b','a'],q3:'  JAVASCRIPT  '});
  assert.equal(result.earned, 10); assert.equal(result.passed, true);
  assert.equal(gradeModule(module,{q1:['b'],q2:['a'],q3:'js'}).earned,5);
  for(const response of [['a','b','c'],['a','a'],['a'],[]]) assert.equal(gradeModule(module,{q2:response}).earned,0);
  assert.equal(gradeModule(module,{q1:['a'],q3:'JS'}).passed,true);
  assert.equal(gradeModule(module,{}).passed,false);
  assert.equal(gradeModule(module,{q3:42}).earned,0);
});
test('incomplete answer keys, duplicate IDs, blank content and invalid thresholds are rejected', () => {
  assert.throws(()=>validateModules([]));
  assert.throws(()=>validateModules([{...module,passPercent:0}]));
  assert.throws(()=>validateModules([{...module,content:' '} ]));
  assert.throws(()=>validateModules([{...module,questions:[{...module.questions[0],correct:[]}]}]));
  assert.throws(()=>validateModules([{...module,questions:[{...module.questions[0],correct:['a','b']}]}]));
  assert.throws(()=>validateModules([{...module,questions:[{...module.questions[2],answers:[' ']}]}]));
  assert.throws(()=>validateModules([module,module]));
});
test('variable-length courses complete correctly and preserve the enrolled curriculum after edits', () => {
  const course={modules:[structuredClone(module)],durationValue:30,durationUnit:'days'};
  const enrollment=normalizeEnrollment(course,{enrolledAt:'2026-01-01T00:00:00Z',done:[0,0,9],notes:{}});
  assert.deepEqual(enrollment.done,[0]);
  assert.equal(enrollmentStatus(course,enrollment,Date.parse('2026-01-02')),'Completed');
  course.modules.push({...module,id:'m2'}); course.modules[0].title='Edited title';
  assert.equal(moduleCount(course,enrollment),1);
  assert.equal(enrollment.curriculum[0].title,'Basics');
  assert.equal(enrollmentStatus(course,enrollment,Date.parse('2026-02-02')),'Completed');
  const next=normalizeEnrollment(course,{enrolledAt:'2026-01-01T00:00:00Z',done:[0]});
  assert.equal(enrollmentStatus(course,next,Date.parse('2026-01-02')),'Active');
  assert.equal(enrollmentStatus(course,next,Date.parse('2026-02-02')),'Expired');
});
