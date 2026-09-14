import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const app = express();

// --- MIDDLEWARE ---
// This replaces your manual 'fs.readFile' and 'TYPES' mapping. 
// It automatically serves index.html, styles.css, app.js, and images from this folder.
app.use(express.static(__dirname));

// Allows the server to accept the large base64 image strings from the frontend
app.use(express.json({ limit: '10mb' }));

// --- INITIALIZE CLOUD CLIENTS ---
// Pulls securely from your hidden .env file
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Enforced shape of the model's reply. With responseMimeType 'application/json' +
// this schema, Gemini can ONLY emit valid JSON in this structure — no markdown
// fences, no prose, no missing fields — so JSON.parse below can never throw on format.
const DIAGNOSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    defect: { type: Type.STRING },
    confidenceScore: { type: Type.INTEGER },   // 1–5
    symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
    causes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          pct: { type: Type.INTEGER },          // 0–100
          evidence: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                answer: { type: Type.STRING, description: 'The specific operator answer or photo observation, quoted briefly' },
                effect: { type: Type.STRING, enum: ['supports', 'weakens'] },
                note: { type: Type.STRING, description: 'One short clause on why this moves the likelihood' }
              },
              required: ['answer', 'effect', 'note']
            }
          }
        },
        required: ['name', 'pct', 'evidence']
      }
    },
    qualityScore: {
      type: Type.OBJECT,
      properties: {
        shapeConsistency: { type: Type.INTEGER },   // 1–5
        sizeConsistency: { type: Type.INTEGER },     // 1–5
        dispensingPosition: { type: Type.INTEGER },  // 1–5
        defectRisk: { type: Type.INTEGER },          // 1–5
        overall: { type: Type.INTEGER }              // 0–100
      },
      required: ['shapeConsistency', 'sizeConsistency', 'dispensingPosition', 'defectRisk', 'overall']
    },
    reasoning: { type: Type.STRING },
    actionPlan: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.STRING },
          detail: { type: Type.STRING }
        },
        required: ['step', 'detail']
      }
    },
    imageFindings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          finding: { type: Type.STRING, enum: ['Missing Dot', 'Oversized Dot', 'Undersized Dot', 'Irregular Shape', 'Excessive Spreading', 'Other'] },
          detail: { type: Type.STRING, description: 'Where in the image it is and what is visible' },
          severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
        },
        required: ['finding', 'detail', 'severity']
      }
    }
  },
  required: ['defect', 'confidenceScore', 'symptoms', 'causes', 'qualityScore', 'reasoning', 'actionPlan', 'imageFindings']
};

// Some seed rows carry "[cite: N]" copy-paste artifacts; never show them or prompt with them.
const stripCiteArtifacts = s => typeof s === 'string' ? s.replace(/\s*\[cite:[^\]]*\]/g, '') : s;
const cleanCase = c => ({
  ...c,
  defect_type: stripCiteArtifacts(c.defect_type),
  symptoms: stripCiteArtifacts(c.symptoms),
  root_cause: stripCiteArtifacts(c.root_cause),
  resolution: stripCiteArtifacts(c.resolution)
});

// Each request costs a real Gemini embedding + generation call, so cap how often
// one client can hit this endpoint to avoid runaway API spend if the URL goes public.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests — please wait a moment and try again.' }
});

// --- AI DIAGNOSTIC ENDPOINT ---
app.post('/api/analyze', analyzeLimiter, async (req, res) => {
  try {
    const { problem, answers, imageUrl, strictMode } = req.body;

    if (!problem) {
      return res.status(400).json({ error: "Problem description is required." });
    }

    // 1. Generate Semantic Search Embedding vector from User Query
    const embeddingResponse = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: `Problem: ${problem}. Answers: ${JSON.stringify(answers)}`,
    });

    // Updated to safely extract from the SDK's 'embeddings' array
    const queryVector = embeddingResponse.embeddings
      ? embeddingResponse.embeddings[0].values
      : embeddingResponse.embedding.values;

    // 2. Query Supabase using the match_defects RPC
    const { data: matchedCases, error: dbError } = await supabase.rpc('match_defects', {
      query_embedding: queryVector,
      match_threshold: 0.5, // Return relevant context entries matching > 50%
      match_count: 3        // Grab top 3 closest historical rows
    });

    if (dbError) throw dbError;

    const cases = (matchedCases || []).map(cleanCase);

    // How many confirmed cases share the top match's defect type — the honest version of
    // "similar problems occurred N times before" (the vector search itself is capped at 3).
    let sameDefectCount = 0;
    let totalCases = 0;
    const [totalRes, sameRes] = await Promise.all([
      supabase.from('defect_knowledgebase').select('*', { count: 'exact', head: true }),
      cases.length
        ? supabase.from('defect_knowledgebase').select('*', { count: 'exact', head: true }).eq('defect_type', matchedCases[0].defect_type)
        : Promise.resolve({ count: 0, error: null })
    ]);
    totalCases = totalRes.error ? 0 : (totalRes.count || 0);
    sameDefectCount = sameRes.error
      ? cases.filter(c => c.defect_type === cases[0].defect_type).length
      : (sameRes.count || 0);

    // Format the database hits to inject cleanly into the model prompt context window
    const historicalContext = cases.length > 0
      ? cases.map(c => `- Past Confirmed Defect: ${c.defect_type}\n  Symptoms: ${c.symptoms}\n  Root Cause: ${c.root_cause}\n  Resolution: ${c.resolution}`).join('\n\n')
      : "No exact matching past records found. Reference standard manufacturing baseline tolerances.";

    // Below this, the closest historical match is too weak to trust as grounding —
    // the model should say so instead of confidently forcing the input into a known category.
    const LOW_SIMILARITY_THRESHOLD = 0.7;
    const topSimilarity = cases.length > 0 ? cases[0].similarity : 0;
    const isLowConfidenceRetrieval = topSimilarity < LOW_SIMILARITY_THRESHOLD;
    const hasImage = Boolean(imageUrl && imageUrl.includes(','));

    // 3. Construct the Prompts for Multimodal Gemini Inference Engine
    let promptText = `You are a professional industrial automated technician troubleshooting assistant specializing in fluid dispensing defects.

### HISTORICAL DATABASE CONTEXT MATCHES:
${historicalContext}

### CURRENT OPERATOR EVALUATION PROFILE:
- Operator Problem Description: "${problem}"
- Structured Diagnostic Answers: ${JSON.stringify(answers)}

### REASONING ENGINE INSTRUCTIONS:
Analyze the user diagnostics against our database.
${strictMode ? 'CRITICAL QUALITY CONTROL OVERRIDE: Penalize quality indices drastically for discrepancies.' : 'Apply conventional physical manufacturing error margins.'}
${isLowConfidenceRetrieval ? `LOW-CONFIDENCE RETRIEVAL WARNING: The closest historical case matched at only ${(topSimilarity * 100).toFixed(0)}% similarity, below our ${(LOW_SIMILARITY_THRESHOLD * 100).toFixed(0)}% confident-match bar. This may describe a defect outside our fluid-dispensing knowledge base entirely (e.g. a soldering, reflow, or component-placement issue rather than a dispensing issue) — do not force-fit it into one of the historical categories with high confidence. Cap "confidenceScore" at 2 or below unless the evidence is truly unambiguous, and explicitly say in "reasoning" that this case doesn't closely match known dispensing defects.` : ''}
Determine the statistical likelihood of root causes. You MUST explain the exact logic of WHY the top item is prioritized based on symptom timing metrics.

Populate every field of the required structure:
- "defect": the single identified defect name.
- "confidenceScore": your confidence in that defect, an integer 1–5.
- "symptoms": the operator-reported symptoms that match this defect.
- "causes": ranked probable root causes, each with a "pct" likelihood 0–100 (highest first). For each cause give an "evidence" list of 1–3 items: each quotes one specific operator answer or photo observation in "answer" (short, in the operator's own words), says whether it "supports" or "weakens" this cause in "effect", and gives a one-clause "note" on why. Every cause must cite at least one answer.
- "qualityScore": ratings for shapeConsistency, sizeConsistency, dispensingPosition and defectRisk as integers 1–5, plus an "overall" score 0–100.
- "reasoning": a context-aware paragraph justifying why the top cause ranks highest.
- "actionPlan": ordered troubleshooting steps, each with a short "step" title and a specific "detail".
- "imageFindings": ${hasImage
  ? 'inspect the attached photo and list every visible dispensing defect, one item each, using only these labels for "finding": Missing Dot, Oversized Dot, Undersized Dot, Irregular Shape, Excessive Spreading, Other. In "detail" say where in the image it is and what you see; set "severity" to low, medium or high. If the photo shows something that is not a dispensing defect, use "Other" and describe what it actually shows.'
  : 'no photo was attached, so return an empty array.'}`;

    // Pack text prompt context
    const contentParts = [{ text: promptText }];

    // If an image upload exists from the drag-and-drop area, include it as data part
    if (hasImage) {
      const mimeType = imageUrl.match(/data:(.*?);/)[1];
      const base64Data = imageUrl.split(',')[1];
      contentParts.push({
        inlineData: { mimeType, data: base64Data }
      });
    }

    // 4. Fire live inference using Gemini Flash multimodal engine
    const maxRetries = 3;
    let chatResponse = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        chatResponse = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: contentParts,
          config: {
            responseMimeType: 'application/json',
            responseSchema: DIAGNOSIS_SCHEMA,
            // Low temperature keeps diagnoses repeatable across near-identical inputs
            // (default temperature produced visibly different confidence scores/wording
            // for the same case on repeated calls during testing).
            temperature: 0.25,
          },
        });
        break; // If successful, break out of the retry loop
      } catch (inferenceError) {
        if ((inferenceError.status === 503 || inferenceError.status === 429) && attempt < maxRetries) {
          console.warn(`[API Busy] Retrying attempt ${attempt} of ${maxRetries} in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw inferenceError;
        }
      }
    }

    // --- STEP 5: Parse and Return the Result ---
    // The responseSchema guarantees chatResponse.text is valid JSON in the shape above,
    // so no markdown-stripping is needed and JSON.parse will not throw on formatting.
    const parsedDiagnosticResult = JSON.parse(chatResponse.text);

    // Backstop in case the model doesn't follow the prompt's confidence-cap instruction —
    // don't rely solely on prompt compliance for something the UI treats as a hard signal.
    if (isLowConfidenceRetrieval && parsedDiagnosticResult.confidenceScore > 2) {
      parsedDiagnosticResult.confidenceScore = 2;
    }
    if (!hasImage) parsedDiagnosticResult.imageFindings = [];

    res.json({
      aiResult: parsedDiagnosticResult,
      matchedCases: cases,
      retrieval: {
        topSimilarity,
        threshold: LOW_SIMILARITY_THRESHOLD,
        lowConfidence: isLowConfidenceRetrieval,
        sameDefectCount,
        totalCases
      }
    });

  } catch (error) {
    console.error("Critical Backend Failure:", error);
    res.status(500).json({ error: "Inference calculation pipeline broke down.", details: error.message });
  }
});

// --- KNOWLEDGE BASE LISTING (read-only; powers the Case history screen) ---
app.get('/api/cases', async (req, res) => {
  const { data, error } = await supabase
    .from('defect_knowledgebase')
    .select('id, defect_type, symptoms, root_cause, resolution')
    .order('id', { ascending: false });
  if (error) {
    console.error('Case history load failed:', error);
    return res.status(500).json({ error: 'Could not load the case history.' });
  }
  res.json({ cases: data.map(cleanCase) });
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`DispenseIQ Engine online at http://localhost:${PORT}`);
});