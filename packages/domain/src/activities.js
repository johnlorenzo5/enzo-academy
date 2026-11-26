// Shared curriculum helpers. Legacy modules remain a single activity, preserving IDs and credit.
export function activitiesFor(module) {
  return module.activities ?? [{ ...module, type: 'legacy', estimatedMinutes: 0, transcript: '', resources: [] }];
}

export function curriculumItems(curriculum) {
  return curriculum.flatMap((module, moduleIndex) => activitiesFor(module).map(activity => ({ activity, moduleIndex, module })));
}

export function activityComplete(enrollment, activity, moduleIndex) {
  return enrollment.done.includes(moduleIndex) || Boolean(enrollment.activityProgress?.[activity.id]?.completedAt);
}

// Function: accepts a video ID or URL and returns a valid YouTube ID, or null.
export function youtubeId(value) {
  if (typeof value !== 'string') return null;
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    let id;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(embed|shorts)\/([\w-]+)$/.exec(url.pathname)?.[2];
    }
    return /^[\w-]{11}$/.test(id ?? '') ? id : null;
  } catch { return null; }
}

export function resourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}

export function validateActivity(activity) {
  if (!activity || !['video', 'reading', 'practice', 'quiz'].includes(activity.type)) throw new Error('Choose a supported activity type.');
  if (activity.activities !== undefined) throw new Error('Activities cannot contain nested activities.');
  if (typeof activity.content !== 'string' || activity.content.length > 20000) throw new Error('Activity content must be at most 20,000 characters.');
  if (activity.type !== 'video' && !activity.content.trim()) throw new Error('Add activity content or instructions.');
  if (activity.type === 'video' && !youtubeId(activity.videoId)) throw new Error('Enter a valid YouTube video URL or ID.');
  if (activity.type === 'quiz' && !activity.questions?.length) throw new Error('Add at least one quiz question.');
  if (activity.type !== 'quiz' && activity.questions?.length) throw new Error('Questions belong in a quiz activity.');
  if (!Number.isInteger(activity.estimatedMinutes) || activity.estimatedMinutes < 0 || activity.estimatedMinutes > 600) throw new Error('Estimated minutes must be between 0 and 600.');
  if (typeof activity.transcript !== 'string' || activity.transcript.length > 30000) throw new Error('Transcript must be at most 30,000 characters.');
  if (!Array.isArray(activity.resources) || activity.resources.length > 10 || activity.resources.some(r => !r || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 120 || typeof r.url !== 'string' || r.url.length > 2000 || !resourceUrl(r.url))) throw new Error('Add up to 10 resources with a title and an HTTPS link.');
}
