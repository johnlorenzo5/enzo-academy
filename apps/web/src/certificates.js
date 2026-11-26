import { escapeHtml as esc } from './course-builder.js';
const path=encodeURIComponent;
const date=value=>new Date(value).toLocaleDateString();
export function mountCertificates(root,{api,auth,admin=false,show,notify,onChanged=()=>{}}){
  let disposed=false,records=[],query='',status='all',from='',through='';
  const requests=new Map();
  const $=s=>root.querySelector(s);
  root.innerHTML='<p role="status">Loading certificates…</p>';
  const actions=c=>`<button class="btn secondary" data-certificate="${esc(c.id)}">View Certificate</button>${c.status==='valid'?`<button class="btn" data-pdf="${esc(c.id)}" data-mode="download">Download PDF</button>`:''}`;
  function render(){
    if(disposed)return;
    root.innerHTML=admin?`<h1>Certificate Management</h1><div class="filters certificate-filters"><label>Search user, module or ID<input id="certificate-search" type="search"></label><label>Status<select id="certificate-status"><option value="all">All statuses</option><option value="valid">Valid</option><option value="revoked">Revoked</option></select></label><label>Issued from<input id="certificate-from" type="date"></label><label>Issued through<input id="certificate-through" type="date"></label></div><div class="table-wrap"><table><thead><tr><th>User</th><th>Module</th><th>Issued</th><th>Certificate ID</th><th>Status</th><th>Email status</th><th>Actions</th></tr></thead><tbody id="certificate-results"></tbody></table></div>`:`<div class="section-head"><div><span class="eyebrow">YOUR ACHIEVEMENTS</span><h1>Certificates and Achievements</h1><p>Your certificates stay with your account.</p></div></div><div id="certificate-results" class="course-grid"></div>`;
    if(admin){$('#certificate-search').value=query;$('#certificate-status').value=status;$('#certificate-from').value=from;$('#certificate-through').value=through;
      $('#certificate-search').oninput=e=>{query=e.target.value;results();};$('#certificate-status').onchange=e=>{status=e.target.value;results();};$('#certificate-from').onchange=e=>{from=e.target.value;results();};$('#certificate-through').onchange=e=>{through=e.target.value;results();};}
    results();
  }
  function results(){
    const filtered=records.filter(c=>`${c.holderName} ${c.uid} ${c.moduleTitle} ${c.id}`.toLowerCase().includes(query.toLowerCase())&&(status==='all'||status===c.status)&&(!from||c.issuedAt.slice(0,10)>=from)&&(!through||c.issuedAt.slice(0,10)<=through));
    $('#certificate-results').innerHTML=admin?(filtered.length?filtered.map(c=>`<tr><td>${esc(c.holderName)}</td><td>${esc(c.moduleTitle)}</td><td>${esc(date(c.issuedAt))}</td><td class="certificate-id">${esc(c.id)}</td><td>${esc(c.status)}</td><td>${esc(c.email.status)}</td><td><button data-certificate="${esc(c.id)}">View details</button></td></tr>`).join(''):'<tr><td colspan="7">No certificates match these filters.</td></tr>'):(filtered.length?filtered.map(c=>`<article class="card"><div class="card-body"><span class="achievement-badge" aria-label="${c.status==='valid'?'Earned achievement':'Revoked achievement'}">${c.status==='valid'?'★':'×'}</span><h2>${esc(c.moduleTitle)}</h2><p>${esc(c.courseTitle)}</p><p>Completed ${esc(date(c.completedAt))} · ${esc(c.status)}</p><div class="certificate-actions">${actions(c)}</div></div></article>`).join(''):`<div class="empty"><p>You haven't earned any certificates yet. Complete a module to earn your first certificate!</p><a class="btn" href="#learning">My learning</a></div>`);
  }
  async function reload(){try{const result=await api(admin?'/admin/certificates':'/certificates');records=result.certificates??[];render();}catch(error){if(!disposed)root.innerHTML=`<p class="auth-error" role="alert">${esc(error.message)}</p><button data-reload>Try again</button>`;}}
  async function details(id){
    show('<p role="status">Loading certificate…</p>');
    try{const result=await api(`${admin?'/admin':''}/certificates/${path(id)}`);if(disposed)return;const c=result.certificate;
      show(`<span class="eyebrow">CERTIFICATE OF COMPLETION</span><h2>${esc(c.moduleTitle)}</h2><p>Awarded to ${esc(c.holderName)}</p><p>Completed: ${esc(date(c.completedAt))}<br>Issued: ${esc(date(c.issuedAt))}<br>Status: ${esc(c.status)}</p><p class="certificate-id">${esc(c.id)}</p>${c.status==='valid'?`<div class="certificate-actions"><button class="btn" data-pdf="${esc(c.id)}" data-mode="preview">Preview PDF</button><button class="btn secondary" data-pdf="${esc(c.id)}" data-mode="download">Download PDF</button><button class="btn secondary" data-pdf="${esc(c.id)}" data-mode="print">Print certificate</button></div>`:'<p>This certificate has been revoked.</p>'}<p><a href="${esc(c.verificationUrl)}">Verify certificate</a></p>${admin?`<h3>Email notification</h3><p>Status: ${esc(c.email.status)} · Attempts: ${c.email.attempts}</p><p>${esc(c.email.lastError??'')}${c.email.status==='accepted'?'Accepted by the email provider; inbox delivery is not confirmed.':''}${c.email.status==='not_configured'?'Configure RESEND_API_KEY, CERTIFICATE_EMAIL_FROM and PUBLIC_APP_URL on the API.':''}${c.email.status==='needs_review'?'The earlier send has an unknown outcome. Check the provider before requesting another notification.':''}</p>${c.status==='valid'?`<button class="btn secondary" data-resend="${esc(c.id)}">Resend notification</button><form id="revoke-certificate"><label class="field">Reason for revocation<textarea name="reason" required maxlength="1000"></textarea></label><button class="btn secondary">Revoke certificate</button></form>`:`<p>Revocation reason: ${esc(c.revocationReason)}</p>`}<h3>Issuance history</h3><ol>${(result.history??[]).sort((a,b)=>a.at.localeCompare(b.at)).map(h=>`<li>${esc(new Date(h.at).toLocaleString())} · ${esc(h.action)} · ${esc(h.detail)}</li>`).join('')}</ol>`:''}<p id="certificate-error" class="auth-error" role="alert"></p>`);
      const form=root.ownerDocument.querySelector('#revoke-certificate');
      if(form)form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await api(`/admin/certificates/${path(id)}/revoke`,{method:'POST',body:{reason:form.elements.reason.value}});await reload();await details(id);notify('Certificate revoked.');}catch(error){showError(error);}finally{button.disabled=false;}};
    }catch(error){show(`<p role="alert">${esc(error.message)}</p>`);}
  }
  function showError(error){const box=root.ownerDocument.querySelector('#certificate-error');if(box)box.textContent=error.message;else notify(error.message);}
  const urls=new Set();
  async function pdf(id,mode){
    const token=await auth.currentUser.getIdToken();
    const response=await fetch(`/api${admin?'/admin':''}/certificates/${path(id)}/pdf`,{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok){const result=await response.json();throw new Error(result.error||'Unable to load certificate.');}
    if(disposed)return;
    const url=URL.createObjectURL(await response.blob());urls.add(url);
    if(mode==='download'){const a=root.ownerDocument.createElement('a');a.href=url;a.download=`${id}.pdf`;a.click();}
    else {show('<h2>Certificate PDF</h2><p>Use the PDF viewer’s print control to print your certificate.</p><iframe class="certificate-preview" title="Certificate preview"></iframe>');root.ownerDocument.querySelector('.certificate-preview').src=url;}
  }
  async function click(event){
    const button=event.target.closest('button');if(!button)return;
    const id=button.dataset.certificate||button.dataset.pdf||button.dataset.resend;
    if(!id&&!button.hasAttribute('data-reload'))return;
    button.disabled=true;
    try{if(button.dataset.certificate)await details(id);
      if(button.hasAttribute('data-reload'))await reload();
      if(button.dataset.pdf)await pdf(id,button.dataset.mode);
      if(button.dataset.resend){const requestId=requests.get(id)??crypto.randomUUID();requests.set(id,requestId);const result=await api(`/admin/certificates/${path(id)}/resend`,{method:'POST',body:{requestId}});requests.delete(id);await reload();await details(id);notify(`Notification status: ${result.certificate.email.status}`);onChanged();}
    }catch(error){showError(error);}finally{button.disabled=false;}
  }
  root.ownerDocument.addEventListener('click',click);
  void reload();
  return {details,dispose(){disposed=true;root.ownerDocument.removeEventListener('click',click);for(const url of urls)URL.revokeObjectURL(url);}};
}

export async function renderCertificateVerification(root,api,id){
  root.innerHTML='<p role="status">Verifying certificate…</p>';
  try{const {certificate:c}=await api(`/certificates/verify/${path(id)}`);
    root.innerHTML=`<section class="empty"><span class="eyebrow">CERTIFICATE VERIFICATION</span><h1>${c.status==='valid'?'Valid certificate':'Revoked certificate'}</h1><h2>${esc(c.holderName)}</h2><p>${esc(c.moduleTitle)}</p><p>Completed: ${esc(date(c.completedAt))}<br>Issued: ${esc(date(c.issuedAt))}</p><p class="certificate-id">${esc(c.id)}</p><p>${esc(c.platformName)}</p></section>`;
  }catch(error){root.innerHTML=`<div class="empty"><h1>Unable to verify certificate</h1><p role="alert">${esc(error.message)}</p></div>`;}
}
