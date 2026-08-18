import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase and Google API.
// Seeding writes rows, so it needs the service_role key — the publishable key is
// read-only once RLS is enabled (see supabase/rls_policies.sql). Falls back to the
// publishable key only if the service key is not set.
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!process.env.SUPABASE_SERVICE_KEY) {
    console.warn("Warning: SUPABASE_SERVICE_KEY not set — writes will fail if RLS is enabled. Add it to .env (Supabase → Project Settings → API → service_role key).");
}

// Function to generate the 3072-dimension vector
async function generateEmbedding(text) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: text }] }
        })
    });

    const data = await response.json();

    if (data.error) {
        console.error("Google Gemini API Error Details:", JSON.stringify(data.error, null, 2));
        throw new Error(`API call failed: ${data.error.message}`);
    }

    return data.embedding.values;
}

// Function to loop through the array and insert into Supabase
async function seedDatabase(dataArray) {
    console.log(`Starting bulk insert of ${dataArray.length} items...`);

    for (const item of dataArray) {
        // Combine the text fields so the AI has rich context to search against
        const textToEmbed = `Defect: ${item.defect}. Symptoms: ${item.symptoms}. Cause: ${item.cause}`;

        try {
            const vector = await generateEmbedding(textToEmbed);

            const { error } = await supabase.from('defect_knowledgebase').insert({
                defect_type: item.defect,
                symptoms: item.symptoms,
                root_cause: item.cause,
                resolution: item.resolution,
                embedding: vector
            });

            if (error) {
                console.error(`\nError inserting "${item.defect}":`, error);
            } else {
                console.log(`Successfully inserted: ${item.defect}`);
            }
        } catch (err) {
            console.error(`\nFailed to process "${item.defect}":`, err.message);
        }
    }

    console.log("\nBulk database seeding complete!");
}

// Expanded Industrial Dispensing Dataset
const bulkData = [
    {
        "defect": "Inconsistent Dispensing Volume",
        "symptoms": "Some dispensing dots are larger, some are smaller. Dispensing results are not repeatable[cite: 2]. Occurs occasionally.",
        "cause": "Air may be trapped inside the syringe or material supply system[cite: 2].",
        "resolution": "Purge the syringe and check for visible air bubbles. Verify material degassing process."
    },
    {
        "defect": "Missing Dispensing Dots",
        "symptoms": "No material comes out of the nozzle during a shot[cite: 2]. Leaves empty pinholes.",
        "cause": "The dispensing nozzle may be partially or fully blocked[cite: 2].",
        "resolution": "Remove the nozzle and inspect for blockage. Change to a clean needle and ensure high-quality patch adhesive is used."
    },
    {
        "defect": "Material Spreading",
        "symptoms": "Material spreads beyond the required area[cite: 2]. Dots are oversized or merge together.",
        "cause": "The material viscosity may have changed[cite: 2] due to temperature fluctuations, or dispensing pressure is too high.",
        "resolution": "Check whether the material condition has changed. Verify batch age and storage temperature. Reduce dispensing pressure."
    },
    {
        "defect": "Stringing or Tailing",
        "symptoms": "A thin line or 'tail' of material connects the dispensing dot to the nozzle as it moves away.",
        "cause": "Z-axis retract speed is too fast, or the material viscosity is too thick.",
        "resolution": "Decrease the Z-axis lift speed. Add a slight delay before lifting the nozzle after dispensing."
    },
    {
        "defect": "Floating Component Pins",
        "symptoms": "Component pins shift after curing. Solder enters under the pad during reflow.",
        "cause": "Uneven adhesive application or excessive glue pushing the component.",
        "resolution": "Adjust dispensing pressure and carefully calibrate the dispensing amount for consistent Z-height."
    }
];

// Execute the bulk insert
seedDatabase(bulkData);