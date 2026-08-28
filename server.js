import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

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
          pct: { type: Type.INTEGER }           // 0–100
        },
        required: ['name', 'pct']
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
    }
  },
  required: ['defect', 'confidenceScore', 'symptoms', 'causes', 'qualityScore', 'reasoning', 'actionPlan']
};

// --- AI DIAGNOSTIC ENDPOINT ---
app.post('/api/analyze', async (req, res) => {
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

    // Format the database hits to inject cleanly into the model prompt context window
    const historicalContext = matchedCases && matchedCases.length > 0
      ? matchedCases.map(c => `- Past Confirmed Defect: ${c.defect_type}\n  Symptoms: ${c.symptoms}\n  Root Cause: ${c.root_cause}\n  Resolution: ${c.resolution}`).join('\n\n')
      : "No exact matching past records found. Reference standard manufacturing baseline tolerances.";

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
Determine the statistical likelihood of root causes. You MUST explain the exact logic of WHY the top item is prioritized based on symptom timing metrics.

Populate every field of the required structure:
- "defect": the single identified defect name.
- "confidenceScore": your confidence in that defect, an integer 1–5.
- "symptoms": the operator-reported symptoms that match this defect.
- "causes": ranked probable root causes, each with a "pct" likelihood 0–100 (highest first).
- "qualityScore": ratings for shapeConsistency, sizeConsistency, dispensingPosition and defectRisk as integers 1–5, plus an "overall" score 0–100.
- "reasoning": a context-aware paragraph justifying why the top cause ranks highest.
- "actionPlan": ordered troubleshooting steps, each with a short "step" title and a specific "detail".`;

    // Pack text prompt context
    const contentParts = [{ text: promptText }];

    // If an image upload exists from the drag-and-drop area, include it as data part
    if (imageUrl && imageUrl.includes(',')) {
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

    // Add the real-time database hits directly to the return payload so the frontend can populate insights
    res.json({
      aiResult: parsedDiagnosticResult,
      matchedCases: matchedCases
    });

  } catch (error) {
    console.error("Critical Backend Failure:", error);
    res.status(500).json({ error: "Inference calculation pipeline broke down.", details: error.message });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`DispenseIQ Engine online at http://localhost:${PORT}`);
});