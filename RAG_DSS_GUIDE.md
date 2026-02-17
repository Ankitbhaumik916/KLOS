# RAG-Based Decision Support System (DSS) - Setup & Usage Guide

## Overview

The **AI Deep Dive** feature integrates a **Retrieval-Augmented Generation (RAG)** system with your local **Llama 3.2** model to provide intelligent, data-driven recommendations based on your order history.

### What is RAG?

RAG combines:
1. **Semantic Search**: Finds similar historical orders from your 1134+ order dataset
2. **Context Generation**: Builds rich context from the retrieved orders
3. **LLM Analysis**: Sends the context to Llama 3.2 for strategic recommendations

## Prerequisites

### Quick Start: Auto Setup (Windows)

**Double-click `setup-ollama.bat` in your project folder!** It handles everything:
1. ✅ Checks if Ollama is installed
2. ✅ Downloads Llama 3.2 (~5-10 minutes first time)
3. ✅ Starts Ollama server

---

### Manual Setup (All Platforms)

#### 1. Install Ollama

Download from: https://ollama.ai

```bash
# After installation, verify it works
ollama --version
```

#### 2. Download Llama 3.2 Model

```bash
# This downloads ~4.7GB model (one-time)
ollama pull llama3.2
```

#### 3. Start Ollama Server

```bash
# Terminal: Start Ollama server
ollama serve

# Output should show:
# Listening on 127.0.0.1:11434
```

**Keep this terminal open while using the app.**

## How to Use

### Step 1: Upload Your Order Data

1. In the app, click **"Import CSV"** button
2. Select a Zomato orders CSV export file
3. Wait for ingestion (you should see order count increase)

### Step 2: Start Ollama (Important!)

**To get AI-powered responses:**
- Windows: Double-click `setup-ollama.bat` 
- Or run: `ollama serve` in a terminal

Without Ollama, you'll see enhanced local analysis (still useful, but not AI-powered).

### Step 3: Access AI Deep Dive Tab

1. Click the **"Deep Dive"** tab in the navigation
2. Wait for the Knowledge Base to initialize (~30 seconds on first load)
   - Status shows: ✓ Ready, when complete

### Step 4: Ask Strategic Questions

Click example queries or type your own:

**Example Queries:**
- "What are the best-performing menu items?"
- "How can I reduce order rejection rate?"
- "What times have the highest demand?"
- "How can I improve customer ratings?"
- "What is my profit optimization strategy?"

## Current Status: Two Modes Available

### ⚡ Mode 1: Enhanced Fallback Analysis (Available Now)
- ✅ Query-specific insights from your 1,134 orders
- ✅ Works immediately, no setup needed
- ✅ Analyzes ratings, rejections, menu, revenue, operations
- ✅ Fast (<1 second responses)
- ⚠️ Pattern-based (not AI-powered yet)

**You're here if:** Response ends with "STATUS: Analysis generated from historical data patterns"

### 🚀 Mode 2: Llama 3.2 AI-Powered (To Unlock)
- ✨ Deep strategic reasoning
- ✨ Contextual business understanding  
- ✨ Nuanced, multi-layer recommendations
- ✨ Pattern learning from order history

**To unlock:**
1. Run: `setup-ollama.bat` (Windows) or `ollama serve`
2. Refresh the app page
3. Try your query again

### Step 5: Analyze Results

For each query, you'll get:


1. **Executive Summary**: High-level insights from your data
2. **Recommendations**: 
   - Category (Demand, Revenue, Quality, Operations, etc.)
   - Confidence Score (data-backed strength)
   - Specific Action Items
3. **Similar Historical Orders**: Top 3 matching orders that informed the analysis

## Architecture

### Components

```
App.tsx (Main)
  ├─ AIDeepdive.tsx (UI Component)
  │  └─ ragDssService.ts (RAG Logic)
  │     ├─ Order Embedding (via @xenova/transformers)
  │     ├─ Vector Similarity Search
  │     ├─ Llama 3.2 Query
  │     └─ Response Parsing
  └─ Dashboard, DataGrid, GeminiInsight (existing)
```

### Data Flow

```
1. User uploads CSV with 1134 orders
   ↓
2. Orders indexed with embeddings (384-dim vectors)
   ↓
3. User asks question in "Deep Dive" tab
   ↓
4. Query is embedded & searched against KB
   ↓
5. Top 5 similar orders retrieved
   ↓
6. Context + Query sent to local Llama 3.2
   ↓
7. Llama generates strategic recommendations
   ↓
8. Results parsed & displayed with confidence scores
```

## Configuration

### Custom Ollama Endpoint

If Ollama is not on `localhost:11434`, configure it:

1. In **Deep Dive** tab, click **⚙️ Settings**
2. Enter your custom URL: `http://your-server:port`

**Examples:**
- Local GPU: `http://localhost:11434`
- Remote Server: `http://192.168.1.100:11434`
- Docker: `http://ollama:11434`

### Model Selection

By default, uses **llama3.2**. To use a different model:

1. Pull the model: `ollama pull llama2` (or any other model)
2. The service will auto-detect available models

**Supported Models:**
- `llama3.2` (Recommended - 8B parameters)
- `llama2` (7B parameters - faster)
- `neural-chat` (7B - optimized for Q&A)
- `mistral` (7B - excellent reasoning)

## Performance Tips

### 1. First-Time Initialization
- Takes ~30 seconds to encode all 1134 orders
- Downloads embedding model (~130MB) on first run
- After that, runs instantly from cache

### 2. Optimize for Speed
- For faster responses, reduce chunk size in settings
- Use smaller queries (2-3 words is ideal)
- Llama 3.2 is designed for local inference (100+ tokens/sec on modern GPU)

### 3. GPU Acceleration
Enable GPU support in Ollama for 5-10x faster inference:

```bash
# Windows/Mac: GPU automatically detected if available
ollama serve

# Linux (with NVIDIA GPU):
CUDA_VISIBLE_DEVICES=0 ollama serve

# Verify GPU usage:
nvidia-smi
```

## Troubleshooting

### "Ollama unavailable" error
**Solution:**
1. Ensure Ollama is running: `ollama serve`
2. Check endpoint in Settings
3. Verify firewall allows port 11434
4. Restart both app and Ollama

### "KB not initialized" after 60 seconds
**Solution:**
1. Check console for errors (F12 → Console tab)
2. Verify internet connection (needs to download embedding model first time)
3. Try refreshing the page
4. Ensure you have >500MB free disk space

### Very slow responses (>30 seconds)
**Solution:**
1. Enable GPU acceleration in Ollama
2. Close other applications consuming GPU/RAM
3. Try a smaller model: `ollama pull llama2`
4. Reduce batch size in settings

### "CORS error" or network issues
**Solution:**
1. Ensure Ollama is accessible: `curl http://localhost:11434/api/tags`
2. If remote: check firewall rules
3. Enable CORS proxy if needed

## Advanced Features

### Integration with Existing AI Services

The DSS works alongside:

- **Dashboard Tab**: Shows aggregate statistics
- **AI Insights Tab**: Uses Google GenAI (if API key set)
- **Deep Dive Tab**: Uses RAG + Local Llama 3.2

Each provides different insights for multi-faceted analysis.

### Export Analysis Results

You can export all analysis results:

1. Perform queries in "Deep Dive"
2. Screenshots capture the full recommendation
3. Or export entire order dataset for external analysis

### Batch Analysis

Query multiple topics in sequence:
1. "Demand patterns"
2. "Quality issues"  
3. "Profitability gaps"
4. "Operational improvements"

Each builds on your order context.

## Data Privacy

✅ **100% Local Processing**
- All queries run on your machine
- Embeddings computed locally
- No data sent to external servers
- Order data never leaves your browser (stored in localStorage)

## Next Steps

1. ✅ Upload your order CSV
2. ✅ Configure Ollama (if not default location)
3. ✅ Visit "Deep Dive" tab
4. ✅ Ask your first question
5. ✅ Monitor recommendations and implement actions

## Example Use Case

**Scenario**: You have 1134 orders over 3 months, but margins are shrinking.

**Process:**
1. Query: "What items should I focus on?"
   → Gets menu optimization recommendations
2. Query: "Why are orders being rejected?"
   → Analyzes rejection patterns
3. Query: "How can I improve profitability?"
   → Strategic pricing & operational insights

**Outcome**: 
- 15% revenue increase by focusing on high-margin items
- 20% reduction in rejections via process improvements
- Data-backed decisions instead of guesswork

## Support

For issues:
1. Check console (F12 → Console)
2. Verify Ollama is running
3. Ensure dataset is loaded (Dashboard shows order count)
4. Try Settings → Reset

---

**Happy analyzing! 🚀**

Need help? The system generates helpful error messages. Check the browser console for detailed logs.
