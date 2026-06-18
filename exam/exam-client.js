// ════════════════════════════════════════════════════════════════════════════
//  Generic exam controller (server mode). Chapter-agnostic: drives the step loop,
//  renders the four step kinds (choose-dir / classify / pick-node / number),
//  and grades EACH step via the server (/api/step). The canonical answer/score
//  live on the server; this client never sees the whole key. The canvas is owned
//  by a chapter renderer (render-tree.js / render-graph.js) implementing:
//    setFocus, setPickable, markPicked, onSettle(step, expected), finishView
// ════════════════════════════════════════════════════════════════════════════

async function api(pathname, body) {
  const r = await fetch(pathname, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

export async function runExam({ chapter, studentId, stage, els, renderModule }) {
  const { chapterUI, createRenderer } = renderModule;

  const start = await api('/api/start', { chapter, studentId });
  if (start.error) {
    els.stepCard.innerHTML = `
      <div class="final-card">
        <div class="feedback bad">${start.message || ('無法開始:' + start.error)}</div>
        <div class="btn-row" style="margin-top:14px">
          <a class="ex-btn primary" href="index.html" style="text-decoration:none; text-align:center; display:block">← 返回章節選單</a>
        </div>
      </div>`;
    return;
  }

  els.info.innerHTML = chapterUI.infoHTML(start.instance);
  els.seedTag.textContent = 'SEED ' + start.seed + ' · ' + studentId;

  const S = {
    steps: start.steps, total: start.total, idx: 0,
    sessionId: start.sessionId, picked: null, settled: false,
    percent: 0, earned: 0, startMs: null, practice: !!start.practice,
  };
  const renderer = createRenderer(start.instance, stage, { onPickNode: onPick });

  const el = (id) => document.getElementById(id);
  function updateStats() {
    els.statScore.textContent = S.percent + '%';
    els.statProgress.textContent = `${S.idx} / ${S.total}`;
  }
  setInterval(() => {
    if (!S.startMs) return;
    const s = Math.floor((Date.now() - S.startMs) / 1000);
    els.statTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);

  function onPick(id) {
    const step = S.steps[S.idx];
    if (!step || step.kind !== 'pick-node' || S.settled) return;
    if (!S.startMs) S.startMs = Date.now();
    S.picked = id; renderer.markPicked(id); renderStep();
  }

  function widgetHTML(step) {
    if (step.kind === 'choose-dir' || step.kind === 'classify') {
      return `<div class="opt-grid">` + step.options.map((o) =>
        `<button class="opt-btn ${S.picked === o.value ? 'sel' : ''}" data-val="${o.value}">${o.label}</button>`
      ).join('') + `</div>`;
    }
    if (step.kind === 'pick-node') {
      return `<div class="pick-hint">已選:<span class="pick-chosen">${
        S.picked === null ? '（在右圖點一個節點）' : '節點 ' + S.picked}</span></div>`;
    }
    if (step.kind === 'number') {
      return `<div class="num-wrap"><span class="pick-hint">新值 =</span>
        <input type="text" id="num-in" autocomplete="off" spellcheck="false" value="${S.picked ?? ''}"></div>`;
    }
    return '';
  }

  function renderStep() {
    const step = S.steps[S.idx];
    renderer.setFocus(step.focusNode ?? null);
    renderer.setPickable(step.kind === 'pick-node' && !S.settled);
    const canCheck = step.kind === 'number' ? true : S.picked !== null;
    els.stepCard.innerHTML = `
      <div class="step-phase">步驟 ${S.idx + 1} / ${S.total} · ${phaseLabel(step.phase)}</div>
      <div class="step-prompt">${step.prompt}</div>
      ${widgetHTML(step)}
      <div class="btn-row"><button class="ex-btn primary" id="btn-check" ${canCheck ? '' : 'disabled'}>檢查這一步</button></div>
      <div class="feedback" id="fb"></div>`;
    els.stepCard.querySelectorAll('.opt-btn').forEach((b) =>
      b.addEventListener('click', () => { S.picked = b.dataset.val; renderStep(); }));
    const numIn = el('num-in');
    if (numIn) { numIn.addEventListener('input', () => { S.picked = numIn.value; }); numIn.focus(); }
    el('btn-check').addEventListener('click', submit);
  }

  function parseGiven(step) {
    if (step.kind === 'number') {
      const v = Number((S.picked ?? '').toString().trim());
      return Number.isFinite(v) ? v : NaN;
    }
    return S.picked;
  }

  async function submit() {
    const step = S.steps[S.idx];
    if (!S.startMs) S.startMs = Date.now();
    el('btn-check').disabled = true;
    const r = await api('/api/step', { sessionId: S.sessionId, stepIndex: S.idx, answer: parseGiven(step) });
    if (r.error) { el('fb').className = 'feedback bad'; el('fb').textContent = r.error; return; }
    S.percent = r.percent; S.earned = r.earned; updateStats();

    if (!r.settled) {
      const fb = el('fb');
      fb.className = 'feedback hint';
      fb.textContent = chapterUI.hint(step) + `（還可試 ${r.attemptsLeft} 次,分數遞減）`;
      el('btn-check').disabled = false;
      return;
    }
    settle(step, r);
  }

  function revealText(step, expected) {
    if (step.kind === 'choose-dir' || step.kind === 'classify') {
      const o = step.options.find((x) => x.value === expected);
      return o ? o.label : expected;
    }
    return expected;
  }

  function settle(step, r) {
    S.settled = true;
    renderer.setPickable(false);
    renderer.onSettle(step, r.expected);

    const fb = el('fb');
    fb.className = 'feedback ' + (r.correct ? 'ok' : 'bad');
    fb.textContent = r.correct ? '✓ 正確!' : `正解:${revealText(step, r.expected)}。此步 0 分,繼續。`;

    if (step.kind === 'choose-dir' || step.kind === 'classify') {
      els.stepCard.querySelectorAll('.opt-btn').forEach((b) => {
        b.disabled = true;
        if (b.dataset.val === r.expected) b.classList.add('reveal-ok');
        else if (b.classList.contains('sel') && !r.correct) b.classList.add('reveal-bad');
      });
    } else if (step.kind === 'number') {
      const inp = el('num-in'); if (inp) { inp.value = r.expected; inp.disabled = true; }
    }
    const row = els.stepCard.querySelector('.btn-row');
    row.innerHTML = `<button class="ex-btn primary" id="btn-next">${r.done ? '看結果 →' : '下一步 →'}</button>`;
    el('btn-next').addEventListener('click', () => advance(r));
  }

  function advance(r) {
    if (r.done) { finish(r); return; }
    S.idx = r.nextStepIndex; S.picked = null; S.settled = false;
    updateStats(); renderStep();
  }

  function finish(r) {
    window.__examDone = true;   // back-to-menu no longer needs to warn
    renderer.finishView();
    const secs = S.startMs ? Math.floor((Date.now() - S.startMs) / 1000) : 0;
    els.stepCard.innerHTML = `
      <div class="final-card">
        <div class="final-score">${r.percent}%</div>
        <div class="final-sub">${r.earned.toFixed(2)} / ${r.total} 計分單位 · 用時 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div>
        <div class="final-sub">${S.practice ? '本次為練習模式,成績不計入正式紀錄。' : '成績已送出並記錄在伺服器。'}</div>
        <div class="btn-row" style="margin-top:18px">
          <a class="ex-btn primary" href="index.html" style="text-decoration:none; text-align:center; display:block">← 返回章節選單</a>
        </div>
      </div>`;
  }

  updateStats();
  renderStep();
}

function phaseLabel(phase) {
  const m = /^round-(\d+)$/.exec(String(phase));
  if (m) return `第 ${Number(m[1]) + 1} 輪`;
  return { search: '① 搜尋', classify: '② 分類', resolve: '③ 解決' }[phase] || String(phase);
}
