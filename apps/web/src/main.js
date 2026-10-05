import { moduleCount } from '@enzo/domain';
import { modulesFor, mountCourseBuilder } from './course-builder.js';
import { lessonMarkup, readQuiz } from './lesson-player.js';
import { courses as seedCourses, lessons as seedLessons } from '@enzo/catalog';
import { durationOf, durationLabel, instant, expirationFor, enrollmentEnd, courseStatus, enrollmentStatus, normalizeEnrollment } from '@enzo/domain';
import './style.css';
const durations = {Beginner:4, Intermediate:8, Advanced:12};
let courses = structuredClone(seedCourses);
const lessons = structuredClone(seedLessons);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='enzoAcademy-learning-v2';
let state={name:'Your learner',enrollments:{}}, category='All courses', difficulty='All levels', query='', toastTimer;
try { const saved=JSON.parse(localStorage.getItem(KEY)); if(saved && typeof saved.name==='string' && saved.enrollments && typeof saved.enrollments==='object') {state.name=saved.name; for(const c of courses){const e=saved.enrollments[c.id];if(e && /^\d{4}-\d{2}-\d{2}$/.test(e.start) && Number.isFinite(new Date(e.start).getTime()))state.enrollments[c.id]={start:e.start,done:Array.isArray(e.done)?[...new Set(e.done.filter(n=>Number.isInteger(n)&&n>=0&&n<4))]:[],notes:typeof e.notes==='object'&&e.notes?e.notes:{}};}} } catch {}
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{notify('Browser storage is unavailable. Changes will last for this session only.');return false;}}
function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function dateOf(s){return new Date(s+'T12:00:00');}
function nextStart(){let d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+((8-d.getDay())%7||7));return localDate(d);}
function endDate(c,start){return expirationFor(c,start);}
function enrollmentClosed(c){return courseStatus(c)!=='Enrollment Open';}
function courseExpired(c,e){return ['Expired','Cancelled'].includes(enrollmentStatus(c,e));}
function fmt(s){return new Date(instant(s)).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
function status(c){return enrollmentStatus(c,state.enrollments[c.id]);}
function period(c){return `${c.enrollmentStart?fmt(c.enrollmentStart):'Immediately'} &ndash; ${enrollmentEnd(c)?fmt(enrollmentEnd(c)):'No deadline'}`;}
function art(c){return `<div class="art ${c.color}"><span class="level">${c.level}</span><span class="symbol" aria-hidden="true">${esc(c.symbol)}</span></div>`;}
function card(c,learning=false){const e=state.enrollments[c.id],closed=!e&&enrollmentClosed(c);return `<article class="card">${art(c)}<div class="card-body"><span class="category-label">${c.category}</span><h3>${c.title}</h3><p>${c.description}</p><div class="meta"><span>◷ ${durationLabel(c)}</span><span>▤ ${moduleCount(c,e)} modules</span><span>No prerequisites</span></div><div class="schedule">${e?`Access: ${fmt(e.enrolledAt || e.start)} &ndash; ${fmt(e.expiresAt || endDate(c,e.start))}`:`${courseStatus(c)} &middot; ${period(c)}`}</div>${learning?`<p>${status(c)} · ${Math.round(e.done.length/moduleCount(c,e)*100)}% complete</p><progress value="${e.done.length}" max="${moduleCount(c,e)}" aria-label="${c.title} progress"></progress>`:''}<div class="card-bottom"><span class="open">${e?status(c):courseStatus(c)}</span><button data-${learning?'learn':'course'}="${c.id}">${learning?(courseExpired(c,e)?'View enrollment':e.done.length===moduleCount(c,e)?'Review course':'Continue learning'):'View course'} ↗</button></div></div></article>`;}
function filtered(){return courses.filter(c=>(category==='All courses'||c.category===category)&&(difficulty==='All levels'||c.level===difficulty)&&`${c.title} ${c.description} ${c.category}`.toLowerCase().includes(query.toLowerCase()));}
function renderCards(){const list=filtered();$('#results').textContent=`${list.length} courses to explore`;$('#courses').innerHTML=list.length?list.map(c=>card(c)).join(''):'<div class="empty"><h3>No courses found</h3><p class="muted">Try another search or reset your filters.</p><button class="btn secondary" id="reset">Reset filters</button></div>';}
function render(){const page=location.hash.slice(1)||'explore';document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+page));$('#count').textContent=Object.keys(state.enrollments).length;$('#profile').textContent=state.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'YL';
 if(page==='learning'){const enrolled=courses.filter(c=>state.enrollments[c.id]);$('#main').innerHTML=`<div class="section-head"><div><span class="eyebrow">YOUR NEXT CHAPTER</span><h1>My learning</h1><p>Welcome, ${esc(state.name)}. Keep building your momentum.</p></div><a class="btn secondary" href="#explore">Explore courses ↗</a></div><div class="stats"><div class="stat"><strong>${enrolled.length}</strong>Enrolled courses</div><div class="stat"><strong>${enrolled.reduce((n,c)=>n+state.enrollments[c.id].done.length,0)}</strong>Modules completed</div><div class="stat"><strong>${enrolled.filter(c=>status(c)==='Completed').length}</strong>Courses completed</div></div><div class="course-grid">${enrolled.length?enrolled.map(c=>card(c,true)).join(''):'<div class="empty"><h2>Your next skill starts here.</h2><p class="muted">Choose any course. There are no prerequisites or application reviews.</p><a class="btn" href="#explore">Find your first course ↗</a></div>'}</div>`;return;}
 if(page==='how'){$('#main').innerHTML=`<div class="section-head"><div><span class="eyebrow">BUILT AROUND YOUR AMBITION</span><h1>One course. New possibilities.</h1><p>Choose what you want to learn, wherever you are starting from.</p></div></div><div class="steps"><article><b>01</b><h3>Find your next skill</h3><p>Explore standalone technology courses. Every course is open to everyone, with no grade levels, prerequisites, or admission reviews.</p></article><article><b>02</b><h3>Start immediately</h3><p>Your course begins automatically on the day you enroll. Each course lists its own duration, counted from your enrollment time.</p></article><article><b>03</b><h3>Learn by doing</h3><p>Read each module and complete its practice exercise or pass its quiz. Complete all modules before your personal expiration time. Completed courses remain available for review.</p></article></div><div class="banner"><div><h3>Different starting points. The same open door.</h3><p>Difficulty describes the depth and pace, never an enrollment requirement.</p></div><a class="btn" href="#explore">Explore courses ↗</a></div><p class="muted">This is a browser-based prototype with introductory lessons and practice progress and automatically scored quizzes. It does not provide accredited certificates, instructor assessment, or online accounts. Your learner name and progress stay in this browser.</p>`;return;}
 $('#main').innerHTML=`<section class="hero"><div class="hero-copy"><span class="eyebrow">BIG POSSIBILITIES. NO PREREQUISITES.</span><h1>Your next chapter<br>starts with a skill.</h1><p>Practical technology courses for curious minds.<br>Find your path, learn by doing, and build what’s next.</p><a class="btn" href="#catalog">Explore courses <span>↗</span></a></div><div class="hero-art" aria-label="Illustration of a code editor"><div class="orbit"></div><div class="orbit two"></div><div class="code-card"><div class="dots">● ● ●</div><pre><em>const</em> yourFuture = {<br>  curiosity: <em>true</em>,<br>  possibilities: <em>'endless'</em><br>};<br><br><em>startLearning</em>(yourFuture);</pre></div><div class="float top"><strong>✦ Built for your next step</strong>Practical skills. Real projects.</div><div class="float bottom"><strong>✓ Everyone starts somewhere</strong>No prerequisites needed</div><div class="js-badge">JS</div></div></section><div class="benefits"><span><b>◎</b> Open to every learner</span><span><b>▤</b> Project-based learning</span><span><b>◷</b> Clear start & end dates</span><span><b>↗</b> Learn at your own pace</span></div><section id="catalog"><div class="section-head"><div><span class="eyebrow">FIND YOUR NEXT CHALLENGE</span><h2>A little curiosity goes a long way.</h2><p id="results"></p></div><label class="search"><span aria-hidden="true">⌕</span><input type="search" id="search" aria-label="Search courses" placeholder="Search courses…" value="${esc(query)}"></label></div><div class="filters"><div class="categories">${['All courses',...new Set(courses.map(c=>c.category))].map(x=>`<button class="chip ${category===x?'active':''}" data-category="${x}" aria-pressed="${category===x}">${x}</button>`).join('')}</div><select id="difficulty" aria-label="Filter by difficulty">${['All levels',...Object.keys(durations)].map(x=>`<option ${difficulty===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="course-grid" id="courses"></div></section><div class="banner"><div><h3>Your ambition is the only entry requirement.</h3><p>No grade levels. No prerequisites. Just you and what comes next.</p></div><a class="btn secondary" href="#how">How learning works ↗</a></div>`;renderCards();$('#search').oninput=e=>{query=e.target.value;renderCards();};$('#difficulty').onchange=e=>{difficulty=e.target.value;renderCards();};
}
function show(html){delete $('#detail').dataset.courseId;$('#detail').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal();}
function detail(c){const e=state.enrollments[c.id];show(`<span class="eyebrow">${esc(c.category)} &middot; ${esc(c.level)}</span><h2>${esc(c.title)}</h2><p>${esc(c.description)}</p><div class="details-grid"><div><small>Course duration after enrollment</small>${durationLabel(c)}</div><div><small>Enrollment status</small>${courseStatus(c)}</div><div><small>Enrollment period</small>${period(c)}</div></div><h3>What you will learn</h3><ol class="lessons">${(e?.curriculum?.map(m=>m.title)||c.topics).map((t,i)=>`<li><span>0${i+1}</span>${esc(t)}</li>`).join('')}</ol><p><strong>Practice project:</strong> ${esc(c.project)}.</p>${e?`<p><strong>${status(c)}</strong><br>Enrolled: ${fmt(e.enrolledAt || e.start)}<br>Your access expires: ${fmt(e.expiresAt || endDate(c,e.start))}</p><button class="btn wide" data-learn="${c.id}">View enrollment &rarr;</button>`:enrollmentClosed(c)?`<p class="auth-error">${courseStatus(c)}. New enrollments are unavailable.</p>`:`<button class="btn wide" data-enroll="${c.id}">Enroll for free &rarr;</button><p class="muted">You have ${durationLabel(c)} from your enrollment time to complete this course, even if its enrollment period ends sooner.</p>`}`);$('#detail').dataset.courseId=c.id;}
function learn(c,index) {
  const e=state.enrollments[c.id];
  if(!e)return detail(c);
  if(courseExpired(c,e)) { show('<h2>'+esc(status(c))+' enrollment</h2><p>Your course access has ended.</p>'); return; }
  const modules=e.curriculum || modulesFor(c,lessons);
  let i=index ?? modules.findIndex((_,n)=>!e.done.includes(n));
  if(i<0 || i>=modules.length)i=0;
  const module=modules[i];
  const attempt=e.quizAttempts?.[module.id];
  show('<span class="eyebrow">'+esc(c.title)+'</span><h2>'+esc(module.title)+'</h2><p>'+status(c)+' · '+e.done.length+'/'+modules.length+' modules completed</p><progress value="'+e.done.length+'" max="'+modules.length+'" aria-label="Course completion"></progress><label class="field">Module<select id="module">'+modules.map((m,n)=>'<option value="'+n+'" '+(i===n?'selected':'')+'>'+(e.done.includes(n)?'✓ ':'')+(n+1)+'. '+esc(m.title)+'</option>').join('')+'</select></label>'+lessonMarkup(module,attempt));
  $('#module').onchange=()=>learn(c,Number($('#module').value));
  const finish = (passed, message) => {
    const wasCompleted=enrollmentStatus(c,e)==='Completed';
    if(passed && !e.done.includes(i))e.done.push(i);
    if(e.done.length===modules.length&&!wasCompleted)e.completedAt=new Date().toISOString();
    e.status=enrollmentStatus(c,e);
    const saved=save(); render(); learn(c,i); if(saved)notify(message);
  };
  if(module.questions.length) {
    $('#quiz-form').onsubmit=event=>{
      event.preventDefault();
      if(courseExpired(c,e))return learn(c,i);
      try {
        const result=readQuiz(module,event.currentTarget);
        e.quizAttempts ||= {};
        e.quizAttempts[module.id]={...result,submittedAt:new Date().toISOString(),attemptNumber:(attempt?.attemptNumber||0)+1};
        finish(result.passed,result.passed?'Quiz passed. Your module is complete.':'Quiz saved. Review the lesson and try again.');
      } catch(error) { $('#quiz-error').textContent=error.message; }
    };
  } else {
    $('#notes').value=e.notes[i]||'';
    $('#exercise').onsubmit=event=>{
      event.preventDefault(); if(courseExpired(c,e))return learn(c,i);
      const notes=$('#notes').value.trim();
      if(notes.length<10){$('#notes').setCustomValidity('Write at least 10 non-space characters.');$('#notes').reportValidity();return;}
      e.notes[i]=notes; finish(true,'Your practice and progress are saved.');
    };
    $('#notes').oninput=()=>$('#notes').setCustomValidity('');
  }
}
function openModuleBuilder(id) {
  if(currentAccount?.role!=='admin')return;
  const course=courses.find(c=>c.id===id);
  if(!course)return;
  course.modules=modulesFor(course,lessons);
  show('<div id="course-studio"></div>');
  $('#dialog').classList.add('studio-dialog');
  mountCourseBuilder($('#course-studio'),course,{
    onCancel:()=>$('#dialog').close(),
    onSave:modules=>{
      if(currentAccount?.role!=='admin')throw new Error('Admin access is required.');
      learnerRows();
      const updated={...course,modules,topics:modules.map(m=>m.title)};
      const next=courses.map(c=>c.id===id?updated:c);
      localStorage.setItem(ADMIN_COURSES_KEY,JSON.stringify(next));
      courses=next;
      $('#dialog').close(); renderAdmin(); notify('Modules and quizzes saved for new enrollments.');
    },
  });
}
$('#dialog').addEventListener('close',()=>$('#dialog').classList.remove('studio-dialog'));
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.category){category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCards();}if(b.id==='reset'){query='';category='All courses';difficulty='All levels';render();}if(b.dataset.course)detail(courses.find(c=>c.id===b.dataset.course));if(b.dataset.learn)learn(courses.find(c=>c.id===b.dataset.learn));if(b.dataset.enroll){const c=courses.find(c=>c.id===b.dataset.enroll);if(enrollmentClosed(c)){detail(c);notify(courseStatus(c)+'. New enrollments are unavailable.');return;}if(state.enrollments[c.id])return learn(c);state.enrollments[c.id]=normalizeEnrollment(c,{enrolledAt:new Date().toISOString(),done:[],notes:{}});const saved=save();$('#dialog').close();location.hash='learning';render();if(saved)notify(`You're enrolled in ${c.title}!`);}});
$('#profile').onclick=()=>{show(`<span class="eyebrow">YOUR LEARNING SPACE</span><h2>Make yourself at home.</h2><p>Add your name to personalize this browser’s learning dashboard.</p><form id="profile-form"><label class="field">Learner name<input id="name" maxlength="60" required value="${esc(state.name==='Your learner'?'':state.name)}" autocomplete="given-name"></label><button class="btn wide">Save learner name</button></form><p class="muted">No password needed for this local demo. This is not an online account.</p>`);$('#profile-form').onsubmit=e=>{e.preventDefault();const name=$('#name').value.trim();if(!name){$('#name').setCustomValidity('Enter your name.');$('#name').reportValidity();return;}state.name=name;save();$('#dialog').close();render();};$('#name').oninput=()=>$('#name').setCustomValidity('');};
$('.close').onclick=()=>$('#dialog').close();$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#dialog').close();}});
window.addEventListener('hashchange',()=>{if(location.hash==='#catalog'){if(!$('#catalog'))render();$('#catalog')?.scrollIntoView({behavior:'smooth'});}else{render();window.scrollTo(0,0);}});render();


// Local demo accounts only. A deployed platform needs server-side authentication.
const ACCOUNT_KEY = 'enzoAcademy-accounts-v1';
const SESSION_KEY = 'enzoAcademy-session-v1';
const ADMIN_COURSES_KEY = 'enzoAcademy-admin-courses-v1';
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin123';
let accounts = [], currentAccount = null, pendingEnrollment = null;
try {
  const stored = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
  if (Array.isArray(stored)) accounts = stored.filter(a => a && typeof a.id === 'string' && typeof a.email === 'string' && typeof a.hash === 'string' && typeof a.salt === 'string');
  const sessionId = sessionStorage.getItem(SESSION_KEY);
  currentAccount = sessionId === 'enzoAcademy-admin' ? {id:'enzoAcademy-admin', name:'Admin', email:ADMIN_EMAIL, role:'admin'} : accounts.find(a => a.id === sessionId) || null;
  const savedCourses = JSON.parse(localStorage.getItem(ADMIN_COURSES_KEY));
  if (Array.isArray(savedCourses)) courses = savedCourses;
} catch {}
for (const course of courses) {
  course.modules = modulesFor(course, lessons);
  if (!lessons[course.id]) lessons[course.id] = course.topics.map(topic => [`Learn the essentials of ${topic.toLowerCase()} through a concise guided reading.`, `Apply ${topic.toLowerCase()} in a short practical exercise.`]);
}
function loadLearner() {
  state = {name: currentAccount?.name || 'Your learner', enrollments: {}};
  if (!currentAccount || currentAccount.role === 'admin') return;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY + ':' + currentAccount.id));
    if (stored && stored.enrollments && typeof stored.enrollments === 'object') {
      for (const c of courses) {
        const e = stored.enrollments[c.id];
        if (e && Number.isFinite(instant(e.enrolledAt || e.start))) {
          state.enrollments[c.id] = normalizeEnrollment(c,e);
        }
      }
    }
  } catch {}
}
save = function() {
  if (!currentAccount) return false;
  try { localStorage.setItem(KEY + ':' + currentAccount.id, JSON.stringify(state)); return true; }
  catch { notify('Progress could not be saved. Browser storage may be full or disabled.'); return false; }
};
const renderLearningPlatform = render;
render = function() {
  if (currentAccount?.role === 'admin') {
    renderAdmin();
    return;
  }
  renderLearningPlatform();
  const profile = $('#profile');
  profile.classList.toggle('signed-out', !currentAccount);
  profile.textContent = currentAccount ? state.name.split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase() : 'Log in';
  profile.setAttribute('aria-label', currentAccount ? 'Open your account' : 'Log in');
  if (!currentAccount && location.hash === '#learning') {
    $('#main').innerHTML = '<div class="empty"><span class="eyebrow">YOUR LEARNING SPACE</span><h1>Welcome to your next chapter.</h1><p class="muted">Log in to enroll in courses and keep track of your progress.</p><button class="btn" id="learning-login">Log in or create an account</button></div>';
    $('#learning-login').onclick = () => openAuth();
  }
};
async function passwordHash(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Open this site on localhost or HTTPS to use login.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:Uint8Array.from(salt.match(/.{2}/g), h => parseInt(h,16)), iterations:210000, hash:'SHA-256'}, key, 256);
  return Array.from(new Uint8Array(bits), n => n.toString(16).padStart(2,'0')).join('');
}
function randomHex() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join(''); }
function openAuth(register = false) {
  show(`<span class="eyebrow">enzoAcademy LEARNING</span><h2>${register ? 'Start your next chapter.' : 'Welcome back.'}</h2><p>${register ? 'Create an account and choose any course. No prerequisites.' : 'Log in to pick up where you left off.'}</p><form id="auth-form">${register ? '<label class="field">Full name<input id="auth-name" autocomplete="name" required maxlength="60"></label>' : ''}<label class="field">Email<input id="auth-email" type="email" autocomplete="username" required maxlength="254"></label><label class="field">Password<input id="auth-password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required ${register ? 'minlength="8"' : ''} maxlength="128"></label>${register ? '<label class="field">Confirm password<input id="auth-confirm" type="password" autocomplete="new-password" required maxlength="128"></label><small class="muted">Use at least 8 characters.</small>' : ''}<p id="auth-error" class="auth-error" role="alert"></p><button id="auth-submit" class="btn wide">${register ? 'Create account' : 'Log in'} →</button></form><p class="auth-switch">${register ? 'Already have an account?' : 'New to enzoAcademy?'} <button id="auth-switch">${register ? 'Log in' : 'Create an account'}</button></p><p class="muted auth-note">${register ? 'Demo accounts are stored on this browser only.' : 'Admin Gmail: admin@gmail.com · Password: admin123'} Use a demo password, not a password from another service.</p>`);
  $('#auth-switch').onclick = () => openAuth(!register);
  $('#auth-form').onsubmit = async event => {
    event.preventDefault();
    const email = $('#auth-email').value.trim().toLowerCase(), password = $('#auth-password').value;
    const error = $('#auth-error'), submit = $('#auth-submit');
    error.textContent = '';
    submit.disabled = true;
    try {
      // Refresh before registration so another tab's accounts are retained.
      const stored = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '[]');
      if (!Array.isArray(stored)) throw new Error('Account storage could not be read.');
      accounts = stored;
      let account;
      if (register) {
        const name = $('#auth-name').value.trim();
        if (!name) throw new Error('Enter your name.');
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if (password !== $('#auth-confirm').value) throw new Error('Passwords do not match.');
        if (accounts.some(a => a.email === email)) throw new Error('This email already has an account. Please log in.');
        const salt = randomHex();
        account = {id:randomHex(), name, email, salt, hash:await passwordHash(password,salt)};
        // Ignore completion if the user closed or switched the form while hashing.
        if (!$('#dialog').open || $('#auth-submit') !== submit) return;
        accounts = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '[]');
        if (accounts.some(a => a.email === email)) throw new Error('This email already has an account. Please log in.');
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...accounts, account]));
        accounts.push(account);
      } else {
        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
          account = {id:'enzoAcademy-admin', name:'Admin', email:ADMIN_EMAIL, role:'admin'};
        } else {
          account = accounts.find(a => a.email === email);
          if (!account || await passwordHash(password,account.salt) !== account.hash) throw new Error('Incorrect email or password.');
        }
      }
      if (!$('#dialog').open || $('#auth-submit') !== submit) return;
      sessionStorage.setItem(SESSION_KEY, account.id);
      currentAccount = account;
      loadLearner();
      $('#dialog').close();
      render();
      if (pendingEnrollment) {
        const pending = pendingEnrollment;
        pendingEnrollment = null;
        detail(courses.find(c => c.id === pending.id));
        notify('You’re signed in. Confirm your course enrollment.');
      } else { location.hash = account.role === 'admin' ? 'admin' : 'learning'; render(); }
    } catch (err) {
      error.textContent = err instanceof DOMException ? 'Browser storage is unavailable. Enable it and try again.' : err.message;
    } finally { submit.disabled = false; }
  };
}
function logout() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  currentAccount = null;
  pendingEnrollment = null;
  loadLearner();
  $('#dialog').close();
  location.hash = 'explore';
  render();
  notify('You have been logged out.');
}
$('#profile').onclick = () => {
  if (!currentAccount) return openAuth();
  show(`<span class="eyebrow">YOUR ACCOUNT</span><h2>${esc(currentAccount.name)}</h2><p>${esc(currentAccount.email)}</p><p>${currentAccount.role === 'admin' ? 'You have administrator access to enzoAcademy.' : 'Your course progress is saved to this account on this browser.'}</p><button id="logout" class="btn wide">Log out</button>`);
  $('#logout').onclick = logout;
};
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!currentAccount && (button?.dataset.enroll || button?.dataset.learn)) {
    event.stopImmediatePropagation();
    pendingEnrollment = {id:button.dataset.enroll || button.dataset.learn};
    openAuth();
  }
}, true);
$('#dialog').addEventListener('close', () => { if (!currentAccount) pendingEnrollment = null; });
// Admin tools adapted from the reference prototype. Data remains local to this browser.
let adminSection = 'overview';
function saveCourseCatalog() { localStorage.setItem(ADMIN_COURSES_KEY, JSON.stringify(courses)); }
function learnerRows() {
  return accounts.map(account => {
    let learning = {enrollments:{}};
    try { learning = JSON.parse(localStorage.getItem(KEY + ':' + account.id)) || learning; } catch {}
    let changed=false;
    for(const c of courses){const e=learning.enrollments?.[c.id];if(e && Number.isFinite(instant(e.enrolledAt || e.start))){const normalized=normalizeEnrollment(c,e);if(JSON.stringify(e)!==JSON.stringify(normalized)){learning.enrollments[c.id]=normalized;changed=true;}}}
    if(changed) try{localStorage.setItem(KEY+':'+account.id,JSON.stringify(learning));}catch{}
    return {...account, enrollments:learning.enrollments || {}};
  });
}
function enrollmentRows() {
  return learnerRows().flatMap(account => Object.entries(account.enrollments).map(([courseId, enrollment]) => ({account, courseId, enrollment})));
}
function renderAdmin() {
  if (location.hash !== '#admin') history.replaceState(null, '', '#admin');
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  $('#count').textContent = enrollmentRows().length;
  const profile = $('#profile');
  profile.classList.remove('signed-out');
  profile.textContent = 'AD';
  profile.setAttribute('aria-label', 'Open admin account');
  const learners = learnerRows(), enrollments = enrollmentRows();
  const tabs = `<div class="admin-tabs" role="navigation" aria-label="Admin sections">${[['overview','Overview'],['courses','Manage courses'],['enrollments','Enrollments'],['learners','Learners']].map(([id,label]) => `<button class="chip ${adminSection===id?'active':''}" data-admin-section="${id}">${label}</button>`).join('')}</div>`;
  let content = '';
  if (adminSection === 'overview') {
    content = `<div class="section-head"><div><span class="eyebrow">ADMINISTRATION</span><h1>Platform overview</h1><p>Activity across enzoAcademy on this browser.</p></div></div><div class="stats"><div class="stat"><strong>${learners.length}</strong>Learners</div><div class="stat"><strong>${courses.length}</strong>Courses</div><div class="stat"><strong>${enrollments.length}</strong>Enrollments</div></div>${adminEnrollmentTable(enrollments.slice(-5).reverse(), 'Recent enrollments')}`;
  } else if (adminSection === 'courses') {
    content = `<div class="section-head"><div><span class="eyebrow">ADMINISTRATION</span><h1>Manage courses</h1><p>Add, edit, or remove courses from the catalog.</p></div><button class="btn" data-admin-course="new">Add course</button></div>${adminCourseTable()}`;
  } else if (adminSection === 'enrollments') {
    content = `<div class="section-head"><div><span class="eyebrow">ADMINISTRATION</span><h1>Enrollments</h1><p>Every learner enrollment and its current progress.</p></div></div>${adminEnrollmentTable(enrollments, '')}`;
  } else {
    content = `<div class="section-head"><div><span class="eyebrow">ADMINISTRATION</span><h1>Learners</h1><p>Accounts registered on this browser.</p></div></div>${learners.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Gmail</th><th>Courses</th><th></th></tr></thead><tbody>${learners.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.email)}</td><td>${Object.keys(a.enrollments).length}</td><td><button class="danger-link" data-admin-remove-learner="${a.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : adminEmpty('No learners registered yet.')}`;
  }
  $('#main').innerHTML = `<div class="admin-shell">${tabs}${content}</div>`;
}
function adminEmpty(text) { return `<div class="empty"><h3>${text}</h3></div>`; }
function adminCourseTable() {
  if (!courses.length) return adminEmpty('No courses available.');
  return `<div class="table-wrap"><table><thead><tr><th>Course</th><th>Category</th><th>Level</th><th>Duration</th><th>Enrollment period</th><th>Status</th><th></th></tr></thead><tbody>${courses.map(c=>`<tr><td>${esc(c.title)}</td><td>${esc(c.category)}</td><td>${esc(c.level)}</td><td>${durationLabel(c)}</td><td>${period(c)}</td><td>${courseStatus(c)}</td><td class="table-actions"><button data-admin-modules="${c.id}">Modules & quizzes</button><button data-admin-course="${c.id}">Edit</button><button class="danger-link" data-admin-delete-course="${c.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
}
function adminEnrollmentTable(rows, heading) {
  if (!rows.length) return adminEmpty('No enrollments yet.');
  return `${heading?`<h2>${heading}</h2>`:''}<div class="table-wrap"><table><thead><tr><th>Learner</th><th>Course</th><th>Progress</th><th>Status</th><th>Access expires</th><th></th></tr></thead><tbody>${rows.map(r=>{const c=courses.find(x=>x.id===r.courseId);const done=Array.isArray(r.enrollment.done)?r.enrollment.done.length:0;return `<tr><td>${esc(r.account.name)}</td><td>${esc(c?.title || 'Removed course')}</td><td>${Math.round(done/moduleCount(c||{},r.enrollment)*100)}%</td><td>${c?enrollmentStatus(c,r.enrollment):'Unavailable'}</td><td>${r.enrollment.expiresAt?fmt(r.enrollment.expiresAt):'Unavailable'}</td><td><button class="danger-link" data-admin-remove-enrollment="${r.account.id}|${r.courseId}">Remove</button></td></tr>`}).join('')}</tbody></table></div>`;
}
function inputDate(value){if(!value)return '';const d=new Date(value);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
function openAdminCourse(id) {
  const course = id === 'new' ? null : courses.find(c => c.id === id);
  show(`<span class="eyebrow">ADMINISTRATION</span><h2>${course?'Edit course':'Add course'}</h2><form id="admin-course-form"><label class="field">Course title<input id="admin-title" required maxlength="100" value="${esc(course?.title || '')}"></label><label class="field">Category<input id="admin-category" required maxlength="60" value="${esc(course?.category || '')}"></label><label class="field">Level<select id="admin-level">${Object.keys(durations).map(level=>`<option ${course?.level===level?'selected':''}>${level}</option>`).join('')}</select></label><label class="field">Course Duration<input id="admin-duration" type="number" min="1" max="10000" step="1" required value="${durationOf(course || {}).value}"></label><label class="field">Duration unit<select id="admin-duration-unit">${['days','weeks','months'].map(unit=>`<option ${durationOf(course || {}).unit===unit?'selected':''}>${unit}</option>`).join('')}</select><small class="muted">Starts at each learner's enrollment time. Months use calendar months, clamped to the last day. Changes apply to new enrollments only.</small></label><label class="field">Enrollment start<input id="admin-start-date" type="datetime-local" value="${inputDate(course?.enrollmentStart)}"><small class="muted">Optional: leave blank to open immediately. All times use your device's local timezone.</small></label><label class="field">Enrollment end<input id="admin-close-date" type="datetime-local" value="${inputDate(course && enrollmentEnd(course))}"><small class="muted">Optional: leave blank for no deadline. Enrollment closes at this exact time.</small></label><label class="field">Course availability<select id="admin-active"><option value="true">Active</option><option value="false" ${course?.active===false?'selected':''}>Inactive</option></select><small class="muted">Inactive courses do not accept new enrollments. Existing learners retain their personal access period.</small></label><label class="field">Description<textarea id="admin-description" required maxlength="400">${esc(course?.description || '')}</textarea></label><button class="btn wide">${course?'Save changes':'Add course'}</button></form>`);
  $('#admin-course-form').onsubmit = event => {
    event.preventDefault();
    const start=$('#admin-start-date').value, end=$('#admin-close-date').value;
    const value=Number($('#admin-duration').value);
    if(!Number.isInteger(value)||value<1||value>10000){notify('Enter a whole-number duration from 1 to 10000.');return;}
    if(start && end && instant(end)<=instant(start)){notify('Enrollment end must be after enrollment start.');return;}
    learnerRows(); // Freeze legacy learner deadlines before changing course duration.
    const base = course || {id:'course-'+Date.now(), color:'green', symbol:'<>', topics:['Introduction','Core concepts','Guided practice','Final project'], project:'Complete a practical course project'};
    Object.assign(base,{title:$('#admin-title').value.trim(),category:$('#admin-category').value.trim(),level:$('#admin-level').value,durationValue:value,durationUnit:$('#admin-duration-unit').value,enrollmentStart:start?new Date(start).toISOString():null,enrollmentEnd:end?new Date(end).toISOString():null,enrollmentCloseDate:null,active:$('#admin-active').value==='true',description:$('#admin-description').value.trim()});
    if (!course) { courses.push(base); lessons[base.id]=base.topics.map(topic=>[`Learn the essentials of ${topic.toLowerCase()} through a concise guided reading.`,`Apply ${topic.toLowerCase()} in a short practical exercise.`]); }
    saveCourseCatalog();
    $('#dialog').close(); renderAdmin(); notify(course?'Course updated.':'Course added.');
  };
}
document.addEventListener('click', event => {
  if (currentAccount?.role !== 'admin') return;
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.adminSection) { adminSection=button.dataset.adminSection; renderAdmin(); }
  if (button.dataset.adminModules) openModuleBuilder(button.dataset.adminModules);
  if (button.dataset.adminCourse) openAdminCourse(button.dataset.adminCourse);
  if (button.dataset.adminDeleteCourse) {
    if (!confirm('Delete this course and its enrollment records?')) return;
    const id=button.dataset.adminDeleteCourse; courses=courses.filter(c=>c.id!==id); saveCourseCatalog();
    for (const account of accounts) { try { const key=KEY+':'+account.id,data=JSON.parse(localStorage.getItem(key)); if(data?.enrollments?.[id]){delete data.enrollments[id];localStorage.setItem(key,JSON.stringify(data));} } catch {} }
    renderAdmin();
  }
  if (button.dataset.adminRemoveEnrollment) {
    if (!confirm('Remove this enrollment?')) return;
    const [accountId,courseId]=button.dataset.adminRemoveEnrollment.split('|'),key=KEY+':'+accountId;
    try { const data=JSON.parse(localStorage.getItem(key)); if(data?.enrollments){delete data.enrollments[courseId];localStorage.setItem(key,JSON.stringify(data));} } catch {}
    renderAdmin();
  }
  if (button.dataset.adminRemoveLearner) {
    if (!confirm('Remove this learner and all of their progress?')) return;
    const id=button.dataset.adminRemoveLearner; accounts=accounts.filter(a=>a.id!==id); localStorage.setItem(ACCOUNT_KEY,JSON.stringify(accounts)); localStorage.removeItem(KEY+':'+id); renderAdmin();
  }
});
loadLearner();
render();

// Reconcile dates on load, wake-up, and while the page stays open. Every action also checks the current time.
function refreshTimelines(){
  let changed=false;
  for(const c of courses){const e=state.enrollments[c.id];if(e){const next=enrollmentStatus(c,e);if(e.status!==next){e.status=next;changed=true;}}}
  if(changed)save();
  const signature=JSON.stringify([courses.map(c=>courseStatus(c)),courses.map(c=>state.enrollments[c.id]?.status),currentAccount?.role==='admin'?enrollmentRows().map(r=>r.enrollment.status):[]]);
  if(refreshTimelines.signature!==signature){refreshTimelines.signature=signature;render();
    if($('#dialog').open && !$('#admin-course-form') && !$('#auth-form') && !$('#module-builder')){
      const courseId=$('#detail').dataset.courseId;
      if(courseId){const c=courses.find(c=>c.id===courseId);if(c)detail(c);}
      else if(changed && ($('#exercise') || $('#quiz-form'))){show('<h2>Enrollment expired</h2><p>Your course access period has ended. Further progress cannot be submitted.</p>');}
    }
  }
}
learnerRows();
refreshTimelines();
setInterval(refreshTimelines,1000);
window.addEventListener('focus',refreshTimelines);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTimelines();});

window.addEventListener('storage',event=>{
  if(event.key===ADMIN_COURSES_KEY){try{const catalog=JSON.parse(event.newValue);if(Array.isArray(catalog)){courses=catalog;for(const c of courses)if(!lessons[c.id])lessons[c.id]=c.topics.map(t=>[`Learn the essentials of ${t}.`,`Apply ${t} in a practical exercise.`]);}}catch{}refreshTimelines();render();}
});
