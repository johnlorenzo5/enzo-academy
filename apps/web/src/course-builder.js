import { validateModules, youtubeId } from '@enzo/domain';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc = escapeHtml;
const uid = () => crypto.randomUUID();
const option = () => ({ id: uid(), text: '' });
const question = () => ({ id: uid(), type: 'choice', prompt: '', points: 1, options: [option(), option(), option()], correct: [], answers: [] });
const newModule = () => ({ id: uid(), title: 'New module', content: '', exercise: '', passPercent: 100, questions: [] });
const newActivity = type => ({ ...newModule(), title: `New ${type}`, type, videoId: '', estimatedMinutes: 0, transcript: '', resources: [] });

export function modulesFor(course, lessons = {}) {
  return course.modules ?? course.topics.map((title, index) => ({
    id: `${course.id}-module-${index}`, title,
    content: lessons[course.id]?.[index]?.[0] ?? `Learn the essentials of ${title.toLowerCase()}.`,
    exercise: lessons[course.id]?.[index]?.[1] ?? `Apply ${title.toLowerCase()} in a practical exercise.`,
    passPercent: 100, questions: [],
  }));
}

export function mountCourseBuilder(root, course, { onSave, onCancel, onChange = () => {}, initialSelected = 0, restored = false }) {
  const draft = structuredClone(course.modules);
  let selected = Math.max(0, Math.min(initialSelected, draft.length - 1));
  let dirty = restored;
  let selectedActivity = 0;
  const changed = () => { dirty = true; onChange(structuredClone(draft), selected); };
  function render() {
    const parent = draft[selected];
    selectedActivity = Math.min(selectedActivity, (parent.activities?.length ?? 1) - 1);
    const module = parent.activities?.[selectedActivity] ?? parent;
    root.innerHTML = `<form id="module-builder" class="module-builder">
      <span class="eyebrow">COURSE STUDIO</span><h2>Modules & quizzes</h2><p>${esc(course.title)}</p>
      <p class="muted">Saved changes apply to new enrollments. Existing learners keep their original modules.</p>
      <div class="builder-toolbar"><button type="button" class="btn secondary" data-action="add-module" ${draft.length >= 50 ? 'disabled' : ''}>Add module</button><span>${draft.length}/50 modules</span></div>
      <div class="module-tabs" aria-label="Select a module">${draft.map((item, index) => `<button type="button" class="chip ${index === selected ? 'active' : ''}" data-module="${index}">${index + 1}. ${esc(item.title || 'Untitled')}</button>`).join('')}</div>
      <div class="builder-toolbar"><strong>Module ${selected + 1}</strong><button type="button" data-action="up" ${selected === 0 ? 'disabled' : ''}>Move up</button><button type="button" data-action="down" ${selected === draft.length - 1 ? 'disabled' : ''}>Move down</button><button type="button" class="danger-link" data-action="remove-module" ${draft.length === 1 ? 'disabled' : ''}>Remove module</button></div>
      ${parent.activities ? `<label class="field">Module title<input data-parent-title maxlength="120" required value="${esc(parent.title)}"></label>
      <div class="activity-tabs" aria-label="Select an activity">${parent.activities.map((a,i)=>`<button type="button" class="chip ${i===selectedActivity?'active':''}" data-activity="${i}">${i+1}. ${esc(a.title)} <small>${esc(a.type)}</small></button>`).join('')}</div>
      <div class="builder-toolbar"><strong>Add activity</strong>${['video','reading','practice','quiz'].map(type=>`<button type="button" data-add-activity="${type}" ${parent.activities.length>=50?'disabled':''}>+ ${type}</button>`).join('')}</div>
      <div class="builder-toolbar"><span>Activity ${selectedActivity+1} · ${esc(module.type)}</span><button type="button" data-action="activity-up" ${selectedActivity===0?'disabled':''}>Move earlier</button><button type="button" data-action="activity-down" ${selectedActivity===parent.activities.length-1?'disabled':''}>Move later</button><button type="button" data-action="remove-activity" ${parent.activities.length===1?'disabled':''}>Remove activity</button></div>` : `<div class="activity-upgrade"><strong>Build a guided learning path</strong><p>Add embedded videos, readings, practice and quizzes that unlock in order. Existing enrollments keep their original modules.</p><button type="button" class="btn secondary" data-action="convert-activities">Build ordered activities</button></div>`}
      <label class="field">${parent.activities?'Activity':'Module'} title<input data-module-field="title" maxlength="120" required value="${esc(module.title)}"></label>
      ${module.type==='video'?`<label class="field">YouTube URL or video ID<input data-module-field="videoId" required value="${esc(module.videoId)}" placeholder="https://www.youtube.com/watch?v=..."></label><button type="button" class="btn secondary" data-action="preview-video">Preview video</button><div id="video-preview"></div><p class="muted">Use an embeddable recorded video. Completion requires 95% distinct playback coverage and reaching the end. Playback up to 2× is supported.</p>`:''}
      <label class="field">${module.type==='video'?'Description (optional)':'Lesson content / instructions'}<textarea data-module-field="content" maxlength="20000" ${module.type==='video'?'':'required'}>${esc(module.content)}</textarea></label>
      ${parent.activities?`<label class="field">Estimated minutes (0 if unknown)<input type="number" min="0" max="600" data-module-field="estimatedMinutes" value="${module.estimatedMinutes}" required></label><details class="activity-extras"><summary>Transcript and resources</summary><label class="field">Transcript<textarea data-module-field="transcript" maxlength="30000">${esc(module.transcript)}</textarea></label>${module.resources.map((r,i)=>`<div class="resource-editor"><input aria-label="Resource title" data-resource="${i}" data-resource-field="title" placeholder="Resource title" maxlength="120" required value="${esc(r.title)}"><input aria-label="Resource HTTPS link" data-resource="${i}" data-resource-field="url" type="url" placeholder="https://..." required value="${esc(r.url)}"><button type="button" data-remove-resource="${i}" aria-label="Remove resource">×</button></div>`).join('')}<button type="button" data-action="add-resource" ${module.resources.length>=10?'disabled':''}>Add resource link</button></details>`:''}
      <label class="field">Practice instructions (optional)<textarea data-module-field="exercise" maxlength="5000">${esc(module.exercise)}</textarea></label>
      ${!module.type||module.type==='quiz'?`
      <label class="field">Quiz passing score (%)<input data-module-field="passPercent" type="number" min="1" max="100" required value="${module.passPercent}"></label>
      <h3>Quiz questions</h3><p class="muted">Choose the correct answers below. All questions are required. Checkbox questions award points only for an exact match. A module without questions uses practice notes for completion.</p>
      ${module.questions.map((q, index) => `<section class="question-card" data-question="${index}">
        <div class="builder-toolbar"><strong>Question ${index + 1}</strong><button type="button" data-action="duplicate-question">Duplicate</button><button type="button" class="danger-link" data-action="remove-question">Remove question</button></div>
        <label class="field">Question<input data-question-field="prompt" maxlength="1000" required value="${esc(q.prompt)}"></label>
        <div class="question-settings"><label class="field">Answer type<select data-question-field="type">${[['choice','Multiple choice (one answer)'],['checkbox','Checkboxes (multiple answers)'],['identification','Identification (short answer)']].map(([type, label]) => `<option value="${type}" ${q.type === type ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field">Points<input type="number" min="1" max="100" required data-question-field="points" value="${q.points}"></label></div>
        ${q.type === 'identification' ? `<label class="field">Accepted answers (one per line)<textarea data-question-field="answers" required>${esc(q.answers.join('\n'))}</textarea><small>Capitalization and extra spaces are ignored.</small></label>` : `<fieldset class="answer-key"><legend>Answer key — select ${q.type === 'choice' ? 'one correct answer' : 'all correct answers'}</legend>${q.options.map((o, oi) => `<div class="option-row"><input aria-label="Option ${oi + 1} is correct" type="${q.type === 'choice' ? 'radio' : 'checkbox'}" name="correct-${q.id}" data-correct="${esc(o.id)}" ${q.correct.includes(o.id) ? 'checked' : ''}><span>${String.fromCharCode(65 + oi)}.</span><input aria-label="Option ${oi + 1} text" data-option="${esc(o.id)}" maxlength="300" required value="${esc(o.text)}"><button type="button" aria-label="Remove option ${oi + 1}" data-remove-option="${esc(o.id)}" ${q.options.length <= 2 ? 'disabled' : ''}>×</button></div>`).join('')}<button type="button" data-action="add-option" ${q.options.length >= 10 ? 'disabled' : ''}>Add option</button></fieldset>`}
      </section>`).join('')}
      <button type="button" class="btn secondary" data-action="add-question" ${module.questions.length >= 50 ? 'disabled' : ''}>Add question</button>
      `:''}
      <p id="builder-error" class="auth-error" role="alert"></p>
      <div class="builder-footer"><button type="button" class="btn secondary" data-action="cancel">Cancel</button><button class="btn">Save modules & quizzes</button></div>
    </form>`;
    const form = root.querySelector('form');
    form.oninput = event => {
      const input = event.target;
      const q = module.questions[Number(input.closest('[data-question]')?.dataset.question)];
      if (input.hasAttribute('data-parent-title')) parent.title = input.value;
      if (input.dataset.resourceField) module.resources[Number(input.dataset.resource)][input.dataset.resourceField] = input.value;
      if (input.dataset.moduleField) module[input.dataset.moduleField] = ['passPercent','estimatedMinutes'].includes(input.dataset.moduleField) ? Number(input.value) : input.value;
      if (input.dataset.questionField && input.dataset.questionField !== 'type') q[input.dataset.questionField] = input.dataset.questionField === 'points' ? Number(input.value) : input.dataset.questionField === 'answers' ? input.value.split('\n').map(x => x.trim()).filter(Boolean) : input.value;
      if (input.dataset.option) q.options.find(o => o.id === input.dataset.option).text = input.value;
      if (input.dataset.correct) q.correct = q.type === 'choice' ? [input.dataset.correct] : q.options.filter(o => form.querySelector(`[data-correct="${o.id}"]`).checked).map(o => o.id);
      changed();
    };
    form.onchange = event => {
      if (event.target.dataset.questionField !== 'type') return;
      const q = module.questions[Number(event.target.closest('[data-question]').dataset.question)];
      q.type = event.target.value; q.correct = []; changed(); render();
    };
    form.onclick = event => {
      const button = event.target.closest('button[type="button"]');
      if (!button) return;
      if (button.dataset.module !== undefined) { selected = Number(button.dataset.module); selectedActivity=0; if (dirty) onChange(structuredClone(draft), selected); render(); return; }
      if (button.dataset.activity !== undefined) { selectedActivity=Number(button.dataset.activity); render(); return; }
      if (button.dataset.addActivity && parent.activities.length<50) { parent.activities.push(newActivity(button.dataset.addActivity)); selectedActivity=parent.activities.length-1; changed(); render(); return; }
      if (button.dataset.removeResource !== undefined) { module.resources.splice(Number(button.dataset.removeResource),1); changed(); render(); return; }
      const index = Number(button.closest('[data-question]')?.dataset.question);
      const q = module.questions[index];
      switch (button.dataset.action) {
        case 'convert-activities': {
          const reading={...newActivity('reading'),title:parent.title,content:parent.content||'Add your reading here.'};
          const assessment={...newActivity(parent.questions.length?'quiz':'practice'),title:parent.questions.length?'Knowledge check':'Put it into practice',content:parent.exercise||'Complete this activity to continue.',questions:structuredClone(parent.questions),passPercent:parent.passPercent};
          parent.activities=[reading,assessment]; selectedActivity=0; break;
        }
        case 'activity-up': case 'activity-down': {
          const next=selectedActivity+(button.dataset.action==='activity-up'?-1:1);
          if(next>=0&&next<parent.activities.length){[parent.activities[selectedActivity],parent.activities[next]]=[parent.activities[next],parent.activities[selectedActivity]];selectedActivity=next;} break;
        }
        case 'remove-activity': if(parent.activities.length>1 && confirm('Remove this activity from the draft?')){parent.activities.splice(selectedActivity,1);selectedActivity=Math.max(0,selectedActivity-1);} break;
        case 'add-resource': if(module.resources.length<10)module.resources.push({title:'',url:''}); break;
        case 'preview-video': {
          const id=youtubeId(module.videoId); const box=root.querySelector('#video-preview');
          box.innerHTML=id?`<iframe class="video-preview" title="Video preview" src="https://www.youtube-nocookie.com/embed/${id}" allow="encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`:'<p class="auth-error" role="alert">Enter a valid YouTube URL first.</p>'; return;
        }
        case 'add-module': if (draft.length < 50) { draft.push(newModule()); selected = draft.length - 1; } break;
        case 'remove-module': if (draft.length > 1 && confirm('Remove this module from the draft?')) { draft.splice(selected, 1); selected = Math.min(selected, draft.length - 1); } break;
        case 'up': case 'down': {
          const next = selected + (button.dataset.action === 'up' ? -1 : 1);
          if (next >= 0 && next < draft.length) { [draft[selected], draft[next]] = [draft[next], draft[selected]]; selected = next; } break;
        }
        case 'add-question': if (module.questions.length < 50) module.questions.push(question()); break;
        case 'duplicate-question': if (module.questions.length < 50) { const copy = structuredClone(q); copy.id = uid(); const remap = new Map(copy.options.map(o => [o.id, uid()])); copy.options.forEach(o => o.id = remap.get(o.id)); copy.correct = copy.correct.map(id => remap.get(id)); module.questions.splice(index + 1, 0, copy); } break;
        case 'remove-question': module.questions.splice(index, 1); break;
        case 'add-option': if (q.options.length < 10) q.options.push(option()); break;
        case 'cancel': if (!dirty || confirm('Discard unsaved module changes?')) onCancel(); return;
      }
      if (button.dataset.removeOption && q.options.length > 2) { q.options = q.options.filter(o => o.id !== button.dataset.removeOption); q.correct = q.correct.filter(id => id !== button.dataset.removeOption); }
      changed(); render();
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('button:not([type])');
      submit.disabled = true;
      try { validateModules(draft); await onSave(structuredClone(draft)); dirty = false; }
      catch (error) { const box = root.querySelector('#builder-error'); if (box) box.textContent = error.message; }
      finally { submit.disabled = false; }
    };
  }
  render();
  return { hasChanges: () => dirty };
}
