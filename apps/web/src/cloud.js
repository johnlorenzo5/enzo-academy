import './style.css';
import { auth, api, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from './firebase.js';
import { escapeHtml as esc, mountCourseBuilder } from './course-builder.js';
import { lessonMarkup, collectResponses } from './lesson-player.js';
import { durationLabel, courseStatus } from '@enzo/domain';

const $=selector=>document.querySelector(selector);
let account=null,courses=[],enrollments=[],learners=[],section='courses',loading=true,error='',authVersion=0;
let query='',category='All courses',level='All levels';
const path=id=>encodeURIComponent(id);
const date=value=>value?new Date(value).toLocaleString():'No limit';
let toastTimer;
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function show(html){$('#dialog').classList.remove('studio-dialog');$('#detail').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal();}
$('.close').onclick=()=>$('#dialog').close();
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('#dialog').close();}});

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
  $('#count').textContent=enrollments.length;
  $('#profile').textContent=auth.currentUser?'Account':'Log in';$('#profile').classList.add('signed-out');$('#profile').setAttribute('aria-label',auth.currentUser?'Open account':'Log in');
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash===(location.hash||'#explore')));
  if(loading){$('#main').innerHTML='<div class="empty" role="status"><h2>Loading your academy…</h2></div>';return;}
  if(error){$('#main').innerHTML=`<div class="empty"><h2>Unable to load the academy</h2><p class="auth-error" role="alert">${esc(error)}</p><button class="btn" id="retry">Try again</button></div>`;$('#retry').onclick=refresh;return;}
  if(account?.role==='admin')return renderAdmin();
  if(location.hash==='#how'){$('#main').innerHTML='<div class="section-head"><div><span class="eyebrow">LEARN AT YOUR PACE</span><h1>Learn. Practice. Progress.</h1><p>Choose a course, read its modules, and complete the practice exercises or quizzes. Your account keeps your progress across devices.</p></div></div><div class="steps"><article><b>01</b><h3>Enroll</h3><p>Check the course duration and enrollment dates.</p></article><article><b>02</b><h3>Practice</h3><p>Read each lesson and complete its exercises or quiz.</p></article><article><b>03</b><h3>Complete</h3><p>Finish every module before your personal access period ends. Completed courses remain available for review.</p></article></div>';return;}
  if(location.hash==='#learning'){
    if(!account){$('#main').innerHTML='<div class="empty"><h1>Your learning starts here.</h1><button class="btn" id="learning-login">Log in or create an account</button></div>';$('#learning-login').onclick=()=>openAuth();return;}
    $('#main').innerHTML=`<div class="section-head"><div><span class="eyebrow">YOUR NEXT CHAPTER</span><h1>My learning</h1><p>Welcome, ${esc(account.name)}.</p></div></div><div class="course-grid">${enrollments.length?enrollments.map(e=>`<article class="card"><div class="card-body"><h3>${esc(e.courseTitle)}</h3><p>${esc(e.status)} · ${e.done.length}/${e.curriculum.length} modules completed</p><progress value="${e.done.length}" max="${e.curriculum.length}" aria-label="Course progress"></progress><p>Access ends: ${esc(date(e.expiresAt))}</p><button class="btn" data-learn="${esc(e.courseId)}">${e.status==='Completed'?'Review course':'Continue learning'}</button></div></article>`).join(''):'<div class="empty"><h2>No enrollments yet</h2><a class="btn" href="#explore">Explore courses</a></div>'}</div>`;return;
  }
  $('#main').innerHTML=`<section class="hero"><div class="hero-copy"><span class="eyebrow">BIG POSSIBILITIES. NO PREREQUISITES.</span><h1>Your next chapter<br>starts with a skill.</h1><p>Practical technology courses for curious minds. Learn by doing and build what’s next.</p><a class="btn" href="#catalog">Explore courses ↗</a></div><div class="hero-art"><div class="orbit"></div><div class="code-card"><div class="dots">● ● ●</div><pre>const yourFuture = {<br>  curiosity: true,<br>  possibilities: 'endless'<br>};<br><br>startLearning(yourFuture);</pre></div><div class="js-badge">JS</div></div></section><section id="catalog"><div class="section-head"><div><span class="eyebrow">FIND YOUR NEXT CHALLENGE</span><h2>Explore courses</h2><p id="results"></p></div><label class="search"><input id="search" aria-label="Search courses" type="search" placeholder="Search courses…" value="${esc(query)}"></label></div><div class="filters"><select id="category" aria-label="Course category">${['All courses',...new Set(courses.map(c=>c.category))].map(c=>`<option ${category===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select id="level" aria-label="Course difficulty">${['All levels','Beginner','Intermediate','Advanced'].map(l=>`<option ${level===l?'selected':''}>${l}</option>`).join('')}</select></div><div id="course-list" class="course-grid"></div></section>`;
  renderCards();$('#search').oninput=event=>{query=event.target.value;renderCards();};$('#category').onchange=event=>{category=event.target.value;renderCards();};$('#level').onchange=event=>{level=event.target.value;renderCards();};
}
function renderCards(){
  const filtered=courses.filter(c=>(category==='All courses'||c.category===category)&&(level==='All levels'||c.level===level)&&`${c.title} ${c.description} ${c.category}`.toLowerCase().includes(query.toLowerCase()));
  $('#results').textContent=`${filtered.length} courses to explore`;
  $('#course-list').innerHTML=filtered.length?filtered.map(c=>`<article class="card"><div class="art ${esc(c.color)}"><span class="level">${esc(c.level)}</span><span class="symbol">${esc(c.symbol)}</span></div><div class="card-body"><span class="category-label">${esc(c.category)}</span><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><div class="meta"><span>${esc(durationLabel(c))}</span><span>${c.topics.length} modules</span></div><div class="schedule">${esc(courseStatus(c))}</div><div class="card-bottom"><button data-course="${esc(c.id)}">View course ↗</button></div></div></article>`).join(''):'<div class="empty"><h3>No courses found</h3><p>Try another filter or check back for new courses.</p></div>';
}
function detail(id){
  const c=courses.find(c=>c.id===id);if(!c)return;
  const enrolled=enrollments.some(e=>e.courseId===id);
  show(`<span class="eyebrow">${esc(c.category)}</span><h2>${esc(c.title)}</h2><p>${esc(c.description)}</p><div class="details-grid"><div><small>Duration</small>${esc(durationLabel(c))}</div><div><small>Opens</small>${esc(date(c.enrollmentStart))}</div><div><small>Closes</small>${esc(date(c.enrollmentEnd))}</div></div><ol class="lessons">${c.topics.map((title,i)=>`<li><span>${i+1}</span>${esc(title)}</li>`).join('')}</ol>${enrolled?`<button class="btn wide" data-learn="${esc(id)}">Continue learning</button>`:`<button class="btn wide" data-enroll="${esc(id)}" ${courseStatus(c)!=='Enrollment Open'?'disabled':''}>${courseStatus(c)==='Enrollment Open'?'Enroll for free':esc(courseStatus(c))}</button>`}`);
}
function authMessage(problem){return ({'auth/invalid-credential':'The email or password is incorrect.','auth/email-already-in-use':'This email already has an account.','auth/weak-password':'Use a stronger password (at least 8 characters).','auth/operation-not-allowed':'Enable Email/Password in Firebase Authentication.','auth/too-many-requests':'Too many attempts. Please try again later.','auth/network-request-failed':'Unable to connect. Check your internet connection.'})[problem.code]||problem.message;}
function openAuth(register=false){
  show(`<span class="eyebrow">YOUR LEARNING ACCOUNT</span><h2>${register?'Create an account':'Welcome back'}</h2><form id="cloud-auth">${register?'<label class="field">Name<input name="name" required maxlength="60" autocomplete="name"></label>':''}<label class="field">Email<input name="email" type="email" required autocomplete="username"></label><label class="field">Password<input name="password" type="password" ${register?'minlength="8"':''} required autocomplete="${register?'new-password':'current-password'}"></label><p id="auth-error" class="auth-error" role="alert"></p><button class="btn wide">${register?'Create account':'Log in'}</button></form><div class="auth-switch"><button id="auth-switch">${register?'Already have an account? Log in':'Create an account'}</button>${register?'':'<button id="reset-password">Forgot password?</button>'}</div>`);
  $('#auth-switch').onclick=()=>openAuth(!register);
  $('#cloud-auth').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;
    const email=form.elements.email.value.trim(),password=form.elements.password.value;
    try{
      if(register){const name=form.elements.name.value.trim();if(!name)throw new Error('Enter your name.');const result=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(result.user,{displayName:name});await result.user.getIdToken(true);await refresh();}
      else await signInWithEmailAndPassword(auth,email,password);
      $('#dialog').close();
    }catch(problem){form.querySelector('#auth-error').textContent=authMessage(problem);}finally{button.disabled=false;}
  };
  if($('#reset-password'))$('#reset-password').onclick=async()=>{const form=$('#cloud-auth');const email=form.elements.email.value.trim();if(!email){form.querySelector('#auth-error').textContent='Enter your email above first.';return;}try{await sendPasswordResetEmail(auth,email);notify('If an account exists, a password reset email will be sent.');}catch(problem){form.querySelector('#auth-error').textContent=authMessage(problem);}};
}
$('#profile').onclick=()=>{
  if(!auth.currentUser)return openAuth();
  show(`<h2>${esc(auth.currentUser.displayName||'Your account')}</h2><p>${esc(auth.currentUser.email)}</p><button class="btn wide" id="logout">Log out</button>`);
  $('#logout').onclick=async()=>{await signOut(auth);$('#dialog').close();};
};

function learn(id,index){
  const e=enrollments.find(e=>e.courseId===id);if(!e)return;
  if(['Expired','Cancelled'].includes(e.status)){show(`<h2>${esc(e.status)} enrollment</h2><p>Your access to this course has ended.</p>`);return;}
  let i=index??e.curriculum.findIndex((_,n)=>!e.done.includes(n));if(i<0)i=0;
  const m=e.curriculum[i];
  show(`<span class="eyebrow">${esc(e.courseTitle)}</span><h2>${esc(m.title)}</h2><p>${e.done.length}/${e.curriculum.length} modules completed</p><label class="field">Module<select id="module">${e.curriculum.map((m,n)=>`<option value="${n}" ${n===i?'selected':''}>${e.done.includes(n)?'✓ ':''}${n+1}. ${esc(m.title)}</option>`).join('')}</select></label>${lessonMarkup(m,e.quizAttempts[m.id])}`);
  $('#module').onchange=event=>learn(id,Number(event.target.value));
  const form=$('#quiz-form')||$('#exercise');if($('#notes'))$('#notes').value=e.notes[i]||'';
  const errorBox=document.createElement('p');errorBox.className='auth-error';errorBox.setAttribute('role','alert');form.append(errorBox);
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;errorBox.textContent='';
    try{
      const body=m.questions.length?{responses:collectResponses(m,form)}:{notes:$('#notes').value.trim()};
      const result=await api(`/enrollments/${path(id)}/modules/${path(m.id)}/submit`,{method:'POST',body});
      enrollments=enrollments.map(item=>item.courseId===id?result.enrollment:item);render();learn(id,i);notify('Your submission is saved.');
    }catch(problem){errorBox.textContent=problem.message;}finally{button.disabled=false;}
  };
}

function renderAdmin(){
  let content='';
  if(section==='courses')content=`<div class="section-head"><div><h1>Manage courses</h1><p>Create courses, modules, and quizzes for your learners.</p></div><button class="btn" data-edit="new">Add course</button></div>${courses.length?`<div class="table-wrap"><table><thead><tr><th>Course</th><th>Modules</th><th>Availability</th><th>Actions</th></tr></thead><tbody>${courses.map(c=>`<tr><td>${esc(c.title)}</td><td>${c.modules.length}</td><td>${esc(courseStatus(c))}</td><td class="table-actions"><button data-studio="${esc(c.id)}">Modules & quizzes</button><button data-edit="${esc(c.id)}">Edit</button><button class="danger-link" data-archive="${esc(c.id)}">Archive</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h2>Your academy is ready for its first course.</h2><p>Add a course above, then build its lessons and quizzes.</p></div>'}`;
  if(section==='enrollments')content=`<h1>Enrollments</h1><div class="table-wrap"><table><thead><tr><th>Learner</th><th>Course</th><th>Progress</th><th>Status</th><th>Latest quiz scores</th><th></th></tr></thead><tbody>${enrollments.map(e=>`<tr><td>${esc(learners.find(l=>l.uid===e.uid)?.email||e.uid)}</td><td>${esc(e.courseTitle)}</td><td>${e.done.length}/${e.curriculum.length}</td><td>${esc(e.status)}</td><td>${Object.values(e.quizAttempts).map(a=>`${a.earned}/${a.possible}`).join(', ')||'No attempts'}</td><td>${e.status!=='Cancelled'?`<button class="danger-link" data-cancel="${esc(e.courseId)}" data-uid="${esc(e.uid)}">Cancel access</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  if(section==='learners')content=`<h1>Learners</h1><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead><tbody>${learners.map(l=>`<tr><td>${esc(l.name)}</td><td>${esc(l.email)}</td><td>${esc(date(l.createdAt))}</td></tr>`).join('')}</tbody></table></div>`;
  $('#main').innerHTML=`<div class="admin-shell"><span class="eyebrow">ADMINISTRATION</span><div class="stats"><div class="stat"><strong>${courses.length}</strong>Courses</div><div class="stat"><strong>${enrollments.length}</strong>Enrollments</div><div class="stat"><strong>${learners.length}</strong>Accounts</div></div><div class="admin-tabs">${['courses','enrollments','learners'].map(s=>`<button class="chip ${section===s?'active':''}" data-section="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}</div>${content}</div>`;
}
function studio(id){
  const course=courses.find(c=>c.id===id);show('<div id="course-studio"></div>');$('#dialog').classList.add('studio-dialog');
  mountCourseBuilder($('#course-studio'),course,{onCancel:()=>$('#dialog').close(),onSave:async modules=>{await api(`/admin/courses/${path(id)}`,{method:'PUT',body:{...course,modules}});$('#dialog').close();await refresh();notify('Modules and quizzes saved.');}});
}
function editCourse(id){
  const course=courses.find(c=>c.id===id);
  const localDate=value=>{if(!value)return '';const d=new Date(value);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
  show(`<h2>${course?'Edit course':'Add course'}</h2><form id="course-form"><label class="field">Title<input name="title" required maxlength="100" value="${esc(course?.title||'')}"></label><label class="field">Category<input name="category" required maxlength="60" value="${esc(course?.category||'')}"></label><label class="field">Description<textarea name="description" required maxlength="400">${esc(course?.description||'')}</textarea></label><label class="field">Level<select name="level">${['Beginner','Intermediate','Advanced'].map(l=>`<option ${course?.level===l?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Duration<input name="durationValue" type="number" required min="1" max="10000" value="${course?.durationValue||4}"></label><label class="field">Unit<select name="durationUnit">${['days','weeks','months'].map(unit=>`<option ${(course?.durationUnit||'weeks')===unit?'selected':''}>${unit}</option>`).join('')}</select></label><label class="field">Enrollment opens<input name="enrollmentStart" type="datetime-local" value="${localDate(course?.enrollmentStart)}"></label><label class="field">Enrollment closes<input name="enrollmentEnd" type="datetime-local" value="${localDate(course?.enrollmentEnd)}"></label><label class="field">Availability<select name="active"><option value="true">Active</option><option value="false" ${!course||course.active===false?'selected':''}>Inactive</option></select></label><p class="muted">New courses start inactive. Add your modules and quizzes before opening enrollment.</p><p id="course-error" class="auth-error" role="alert"></p><button class="btn wide">Save course</button></form>`);
  $('#course-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,fields=form.elements,button=form.querySelector('button');button.disabled=true;
    try{
      const data={...course,title:fields.title.value.trim(),category:fields.category.value.trim(),description:fields.description.value.trim(),level:fields.level.value,durationValue:Number(fields.durationValue.value),durationUnit:fields.durationUnit.value,active:fields.active.value==='true',enrollmentStart:fields.enrollmentStart.value?new Date(fields.enrollmentStart.value).toISOString():null,enrollmentEnd:fields.enrollmentEnd.value?new Date(fields.enrollmentEnd.value).toISOString():null,modules:course?.modules??[{id:crypto.randomUUID(),title:'Introduction',content:'Welcome to this course. Add your lesson content in Modules & quizzes.',exercise:'',passPercent:100,questions:[]}]};
      await api(course?`/admin/courses/${path(id)}`:'/admin/courses',{method:course?'PUT':'POST',body:data});$('#dialog').close();await refresh();notify('Course saved.');
    }catch(problem){form.querySelector('#course-error').textContent=problem.message;}finally{button.disabled=false;}
  };
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try{
    if(button.dataset.course)detail(button.dataset.course);
    if(button.dataset.learn)learn(button.dataset.learn);
    if(button.dataset.enroll){if(!account)return openAuth();button.disabled=true;await api(`/courses/${path(button.dataset.enroll)}/enroll`,{method:'POST'});$('#dialog').close();location.hash='learning';await refresh();}
    if(account?.role==='admin'){
      if(button.dataset.section){section=button.dataset.section;render();}
      if(button.dataset.edit)editCourse(button.dataset.edit);
      if(button.dataset.studio)studio(button.dataset.studio);
      if(button.dataset.archive&&confirm('Archive this course? Existing enrollments retain their content.')){await api(`/admin/courses/${path(button.dataset.archive)}`,{method:'DELETE'});await refresh();}
      if(button.dataset.cancel&&confirm('Cancel this learner’s course access?')){await api(`/admin/enrollments/${path(button.dataset.uid)}/${path(button.dataset.cancel)}/cancel`,{method:'POST'});await refresh();}
    }
  }catch(problem){notify(problem.message);}finally{button.disabled=false;}
});
window.addEventListener('hashchange',()=>{if(location.hash==='#catalog')$('#catalog')?.scrollIntoView({behavior:'smooth'});else render();});
onAuthStateChanged(auth,()=>{account=null;courses=[];enrollments=[];learners=[];$('#dialog').close();refresh();});
render();
