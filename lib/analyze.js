import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export const GENERATION_MODEL = 'gemini-3.6-flash';
export const EMBEDDING_MODEL = 'gemini-embedding-001';

// Below this, the closest historical match is too weak to trust as grounding —
// the model is told to say so instead of forcing the input into a known category.
export const LOW_SIMILARITY_THRESHOLD = 0.7;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const SYSTEM_INSTRUCTION = `You are DispenseIQ, a troubleshooting assistant for industrial fluid dispensing (adhesives, solder paste, epoxy, sealants and similar fluids). You help technicians identify the dispensing defect, rank probable root causes, and decide what to check first.

Rules:
- Reason from the operator's specific answers and the retrieved historical cases, and quote them as evidence. Never give generic answers.
- Always explain WHY the top cause outranks the others in terms of the reported symptom pattern: timing, consistency, location, and recent changes.
- If the case does not closely match known dispensing defects, say so plainly and keep confidence low rather than forcing a match.
- Be concrete and brief: an experienced line engineer should be able to act on every step.`;

// Enforced shape of the model's reply. With responseMimeType 'application/json' +
// this schema, Gemini can ONLY emit valid JSON in this structure — no markdown
// fences, no prose, no missing fields — so JSON.parse below can never throw on format.
const DIAGNOSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    defect: {
      type: Type.STRING,
      description: 'The single most likely dispensing defect, named the way a process engineer would (e.g. "Inconsistent Dispensing Volume")'
    },
    confidenceScore: {
      type: Type.INTEGER,
      description: 'Confidence that "defect" is correct, integer 1 (a guess) to 5 (near certain). Must reflect how well the evidence and historical matches fit.'
    },
    symptoms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Symptoms the operator actually reported, or that are visible in the photo, which match this defect'
    },
    causes: {
      type: Type.ARRAY,
      description: 'Probable root causes, highest likelihood first',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Short root-cause name (e.g. "Air trapped in syringe")' },
          pct: { type: Type.INTEGER, description: 'Likelihood 0–100 that this cause is responsible' },
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
        shapeConsistency: { type: Type.INTEGER, description: 'How consistent the dot shapes are, 1 (poor) to 5 (excellent)' },
        sizeConsistency: { type: Type.INTEGER, description: 'How consistent the dot sizes/volumes are, 1 (poor) to 5 (excellent)' },
        dispensingPosition: { type: Type.INTEGER, description: 'How accurately dots land on target, 1 (poor) to 5 (excellent)' },
        defectRisk: { type: Type.INTEGER, description: 'Risk that this condition produces rejects, 1 (low risk) to 5 (high risk)' },
        overall: { type: Type.INTEGER, description: 'Overall dispensing quality 0–100, consistent with the four ratings' }
      },
      required: ['shapeConsistency', 'sizeConsistency', 'dispensingPosition', 'defectRisk', 'overall']
    },
    reasoning: {
      type: Type.STRING,
      description: 'One paragraph explaining why the top cause outranks the others, referring to the specific answers (timing, consistency, recent changes, location)'
    },
    actionPlan: {
      type: Type.ARRAY,
      description: 'Ordered troubleshooting sequence: what to check first, second, and so on',
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.STRING, description: 'Short imperative title of the check (e.g. "Purge the syringe")' },
          detail: { type: Type.STRING, description: 'Exactly what to do, and what result would confirm or rule out the cause' }
        },
        required: ['step', 'detail']
      }
    },
    imageFindings: {
      type: Type.ARRAY,
      description: 'Defects visible in the attached photo; empty when no photo was attached',
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
export const cleanCase = c => ({
  ...c,
  defect_type: stripCiteArtifacts(c.defect_type),
  symptoms: stripCiteArtifacts(c.symptoms),
  root_cause: stripCiteArtifacts(c.root_cause),
  resolution: stripCiteArtifacts(c.resolution)
});

export class AnalysisError extends Error {
  constructor(message, { status = 500, cause } = {}) {
    super(message);
    this.name = 'AnalysisError';
    this.status = status;
    this.cause = cause;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(request, maxRetries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (err) {
      const transient = err.status === 503 || err.status === 429;
      if (!transient || attempt >= maxRetries) throw err;
      console.warn(`[API busy] retry ${attempt}/${maxRetries} in 2s…`);
      await sleep(2000);
    }
  }
}

export async function analyzeProblem({ problem, answers = {}, imageUrl = null, strictMode = false }) {
  if (!problem || !String(problem).trim()) {
    throw new AnalysisError('Problem description is required.', { status: 400 });
  }
  const hasImage = Boolean(imageUrl && typeof imageUrl === 'string' && imageUrl.includes(','));

  // 1. Embed the operator's description + answers for semantic search
  const embeddingResponse = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: `Problem: ${problem}. Answers: ${JSON.stringify(answers)}`
  });
  const queryVector = embeddingResponse.embeddings
    ? embeddingResponse.embeddings[0].values
    : embeddingResponse.embedding.values;

  // 2. Nearest confirmed cases from the knowledge base
  const { data: matchedCases, error: dbError } = await supabase.rpc('match_defects', {
    query_embedding: queryVector,
    match_threshold: 0.5,
    match_count: 3
  });
  if (dbError) throw new AnalysisError('Knowledge base search failed.', { status: 500, cause: dbError });

  const cases = (matchedCases || []).map(cleanCase);

  // How many confirmed cases share the top match's defect type — the honest version of
  // "similar problems occurred N times before" (the vector search itself is capped at 3).
  const [totalRes, sameRes] = await Promise.all([
    supabase.from('defect_knowledgebase').select('*', { count: 'exact', head: true }),
    cases.length
      ? supabase.from('defect_knowledgebase').select('*', { count: 'exact', head: true }).eq('defect_type', matchedCases[0].defect_type)
      : Promise.resolve({ count: 0, error: null })
  ]);
  const totalCases = totalRes.error ? 0 : (totalRes.count || 0);
  const sameDefectCount = sameRes.error
    ? cases.filter(c => c.defect_type === cases[0].defect_type).length
    : (sameRes.count || 0);

  const historicalContext = cases.length > 0
    ? cases.map(c => `- Past Confirmed Defect: ${c.defect_type}\n  Symptoms: ${c.symptoms}\n  Root Cause: ${c.root_cause}\n  Resolution: ${c.resolution}`).join('\n\n')
    : 'No exact matching past records found. Reference standard manufacturing baseline tolerances.';

  const topSimilarity = cases.length > 0 ? cases[0].similarity : 0;
  const isLowConfidenceRetrieval = topSimilarity < LOW_SIMILARITY_THRESHOLD;

  // 3. Build the grounded prompt
  const promptText = `### HISTORICAL DATABASE CONTEXT MATCHES:
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

  const contentParts = [{ text: promptText }];
  if (hasImage) {
    const mimeType = (imageUrl.match(/^data:(.*?);/) || [])[1] || 'image/jpeg';
    const base64Data = imageUrl.split(',')[1];
    contentParts.push({ inlineData: { mimeType, data: base64Data } });
  }

  // 4. Structured multimodal inference
  const chatResponse = await generateWithRetry({
    model: GENERATION_MODEL,
    contents: contentParts,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: DIAGNOSIS_SCHEMA,
      // Low temperature keeps diagnoses repeatable across near-identical inputs
      // (default temperature produced visibly different confidence scores/wording
      // for the same case on repeated calls during testing).
      temperature: 0.25
    }
  });

  // 5. Parse and post-check. The responseSchema guarantees valid JSON in the shape above.
  const aiResult = JSON.parse(chatResponse.text);

  // Backstop in case the model doesn't follow the prompt's confidence-cap instruction —
  // don't rely solely on prompt compliance for something the UI treats as a hard signal.
  if (isLowConfidenceRetrieval && aiResult.confidenceScore > 2) aiResult.confidenceScore = 2;
  if (!hasImage) aiResult.imageFindings = [];

  // Two independent signals that this diagnosis is a best-effort guess: the knowledge base
  // had nothing close, or the model itself rates the fit as weak even though it did.
  const modelUnsure = aiResult.confidenceScore <= 2;
  const lowConfidenceReason = isLowConfidenceRetrieval && modelUnsure ? 'both'
    : isLowConfidenceRetrieval ? 'retrieval'
    : modelUnsure ? 'model'
    : null;

  return {
    aiResult,
    matchedCases: cases,
    retrieval: {
      topSimilarity,
      threshold: LOW_SIMILARITY_THRESHOLD,
      lowConfidence: lowConfidenceReason !== null,
      lowConfidenceReason,
      sameDefectCount,
      totalCases
    }
  };
}

export async function listCases() {
  const { data, error } = await supabase
    .from('defect_knowledgebase')
    .select('id, defect_type, symptoms, root_cause, resolution')
    .order('id', { ascending: false });
  if (error) throw new AnalysisError('Could not load the case history.', { status: 500, cause: error });
  return data.map(cleanCase);
}
