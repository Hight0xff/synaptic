#!/usr/bin/env node
'use strict';
/**
 * 自指种子 — 让神经记忆系统知道自己
 */
const NeuronStore = require('./lib/neuron-store');
const SynapseMatrix = require('./lib/synapse-matrix');
const HebbianLearner = require('./lib/hebbian');

const store = new NeuronStore();
const matrix = new SynapseMatrix();
const hebb = new HebbianLearner(store, matrix);

const seeds = [
  // ── 项目 ──
  { type: 'project', name: '神经记忆系统', content: '类人神经记忆系统 v1.0，基于神经元+突触+Hebbian学习的持续记忆架构。184→231神经元，12164→12610突触。2026-05-30搭建。', tags: ['project', 'neural-memory'], threshold: 0.40 },

  // ── 事实 ──
  { type: 'fact', name: '神经记忆系统架构', content: '3层：NeuronStore(神经元CRUD) + SynapseMatrix(有向加权突触) + ActivationEngine(BFS信号传播)。独立目录: neural-memory/lib/', tags: ['fact', 'neural-memory', '架构'], threshold: 0.32 },
  { type: 'fact', name: '神经记忆系统数据类型', content: '5种神经元: sensory(日志), pattern(规律), fact(事实), decision(决策), project(项目)。存储: memory/neural/neurons/', tags: ['fact', 'neural-memory', '类型'], threshold: 0.32 },
  { type: 'fact', name: '神经记忆系统使用入口', content: 'recall模块: node neural-memory/recall.js <查询>。CLI: node neural-memory/cli.js search/list/show/stats。每次查询触发Hebbian学习。', tags: ['fact', 'neural-memory', '使用'], threshold: 0.32 },
  { type: 'fact', name: '神经记忆系统学习机制', content: 'Hebbian: "fire together, wire together"。每次recall自动强化共激活连接+0.05*(1-weight)。权重累积从0.15→0.21，随使用持续增长。', tags: ['fact', 'neural-memory', '学习'], threshold: 0.32 },
  { type: 'fact', name: '睡眠巩固 cron', content: '每日凌晨3点 consolidation: 突触衰减(0.995)、休眠归档(30天)、感官过滤(7天)、孤儿清理、模式发现。auto_destroy agentTurn。', tags: ['fact', 'neural-memory', '巩固'], threshold: 0.32 },

  // ── 决策 ──
  { type: 'decision', name: '神经记忆系统设计决策：文件即神经元', content: '每个神经元独立JSON文件，非数据库。简单可靠，可git追踪，与现有memory/目录兼容。', tags: ['decision', 'neural-memory'], threshold: 0.38 },
  { type: 'decision', name: '神经记忆系统设计决策：BFS传播', content: '信号注入→阈值判断→BFS传播→关联联想。用关键词匹配而非embedding，轻量快速(555ms/次)，无需外部依赖。', tags: ['decision', 'neural-memory'], threshold: 0.38 },
  { type: 'decision', name: '神经记忆系统设计决策：自举钩子', content: 'record命令创建+自动连接相关记忆。recall自动Hebbian学习。确保系统每次使用都在强化自身。', tags: ['decision', 'neural-memory'], threshold: 0.38 },

  // ── 模式 ──
  { type: 'pattern', name: '记忆即网络而非仓库', content: '有效记忆不是堆数据，是靠关联网络"长出来"的。信息要连接才有意义。', tags: ['pattern', 'neural-memory'], threshold: 0.28 },
  { type: 'pattern', name: '使用频率决定记忆强度', content: '高频访问的记忆自动强化(权重↑ 阈值↓)，低频自然遗忘→归档。与生物记忆一致。', tags: ['pattern', 'neural-memory'], threshold: 0.28 },
  { type: 'pattern', name: '传播深度受权重制约', content: '当前平均权重0.21，2跳传播需积累。随使用增加权重后传播自然加深，不可强求。', tags: ['pattern', 'neural-memory'], threshold: 0.28 },
];

console.log('🧠 写入自指神经元...\n');
const ids = [];
for (const s of seeds) {
  const n = store.create(s);
  ids.push(n.id);
  console.log(`  ${n.id} [${s.type}] ${s.name}`);
}

// 连接种子间关系
console.log('\n🔗 建立自指神经元间连接...');
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    matrix.connectBidirectional(ids[i], ids[j], 0.6);
  }
}

// 搜索已有相关神经元并连接
console.log('\n🔗 关联到现有知识...');
const { activate } = require('./lib/activation-engine');
const searchTerms = ['记忆操作标配', '记忆', '系统', '架构'];
for (const term of searchTerms) {
  const result = activate(term);
  const relatedIds = result.activated.map(n => n.id).filter(id => !ids.includes(id)).slice(0, 8);
  for (const nid of ids) {
    for (const rid of relatedIds) {
      matrix.connectBidirectional(nid, rid, 0.35);
    }
  }
  if (relatedIds.length > 0) {
    console.log(`  "${term}" → ${relatedIds.length} 个已有神经元关联`);
  }
}

// Hebbian 强化
hebb.learn(ids, { rate: 0.2 });
console.log(`\n✅ 自指种子完成: ${ids.length} 神经元, 强连接 0.6`);

const stats = store.stats();
console.log(`   系统总计: ${stats.total} 神经元`);
