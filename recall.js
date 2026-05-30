#!/usr/bin/env node
'use strict';

const SERVER_BASE = 'http://127.0.0.1:3547';

async function checkServer() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    const res = await fetch(SERVER_BASE + '/health', { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const query = args.filter(a => !a.startsWith('--')).join(' ');
  const noLearn = args.includes('--no-learn');
  const raw = args.includes('--raw');
  const useLocal = args.includes('--local');

  if (!query) {
    console.error('用法: node recall.js <查询词> [--no-learn] [--raw] [--local]');
    process.exit(1);
  }

  // Try server first
  if (!useLocal) {
    const serverOnline = await checkServer();
    if (serverOnline) {
      try {
        const res = await fetch(SERVER_BASE + '/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, persist: true, learn: !noLearn }),
        });
        const result = await res.json();

        if (raw) {
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        }

        const fired = result.activated;
        const s = result.stats;
        console.log(`\n🧠 回忆 · "${query}"`);
        console.log(`   ${fired.length} 直接激活 / ${(result.associated || []).length} 关联联想 / ${s.totalNeurons} 总神经元 / ${s.elapsed}ms\n`);

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
        return;
      } catch {
        // Server error, fall through to local
      }
    }
  }

  // Fallback: use local recall
  require('./lib/recall');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
