# KitchenOS (Current Implementation README)

This README is intentionally scoped to what is currently implemented in code.

## What This App Currently Does

- React + TypeScript + Vite single-page app for cloud-kitchen order analysis.
- Email/password auth through Supabase Auth (sign up + sign in).
- Loads and saves order records to Supabase table orders, scoped by user_id.
- CSV ingestion for Zomato-like exports (header name matching is flexible).
- Dashboard tab with metrics and charts:
  - Revenue trend
  - Top items
  - Hourly order activity
  - Order status distribution
- AI Insights tab:
  - Generates Gemini-first business insights (demand, customer, profitability, recommendations)
  - Includes a follow-up Gemini-first Q and A chat over the loaded dataset
  - Fetches fresh orders from Supabase before insight/chat requests
  - Includes deterministic local fallback when Gemini is unavailable
- AI Deep Dive tab:
  - Builds embeddings from loaded orders
  - Retrieves similar historical orders for a query
  - Produces recommendations and summary (LLM response when available, local fallback otherwise)
- Data operations in UI header:
  - Import CSV
  - Import JSON
  - Export JSON

## What Is In Repo But Not Wired Into Main App Flow

- AIManagerDashboard component exists but is not mounted from App.tsx.
- businessMetricsService exists and is used by AIManagerDashboard only.
- authService and storageService (localStorage-based auth/storage) exist but the app currently uses Supabase service in main flow.
- mockSocketService is a stub and not used in the current app flow.

## Known Behavior (Current Code)

- DataGrid has an Export JSON button in that panel header, but no click handler is attached there.
- App enforces dark mode class on mount.

## Stack Actually Used

- React 19
- TypeScript 5
- Vite 6
- Recharts (dashboard charts)
- Supabase JS client
- Google GenAI SDK (present and callable through current service path)
- Transformers.js (embedding model in RAG deep dive)
- Express + http-proxy-middleware (optional local LLM proxy)

## Prerequisites

- Node.js 18+ recommended
- npm
- Supabase project (required)
- Optional for local LLM features:
  - Ollama (or compatible local endpoint)
  - LLM proxy from this repo (optional but useful for browser CORS/networking)

## Environment Variables

Create .env.local in project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional cloud AI path used by current Vite define mapping:
GEMINI_API_KEY=your_google_gemini_api_key

# Optional (service initialization also reads this key):
VITE_GEMINI_API_KEY=your_google_gemini_api_key
```

Notes:

- Supabase URL and anon key are required. App throws on startup if missing.
- GEMINI_API_KEY is read via Vite define mapping for process.env.API_KEY in current code path.

## Install And Run

```bash
npm install
npm run dev
```

Default Vite dev server is configured for port 3000.

Production build:

```bash
npm run build
npm run preview
```

## Optional Local LLM Setup

1. Start Ollama on default port 11434.
2. Start proxy from this repo:

```bash
npm run start-llm-proxy
```

Proxy defaults:

- Listens on http://localhost:11435
- Forwards to http://localhost:11434 (or LLM_TARGET if set)

In-app settings panel allows changing:

- localAi.url
- localAi.exactUrl
- localAi.model

## Docker Setup (Frontend + Proxy + Ollama)

The repository now includes a Docker Compose stack:

- Frontend (Vite) on `5173`
- LLM proxy on `11435`
- Ollama on `11434`
- One-time model pull service (`ollama-init`) for `llama3.2`

Run:

```bash
docker compose up --build
```

Files:

- `docker-compose.yml`
- `Dockerfile.frontend`
- `tools/llm-proxy/Dockerfile.proxy`

Environment notes:

- Compose reads `VITE_GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` from your shell or `.env` file.
- `tools/llm-proxy/proxy.cjs` accepts `OLLAMA_URL` (preferred) and `LLM_TARGET`.

## Data Format Expectations

CSV parser supports flexible column names. It tries to map:

- order id / orderid
- restaurant name / restaurant
- order placed at / date / created at
- order status / status
- total / grand total / final amount
- rating
- items in order / items
- city

## Main Runtime Files

- App shell and tab routing: App.tsx
- Supabase auth + orders persistence: services/supabaseService.ts
- CSV parsing: services/csvService.ts
- Dashboard metrics + charts: components/Dashboard.tsx
- AI insights + QA: components/GeminiInsight.tsx
- RAG deep dive: components/AIDeepdive.tsx, services/ragDssService.ts
- Optional proxy server: tools/llm-proxy/proxy.cjs
