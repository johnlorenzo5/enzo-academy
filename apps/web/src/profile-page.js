import { escapeHtml as esc } from './course-builder.js';

const glyph = kind => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
  person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 8 0 0 1 16 0v4Z"/>',
  badge:'<circle cx="12" cy="9" r="6"/><path d="m9 9 2 2 4-4M8 14l-2 8 6-3 6 3-2-8"/>',
  book:'<path d="M12 5C8 2 3 3 2 4v15c3-2 7-1 10 1 3-2 7-3 10-1V4c-3-2-7-1-10 1Zm0 0v15"/>',
  discount:'<path d="m12 2 3 2h4l1 4 2 4-2 3-1 4h-4l-3 3-3-3H5l-1-4-2-3 2-4 1-4h4Z"/><path d="m8 16 8-8"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/>',
  history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2"/>',
  file:'<path d="M5 2h10l4 4v16H5Zm10 0v5h4M8 11h8m-8 4h8m-8 4h6"/>',
  camera:'<path d="M3 6h4l2-3h6l2 3h4v15H3Z"/><circle cx="12" cy="13" r="4"/>'
}[kind]}</svg>`;
const goals = ['Learn new skills', 'Find a job', 'Advance my career', 'Prepare for certification', 'Personal interest'];
const experience = ['Technology', 'Networking', 'Software development', 'Cybersecurity', 'Education', 'No work experience yet'];
export function mountProfilePage(root, {account, enrollments = [], badgeCount = 0, onSave, onChangeEmail, certificates = true, initialTab = 'profile', mountAchievements}) {
  const document = root.ownerDocument;
  const parts = (account.name || '').trim().split(/\s+/);
  const data = {firstName:parts.slice(0, -1).join(' ') || parts[0] || '', lastName:parts.length > 1 ? parts.at(-1) : '', language:'English (English)', country:'', region:'', goals:[], experience:[], gender:'Prefer not to say', disability:'Prefer not to say', ...account.profile};
  let photoURL = data.photoURL || account.photoURL || '', disposed = false, photoPending = false;
  const $ = selector => root.querySelector(selector);
  const options = (values, selected) => values.map(value => `<option ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('');
  const input = (label, name, value, extra = '') => `<label class="profile-field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${extra}></label>`;
  const select = (label, name, values, selected) => `<label class="profile-field">${label}<select name="${name}">${options(values, selected)}</select></label>`;
  const multi = (label, name, values) => `<fieldset class="profile-multi"><legend>${label} <span>(Select all that apply)</span></legend><details><summary>Select all that apply…</summary><div>${values.map(value => `<label><input type="checkbox" name="${name}" value="${esc(value)}" ${data[name].includes(value) ? 'checked' : ''}>${esc(value)}</label>`).join('')}</div></details></fieldset>`;
  root.classList.add('profile-page');
  root.innerHTML = `<section class="profile-hero"><div class="profile-hero-inner"><div class="profile-photo-wrap"><span class="profile-photo" id="profile-photo"></span><label class="profile-photo-upload" title="Change profile photo"><span aria-hidden="true">▣</span><span class="profile-sr-only">Change profile photo</span><input id="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp"></label></div><div class="profile-welcome"><p>Welcome,</p><h1 id="profile-display-name">${esc(account.name)}</h1><small>${account.role === 'admin' ? 'Administrator' : 'Learner'} <span>●</span> enzoAcademy</small></div><div class="profile-stat"><span aria-hidden="true">♙</span><div><strong>${badgeCount}</strong><small>Badges Earned</small></div></div><div class="profile-stat"><span aria-hidden="true">▤</span><div><strong>${enrollments.filter(e => e.status === 'Completed').length}</strong><small>Courses Completed</small></div></div></div></section><div class="profile-content"><nav class="profile-tabs" aria-label="Profile sections"><a href="#profile" class="active" aria-current="page"><span>♙</span>Profile</a>${certificates ? '<a href="#achievements"><span>♧</span>Badges &amp; Certificates</a>' : ''}<button type="button" disabled title="Not yet available"><span>♧</span>Discounts</button><a href="#history"><span>◴</span>Learning History</a><button type="button" disabled title="Not yet available"><span>▤</span>Transcript</button></nav><div class="profile-completion"><span id="profile-percent"></span><div><strong>Help us improve learning for everyone</strong><p>Have a minute? Add to your profile to help us understand what learners need and who we're reaching. Your input helps us improve our courses and expand access to more people.</p></div></div><form id="profile-form" class="profile-card"><h2>Basic Information</h2><div class="profile-grid">${input('First Name<span class="profile-required">*</span>', 'firstName', data.firstName, 'required maxlength="60" autocomplete="given-name"')}${input('Last Name<span class="profile-required">*</span>', 'lastName', data.lastName, 'required maxlength="60" autocomplete="family-name"')}${select('Default Language', 'language', ['English (English)'], data.language)}${input('Country or Region<span class="profile-required">*</span>', 'country', data.country, 'required maxlength="100" autocomplete="country-name" list="profile-countries"')}${input('State / Province<span class="profile-required">*</span>', 'region', data.region, 'required maxlength="100" autocomplete="address-level1"')}<datalist id="profile-countries">${options(['Philippines', 'Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'India', 'Australia', 'United Kingdom', 'United States'], '')}</datalist></div><h2>Contact Information <span class="profile-info" title="Your email is managed by your sign-in provider.">?</span></h2><div class="profile-contact">${input('Email', 'email', account.email, 'type="email" readonly autocomplete="email"')}<button type="button" id="profile-change-email">Change Email</button></div><h2>About Me</h2><div class="profile-grid profile-grid-two">${multi('What brings you to enzoAcademy?', 'goals', goals)}${multi('What are your areas of work experience?', 'experience', experience)}</div><p class="profile-optional">Providing this information is optional. Your answers help us make learning better and available to more people.</p><div class="profile-grid profile-grid-two">${select('Gender', 'gender', ['Prefer not to say', 'Woman', 'Man', 'Non-binary', 'Self-describe'], data.gender)}${select('Disability', 'disability', ['Prefer not to say', 'Yes', 'No'], data.disability)}</div><p class="profile-privacy">Optional information is saved to your profile. You can clear it or choose “Prefer not to say” at any time.</p><p id="profile-error" role="alert"></p><div class="profile-actions"><button class="profile-save" type="submit">Save Changes</button><button id="profile-cancel" type="button">Cancel</button><span id="profile-save-status" role="status"></span></div></form></div>`;
  function renderPhoto() { $('#profile-photo').innerHTML = photoURL ? `<img src="${esc(photoURL)}" alt="Your profile photo">` : `<span>${esc((data.firstName[0] || '') + (data.lastName[0] || ''))}</span>`; }
  renderPhoto();
  const form = $('#profile-form');
  function completion() {
    const fields = ['firstName','lastName','language','country','region'];
    const done = fields.filter(name => form.elements.namedItem(name).value.trim()).length + Number(!!account.email) + Number(!!photoURL) + Number(!!form.querySelector('[name=goals]:checked')) + Number(!!form.querySelector('[name=experience]:checked'));
    const percent = Math.round(done / 9 * 100);
    $('#profile-percent').textContent = `${percent}%`;
    $('#profile-percent').style.setProperty('--completion', `${percent}%`);
    for(const name of ['goals','experience']) {
      const count = form.querySelectorAll(`[name=${name}]:checked`).length;
      form.querySelector(`[name=${name}]`).closest('details').querySelector('summary').textContent = count ? `${count} selected` : 'Select all that apply…';
    }
  }
  completion();
  form.addEventListener('input', () => { $('#profile-save-status').textContent = ''; completion(); });
  $('#profile-cancel').onclick = () => { document.defaultView.location.hash = account.role === 'admin' ? 'admin' : 'learning'; };
  $('#profile-change-email').onclick = () => onChangeEmail?.();
  if(!onChangeEmail) $('#profile-change-email').hidden = true;
  $('#profile-photo-input').onchange = async event => {
    const file = event.target.files[0];
    if(!file) return;
    $('#profile-error').textContent = '';
    if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { $('#profile-error').textContent = 'Choose a JPG, PNG, or WebP image smaller than 5 MB.'; return; }
    photoPending = true; $('.profile-save').disabled = true;
    try {
      const reader = new document.defaultView.FileReader();
      const source = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const image = new document.defaultView.Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = source; });
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
      const size = Math.min(image.width, image.height);
      canvas.getContext('2d').drawImage(image, (image.width-size)/2, (image.height-size)/2, size, size, 0, 0, 160, 160);
      if(disposed) return;
      photoURL = canvas.toDataURL('image/jpeg', .85); renderPhoto(); completion();
    } catch { if(!disposed) $('#profile-error').textContent = 'This image could not be opened. Please try another photo.'; }
    finally { photoPending = false; if(!disposed) $('.profile-save').disabled = false; }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if(photoPending) return;
    const submit = $('.profile-save'); submit.disabled = true; $('#profile-error').textContent = ''; $('#profile-save-status').textContent = 'Saving…';
    const profile = {photoURL};
    for(const name of ['firstName','lastName','language','country','region','gender','disability']) profile[name] = form.elements.namedItem(name).value.trim();
    for(const name of ['goals','experience']) profile[name] = [...form.querySelectorAll(`[name=${name}]:checked`)].map(input => input.value);
    try {
      const saved = await onSave(profile);
      if(disposed) return;
      $('#profile-display-name').textContent = saved.name || `${profile.firstName} ${profile.lastName}`;
      data.firstName = profile.firstName; data.lastName = profile.lastName; renderPhoto();
      $('#profile-save-status').textContent = 'Your profile has been saved.';
    } catch(error) { if(!disposed) { $('#profile-save-status').textContent = ''; $('#profile-error').textContent = error.message || 'Unable to save your profile. Please try again.'; } }
    finally { if(!disposed) submit.disabled = false; }
  };
  // Keep the form mounted so switching tabs also preserves unsaved profile edits.
  const content = $('.profile-content');
  const profilePanel = document.createElement('section');
  profilePanel.id = 'profile-information-panel';
  content.insertBefore(profilePanel, $('.profile-completion'));
  profilePanel.append($('.profile-completion'), form);
  const achievementsPanel = document.createElement('section');
  achievementsPanel.id = 'profile-achievements-panel';
  achievementsPanel.className = 'profile-achievements';
  achievementsPanel.hidden = true;
  content.append(achievementsPanel);
  const historyPanel = document.createElement('section');
  historyPanel.id = 'profile-history-panel';
  historyPanel.className = 'profile-history';
  historyPanel.hidden = true;
  content.append(historyPanel);
  const tabs = [
    {name:'profile', tab:$('.profile-tabs a[href="#profile"]'), panel:profilePanel},
    {name:'achievements', tab:$('.profile-tabs a[href="#achievements"]'), panel:achievementsPanel},
    {name:'history', tab:$('.profile-tabs a[href="#history"]'), panel:historyPanel},
  ];
  const formatDate = value => {
    if(!value) return '?';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'}) : '?';
  };
  function renderHistory() {
    const rows = [...enrollments].sort((a,b) => (Date.parse(b.enrolledAt || b.start) || 0) - (Date.parse(a.enrolledAt || a.start) || 0));
    historyPanel.innerHTML = `<div class="section-head"><div><span class="eyebrow">YOUR LEARNING JOURNEY</span><h2>Learning History</h2><p>Your enrolled courses, progress, and completion dates.</p></div></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Course</th><th>Enrolled</th><th>Status</th><th>Progress</th><th>Completed</th><th>Access ends</th></tr></thead><tbody>${rows.map(e => {
      const total = e.curriculum?.length || 0;
      const done = e.done?.length || 0;
      const percent = total ? Math.min(100, Math.round(done / total * 100)) : 0;
      return `<tr><td><strong>${esc(e.courseTitle || 'Course')}</strong></td><td>${esc(formatDate(e.enrolledAt || e.start))}</td><td><span class="history-status">${esc(e.status || 'Active')}</span></td><td><div class="history-progress"><progress value="${percent}" max="100" aria-label="${esc(e.courseTitle || 'Course')} progress"></progress><span>${total ? `${percent}% ? ${done}/${total} modules` : 'Progress unavailable'}</span></div></td><td>${esc(formatDate(e.completedAt))}</td><td>${esc(formatDate(e.expiresAt))}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty"><h3>Your learning journey starts here.</h3><p>No course enrollments yet.</p><a class="btn" href="#explore">Explore courses</a></div>'}`;
  }
  let disposeAchievements, historyRendered = false;
  function selectTab(name) {
    const selected = tabs.find(item => item.name === name && item.tab)?.name || 'profile';
    for(const {name,tab,panel} of tabs) {
      const active = name === selected;
      panel.hidden = !active;
      if(!tab) continue;
      tab.classList.toggle('active', active);
      if(active) tab.setAttribute('aria-current', 'true');
      else tab.removeAttribute('aria-current');
      tab.setAttribute('aria-expanded', String(active));
    }
    if(selected === 'history' && !historyRendered) { renderHistory(); historyRendered = true; }
    if(selected === 'achievements' && !disposeAchievements) {
      disposeAchievements = mountAchievements?.(achievementsPanel) || (() => {});
      if(!mountAchievements) achievementsPanel.innerHTML = '<div class="empty"><h2>Badges &amp; Certificates</h2><p>No certificates are available in this demo.</p></div>';
    }
  }
  for(const {name,tab,panel} of tabs) {
    if(!tab) continue;
    tab.setAttribute('aria-controls', panel.id);
    tab.onclick = event => { event.preventDefault(); selectTab(name); };
  }
  selectTab(initialTab);
  return () => { disposed = true; disposeAchievements?.(); root.classList.remove('profile-page'); };
}
