import { validateActivity } from './activities.js';

export function moduleCount(course, enrollment) {
  return enrollment?.curriculum?.length ?? course.modules?.length ?? course.topics?.length ?? 4;
}

export function validateModules(modules) {
  if (!Array.isArray(modules) || !modules.length || modules.length > 50) throw new Error('Add between 1 and 50 modules.');
  const ids = new Set();
  const activityIds = new Set(modules.map(m => m?.id));
  let activityCount = 0;
  for (const module of modules) {
    if (!module.id || ids.has(module.id)) throw new Error('Each module needs a unique ID.');
    ids.add(module.id);
    if (!module.title?.trim() || module.title.length > 120) throw new Error('Module titles must contain 1–120 characters.');
    if (module.activities !== undefined) {
      if (!Array.isArray(module.activities) || !module.activities.length || module.activities.length > 50) throw new Error('Add between 1 and 50 activities per module.');
      activityCount += module.activities.length;
      for (const activity of module.activities) {
        validateActivity(activity);
        if (!activity.id || activityIds.has(activity.id)) throw new Error('Activities need unique IDs across the course.');
        activityIds.add(activity.id);
        validateModules([{ ...activity, content: activity.content || 'Video lesson' }]);
      }
      continue;
    }
    activityCount++;
    if (!module.content?.trim() || module.content.length > 20000) throw new Error(`${module.title}: add lesson content (up to 20,000 characters).`);
    if (!Number.isInteger(module.passPercent) || module.passPercent < 1 || module.passPercent > 100) throw new Error('Passing score must be a whole number from 1 to 100.');
    if (!Array.isArray(module.questions) || module.questions.length > 50) throw new Error('Use at most 50 questions per module.');
    const questionIds = new Set();
    for (const question of module.questions) {
      if (!question.id || questionIds.has(question.id)) throw new Error('Each question needs a unique ID.');
      questionIds.add(question.id);
      if (!question.prompt?.trim() || question.prompt.length > 1000) throw new Error('Each question needs a prompt of up to 1,000 characters.');
      if (!Number.isInteger(question.points) || question.points < 1 || question.points > 100) throw new Error('Question points must be a whole number from 1 to 100.');
      if (question.type === 'identification') {
        if (!Array.isArray(question.answers) || !question.answers.length || question.answers.length > 20 || question.answers.some(answer => typeof answer !== 'string' || !answer.trim() || answer.length > 200)) throw new Error('Add 1–20 accepted identification answers, up to 200 characters each.');
      } else if (['choice', 'checkbox'].includes(question.type)) {
        if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 10) throw new Error('Choice questions need 2–10 options.');
        const optionIds = new Set(question.options.map(option => option.id));
        if (optionIds.size !== question.options.length || question.options.some(option => !option.id || !option.text?.trim() || option.text.length > 300)) throw new Error('Every option needs a unique ID and text of up to 300 characters.');
        if (!Array.isArray(question.correct) || !question.correct.length || new Set(question.correct).size !== question.correct.length || question.correct.some(id => !optionIds.has(id)) || (question.type === 'choice' && question.correct.length !== 1)) throw new Error('Select the correct answer(s) for every question. Multiple choice needs exactly one.');
      } else throw new Error('Choose a supported question type.');
    }
  }
  if (activityCount > 100) throw new Error('Use at most 100 activities per course.');
  return modules;
}

const normalizeText = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export function gradeModule(module, responses) {
  validateModules([module]);
  if (!module.questions.length) throw new Error('This module has no quiz.');
  const results = module.questions.map(question => {
    const response = responses?.[question.id];
    let correct = false;
    if (question.type === 'identification') {
      correct = typeof response === 'string' && question.answers.some(answer => normalizeText(answer) === normalizeText(response));
    } else if (Array.isArray(response) && response.every(value => typeof value === 'string')) {
      correct = response.length === new Set(response).size && response.length === question.correct.length && question.correct.every(id => response.includes(id));
    }
    return { questionId: question.id, correct, earned: correct ? question.points : 0, possible: question.points };
  });
  const earned = results.reduce((sum, item) => sum + item.earned, 0);
  const possible = results.reduce((sum, item) => sum + item.possible, 0);
  return { earned, possible, percent: Math.round(earned / possible * 100), passed: earned * 100 >= possible * module.passPercent, results };
}
