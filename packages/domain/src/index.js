import { moduleCount } from './curriculum.js';
export { moduleCount, validateModules, gradeModule } from './curriculum.js';
export { activitiesFor, curriculumItems, activityComplete, youtubeId, resourceUrl } from './activities.js';
﻿// Shared date rules. Timestamps are stored as ISO instants; admin inputs use local time.
function durationOf(c) {
  return Number.isInteger(c.durationValue) && c.durationValue > 0 && ['days','weeks','months'].includes(c.durationUnit)
    ? {value:c.durationValue, unit:c.durationUnit} : {value:({Beginner:4,Intermediate:8,Advanced:12}[c.level] || 4), unit:'weeks'};
}
function durationLabel(c) { const d=durationOf(c); return `${d.value} ${d.value===1?d.unit.slice(0,-1):d.unit}`; }
function instant(value) { return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value+'T00:00:00' : value).getTime(); }
function expirationFor(c, start) {
  const d=durationOf(c), date=new Date(instant(start));
  if(d.unit==='months') {
    const day=date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+d.value);
    const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,last));
  } else date.setTime(date.getTime()+d.value*(d.unit==='weeks'?7:1)*86400000);
  return date.toISOString();
}
function enrollmentEnd(c) {
  if(c.enrollmentEnd) return c.enrollmentEnd;
  if(!c.enrollmentCloseDate) return null;
  const date=new Date(c.enrollmentCloseDate+'T00:00:00'); date.setDate(date.getDate()+1);
  return date.toISOString(); // Legacy closing dates included the entire closing day.
}
function courseStatus(c, now=Date.now()) {
  if(c.active===false) return 'Inactive';
  const end=enrollmentEnd(c);
  if(end && now>=instant(end)) return 'Enrollment Closed';
  if(c.enrollmentStart && now<instant(c.enrollmentStart)) return 'Enrollment Upcoming';
  return 'Enrollment Open';
}
function enrollmentStatus(c,e,now=Date.now()) {
  if(!e) return null;
  const expires=e.expiresAt || expirationFor(c,e.enrolledAt || e.start);
  if(e.done?.length===moduleCount(c,e) && moduleCount(c,e)>0 && (!e.completedAt || instant(e.completedAt)<instant(expires))) return 'Completed';
  if(e.cancelledAt || e.status==='Cancelled') return 'Cancelled';
  return now>=instant(expires)?'Expired':'Active';
}
function normalizeEnrollment(c,e) {
  const done=Array.isArray(e.done)?[...new Set(e.done.filter(n=>Number.isInteger(n)&&n>=0&&n<moduleCount(c,e)))]:[];
  const enrolledAt=new Date(instant(e.enrolledAt || e.start)).toISOString();
  const result={...e, start:e.start || enrolledAt.slice(0,10), enrolledAt, expiresAt:e.expiresAt || expirationFor(c,enrolledAt), done, notes:e.notes && typeof e.notes==='object'?e.notes:{}};
  // Legacy completed records have no completion timestamp; preserve their achievement.
  if (!result.curriculum && c.modules) result.curriculum=structuredClone(c.modules);
  result.status=enrollmentStatus(c,result);
  return result;
}
export {durationOf,durationLabel,instant,expirationFor,enrollmentEnd,courseStatus,enrollmentStatus,normalizeEnrollment};
