#!/usr/bin/env node
'use strict';

/**
 * 神经记忆 HTTP 服务
 * 
 * 使用 Node 内置 http 模块，零外部依赖。
 * 
 * 启动:
 *   node neural-memory/server.js [--port 3547] [--auth-key xxx]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const NeuronStore = require('./lib/neuron-store');
const SynapseMatrix = require('./lib/synapse-matrix');
const { activate } = require('./lib/activation-engine');
const HebbianLearner = require('./lib/hebbian');
const Consolidator = require('./lib/consolidator');
const recall = require('./lib/recall');

const CANVAS_HTML = path.resolve(__dirname, '../../.openclaw/canvas/neural-memory.html');
const CANVAS_HTML_ALT = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.openclaw', 'canvas', 'neural-memory.html');
function findCanvasHtml() {
  for (const p of [CANVAS_HTML, CANVAS_HTML_ALT]) {
    if (fs.existsSync(p)) return p;
  }
  return CANVAS_HTML_ALT;
}

// ─── CLI args ───
const args = process.argv.slice(2);
let PORT = 3547;
let AUTH_KEY = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') PORT = parseInt(args[++i], 10) || 3547;
  if (args[i] === '--auth-key') AUTH_KEY = args[++i];
}

// ─── Init ───
const store = new NeuronStore();
const matrix = new SynapseMatrix();
const startTime = Date.now();

// Pre-load data into cache
store.getAll();
matrix.loadAll();

// ─── Debounced persist ───
let persistTimer = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushPersist, 200);
}

async function flushPersist() {
  persistTimer = null;
  await store.persistAll();
  await matrix.persistAll();
}

// ─── Write lock wrapper ───
async function withWriteLock(fn) {
  const unlock = await store.acquireLock();
  try {
    const result = await fn();
    schedulePersist();
    return result;
  } finally {
    unlock();
  }
}

// ─── Body parser ───
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ─── Auth check ───
function checkAuth(req) {
  if (!AUTH_KEY) return true;
  return req.headers['x-auth-key'] === AUTH_KEY;
}

// ─── JSON response helper ───
function json(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

// ─── HTTP Router ───
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Key',
    });
    res.end();
    return;
  }

  // Auth
  if (!checkAuth(req)) {
    return json(res, { error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  try {
    // ── GET / — serve visualization HTML ──
    if (path === '/' && method === 'GET') {
      try {
        const canvasPath = findCanvasHtml();
        const html = fs.readFileSync(canvasPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      } catch (_) {
        return json(res, { error: 'Visualization page not found' }, 500);
      }
    }

    // ── GET /health ──
    if (path === '/health' && method === 'GET') {
      const nStats = store.stats();
      const sStats = matrix.stats();
      return json(res, {
        status: 'ok',
        uptime: Date.now() - startTime,
        neurons: nStats.total,
        synapses: sStats.edges,
      });
    }

    // ── POST /search ──
    if (path === '/search' && method === 'POST') {
      const body = await parseBody(req);
      const query = body.query;
      if (!query) return json(res, { error: 'Missing query' }, 400);

      const result = recall(query, {
        persist: body.persist !== false,
        learn: body.learn !== false,
        learningRate: body.rate || 0.05,
        store: store,
        matrix: matrix,
      });
      return json(res, result);
    }

    // ── POST /record (create + auto-connect) ──
    if (path === '/record' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.type || !body.name) return json(res, { error: 'Missing type or name' }, 400);

      const result = await withWriteLock(async () => {
        const neuron = store.create({
          type: body.type,
          name: body.name,
          content: body.content || body.name,
          tags: body.tags || [],
          source: 'server:record',
        });

        // Auto-connect related memories
        const searchResult = activate(body.name + ' ' + (body.tags || []).join(' '), { persist: false });
        const relatedIds = searchResult.activated.map(n => n.id).filter(id => id !== neuron.id).slice(0, 10);
        if (relatedIds.length > 0) {
          for (const rid of relatedIds) {
            matrix.connectBidirectional(neuron.id, rid, 0.35);
          }
          const hebb = new HebbianLearner(store, matrix);
          hebb.learn([neuron.id, ...relatedIds], { rate: 0.1 });
        }

        return {
          neuron: { id: neuron.id, type: neuron.type, name: neuron.name, _dedup: !!neuron._dedup },
          connections: relatedIds.length,
        };
      });
      return json(res, result);
    }

    // ── POST /create ──
    if (path === '/create' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.type || !body.name) return json(res, { error: 'Missing type or name' }, 400);

      const result = await withWriteLock(async () => {
        return store.create({
          type: body.type,
          name: body.name,
          content: body.content,
          tags: body.tags,
          threshold: body.threshold,
          source: 'server:create',
        });
      });
      return json(res, result);
    }

    // ── POST /learn ──
    if (path === '/learn' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.ids || !Array.isArray(body.ids) || body.ids.length < 2) {
        return json(res, { error: 'Need at least 2 neuron IDs in ids array' }, 400);
      }

      const result = await withWriteLock(async () => {
        const learner = new HebbianLearner(store, matrix);
        return learner.learn(body.ids, {
          rate: body.rate || 0.1,
          updateTimestamps: true,
        });
      });
      return json(res, result);
    }

    // ── POST /consolidate ──
    if (path === '/consolidate' && method === 'POST') {
      const result = await withWriteLock(async () => {
        const consolidator = new Consolidator(store, matrix);
        return consolidator.consolidate();
      });
      return json(res, result);
    }

    // ── GET /stats ──
    if (path === '/stats' && method === 'GET') {
      const nStats = store.stats();
      const sStats = matrix.stats();
      return json(res, {
        neurons: nStats,
        synapses: sStats,
        uptime: Date.now() - startTime,
      });
    }

    // ── GET /graph ──
    if (path === '/graph' && method === 'GET') {
      const allNeurons = store.getAll();
      const nodes = allNeurons.map(n => ({
        id: n.id,
        type: n.type,
        name: n.name,
        strength: n.activationPotential || 0,
        activationCount: n.activationCount || 0,
        threshold: n.threshold,
      }));
      const nodeIds = new Set(allNeurons.map(n => n.id));
      const links = [];
      for (const n of allNeurons) {
        const outgoing = matrix.getOutgoing(n.id);
        for (const syn of outgoing) {
          if (nodeIds.has(syn.targetId)) {
            links.push({ source: n.id, target: syn.targetId, weight: syn.weight });
          }
        }
      }
      return json(res, { nodes, links });
    }

    // ── GET /neuron/:id ──
    const neuronMatch = path.match(/^\/neuron\/([a-z0-9_]+)$/);
    if (neuronMatch && method === 'GET') {
      const neuron = store.get(neuronMatch[1]);
      if (!neuron) return json(res, { error: 'Not found' }, 404);
      const outgoing = matrix.getOutgoing(neuron.id);
      const neighbors = outgoing.map(syn => {
        const target = store.get(syn.targetId);
        return { id: syn.targetId, name: target ? target.name : '(deleted)', type: target ? target.type : '?', weight: syn.weight };
      }).sort((a, b) => b.weight - a.weight).slice(0, 30);
      return json(res, { neuron, neighbors });
    }

    // ── PUT /neuron/:id — update ──
    if (neuronMatch && method === 'PUT') {
      const body = await parseBody(req);
      const patch = {};
      if (body.name) patch.name = body.name;
      if (body.content !== undefined) patch.content = body.content;
      if (body.tags) patch.tags = body.tags;
      if (body.threshold !== undefined) patch.threshold = body.threshold;
      const result = await withWriteLock(async () => store.update(neuronMatch[1], patch));
      if (!result) return json(res, { error: 'Not found' }, 404);
      return json(res, { neuron: result });
    }

    // ── DELETE /neuron/:id — delete ──
    if (neuronMatch && method === 'DELETE') {
      const id = neuronMatch[1];
      const result = await withWriteLock(async () => {
        const synRemoved = matrix.removeAll(id);
        const ok = store.delete(id);
        return { deleted: ok, synapsesRemoved: synRemoved };
      });
      return json(res, result);
    }

    // ── 404 ──
    return json(res, { error: 'Not found', path, method }, 404);
  } catch (err) {
    return json(res, { error: err.message }, 500);
  }
});

// ─── Shutdown handler ───
async function shutdown(signal) {
  console.log(`\n⚠️  收到 ${signal}，正在写盘...`);
  if (persistTimer) clearTimeout(persistTimer);
  await store.persistAll();
  await matrix.persistAll();
  console.log('💾 数据已写盘');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start ───
server.listen(PORT, '127.0.0.1', () => {
  console.log(`🧬 神经记忆服务启动 :${PORT}`);
});
