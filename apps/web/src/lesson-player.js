import { gradeModule } from '@enzo/domain';
import { escapeHtml as esc } from './course-builder.js';

export function lessonMarkup(module, attempt) {
  return `<div class="lesson-text"><h3>${esc(module.title)}</h3><p class="preserve-lines">${esc(module.content)}</p>${module.exercise ? `<strong>Try it yourself</strong><p class="preserve-lines">${esc(module.exercise)}</p>` : ''}</div>
    ${module.questions.length ? `<h3>Module quiz</h3><p>Passing score: ${module.passPercent}%. You can retry while your enrollment is active.</p>
    ${attempt ? `<div class="quiz-result" role="status"><strong>${attempt.passed ? 'Passed' : 'Try again'}: ${attempt.earned}/${attempt.possible} points (${attempt.percent}%)</strong><p>${attempt.passed ? 'This module is complete.' : 'Review the lesson and submit another attempt.'}</p></div>` : ''}
    <form id="quiz-form">${module.questions.map((q, i) => `<fieldset class="question-card"><legend>${i + 1}. ${esc(q.prompt)} (${q.points} ${q.points === 1 ? 'point' : 'points'})</legend>
      ${q.type === 'identification' ? `<label class="field">Your answer<input name="${esc(q.id)}" maxlength="200" required autocomplete="off"></label>` : `<p class="muted">${q.type === 'choice' ? 'Choose one answer.' : 'Select all correct answers. Exact matches receive points.'}</p>${q.options.map((o, oi) => `<label class="quiz-option"><input type="${q.type === 'choice' ? 'radio' : 'checkbox'}" name="${esc(q.id)}" value="${esc(o.id)}" ${q.type === 'choice' ? 'required' : ''}><span>${String.fromCharCode(65 + oi)}. ${esc(o.text)}</span></label>`).join('')}`}
      ${attempt ? `<small>${attempt.results.find(r => r.questionId === q.id)?.correct ? 'Correct on last attempt' : 'Incorrect on last attempt'}</small>` : ''}</fieldset>`).join('')}
      <p id="quiz-error" class="auth-error" role="alert"></p><button class="btn wide">Submit quiz</button></form>` : `<form id="exercise"><label class="field">Your practice notes or solution<textarea id="notes" required minlength="10" placeholder="Record what you built or learned (at least 10 characters)."></textarea></label><button class="btn wide">Save & mark module complete</button></form>`}`;
}

export function collectResponses(module, form) {
  const responses = {};
  for (const q of module.questions) {
    const controls = Array.from(form.elements).filter(input => input.name === q.id);
    const response = q.type === 'identification' ? controls[0].value.trim() : controls.filter(input => input.checked).map(input => input.value);
    if (!response.length) throw new Error('Answer every question before submitting.');
    responses[q.id] = response;
  }
  return responses;
}

export function readQuiz(module, form) { const responses=collectResponses(module,form); return {responses,...gradeModule(module,responses)}; }
