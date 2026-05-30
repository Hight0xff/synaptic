'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NEURONS_DIR = path.resolve(__dirname, '../../memory/neural/neurons');
const ARCHIVE_DIR = path.resolve(__dirname, '../../memory/neural/archive');

function ensure(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function genId() {
  return 'n_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

class NeuronStore {
  constructor(neuronsDir, archiveDir) {
    this.neuronsDir = neuronsDir || NEURONS_DIR;
    this.archiveDir = archiveDir || ARCHIVE_DIR;
    ensure(this.neuronsDir);
    ensure(this.archiveDir);
    this._cache = null;
    this._lockQ = Promise.resolve();
    this._dirty = false;
  }

  _npath(id) { return path.join(this.neuronsDir, id + '.json'); }
  _apath(id) { return path.join(this.archiveDir, id + '.json'); }

  // ─── lazy-load / flush ───
  _load() {
    if (this._cache) return this._cache;
    this._cache = new Map();
    try {
      for (const f of fs.readdirSync(this.neuronsDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const n = JSON.parse(fs.readFileSync(path.join(this.neuronsDir, f), 'utf8'));
          this._cache.set(n.id, n);
        } catch (_) { /* skip corrupt */ }
      }
    } catch (_) { /* dir missing */ }
    return this._cache;
  }

  _save(neuron) {
    fs.writeFileSync(this._npath(neuron.id), JSON.stringify(neuron, null, 2) + '\n', 'utf8');
    if (this._cache) this._cache.set(neuron.id, neuron);
  }

  _persist(neuron) {
    // Write without touching cache — for bulk operations
    fs.writeFileSync(this._npath(neuron.id), JSON.stringify(neuron, null, 2) + '\n', 'utf8');
  }

  invalidateCache() { this._cache = null; }

  // ─── write lock ───
  /**
   * Acquire write lock, returns an unlock function.
   * @returns {Promise<function>}
   */
  async acquireLock() {
    let unlock;
    const next = new Promise(r => { unlock = r; });
    const prev = this._lockQ;
    this._lockQ = prev.then(() => next);
    await prev;
    return unlock;
  }

  /**
   * Batch-persist all cached neurons to disk.
   */
  async persistAll() {
    if (this._cache) {
      for (const [id, neuron] of this._cache) {
        this._persist(neuron);
      }
    }
    this._dirty = false;
  }

  // ─── dedup ───
  _hashKey(name, content) {
    return crypto.createHash('sha256')
      .update(String(name) + '|' + String(content || ''))
      .digest('hex')
      .slice(0, 16);
  }

  _findByHash(hash) {
    for (const n of this._load().values()) {
      if (this._hashKey(n.name, n.content || '') === hash) return n;
    }
    return null;
  }

  /**
   * Scan all neurons for exact duplicates (same name + content).
   * @returns {Array<{original: Object, duplicate: Object}>}
   */
  scanDuplicates() {
    const all = this.getAll();
    const hashMap = new Map();
    const duplicates = [];
    for (const n of all) {
      const hash = this._hashKey(n.name, n.content || '');
      if (hashMap.has(hash)) {
        duplicates.push({ original: hashMap.get(hash), duplicate: n });
      } else {
        hashMap.set(hash, n);
      }
    }
    return duplicates;
  }

  // ─── CRUD ───
  create({ type, name, content, tags = [], threshold = 0.5, source = '', decayFactor = 0.95 }) {
    // Dedup: exact same name+content returns existing neuron
    if (content !== undefined) {
      const hash = this._hashKey(name, content || '');
      const existing = this._findByHash(hash);
      if (existing) {
        return { ...existing, _dedup: true };
      }
    }
    const neuron = {
      id: genId(),
      type,
      name,
      content,
      tags: [...new Set(tags.map(t => t.toLowerCase()))],
      threshold,
      activationPotential: 0,
      lastActivated: null,
      activationCount: 0,
      created: new Date().toISOString(),
      source,
      decayFactor,
    };
    this._save(neuron);
    return { ...neuron };
  }

  get(id) {
    const m = this._load().get(id);
    return m ? { ...m } : null;
  }

  getAll() {
    return [...this._load().values()];
  }

  update(id, patch) {
    const m = this._load().get(id);
    if (!m) return null;
    Object.assign(m, patch);
    this._save(m);
    return { ...m };
  }

  delete(id) {
    const p = this._npath(id);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      if (this._cache) this._cache.delete(id);
      return true;
    }
    return false;
  }

  archive(id) {
    const m = this._load().get(id);
    if (!m) return false;
    m.archivedAt = new Date().toISOString();
    fs.writeFileSync(this._apath(id), JSON.stringify(m, null, 2) + '\n', 'utf8');
    return this.delete(id);
  }

  unarchive(id) {
    const p = this._apath(id);
    if (!fs.existsSync(p)) return false;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    delete data.archivedAt;
    this._save(data);
    fs.unlinkSync(p);
    return true;
  }

  // ─── query ───
  findByIds(ids) {
    const m = this._load();
    return ids.map(id => m.get(id)).filter(Boolean).map(n => ({ ...n }));
  }

  findByType(type) {
    return this.getAll().filter(n => n.type === type);
  }

  findByTag(tag) {
    const t = tag.toLowerCase();
    return this.getAll().filter(n => n.tags.includes(t));
  }

  // ─── batch update ───
  bulkSave(neurons) {
    for (const n of neurons) this._persist(n);
    this.invalidateCache();
  }

  bulkDelete(ids) {
    for (const id of ids) {
      const p = this._npath(id);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    this.invalidateCache();
  }

  // ─── stats ───
  stats() {
    const all = this.getAll();
    const counts = {};
    for (const n of all) {
      counts[n.type] = (counts[n.type] || 0) + 1;
    }
    const archived = fs.existsSync(this.archiveDir)
      ? fs.readdirSync(this.archiveDir).filter(f => f.endsWith('.json')).length
      : 0;
    return {
      total: all.length,
      archived,
      byType: counts,
      totalActivationCount: all.reduce((s, n) => s + (n.activationCount || 0), 0),
    };
  }

  listArchived() {
    if (!fs.existsSync(this.archiveDir)) return [];
    return fs.readdirSync(this.archiveDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const n = JSON.parse(fs.readFileSync(path.join(this.archiveDir, f), 'utf8'));
        return { id: n.id, type: n.type, name: n.name, archivedAt: n.archivedAt };
      });
  }
}

module.exports = NeuronStore;
