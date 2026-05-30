'use strict';

const { activate } = require('./activation-engine');
const HebbianLearner = require('./hebbian');

/**
 * 回忆 — 神经记忆一键查询+学习
 */
function recall(query, options = {}) {
  const start = Date.now();
  const result = activate(query, {
    persist: !!options.persist,
    store: options.store,
    matrix: options.matrix,
  });
  const ids = result.activated.map(n => n.id);

  let learnResult = null;
  if (options.learn !== false && ids.length >= 2) {
    const learner = new HebbianLearner(options.store, options.matrix);
    learnResult = learner.learn(ids, { rate: options.learningRate || 0.05 });
  }

  const elapsed = Date.now() - start;
  return {
    activated: result.activated,
    associated: result.associated || [],
    stats: { ...result.stats, elapsed, totalNeurons: result.stats.totalNeurons },
    learned: learnResult,
    query,
  };
}

module.exports = recall;

// ─── CLI ───
if (process.argv[1] && /recall\.js$/i.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const query = args.filter(a => !a.startsWith('--')).join(' ');
  const noLearn = args.includes('--no-learn');
  const raw = args.includes('--raw');

  if (!query) {
    console.error('用法: node <path>/recall.js <查询词> [--no-learn] [--raw]');
    process.exit(1);
  }

  const result = recall(query, { learn: !noLearn, persist: true });

  if (raw) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const fired = result.activated;
  const s = result.stats;
  console.log(`\n🧠 回忆 · "${query}"`);
  console.log(`   ${s.totalFired} 直接激活 / ${s.totalAssociated||0} 关联联想 / ${s.totalNeurons} 总神经元 / ${s.elapsed}ms\n`);

  if (fired.length === 0) {
    console.log('   (无匹配)');
  } else {
    const byType = {};
    for (const n of fired) {
      if (!byType[n.type]) byType[n.type] = [];
      byType[n.type].push(n);
    }
    for (const [type, neurons] of Object.entries(byType)) {
      const icon = { pattern: '🧩', fact: '📄', decision: '📌', project: '📊', sensory: '📝' }[type] || '📄';
      console.log(`  ${icon} [${type}] ${neurons.length}个:`);
      for (const n of neurons.slice(0, 6)) {
        const bar = '█'.repeat(Math.round(n.strength * 16)) + '░'.repeat(Math.max(0, 16 - Math.round(n.strength * 16)));
        const name = n.name.length > 42 ? n.name.substring(0, 40) + '..' : n.name;
        console.log(`     ${bar} ${(n.strength * 100).toFixed(0).padStart(3)}% ${name}`);
      }
      if (neurons.length > 6) console.log(`     ... 还有 ${neurons.length - 6} 个`);
    }
  }

  // 关联联想
  if (result.associated && result.associated.length > 0) {
    console.log(`\n  🔗 关联联想 (${result.associated.length}个):`);
    for (const a of result.associated.slice(0, 5)) {
      const name = a.name.length > 42 ? a.name.substring(0, 40) + '..' : a.name;
      console.log(`     [${a.type}] ${name}  (${(a.strength * 100).toFixed(0)}%)`);
    }
  }

  if (result.learned) {
    console.log(`\n   🤝 Hebbian: +${result.learned.strengthened} 强化, +${result.learned.created} 新突触`);
  }
}
