import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
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

You must return ONLY a raw JSON object matching this structural definition template precisely (do not wrap in markdown tags):
    {
      "defect": "Identified Defect Name",
      "confidenceScore": 4,
      "symptoms": ["Symptom match sentence 1", "Symptom match sentence 2"],
      "causes": [
        {"name": "Air Bubble", "pct": 85},
        {"name": "Nozzle Blockage", "pct": 70}
      ],
      "qualityScore": {
        "shapeConsistency": 4,
        "sizeConsistency": 3,
        "dispensingPosition": 5,
        "defectRisk": 2,
        "overall": 78
      },
      "reasoning": "Detailed, context-aware logical justification paragraph.",
      "actionPlan": [
        {"step": "Title of step 1", "detail": "Detailed specific instruction for step 1"},
        {"step": "Title of step 2", "detail": "Detailed specific instruction for step 2"},
        {"step": "Title of step 3", "detail": "Detailed specific instruction for step 3"}
      ]
    }
    `;

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

    // --- STEP 5: Clean, Parse, and Return the Result ---
    let rawOutputText = chatResponse.text.trim();

    // Safety clean format if the model accidentally slips markdown wrapper strings in
    rawOutputText = rawOutputText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');

    const parsedDiagnosticResult = JSON.parse(rawOutputText);

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