import test from 'node:test';
import assert from 'node:assert/strict';
import * as t from '@enzo/domain';
const course={durationValue:30,durationUnit:'days',enrollmentStart:'2026-09-01T00:00:00Z',enrollmentEnd:'2026-09-15T00:00:00Z'};
const at=s=>Date.parse(s);
test('Enrollment start is inclusive and end exclusive',()=>{
 assert.equal(t.courseStatus(course,at('2026-08-31T23:59:59Z')),'Enrollment Upcoming');
 assert.equal(t.courseStatus(course,at(course.enrollmentStart)),'Enrollment Open');
 assert.equal(t.courseStatus(course,at(course.enrollmentEnd)-1),'Enrollment Open');
 assert.equal(t.courseStatus(course,at(course.enrollmentEnd)),'Enrollment Closed');
 assert.equal(t.courseStatus({...course,active:false},at(course.enrollmentStart)),'Inactive');
 assert.equal(t.courseStatus({}),'Enrollment Open');
});
test('Personal access outlasts enrollment closing and expires at the exact deadline',()=>{
 const e=t.normalizeEnrollment(course,{enrolledAt:course.enrollmentStart,done:[]});
 assert.equal(e.expiresAt,'2026-10-01T00:00:00.000Z');
 assert.equal(t.enrollmentStatus(course,e,at('2026-09-16T00:00:00Z')),'Active');
 assert.equal(t.enrollmentStatus(course,e,at(e.expiresAt)-1),'Active');
 assert.equal(t.enrollmentStatus(course,e,at(e.expiresAt)),'Expired');
 assert.equal(t.enrollmentStatus({...course,durationValue:1},e,at('2026-09-16T00:00:00Z')),'Active');
});
test('Timely completion and legacy completion persist; late completion does not qualify',()=>{
 const e=t.normalizeEnrollment(course,{enrolledAt:course.enrollmentStart,done:[0,1,2,3]});
 assert.equal(t.enrollmentStatus(course,e,at('2027-01-01')),'Completed');
 assert.equal(t.enrollmentStatus(course,{...e,completedAt:'2026-09-30T23:59:59Z'},at('2027-01-01')),'Completed');
 assert.equal(t.enrollmentStatus(course,{...e,completedAt:e.expiresAt},at('2027-01-01')),'Expired');
 assert.equal(t.enrollmentStatus(course,{...e,done:[],cancelledAt:course.enrollmentStart}),'Cancelled');
});
test('Weeks, calendar months, leap years and legacy durations',()=>{
 assert.equal(t.expirationFor({durationValue:2,durationUnit:'weeks'},'2026-09-01T12:34:56Z'),'2026-09-15T12:34:56.000Z');
 assert.equal(t.expirationFor({durationValue:1,durationUnit:'months'},'2026-01-31T12:34:56Z'),'2026-02-28T12:34:56.000Z');
 assert.equal(t.expirationFor({durationValue:1,durationUnit:'months'},'2028-01-31T12:34:56Z'),'2028-02-29T12:34:56.000Z');
 assert.deepEqual(t.durationOf({level:'Intermediate'}),{value:8,unit:'weeks'});
 const c={enrollmentCloseDate:'2026-09-15'};
 assert.equal(t.courseStatus(c,t.instant('2026-09-15')),'Enrollment Open');
 assert.equal(t.courseStatus(c,t.instant('2026-09-16')),'Enrollment Closed');
});
