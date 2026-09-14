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
        "symptoms": "Some dispensing dots are larger, some are smaller. Dispensing results are not repeatable. Occurs occasionally.",
        "cause": "Air may be trapped inside the syringe or material supply system.",
        "resolution": "Purge the syringe and check for visible air bubbles. Verify material degassing process."
    },
    {
        "defect": "Missing Dispensing Dots",
        "symptoms": "No material comes out of the nozzle during a shot. Leaves empty pinholes.",
        "cause": "The dispensing nozzle may be partially or fully blocked.",
        "resolution": "Remove the nozzle and inspect for blockage. Change to a clean needle and ensure high-quality patch adhesive is used."
    },
    {
        "defect": "Material Spreading",
        "symptoms": "Material spreads beyond the required area. Dots are oversized or merge together.",
        "cause": "The material viscosity may have changed due to temperature fluctuations, or dispensing pressure is too high.",
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
    },
    {
        "defect": "Undersized Dispensing Dots",
        "symptoms": "Dots are consistently smaller than the target diameter across every shot. Coverage area looks thin or starved.",
        "cause": "Dispensing pressure or dwell time set too low for the current material viscosity.",
        "resolution": "Increase dispense pressure or shot time incrementally and re-measure dot diameter. Confirm material viscosity matches the process spec for the current batch."
    },
    {
        "defect": "Oversized Dispensing Dots",
        "symptoms": "Dots are consistently larger than the target diameter across every shot, though shape stays round and centered.",
        "cause": "Dispense time or pressure set too high, causing excess material volume per shot.",
        "resolution": "Reduce dispense time or pressure incrementally and re-measure. Verify the valve closes fully between shots to rule out a stuck-open condition."
    },
    {
        "defect": "Irregular Dot Shape",
        "symptoms": "Dots come out asymmetric, teardrop-shaped, or with a ragged edge instead of a clean circle, even though volume looks roughly correct.",
        "cause": "Worn, chipped, or partially clogged nozzle tip distorting the fluid stream as it exits.",
        "resolution": "Inspect the nozzle tip under magnification for wear, burrs, or partial blockage. Replace the tip and re-run a test pattern."
    },
    {
        "defect": "Dot Misalignment",
        "symptoms": "Dots land consistently offset from the target pad position, or drift further off-center the longer the run continues.",
        "cause": "X/Y calibration drift, a bent or loose dispensing needle, or an uncalibrated vision/fiducial alignment system.",
        "resolution": "Re-run X/Y calibration against a known fiducial. Check the needle for physical bending and confirm it is seated straight and tight in its mount."
    },
    {
        "defect": "Nozzle Drooling / Post-Dispense Ooze",
        "symptoms": "Small unwanted deposits or thin trails of material appear between intended dispense points, even where no shot was commanded.",
        "cause": "Valve seal wear or residual line pressure lets material continue seeping from the nozzle tip after the dispense cycle ends.",
        "resolution": "Inspect and replace the valve seal/seat if worn. Add a small vacuum suck-back setting after each shot to relieve residual pressure at the tip."
    },
    {
        "defect": "Voids or Air Bubbles in Cured Material",
        "symptoms": "Small craters, pinholes, or visible bubble pockets appear inside the dispensed material after curing, even though the dot looked normal freshly dispensed.",
        "cause": "Insufficient degassing of the material before dispensing, or air entrained during mixing/loading into the syringe.",
        "resolution": "Degas the material under vacuum before loading. Check syringe loading procedure for air entrainment and consider a slower fill/load speed."
    },
    {
        "defect": "Under-Cured / Tacky Residue",
        "symptoms": "Dispensed material looks dimensionally correct but stays soft or tacky to the touch well after the expected cure time.",
        "cause": "Cure oven/UV station temperature or exposure time below spec, or an expired/incorrectly mixed two-part material.",
        "resolution": "Verify cure station temperature and dwell time against the material datasheet. Check material pot life and mix ratio if using a two-part system."
    }
];

// Execute the bulk insert
seedDatabase(bulkData);