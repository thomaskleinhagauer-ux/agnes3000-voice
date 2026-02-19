// ================================
// AGNES 3000 - Backend Server
// Express.js + JSON File Storage
// Deployed on Railway
// ================================

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ================================
// Data Storage
// ================================

// Use Railway volume mount if available, fallback to local data/
const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load state from disk
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Storage] Error loading state:', err.message);
  }
  return null;
}

// Save state to disk (debounced writes)
let saveTimeout = null;
function saveState(state) {
  // Debounce: wait 2s after last write request
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      const sizeKB = Math.round(fs.statSync(STATE_FILE).size / 1024);
      console.log(`[Storage] State saved (${sizeKB} KB)`);
    } catch (err) {
      console.error('[Storage] Error saving state:', err.message);
    }
  }, 2000);
}

// ================================
// Middleware
// ================================

app.use(express.json({ limit: '50mb' })); // Large payloads for documents

// CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// ================================
// API Routes
// ================================

// Health check
app.get('/api/health', (req, res) => {
  const stateExists = fs.existsSync(STATE_FILE);
  const stateSize = stateExists ? Math.round(fs.statSync(STATE_FILE).size / 1024) : 0;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    storage: {
      exists: stateExists,
      sizeKB: stateSize,
    },
  });
});

// Load app state
app.get('/api/state', (req, res) => {
  const state = loadState();
  if (state) {
    console.log(`[API] State loaded (${state.documents?.length || 0} docs, ${Object.keys(state.messages || {}).length} rooms)`);
    res.json(state);
  } else {
    res.status(404).json({ error: 'No state found' });
  }
});

// Save app state
app.post('/api/state', (req, res) => {
  const state = req.body;
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'Invalid state' });
  }
  saveState(state);
  const docCount = state.documents?.length || 0;
  console.log(`[API] State saved (${docCount} docs)`);
  res.json({ success: true, documents: docCount });
});

// Get single document list (lightweight)
app.get('/api/documents', (req, res) => {
  const state = loadState();
  if (!state?.documents) {
    return res.json({ documents: [] });
  }
  // Return metadata only (no content) for listing
  const docs = state.documents.map(d => ({
    id: d.id,
    title: d.title,
    type: d.type,
    person: d.person,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    isArchived: d.isArchived,
    contentLength: d.content?.length || 0,
  }));
  res.json({ documents: docs });
});

// ================================
// AI Proxy Routes (API keys stay on server)
// ================================

// Anthropic SDK compatible proxy (browser clients use this via baseURL)
app.post('/api/anthropic/v1/messages', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }
  const isStream = req.body.stream;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...(req.body.model?.includes('claude-') && { 'anthropic-beta': 'prompt-caching-2024-07-31' }),
      },
      body: JSON.stringify(req.body),
    });

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(Buffer.from(value));
        }
      };
      pump().catch(err => {
        console.error('[AI Proxy] Claude SDK proxy stream error:', err.message);
        res.end();
      });
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (err) {
    console.error('[AI Proxy] Claude SDK proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy Claude API calls (legacy)
app.post('/api/ai/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[AI Proxy] Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy Claude streaming
app.post('/api/ai/claude/stream', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...req.body, stream: true }),
    });
    // Forward SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    response.body.pipeTo(new WritableStream({
      write(chunk) { res.write(chunk); },
      close() { res.end(); },
    }));
  } catch (err) {
    console.error('[AI Proxy] Claude stream error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy Gemini API calls
app.post('/api/ai/gemini/:model', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }
  const { model } = req.params;
  const { stream } = req.query;
  const endpoint = stream === 'true' ? `streamGenerateContent?alt=sse&key=${apiKey}` : `generateContent?key=${apiKey}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (stream === 'true') {
      // Forward SSE stream
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(Buffer.from(value));
        }
      };
      pump().catch(err => {
        console.error('[AI Proxy] Gemini stream error:', err.message);
        res.end();
      });
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (err) {
    console.error('[AI Proxy] Gemini error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ================================
// Serve React Frontend
// ================================

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback: all non-API routes serve index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// ================================
// Start Server
// ================================

app.listen(PORT, () => {
  console.log(`\n🧠 AGNES 3000 Server running on port ${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
  console.log(`   Storage: ${STATE_FILE}`);
  const state = loadState();
  if (state) {
    console.log(`   Loaded: ${state.documents?.length || 0} documents`);
  } else {
    console.log(`   No existing state - will be created on first save`);
  }
  console.log('');
});
