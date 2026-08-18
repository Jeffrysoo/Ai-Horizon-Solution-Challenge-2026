/* DispenseIQ — AI Dispensing Defect Detective.
   Implemented from design/DispenseIQ.dc.html. No build step: open index.html. */
'use strict';

/* ── configuration (was the design's props panel) ─────────────────── */
const CONFIG = {
  showSimilarInsight: true,
  showQualityScore: true
};

/* ── knowledge base ───────────────────────────────────────────────── */
const QBASE = [
  { id: 'material', q: 'What material is being dispensed?', chips: ['Adhesive', 'Solder paste', 'Epoxy', 'Sealant', 'Other fluid'] },
  { id: 'amount', q: 'Is the dispensed amount too large or too small?', chips: ['Too small', 'Too large', 'Varies shot to shot', 'Dots missing entirely'] },
  { id: 'timing', q: 'Is the defect continuous or occasional?', chips: ['Continuous — every shot', 'Occasional — random shots', 'Only after long runs'] },
  { id: 'change', q: 'Has the material, nozzle or any process setting recently changed?', chips: ['Material batch changed', 'Nozzle replaced', 'Settings adjusted', 'No recent changes'] },
  { id: 'location', q: 'Is the defect at one location or across multiple locations?', chips: ['One location', 'Multiple locations', 'Random locations'] }
];
const FOLLOWUP = { id: 'onset', q: 'Does the variation appear right from startup, or only after the machine has been running for some time?', chips: ['From startup', 'After running a while', 'Not sure'] };
const CAUSES = [
  { name: 'Air Bubble', pct: 85, top: true },
  { name: 'Nozzle Blockage', pct: 70 },
  { name: 'Material Viscosity Change', pct: 65 },
  { name: 'Incorrect Parameter', pct: 45 },
  { name: 'Equipment Problem', pct: 25 }
];
const PLAN = [
  { title: 'Check the syringe for visible air bubbles', detail: 'Hold the syringe against light; purge if any bubbles are trapped near the outlet.' },
  { title: 'Inspect the dispensing nozzle for blockage', detail: 'Remove the nozzle and check for partial clogging or cured material at the tip.' },
  { title: 'Verify dispensing pressure and time settings', detail: 'Compare current values against the process sheet; watch for pressure drift.' },
  { title: 'Check whether the material condition has changed', detail: 'Confirm batch age, storage temperature and pot life against spec.' },
  { title: 'Perform several test shots and compare results', detail: 'Run 10 test dots on scrap and measure diameter spread before restarting production.' }
];
const HISTORY = [
  { id: 'DQ-0146', date: '2026-08-02', defect: 'Inconsistent volume', cause: 'Air trapped in syringe', material: 'Epoxy', outcome: 'Resolved' },
  { id: 'DQ-0145', date: '2026-07-28', defect: 'Missing dots', cause: 'Nozzle blockage', material: 'Solder paste', outcome: 'Resolved' },
  { id: 'DQ-0144', date: '2026-07-21', defect: 'Excessive spreading', cause: 'Viscosity drop (temp)', material: 'Adhesive', outcome: 'Resolved' },
  { id: 'DQ-0142', date: '2026-07-15', defect: 'Inconsistent volume', cause: 'Air trapped in syringe', material: 'Adhesive', outcome: 'Resolved' },
  { id: 'DQ-0139', date: '2026-07-03', defect: 'Undersized dots', cause: 'Pressure set too low', material: 'Sealant', outcome: 'Resolved' },
  { id: 'DQ-0137', date: '2026-06-24', defect: 'Inconsistent volume', cause: 'Air trapped in syringe', material: 'Solder paste', outcome: 'Resolved' },
  { id: 'DQ-0135', date: '2026-06-18', defect: 'Irregular shape', cause: 'Worn nozzle tip', material: 'Epoxy', outcome: 'Monitoring' },
  { id: 'DQ-0132', date: '2026-06-05', defect: 'Oversized dots', cause: 'Dispense time too long', material: 'Adhesive', outcome: 'Resolved' },
  { id: 'DQ-0129', date: '2026-05-27', defect: 'Inconsistent volume', cause: 'Material batch variation', material: 'Epoxy', outcome: 'Resolved' },
  { id: 'DQ-0126', date: '2026-05-14', defect: 'Missing dots', cause: 'Air trapped in syringe', material: 'Adhesive', outcome: 'Resolved' }
];

/* ── state ────────────────────────────────────────────────────────── */
const state = {
  screen: 'landing',   // landing | input | qa | analyzing | results | report | history
  maxStage: -1,        // highest unlocked nav stage (0..3)
  problem: '',
  imageUrl: null,
  apiKey: '', // DO NOT HARDCODE API KEYS IN PUBLIC REPOSITORIES
  aiResult: null,
  analysisError: null, // set when a LIVE analysis fails, so results shows an error instead of mock data
  questions: QBASE.slice(),
  qaIdx: 0,
  answers: {},
  done: {},
  notes: '',
  search: '',
  theme: 'light',
  demoMode: false,
  strictMode: false
};

const CASE_ID = 'DQ-0147';
const REPORT_DATE = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const app = document.getElementById('app');

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>';

/* ── derived values ───────────────────────────────────────────────── */
function stars(on) { return '★'.repeat(on) + '</span><span class="stars-off">' + '☆'.repeat(5 - on); }

function reasoning() {
  const timing = state.answers.timing || '';
  const occasional = !/continuous/i.test(timing);
  let r = occasional
    ? 'Air bubbles are ranked highest because the dispensing volume changes occasionally rather than continuously — a trapped bubble compresses unpredictably, so some shots deliver less material than others. A blocked nozzle or a wrong parameter would produce a continuous, repeatable error instead.'
    : 'Air bubbles remain the leading cause, but the continuous nature you reported also keeps nozzle blockage and parameter error close behind — a persistent restriction or wrong setting produces the same error on every shot.';
  if (/no recent/i.test(state.answers.change || '')) {
    r += ' No recent material or setting change further lowers the likelihood of viscosity or parameter causes.';
  }
  return r;
}

/* ── actions ──────────────────────────────────────────────────────── */
function setScreen(screen, stage) {
  state.screen = screen;
  if (stage != null) state.maxStage = Math.max(state.maxStage, stage);
  render();
}

function startDiagnosis() {
  Object.assign(state, {
    problem: '', imageUrl: null, aiResult: null, analysisError: null, questions: QBASE.slice(), qaIdx: 0,
    answers: {}, done: {}, notes: ''
  });
  setScreen('input', 0);
}

async function analyzeWithGemini() {
  state.analysisError = null; // clear any error from a previous attempt
  try {
    // 1. Pack the user's inputs into a clean payload
    const payload = {
      problem: state.problem,
      answers: state.answers,
      imageUrl: state.imageUrl,
      strictMode: state.strictMode
    };

    // 2. Send the payload to your new Node.js Express backend
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Backend analysis failed');
    }

    // 3. Receive the generated JSON and the real database matches
    const data = await res.json();
    state.aiResult = data.aiResult;
    state.matchedCases = data.matchedCases; // Save the real history hits to state

  } catch (err) {
    console.error("Diagnostic Error:", err);
    state.aiResult = null;
    // Record the failure so the results screen shows an honest error instead of
    // silently rendering the hardcoded placeholder diagnosis as if it were real.
    state.analysisError = err.message || 'The analysis service did not respond.';
  }

  if (state.screen === 'analyzing') setScreen('results', 2);
}

function answer(text) {
  const t = String(text || '').trim();
  if (!t) return;
  const qs = state.questions;
  const q = qs[state.qaIdx];
  state.answers[q.id] = t;
  // Bonus challenge: dynamic follow-up when the amount varies shot to shot
  if (q.id === 'amount' && /vari/i.test(t) && !qs.some(x => x.id === 'onset')) {
    qs.splice(state.qaIdx + 1, 0, FOLLOWUP);
  }
  const next = state.qaIdx + 1;
  if (next >= qs.length) {
    state.screen = 'analyzing';
    render();
    if (!state.demoMode) {
      analyzeWithGemini();
    } else {
      setTimeout(() => {
        if (state.screen === 'analyzing') setScreen('results', 2);
      }, 1600);
    }
  } else {
    state.qaIdx = next;
    render();
  }
}

function readImage(file) {
  if (!file || !/^image\//.test(file.type)) return;
  const r = new FileReader();
  r.onload = () => { state.imageUrl = r.result; render(); };
  r.readAsDataURL(file);
}

/* ── header nav ───────────────────────────────────────────────────── */
const NAV_DEFS = [
  { n: '01', label: 'Describe', screen: 'input', stage: 0 },
  { n: '02', label: 'Questions', screen: 'qa', stage: 1 },
  { n: '03', label: 'Results', screen: 'results', stage: 2 },
  { n: '04', label: 'Report', screen: 'report', stage: 3 }
];

function renderNav() {
  const cur = state.screen === 'analyzing' ? 'qa' : state.screen;
  document.getElementById('nav-steps').innerHTML = NAV_DEFS.map(d => {
    const cls = ['step-pill'];
    if (cur === d.screen) cls.push('current');
    if (d.stage > state.maxStage) cls.push('locked');
    return `<a href="#" class="${cls.join(' ')}" data-action="nav-step" data-screen="${d.screen}" data-stage="${d.stage}">
      <span class="num">${d.n}</span><span class="lbl">${d.label}</span>
    </a>`;
  }).join('');
}

/* ── screens ──────────────────────────────────────────────────────── */
function landingHTML() {
  const tickers = ['Describe the defect', 'Five smart questions', 'Ranked causes', 'Action plan & report'];
  const flow = [
    { n: '01', title: 'Describe', body: 'State the defect in plain words, attach a photo of the result.' },
    { n: '02', title: 'Answer', body: 'Five smart questions narrow down the symptom pattern.' },
    { n: '03', title: 'Diagnose', body: 'Ranked causes with the reasoning behind each score.' },
    { n: '04', title: 'Act', body: 'A checkable inspection sequence and a printable report.' }
  ];
  return `<main>
    <div class="hero">
      <div class="hero-img duotone"><img src="assets/hero.webp" alt="Dispensing line"></div>
      <div class="hero-fade"></div>
      <div class="hero-content">
        <h1 class="hero-title">Identify dispensing problems <em>faster with AI</em></h1>
        <button type="button" class="btn btn-primary hero-cta" data-action="start-diagnosis">Start new diagnosis${ARROW}</button>
      </div>
    </div>
    <div class="hero-meta">
      <span class="line-label"><i></i>Dispensing line · dot inspection</span>
      <p>We define the symptom pattern before naming a cause — every ranking is scored against your answers, not a generic checklist.</p>
    </div>
    <div class="ticker">
      ${tickers.map(t => `<div class="rule"></div><span>${t}</span>`).join('')}
      <div class="rule"></div>
    </div>
    <div class="about-grid">
      <span class="tag tag-outline">About DispenseIQ</span>
      <p>We start from your description of the defect, then narrow the symptom pattern with five smart questions. <strong>Every ranked cause comes with the reasoning behind it.</strong></p>
    </div>
    <div class="flow-grid">
      <h2>Troubleshooting must be clear — <span class="accent">not costly</span></h2>
      <div class="flow-cells">
        ${flow.map(f => `<div class="flow-row"><span class="n">(${f.n})</span><span class="t">${f.title}</span><span class="b">${f.body}</span></div>`).join('')}
      </div>
    </div>
    <div class="cta-band">
      <div class="left">
        <span class="ready"><i></i>Ready when you are</span>
        <span class="headline">Start with a diagnosis — ranked causes, clear reasoning, printable report.</span>
      </div>
      <div class="right">
        <button type="button" class="btn btn-primary" data-action="start-diagnosis">Start new diagnosis${ARROW}</button>
        <a href="#" data-action="go-history">View past cases →</a>
      </div>
    </div>
  </main>`;
}

function inputHTML() {
  const imageBlock = state.imageUrl
    ? `<div class="image-chip">
        <span class="thumb duotone"><img src="${state.imageUrl}" alt="Uploaded dispensing result"></span>
        <div class="info"><b>Image attached</b><span>Will be analysed for dot size, shape and spread.</span></div>
        <button type="button" class="btn btn-ghost" data-action="clear-image">Remove</button>
      </div>`
    : `<div class="dropzone" id="dropzone" data-action="pick-file">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-600)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"></path><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="m8 17 4-4 4 4"></path></svg>
        <span class="main-line">Drag a photo here, or <u>browse files</u></span>
        <span class="sub-line">JPG or PNG · a top-down shot of the dispensed dots works best</span>
      </div>`;
  return `<main class="screen-narrow" data-screen="input">
    <div class="screen-head">
      <span class="kicker">Step 01 · Problem discovery</span>
      <h2 class="screen-title">Describe the problem</h2>
    </div>
    <div class="field">
      <label for="diq-problem">Describe the dispensing problem you're seeing</label>
      <textarea id="diq-problem" class="input" rows="5" placeholder="e.g. The adhesive dot is sometimes too small — some boards get a full dot, others barely any material.">${esc(state.problem)}</textarea>
    </div>
    <div class="field">
      <span class="field-label">Photo of the dispensing result <span class="opt">(optional)</span></span>
      ${imageBlock}
      <input type="file" id="diq-file" accept="image/*" style="display: none;">
    </div>
    <div class="btn-row">
      <button type="button" class="btn btn-primary" data-action="continue-qa">Continue${ARROW}</button>
      <button type="button" class="btn btn-ghost" data-action="go-home">Back</button>
    </div>
  </main>`;
}

function qaHTML() {
  const qs = state.questions;
  const q = qs[Math.min(state.qaIdx, qs.length - 1)];
  const log = qs.slice(0, state.qaIdx).map(x =>
    `<div class="pair">
      <div class="q">${x.q}</div>
      <span class="tag tag-accent a">${esc(state.answers[x.id] || '—')}</span>
    </div>`).join('');
  return `<main class="screen-narrow" data-screen="qa">
    <div class="screen-head">
      <div class="qa-head-row">
        <span class="kicker">Step 02 · Troubleshooting questions</span>
        <span class="qa-count">Question ${Math.min(state.qaIdx + 1, qs.length)} of ${qs.length}</span>
      </div>
      <div class="progress">${qs.map((_, i) => `<i class="${i <= state.qaIdx ? 'on' : ''}"></i>`).join('')}</div>
    </div>
    ${log ? `<div class="qa-log">${log}</div>` : ''}
    <div class="card qa-card">
      <div class="card-kicker">DispenseIQ asks</div>
      <div class="qa-question">${q.q}</div>
      <div class="chip-row">
        ${q.chips.map(c => `<button type="button" class="btn btn-secondary" data-action="chip" data-value="${esc(c)}">${c}</button>`).join('')}
      </div>
      <div class="answer-row">
        <span class="or">or type an answer</span>
        <input type="text" id="diq-answer" class="input" placeholder="Type here…">
        <button type="button" class="btn btn-primary" data-action="submit-answer">Answer</button>
      </div>
    </div>
  </main>`;
}

function analyzingHTML() {
  return `<main class="analyzing">
    <span class="kicker">Comparing symptoms against known defect patterns</span>
    <div class="word">Analyzing…</div>
    <div class="scanbar"><i></i></div>
  </main>`;
}

function causeRows() {
  return CAUSES.map(c =>
    `<div class="cause-row${c.top ? ' top' : ''}">
      <span class="name">${c.name}</span>
      <div class="cause-bar"><i style="width: ${c.pct}%;"></i></div>
      <span class="pct">${c.pct}%</span>
    </div>`).join('');
}

function planRows() {
  return PLAN.map((p, i) =>
    `<div class="plan-row${state.done[i] ? ' done' : ''}" data-action="toggle-plan" data-idx="${i}">
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <span class="check">${state.done[i] ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' : ''}</span>
      <div class="txt"><b>${p.title}</b><span>${p.detail}</span></div>
    </div>`).join('');
}

function resultsHTML() {
  // If a LIVE analysis failed, show an explicit error — never fall through to the
  // placeholder numbers below, which would look like a genuine AI diagnosis.
  if (state.analysisError) {
    return `<main class="screen-narrow" data-screen="results">
      <div class="screen-head">
        <span class="kicker">Step 03 · Analysis</span>
        <h2 class="screen-title">Analysis couldn't complete</h2>
      </div>
      <div class="card qa-card" style="padding: 32px; border-left: 4px solid var(--warn-icon, #e53e3e);">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warn-icon, #e53e3e)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
          <div>
            <div style="font-weight: 700; margin-bottom: 6px;">The AI service didn't return a result.</div>
            <p style="color: var(--color-neutral-600); margin: 0 0 8px;">No diagnosis is shown, because the live analysis failed. Showing a result here would mean displaying placeholder data, not a real assessment of your problem.</p>
            <p style="font-size: 12px; color: var(--color-neutral-500); margin: 0;">Details: ${esc(state.analysisError)}</p>
          </div>
        </div>
        <div class="btn-row" style="margin-top: 20px;">
          <button type="button" class="btn btn-primary" data-action="retry-analysis">Try again${ARROW}</button>
          <button type="button" class="btn btn-ghost" data-action="go-settings">Switch to Demo Mode</button>
        </div>
      </div>
    </main>`;
  }

  const aiDefect = state.aiResult ? state.aiResult.defect : 'Inconsistent Dispensing Volume';
  const c = state.aiResult ? state.aiResult.confidenceScore : 4;
  const confLabel = c >= 4 ? 'High confidence' : c === 3 ? 'Moderate confidence' : 'Low confidence';
  const confTag = c >= 4
    ? '<span class="tag conf-high">High confidence</span>'
    : `<span class="tag tag-neutral">${confLabel}</span>`;

  const matchCount = state.matchedCases ? state.matchedCases.length : 0;

  const similar = CONFIG.showSimilarInsight && matchCount > 0 ? `
    <div class="card insight-card">
      <div class="card-kicker">From case history</div>
      <div class="big-n"><b>${matchCount}×</b><span>similar problems recorded</span></div>
      <p>The closest historical match was <strong>${esc(state.matchedCases[0].defect_type)}</strong> caused by ${esc(state.matchedCases[0].root_cause.toLowerCase())}.</p>
      <a href="#" data-action="go-history">View case history →</a>
    </div>` : '';

  const qs = state.aiResult && state.aiResult.qualityScore ? state.aiResult.qualityScore : {
    shapeConsistency: 4, sizeConsistency: 3, dispensingPosition: 5, defectRisk: 2, overall: 78
  };

  const qual = [
    { label: 'Shape consistency', v: qs.shapeConsistency || 4 },
    { label: 'Size consistency', v: qs.sizeConsistency || 3 },
    { label: 'Dispensing position', v: qs.dispensingPosition || 5 },
    { label: 'Defect risk', v: qs.defectRisk || 2 }
  ];

  const quality = CONFIG.showQualityScore ? `
    <div class="card">
      <div class="card-kicker">Dispensing quality assessment</div>
      ${qual.map(x => `<div class="quality-row"><span>${x.label}</span><span class="stars"><span class="stars-on">${stars(x.v)}</span></span></div>`).join('')}
      <div class="quality-total"><span>Overall quality</span><strong>${qs.overall || 78} / 100</strong></div>
    </div>` : '';

  const aiSymptomsList = state.aiResult && Array.isArray(state.aiResult.symptoms) ? state.aiResult.symptoms : [
    "Some dispensing dots are larger than specified",
    "Some dispensing dots are smaller than specified",
    "Results are not repeatable shot to shot",
    "Defect appears occasionally, not on every cycle"
  ];
  const aiSymptoms = aiSymptomsList.map(s => `<li>${esc(s)}</li>`).join('');

  const aiCausesList = state.aiResult && Array.isArray(state.aiResult.causes) && state.aiResult.causes.length > 0 ? state.aiResult.causes : CAUSES;
  const aiReasoning = state.aiResult && state.aiResult.reasoning ? state.aiResult.reasoning : reasoning();

  const causesHTML = aiCausesList.map((cause, i) =>
    `<div class="cause-row${i === 0 ? ' top' : ''}">
      <span class="name">${esc(cause.name || 'Unknown cause')}</span>
      <div class="cause-bar"><i style="width: ${cause.pct || 0}%;"></i></div>
      <span class="pct">${cause.pct || 0}%</span>
    </div>`).join('');

  // --- NEW: Generate the Dynamic Action Plan HTML ---
  // Safely grab the action plan from the AI result, or default to an empty array
  const aiActionPlan = state.aiResult?.actionPlan || [];

  // Map over the AI's steps. (If the AI fails to generate it, fallback to your old planRows())
  const dynamicPlanHTML = aiActionPlan.length > 0 ? aiActionPlan.map((item, index) => `
    <div class="plan-row" style="display: flex; align-items: flex-start; padding: 16px 0; border-bottom: 1px solid var(--border-light, #eee);">
      <div style="font-size: 1.25rem; font-weight: bold; color: var(--text-muted, #a0aec0); width: 40px; line-height: 1.2;">
        ${String(index + 1).padStart(2, '0')}
      </div>
      <label class="check-box" style="margin-right: 16px; margin-top: 2px; cursor: pointer;">
        <input type="checkbox" style="accent-color: var(--primary);">
      </label>
      <div style="flex: 1;">
        <div style="font-weight: 700; color: var(--text-main, #2d3748); margin-bottom: 4px;">${esc(item.step)}</div>
        <div style="color: var(--text-muted, #718096); font-size: 0.9rem; line-height: 1.4;">${esc(item.detail)}</div>
      </div>
    </div>
  `).join('') : planRows();
  // ------------------------------------------------

  return `<main class="screen-wide" data-screen="results">
    <div class="results-head">
      <h2 class="screen-title">Analysis results</h2>
      <span class="meta">Case ${CASE_ID} · ${REPORT_DATE}</span>
    </div>
    <div class="results-grid">
      <div class="card defect-card">
        <div class="head-row">
          <div class="card-kicker">What's wrong · Identified defect</div>
          ${confTag}
        </div>
        <div class="defect-name">${esc(aiDefect)}</div>
        <div class="stars-row">
          <span class="stars-on">${stars(c)}</span>
          <span class="lbl">Confidence ${c} / 5</span>
        </div>
        <div class="symptoms">
          <span class="kicker">Matching symptoms</span>
          <ul>
            ${aiSymptoms}
          </ul>
        </div>
      </div>
      <div class="side">${similar}${quality}</div>
    </div>
    <div class="card causes-card">
      <div class="card-kicker">Why · Ranked probable causes</div>
      <div class="cause-list">${causesHTML}</div>
      <div class="why-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn-icon)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
        <div class="inner">
          <span class="lbl">Why ${esc((aiCausesList[0]?.name || 'this cause').toLowerCase())} ranks highest</span>
          <p>${esc(aiReasoning)}</p>
        </div>
      </div>
    </div>
    <div class="card plan-card">
      <div class="card-kicker">What to do next · Recommended action plan</div>
      <!-- NEW: Replaced planRows() with dynamicPlanHTML -->
      <div class="plan-list">${dynamicPlanHTML}</div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-action="to-report">Generate report${ARROW}</button>
        <button type="button" class="btn btn-ghost" data-action="start-diagnosis">Start over</button>
      </div>
    </div>
  </main>`;
}

function reportHTML() {
  const c = state.aiResult ? state.aiResult.confidenceScore : 4;
  const confLabel = c >= 4 ? 'High confidence' : c === 3 ? 'Moderate confidence' : 'Low confidence';
  const problemSummary = state.problem.trim()
    || 'Dispensing dot size varies between boards; some dots within spec, others visibly undersized. Reported by line operator during second shift.';
  const answered = state.questions.filter(x => state.answers[x.id]);

  const aiDefect = state.aiResult ? state.aiResult.defect : 'Inconsistent Dispensing Volume';
  const aiCausesList = state.aiResult ? state.aiResult.causes : CAUSES;
  const aiReasoning = state.aiResult ? state.aiResult.reasoning : reasoning();

  // NEW: Grab the dynamic action plan from the AI, or fallback to the hardcoded PLAN
  const aiActionPlan = state.aiResult && state.aiResult.actionPlan ? state.aiResult.actionPlan : PLAN;

  return `<main class="screen-report" data-screen="report">
    <div class="card report-card">
      <div class="report-head">
        <div class="l">
          <span class="kicker">Case ${CASE_ID}</span>
          <h2>DispenseIQ Troubleshooting Report</h2>
        </div>
        <span class="date">${REPORT_DATE}</span>
      </div>
      <div class="report-sec">
        <span class="kicker">Problem description</span>
        <p>${esc(problemSummary)}</p>
      </div>
      <div class="report-2col">
        <div>
          <span class="kicker">Identified defect</span>
          <span class="val">${esc(aiDefect)}</span>
        </div>
        <div>
          <span class="kicker">Confidence score</span>
          <span class="stars-line"><span class="stars-on">${stars(c)}</span> <span class="lbl">${c} / 5 · ${confLabel}</span></span>
        </div>
      </div>
      <div class="report-sec">
        <span class="kicker">Session Q&amp;A</span>
        ${answered.length
      ? answered.map(x => `<div class="report-qa-row"><span class="q">${x.q}</span><span class="a">${esc(state.answers[x.id])}</span></div>`).join('')
      : '<p class="reasoning">No questions answered this session.</p>'}
      </div>
      <div class="report-sec">
        <span class="kicker">Cause ranking</span>
        <table class="table">
          <thead><tr><th>Possible cause</th><th style="text-align: right;">AI likelihood</th></tr></thead>
          <tbody>${aiCausesList.map(x => `<tr><td>${esc(x.name)}</td><td class="pct">${x.pct}%</td></tr>`).join('')}</tbody>
        </table>
        <p class="reasoning"><strong>AI reasoning:</strong> ${esc(aiReasoning)}</p>
      </div>
      <div class="report-sec">
        <span class="kicker">Recommended troubleshooting sequence</span>
        <!-- NEW: Maps the dynamic aiActionPlan, checking for both .step (AI) and .title (Fallback) -->
        <ol>${aiActionPlan.map(p => `<li><strong>${esc(p.step || p.title)}.</strong> ${esc(p.detail)}</li>`).join('')}</ol>
      </div>
      <div class="report-sec field">
        <label for="diq-notes" class="kicker">Engineer notes <span style="text-transform: none; letter-spacing: 0;">(optional)</span></label>
        <textarea id="diq-notes" class="input" rows="3" placeholder="Findings after inspection, confirmed cause, corrective action taken…">${esc(state.notes)}</textarea>
      </div>
    </div>
    <div class="btn-row" data-noprint>
      <button type="button" class="btn btn-primary" data-action="print-report"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>Download PDF</button>
      <button type="button" class="btn btn-secondary" data-action="back-to-results">Back to results</button>
      <button type="button" class="btn btn-ghost" data-action="start-diagnosis">New diagnosis</button>
    </div>
  </main>`;
}

function filteredCases() {
  const term = state.search.trim().toLowerCase();
  return HISTORY.filter(c => !term || [c.id, c.defect, c.cause, c.material, c.outcome, c.date].join(' ').toLowerCase().includes(term));
}

function historyRowsHTML(rows) {
  return rows.map(c =>
    `<tr>
      <td>${c.id}</td>
      <td class="date">${c.date}</td>
      <td>${c.defect}</td>
      <td>${c.cause}</td>
      <td>${c.material}</td>
      <td><span class="tag ${c.outcome === 'Resolved' ? 'tag-accent' : 'tag-neutral'}">${c.outcome}</span></td>
    </tr>`).join('');
}

function historyHTML() {
  const rows = filteredCases();
  return `<main class="screen-wide" data-screen="history">
    <div class="history-head">
      <div class="l">
        <span class="kicker">Learning database</span>
        <h2 class="screen-title">Case history</h2>
      </div>
      <div class="search-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-500)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        <input type="text" id="diq-search" placeholder="Search defect, cause, material…" value="${esc(state.search)}">
      </div>
    </div>
    <p class="history-count" id="history-count">${rows.length} of ${HISTORY.length} cases shown — resolved cases feed the "similar problems occurred before" insight on results pages.</p>
    <table class="table history-table">
      <thead>
        <tr><th>Case</th><th>Date</th><th>Defect</th><th>Confirmed cause</th><th>Material</th><th>Outcome</th></tr>
      </thead>
      <tbody id="history-body">${historyRowsHTML(rows)}</tbody>
    </table>
    <div class="history-empty" id="history-empty" ${rows.length ? 'hidden' : ''}>No cases match "<span id="history-term">${esc(state.search)}</span>".</div>
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-action="go-home">Back to start</button>
    </div>
  </main>`;
}

function settingsHTML() {
  return `<main class="screen-narrow" data-screen="settings">
    <div class="screen-head">
      <span class="kicker">App configuration</span>
      <h2 class="screen-title">Settings</h2>
    </div>
    <div class="card qa-card" style="padding: 32px;">
      <div class="field">
        <label style="margin-bottom: 8px;">Theme Color</label>
        <div class="chip-row">
          <button type="button" class="btn ${state.theme === 'light' ? 'btn-primary' : 'btn-secondary'}" data-action="set-theme" data-value="light">Light (Default)</button>
          <button type="button" class="btn ${state.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" data-action="set-theme" data-value="dark">Dark (Black Background)</button>
        </div>
      </div>
      <div class="field" style="margin-top: 24px;">
        <label style="margin-bottom: 8px;">Analysis Mode</label>
        <div class="chip-row">
          <button type="button" class="btn ${!state.demoMode ? 'btn-primary' : 'btn-secondary'}" data-action="set-demo" data-value="false">Live AI API (Requires Wi-Fi)</button>
          <button type="button" class="btn ${state.demoMode ? 'btn-primary' : 'btn-secondary'}" data-action="set-demo" data-value="true">Offline Demo Mode (Instant Mock)</button>
        </div>
        <span style="font-size: 12px; color: var(--color-neutral-600); margin-top: 6px;">Demo mode skips the Gemini API call and instantly loads the fallback data. Perfect for fast, live presentations!</span>
      </div>
      <div class="field" style="margin-top: 24px;">
        <label style="margin-bottom: 8px;">AI Strictness (Live API only)</label>
        <div class="chip-row">
          <button type="button" class="btn ${!state.strictMode ? 'btn-primary' : 'btn-secondary'}" data-action="set-strict" data-value="false">Standard Analysis</button>
          <button type="button" class="btn ${state.strictMode ? 'btn-primary' : 'btn-secondary'}" data-action="set-strict" data-value="true">Strict Quality Control</button>
        </div>
        <span style="font-size: 12px; color: var(--color-neutral-600); margin-top: 6px;">Strict mode tells the AI to deduct more quality points for even minor variations in dot sizes and shapes.</span>
      </div>
    </div>
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-action="go-home">Back to start</button>
    </div>
  </main>`;
}

/* ── render + wiring ──────────────────────────────────────────────── */
function render() {
  renderNav();
  const screens = {
    landing: landingHTML, input: inputHTML, qa: qaHTML,
    analyzing: analyzingHTML, results: resultsHTML, report: reportHTML, history: historyHTML, settings: settingsHTML
  };
  app.innerHTML = screens[state.screen]();
  wireScreen();
  window.scrollTo(0, 0);
}

function wireScreen() {
  const problem = document.getElementById('diq-problem');
  if (problem) problem.addEventListener('input', e => { state.problem = e.target.value; });

  const apikey = document.getElementById('diq-apikey');
  if (apikey) apikey.addEventListener('input', e => { state.apiKey = e.target.value; });

  const notes = document.getElementById('diq-notes');
  if (notes) notes.addEventListener('input', e => { state.notes = e.target.value; });

  const answerInput = document.getElementById('diq-answer');
  if (answerInput) {
    answerInput.addEventListener('keydown', e => { if (e.key === 'Enter') answer(answerInput.value); });
    answerInput.focus();
  }

  const file = document.getElementById('diq-file');
  if (file) file.addEventListener('change', e => readImage(e.target.files && e.target.files[0]));

  const dz = document.getElementById('dropzone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      readImage(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  // History search filters in place (no full re-render, keeps input focus)
  const search = document.getElementById('diq-search');
  if (search) search.addEventListener('input', e => {
    state.search = e.target.value;
    const rows = filteredCases();
    document.getElementById('history-body').innerHTML = historyRowsHTML(rows);
    document.getElementById('history-count').textContent =
      `${rows.length} of ${HISTORY.length} cases shown — resolved cases feed the "similar problems occurred before" insight on results pages.`;
    const empty = document.getElementById('history-empty');
    empty.hidden = rows.length > 0;
    document.getElementById('history-term').textContent = state.search;
  });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (el.tagName === 'A') e.preventDefault();
  switch (action) {
    case 'go-home': setScreen('landing'); break;
    case 'go-history': setScreen('history'); break;
    case 'go-settings': setScreen('settings'); break;
    case 'set-theme': {
      state.theme = el.dataset.value;
      if (state.theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      render();
      break;
    }
    case 'set-demo': state.demoMode = el.dataset.value === 'true'; render(); break;
    case 'set-strict': state.strictMode = el.dataset.value === 'true'; render(); break;
    case 'start-diagnosis': startDiagnosis(); break;
    case 'continue-qa': setScreen('qa', 1); break;
    case 'to-report': setScreen('report', 3); break;
    case 'back-to-results': setScreen('results'); break;
    case 'nav-step': {
      const stage = Number(el.dataset.stage);
      if (stage <= state.maxStage) setScreen(el.dataset.screen);
      break;
    }
    case 'retry-analysis':
      state.analysisError = null;
      state.screen = 'analyzing';
      render();
      analyzeWithGemini();
      break;
    case 'chip': answer(el.dataset.value); break;
    case 'submit-answer': answer(document.getElementById('diq-answer').value); break;
    case 'pick-file': document.getElementById('diq-file').click(); break;
    case 'clear-image': state.imageUrl = null; render(); break;
    case 'toggle-plan': {
      const i = Number(el.dataset.idx);
      state.done[i] = !state.done[i];
      render();
      break;
    }
    case 'print-report': window.print(); break;
  }
});

render();
