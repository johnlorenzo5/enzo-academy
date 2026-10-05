import { validateModules } from '@enzo/domain';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc = escapeHtml;
const uid = () => crypto.randomUUID();
const option = () => ({ id: uid(), text: '' });
const question = () => ({ id: uid(), type: 'choice', prompt: '', points: 1, options: [option(), option(), option()], correct: [], answers: [] });
const newModule = () => ({ id: uid(), title: 'New module', content: '', exercise: '', passPercent: 100, questions: [] });

export function modulesFor(course, lessons = {}) {
  return course.modules ?? course.topics.map((title, index) => ({
    id: `${course.id}-module-${index}`, title,
    content: lessons[course.id]?.[index]?.[0] ?? `Learn the essentials of ${title.toLowerCase()}.`,
    exercise: lessons[course.id]?.[index]?.[1] ?? `Apply ${title.toLowerCase()} in a practical exercise.`,
    passPercent: 100, questions: [],
  }));
}

export function mountCourseBuilder(root, course, { onSave, onCancel }) {
  const draft = structuredClone(course.modules);
  let selected = 0;
  let dirty = false;
  function render() {
    const module = draft[selected];
    root.innerHTML = `<form id="module-builder" class="module-builder">
      <span class="eyebrow">COURSE STUDIO</span><h2>Modules & quizzes</h2><p>${esc(course.title)}</p>
      <p class="muted">Saved changes apply to new enrollments. Existing learners keep their original modules.</p>
      <div class="builder-toolbar"><button type="button" class="btn secondary" data-action="add-module" ${draft.length >= 50 ? 'disabled' : ''}>Add module</button><span>${draft.length}/50 modules</span></div>
      <div class="module-tabs" aria-label="Select a module">${draft.map((item, index) => `<button type="button" class="chip ${index === selected ? 'active' : ''}" data-module="${index}">${index + 1}. ${esc(item.title || 'Untitled')}</button>`).join('')}</div>
      <div class="builder-toolbar"><strong>Module ${selected + 1}</strong><button type="button" data-action="up" ${selected === 0 ? 'disabled' : ''}>Move up</button><button type="button" data-action="down" ${selected === draft.length - 1 ? 'disabled' : ''}>Move down</button><button type="button" class="danger-link" data-action="remove-module" ${draft.length === 1 ? 'disabled' : ''}>Remove module</button></div>
      <label class="field">Module title<input data-module-field="title" maxlength="120" required value="${esc(module.title)}"></label>
      <label class="field">Lesson content<textarea data-module-field="content" maxlength="20000" required>${esc(module.content)}</textarea></label>
      <label class="field">Practice instructions (optional)<textarea data-module-field="exercise" maxlength="5000">${esc(module.exercise)}</textarea></label>
      <label class="field">Quiz passing score (%)<input data-module-field="passPercent" type="number" min="1" max="100" required value="${module.passPercent}"></label>
      <h3>Quiz questions</h3><p class="muted">Choose the correct answers below. All questions are required. Checkbox questions award points only for an exact match. A module without questions uses practice notes for completion.</p>
      ${module.questions.map((q, index) => `<section class="question-card" data-question="${index}">
        <div class="builder-toolbar"><strong>Question ${index + 1}</strong><button type="button" data-action="duplicate-question">Duplicate</button><button type="button" class="danger-link" data-action="remove-question">Remove question</button></div>
        <label class="field">Question<input data-question-field="prompt" maxlength="1000" required value="${esc(q.prompt)}"></label>
        <div class="question-settings"><label class="field">Answer type<select data-question-field="type">${[['choice','Multiple choice (one answer)'],['checkbox','Checkboxes (multiple answers)'],['identification','Identification (short answer)']].map(([type, label]) => `<option value="${type}" ${q.type === type ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field">Points<input type="number" min="1" max="100" required data-question-field="points" value="${q.points}"></label></div>
        ${q.type === 'identification' ? `<label class="field">Accepted answers (one per line)<textarea data-question-field="answers" required>${esc(q.answers.join('\n'))}</textarea><small>Capitalization and extra spaces are ignored.</small></label>` : `<fieldset class="answer-key"><legend>Answer key — select ${q.type === 'choice' ? 'one correct answer' : 'all correct answers'}</legend>${q.options.map((o, oi) => `<div class="option-row"><input aria-label="Option ${oi + 1} is correct" type="${q.type === 'choice' ? 'radio' : 'checkbox'}" name="correct-${q.id}" data-correct="${esc(o.id)}" ${q.correct.includes(o.id) ? 'checked' : ''}><span>${String.fromCharCode(65 + oi)}.</span><input aria-label="Option ${oi + 1} text" data-option="${esc(o.id)}" maxlength="300" required value="${esc(o.text)}"><button type="button" aria-label="Remove option ${oi + 1}" data-remove-option="${esc(o.id)}" ${q.options.length <= 2 ? 'disabled' : ''}>×</button></div>`).join('')}<button type="button" data-action="add-option" ${q.options.length >= 10 ? 'disabled' : ''}>Add option</button></fieldset>`}
      </section>`).join('')}
      <button type="button" class="btn secondary" data-action="add-question" ${module.questions.length >= 50 ? 'disabled' : ''}>Add question</button>
      <p id="builder-error" class="auth-error" role="alert"></p>
      <div class="builder-footer"><button type="button" class="btn secondary" data-action="cancel">Cancel</button><button class="btn">Save modules & quizzes</button></div>
    </form>`;
    const form = root.querySelector('form');
    form.oninput = event => {
      const input = event.target;
      const q = module.questions[Number(input.closest('[data-question]')?.dataset.question)];
      if (input.dataset.moduleField) module[input.dataset.moduleField] = input.dataset.moduleField === 'passPercent' ? Number(input.value) : input.value;
      if (input.dataset.questionField && input.dataset.questionField !== 'type') q[input.dataset.questionField] = input.dataset.questionField === 'points' ? Number(input.value) : input.dataset.questionField === 'answers' ? input.value.split('\n').map(x => x.trim()).filter(Boolean) : input.value;
      if (input.dataset.option) q.options.find(o => o.id === input.dataset.option).text = input.value;
      if (input.dataset.correct) q.correct = q.type === 'choice' ? [input.dataset.correct] : q.options.filter(o => form.querySelector(`[data-correct="${o.id}"]`).checked).map(o => o.id);
      dirty = true;
    };
    form.onchange = event => {
      if (event.target.dataset.questionField !== 'type') return;
      const q = module.questions[Number(event.target.closest('[data-question]').dataset.question)];
      q.type = event.target.value; q.correct = []; dirty = true; render();
    };
    form.onclick = event => {
      const button = event.target.closest('button[type="button"]');
      if (!button) return;
      if (button.dataset.module !== undefined) { selected = Number(button.dataset.module); render(); return; }
      const index = Number(button.closest('[data-question]')?.dataset.question);
      const q = module.questions[index];
      switch (button.dataset.action) {
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
      dirty = true; render();
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
