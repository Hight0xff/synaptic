'use strict';

const fs = require('fs');
const path = require('path');

const MATRIX_PATH = path.resolve(__dirname, '../../memory/neural/synapses.json');

/**
 * 突触矩阵 — 有向加权边，代表神经元之间的连接强度
 * 
 * 结构: { [fromId]: { [toId]: weight (0~1) } }
 * 未存储的边视为权重 0（无连接）
 */
class SynapseMatrix {
  constructor(matrixPath) {
    this.matrixPath = matrixPath || MATRIX_PATH;
    this._matrix = null;
    this._lockQ = Promise.resolve();
  }

  _load() {
    if (this._matrix) return this._matrix;
    try {
      this._matrix = JSON.parse(fs.readFileSync(this.matrixPath, 'utf8'));
    } catch (_) {
      this._matrix = {};
    }
    return this._matrix;
  }

  _save() {
    fs.writeFileSync(this.matrixPath, JSON.stringify(this._matrix, null, 2) + '\n', 'utf8');
  }

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
   * Force persist the matrix to disk.
   */
  async persistAll() {
    this._save();
  }

  /**
   * Explicitly load the full matrix from disk.
   * Accepts neurons array for future bulk operations.
   * @param {Array} [neurons]
   */
  loadAll(neurons) {
    this._load();
    return this;
  }

  /**
   * 从 fromId → toId 建立突触（或更新权重）
   */
  connect(fromId, toId, weight = 0.5) {
    const m = this._load();
    if (!m[fromId]) m[fromId] = {};
    m[fromId][toId] = Math.min(1, Math.max(0, weight));
    this._save();
  }

  /**
   * 双向连接（常用于初始化时）
   */
  connectBidirectional(a, b, weight = 0.5) {
    this.connect(a, b, weight);
    this.connect(b, a, weight);
  }

  disconnect(fromId, toId) {
    const m = this._load();
    if (m[fromId] && m[fromId][toId] !== undefined) {
      delete m[fromId][toId];
      if (Object.keys(m[fromId]).length === 0) delete m[fromId];
      this._save();
    }
  }

  getWeight(fromId, toId) {
    const m = this._load();
    return m[fromId] && m[fromId][toId] !== undefined ? m[fromId][toId] : 0;
  }

  getOutgoing(fromId) {
    const m = this._load();
    const targets = m[fromId];
    if (!targets) return [];
    return Object.entries(targets)
      .filter(([_, w]) => w > 0)
      .map(([targetId, weight]) => ({ targetId, weight }));
  }

  getIncoming(toId) {
    const m = this._load();
    const result = [];
    for (const [fromId, targets] of Object.entries(m)) {
      if (targets[toId] !== undefined) {
        result.push({ sourceId: fromId, weight: targets[toId] });
      }
    }
    return result;
  }

  /**
   * Hebbian 强化：两神经元同时激活时加强连接
   * weight += rate * (1 - weight)  → asymptotically approaches 1
   */
  strengthen(a, b, rate = 0.1) {
    const m = this._load();
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!m[from]) m[from] = {};
      const current = m[from][to] || 0.05; // minimal base if not exists
      m[from][to] = Math.min(1, current + rate * (1 - current));
    }
    this._save();
  }

  /**
   * 衰减所有突触
   */
  decayAll(factor = 0.995) {
    const m = this._load();
    let pruned = 0;
    for (const [from, targets] of Object.entries(m)) {
      for (const [to, w] of Object.entries(targets)) {
        const newW = w * factor;
        if (newW < 0.01) {
          delete targets[to];
          pruned++;
        } else {
          targets[to] = newW;
        }
      }
      if (Object.keys(targets).length === 0) delete m[from];
    }
    this._save();
    return pruned;
  }

  /**
   * 移除指向已不存在神经元的孤儿突触
   */
  removeOrphans(validIds) {
    const valid = new Set(validIds);
    const m = this._load();
    let removed = 0;
    for (const [from, targets] of Object.entries(m)) {
      if (!valid.has(from)) {
        delete m[from];
        removed++;
        continue;
      }
      for (const to of Object.keys(targets)) {
        if (!valid.has(to)) {
          delete targets[to];
          removed++;
        }
      }
      if (Object.keys(targets).length === 0) delete m[from];
    }
    this._save();
    return removed;
  }

  /**
   * 完全清除某个神经元的所有连接
   */
  removeAll(id) {
    const m = this._load();
    let count = 0;
    // remove as source
    if (m[id]) {
      count += Object.keys(m[id]).length;
      delete m[id];
    }
    // remove as target
    for (const [from, targets] of Object.entries(m)) {
      if (targets[id] !== undefined) {
        delete targets[id];
        count++;
        if (Object.keys(targets).length === 0) delete m[from];
      }
    }
    this._save();
    return count;
  }

  /**
   * 获取所有与某神经元连接的神经元ID
   */
  getNeighbors(id) {
    const outgoing = this.getOutgoing(id).map(e => e.targetId);
    const incoming = this.getIncoming(id).map(e => e.sourceId);
    return [...new Set([...outgoing, ...incoming])];
  }

  stats() {
    const m = this._load();
    let totalEdges = 0;
    let totalWeight = 0;
    const sourceCount = Object.keys(m).length;
    const weightDistribution = {
      '0-0.2': 0,
      '0.2-0.4': 0,
      '0.4-0.6': 0,
      '0.6-0.8': 0,
      '0.8-1.0': 0,
    };
    for (const targets of Object.values(m)) {
      for (const w of Object.values(targets)) {
        totalEdges++;
        totalWeight += w;
        if (w <= 0.2) weightDistribution['0-0.2']++;
        else if (w <= 0.4) weightDistribution['0.2-0.4']++;
        else if (w <= 0.6) weightDistribution['0.4-0.6']++;
        else if (w <= 0.8) weightDistribution['0.6-0.8']++;
        else weightDistribution['0.8-1.0']++;
      }
    }
    return {
      sources: sourceCount,
      edges: totalEdges,
      avgWeight: totalEdges > 0 ? +(totalWeight / totalEdges).toFixed(4) : 0,
      density: totalEdges, // absolute count, density relative = edges / (n*(n-1))
      weightDistribution,
    };
  }
}

module.exports = SynapseMatrix;
