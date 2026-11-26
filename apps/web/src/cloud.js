import { renderExploreHero, renderLearningDashboard, renderHowItWorks } from './academy-pages.js';
import './academy-pages.css';
import { mountProfilePage } from './profile-page.js';
import { changeAccountEmail, signInWithGoogle } from './firebase.js';
import './profile.css';
import { createAccountMenu } from './account-menu.js';
import './style.css';
import './learning.css';
import { mountCertificates, renderCertificateVerification } from './certificates.js';
import { auth, api, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from './firebase.js';
import { escapeHtml as esc, mountCourseBuilder } from './course-builder.js';
import { lessonMarkup, collectResponses } from './lesson-player.js';
import { durationLabel, courseStatus } from '@enzo/domain';
import { mountLearningWorkspace } from './learning-workspace.js';

// JavaScript basics (variables): const keeps a binding fixed; let allows reassignment.
const $=selector=>document.querySelector(selector);
// Arrays: these lists hold the courses, enrollments, and learners used by the interface.
let account=null,courses=[],enrollments=[],learners=[],section='courses',loading=true,error='',authVersion=0;
let query='',category='All courses',level='All levels';
let pendingEnrollment=null,authSubmitting=false,lastAuthUid;
const path=id=>encodeURIComponent(id);
const certificateHash=prefix=>{const value=location.hash.slice(prefix.length);try{return decodeURIComponent(value);}catch{return value;}};
const date=value=>value?new Date(value).toLocaleString():'No limit';
let toastTimer;
let editing=false;
let disposeProfile;
let disposeLearning;
let certificateView;
const draftMemory=new Map();
const draftKey=(kind,id)=>`enzo:author-draft:v1:${auth.currentUser.uid}:${kind}:${id}`;
function readDraft(key){if(draftMemory.has(key))return draftMemory.get(key);try{return JSON.parse(localStorage.getItem(key));}catch{return undefined;}}
function writeDraft(key,value){
  draftMemory.set(key,value);
  try{localStorage.setItem(key,JSON.stringify(value));$('#draft-status').textContent='Draft saved on this device. Use Save to apply your changes.';}
  catch{$('#draft-status').textContent='Draft kept while this page is open. Browser storage is unavailable; save before refreshing or leaving.';}
}
function clearDraft(key){draftMemory.delete(key);try{localStorage.removeItem(key);}catch{}}
function draftNotice(restored){return `<p id="draft-status" class="muted" role="status">${restored?'Your unfinished draft has been restored.':'Your draft is saved on this device as you type.'} Use Save to apply your changes.</p>`;}
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function show(html){editing=false;$('#dialog').classList.remove('studio-dialog');$('#detail').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal();}
$('.close').onclick=()=>{pendingEnrollment=null;$('#dialog').close();};
$('#dialog').addEventListener('cancel',()=>{pendingEnrollment=null;});
$('#dialog').addEventListener('click',event=>{if(!editing&&event.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){pendingEnrollment=null;$('#dialog').close();}}});

async function refresh(){
  const version=++authVersion;
  loading=true;error='';render();
  try{
    const nextAccount=auth.currentUser?(await api('/me')).account:null;
    const admin=nextAccount?.role==='admin';
    const [catalog,learning,people]=await Promise.all([api(admin?'/admin/courses':'/courses'),nextAccount?api(admin?'/admin/enrollments':'/enrollments'):Promise.resolve({enrollments:[]}),admin?api('/admin/learners'):Promise.resolve({learners:[]})]);
    if(version!==authVersion)return;
    account=nextAccount;courses=catalog.courses;enrollments=learning.enrollments;learners=people.learners;
  }catch(problem){if(version!==authVersion)return;error=problem.message;account=null;courses=[];enrollments=[];learners=[];}
  loading=false;render();
}

function render(){
  disposeProfile?.();disposeProfile=undefined;
  disposeLearning?.();disposeLearning=undefined;
  certificateView?.dispose();certificateView=undefined;
  $('#main').classList.remove('learning-page','academy-page');
  $('footer small').textContent='Your academy · Progress saved to your account';
  $('#count').textContent=String(enrollments.length);
  accountMenu.update(auth.currentUser ? {name: account?.name || auth.currentUser.displayName || 'Your account', role: account?.role, photoURL: account?.profile?.photoURL || auth.currentUser.photoURL} : null);
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash===(location.hash||'#explore')));
  if(location.hash.startsWith('#verify/')){const host=document.createElement('div');$('#main').replaceChildren(host);void renderCertificateVerification(host,api,certificateHash('#verify/'));return;}
  if(loading){$('#main').innerHTML='<div class="empty" role="status"><h2>Loading your academy…</h2></div>';return;}
  if(error){$('#main').innerHTML=`<div class="empty"><h2>Unable to load the academy</h2><p class="auth-error" role="alert">${esc(error)}</p><button class="btn" id="retry">Try again</button></div>`;$('#retry').onclick=refresh;return;}
  if(location.hash==='#profile'||location.hash==='#history'||location.hash==='#achievements'||location.hash.startsWith('#certificate/')){
    if(!account){$('#main').innerHTML='<div class="empty"><h2>Log in to update your profile.</h2><button class="btn" id="profile-login">Log in</button></div>';$('#profile-login').onclick=()=>openAuth();return;}
    disposeProfile=mountProfilePage($('#main'),{account,enrollments:enrollments.filter(e=>!e.uid||e.uid===account.uid),onSave:async profile=>{
      const result=await api('/me/profile',{method:'PUT',body:profile});account=result.account;
      accountMenu.update({...account,photoURL:account.profile?.photoURL});
      return account;
    },onChangeEmail:openEmailChange,initialTab:location.hash==='#profile'?'profile':location.hash==='#history'?'history':'achievements',mountAchievements:host=>{
      const view=mountCertificates(host,{api,auth,show,notify});
      if(location.hash.startsWith('#certificate/'))void view.details(certificateHash('#certificate/'));
      return ()=>view.dispose();
    }});
    const profileHost=$('#main');
    api('/certificates').then(result=>{if(profileHost.classList.contains('profile-page')&&profileHost.querySelector('.profile-stat strong'))profileHost.querySelector('.profile-stat strong').textContent=String(result.certificates.filter(c=>c.status==='valid').length);}).catch(()=>{});
    return;
  }
  if(account?.role==='admin')return renderAdmin();
  if(location.hash.startsWith('#learn/')){
    let courseId,activityId;
    try{[,courseId,activityId]=location.hash.split('/').map(decodeURIComponent);}catch{location.hash='learning';return;}
    const enrollment=enrollments.find(e=>e.courseId===courseId);
    if(!account||!enrollment){$('#main').innerHTML='<div class="empty"><h2>Open a course from My learning.</h2><a class="btn" href="#learning">My learning</a></div>';return;}
    $('#main').classList.add('learning-page');
    disposeLearning=mountLearningWorkspace($('#main'),{enrollment,activityId,api,onUpdate:next=>{const previous=enrollments.find(e=>e.courseId===next.courseId);enrollments=enrollments.map(e=>e.courseId===next.courseId?next:e);if(Object.keys(next.certificates??{}).some(id=>!previous?.certificates?.[id]))notify('Module completed! Your certificate is ready in Certificates and Achievements.');},onNavigate:next=>{if(next===null){history.pushState(null,'','#learning');render();}else learn(courseId,next);}});
    return;
  }
  if(location.hash==='#how'){$('#main').classList.add('academy-page');$('#main').innerHTML=renderHowItWorks();return;}
  if(location.hash==='#learning'){
    if(!account){$('#main').innerHTML='<div class="empty"><h1>Your learning starts here.</h1><button class="btn" id="learning-login">Log in or create an account</button></div>';$('#learning-login').onclick=()=>openAuth();return;}
    $('#main').classList.add('academy-page');
    $('#main').innerHTML=renderLearningDashboard(account,enrollments,courses);return;
  }
  $('#main').classList.add('academy-page');
  $('#main').innerHTML=`${renderExploreHero()}<section id="catalog"><div class="section-head"><div><span class="eyebrow">FIND YOUR NEXT CHALLENGE</span><h2>Find your next <span class="academy-accent">spark.</span></h2><p id="results"></p></div><label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input id="search" aria-label="Search courses" type="search" placeholder="Search courses…" value="${esc(query)}"></label></div><div class="filters"><select id="category" aria-label="Course category">${['All courses',...new Set(courses.map(c=>c.category))].map(c=>`<option ${category===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select id="level" aria-label="Course difficulty">${['All levels','Beginner','Intermediate','Advanced'].map(l=>`<option ${level===l?'selected':''}>${l}</option>`).join('')}</select></div><div id="course-list" class="course-grid"></div></section>`;
  renderCards();$('#search').oninput=event=>{query=event.target.value;renderCards();};$('#category').onchange=event=>{category=event.target.value;renderCards();};$('#level').onchange=event=>{level=event.target.value;renderCards();};
}
function renderCards(){
  const filtered=courses.filter(c=>(category==='All courses'||c.category===category)&&(level==='All levels'||c.level===level)&&`${c.title} ${c.description} ${c.category}`.toLowerCase().includes(query.toLowerCase()));
  $('#results').textContent=`${filtered.length} courses to explore`;
  $('#course-list').innerHTML=filtered.length?filtered.map((c,index)=>`<article class="card" style="--card-order:${Math.min(index,8)}"><div class="art ${esc(c.color)}"><span class="level">${esc(c.level)}</span><span class="symbol">${esc(c.symbol)}</span></div><div class="card-body"><span class="category-label">${esc(c.category)}</span><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><div class="meta"><span>${esc(durationLabel(c))}</span><span>${c.topics.length} modules</span></div><div class="schedule">${esc(courseStatus(c))}</div><div class="card-bottom"><button data-course="${esc(c.id)}">View course ↗</button></div></div></article>`).join(''):'<div class="empty"><h3>No courses found</h3><p>Try another filter or check back for new courses.</p></div>';
}
function detail(id){
  const c=courses.find(c=>c.id===id);if(!c)return;
  const enrolled=enrollments.some(e=>e.courseId===id);
  show(`<span class="eyebrow">${esc(c.category)}</span><h2>${esc(c.title)}</h2><p>${esc(c.description)}</p><div class="details-grid"><div><small>Duration</small>${esc(durationLabel(c))}</div><div><small>Opens</small>${esc(date(c.enrollmentStart))}</div><div><small>Closes</small>${esc(date(c.enrollmentEnd))}</div></div><ol class="lessons">${c.topics.map((title,i)=>`<li><span>${i+1}</span>${esc(title)}</li>`).join('')}</ol>${enrolled?`<button class="btn wide" data-learn="${esc(id)}">Continue learning</button>`:`<button class="btn wide" data-enroll="${esc(id)}" ${courseStatus(c)!=='Enrollment Open'?'disabled':''}>${courseStatus(c)==='Enrollment Open'?'Enroll for free':esc(courseStatus(c))}</button>`}`);
}
function authMessage(problem){return ({'auth/invalid-credential':'The email or password is incorrect.','auth/email-already-in-use':'This email already has an account.','auth/weak-password':'Use a stronger password (at least 8 characters).','auth/operation-not-allowed':'This sign-in method is not enabled. Please use another option.','auth/popup-closed-by-user':'Google sign-in was cancelled. Try again or use your email.','auth/cancelled-popup-request':'Another sign-in window is already open.','auth/popup-blocked':'Allow pop-ups for this site, then try Continue with Google again.','auth/unauthorized-domain':'Google sign-in is not configured for this website address. Please use email for now.','auth/account-exists-with-different-credential':'This email already uses another sign-in method. Please sign in with that method.','auth/too-many-requests':'Too many attempts. Please try again later.','auth/network-request-failed':'Unable to connect. Check your internet connection.'})[problem.code]||problem.message;}
function openAuth(register=false){
  show(`<span class="eyebrow">YOUR LEARNING ACCOUNT</span><h2>${register?'Create an account':'Welcome back'}</h2><form id="cloud-auth">${register?'<label class="field">Name<input name="name" required maxlength="60" autocomplete="name"></label>':''}<label class="field">Email<input name="email" type="email" required autocomplete="username"></label><label class="field">Password<input name="password" type="password" ${register?'minlength="8"':''} required autocomplete="${register?'new-password':'current-password'}"></label><p id="auth-error" class="auth-error" role="alert"></p><button class="btn wide">${register?'Create account':'Log in'}</button></form><div class="auth-switch"><button id="auth-switch">${register?'Already have an account? Log in':'Create an account'}</button>${register?'':'<button id="reset-password">Forgot password?</button>'}</div>`);
  $('#auth-switch').onclick=()=>openAuth(!register);
  const form=$('#cloud-auth');
  form.insertAdjacentHTML('beforebegin', `<button type="button" class="google-signin" id="google-signin"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.04 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.77 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg><span>Continue with Google</span></button><p id="google-auth-error" class="auth-error google-auth-error" role="alert"></p><div class="auth-divider"><span>or continue with email</span></div>`);
  const googleButton=$('#google-signin');
  async function authenticateAndContinue(authenticate, button, errorBox){
    if(authSubmitting)return;
    authSubmitting=true;
    const controls=[form.querySelector('button'),$('#auth-switch'),googleButton];
    const label=button.innerHTML;
    controls.forEach(control=>control.disabled=true);
    $('#auth-error').textContent='';$('#google-auth-error').textContent='';
    button.setAttribute('aria-busy','true');
    try{
      await authenticate();
      lastAuthUid=auth.currentUser?.uid??null;
      await refresh();
      if(!account)throw new Error(error||'Unable to load your account. Please try again.');
      const courseId=pendingEnrollment;
      if(courseId && account.role!=='admin'){
        button.textContent='Enrolling...';
        try{
          await enrollCourse(courseId);
          pendingEnrollment=null;learn(courseId);
          notify('You are enrolled! Your course is ready.');
        }catch(problem){
          detail(courseId);
          const message=document.createElement('p');message.id='enrollment-error';message.className='auth-error';message.setAttribute('role','alert');message.textContent=problem.message;
          $('#detail').append(message);
        }
      }else{
        pendingEnrollment=null;$('#dialog').close();
        if(account.role==='admin'){location.hash='admin';render();}
      }
    }catch(problem){errorBox.textContent=authMessage(problem);}
    finally{authSubmitting=false;controls.forEach(control=>control.disabled=false);button.innerHTML=label;button.removeAttribute('aria-busy');}
  }
  googleButton.onclick=()=>authenticateAndContinue(()=>signInWithGoogle(),googleButton,$('#google-auth-error'));
  form.onsubmit=async event=>{
    event.preventDefault();
    await authenticateAndContinue(async()=>{
      const email=form.elements.email.value.trim(),password=form.elements.password.value;
      if(register){
        const name=form.elements.name.value.trim();if(!name)throw new Error('Enter your name.');
        const result=await createUserWithEmailAndPassword(auth,email,password);
        await updateProfile(result.user,{displayName:name});await result.user.getIdToken(true);
      }else await signInWithEmailAndPassword(auth,email,password);
    },form.querySelector('button'),form.querySelector('#auth-error'));
  };
  if($('#reset-password'))$('#reset-password').onclick=async()=>{const form=$('#cloud-auth');const email=form.elements.email.value.trim();if(!email){form.querySelector('#auth-error').textContent='Enter your email above first.';return;}try{await sendPasswordResetEmail(auth,email);notify('If an account exists, a password reset email will be sent.');}catch(problem){form.querySelector('#auth-error').textContent=authMessage(problem);}};
}
const accountMenu = createAccountMenu($('#profile'), {
  onLogout: () => signOut(auth),
  onProfile: () => { if(location.hash==='#profile')render();else location.hash='profile'; },
});
$('#profile').onclick=()=>{
  if(!auth.currentUser)return openAuth();
  accountMenu.open();
};

function openEmailChange(){
  show('<h2>Change email</h2><p>Verify your current password, then check your new email for a confirmation link.</p><form id="change-email-form"><label class="field">New email<input name="email" type="email" required autocomplete="email" maxlength="254"></label><label class="field">Current password<input name="password" type="password" required autocomplete="current-password" maxlength="128"></label><p id="email-change-error" class="auth-error" role="alert"></p><button class="btn wide">Send verification email</button></form>');
  $('#change-email-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button');submit.disabled=true;
    try{await changeAccountEmail(form.elements.email.value.trim(),form.elements.password.value);form.reset();$('#dialog').close();notify('Verification sent. Open the link in your new email, then log in again.');}
    catch(problem){form.querySelector('[role=alert]').textContent=authMessage(problem);}
    finally{submit.disabled=false;}
  };
}

async function enrollCourse(id){
  const uid=auth.currentUser?.uid;
  const result=await api(`/courses/${path(id)}/enroll`,{method:'POST'});
  if(!uid||auth.currentUser?.uid!==uid)throw new Error('Your session changed. Please log in again.');
  enrollments=[...enrollments.filter(e=>e.courseId!==result.enrollment.courseId),result.enrollment];
  return result.enrollment;
}

function learn(id,activityId){
  $('#dialog').close();
  history.pushState(null,'',`#learn/${encodeURIComponent(id)}${activityId?'/'+encodeURIComponent(activityId):''}`);
  render();
}

function renderAdmin(){
  let content='';
  if(section==='certificates')content='<div id="certificate-management"></div>';
  if(section==='courses')content=`<div class="section-head"><div><h1>Manage courses</h1><p>Create courses, modules, and quizzes for your learners.</p></div><button class="btn" data-edit="new">Add course</button></div>${courses.length?`<div class="table-wrap"><table><thead><tr><th>Course</th><th>Modules</th><th>Availability</th><th>Actions</th></tr></thead><tbody>${courses.map(c=>`<tr><td>${esc(c.title)}</td><td>${c.modules.length}</td><td>${esc(courseStatus(c))}</td><td class="table-actions"><button data-studio="${esc(c.id)}">Modules & quizzes</button><button data-edit="${esc(c.id)}">Edit</button><button class="danger-link" data-archive="${esc(c.id)}">Archive</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h2>Your academy is ready for its first course.</h2><p>Add a course above, then build its lessons and quizzes.</p></div>'}`;
  if(section==='enrollments')content=`<h1>Enrollments</h1><div class="table-wrap"><table><thead><tr><th>Learner</th><th>Course</th><th>Progress</th><th>Status</th><th>Latest quiz scores</th><th></th></tr></thead><tbody>${enrollments.map(e=>`<tr><td>${esc(learners.find(l=>l.uid===e.uid)?.email||e.uid)}</td><td>${esc(e.courseTitle)}</td><td>${e.done.length}/${e.curriculum.length}</td><td>${esc(e.status)}</td><td>${Object.values(e.quizAttempts).map(a=>`${a.earned}/${a.possible}`).join(', ')||'No attempts'}</td><td>${e.status!=='Cancelled'?`<button class="danger-link" data-cancel="${esc(e.courseId)}" data-uid="${esc(e.uid)}">Cancel access</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  if(section==='learners')content=`<h1>Learners</h1><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead><tbody>${learners.map(l=>`<tr><td>${esc(l.name)}</td><td>${esc(l.email)}</td><td>${esc(date(l.createdAt))}</td></tr>`).join('')}</tbody></table></div>`;
  $('#main').innerHTML=`<div class="admin-shell"><span class="eyebrow">ADMINISTRATION</span><div class="stats"><div class="stat"><strong>${courses.length}</strong>Courses</div><div class="stat"><strong>${enrollments.length}</strong>Enrollments</div><div class="stat"><strong>${learners.length}</strong>Accounts</div></div><div class="admin-tabs">${['courses','enrollments','learners','certificates'].map(s=>`<button class="chip ${section===s?'active':''}" data-section="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}</div>${content}</div>`;
  if(section==='certificates')certificateView=mountCertificates($('#certificate-management'),{api,auth,admin:true,show,notify});
}
function studio(id){
  const key=draftKey('modules',id),saved=readDraft(key);
  const course=saved?.course??courses.find(c=>c.id===id);
  show(`${draftNotice(!!saved)}<div id="course-studio"></div>`);editing=true;$('#dialog').classList.add('studio-dialog');
  mountCourseBuilder($('#course-studio'),{...course,modules:saved?.modules??course.modules},{
    restored:!!saved,initialSelected:saved?.selected??0,
    onChange:(modules,selected)=>writeDraft(key,{course,modules,selected}),
    onCancel:()=>{clearDraft(key);$('#dialog').close();},
    onSave:async modules=>{await api(`/admin/courses/${path(id)}`,{method:'PUT',body:{...course,modules}});clearDraft(key);$('#dialog').close();await refresh();notify('Modules and quizzes saved.');}
  });
}
function editCourse(id){
  const key=draftKey('course',id),saved=readDraft(key);
  const course=saved?saved.course:courses.find(c=>c.id===id);
  const localDate=value=>{if(!value)return '';const d=new Date(value);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
  show(`<h2>${course?'Edit course':'Add course'}</h2><form id="course-form"><label class="field">Title<input name="title" required maxlength="100" value="${esc(course?.title||'')}"></label><label class="field">Category<input name="category" required maxlength="60" value="${esc(course?.category||'')}"></label><label class="field">Description<textarea name="description" required maxlength="400">${esc(course?.description||'')}</textarea></label><label class="field">Level<select name="level">${['Beginner','Intermediate','Advanced'].map(l=>`<option ${course?.level===l?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Duration<input name="durationValue" type="number" required min="1" max="10000" value="${course?.durationValue||4}"></label><label class="field">Unit<select name="durationUnit">${['days','weeks','months'].map(unit=>`<option ${(course?.durationUnit||'weeks')===unit?'selected':''}>${unit}</option>`).join('')}</select></label><label class="field">Enrollment opens<input name="enrollmentStart" type="datetime-local" value="${localDate(course?.enrollmentStart)}"></label><label class="field">Enrollment closes<input name="enrollmentEnd" type="datetime-local" value="${localDate(course?.enrollmentEnd)}"></label><label class="field">Availability<select name="active"><option value="true">Active</option><option value="false" ${!course||course.active===false?'selected':''}>Inactive</option></select></label><p class="muted">New courses start inactive. Add your modules and quizzes before opening enrollment.</p><p id="course-error" class="auth-error" role="alert"></p><button class="btn wide">Save course</button></form>`);
  editing=true;
  const draftForm=$('#course-form');
  draftForm.insertAdjacentHTML('beforebegin',draftNotice(!!saved));
  if(saved?.fields)for(const [name,value] of Object.entries(saved.fields)){if(draftForm.elements.namedItem(name))draftForm.elements.namedItem(name).value=value;}
  const remember=()=>writeDraft(key,{course:course??null,fields:Object.fromEntries(new FormData(draftForm))});
  draftForm.addEventListener('input',remember);draftForm.addEventListener('change',remember);
  draftForm.insertAdjacentHTML('beforeend','<button type="button" class="btn secondary" id="discard-course-draft">Discard draft</button>');
  $('#discard-course-draft').onclick=()=>{if(confirm('Discard this unfinished course draft?')){clearDraft(key);$('#dialog').close();}};
  $('#course-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,fields=form.elements,button=form.querySelector('button');button.disabled=true;
    try{
      const data={...course,title:fields.title.value.trim(),category:fields.category.value.trim(),description:fields.description.value.trim(),level:fields.level.value,durationValue:Number(fields.durationValue.value),durationUnit:fields.durationUnit.value,active:fields.active.value==='true',enrollmentStart:fields.enrollmentStart.value?new Date(fields.enrollmentStart.value).toISOString():null,enrollmentEnd:fields.enrollmentEnd.value?new Date(fields.enrollmentEnd.value).toISOString():null,modules:course?.modules??[{id:crypto.randomUUID(),title:'Introduction',content:'Welcome to this course. Add your lesson content in Modules & quizzes.',exercise:'',passPercent:100,questions:[]}]};
      await api(course?`/admin/courses/${path(id)}`:'/admin/courses',{method:course?'PUT':'POST',body:data});clearDraft(key);$('#dialog').close();await refresh();notify('Course saved.');
    }catch(problem){form.querySelector('#course-error').textContent=problem.message;}finally{button.disabled=false;}
  };
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try{
    if(button.dataset.course)detail(button.dataset.course);
    if(button.dataset.learn)learn(button.dataset.learn);
    if(button.dataset.enroll){
      if(!account){pendingEnrollment=button.dataset.enroll;return openAuth();}
      const label=button.textContent;button.disabled=true;button.textContent='Enrolling…';
      let errorBox=$('#enrollment-error');
      if(!errorBox){errorBox=document.createElement('p');errorBox.id='enrollment-error';errorBox.className='auth-error';errorBox.setAttribute('role','alert');button.before(errorBox);}
      errorBox.textContent='';
      try{
        await enrollCourse(button.dataset.enroll);
        if(pendingEnrollment===button.dataset.enroll){pendingEnrollment=null;learn(button.dataset.enroll);notify('You are enrolled! Your course is ready.');}
        else{$('#dialog').close();location.hash='learning';render();notify('You are enrolled! Your course is in My learning.');}
      }catch(problem){errorBox.textContent=problem.message;}
      finally{button.textContent=label;}
    }
    if(account?.role==='admin'){
      if(button.dataset.section){section=button.dataset.section;render();}
      if(button.dataset.edit)editCourse(button.dataset.edit);
      if(button.dataset.studio)studio(button.dataset.studio);
      if(button.dataset.archive&&confirm('Archive this course? Existing enrollments retain their content.')){await api(`/admin/courses/${path(button.dataset.archive)}`,{method:'DELETE'});await refresh();}
      if(button.dataset.cancel&&confirm('Cancel this learner’s course access?')){await api(`/admin/enrollments/${path(button.dataset.uid)}/${path(button.dataset.cancel)}/cancel`,{method:'POST'});await refresh();}
    }
  }catch(problem){notify(problem.message);}finally{button.disabled=false;}
});
window.addEventListener('hashchange',()=>{
  if(location.hash==='#catalog'){
    if(!$('#catalog'))render();
    $('#catalog')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }else{render();window.scrollTo({top:0,left:0,behavior:'auto'});}
});
onAuthStateChanged(auth,()=>{
  const uid=auth.currentUser?.uid??null;
  if(authSubmitting||uid===lastAuthUid){lastAuthUid=uid;return;}
  lastAuthUid=uid;
  if(!uid)pendingEnrollment=null;
  account=null;courses=[];enrollments=[];learners=[];$('#dialog').close();void refresh();
});
render();
