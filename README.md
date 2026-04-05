# KitchenOS

Current implementation guide for this repository.

## Overview

KitchenOS is a React + TypeScript + Vite app for cloud-kitchen analytics with:

- Supabase auth and per-user order storage
- CSV and JSON import/export
- Dashboard metrics and charts
- Gemini-powered insight/QA flow
- AI Deep Dive (RAG) over order history using local embeddings + local LLM proxy

## What Is Implemented

- Auth: email/password via Supabase
- Data persistence: orders table scoped by user id
- CSV ingestion: flexible header mapping for common Zomato exports
- Dashboard: revenue trends, top items, hourly activity, status distribution
- AI Insights: business narrative + QA
- AI Deep Dive:
  - Chunked retrieval over historical order summaries
  - Global summary chunk pinned for aggregate queries
  - Daily + weekly + monthly context chunks
  - Source attribution in chat responses
  - Local cache in browser storage (`klos_rag_chunks`, `klos_rag_vectors`)
- Local proxy:
  - `GET /health`
  - `POST /api/llm`
  - `POST /api/llm/stream`
  - `POST /api/embed`

## Tech Stack

- React 19
- TypeScript 5
- Vite 6
- Supabase JS
- Recharts
- Google GenAI SDK
- Express + CORS (local proxy)
- Ollama (local model runtime)
- `@xenova/transformers` (proxy-side local embeddings)

## Setup

### Prerequisites

- Node.js 18+
- npm
- Supabase project
- Ollama (for local LLM)

### Environment

Create `.env.local` at repo root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_google_gemini_api_key
VITE_GEMINI_API_KEY=your_google_gemini_api_key
```

## Run Locally

Install:

```bash
npm install
```

Start app:

```bash
npm run dev
```

Start proxy:

```bash
npm run start-llm-proxy
```

Start Ollama:

```bash
ollama serve
```

Default local ports:

- App: `http://localhost:3000` (or next available)
- Proxy: `http://localhost:3001`
- Ollama: `http://localhost:11434`

## AI Deep Dive Notes

- For aggregate prompts (top items, all-time totals), Deep Dive now injects a global summary chunk so responses are grounded in full-dataset totals.
- Retrieval defaults to broader context (`topK=8`) with source display.
- Prompt has strict anti-hallucination rules for number grounding.

If you change chunking logic, clear cache and rebuild index once:

```js
localStorage.removeItem('klos_rag_vectors');
localStorage.removeItem('klos_rag_chunks');
```

## Build

```bash
npm run build
npm run preview
```

## Important Files

- `App.tsx`: app shell and tabs
- `components/AIDeepdive.tsx`: RAG deep dive UI + retrieval flow
- `components/GeminiInsight.tsx`: Gemini insight and QA UI
- `services/supabaseService.ts`: auth and order persistence
- `services/csvService.ts`: CSV parsing
- `services/chunkService.ts`: chunking utility module
- `tools/llm-proxy/server.js`: local LLM + embedding proxy
