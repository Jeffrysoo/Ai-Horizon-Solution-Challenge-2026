import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import 'dotenv/config';
import rateLimit from 'express-rate-limit';
import { analyzeProblem, listCases, confirmCase } from './lib/analyze.js';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const app = express();

// Use process.cwd() so paths resolve reliably across both local development and Vercel's /var/task
const rootDir = process.cwd();

// Serve static assets from both project root and public folder if present
app.use(express.static(rootDir));
app.use('/assets', express.static(path.join(rootDir, 'assets')));
if (fs.existsSync(path.join(rootDir, 'public'))) {
  app.use(express.static(path.join(rootDir, 'public')));
}

// Fallback index.html route for SPA navigation
app.get('/', (req, res) => {
  const indexPath = fs.existsSync(path.join(rootDir, 'index.html'))
    ? path.join(rootDir, 'index.html')
    : path.join(rootDir, 'public', 'index.html');
  res.sendFile(indexPath);
});

// Accepts the base64 photo from the frontend. The browser downscales photos to
// ≤1600px JPEG (well under 2 MB as base64), so 5 MB leaves headroom without
// letting a single request carry an arbitrarily large payload.
app.use(express.json({ limit: '5mb' }));

// Each request costs a real Gemini embedding + generation call, so cap how often
// one client can hit this endpoint to avoid runaway API spend if the URL goes public.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests — please wait a moment and try again.' }
});

// Map internal failures to messages safe to show an operator; internals stay in the server log.
function publicError(error) {
  const status = error?.status ?? error?.cause?.status;
  const ours = error?.name === 'AnalysisError';
  if (ours && (status === 400 || status === 503)) return { code: status, message: error.message };
  if (status === 429) return { code: 503, message: 'The AI service quota is exhausted right now. Try again later, or switch to Offline Demo Mode in Settings.' };
  if (status === 503) return { code: 503, message: 'The AI service is busy. Please try again in a moment.' };
  return { code: 500, message: 'The analysis could not be completed. Please try again.' };
}

// --- AI DIAGNOSTIC ENDPOINT ---
app.post('/api/analyze', analyzeLimiter, async (req, res) => {
  try {
    const { problem, answers, imageUrl, strictMode } = req.body || {};
    res.json(await analyzeProblem({ problem, answers, imageUrl, strictMode }));
  } catch (error) {
    const { code, message } = publicError(error);
    if (code >= 500) console.error('Analysis failed:', error);
    res.status(code).json({ error: message });
  }
});

// --- LEARNING LOOP: an engineer confirms a diagnosis → it becomes a knowledge-base case ---
const confirmLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many confirmations — please wait a moment and try again.' }
});

app.post('/api/confirm', confirmLimiter, async (req, res) => {
  try {
    const { defect, cause, resolution, problem, answers, caseRef } = req.body || {};
    res.json(await confirmCase({ defect, cause, resolution, problem, answers, caseRef }));
  } catch (error) {
    const { code, message } = publicError(error);
    if (code >= 500) console.error('Confirm failed:', error);
    res.status(code).json({ error: message });
  }
});

// --- KNOWLEDGE BASE LISTING (read-only; powers the Case history screen) ---
app.get('/api/cases', async (req, res) => {
  try {
    res.json({ cases: await listCases() });
  } catch (error) {
    console.error('Case history load failed:', error);
    res.status(500).json({ error: 'Could not load the case history.' });
  }
});

// Only listen when running standalone in local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`DispenseIQ server running locally on port ${PORT}`);
  });
}

export default app;
