import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { courses } from '@enzo/catalog';
test('health and catalog expose shared courses and availability', async t => {
  const app = buildApp();
  t.after(() => app.close());
  const health = await app.inject('/api/health');
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: 'ok' });
  const list = await app.inject('/api/courses');
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().courses.length, courses.length);
  const detail = await app.inject('/api/courses/js');
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().course.title, 'JavaScript Essentials');
  assert.equal(detail.json().course.duration, '4 weeks');
  assert.equal(detail.json().course.status, 'Enrollment Open');
});
test('unknown courses return 404 and mutation routes are unavailable', async t => {
  const app = buildApp();
  t.after(() => app.close());
  assert.equal((await app.inject('/api/courses/unknown')).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/courses', payload: {} })).statusCode, 404);
});
