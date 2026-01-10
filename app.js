
// Playground+ with nested JSON support, full styling, working filters & buttons

const state = {
  quiz: { idx: 0, corr: 0, score: 0, answered: false, set: [], timerStart: 0, timerId: null, currentTime: 0 },
  memory: { deck: [], items: [], first: null, second: null, moves: 0, matches: 0, corr: 0, score: 0, mode: 1, started: false, pairTimerStart: 0, timerId: null, currentTime: 0 },
  gaps: { idx: 0, corr: 0, score: 0, set: [], timerStart: 0, timerId: null, currentTime: 0, locked: false },
  datasets: { quiz: null, memory: null, gaps: null },
  ui: { soundEnabled: true, theme: 'dark' }
};

/* ===== Audio ===== */
const audio = {
  ctx: null,
  enabled: true,
  init() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { console.warn('AudioContext unavailable', e); } },
  playSeq(seq) {
    if (!this.enabled) return; if (!this.ctx) this.init(); if (!this.ctx) return;
    let t = this.ctx.currentTime;
    seq.forEach(s => {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = s.type || 'sine'; o.frequency.value = s.freq; const vol = s.vol ?? 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur - 0.01);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + s.dur);
      t += (s.wait || 0) + s.dur;
    });
  },
  sounds: {
    click:   [{ freq: 600, dur: 0.06 }],
    correct: [{ freq: 880, dur: 0.12 }, { freq: 1200, dur: 0.12, wait: 0.02 }],
    wrong:   [{ freq: 200, dur: 0.3, type: 'sawtooth', vol: 0.08 }],
    match:   [{ freq: 660, dur: 0.12 }, { freq: 990, dur: 0.12, wait: 0.02 }],
    previewStart: [{ freq: 440, dur: 0.15 }],
    previewEnd:   [{ freq: 880, dur: 0.15 }]
  }
};

/* ===== Utils ===== */
async function loadJSON(url){
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    console.error('Failed to load', url, e);
    const warn = document.getElementById('env-warning'); if (warn) warn.hidden = false;
    return null;
  }
}
function unique(arr){ return [...new Set(arr)]; }
function byCategory(items, cat, sub){ return items.filter(x => (cat==='All'||x.category===cat) && (sub==='All'||x.subcategory===sub)); }
function timeBonus(startMs){ const secs = Math.floor((Date.now() - startMs)/1000); return Math.max(0, 51 - secs); }
function startTicker(el, s){ stopTicker(s); const id=setInterval(()=>{ const sec=Math.floor((Date.now()-s.timerStart)/1000); s.currentTime=sec; el.textContent=`⏱️ ${sec}s`; },250); s.timerId=id; }
function stopTicker(s){ if(s.timerId){ clearInterval(s.timerId); s.timerId=null; } }
function saveHighScore(entry){ const k='pg_scores_v1'; const cur=JSON.parse(localStorage.getItem(k)||'[]'); cur.push(entry); localStorage.setItem(k, JSON.stringify(cur)); }
function getHighScores(filter={}){ const k='pg_scores_v1'; let arr=JSON.parse(localStorage.getItem(k)||'[]'); if(filter.game&&filter.game!=='all') arr=arr.filter(x=>x.game===filter.game); if(filter.category) arr=arr.filter(x=>(x.category||'').toLowerCase().includes(filter.category.toLowerCase())); arr.sort((a,b)=>b.score-a.score); return arr; }
function escapeHTML(str){ return String(str).replace(/[&<>"]/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }

/* ===== Flatten nested datasets ===== */
function flattenNestedQuiz(obj){
  const items=[]; if(!obj) return { items };
  for(const cat of Object.keys(obj)){
    const subs=obj[cat]||{};
    for(const sub of Object.keys(subs)){
      (subs[sub]||[]).forEach(q=>{
        let answerIndex=q.answerIndex;
        if(answerIndex==null && q.answer!=null && Array.isArray(q.options)){
          const idx=q.options.findIndex(o=>String(o).toLowerCase()===String(q.answer).toLowerCase());
          answerIndex = idx>=0? idx : 0;
        }
        items.push({ category:cat, subcategory:sub, question:q.question, options:q.options, answerIndex, explanation:q.explanation||'' });
      });
    }
  }
  return { items };
}
function flattenNestedGaps(obj){
  const items=[]; if(!obj) return { items };
  for(const cat of Object.keys(obj)){
    for(const sub of Object.keys(obj[cat]||{})){
      (obj[cat][sub]||[]).forEach(s=>{
        const text = s.text || s.question || '';
        items.push({ category:cat, subcategory:sub, text, answer:s.answer, hint:s.hint||'' });
      });
    }
  }
  return { items };
}
function flattenNestedMemory(obj){
  const items=[]; if(!obj) return { items };
  for(const cat of Object.keys(obj)){
    for(const sub of Object.keys(obj[cat]||{})){
      (obj[cat][sub]||[]).forEach(it=>{
        items.push({ category:cat, subcategory:sub, symbol:it.symbol, name:it.name });
      });
    }
  }
  return { items };
}

/* ===== Theme & Sound toggles ===== */
function setTheme(theme){ document.body.dataset.theme=theme; state.ui.theme=theme; localStorage.setItem('pg_theme',theme); document.getElementById('toggle-theme').textContent = (theme==='light')?'🌞 Theme: Light':'🌓 Theme: Dark'; }
function setSound(enabled){ audio.enabled=enabled; state.ui.soundEnabled=enabled; localStorage.setItem('pg_sound', enabled?'on':'off'); document.getElementById('toggle-sound').textContent = enabled?'🔊 Sound: On':'🔇 Sound: Off'; }

/* ===== Modal ===== */
const modal={ el:null,titleEl:null,bodyEl:null,closeBtn:null,
  init(){ this.el=document.getElementById('modal'); this.titleEl=document.getElementById('modal-title'); this.bodyEl=document.getElementById('modal-body'); this.closeBtn=document.getElementById('modal-close'); this.el.addEventListener('click',(e)=>{ if(e.target===this.el) this.hide();}); this.closeBtn.addEventListener('click',()=>this.hide()); window.addEventListener('keydown',(e)=>{ if(e.key==='Escape'&&this.el.getAttribute('aria-hidden')==='false') this.hide();}); },
  show(t,h){ this.titleEl.textContent=t; this.bodyEl.innerHTML=h; this.el.setAttribute('aria-hidden','false'); audio.playSeq(audio.sounds.previewStart); },
  hide(){ this.el.setAttribute('aria-hidden','true'); audio.playSeq(audio.sounds.previewEnd); }
};

/* ===== Tabs ===== */
function setupTabs(){ const tabs=document.querySelectorAll('.tab'); const panels=document.querySelectorAll('.panel'); tabs.forEach(tab=>{ tab.addEventListener('click',()=>{ tabs.forEach(t=>t.classList.remove('active')); tab.classList.add('active'); const target=tab.getAttribute('data-target'); panels.forEach(p=>p.classList.toggle('active', p.id===target)); if(target==='scores') renderHighScores(); audio.playSeq(audio.sounds.click); }); }); }
function renderHighScores(){ const game=document.getElementById('hs-game').value; const cat=document.getElementById('hs-cat').value.trim(); const rows=getHighScores({game,category:cat}); const tbody=document.querySelector('#scores-table tbody'); tbody.innerHTML=rows.slice(0,50).map(r=>`<tr><td><strong>${r.score}</strong></td><td>${r.game}</td><td>${escapeHTML(r.category||'')}</td><td>${escapeHTML(r.subcategory||'')}</td><td>${escapeHTML(r.mode||'')}</td><td>${r.correct}/${r.total}</td><td>${new Date(r.date).toLocaleString()}</td></tr>`).join(''); }

/* ===== QUIZ ===== */
function setupQuizFilters(){ const catSel=document.getElementById('quiz-cat'); const subSel=document.getElementById('quiz-sub'); const data=state.datasets.quiz; const cats=['All', ...unique(data.items.map(x=>x.category))]; catSel.innerHTML=cats.map(c=>`<option>${escapeHTML(c)}</option>`).join(''); function renderSubs(){ const pick=catSel.value; const subs=['All', ...unique(data.items.filter(x=>pick==='All'||x.category===pick).map(x=>x.subcategory))]; subSel.innerHTML=subs.map(s=>`<option>${escapeHTML(s)}</option>`).join(''); } catSel.addEventListener('change', renderSubs); renderSubs(); }
function quizLoadSet(){ const cat=document.getElementById('quiz-cat').value; const sub=document.getElementById('quiz-sub').value; const items=byCategory(state.datasets.quiz.items, cat, sub); state.quiz.set=items; state.quiz.idx=0; state.quiz.corr=0; state.quiz.score=0; state.quiz.answered=false; renderQuizQuestion(); }
function renderQuizMeta(){ const meta=document.getElementById('quiz-meta'); const total=state.quiz.set.length||0; meta.innerHTML=`<span>Items: ${state.quiz.idx+1} / ${total}</span><span>Correct: <strong>${state.quiz.corr}</strong></span><span>Score: <strong>${state.quiz.score}</strong></span>`; }
function renderQuizQuestion(){ stopTicker(state.quiz); const tEl=document.getElementById('quiz-timer'); tEl.textContent=''; const list=document.getElementById('quiz-options'); list.innerHTML=''; document.getElementById('quiz-feedback').textContent=''; const q=state.quiz.set[state.quiz.idx]; if(!q){ const total=state.quiz.set.length; document.getElementById('quiz-question').textContent='🎉 Finished!'; document.getElementById('quiz-feedback').innerHTML=`You scored <strong>${state.quiz.score}</strong> with ${state.quiz.corr} / ${total} correct.`; saveHighScore({ game:'quiz', score:state.quiz.score, correct:state.quiz.corr, total, category:state.lastQuizCat, subcategory:state.lastQuizSub, date:new Date().toISOString() }); audio.playSeq(audio.sounds.match); return; } state.lastQuizCat=document.getElementById('quiz-cat').value; state.lastQuizSub=document.getElementById('quiz-sub').value; document.getElementById('quiz-question').textContent=q.question; q.options.forEach((opt,i)=>{ const li=document.createElement('li'); const btn=document.createElement('button'); btn.className='option-btn'; btn.setAttribute('aria-label',`Answer option ${i+1}`); btn.innerHTML=`<span class="badge">${String.fromCharCode(65+i)}</span> <span>${escapeHTML(opt)}</span>`; btn.addEventListener('click',()=>handleQuizAnswer(i)); li.appendChild(btn); list.appendChild(li); }); state.quiz.answered=false; state.quiz.timerStart=Date.now(); startTicker(tEl, state.quiz); renderQuizMeta(); }
function handleQuizAnswer(choiceIdx){ if(state.quiz.answered) return; const q=state.quiz.set[state.quiz.idx]; const buttons=Array.from(document.querySelectorAll('#quiz .option-btn')); buttons.forEach((b,i)=>{ b.disabled=true; b.classList.toggle('correct', i===q.answerIndex); if(i===choiceIdx && i!==q.answerIndex) b.classList.add('wrong'); }); state.quiz.answered=true; const fb=document.getElementById('quiz-feedback'); if(choiceIdx===q.answerIndex){ state.quiz.corr++; const bonus=timeBonus(state.quiz.timerStart); state.quiz.score+=50+bonus; fb.innerHTML=`✅ Correct! +${50+bonus} (bonus ${bonus}). ${q.explanation?escapeHTML(q.explanation):''}`; audio.playSeq(audio.sounds.correct); } else { fb.innerHTML=`❌ Not quite. Correct answer: <strong>${escapeHTML(q.options[q.answerIndex])}</strong>. ${q.explanation?escapeHTML(q.explanation):''}`; audio.playSeq(audio.sounds.wrong); } renderQuizMeta(); }
function quizNext(){ if(state.quiz.set.length===0) return; state.quiz.idx++; audio.playSeq(audio.sounds.click); renderQuizQuestion(); }
function quizRestart(){ state.quiz.idx=0; state.quiz.corr=0; state.quiz.score=0; state.quiz.answered=false; audio.playSeq(audio.sounds.click); renderQuizQuestion(); }
function quizPreview(){ const cat=document.getElementById('quiz-cat').value; const sub=document.getElementById('quiz-sub').value; const items=byCategory(state.datasets.quiz.items, cat, sub); const html=items.map((q,i)=>`<div class="preview-item"><div class="preview-q"><strong>Q${i+1}:</strong> ${escapeHTML(q.question)}</div><ul class="preview-opts">${q.options.map((o,j)=>`<li${j===q.answerIndex?' class="correct"':''}>${String.fromCharCode(65+j)}. ${escapeHTML(o)}</li>`).join('')}</ul>${q.explanation?`<div class="preview-expl">Explanation: ${escapeHTML(q.explanation)}</div>`:''}</div>`).join(''); modal.show(`Quiz Preview — ${cat}/${sub}`, html); }

/* ===== MEMORY ===== */
function setupMemoryFilters(){ const catSel=document.getElementById('mem-cat'); const subSel=document.getElementById('mem-sub'); const data=state.datasets.memory; const cats=['All', ...unique(data.items.map(x=>x.category))]; catSel.innerHTML=cats.map(c=>`<option>${escapeHTML(c)}</option>`).join(''); function renderSubs(){ const pick=catSel.value; const subs=['All', ...unique(data.items.filter(x=>pick==='All'||x.category===pick).map(x=>x.subcategory))]; subSel.innerHTML=subs.map(s=>`<option>${escapeHTML(s)}</option>`).join(''); } catSel.addEventListener('change', renderSubs); renderSubs(); }
function memLoadDeck(){ const cat=document.getElementById('mem-cat').value; const sub=document.getElementById('mem-sub').value; const items=byCategory(state.datasets.memory.items, cat, sub); state.memory.items=items; state.memory.mode=parseInt(document.getElementById('mem-mode').value,10)||1; let uniques=items.slice(0,10); if(uniques.length<10){ const all=state.datasets.memory.items; const need=10-uniques.length; const extras=all.filter(x=>!uniques.some(u=>u.symbol===x.symbol && u.name===x.name)).slice(0,need); uniques=uniques.concat(extras); } const base=uniques.map((it,idx)=>({ id:'c'+idx, symbol:it.symbol, name:it.name })); let deck=[]; base.forEach(b=>{ deck.push({...b, pairId:b.id+'a'}); deck.push({...b, pairId:b.id+'b'}); }); for(let i=deck.length-1; i>0; i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; } state.memory.deck=deck; state.memory.first=null; state.memory.second=null; state.memory.moves=0; state.memory.matches=0; state.memory.corr=0; state.memory.score=0; state.memory.started=false; renderMemory(); }
function renderMemory(){ stopTicker(state.memory); const grid=document.getElementById('memory-grid'); grid.innerHTML=''; state.memory.deck.forEach((card,idx)=>{ const cell=document.createElement('div'); cell.className='card'; cell.dataset.idx=String(idx); cell.innerHTML=`<div class="card-inner"><div class="card-face card-front" aria-hidden="true">❓</div><div class="card-face card-back" aria-label="${escapeHTML(card.name)}">${escapeHTML(card.symbol)}</div></div>`; cell.addEventListener('click',()=>handleMemoryFlip(idx)); grid.appendChild(cell); }); document.getElementById('mem-moves').textContent='0'; document.getElementById('mem-matches').textContent='0 / 10'; document.getElementById('mem-score').textContent=String(state.memory.score); document.getElementById('memory-status').textContent=''; document.getElementById('mem-timer').textContent=''; }
function memStart(){ state.memory.started=true; const mode=state.memory.mode; const cards=[...document.querySelectorAll('#memory-grid .card')]; if(mode===2||mode===3) cards.forEach(c=>c.classList.add('flipped')); if(mode===2){ document.getElementById('memory-status').textContent='👀 Preview for 10 seconds…'; audio.playSeq(audio.sounds.previewStart); setTimeout(()=>{ cards.forEach(c=>c.classList.remove('flipped')); document.getElementById('memory-status').textContent='Go!'; state.memory.pairTimerStart=Date.now(); startTicker(document.getElementById('mem-timer'), state.memory); audio.playSeq(audio.sounds.previewEnd); },10000); } else { document.getElementById('memory-status').textContent=(mode===3)?'Cards are open. Start matching!':'Go!'; state.memory.pairTimerStart=Date.now(); startTicker(document.getElementById('mem-timer'), state.memory); } }
function updateMemoryMeta(){ document.getElementById('mem-moves').textContent=String(state.memory.moves); document.getElementById('mem-matches').textContent=String(state.memory.matches)+' / 10'; document.getElementById('mem-score').textContent=String(state.memory.score); }
function handleMemoryFlip(idx){ if(!state.memory.started) return; const el=document.querySelector(`.card[data-idx="${idx}"]`); if(!el||el.classList.contains('matched')) return; if(el.classList.contains('flipped')) return; el.classList.add('flipped'); audio.playSeq(audio.sounds.click); if(state.memory.first===null){ state.memory.first=idx; state.memory.pairTimerStart=Date.now(); return; } if(state.memory.second===null){ state.memory.second=idx; state.memory.moves++; updateMemoryMeta(); } const a=state.memory.deck[state.memory.first]; const b=state.memory.deck[state.memory.second]; const pairMatch = a.id===b.id && a.pairId!==b.pairId; if(pairMatch){ const e1=document.querySelector(`.card[data-idx="${state.memory.first}"]`); const e2=document.querySelector(`.card[data-idx="${state.memory.second}"]`); e1.classList.add('matched'); e2.classList.add('matched'); state.memory.matches++; state.memory.corr++; const bonus=timeBonus(state.memory.pairTimerStart); state.memory.score+=50+bonus; document.getElementById('memory-status').textContent=`✅ Match! +${50+bonus} (bonus ${bonus})`; audio.playSeq(audio.sounds.match); state.memory.first=null; state.memory.second=null; updateMemoryMeta(); if(state.memory.matches>=10){ stopTicker(state.memory); document.getElementById('memory-status').textContent=`🎉 You matched all pairs in ${state.memory.moves} moves! Score: ${state.memory.score}`; saveHighScore({ game:'memory', score:state.memory.score, correct:state.memory.corr, total:10, category:document.getElementById('mem-cat').value, subcategory:document.getElementById('mem-sub').value, mode:String(state.memory.mode), date:new Date().toISOString() }); } else { state.memory.pairTimerStart=Date.now(); } } else { document.getElementById('memory-status').textContent='❌ Try again…'; audio.playSeq(audio.sounds.wrong); setTimeout(()=>{ const e1=document.querySelector(`.card[data-idx="${state.memory.first}"]`); const e2=document.querySelector(`.card[data-idx="${state.memory.second}"]`); e1?.classList.remove('flipped'); e2?.classList.remove('flipped'); state.memory.first=null; state.memory.second=null; },700); } }
function memoryRestart(){ state.memory.first=null; state.memory.second=null; state.memory.moves=0; state.memory.matches=0; state.memory.corr=0; state.memory.score=0; state.memory.started=false; audio.playSeq(audio.sounds.click); renderMemory(); }

/* ===== GAPS ===== */
function setupGapFilters(){ const catSel=document.getElementById('gap-cat'); const subSel=document.getElementById('gap-sub'); const data=state.datasets.gaps; const cats=['All', ...unique(data.items.map(x=>x.category))]; catSel.innerHTML=cats.map(c=>`<option>${escapeHTML(c)}</option>`).join(''); function renderSubs(){ const pick=catSel.value; const subs=['All', ...unique(data.items.filter(x=>pick==='All'||x.category===pick).map(x=>x.subcategory))]; subSel.innerHTML=subs.map(s=>`<option>${escapeHTML(s)}</option>`).join(''); } catSel.addEventListener('change', renderSubs); renderSubs(); }
function gapsLoadSet(){ const cat=document.getElementById('gap-cat').value; const sub=document.getElementById('gap-sub').value; const items=byCategory(state.datasets.gaps.items, cat, sub); state.gaps.set=items; state.gaps.idx=0; state.gaps.corr=0; state.gaps.score=0; state.gaps.locked=false; renderGap(); }
function renderGap(){ stopTicker(state.gaps); const d=state.gaps.set; const s=d[state.gaps.idx]; const hintEl=document.getElementById('gap-hint'); const scoreEl=document.getElementById('gap-score'); const timerEl=document.getElementById('gap-timer'); const sentenceEl=document.getElementById('gap-sentence'); if(!s){ const total=state.gaps.set.length; sentenceEl.textContent='🎉 Finished!'; document.getElementById('gap-feedback').textContent=`Score: ${state.gaps.score}. Correct: ${state.gaps.corr}/${total}.`; saveHighScore({ game:'gaps', score:state.gaps.score, correct:state.gaps.corr, total, category:state.lastGapCat, subcategory:state.lastGapSub, date:new Date().toISOString() }); audio.playSeq(audio.sounds.match); return; } state.lastGapCat=document.getElementById('gap-cat').value; state.lastGapSub=document.getElementById('gap-sub').value; hintEl.innerHTML=`<span>Hint: ${escapeHTML(s.hint||'')}</span><span>Item ${state.gaps.idx+1} / ${d.length}</span>`; scoreEl.textContent=String(state.gaps.score); sentenceEl.textContent=s.text; const input=document.getElementById('gap-input'); input.value=''; input.disabled=false; input.focus(); document.getElementById('gap-feedback').textContent=''; state.gaps.locked=false; state.gaps.timerStart=Date.now(); startTicker(timerEl, state.gaps); }
function gapCheck(){ if(state.gaps.locked) return; const s=state.gaps.set[state.gaps.idx]; if(!s) return; const val=document.getElementById('gap-input').value.trim(); if(!val) return; const eq=val.toLowerCase()===String(s.answer).toLowerCase(); const fb=document.getElementById('gap-feedback'); if(eq){ state.gaps.corr++; const bonus=timeBonus(state.gaps.timerStart); state.gaps.score+=50+bonus; fb.innerHTML=`✅ Correct! +${50+bonus} (bonus ${bonus}).`; state.gaps.locked=true; document.getElementById('gap-input').disabled=true; stopTicker(state.gaps); audio.playSeq(audio.sounds.correct); } else { fb.innerHTML='❌ Not quite. Try again…'; audio.playSeq(audio.sounds.wrong); } }
function gapNext(){ state.gaps.idx++; audio.playSeq(audio.sounds.click); renderGap(); }
function gapRestart(){ state.gaps.idx=0; state.gaps.corr=0; state.gaps.score=0; audio.playSeq(audio.sounds.click); renderGap(); }
function gapsPreview(){ const cat=document.getElementById('gap-cat').value; const sub=document.getElementById('gap-sub').value; const items=byCategory(state.datasets.gaps.items, cat, sub); const html=items.map((s,i)=>`<div class="preview-item"><div><strong>Item ${i+1}:</strong> ${escapeHTML(s.text)}</div><div class="preview-answer">Answer: <strong>${escapeHTML(s.answer)}</strong></div><div class="preview-hint">Hint: ${escapeHTML(s.hint||'')}</div></div>`).join(''); modal.show(`Fill-in Preview — ${cat}/${sub}`, html); }

/* ===== INIT ===== */
async function init(){
  // restore theme/sound
  const savedTheme=localStorage.getItem('pg_theme');
  const savedSound=localStorage.getItem('pg_sound');
  setTheme(savedTheme==='light'?'light':'dark');
  setSound(savedSound!=='off');

  // globals
  document.getElementById('toggle-theme').addEventListener('click',()=>{ setTheme(state.ui.theme==='light'?'dark':'light'); audio.playSeq(audio.sounds.click); });
  document.getElementById('toggle-sound').addEventListener('click',()=>{ setSound(!state.ui.soundEnabled); audio.playSeq(audio.sounds.click); });

  modal.init(); setupTabs();
  document.getElementById('hs-refresh').addEventListener('click', renderHighScores);
  document.getElementById('hs-clear').addEventListener('click', ()=>{ localStorage.removeItem('pg_scores_v1'); renderHighScores(); audio.playSeq(audio.sounds.click); });

  // load nested datasets and flatten
  const [nestedQuiz, nestedMem, nestedGaps] = await Promise.all([
    loadJSON('data/quizzes.json'),
    loadJSON('data/memory.json'),
    loadJSON('data/gaps.json')
  ]);

  state.datasets.quiz   = flattenNestedQuiz(nestedQuiz);
  state.datasets.memory = flattenNestedMemory(nestedMem);
  state.datasets.gaps   = flattenNestedGaps(nestedGaps);

  // Guard: if any dataset empty, keep warning visible and skip setup
  if (!state.datasets.quiz.items.length && !state.datasets.memory.items.length && !state.datasets.gaps.items.length) {
    const warn = document.getElementById('env-warning'); if (warn) warn.hidden = false; return;
  }

  // setup filters & buttons
  setupQuizFilters(); setupMemoryFilters(); setupGapFilters();
  document.getElementById('quiz-load').addEventListener('click', quizLoadSet);
  document.getElementById('quiz-next').addEventListener('click', quizNext);
  document.getElementById('quiz-restart').addEventListener('click', quizRestart);
  document.getElementById('quiz-preview').addEventListener('click', quizPreview);

  document.getElementById('mem-load').addEventListener('click', memLoadDeck);
  document.getElementById('mem-start').addEventListener('click', memStart);
  document.getElementById('mem-restart').addEventListener('click', memoryRestart);

  document.getElementById('gap-load').addEventListener('click', gapsLoadSet);
  document.getElementById('gap-check').addEventListener('click', gapCheck);
  document.getElementById('gap-next').addEventListener('click', gapNext);
  document.getElementById('gap-restart').addEventListener('click', gapRestart);
  document.getElementById('gap-preview').addEventListener('click', gapsPreview);

  // defaults
  quizLoadSet(); memLoadDeck(); gapsLoadSet();
}
window.addEventListener('DOMContentLoaded', init);
