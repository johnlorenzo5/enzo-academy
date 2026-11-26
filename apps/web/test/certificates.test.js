import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {Window} from 'happy-dom';
import {mountCertificates,renderCertificateVerification} from '../src/certificates.js';

const certificate={id:'CERT-example',holderName:'Learner <name>',moduleTitle:'Networking',courseTitle:'Technology',completedAt:'2026-10-24',issuedAt:'2026-10-24',status:'valid',verificationUrl:'https://example.com/#verify/CERT-example',email:{status:'failed',attempts:1,lastError:'Provider unavailable'}};
function setup({admin=false,records=[certificate],failure=false}={}){
  const window=new Window();window.document.write('<main></main><section id="detail"></section><p id="notice"></p>');const calls=[];
  const api=async(path,options)=>{calls.push({path,options});if(failure)throw new Error('Unavailable');if(options?.method==='POST'){if(path.endsWith('/revoke'))records[0]={...records[0],status:'revoked',revocationReason:options.body.reason};return {certificate:records[0]};}if(path.endsWith('/CERT-example'))return {certificate:records[0],history:[{at:'2026-10-24',action:'issued',detail:'Created'}]};return {certificates:records};};
  const view=mountCertificates(window.document.querySelector('main'),{api,auth:{currentUser:{}},admin,show:html=>window.document.querySelector('#detail').innerHTML=html,notify:text=>window.document.querySelector('#notice').textContent=text});
  return {window,view,calls,api};
}
test('profile lists persisted achievements, previews details and escapes holder names',async t=>{
  const {window,view,calls}=setup();t.after(()=>{view.dispose();window.happyDOM.close();});await setImmediate();
  assert.equal(calls[0].path,'/certificates');assert.match(window.document.querySelector('main').textContent,/Networking/);assert.ok(window.document.querySelector('[aria-label="Earned achievement"]'));
  window.document.querySelector('[data-certificate]').click();await setImmediate();assert.match(window.document.querySelector('#detail').textContent,/Learner <name>/);assert.equal(window.document.querySelector('#detail name'),null);assert.ok(window.document.querySelector('[data-mode="print"]'));assert.ok(window.document.querySelector('[data-mode="download"]'));
});
test('certificate empty state and reloadable failures are visible',async t=>{
  const empty=setup({records:[]});t.after(()=>{empty.view.dispose();empty.window.happyDOM.close();});await setImmediate();assert.match(empty.window.document.querySelector('main').textContent,/haven't earned any certificates yet/);
  const failed=setup({failure:true});t.after(()=>{failed.view.dispose();failed.window.happyDOM.close();});await setImmediate();assert.match(failed.window.document.querySelector('[role=alert]').textContent,/Unavailable/);assert.ok(failed.window.document.querySelector('[data-reload]'));
});
test('admin filters certificates and sends an explicit revocation reason',async t=>{
  const {window,view,calls}=setup({admin:true});t.after(()=>{view.dispose();window.happyDOM.close();});await setImmediate();
  const input=window.document.querySelector('#certificate-search');input.value='missing';input.dispatchEvent(new window.Event('input'));assert.match(window.document.querySelector('tbody').textContent,/No certificates/);input.value='Networking';input.dispatchEvent(new window.Event('input'));
  window.document.querySelector('[data-certificate]').click();await setImmediate();assert.match(window.document.querySelector('#detail').textContent,/Provider unavailable/);
  const form=window.document.querySelector('#revoke-certificate');form.elements.reason.value='Incorrect completion';form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await setImmediate();
  const revoke=calls.find(c=>c.path.endsWith('/revoke'));assert.equal(revoke.options.body.reason,'Incorrect completion');assert.match(window.document.querySelector('#detail').textContent,/revoked/);
});
test('public verification displays only approved fields and handles unknown IDs',async t=>{
  const window=new Window();t.after(()=>window.happyDOM.close());const root=window.document.body;
  await renderCertificateVerification(root,async()=>({certificate:{...certificate,email:'private@example.com',uid:'private-uid'}}),'CERT-example');assert.match(root.textContent,/Valid certificate/);assert.doesNotMatch(root.textContent,/private@example.com|private-uid/);
  await renderCertificateVerification(root,async()=>{throw new Error('Certificate not found.');},'unknown');assert.match(root.textContent,/Certificate not found/);
});
