const icons = {
  dashboard: '<rect x="3" y="3" width="18" height="12" rx="1"/><path d="M8 21v-6m8 6v-6M3 9h18M6 18l-3 3m3-3 3 3"/>',
  news: '<rect x="4" y="3" width="17" height="18" rx="1"/><path d="M4 7H1v14h17M8 7h9M8 11h9M8 15h3m3 0h3M8 18h9"/>',
  profile: '<circle cx="12" cy="7" r="4"/><path d="M3 22v-4c0-5 18-5 18 0v4"/>',
  language: '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20"/>',
  support: '<path d="M21 11a9 9 0 0 1-9 9H3l1-5a9 9 0 1 1 17-4Z"/><path d="M8 9h8m-8 4h5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Factory function: each call creates a menu with its own state and returns an
// object containing methods to control it.
export function createAccountMenu(button, {onLogout, onProfile, certificates = true}) {
  const document = button.ownerDocument;
  const window = document.defaultView;
  const drawer = document.createElement('dialog');
  drawer.id = 'account-drawer';
  drawer.className = 'account-drawer';
  drawer.setAttribute('aria-label', 'Your account');
  document.body.append(drawer);
  button.setAttribute('aria-controls', drawer.id);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  let user;
  const close = () => { drawer.close(); button.setAttribute('aria-expanded', 'false'); };
  drawer.addEventListener('close', () => { button.setAttribute('aria-expanded', 'false'); button.focus(); });
  drawer.addEventListener('click', event => {
    if (event.target === drawer) {
      const bounds = drawer.getBoundingClientRect();
      if(event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }
    if(event.target.closest('[data-account-close]')) close();
    if(event.target.closest('[data-account-profile]')) { close(); onProfile?.(); }
    if(event.target.closest('a')) close();
    const logout = event.target.closest('[data-account-logout]');
    if(logout) {
      drawer.querySelectorAll('[data-account-logout]').forEach(item => item.disabled = true);
      Promise.resolve().then(onLogout).then(close).catch(error => {
        drawer.querySelector('[role="alert"]').textContent = error.message || 'Unable to log out. Please try again.';
        drawer.querySelectorAll('[data-account-logout]').forEach(item => item.disabled = false);
      });
    }
  });
  window.addEventListener('hashchange', () => { if(drawer.open) close(); });
  const row = (label, href, action = '') => href
    ? `<a class="account-row" href="${href}">${label}<span aria-hidden="true">›</span></a>`
    : `<button class="account-row" ${action || 'disabled title="Not yet available"'}>${label}<span aria-hidden="true">›</span></button>`;
  const section = (name, title, rows) => `<section class="account-section"><h3>${icon(name)}${title}</h3>${rows}</section>`;
  return {
    update(nextUser) {
      user = nextUser;
      const learningLink = document.querySelector('header nav a[href="#learning"]');
      if(learningLink) learningLink.hidden = !user;
      button.classList.toggle('signed-out', !user);
      button.classList.toggle('account-trigger', !!user);
      button.setAttribute('aria-label', user ? 'Open your account' : 'Log in');
      if (!user) { button.textContent = 'Log in'; if(drawer.open) close(); return; }
      const initials = user.name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
      const avatar = `<span class="account-avatar">${user.photoURL ? `<img src="${escape(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : escape(initials)}</span>`;
      const role = user.role === 'admin' ? 'Administrator' : 'Learner';
      button.innerHTML = `${avatar}<span class="account-trigger-copy"><strong>${escape(user.name)}</strong><small>${role}</small></span>`;
      drawer.innerHTML = `<div class="account-drawer-header">${avatar}<span id="account-name">${escape(user.name)}</span><button class="account-logout-top" data-account-logout><span aria-hidden="true">↪</span> Logout</button><button class="account-dismiss" data-account-close aria-label="Close account menu">×</button></div><div class="account-drawer-body">${section('dashboard', 'Dashboard', row(user.role === 'admin' ? 'Administration' : 'My Learning', user.role === 'admin' ? '#admin' : '#learning'))}${section('news', 'News', row('For Learners'))}${section('profile', 'Profile', row('Update Profile', null, 'data-account-profile') + row('Badges &amp; Certificates', certificates ? '#achievements' : null) + row('Discounts') + row('Learning History', '#history') + row('Transcript'))}<section class="account-section account-language"><h3>${icon('language')}Language</h3><span>English (English)</span></section>${section('support', 'Support', row('Support') + row('Feedback'))}<button id="logout" class="account-logout-bottom" data-account-logout>Logout</button><p class="account-error" role="alert"></p></div>`;
    },
    open() { if(user && !drawer.open) { drawer.showModal(); button.setAttribute('aria-expanded', 'true'); } },
    close,
  };
}
