// Labelled evaluation set for the diagnosis pipeline.
//
// Descriptions are written in operator language and deliberately do NOT reuse the
// wording of the seed rows, so the run measures how the pipeline generalises rather
// than whether it can retrieve a memorised sentence. Answers use the same chip
// vocabulary the UI offers (free text where no chip fits, exactly as a user could).
//
// `match` is tested against the returned `defect` string (case-insensitive).
// `outOfScope: true` cases should be flagged low-confidence with confidence <= 2.

export const CASES = [
  // ── In scope: the 12 defect types in scripts/seedDatabase.js ──────────────
  {
    id: 'vol', label: 'Inconsistent Dispensing Volume',
    match: /inconsistent|erratic|variab|fluctuat|unstable/i,
    problem: 'Dot size is all over the place on the same board — one shot looks right, the next barely puts anything down, then a big one. It comes and goes rather than every shot.',
    answers: { material: 'Epoxy', amount: 'Varies shot to shot', timing: 'Occasional — random shots', change: 'No recent changes', location: 'Random locations', onset: 'After running a while' }
  },
  {
    id: 'missing', label: 'Missing Dispensing Dots',
    match: /missing|skip|no dot|absent|empty pad/i,
    problem: 'Every so often a pad gets nothing at all — the head goes through the motion but no material comes out, leaving an empty pad. The other pads on the same board are fine.',
    answers: { material: 'Adhesive', amount: 'Dots missing entirely', timing: 'Occasional — random shots', change: 'No recent changes', location: 'Random locations' }
  },
  {
    id: 'spread', label: 'Material Spreading',
    match: /spread|slump|bleed|flow(s|ing)? out|wet-?out/i,
    problem: 'The sealant bead is spreading out far wider than the groove — it flattens and runs into the neighbouring area within a few seconds of dispensing. Started when the shop got hot this week.',
    answers: { material: 'Sealant', amount: 'Too large', timing: 'Continuous — every shot', change: 'No recent changes', location: 'Multiple locations' }
  },
  {
    id: 'string', label: 'Stringing or Tailing',
    match: /string|tail|thread|whisker/i,
    problem: 'When the needle lifts away after each dot, a thin thread of adhesive follows it up and lays across the board. Happens on basically every dot since we moved to the thicker material.',
    answers: { material: 'Adhesive', amount: 'Amount is about right, it is the tail', timing: 'Continuous — every shot', change: 'Material batch changed', location: 'Multiple locations' }
  },
  {
    id: 'float', label: 'Floating Component Pins',
    match: /float|lift|shift|swim|component (movement|displacement)/i,
    problem: 'After cure the small chip components have shifted and their leads are lifted off the pads; the glue dot under them looks bigger than it used to. Only on the boards run since the pressure was turned up.',
    answers: { material: 'Adhesive', amount: 'Too large', timing: 'Continuous — every shot', change: 'Settings adjusted', location: 'Multiple locations' }
  },
  {
    id: 'undersize', label: 'Undersized Dispensing Dots',
    match: /undersize|too small|insufficient|small dot|under-?dispens|starv|low volume/i,
    problem: 'Every dot is coming out smaller than spec — consistently about half the diameter it should be, on every pad, every board, since this morning.',
    answers: { material: 'Epoxy', amount: 'Too small', timing: 'Continuous — every shot', change: 'No recent changes', location: 'Multiple locations' }
  },
  {
    id: 'oversize', label: 'Oversized Dispensing Dots',
    match: /oversize|too large|excess|large dot|over-?dispens|too much/i,
    problem: 'All the dots are bigger than the drawing calls for. They are round and centred, just too much material on every single one.',
    answers: { material: 'Solder paste', amount: 'Too large', timing: 'Continuous — every shot', change: 'Settings adjusted', location: 'Multiple locations' }
  },
  {
    id: 'shape', label: 'Irregular Dot Shape',
    match: /irregular|shape|teardrop|asymmetric|deform|ragged/i,
    problem: 'The dots are not round any more — they come out as teardrops or with a ragged edge on one side, but the amount looks about right. It got worse gradually over the last few shifts.',
    answers: { material: 'Adhesive', amount: 'Amount looks right, the shape is wrong', timing: 'Continuous — every shot', change: 'No recent changes', location: 'Multiple locations' }
  },
  {
    id: 'misalign', label: 'Dot Misalignment',
    match: /misalign|offset|position|placement|off-?cent|registration|alignment/i,
    problem: 'Dots are landing consistently off to one side of the pads — the offset seems to grow the further along the board the head travels. Started after the nozzle was swapped.',
    answers: { material: 'Adhesive', amount: 'Amount is fine', timing: 'Continuous — every shot', change: 'Nozzle replaced', location: 'Multiple locations' }
  },
  {
    id: 'drool', label: 'Nozzle Drooling / Post-Dispense Ooze',
    match: /drool|ooz|weep|drip|leak|seep|post-?dispens/i,
    problem: 'Between dots there are little blobs and smears of material where nothing should have been dispensed, as if the nozzle keeps weeping after the shot ends.',
    answers: { material: 'Epoxy', amount: 'Extra material where there should be none', timing: 'Continuous — every shot', change: 'No recent changes', location: 'Random locations' }
  },
  {
    id: 'voids', label: 'Voids or Air Bubbles in Cured Material',
    match: /void|bubble|pinhole|poros|entrap/i,
    problem: 'Once the potting cures we find pinholes and small bubble pockets inside it; it looked fine while it was wet. New batch of material this week.',
    answers: { material: 'Epoxy', amount: 'Amount is fine', timing: 'Continuous — every shot', change: 'Material batch changed', location: 'Multiple locations' }
  },
  {
    id: 'cure', label: 'Under-Cured / Tacky Residue',
    match: /cure|tacky|soft|sticky/i,
    problem: 'The adhesive dots look right but they are still soft and tacky an hour after they should be fully cured. Started when we opened a new drum of part B.',
    answers: { material: 'Adhesive', amount: 'Amount is fine', timing: 'Continuous — every shot', change: 'Material batch changed', location: 'Multiple locations' }
  },

  // ── Out of scope: not dispensing defects; should be flagged, not force-fitted ──
  {
    id: 'oos-cold', label: 'Cold solder joint (hand soldering)', outOfScope: true,
    problem: 'Solder joints on the through-hole connector look dull and grainy, and a couple of the leads wiggle in the joint. This is hand soldering — there is no dispensing on this line.',
    answers: { material: 'Other fluid', amount: 'Not a dispensing job', timing: 'Occasional — random shots', change: 'No recent changes', location: 'One location' }
  },
  {
    id: 'oos-place', label: 'Pick-and-place rotation error', outOfScope: true,
    problem: 'The pick-and-place is putting the 0402 resistors down rotated 90 degrees on every third board. The paste and glue themselves look fine.',
    answers: { material: 'Solder paste', amount: 'Amount is fine', timing: 'Occasional — random shots', change: 'No recent changes', location: 'Multiple locations' }
  },
  {
    id: 'oos-plc', label: 'Conveyor / controller fault', outOfScope: true,
    problem: 'The conveyor stops randomly mid-cycle and the controller shows an E-stop fault; when it does run, the dots look perfect.',
    answers: { material: 'Adhesive', amount: 'Amount is fine', timing: 'Occasional — random shots', change: 'No recent changes', location: 'One location' }
  },

  // ── Images: synthetic panels with planted defects ──────────────────────────
  {
    id: 'img-panel', label: 'Synthetic panel photo (3 planted defects)',
    image: 'fixtures/synthetic-panel.jpg',
    match: /inconsistent|erratic|variab|missing|oversize|undersize|volume/i,
    expectFindings: ['Missing Dot', 'Oversized Dot', 'Undersized Dot'],
    problem: 'Attached is a photo of our dispensing panel, some dots look wrong',
    answers: { material: 'Adhesive', amount: 'Varies shot to shot', timing: 'Occasional — random shots', change: 'No recent changes', location: 'Random locations', onset: 'Not sure' }
  },
  {
    id: 'img-oversize', label: 'Synthetic panel photo (one oversized dot)',
    image: 'fixtures/panel-oversized.jpg',
    match: /oversize|too large|excess|inconsistent|volume|spread/i,
    expectFindings: ['Oversized Dot'],
    problem: 'Photo attached — one of the dots on this panel came out much bigger than the rest',
    answers: { material: 'Adhesive', amount: 'Too large', timing: 'Occasional — random shots', change: 'No recent changes', location: 'One location' }
  },
  {
    id: 'img-undersize', label: 'Synthetic panel photo (one undersized dot)',
    image: 'fixtures/panel-undersized.jpg',
    match: /undersize|too small|insufficient|starv|inconsistent|volume/i,
    expectFindings: ['Undersized Dot'],
    problem: 'Photo attached — one dot on this panel is tiny compared with its neighbours',
    answers: { material: 'Adhesive', amount: 'Too small', timing: 'Occasional — random shots', change: 'No recent changes', location: 'One location' }
  }
];
