# DispenseIQ — AI Dispensing Defect Detective

AI Horizon Solution Challenge 2026 (NSW Automation). An AI troubleshooting
assistant for fluid dispensing defects: describe the problem, answer five smart
questions, and get an AI-generated diagnosis — ranked probable causes with
reasoning, a checkable action plan, and a printable troubleshooting report.

Diagnoses are generated live by Google Gemini, grounded in a Supabase vector
database of past defect cases (retrieval-augmented generation).

## Architecture

```
Browser SPA (index.html, app.js)
        │  POST /api/analyze
        ▼
Express backend (server.js)
        ├─► Gemini embeddings ──► Supabase vector search (match_defects RPC)
        └─► Gemini (structured JSON) ──► diagnosis returned to the UI
```

## Setup

Requires Node.js 18+ and a Supabase project plus a Google Gemini API key.

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure secrets.** Create a `.env` file in the project root (see the
   variable names below) and fill in your own keys:
   ```
   GEMINI_API_KEY=your_google_gemini_api_key
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_supabase_publishable_key
   SUPABASE_SERVICE_KEY=your_supabase_service_role_key   # used only by the seed script
   PORT=8080
   ```

3. **Seed the knowledge base** (one time — inserts the sample defect cases and
   their embeddings into Supabase):
   ```
   npm run seed
   ```

4. **Run it**
   ```
   npm run dev
   ```
   Then open <http://localhost:8080>.

> The app needs the backend running — opening `index.html` directly as a file
> will not reach `/api/analyze`. To demo without network/keys, turn on
> **Offline Demo Mode** in Settings, which loads mock data instantly.

## Files

- `index.html` — page shell (header, nav, footer)
- `styles.css` — design-system tokens + all screen styles
- `app.js` — frontend SPA: screens, question flow, results/report rendering; the
  `CONFIG` object at the top toggles the case-history insight and quality-score card
- `server.js` — Express backend: the `/api/analyze` RAG pipeline (embed → vector
  search → Gemini structured-JSON inference)
- `scripts/seedDatabase.js` — bulk-inserts the sample defect dataset with embeddings
- `supabase/rls_policies.sql` — Row Level Security policy (read-only public access)
- `assets/hero.webp` — landing hero photo
- `design/` — the original claude.ai/design source this was implemented from

## Settings (in-app)

- **Analysis Mode** — Live AI API vs Offline Demo Mode (instant mock data for presentations)
- **AI Strictness** — Standard vs Strict quality control (penalizes minor variation harder)
- **Theme** — Light / Dark

## How it maps to the challenge criteria

- **Step 1 – Problem discovery:** five smart questions with quick-answer chips
  or free-text input (`QBASE` in `app.js`)
- **Bonus – dynamic questions:** answering "Varies shot to shot" inserts a
  follow-up question about onset (`FOLLOWUP`)
- **Step 2 – Identify the defect:** results screen names the defect with a
  star confidence level and matching symptoms
- **Step 3 – Cause analysis / Step 4 – scoring:** ranked cause bars with
  likelihood percentages, plus a "why this ranks highest" explanation
- **Step 5 – Action plan:** checkable troubleshooting sequence generated per case
- **Bonus – learning database:** Supabase vector search over past cases feeds the
  "similar problems occurred before" insight; case-history screen with search
- **Bonus – PDF report:** report screen with engineer notes; "Download PDF"
  prints just the report (print stylesheet hides the app chrome)
