#!/usr/bin/env node
'use strict';
/**
 * Neural Memory System - Self-Installer
 * Run: node install.js
 * Creates all 11 source files + config files in the workspace
 */
const fs = require('fs');
const path = require('path');

// ── File manifest (name -> content) ──
const FILES = {};

const add = (name, content) => { FILES[name] = content; };

// ── package.json ──
add('neural-memory/package.json', JSON.stringify({
  name: 'neural-memory',
  version: '1.0.0',
  description: 'Neural memory system for OpenClaw',
  main: 'cli.js',
  private: true
}, null, 2));

// ── memory/neural/config.json ──
add('memory/neural/config.json', JSON.stringify({
  version: '1.0.0',
  created: new Date().toISOString(),
  activation: { maxActivated: 20, maxPropagationDepth: 4, seedCutoff: 10, synapseJitterLow: 0.85, synapseJitterHigh: 1.0 },
  hebbian: { learningRate: 0.1, initialSynapseWeight: 0.2, maxWeight: 1.0 },
  consolidation: { decayFactor: 0.995, dormantDaysThreshold: 30, archiveDaysThreshold: 90, patternEmergeMinCoactivations: 5, patternEmergeMinNeurons: 3 }
}, null, 2));

// ── memory/neural/synapses.json ──
add('memory/neural/synapses.json', '{}\n');

// ── recall.js (entry point) ──
add('neural-memory/recall.js', `#!/usr/bin/env node
require('./lib/recall');
`);

// ── cli.js ──
add('neural-memory/cli.js', `#!/usr/bin/env node
'use strict';
const NeuronStore = require('./lib/neuron-store');
const SynapseMatrix = require('./lib/synapse-matrix');
const { activate } = require('./lib/activation-engine');
const HebbianLearner = require('./lib/hebbian');
const Consolidator = require('./lib/consolidator');
const Migrator = require('./lib/migrator');
const fs = require('fs');
const path = require('path');

function printHelp() {
  console.log(\`
Neural Memory CLI

Commands:
  search <query>       Activate search and show results
  create <type> <name> Create new neuron
  record <type> <name> Record event and auto-connect
  list [type]          List neurons (filter by type)
  show <id>            Show neuron details
  stats                System statistics
  consolidate          Run memory consolidation
  migrate              Migrate from existing memory files

Options:
  --content <text>     Content for create/record
  --tags <t1,t2>       Tags for create/record
  --json               JSON output
\`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0];
  const isJson = args.includes('--json');
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--') && !args[i].startsWith('--json')) {
      const key = args[i].replace('--', '');
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[key] = args[i + 1];
        i++;
      }
    }
  }

  const posArgs = args.slice(1).filter(a => !a.startsWith('--'));
  const optionKeys = new Set(Object.keys(options));
  const filtered = [];
  for (let i = 0; i < posArgs.length; i++) {
    if (optionKeys.has(posArgs[i])) { i++; }
    else { filtered.push(posArgs[i]); }
  }

  const store = new NeuronStore();
  const matrix = new SynapseMatrix();

  switch (command) {
    case 'search':
    case 'activate': {
      const query = filtered.join(' ') || options.query;
      if (!query) { console.error('Need query'); process.exit(1); }
      const result = activate(query, { persist: true });
      if (isJson) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(\`Activated: \${result.activated.length} neurons\`);
      if (result.associated && result.associated.length > 0) {
        console.log(\`Associated: \${result.associated.length}\`);
      }
      console.log(\`Stats: \${result.stats.totalNeurons} total, \${result.stats.elapsed}ms\`);
      break;
    }

    case 'create': {
      const type = filtered[0], name = filtered[1] || options.name;
      const content = options.content || '';
      const tags = (options.tags || '').split(',').filter(Boolean);
      if (!type || !name) { console.error('Need type and name'); process.exit(1); }
      const neuron = store.create({ type, name, content, tags, source: 'cli' });
      if (isJson) { console.log(JSON.stringify(neuron, null, 2)); }
      else { console.log(\`Created: \${neuron.id} [\${type}] \${name}\`); }
      break;
    }

    case 'record': {
      const rType = filtered[0] || 'sensory', rName = filtered[1] || options.name || 'untitled';
      const rContent = options.content || rName;
      const rTags = (options.tags || '').split(',').filter(Boolean);
      const neuron = store.create({ type: rType, name: rName, content: rContent, tags: [...rTags, rType], source: 'record' });
      console.log(\`Recorded: \${neuron.id}\`);
      const searchResult = activate(rName + ' ' + (rTags.join(' ') || ''));
      const relatedIds = searchResult.activated.map(n => n.id).filter(id => id !== neuron.id).slice(0, 10);
      if (relatedIds.length > 0) {
        for (const rid of relatedIds) matrix.connectBidirectional(neuron.id, rid, 0.35);
        new HebbianLearner(store, matrix).learn([neuron.id, ...relatedIds], { rate: 0.1 });
        console.log(\`  Connected to \${relatedIds.length} related memories\`);
      }
      break;
    }

    case 'list': {
      const typeFilter = filtered[0];
      const all = typeFilter ? store.findByType(typeFilter) : store.getAll();
      const archived = store.listArchived();
      if (isJson) { console.log(JSON.stringify({ active: all, archived }, null, 2)); return; }
      const byType = {};
      for (const n of all) { if (!byType[n.type]) byType[n.type] = []; byType[n.type].push(n); }
      console.log(\`Neurons: \${all.length} active, \${archived.length} archived\`);
      for (const [type, neurons] of Object.entries(byType)) {
        console.log(\`  [\${type}] \${neurons.length}:\`);
        for (const n of neurons) console.log(\`    \${n.id} \${n.name}\`);
      }
      break;
    }

    case 'show': {
      const id = filtered[0];
      if (!id) { console.error('Need neuron ID'); process.exit(1); }
      const neuron = store.get(id);
      if (!neuron) { console.error('Not found'); process.exit(1); }
      if (isJson) { console.log(JSON.stringify(neuron, null, 2)); return; }
      console.log(\`ID: \${neuron.id}  Type: \${neuron.type}  Name: \${neuron.name}\`);
      console.log(\`Content: \${neuron.content}\`);
      console.log(\`Tags: \${(neuron.tags||[]).join(', ')}\`);
      console.log(\`Threshold: \${neuron.threshold}  Activations: \${neuron.activationCount}\`);
      break;
    }

    case 'stats': {
      const nStats = store.stats();
      const sStats = matrix.stats();
      const archived = store.listArchived();
      if (isJson) { console.log(JSON.stringify({ neurons: nStats, synapses: sStats }, null, 2)); return; }
      console.log(\`Neurons: \${nStats.total} + \${nStats.archived} archived\`);
      console.log(\`  Types: \${Object.entries(nStats.byType).map(([k,v]) => k+'='+v).join(', ')}\`);
      console.log(\`Synapses: \${sStats.edges} edges, avg weight \${sStats.avgWeight}\`);
      break;
    }

    case 'consolidate': {
      const result = new Consolidator(store, matrix).consolidate();
      console.log(\`Consolidation done: \${JSON.stringify(result.report)}\`);
      break;
    }

    case 'migrate': {
      const result = new Migrator(store, matrix).migrate();
      console.log(\`Migration done: \${JSON.stringify(result)}\`);
      break;
    }

    default:
      console.error('Unknown command:', command);
      printHelp();
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
`);

// ── seed-self.js ──
add('neural-memory/seed-self.js', `#!/usr/bin/env node
'use strict';
const NeuronStore = require('./lib/neuron-store');
const SynapseMatrix = require('./lib/synapse-matrix');
const HebbianLearner = require('./lib/hebbian');

const store = new NeuronStore();
const matrix = new SynapseMatrix();
const hebb = new HebbianLearner(store, matrix);

const seeds = [
  { type: 'project', name: 'Neural Memory System', content: 'Neural memory system v1.0 based on neurons + synapses + Hebbian learning', tags: ['project','neural-memory'], threshold: 0.40 },
  { type: 'fact', name: 'System Architecture', content: '3 layers: NeuronStore + SynapseMatrix + ActivationEngine(BFS). Dir: neural-memory/lib/', tags: ['fact','neural-memory','architecture'], threshold: 0.32 },
  { type: 'fact', name: 'Neuron Types', content: '5 types: sensory(log), pattern, fact, decision, project. Stored in memory/neural/neurons/', tags: ['fact','neural-memory','types'], threshold: 0.32 },
  { type: 'fact', name: 'Usage Entry', content: 'recall.js for search, cli.js for management. Each query triggers Hebbian learning.', tags: ['fact','neural-memory','usage'], threshold: 0.32 },
  { type: 'fact', name: 'Learning Mechanism', content: 'Hebbian: fire together, wire together. Auto-strengthen co-activated connections.', tags: ['fact','neural-memory','learning'], threshold: 0.32 },
  { type: 'fact', name: 'Consolidation Cron', content: 'Daily: synapse decay(0.995), dormancy(30d), archive(90d), orphan cleanup, pattern discovery.', tags: ['fact','neural-memory','consolidation'], threshold: 0.32 },
  { type: 'decision', name: 'Design: File-as-Neuron', content: 'Each neuron is an independent JSON file. Simple, git-trackable, compatible with memory/', tags: ['decision','neural-memory'], threshold: 0.38 },
  { type: 'decision', name: 'Design: BFS Propagation', content: 'Signal injection -> threshold -> BFS -> association. Keyword matching, no embedding, <650ms.', tags: ['decision','neural-memory'], threshold: 0.38 },
  { type: 'pattern', name: 'Memory as Network', content: 'Effective memory is grown through connection networks, not data dumps.', tags: ['pattern','neural-memory'], threshold: 0.28 },
  { type: 'pattern', name: 'Frequency Determines Strength', content: 'High-frequency memories auto-strengthen, low-frequency naturally fade. Like biological memory.', tags: ['pattern','neural-memory'], threshold: 0.28 },
];

console.log('Creating self-reference neurons...');
const ids = [];
for (const s of seeds) {
  const n = store.create(s);
  ids.push(n.id);
  console.log('  ' + n.id + ' [' + s.type + '] ' + s.name);
}

// Connect seeds
for (let i = 0; i < ids.length; i++)
  for (let j = i + 1; j < ids.length; j++)
    matrix.connectBidirectional(ids[i], ids[j], 0.6);

hebb.learn(ids, { rate: 0.2 });
const stats = store.stats();
console.log('Done. ' + ids.length + ' self-reference neurons, ' + stats.total + ' total.');
`);

// ── lib/neuron-store.js ──
add('neural-memory/lib/neuron-store.js', `'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NEURONS_DIR = path.resolve(__dirname, '../../memory/neural/neurons');
const ARCHIVE_DIR = path.resolve(__dirname, '../../memory/neural/archive');
function ensure(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function genId() { return 'n_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10); }

class NeuronStore {
  constructor(neuronsDir, archiveDir) {
    this.neuronsDir = neuronsDir || NEURONS_DIR;
    this.archiveDir = archiveDir || ARCHIVE_DIR;
    ensure(this.neuronsDir); ensure(this.archiveDir);
    this._cache = null;
  }
  _npath(id) { return path.join(this.neuronsDir, id + '.json'); }
  _apath(id) { return path.join(this.archiveDir, id + '.json'); }

  _load() {
    if (this._cache) return this._cache;
    this._cache = new Map();
    try { for (const f of fs.readdirSync(this.neuronsDir).filter(f => f.endsWith('.json'))) {
      try { const n = JSON.parse(fs.readFileSync(path.join(this.neuronsDir, f), 'utf8')); this._cache.set(n.id, n); } catch(_) {}
    }} catch(_) {}
    return this._cache;
  }
  _save(neuron) { fs.writeFileSync(this._npath(neuron.id), JSON.stringify(neuron, null, 2) + '\\n', 'utf8'); if (this._cache) this._cache.set(neuron.id, neuron); }
  invalidateCache() { this._cache = null; }

  create({ type, name, content, tags = [], threshold = 0.5, source = '' }) {
    const neuron = { id: genId(), type, name, content, tags: [...new Set(tags.map(t => t.toLowerCase()))], threshold, activationPotential: 0, lastActivated: null, activationCount: 0, created: new Date().toISOString(), source };
    this._save(neuron);
    return { ...neuron };
  }
  get(id) { const m = this._load().get(id); return m ? { ...m } : null; }
  getAll() { return [...this._load().values()]; }
  update(id, patch) { const m = this._load().get(id); if (!m) return null; Object.assign(m, patch); this._save(m); return { ...m }; }
  delete(id) { const p = this._npath(id); if (fs.existsSync(p)) { fs.unlinkSync(p); if (this._cache) this._cache.delete(id); return true; } return false; }
  archive(id) {
    const m = this._load().get(id); if (!m) return false;
    m.archivedAt = new Date().toISOString();
    fs.writeFileSync(this._apath(id), JSON.stringify(m, null, 2) + '\\n', 'utf8');
    return this.delete(id);
  }
  findByIds(ids) { const m = this._load(); return ids.map(id => m.get(id)).filter(Boolean).map(n => ({...n})); }
  findByType(type) { return this.getAll().filter(n => n.type === type); }
  findByTag(tag) { return this.getAll().filter(n => n.tags.includes(tag.toLowerCase())); }
  bulkSave(neurons) { for (const n of neurons) fs.writeFileSync(this._npath(n.id), JSON.stringify(n, null, 2) + '\\n', 'utf8'); this.invalidateCache(); }
  bulkDelete(ids) { for (const id of ids) { const p = this._npath(id); if (fs.existsSync(p)) fs.unlinkSync(p); } this.invalidateCache(); }

  stats() {
    const all = this.getAll();
    const counts = {}; for (const n of all) counts[n.type] = (counts[n.type] || 0) + 1;
    const archived = fs.existsSync(this.archiveDir) ? fs.readdirSync(this.archiveDir).filter(f => f.endsWith('.json')).length : 0;
    return { total: all.length, archived, byType: counts, totalActivationCount: all.reduce((s, n) => s + (n.activationCount || 0), 0) };
  }
  listArchived() {
    if (!fs.existsSync(this.archiveDir)) return [];
    return fs.readdirSync(this.archiveDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(this.archiveDir, f), 'utf8')));
  }
}
module.exports = NeuronStore;
`);

// ── lib/synapse-matrix.js ──
add('neural-memory/lib/synapse-matrix.js', `'use strict';
const fs = require('fs'); const path = require('path');
const MATRIX_PATH = path.resolve(__dirname, '../../memory/neural/synapses.json');
class SynapseMatrix {
  constructor(matrixPath) { this.matrixPath = matrixPath || MATRIX_PATH; this._matrix = null; }
  _load() { if (this._matrix) return this._matrix; try { this._matrix = JSON.parse(fs.readFileSync(this.matrixPath, 'utf8')); } catch(_) { this._matrix = {}; } return this._matrix; }
  _save() { fs.writeFileSync(this.matrixPath, JSON.stringify(this._matrix, null, 2) + '\\n', 'utf8'); }
  connect(fromId, toId, weight = 0.5) { const m = this._load(); if (!m[fromId]) m[fromId] = {}; m[fromId][toId] = Math.min(1, Math.max(0, weight)); this._save(); }
  connectBidirectional(a, b, weight = 0.5) { this.connect(a, b, weight); this.connect(b, a, weight); }
  getWeight(fromId, toId) { const m = this._load(); return m[fromId] && m[fromId][toId] !== undefined ? m[fromId][toId] : 0; }
  getOutgoing(fromId) { const m = this._load(); const targets = m[fromId]; if (!targets) return []; return Object.entries(targets).filter(([_,w]) => w > 0).map(([targetId, weight]) => ({ targetId, weight })); }
  getIncoming(toId) { const m = this._load(); const result = []; for (const [fromId, targets] of Object.entries(m)) if (targets[toId] !== undefined) result.push({ sourceId: fromId, weight: targets[toId] }); return result; }
  strengthen(a, b, rate = 0.1) { const m = this._load(); for (const [from, to] of [[a,b],[b,a]]) { if (!m[from]) m[from] = {}; const current = m[from][to] || 0.05; m[from][to] = Math.min(1, current + rate * (1 - current)); } this._save(); }
  decayAll(factor = 0.995) { const m = this._load(); let pruned = 0; for (const [from, targets] of Object.entries(m)) { for (const [to, w] of Object.entries(targets)) { const newW = w * factor; if (newW < 0.01) { delete targets[to]; pruned++; } else { targets[to] = newW; } } if (Object.keys(targets).length === 0) delete m[from]; } this._save(); return pruned; }
  removeOrphans(validIds) { const valid = new Set(validIds); const m = this._load(); let removed = 0; for (const [from, targets] of Object.entries(m)) { if (!valid.has(from)) { delete m[from]; removed++; continue; } for (const to of Object.keys(targets)) { if (!valid.has(to)) { delete targets[to]; removed++; } } if (Object.keys(targets).length === 0) delete m[from]; } this._save(); return removed; }
  removeAll(id) { const m = this._load(); let count = 0; if (m[id]) { count += Object.keys(m[id]).length; delete m[id]; } for (const [from, targets] of Object.entries(m)) { if (targets[id] !== undefined) { delete targets[id]; count++; if (Object.keys(targets).length === 0) delete m[from]; } } this._save(); return count; }
  getNeighbors(id) { return [...new Set([...this.getOutgoing(id).map(e => e.targetId), ...this.getIncoming(id).map(e => e.sourceId)])]; }
  stats() { const m = this._load(); let totalEdges = 0, totalWeight = 0; const sourceCount = Object.keys(m).length; for (const targets of Object.values(m)) { for (const w of Object.values(targets)) { totalEdges++; totalWeight += w; } } return { sources: sourceCount, edges: totalEdges, avgWeight: totalEdges > 0 ? +(totalWeight / totalEdges).toFixed(4) : 0 }; }
}
module.exports = SynapseMatrix;
`);

// ── lib/activation-engine.js ──
add('neural-memory/lib/activation-engine.js', `'use strict';
const NeuronStore = require('./neuron-store');
const SynapseMatrix = require('./synapse-matrix');
const DEFAULT_CONFIG = { maxActivated: 20, maxPropagationDepth: 4, seedCutoff: 10, synapseJitterLow: 0.85, synapseJitterHigh: 1.0 };
const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','can','could','may','might','shall','should','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','and','but','or','nor','not','so','yet','if','then','else','than','that','this','these','those','it','its','what','which','who','whom','how','why','when','where','的','了','在','是','我','有','和','就','不','人','都','一','上','也','很','到','说','要','去','你','会','着','没有','看','好','自己','这','他','她','它','们']);

function tokenize(text) {
  const tokens = [];
  const parts = text.toLowerCase().split(/[\\s,，。．.!！?？；;：:\`"''（）()【】\\[\\]{}、/\\\\]+/);
  for (const part of parts) {
    if (!part) continue;
    if (/[\\u4e00-\\u9fff]/.test(part)) {
      for (let i = 0; i < part.length; i++) {
        const ch = part[i];
        if (/[\\u4e00-\\u9fff]/.test(ch) && !STOPWORDS.has(ch)) tokens.push(ch);
        if (i < part.length - 1) { const bigram = part.substring(i, i+2); if (/[\\u4e00-\\u9fff]/.test(bigram[0]) && /[\\u4e00-\\u9fff]/.test(bigram[1])) tokens.push(bigram); }
      }
    } else {
      const words = part.split(/[^a-z0-9+.\\-]+/).filter(w => w.length > 1 || /^[0-9]/.test(w));
      for (const w of words) { if (!STOPWORDS.has(w)) tokens.push(w); }
    }
  }
  return [...new Set(tokens)];
}

function computeSignal(neuron, keywords, rawQuery) {
  let score = 0;
  const name = (neuron.name || '').toLowerCase();
  const content = (neuron.content || '').toLowerCase();
  const tags = (neuron.tags || []).map(t => t.toLowerCase());
  if (name === rawQuery.toLowerCase().trim()) score += 0.5;
  for (const kw of keywords) { if (name.includes(kw)) score += 0.25; }
  for (const kw of keywords) { for (const tag of tags) { if (tag.includes(kw) || kw.includes(tag)) { score += 0.2; break; } } }
  const kwInContent = keywords.filter(kw => content.includes(kw));
  if (keywords.length > 0) score += (kwInContent.length / keywords.length) * 0.35;
  if (kwInContent.length >= 3) score += 0.15; else if (kwInContent.length >= 2) score += 0.08;
  const queryClean = rawQuery.toLowerCase().trim();
  if (queryClean.length >= 4 && content.includes(queryClean)) score += 0.3;
  return Math.min(1, score);
}

function activate(rawQuery, options = {}) {
  const store = new NeuronStore();
  const matrix = new SynapseMatrix();
  const config = { ...DEFAULT_CONFIG, ...options };
  const allNeurons = store.getAll();
  if (allNeurons.length === 0) return { activated: [], stats: { totalNeurons: 0 }, seeds: 0 };
  const keywords = tokenize(rawQuery);
  if (keywords.length === 0) keywords.push(...rawQuery.toLowerCase().split(/\\s+/).filter(k => k.length > 1 && !STOPWORDS.has(k)));
  const signalMap = new Map();
  for (const neuron of allNeurons) { const signal = computeSignal(neuron, keywords, rawQuery); if (signal > 0.01) signalMap.set(neuron.id, { signal, neuron }); }
  const sortedSignals = [...signalMap.entries()].map(([id, v]) => ({ id, signal: v.signal, neuron: v.neuron })).sort((a, b) => b.signal - a.signal);
  const seeds = sortedSignals.slice(0, config.seedCutoff);
  if (seeds.length === 0) return { activated: [], stats: { totalNeurons: allNeurons.length }, seeds: 0 };
  const potentials = new Map();
  for (const n of allNeurons) potentials.set(n.id, { potential: 0, depth: 0, fired: false, visited: false });
  const queue = []; const fired = [];
  for (const s of seeds) { const p = potentials.get(s.id); p.potential = s.signal; if (!p.visited) { p.visited = true; queue.push({ id: s.id, depth: 0 }); } }
  while (queue.length > 0 && fired.length < config.maxActivated) {
    const { id, depth } = queue.shift();
    const p = potentials.get(id); if (p.fired) continue;
    const neuron = store.get(id); if (!neuron) continue;
    const threshold = neuron.threshold || 0.5;
    if (p.potential >= threshold) {
      p.fired = true; neuron.activationPotential = p.potential;
      fired.push({ id, strength: +p.potential.toFixed(4), neuron });
      if (depth < config.maxPropagationDepth) {
        const outgoing = matrix.getOutgoing(id);
        for (const syn of outgoing) {
          const targetP = potentials.get(syn.targetId);
          if (!targetP || targetP.fired) continue;
          const jitter = config.synapseJitterLow + Math.random() * (config.synapseJitterHigh - config.synapseJitterLow);
          targetP.potential = Math.min(1.0, targetP.potential + p.potential * syn.weight * jitter);
          if (!targetP.visited) { targetP.visited = true; queue.push({ id: syn.targetId, depth: depth + 1 }); }
        }
      }
    }
  }
  if (options.persist) {
    const now = new Date().toISOString();
    for (const f of fired) { const n = f.neuron; n.activationCount = (n.activationCount || 0) + 1; n.lastActivated = now; n.activationPotential = f.strength; store._save(n); }
  }
  fired.sort((a, b) => b.strength - a.strength);
  const activated = fired.map(f => ({ id: f.id, type: f.neuron.type, name: f.neuron.name, content: f.neuron.content, tags: f.neuron.tags, strength: f.strength }));
  const firedIds = new Set(fired.map(f => f.id));
  const associated = []; const seenAssociated = new Set(firedIds);
  for (const f of fired) { const outgoing = matrix.getOutgoing(f.id); for (const syn of outgoing) { if (seenAssociated.has(syn.targetId)) continue; seenAssociated.add(syn.targetId); const targetNeuron = store.get(syn.targetId); if (!targetNeuron) continue; const assocStrength = f.strength * syn.weight * 0.6; if (assocStrength > 0.05) associated.push({ targetId: syn.targetId, type: targetNeuron.type, name: targetNeuron.name, strength: +assocStrength.toFixed(4) }); } }
  associated.sort((a, b) => b.strength - a.strength);
  return { activated, associated: associated.slice(0, 10), stats: { totalNeurons: allNeurons.length, totalFired: fired.length, seedsUsed: seeds.length } };
}
module.exports = { activate, tokenize, computeSignal };
`);

// ── lib/hebbian.js ──
add('neural-memory/lib/hebbian.js', `'use strict';
class HebbianLearner {
  constructor(store, matrix) { this.store = store; this.matrix = matrix; }
  learn(firedIds, options = {}) {
    const rate = options.rate || 0.1;
    if (firedIds.length < 2) return { strengthened: 0, created: 0 };
    let strengthened = 0, created = 0;
    for (let i = 0; i < firedIds.length; i++) {
      for (let j = i + 1; j < firedIds.length; j++) {
        const a = firedIds[i], b = firedIds[j];
        if (this.matrix.getWeight(a, b) > 0) { this.matrix.strengthen(a, b, rate); strengthened++; }
        else { this.matrix.connect(a, b, 0.2); this.matrix.connect(b, a, 0.2); created++; }
      }
    }
    return { strengthened, created };
  }
}
module.exports = HebbianLearner;
`);

// ── lib/consolidator.js ──
add('neural-memory/lib/consolidator.js', `'use strict';
const fs = require('fs'); const path = require('path');
const CONFIG_PATH = path.resolve(__dirname, '../../memory/neural/config.json');
function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch(_) { return { consolidation: {} }; } }

class Consolidator {
  constructor(store, matrix) { this.store = store; this.matrix = matrix; this.config = loadConfig(); this.consCfg = this.config.consolidation || {}; }

  consolidate() {
    return { report: {
      timestamp: new Date().toISOString(),
      synapticDecay: this._decaySynapses(),
      dormantArchived: this._archiveDormant(),
      orphansRemoved: this._removeOrphans(),
      patternsFound: this._findPatterns(),
    }};
  }

  _decaySynapses() {
    const factor = this.consCfg.decayFactor || 0.995;
    const before = this.matrix.stats();
    const pruned = this.matrix.decayAll(factor);
    return { count: pruned, beforeEdges: before.edges, afterEdges: this.matrix.stats().edges, factor };
  }

  _archiveDormant() {
    const now = Date.now();
    const dormantDays = this.consCfg.dormantDaysThreshold || 30;
    const archiveDays = this.consCfg.archiveDaysThreshold || 90;
    const all = this.store.getAll();
    let archived = 0, dormant = 0;
    for (const n of all) {
      const lastActive = n.lastActivated ? new Date(n.lastActivated).getTime() : 0;
      const age = now - lastActive;
      if (lastActive > 0 && age > archiveDays * 86400000) { if (this.store.archive(n.id)) archived++; }
      else if (lastActive > 0 && age > dormantDays * 86400000) { this.store.update(n.id, { threshold: Math.min(1, (n.threshold||0.5)+0.1) }); dormant++; }
    }
    return { archived, dormant };
  }

  _removeOrphans() {
    const validIds = this.store.getAll().map(n => n.id);
    const removed = this.matrix.removeOrphans(validIds);
    return { count: removed };
  }

  _findPatterns() {
    const all = this.store.getAll();
    const strongPairs = [];
    for (const n of all) { const outgoing = this.matrix.getOutgoing(n.id); for (const syn of outgoing) { if (syn.weight >= 0.7 && this.matrix.getWeight(syn.targetId, n.id) >= 0.7) strongPairs.push([n.id, syn.targetId]); } }
    const clusters = []; const nodeToCluster = new Map();
    for (const [a, b] of strongPairs) {
      const ca = nodeToCluster.get(a), cb = nodeToCluster.get(b);
      if (ca === undefined && cb === undefined) { const c = new Set([a,b]); clusters.push(c); nodeToCluster.set(a,c); nodeToCluster.set(b,c); }
      else if (ca && !cb) { ca.add(b); nodeToCluster.set(b, ca); }
      else if (!ca && cb) { cb.add(a); nodeToCluster.set(a, cb); }
      else if (ca !== cb) { for (const node of cb) { ca.add(node); nodeToCluster.set(node, ca); } const idx = clusters.indexOf(cb); if (idx >= 0) clusters.splice(idx, 1); }
    }
    const meaningful = clusters.filter(c => c.size >= 3).map(c => ({ neuronCount: c.size, neurons: [...c].map(id => { const n = this.store.get(id); return n ? { id: n.id, name: n.name } : null; }).filter(Boolean) })).filter(c => c.neurons.length >= 3);
    return { clustersFound: meaningful.length, clusters: meaningful };
  }
}
module.exports = Consolidator;
`);

// ── lib/recall.js ──
add('neural-memory/lib/recall.js', `'use strict';
const { activate } = require('./activation-engine');
const HebbianLearner = require('./hebbian');
function recall(query, options = {}) {
  const start = Date.now();
  const result = activate(query, { persist: !!options.persist });
  const ids = result.activated.map(n => n.id);
  let learnResult = null;
  if (options.learn !== false && ids.length >= 2) { learnResult = new HebbianLearner().learn(ids, { rate: options.learningRate || 0.05 }); }
  return { activated: result.activated, associated: result.associated || [], stats: { ...result.stats, elapsed: Date.now() - start }, learned: learnResult, query };
}
module.exports = recall;
if (process.argv[1] && /recall\\.js$/i.test(process.argv[1])) {
  const query = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
  const raw = process.argv.includes('--raw');
  if (!query) { console.error('Usage: node recall.js <query> [--raw]'); process.exit(1); }
  const result = recall(query, { persist: true });
  if (raw) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
  console.log('[' + result.stats.totalFired + ' activated, ' + (result.stats.totalNeurons) + ' total, ' + result.stats.elapsed + 'ms]');
  for (const n of result.activated.slice(0, 10)) console.log('  ' + (n.strength * 100).toFixed(0) + '% [' + n.type + '] ' + n.name);
}
`);

// ── lib/migrator.js ──
add('neural-memory/lib/migrator.js', `'use strict';
const fs = require('fs'); const path = require('path');
const WORKSPACE = path.resolve(__dirname, '../..');
const MEMORY_MD = path.join(WORKSPACE, 'MEMORY.md');

class Migrator {
  constructor(store, matrix) { this.store = store; this.matrix = matrix; }

  migrate() {
    console.log('Migrating existing memories to neurons...');
    let total = 0;
    // Migrate MEMORY.md
    if (fs.existsSync(MEMORY_MD)) {
      const content = fs.readFileSync(MEMORY_MD, 'utf8');
      const sections = this._parseSections(content);
      for (const [sectionName, lines] of Object.entries(sections)) {
        const s = sectionName.toLowerCase();
        if (s.includes('active projects') || s.includes('recent decisions')) {
          for (const line of lines) {
            if (!line.startsWith('|') || line.includes('---')) continue;
            const cols = line.split('|').map(c => c.replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g, '$1').replace(/\\*{1,2}/g, '').trim());
            if (cols.length >= 4 && cols[1] && cols[1] !== '项目' && cols[1] !== '决策') {
              const type = s.includes('projects') ? 'project' : 'decision';
              const name = cols[1].substring(0, 48);
              const content = cols[2] ? cols[2].substring(0, 200) : name;
              this.store.create({ type, name, content, tags: [type], threshold: type === 'project' ? 0.40 : 0.38, source: 'MEMORY.md' });
              total++;
            }
          }
        }
        if (s.includes('patterns') || s.includes(' lessons')) {
          for (const line of lines) {
            const m = line.match(/^-\\s+\\*{0,2}(.+?)\\*{0,2}\\s*[→\\-]\\s*(.+)/);
            if (m) {
              this.store.create({ type: 'pattern', name: m[1].substring(0, 48), content: m[2].substring(0, 200), tags: ['pattern'], threshold: 0.28, source: 'MEMORY.md' });
              total++;
            }
          }
        }
      }
    }
    // Migrate daily logs
    const dailyDir = path.join(WORKSPACE, 'memory', 'daily');
    if (fs.existsSync(dailyDir)) {
      for (const file of fs.readdirSync(dailyDir).filter(f => f.endsWith('.md')).sort().slice(-100)) {
        try {
          const lines = fs.readFileSync(path.join(dailyDir, file), 'utf8').split('\\n');
          for (const line of lines) {
            const m = line.match(/^[-*]\\s+(.+)/);
            if (m) {
              const text = m[1].replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g, '$1').replace(/\\*{1,2}/g, '').trim();
              if (text.length >= 8) {
                const isDecision = /决定|选择|放弃|确认|结论|可知|因此|问题/.test(text);
                this.store.create({ type: isDecision ? 'decision' : 'sensory', name: text.substring(0, 48), content: file.replace('.md','') + ': ' + text, tags: [isDecision ? 'decision' : 'sensory'], threshold: isDecision ? 0.38 : 0.48, source: 'daily/'+file });
                total++;
              }
            }
          }
        } catch(_) {}
      }
    }
    console.log('Migration complete: ' + total + ' neurons created.');
    const stats = this.store.stats();
    console.log('Total: ' + stats.total + ' neurons, types: ' + JSON.stringify(stats.byType));
    return { total };
  }

  _parseSections(content) {
    const lines = content.split('\\n');
    const sections = {};
    let cur = '__top__'; sections[cur] = [];
    for (const line of lines) {
      if (line.startsWith('## ')) { cur = line.slice(3).trim(); sections[cur] = []; }
      else (sections[cur] || (sections[cur] = [])).push(line);
    }
    return sections;
  }
}
module.exports = Migrator;
`);

// ── WRITE ALL FILES ──
console.log('Neural Memory System - Installing...');
let count = 0;
for (const [filepath, content] of Object.entries(FILES)) {
  const fullPath = path.resolve(__dirname, filepath);
  const dir = path.dirname(fullPath);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('  OK: ' + filepath + ' (' + content.length + ' bytes)');
  count++;
}
console.log('');
console.log('Installation complete! ' + count + ' files created.');
console.log('');
console.log('Next steps:');
console.log('  1. cd ' + __dirname);
console.log('  2. node cli.js stats           # Verify installation');
console.log('  3. node seed-self.js            # Create self-reference neurons');
console.log('  4. node cli.js migrate          # Migrate from MEMORY.md');
console.log('  5. node recall.js "test"        # Verify search');
