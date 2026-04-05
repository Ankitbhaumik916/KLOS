/**
 * KLOS LLM Proxy — tools/llm-proxy/server.js
 *
 * Routes:
 *   GET  /health          — check Ollama connectivity
 *   POST /api/llm         — non-streaming completion
 *   POST /api/llm/stream  — streaming completion (SSE)
 *
 * Run:  node tools/llm-proxy/server.js
 * Or:   add to package.json → "start-llm-proxy": "node tools/llm-proxy/server.js"
 *
 * Env vars (optional):
 *   OLLAMA_URL   — default http://localhost:11434
 *   PORT         — default 3001
 */

const express = require("express");
const cors = require("cors");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const PORT = parseInt(process.env.PORT || "3001", 10);
const DEFAULT_MODEL = "llama3.2";
const MAX_TOKENS = 2048;
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:4173"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "4mb" }));

let embedPipelinePromise = null;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function checkOllama() {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return data.models || [];
}

function buildOllamaPayload(prompt, system, model, stream = false) {
  return {
    model: model || DEFAULT_MODEL,
    stream,
    options: {
      num_predict: MAX_TOKENS,
      temperature: 0.3,   // lower = more factual for analytics
      top_p: 0.9,
    },
    ...(system
      ? {
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }
      : { prompt }),
  };
}

async function getEmbedder() {
  if (!embedPipelinePromise) {
    embedPipelinePromise = import("@xenova/transformers").then((mod) => {
      const pipeline = mod.pipeline || mod.default?.pipeline;
      if (!pipeline) {
        throw new Error("Failed to load transformers pipeline");
      }
      return pipeline("feature-extraction", EMBED_MODEL, {
        progress_callback: () => {},
      });
    });
  }
  return embedPipelinePromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    const models = await checkOllama();
    const has32 = models.some((m) => m.name?.includes("llama3.2"));
    res.json({
      status: "ok",
      ollama: true,
      llama32Available: has32,
      models: models.map((m) => m.name),
    });
  } catch (err) {
    res.status(503).json({
      status: "error",
      ollama: false,
      error: err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/llm  (non-streaming)
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/llm", async (req, res) => {
  const { prompt, system, model } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt is required" });
  }

  const useMessages = !!system;
  const endpoint = useMessages
    ? `${OLLAMA_URL}/api/chat`
    : `${OLLAMA_URL}/api/generate`;

  const payload = buildOllamaPayload(prompt, system, model, false);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res
        .status(upstream.status)
        .json({ error: `Ollama error: ${errText}` });
    }

    const data = await upstream.json();

    // Normalize response field between /api/generate and /api/chat
    const response = data.response ?? data.message?.content ?? "";

    res.json({
      response,
      model: data.model,
      done: data.done,
      eval_count: data.eval_count,
      prompt_eval_count: data.prompt_eval_count,
    });
  } catch (err) {
    const timedOut = err.name === "TimeoutError";
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "Ollama request timed out (60s). Try a shorter prompt."
        : `Failed to reach Ollama: ${err.message}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/embed  (local embeddings)
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/embed", async (req, res) => {
  const { texts } = req.body;

  if (!Array.isArray(texts) || texts.some((text) => typeof text !== "string")) {
    return res.status(400).json({ error: "texts must be an array of strings" });
  }

  try {
    const embedder = await getEmbedder();
    const embeddings = [];

    for (const text of texts) {
      const out = await embedder(text, {
        pooling: "mean",
        normalize: true,
      });
      embeddings.push(Array.from(out.data));
    }

    res.json({ model: EMBED_MODEL, embeddings });
  } catch (err) {
    res.status(500).json({
      error: `Embedding failed: ${err.message}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/llm/stream  (Server-Sent Events)
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/llm/stream", async (req, res) => {
  const { prompt, system, model } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const useMessages = !!system;
  const endpoint = useMessages
    ? `${OLLAMA_URL}/api/chat`
    : `${OLLAMA_URL}/api/generate`;

  const payload = buildOllamaPayload(prompt, system, model, true);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const chunk = JSON.parse(line);
          const token = chunk.response ?? chunk.message?.content ?? "";
          const isDone = chunk.done ?? false;

          res.write(
            `data: ${JSON.stringify({ token, done: isDone })}\n\n`
          );

          if (isDone) {
            res.write("data: [DONE]\n\n");
            return res.end();
          }
        } catch {
          // malformed JSON line from Ollama — skip
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({ error: err.message })}\n\n`
    );
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 fallback
// ─────────────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nKLOS LLM Proxy running on http://localhost:${PORT}`);
  console.log(`Ollama target: ${OLLAMA_URL}`);
  console.log(`Default model: ${DEFAULT_MODEL}\n`);

  // Warm-up check
  checkOllama()
    .then((models) => {
      const has32 = models.some((m) => m.name?.includes("llama3.2"));
      console.log(`Ollama connected. Models: ${models.map((m) => m.name).join(", ") || "none"}`);
      if (!has32) {
        console.warn(
          `  Warning: llama3.2 not found. Run: ollama pull llama3.2`
        );
      } else {
        console.log(`  llama3.2 ready.`);
      }
    })
    .catch((err) => {
      console.warn(`  Warning: Ollama not reachable — ${err.message}`);
      console.warn(`  Start it with: ollama serve`);
    });
});
