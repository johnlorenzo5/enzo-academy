import { curriculumItems, activityComplete } from '@enzo/domain';
import { escapeHtml as esc } from './course-builder.js';
import { lessonMarkup, collectResponses } from './lesson-player.js';
import { mountYouTube } from './youtube-player.js';

const labels = { video: 'Video', reading: 'Reading', practice: 'Practice', quiz: 'Quiz', legacy: 'Lesson & assessment' };
const icons = { video: '▶', reading: '▤', practice: '✎', quiz: '?' , legacy: '▤' };
export function mountLearningWorkspace(root, { enrollment, activityId, api, onUpdate, onNavigate, videoFactory = mountYouTube }) {
  let e = enrollment, video, disposed = false, lastTree;
  const document = root.ownerDocument;
  const $ = selector => root.querySelector(selector);
  let items = curriculumItems(e.curriculum);
  let selected = activityId ? items.findIndex(({activity}) => activity.id === activityId) : items.findIndex(({activity,moduleIndex}) => !activityComplete(e,activity,moduleIndex));
  if (selected < 0) selected = 0;
  const a = items[selected]?.activity;
  if (!a) { root.innerHTML='<div class="empty">This course has no activities yet.</div>'; return ()=>{}; }
  const endpoint = `/enrollments/${encodeURIComponent(e.courseId)}/activities/${encodeURIComponent(a.id)}`;
  const done = item => activityComplete(e,item.activity,item.moduleIndex);
  const locked = (item,index) => ['Expired','Cancelled'].includes(e.status) || item.activity.locked || (!done(item) && items.slice(0,index).some(previous=>!done(previous)));
  function update(next) {
    if (disposed) return;
    e=next; items=curriculumItems(e.curriculum); onUpdate(next); renderProgress();
  }
  function renderProgress() {
    const count=items.filter(done).length;
    $('#learning-count').textContent=`${count} of ${items.length} activities complete`;
    $('#learning-progress').value=count;
    const treeMarkup=e.curriculum.map((module,mi)=>`<details class="curriculum-module" ${items[selected].moduleIndex===mi?'open':''}><summary><small>MODULE ${mi+1}</small><strong>${esc(module.title)}</strong></summary><div>${items.map((item,index)=>item.moduleIndex!==mi?'':`<button type="button" data-lesson="${esc(item.activity.id)}" class="curriculum-item ${index===selected?'selected':''} ${done(item)?'is-complete':''}" ${locked(item,index)?'disabled':''} ${index===selected?'aria-current="step"':''}><span class="activity-symbol" aria-hidden="true">${done(item)?'✓':locked(item,index)?'🔒':icons[item.activity.type]}</span><span><strong>${esc(item.activity.title)}</strong><small>${labels[item.activity.type]}${item.activity.estimatedMinutes?` · ${item.activity.estimatedMinutes} min`:''}${e.quizAttempts[item.activity.id]?` · Grade: ${e.quizAttempts[item.activity.id].percent}%`:''}${locked(item,index)?' · Locked':''}</small></span></button>`).join('')}</div></details>`).join('');
    if(treeMarkup!==lastTree){
      $('#curriculum-tree').innerHTML=treeMarkup;lastTree=treeMarkup;
      $('#curriculum-tree').querySelectorAll('[data-lesson]').forEach(button=>button.onclick=()=>onNavigate(button.dataset.lesson));
    }
    const complete=done(items[selected]), p=e.activityProgress?.[a.id];
    $('#activity-status').textContent=complete?'✓ Completed':a.type==='video'?`${p?.percent??0}% watched`:'In progress';
    $('#activity-status').classList.toggle('complete',complete);
    const certificateId=e.certificates?.[items[selected].module.id];
    $('#module-certificate').innerHTML=certificateId?`<p role="status">Module completed! Your certificate is ready.</p><a class="btn secondary" href="#certificate/${encodeURIComponent(certificateId)}">View Certificate</a><a class="btn secondary" href="#achievements">Certificates and Achievements</a>`:'';
    const next=$('#next-activity');
    next.disabled=!complete;
    next.textContent=selected===items.length-1?'Back to My learning':'Next activity →';
    $('#unlock-hint').textContent=complete?(selected===items.length-1?'You have reached the end of this course.':'Your next activity is ready.'):'Complete this activity to unlock the next one.';
  }
  root.innerHTML=`<section class="learning-workspace"><aside class="curriculum-sidebar"><a href="#learning" class="learning-back">← My learning</a><h2>${esc(e.courseTitle)}</h2><div class="course-progress"><span id="learning-count"></span><progress id="learning-progress" max="${items.length}" aria-label="Course activity progress"></progress></div><details class="curriculum-drawer" open><summary>Course contents</summary><div id="curriculum-tree"></div></details></aside><div class="learning-main"><div class="lesson-breadcrumb">LEARNING PATH <span> / </span> MODULE ${items[selected].moduleIndex+1}</div><div class="learning-content" id="activity-content"></div><div class="lesson-heading"><div><span class="eyebrow">${labels[a.type]}</span><h1>${esc(a.title)}</h1></div><span id="activity-status" class="activity-status" role="status"></span></div><div class="lesson-support"><div class="support-tabs" role="tablist" aria-label="Lesson tools"><button role="tab" aria-selected="true" aria-controls="panel-overview" id="tab-overview" data-panel="overview">Overview</button><button role="tab" aria-selected="false" aria-controls="panel-transcript" id="tab-transcript" data-panel="transcript" tabindex="-1">Transcript</button><button role="tab" aria-selected="false" aria-controls="panel-notes" id="tab-notes" data-panel="notes" tabindex="-1">Notes</button><button role="tab" aria-selected="false" aria-controls="panel-resources" id="tab-resources" data-panel="resources" tabindex="-1">Resources</button></div><div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" class="support-panel"></div><div id="panel-transcript" role="tabpanel" aria-labelledby="tab-transcript" class="support-panel preserve-lines" hidden></div><div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" class="support-panel" hidden><form id="personal-note-form"><label class="field">Your personal notes<textarea id="personal-note" maxlength="2000" placeholder="Capture an idea or a question…"></textarea></label><button class="btn secondary">Save note</button><span id="note-status" role="status"></span></form></div><div id="panel-resources" role="tabpanel" aria-labelledby="tab-resources" class="support-panel" hidden></div></div><p id="learning-error" class="auth-error" role="alert"></p><div id="module-certificate" class="module-certificate"></div><div class="learning-navigation"><button id="previous-activity" class="btn secondary" ${selected===0?'disabled':''}>← Previous</button><div><p id="unlock-hint"></p><button id="next-activity" class="btn">Next activity →</button></div></div></div><aside class="learning-toolrail" aria-label="Lesson shortcuts"><button data-tool="transcript">▤<span>Transcript</span></button><button data-tool="notes">✎<span>Notes</span></button><button data-tool="resources">▧<span>Resources</span></button></aside></section>`;
  renderProgress();
  const blocked=locked(items[selected],selected);
  if (blocked) {
    $('#activity-content').innerHTML=`<div class="locked-activity"><span>🔒</span><h2>${['Expired','Cancelled'].includes(e.status)?'Course access has ended':'This activity is locked'}</h2><p>Return to your current activity to continue learning.</p><a class="btn secondary" href="#learn/${encodeURIComponent(e.courseId)}">Open current activity</a></div>`;
    $('.lesson-support').hidden=true;
    $('#activity-status').textContent='Locked';
  } else {
    $('#panel-overview').innerHTML=`<p class="preserve-lines">${esc(a.content||'Watch this lesson, then continue along your learning path.')}</p>${a.type==='video'?'<p class="muted">Watch at least 95% of the video and reach the end. Skipped sections do not count. Progress is saved to your account.</p>':''}`;
    $('#panel-transcript').textContent=a.transcript||'No transcript has been supplied for this activity.';
    $('#panel-resources').innerHTML=a.resources?.length?`<ul class="lesson-resources">${a.resources.map(r=>`<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a></li>`).join('')}</ul>`:'<p>No resources have been added to this activity.</p>';
    $('#personal-note').value=e.activityProgress?.[a.id]?.note??'';
    if (a.type==='video') {
      $('#activity-content').innerHTML='<div class="learning-video" id="youtube-player"></div><div class="video-status-row"><p id="video-status" role="status">Loading video player…</p><button class="text-button" id="replay-video">Replay from start</button></div>';
      video=videoFactory($('#youtube-player'),{videoId:a.videoId,api,endpoint,complete:done(items[selected]),onSaved:update,onStatus:message=>{if(!disposed)$('#video-status').textContent=message;}});
      $('#replay-video').onclick=()=>video.replay();
    } else if (a.type==='reading') {
      $('#activity-content').innerHTML=`<article class="reading-activity"><span class="eyebrow">READ & REFLECT</span><h2>${esc(a.title)}</h2><p class="preserve-lines">${esc(a.content)}</p></article><form id="reading-form"><button class="btn">${done(items[selected])?'Reading completed ✓':'Mark as read'}</button></form>`;
    } else {
      $('#activity-content').innerHTML=lessonMarkup(a,e.quizAttempts[a.id]).replace('Module quiz','Knowledge check').replace('This module is complete.','This activity is complete.').replace('Save & mark module complete','Submit practice');
      if ($('#notes')) { $('#notes').value=e.activityProgress?.[a.id]?.response??e.notes[items[selected].moduleIndex]??''; $('#notes').maxLength=a.type==='legacy'?20000:2000; }
    }
    const form=$('#quiz-form')||$('#exercise')||$('#reading-form');
    if(form)form.onsubmit=async event=>{
      event.preventDefault(); const activeForm=event.currentTarget;const button=activeForm.querySelector('button');button.disabled=true;$('#learning-error').textContent='';
      try {
        const body=a.questions.length?{responses:collectResponses(a,activeForm)}:a.type==='reading'?{acknowledged:true}:{notes:$('#notes').value.trim()};
        const url=a.type==='legacy'?`/enrollments/${encodeURIComponent(e.courseId)}/modules/${encodeURIComponent(a.id)}/submit`:`${endpoint}/submit`;
        const result=await api(url,{method:'POST',body});
        if(disposed)return;update(result.enrollment);
        if(a.questions.length){$('#activity-content').innerHTML=lessonMarkup(a,e.quizAttempts[a.id]).replace('Module quiz','Knowledge check').replace('This module is complete.','This activity is complete.');$('#quiz-form').onsubmit=form.onsubmit;}
        else button.textContent='Completed ✓';
      } catch(error){if(!disposed)$('#learning-error').textContent=error.message;}
      finally{button.disabled=false;}
    };
    $('#personal-note-form').onsubmit=async event=>{
      event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
      try{const result=await api(`${endpoint}/note`,{method:'PUT',body:{note:$('#personal-note').value}});if(!disposed){update(result.enrollment);$('#note-status').textContent='Note saved.';}}
      catch(error){if(!disposed)$('#note-status').textContent=`Not saved: ${error.message}`;}
      finally{button.disabled=false;}
    };
  }
  function openPanel(name,focus=false){
    root.querySelectorAll('[data-panel]').forEach(tab=>{const active=tab.dataset.panel===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();});
    root.querySelectorAll('[role=tabpanel]').forEach(panel=>panel.hidden=panel.id!==`panel-${name}`);
  }
  root.querySelectorAll('[data-panel]').forEach((button,i)=>{
    button.onclick=()=>openPanel(button.dataset.panel);
    button.onkeydown=event=>{const names=['overview','transcript','notes','resources'];if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();openPanel(names[event.key==='Home'?0:event.key==='End'?3:(i+(event.key==='ArrowRight'?1:3))%4],true);}};
  });
  root.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{openPanel(button.dataset.tool,true);$('#panel-'+button.dataset.tool).scrollIntoView?.({behavior:'smooth',block:'nearest'});});
  $('#previous-activity').onclick=()=>onNavigate(items[selected-1].activity.id);
  $('#next-activity').onclick=()=>{if(!done(items[selected]))return;onNavigate(selected===items.length-1?null:items[selected+1].activity.id);};
  if (document.defaultView.innerWidth<=800) $('.curriculum-drawer').open=false;
  return ()=>{disposed=true;video?.dispose();};
}
