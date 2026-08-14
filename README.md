# DispenseIQ — AI Dispensing Defect Detective

AI Horizon Solution Challenge 2026 (NSW Automation). An AI-style troubleshooting
assistant for fluid dispensing defects: describe the problem, answer five smart
questions, get ranked probable causes with reasoning, a checkable action plan,
and a printable troubleshooting report.

## Run it

No build step, no server needed — open `index.html` in a browser
(double-click it, or use any static server).

## Files

- `index.html` — page shell (header, nav, footer)
- `styles.css` — design-system tokens + all screen styles
- `app.js` — screens, question flow, cause ranking, report; the
  `CONFIG` object at the top toggles confidence stars, the case-history
  insight, and the quality-score card
- `assets/hero.webp` — landing hero photo
- `design/` — the original claude.ai/design source this was implemented from

## How it maps to the challenge criteria

- **Step 1 – Problem discovery:** five smart questions with quick-answer chips
  or free-text input (`QBASE` in `app.js`)
- **Bonus – dynamic questions:** answering "Varies shot to shot" inserts a
  follow-up question about onset (`FOLLOWUP`)
- **Step 2 – Identify the defect:** results screen names the defect with a
  star confidence level and matching symptoms
- **Step 3 – Cause analysis / Step 4 – scoring:** ranked cause bars with
  likelihood percentages, plus a "why this ranks highest" explanation that
  adapts to the user's answers (occasional vs continuous, recent changes)
- **Step 5 – Action plan:** checkable five-step troubleshooting sequence
- **Bonus – learning database:** case history screen with search, feeding the
  "12 similar problems" insight
- **Bonus – PDF report:** report screen with engineer notes; "Download PDF"
  prints just the report (print stylesheet hides the app chrome)
