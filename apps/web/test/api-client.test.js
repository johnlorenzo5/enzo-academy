import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api-client.js';

const auth={currentUser:{getIdToken:async()=>'test-token'}};
const ok=value=>({ok:true,status:200,json:async()=>value});
const proxyReset=()=>({ok:false,status:500,json:async()=>{throw new SyntaxError('Unexpected end of JSON input');}});

test('read requests recover from a proxy reset during an API restart',async()=>{
  let attempts=0;const delays=[];
  const api=createApi(auth,async()=>++attempts===1?proxyReset():ok({courses:[]}),{wait:async ms=>delays.push(ms)});
  assert.deepEqual(await api('/courses'),{courses:[]});assert.equal(attempts,2);assert.deepEqual(delays,[500]);
});

test('course update retries preserve the exact body and report recovery',async()=>{
  const calls=[];const body={revision:2,title:'My course',modules:[]};
  const api=createApi(auth,async(url,options)=>{calls.push({url,options:structuredClone(options)});if(calls.length===1)throw new TypeError('Failed to fetch');return ok({course:{...body,revision:3}});},{wait:async()=>{}});
  assert.equal((await api('/admin/courses/course-id',{method:'PUT',body})).course.revision,3);
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
});

test('a prolonged interruption leaves an actionable save error after bounded retries',async()=>{
  let attempts=0;const api=createApi(auth,async()=>{attempts++;return proxyReset();},{wait:async()=>{}});
  await assert.rejects(api('/admin/courses/course-id',{method:'PUT',body:{revision:1}}),error=>error.status===503&&/draft is kept/.test(error.message));
  assert.equal(attempts,4);
});

test('course creation and quiz submissions are not replayed after a lost response',async()=>{
  for(const path of ['/admin/courses','/enrollments/c/activities/q/submit']){
    let attempts=0;const api=createApi(auth,async()=>{attempts++;throw new TypeError('Network failure');},{wait:async()=>{}});
    await assert.rejects(api(path,{method:'POST',body:{}}),/connection to the API was interrupted/);assert.equal(attempts,1);
  }
});

test('JSON validation, authentication and Firebase setup errors retain their specific messages',async()=>{
  for(const status of [400,401,403,409,503]){
    let attempts=0;const api=createApi(auth,async()=>{attempts++;return {ok:false,status,json:async()=>({error:'Specific server error'})};},{wait:async()=>{}});
    await assert.rejects(api('/admin/courses/course-id',{method:'PUT',body:{}}),error=>error.status===status&&error.message==='Specific server error');assert.equal(attempts,1);
  }
});
