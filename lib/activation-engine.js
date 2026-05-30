'use strict';

const NeuronStore = require('./neuron-store');
const SynapseMatrix = require('./synapse-matrix');

const DEFAULT_CONFIG = {
  maxActivated: 20,
  maxPropagationDepth: 4,
  seedCutoff: 10,
  synapseJitterLow: 0.85,
  synapseJitterHigh: 1.0,
};

const STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could',
  'may', 'might', 'shall', 'should', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'and', 'but', 'or', 'nor', 'not', 'so',
  'yet', 'if', 'then', 'else', 'than', 'that', 'this', 'these', 'those',
  'it', 'its', 'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where',
]);

function tokenize(text) {
  // Split on whitespace and CJK characters
  const tokens = [];
  // Handle both whitespace-separated words and individual CJK characters
  const parts = text.toLowerCase().split(/[\s,，。．.！!？?；;：:""''（）()【】\[\]{}、/\\]+/);
  for (const part of parts) {
    if (!part) continue;
    // For CJK text, each character can be a separate token
    // But also try to match multi-character words
    if (/[\u4e00-\u9fff]/.test(part)) {
      // CJK substring extraction: bigrams + single chars
      for (let i = 0; i < part.length; i++) {
        const ch = part[i];
        if (/[\u4e00-\u9fff]/.test(ch) && !STOPWORDS.has(ch)) {
          tokens.push(ch);
        }
        if (i < part.length - 1) {
          const bigram = part.substring(i, i + 2);
          if (/[\u4e00-\u9fff]/.test(bigram[0]) && /[\u4e00-\u9fff]/.test(bigram[1])) {
            tokens.push(bigram);
          }
        }
      }
    } else {
      // Non-CJK: split by word boundaries
      const words = part.split(/[^a-z0-9+.-]+/).filter(w => w.length > 1 || /^[0-9]/.test(w));
      for (const w of words) {
        if (!STOPWORDS.has(w)) tokens.push(w);
      }
    }
  }
  return [...new Set(tokens)];
}

/**
 * 计算查询与神经元的信号强度 (0~1)
 */
function computeSignal(neuron, keywords, rawQuery) {
  let score = 0;
  const name = (neuron.name || '').toLowerCase();
  const content = (neuron.content || '').toLowerCase();
  const tags = (neuron.tags || []).map(t => t.toLowerCase());

  // 1. 精确名称匹配（最高权重）
  if (name === rawQuery.toLowerCase().trim()) {
    score += 0.5;
  }

  // 2. 名称包含关键词
  for (const kw of keywords) {
    if (name.includes(kw)) score += 0.25;
  }

  // 3. 标签匹配
  for (const kw of keywords) {
    for (const tag of tags) {
      if (tag.includes(kw) || kw.includes(tag)) {
        score += 0.2;
        break;
      }
    }
  }

  // 4. 内容关键词覆盖率
  const kwInContent = keywords.filter(kw => content.includes(kw));
  if (keywords.length > 0) {
    score += (kwInContent.length / keywords.length) * 0.35;
  }

  // 5. 多关键词命中提升：命中2个以上额外加成
  if (kwInContent.length >= 3) score += 0.15;
  else if (kwInContent.length >= 2) score += 0.08;

  // 6. 如果内容直接包含原始查询（或其核心部分）
  const queryClean = rawQuery.toLowerCase().trim();
  if (queryClean.length >= 4 && content.includes(queryClean)) {
    score += 0.3;
  }

  return Math.min(1, score);
}

/**
 * 前向传导 — 信号从种子神经元沿突触传播
 * 
 * @param {string} rawQuery - 用户查询
 * @param {Object} [options]
 * @param {number} [options.maxActivated] - 最大返回数
 * @param {number} [options.maxDepth] - BFS最大深度
 * @param {number} [options.seedCutoff] - 种子选择阈值（取top N）
 * @param {boolean} [options.persist] - 是否持久化激活次数和时间（默认false，只有learn时写入）
 * @returns {{ activated: Array, stats: Object, seeds: number }}
 */
function activate(rawQuery, options = {}) {
  const store = options.store || new NeuronStore();
  const matrix = options.matrix || new SynapseMatrix();

  const config = { ...DEFAULT_CONFIG };
  if (options.maxActivated) config.maxActivated = options.maxActivated;
  if (options.maxDepth) config.maxPropagationDepth = options.maxDepth;
  if (options.seedCutoff) config.seedCutoff = options.seedCutoff;

  const allNeurons = store.getAll();
  if (allNeurons.length === 0) {
    return { activated: [], stats: { totalNeurons: 0, propagationDepth: 0, totalFired: 0 }, seeds: 0 };
  }

  const keywords = tokenize(rawQuery);
  if (keywords.length === 0) {
    // fallback: use raw query words
    keywords.push(...rawQuery.toLowerCase().split(/\s+/).filter(k => k.length > 1 && !STOPWORDS.has(k)));
  }

  // ─── Phase 1: Signal injection ───
  const signalMap = new Map(); // id → { signal, neuron }
  for (const neuron of allNeurons) {
    const signal = computeSignal(neuron, keywords, rawQuery);
    if (signal > 0.01) {
      signalMap.set(neuron.id, { signal, neuron });
    }
  }

  // Sort by signal descending for seed selection
  const sortedSignals = [...signalMap.entries()]
    .map(([id, v]) => ({ id, signal: v.signal, neuron: v.neuron }))
    .sort((a, b) => b.signal - a.signal);

  const seeds = sortedSignals.slice(0, config.seedCutoff);
  if (seeds.length === 0) {
    return { activated: [], stats: { totalNeurons: allNeurons.length, propagationDepth: 0, totalFired: 0 }, seeds: 0 };
  }

  // ─── Phase 2: BFS Propagation ───
  // Initialize activation potentials
  const potentials = new Map(); // id → { potential, depth, fired }
  for (const n of allNeurons) {
    potentials.set(n.id, { potential: 0, depth: 0, fired: false, visited: false });
  }

  // Queue for BFS
  const queue = [];
  const fired = [];

  // Inject seed signals
  for (const s of seeds) {
    const p = potentials.get(s.id);
    p.potential = s.signal;
    if (!p.visited) {
      p.visited = true;
      queue.push({ id: s.id, depth: 0 });
    }
  }

  // BFS
  while (queue.length > 0 && fired.length < config.maxActivated) {
    const { id, depth } = queue.shift();
    const p = potentials.get(id);
    if (p.fired) continue;

    const neuron = store.get(id);
    if (!neuron) continue;

    const threshold = neuron.threshold || 0.5;

    if (p.potential >= threshold) {
      // Fire!
      p.fired = true;
      neuron.activationPotential = p.potential;
      fired.push({ id, strength: +p.potential.toFixed(4), neuron });

      // Propagate to connected neurons
      if (depth < config.maxPropagationDepth) {
        const outgoing = matrix.getOutgoing(id);
        for (const syn of outgoing) {
          const targetP = potentials.get(syn.targetId);
          if (!targetP || targetP.fired) continue;

          const jitter = config.synapseJitterLow + Math.random() * (config.synapseJitterHigh - config.synapseJitterLow);
          const signal = p.potential * syn.weight * jitter;

          targetP.potential = Math.min(1.0, targetP.potential + signal);

          if (!targetP.visited) {
            targetP.visited = true;
            queue.push({ id: syn.targetId, depth: depth + 1 });
          }
        }
      }
    }
  }

  // Update activation counts and timestamps (only if persist requested)
  if (options.persist) {
    const now = new Date().toISOString();
    for (const f of fired) {
      const n = f.neuron;
      n.activationCount = (n.activationCount || 0) + 1;
      n.lastActivated = now;
      n.activationPotential = f.strength;
      store._save(n);
    }
    // Update activation potentials on non-fired touched neurons too
    for (const [id, p] of potentials) {
      if (!p.fired && p.potential > 0) {
        const n = store.get(id);
        if (n) {
          n.activationPotential = +p.potential.toFixed(4);
          store._save(n);
        }
      }
    }
  }

  // Sort fired by strength descending
  fired.sort((a, b) => b.strength - a.strength);

  const activated = fired.map(f => ({
    id: f.id,
    type: f.neuron.type,
    name: f.neuron.name,
    content: f.neuron.content,
    tags: f.neuron.tags,
    strength: f.strength,
    activationCount: f.neuron.activationCount || 0,
    lastActivated: f.neuron.lastActivated,
  }));

  // ─── Phase 3: 关联联想（收集已激活神经元的邻居） ───
  const firedIds = new Set(fired.map(f => f.id));
  const associated = [];
  const seenAssociated = new Set(firedIds);
  for (const f of fired) {
    const outgoing = matrix.getOutgoing(f.id);
    for (const syn of outgoing) {
      if (seenAssociated.has(syn.targetId)) continue;
      seenAssociated.add(syn.targetId);
      const targetNeuron = store.get(syn.targetId);
      if (!targetNeuron) continue;
      const assocStrength = f.strength * syn.weight * 0.6;
      if (assocStrength > 0.05) {
        associated.push({
          id: syn.targetId,
          type: targetNeuron.type,
          name: targetNeuron.name,
          content: targetNeuron.content,
          tags: targetNeuron.tags,
          strength: +assocStrength.toFixed(4),
          via: f.id,
          activationCount: targetNeuron.activationCount || 0,
          lastActivated: targetNeuron.lastActivated,
        });
      }
    }
  }
  associated.sort((a, b) => b.strength - a.strength);

  const maxDepth = fired.length > 0 ? Math.max(...fired.map(f => {
    const p = potentials.get(f.id);
    return p ? p.depth : 0;
  }), 0) : 0;

  return {
    activated,
    associated: associated.slice(0, 10),
    stats: {
      totalNeurons: allNeurons.length,
      propagationDepth: maxDepth,
      totalFired: fired.length,
      totalAssociated: associated.length,
      seedsUsed: seeds.length,
      keywordsFound: keywords.length,
    },
    seeds: seeds.length,
  };
}

module.exports = { activate, tokenize, computeSignal };
