let apiPromise;
export function loadYouTube(window) {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) apiPromise = new Promise((resolve, reject) => {
    const document = window.document;
    const timer = window.setTimeout(() => { apiPromise = undefined; reject(new Error('The video player could not load. Check your connection and reload the lesson.')); }, 20000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { window.clearTimeout(timer); previous?.(); resolve(window.YT); };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { window.clearTimeout(timer); apiPromise = undefined; reject(new Error('YouTube is unavailable. Check your connection and reload the lesson.')); };
    document.head.append(script);
  });
  return apiPromise;
}

// Only credit consecutive samples of normal playback. Seek jumps and long sampling gaps earn no coverage.
export function playedSegment(previous, current) {
  if (!previous || !previous.playing || !current.playing) return null;
  const elapsed = (current.time - previous.time) / 1000;
  const advance = current.position - previous.position;
  if (elapsed <= 0 || elapsed > 3 || advance <= 0 || advance > elapsed * Math.min(2, current.rate) + 0.4) return null;
  return { start: previous.position, end: current.position };
}

export function mountYouTube(root, { videoId, api, endpoint, onSaved, onStatus, complete = false }) {
  const window = root.ownerDocument.defaultView;
  let player, disposed = false, session, starting = false, pending = [], packet, sequence = 0, previous;
  let sampleTimer, saveTimer, sending = false, stopped = false, ended = false, replayRequested = false;
  let acknowledgedPosition = 0, acknowledgedEnd = false;
  const status = message => { if (!disposed) onStatus(message); };
  const fail = error => { stopped = true; player?.pauseVideo?.(); status(error.message); };
  function sample(final = false) {
    if (stopped || disposed || complete) return;
    if (!session) { if(player?.getPlayerState()===1)start(); return; }
    const current = { position: player.getCurrentTime(), rate: player.getPlaybackRate(), time: Date.now(), playing: player.getPlayerState() === 1 || final };
    if (current.rate > 2) { player.setPlaybackRate(2); previous = undefined; return; }
    const segment = playedSegment(previous, current);
    if (segment) {
      const last = pending.at(-1);
      if (last && Math.abs(last.end - segment.start) < 0.05) last.end = segment.end;
      else pending.push(segment);
    }
    previous = current;
  }
  async function save() {
    if (!session || sending || stopped || complete) return;
    if (!packet && !pending.length && Math.abs(player.getCurrentTime()-acknowledgedPosition)<0.05 && (!ended || acknowledgedEnd)) return;
    sending = true;
    if (!packet) {
      packet = { token: session.token, sequence: ++sequence, position: player.getCurrentTime(), ended, ranges: pending };
      pending = [];
    }
    try {
      const result = await api(`${endpoint}/video-progress`, { method: 'POST', body: packet });
      acknowledgedPosition = packet.position; acknowledgedEnd = packet.ended;
      packet = undefined;
      if (!disposed) {
        complete = Boolean(result.enrollment.activityProgress?.[endpoint.split('/').at(-1)]?.completedAt);
        onSaved(result.enrollment);
        status(complete ? 'Video complete. Your progress is saved.' : 'Progress saved automatically. Watch 95% and reach the end to continue.');
      }
    } catch (error) {
      if(error.status>=400 && error.status<500){fail(new Error(`${error.message} Reload this lesson to continue.`));return;}
      // Pause on failure. Retry the exact packet; server sequence numbers make lost responses idempotent.
      player?.pauseVideo?.();
      previous = undefined;
      status(`Progress not saved: ${error.message} Retrying automatically. Keep this lesson open.`);
    } finally { sending = false; }
  }
  async function start() {
    if (session || starting || complete || disposed) return;
    const duration = player.getDuration();
    if (!duration) return;
    starting = true;
    player.pauseVideo();
    try {
      session = await api(`${endpoint}/video-session`, { method: 'POST', body: { duration } });
      if (disposed) return;
      acknowledgedPosition = session.position;
      player.seekTo(replayRequested ? 0 : session.position, true);
      previous = undefined;
      status('Ready. Progress saves automatically. Press Play if the video is paused.');
      player.playVideo();
    } catch (error) { fail(error); }
    finally { starting = false; }
  }
  loadYouTube(window).then(YT => {
    if (disposed) return;
    const target = root.ownerDocument.createElement('div'); root.replaceChildren(target);
    player = new YT.Player(target, {
      host: 'https://www.youtube-nocookie.com', videoId,
      playerVars: { origin: window.location.origin, playsinline: 1, rel: 0 },
      events: {
        onReady: () => { if(disposed)return; status(complete?'Completed video — replay anytime.':'Press Play to load your saved video position.'); },
        onStateChange: event => {
          if (disposed) return;
          if (event.data === 1 && !session && !complete) { start(); return; }
          if (event.data === 1) { sample(); return; }
          if (event.data === 0) { sample(true); ended = true; save(); }
          else if (event.data === 2) { sample(true); previous = undefined; save(); }
          else if (event.data !== 1) previous = undefined;
        },
        onPlaybackRateChange: () => { previous = undefined; if (player.getPlaybackRate() > 2) player.setPlaybackRate(2); },
        onError: () => fail(new Error('This video is unavailable or does not allow embedding. Contact your course administrator.')),
      },
    });
    sampleTimer = window.setInterval(() => sample(), 1000);
    saveTimer = window.setInterval(() => save(), 5000);
  }).catch(fail);
  const visibility = () => { if (root.ownerDocument.hidden) { player?.pauseVideo?.(); previous = undefined; save(); } };
  root.ownerDocument.addEventListener('visibilitychange', visibility);
  return {
    replay() { if (player) { replayRequested = true; previous = undefined; player.seekTo(0, true); player.playVideo(); } },
    dispose() {
      if (disposed) return;
      sample(); save(); disposed = true;
      window.clearInterval(sampleTimer); window.clearInterval(saveTimer);
      root.ownerDocument.removeEventListener('visibilitychange', visibility);
      player?.destroy?.();
    },
  };
}
