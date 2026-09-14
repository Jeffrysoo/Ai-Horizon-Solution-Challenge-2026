// Runs the labelled cases in eval/cases.js through the SAME pipeline the server uses
// (lib/analyze.js) and reports top-1 accuracy, out-of-scope detection, confidence
// calibration and image-finding recall.
//
//   npm run eval                       all cases (1 embed + 1 generate call each)
//   npm run eval -- --only vol,oos-cold  a subset
//   npm run eval -- --limit 4          first N cases
//   npm run eval -- --delay 8000       pause between cases (ms, default 6000)
//   npm run eval -- --tag before-reseed  label the saved results
//
// Results are written to eval/results/<timestamp>-<tag>.{json,md} and latest.md.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeProblem, GENERATION_MODEL, LOW_SIMILARITY_THRESHOLD } from '../lib/analyze.js';
import { CASES } from './cases.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const only = arg('only', '').split(',').map(s => s.trim()).filter(Boolean);
const limit = Number(arg('limit', 0)) || 0;
const delayMs = Number(arg('delay', 6000)) || 0;
const tag = arg('tag', 'run').replace(/[^\w.-]+/g, '-');

let selected = only.length ? CASES.filter(c => only.includes(c.id)) : CASES.slice();
if (limit) selected = selected.slice(0, limit);
if (!selected.length) {
  console.error('No cases selected. Known ids:', CASES.map(c => c.id).join(', '));
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (n, d) => d ? `${n}/${d} (${Math.round((n / d) * 100)}%)` : 'n/a';
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const fmt = x => x == null ? '—' : (Math.round(x * 100) / 100).toString();

function loadImage(rel) {
  const file = path.join(here, rel);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

const rows = [];
let knowledgeBaseSize = null;
let quotaStop = false;

console.log(`DispenseIQ eval — ${selected.length} case(s), model ${GENERATION_MODEL}, threshold ${LOW_SIMILARITY_THRESHOLD}\n`);

for (let i = 0; i < selected.length; i++) {
  const c = selected[i];
  const row = { id: c.id, label: c.label, scope: c.outOfScope ? 'out' : 'in' };
  if (quotaStop) { row.status = 'skipped (quota)'; rows.push(row); continue; }

  const started = Date.now();
  try {
    const result = await analyzeProblem({
      problem: c.problem,
      answers: c.answers,
      imageUrl: c.image ? loadImage(c.image) : null
    });
    const { aiResult, retrieval } = result;
    knowledgeBaseSize = knowledgeBaseSize ?? retrieval.totalCases;

    row.ms = Date.now() - started;
    row.defect = aiResult.defect;
    row.confidence = aiResult.confidenceScore;
    row.similarity = retrieval.topSimilarity;
    row.lowConfidence = retrieval.lowConfidence;
    row.lowReason = retrieval.lowConfidenceReason;
    row.topCause = aiResult.causes?.[0]?.name || '';
    // Did retrieval surface the right defect type? Top-1 accuracy can come from the model's
    // own knowledge; this is the number that shows whether the knowledge base is doing work.
    row.topMatch = result.matchedCases?.[0]?.defect_type || '';
    row.retrievalHit = c.match ? c.match.test(row.topMatch) : null;
    row.evidenceCount = (aiResult.causes || []).reduce((n, x) => n + (x.evidence?.length || 0), 0);

    if (c.outOfScope) {
      row.pass = retrieval.lowConfidence && aiResult.confidenceScore <= 2;
      row.status = row.pass ? 'flagged out-of-scope' : 'NOT flagged';
    } else {
      row.pass = c.match.test(aiResult.defect || '');
      row.status = row.pass ? 'defect matched' : 'defect mismatch';
    }
    if (c.expectFindings) {
      const got = new Set((aiResult.imageFindings || []).map(f => f.finding));
      row.findingsFound = c.expectFindings.filter(f => got.has(f));
      row.findingsExpected = c.expectFindings;
      row.findingsExtra = [...got].filter(f => !c.expectFindings.includes(f));
    }
  } catch (err) {
    row.ms = Date.now() - started;
    row.error = err.message;
    row.status = `error: ${err.message}`;
    if (err.status === 429 || /quota/i.test(err.message || '')) {
      quotaStop = true;
      row.status = 'error: quota exhausted';
    }
  }
  rows.push(row);
  console.log(`[${i + 1}/${selected.length}] ${c.id.padEnd(10)} ${row.status}${row.defect ? ` — "${row.defect}" conf ${row.confidence} sim ${fmt(row.similarity)}` : ''}`);
  if (i < selected.length - 1 && !quotaStop && delayMs) await sleep(delayMs);
}

// ── Summary ────────────────────────────────────────────────────────────────
const scored = rows.filter(r => !r.error && r.status !== 'skipped (quota)');
const inScope = scored.filter(r => r.scope === 'in');
const outScope = scored.filter(r => r.scope === 'out');
const summary = {
  ranAt: new Date().toISOString(),
  tag,
  model: GENERATION_MODEL,
  threshold: LOW_SIMILARITY_THRESHOLD,
  knowledgeBaseSize,
  cases: rows.length,
  errors: rows.filter(r => r.error).length,
  inScope: {
    n: inScope.length,
    top1Correct: inScope.filter(r => r.pass).length,
    retrievalHits: inScope.filter(r => r.retrievalHit).length,
    flaggedLowConfidence: inScope.filter(r => r.lowConfidence).length,
    meanConfidence: mean(inScope.map(r => r.confidence)),
    meanSimilarity: mean(inScope.map(r => r.similarity))
  },
  outOfScope: {
    n: outScope.length,
    flagged: outScope.filter(r => r.pass).length,
    meanConfidence: mean(outScope.map(r => r.confidence)),
    meanSimilarity: mean(outScope.map(r => r.similarity))
  },
  imageFindings: rows.filter(r => r.findingsExpected).map(r => ({
    id: r.id, found: r.findingsFound.length, expected: r.findingsExpected.length, extra: r.findingsExtra
  })),
  rows
};

const lines = [];
lines.push(`# DispenseIQ evaluation — ${summary.ranAt} (${tag})`);
lines.push('');
lines.push(`Model: \`${summary.model}\` · low-confidence threshold: ${summary.threshold} · knowledge base rows at run time: ${knowledgeBaseSize ?? 'unknown'}`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- In-scope top-1 defect match: **${pct(summary.inScope.top1Correct, summary.inScope.n)}**`);
lines.push(`- In-scope retrieval hit (closest knowledge-base case is the right defect type): **${pct(summary.inScope.retrievalHits, summary.inScope.n)}**`);
lines.push(`- In-scope cases flagged low-confidence (knowledge-base gap): ${pct(summary.inScope.flaggedLowConfidence, summary.inScope.n)}`);
lines.push(`- Out-of-scope cases correctly flagged (low confidence, score ≤ 2): **${pct(summary.outOfScope.flagged, summary.outOfScope.n)}**`);
lines.push(`- Mean confidence — in-scope ${fmt(summary.inScope.meanConfidence)} / 5 vs out-of-scope ${fmt(summary.outOfScope.meanConfidence)} / 5`);
lines.push(`- Mean top similarity — in-scope ${fmt(summary.inScope.meanSimilarity)} vs out-of-scope ${fmt(summary.outOfScope.meanSimilarity)}`);
for (const f of summary.imageFindings) {
  lines.push(`- Image findings recall (${f.id}): **${f.found}/${f.expected}**${f.extra.length ? ` · extra labels: ${f.extra.join(', ')}` : ''}`);
}
if (summary.errors) lines.push(`- Errors: ${summary.errors}${quotaStop ? ' (run stopped early: Gemini quota exhausted)' : ''}`);
lines.push('');
lines.push('## Cases');
lines.push('');
lines.push('| id | scope | expected | got | conf | sim | KB top match | low-conf | result | ms |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const kb = r.topMatch ? `${r.topMatch}${r.retrievalHit == null ? '' : r.retrievalHit ? ' ✓' : ' ✗'}` : '—';
  lines.push(`| ${r.id} | ${r.scope} | ${r.label} | ${r.defect ?? '—'} | ${r.confidence ?? '—'} | ${fmt(r.similarity)} | ${kb} | ${r.lowConfidence == null ? '—' : r.lowConfidence ? `yes (${r.lowReason})` : 'no'} | ${r.status} | ${r.ms ?? '—'} |`);
}
const md = lines.join('\n') + '\n';

const outDir = path.join(here, 'results');
fs.mkdirSync(outDir, { recursive: true });
const stamp = summary.ranAt.replace(/[:.]/g, '-');
fs.writeFileSync(path.join(outDir, `${stamp}-${tag}.json`), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, `${stamp}-${tag}.md`), md);
fs.writeFileSync(path.join(outDir, 'latest.md'), md);

console.log('\n' + md);
console.log(`Saved to eval/results/${stamp}-${tag}.{json,md} and eval/results/latest.md`);
