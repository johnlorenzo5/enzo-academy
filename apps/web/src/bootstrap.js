// The original browser-local demo remains explicitly available for existing data.
if (new URLSearchParams(location.search).get('demo') === '1') {
  document.querySelector('footer small').textContent = 'Local demo · Progress saved in this browser';
  await import('./main.js');
} else {
  await import('./cloud.js');
}
