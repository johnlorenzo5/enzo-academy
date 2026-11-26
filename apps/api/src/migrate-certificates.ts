import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { firebaseBackend } from './firebase-store.js';
import { certificates } from './certificates.js';
import type { Enrollment } from './academy.js';
try {loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const {store}=firebaseBackend();
const awards=certificates(store,Date.now);
const apply=process.argv.includes('--apply');
const enrollments=await store.list<Enrollment>('academyEnrollments');
console.log(`${apply?'Applying':'Dry run:'} certificate backfill across ${enrollments.length} enrollments.`);
if(apply){
  for(const e of enrollments){
    const key=Buffer.from(JSON.stringify([e.uid,e.courseId])).toString('base64url');
    await store.transaction(async tx=>{const current=await tx.get<Enrollment>('academyEnrollments',key);if(!current)return;await awards.issue(tx,current,Date.now());tx.set('academyEnrollments',key,current);});
  }
  console.log('Backfill complete. The API email worker will process pending notifications.');
}else console.log('No writes made. Rerun with --apply to issue certificates supported by stored completion evidence.');
