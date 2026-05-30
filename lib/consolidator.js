'use strict';

const fs = require('fs');
const path = require('path');
const NeuronStore = require('./neuron-store');
const SynapseMatrix = require('./synapse-matrix');

const CONFIG_PATH = path.resolve(__dirname, '../../memory/neural/config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return { consolidation: {} };
  }
}

/**
 * 记忆巩固 — 相当于睡眠期间的记忆处理
 * 
 * 职责：
 * 1. 突触衰减 — 长期不激活的连接逐渐弱化
 * 2. 休眠归档 — 长时间未被激活的神经元移入存档
 * 3. 孤儿清理 — 移除指向已不存在神经元的突触
 * 4. 模式发现 — 检测高频共激活簇，建议生成模式神经元
 * 5. 报告生成 — 输出本次巩固的统计
 */
class Consolidator {
  constructor(store, matrix) {
    this.store = store || new NeuronStore();
    this.matrix = matrix || new SynapseMatrix();
    this.config = loadConfig();
    this.consCfg = this.config.consolidation || {};
  }

  /**
   * 执行一轮记忆巩固
   * @returns {{ report: Object }}
   */
  consolidate() {
    const report = {
      timestamp: new Date().toISOString(),
      synapticDecay: this._decaySynapses(),
      dormantArchived: this._archiveDormant(),
      sensoryFiltered: this._filterSensory(),
      orphansRemoved: this._removeOrphans(),
      patternsFound: this._findPatterns(),
    };
    report.total = Object.values(report).reduce((s, v) => {
      if (typeof v === 'object' && v.count !== undefined) {
        return s + v.count;
      }
      if (typeof v === 'number') return s + v;
      return s;
    }, 0);
    return { report };
  }

  /**
   * 1. 突触衰减：所有连接乘衰减因子
   */
  _decaySynapses() {
    const factor = this.consCfg.decayFactor || 0.995;
    const before = this.matrix.stats();
    const pruned = this.matrix.decayAll(factor);
    const after = this.matrix.stats();
    return {
      count: pruned,
      beforeEdges: before.edges,
      afterEdges: after.edges,
      factor,
    };
  }

  /**
   * 2. 休眠归档：检查所有神经元的 lastActivated
   *    - 超过 dormantDaysThreshold 未激活：降低阈值（标记休眠）
   *    - 超过 archiveDaysThreshold 未激活：移入存档
   */
  _archiveDormant() {
    const now = Date.now();
    const dormantDays = this.consCfg.dormantDaysThreshold || 30;
    const archiveDays = this.consCfg.archiveDaysThreshold || 90;
    const dormantMs = dormantDays * 86400000;
    const archiveMs = archiveDays * 86400000;

    const all = this.store.getAll();
    const archived = [];
    const dormant = [];

    for (const n of all) {
      const lastActive = n.lastActivated ? new Date(n.lastActivated).getTime() : 0;
      const age = now - lastActive;

      if (lastActive > 0 && age > archiveMs) {
        // 移入存档
        if (this.store.archive(n.id)) {
          archived.push(n.id);
        }
      } else if (lastActive > 0 && age > dormantMs) {
        // 标记为休眠（提高阈值使其更难激活）
        const newThreshold = Math.min(1, (n.threshold || 0.5) + 0.1);
        this.store.update(n.id, { threshold: newThreshold });
        dormant.push(n.id);
      }
    }

    return {
      archived: archived.length,
      dormant: dormant.length,
      archivedIds: archived,
    };
  }

  /**
   * 3. 感官过滤 — 清理低价值日志碎片
   */
  _filterSensory() {
    const all = this.store.getAll();
    const now = Date.now();
    const sevenDays = 7 * 86400000;
    let archived = 0;

    for (const n of all) {
      if (n.type !== 'sensory') continue;

      // 时间戳日志（"时间: xx:xx → xx:xx"）— 0信息价值
      if (/^时间:/.test(n.name) && (n.activationCount || 0) === 0) {
        if (this.store.archive(n.id)) archived++;
        continue;
      }

      // 从未激活且超过7天
      if ((n.activationCount || 0) === 0) {
        const created = new Date(n.created).getTime();
        if (now - created > sevenDays) {
          if (this.store.archive(n.id)) archived++;
        }
      }
    }
    return { count: archived };
  }

  /**
   * 4. 孤儿清理：移除指向已不存在神经元的突触
   */
  _removeOrphans() {
    const all = this.store.getAll();
    const validIds = all.map(n => n.id);

    // 也检查存档中的ID
    try {
      const archiveDir = path.resolve(__dirname, '../../memory/neural/archive');
      if (fs.existsSync(archiveDir)) {
        const archived = fs.readdirSync(archiveDir)
          .filter(f => f.endsWith('.json'))
          .map(f => f.replace('.json', ''));
        validIds.push(...archived);
      }
    } catch (_) { /* ignore */ }

    const removed = this.matrix.removeOrphans(validIds);
    return { count: removed };
  }

  /**
   * 4. 模式发现 — 检测高频共激活簇
   * 
   * 扫描突触矩阵，找强连接群落（权重 > 0.7 且双向连接）
   * 如果群落规模 >= patternEmergeMinNeurons，且群落内所有神经元
   * 都被激活超过 patternEmergeMinCoactivations 次，
   * 则产生一个"模式发现"建议
   */
  _findPatterns() {
    const minCoAct = this.consCfg.patternEmergeMinCoactivations || 5;
    const minNeurons = this.consCfg.patternEmergeMinNeurons || 3;

    const all = this.store.getAll();
    const stats = this.matrix.stats();

    // 用简单聚类找强连接群：基于双向强连接(>0.7)的贪心合并
    const strongPairs = [];
    for (const n of all) {
      const outgoing = this.matrix.getOutgoing(n.id);
      for (const syn of outgoing) {
        if (syn.weight >= 0.7) {
          // 检查是否有回边（双向强连接）
          const returnWeight = this.matrix.getWeight(syn.targetId, n.id);
          if (returnWeight >= 0.7) {
            strongPairs.push([n.id, syn.targetId]);
          }
        }
      }
    }

    // 合并聚类
    const clusters = [];
    const nodeToCluster = new Map();

    for (const [a, b] of strongPairs) {
      const ca = nodeToCluster.get(a);
      const cb = nodeToCluster.get(b);
      if (ca === undefined && cb === undefined) {
        const cluster = new Set([a, b]);
        clusters.push(cluster);
        nodeToCluster.set(a, cluster);
        nodeToCluster.set(b, cluster);
      } else if (ca !== undefined && cb === undefined) {
        ca.add(b);
        nodeToCluster.set(b, ca);
      } else if (ca === undefined && cb !== undefined) {
        cb.add(a);
        nodeToCluster.set(a, cb);
      } else if (ca !== cb) {
        // merge clusters
        for (const node of cb) {
          ca.add(node);
          nodeToCluster.set(node, ca);
        }
        const idx = clusters.indexOf(cb);
        if (idx >= 0) clusters.splice(idx, 1);
      }
    }

    // 筛选有意义的簇
    const meaningfulClusters = clusters
      .filter(c => c.size >= minNeurons)
      .map(cluster => {
        const neurons = [...cluster].map(id => this.store.get(id)).filter(Boolean);
        const allFiredEnough = neurons.every(n => (n.activationCount || 0) >= minCoAct);
        const totalActivations = neurons.reduce((s, n) => s + (n.activationCount || 0), 0);
        return {
          neuronCount: cluster.size,
          neurons: neurons.map(n => ({ id: n.id, name: n.name, type: n.type })),
          allFiredEnough,
          totalActivations,
          averageStrength: +neurons
            .map(n => this.matrix.getOutgoing(n.id))
            .flat()
            .filter(syn => cluster.has(syn.targetId))
            .reduce((s, syn) => s + syn.weight, 0) / (cluster.size * (cluster.size - 1) || 1),
        };
      })
      .filter(c => c.allFiredEnough);

    return {
      clustersFound: meaningfulClusters.length,
      clusters: meaningfulClusters,
    };
  }
}

module.exports = Consolidator;
