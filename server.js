import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import rateLimit from 'express-rate-limit';
import { analyzeProblem, listCases } from './lib/analyze.js';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const app = express();

// Serves index.html, styles.css, app.js and assets straight from this folder.
app.use(express.static(__dirname));

// Allows the server to accept the base64 image strings from the frontend
app.use(express.json({ limit: '10mb' }));

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
  if (status === 400) return { code: 400, message: error.message };
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

// --- KNOWLEDGE BASE LISTING (read-only; powers the Case history screen) ---
app.get('/api/cases', async (req, res) => {
  try {
    res.json({ cases: await listCases() });
  } catch (error) {
    console.error('Case history load failed:', error);
    res.status(500).json({ error: 'Could not load the case history.' });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`DispenseIQ Engine online at http://localhost:${PORT}`);
});
