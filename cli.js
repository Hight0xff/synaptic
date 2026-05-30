#!/usr/bin/env node
'use strict';

const NeuronStore = require('./lib/neuron-store');
const SynapseMatrix = require('./lib/synapse-matrix');
const { activate } = require('./lib/activation-engine');
const HebbianLearner = require('./lib/hebbian');
const Consolidator = require('./lib/consolidator');
const Migrator = require('./lib/migrator');
const fs = require('fs');
const path = require('path');

const SERVER_BASE = 'http://127.0.0.1:3547';

function printHelp() {
  console.log(`
🧠 终光·神经记忆系统 CLI

用法:
  node cli.js <命令> [选项]

命令:
  search <查询词>      激活搜索并展示结果（含关联联想）
  create <类型> <名称>  创建新神经元
  record <类型> <名称>  记录事件并自动连接相关记忆（自举用）
  list [类型]          列出所有神经元（可按类型筛选）
  show <id>            查看神经元详情
  connect <A> <B>      建立双向突触连接
  disconnect <A> <B>   移除突触连接
  delete <id>          删除神经元
  learn <id1,id2,...>  Hebbian 学习（共激活强化）
  consolidate          运行记忆巩固（睡眠处理）
  migrate              从现有记忆文件迁移
  stats                系统统计
  neighbors <id>       查看神经元邻居
  history <id>         查看神经元历史和连接

选项:
  --json                以 JSON 格式输出（用于程序消费）
  --local               强制走本地模式（不尝试连接服务）
  --content <文本>      create 时传入内容
  --tags <tag1,tag2>    create 时传入标签
  --weight <0~1>        connect 时指定权重
  --rate <0~1>          learn 时指定学习率

示例:
  node cli.js search "甲醇手续费"
  node cli.js create fact "甲醇期权手续费" --content "2元/手" --tags "甲醇,期权,手续费"
  node cli.js learn "n_abc123,n_def456" --rate 0.15
  node cli.js consolidate
  node cli.js migrate
`);
}

/**
 * Check if the neural memory server is running.
 */
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

/**
 * Forward a request to the neural memory server.
 */
async function serverFetch(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(SERVER_BASE + path, opts);
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0];
  const isJson = args.includes('--json');
  const useLocal = args.includes('--local');

  // Check if server is available (skip for --local)
  const serverAvailable = useLocal ? false : await checkServer();

  // Parse key-value options
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--') && !args[i].startsWith('--json') && !args[i].startsWith('--local')) {
      const key = args[i].replace('--', '');
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[key] = args[i + 1];
        i++;
      }
    }
  }

  // Extract positional arguments (non-flag args after command)
  const posArgs = args.slice(1).filter(a => !a.startsWith('--'));
  // Remove option values from posArgs
  const optionKeys = new Set(Object.keys(options));
  const filtered = [];
  for (let i = 0; i < posArgs.length; i++) {
    if (optionKeys.has(posArgs[i])) {
      i++; // skip value
    } else {
      filtered.push(posArgs[i]);
    }
  }

  const store = new NeuronStore();
  const matrix = new SynapseMatrix();

  switch (command) {

    // ─── search / activate ───
    case 'search':
    case 'activate': {
      const query = filtered.join(' ') || options.query;
      if (!query) { console.error('❌ 需要查询词'); process.exit(1); }

      let result;
      if (serverAvailable) {
        result = await serverFetch('POST', '/search', { query, persist: true, learn: false });
      } else {
        result = activate(query, { persist: true });
      }

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n🧠 神经记忆激活 — "${query}"`);
      console.log('━'.repeat(40));
      if (result.activated.length === 0) {
        console.log('  (无匹配神经元)');
      } else {
        console.log(`  🏆 已激活 ${result.activated.length} 个神经元:\n`);
        for (const n of result.activated.slice(0, 15)) {
          const typeIcon = { fact: '📄', decision: '📌', pattern: '🧩', project: '📊', sensory: '📝' }[n.type] || '📄';
          const name = n.name.length > 40 ? n.name.substring(0, 38) + '..' : n.name;
          const strengthBar = '█'.repeat(Math.round(n.strength * 20)) + '░'.repeat(Math.max(0, 20 - Math.round(n.strength * 20)));
          console.log(`  ${typeIcon} [${n.type}]`.padEnd(12) + ` ${name}`.padEnd(42) + ` ${strengthBar} ${(n.strength * 100).toFixed(0)}%`);
        }
        if (result.activated.length > 15) console.log(`  ... 还有 ${result.activated.length - 15} 个`);

        // 关联联想
        if (result.associated && result.associated.length > 0) {
          console.log(`\n  🔗 关联联想 (${result.associated.length}个):`);
          for (const a of result.associated.slice(0, 5)) {
            const name = a.name.length > 40 ? a.name.substring(0, 38) + '..' : a.name;
            console.log(`     [${a.type}] ${name}  (${(a.strength * 100).toFixed(0)}%)`);
          }
        }
      }
      console.log(`\n  📊 ${result.stats.totalNeurons || result.stats.totalNeurons} 总神经元, ${result.stats.seedsUsed} 种子, ${result.stats.totalAssociated||0} 关联`);
      break;
    }

    // ─── create ───
    case 'create': {
      const type = filtered[0];
      const name = filtered[1] || options.name;
      const content = options.content || '';
      const tags = (options.tags || '').split(',').filter(Boolean);

      if (!type || !name) { console.error('❌ 需要 type 和 name'); process.exit(1); }

      let neuron;
      if (serverAvailable) {
        neuron = await serverFetch('POST', '/create', { type, name, content, tags });
      } else {
        neuron = store.create({ type, name, content, tags, source: 'cli' });
      }
      if (isJson) {
        console.log(JSON.stringify(neuron, null, 2));
      } else {
        const dedup = neuron._dedup ? ' (已存在，跳过)' : '';
        console.log(`✅ 创建神经元: ${neuron.id} [${type}] ${name}${dedup}`);
      }
      break;
    }

    // ─── record（自举：创建神经元 + 自动连接相关记忆） ───
    case 'record': {
      const rType = filtered[0] || 'sensory';
      const rName = filtered[1] || options.name || 'untitled';
      const rContent = options.content || rName;
      const rTags = (options.tags || '').split(',').filter(Boolean);

      if (serverAvailable) {
        const result = await serverFetch('POST', '/record', {
          type: rType,
          name: rName,
          content: rContent + (options.task ? `\n任务: ${options.task}` : ''),
          tags: [...rTags, rType],
        });
        console.log(`✅ 记录神经元: ${result.neuron.id} [${rType}] ${rName}`);
        if (result.connections > 0) {
          console.log(`   🔗 已连接 ${result.connections} 个相关记忆`);
        }
      } else {
        const neuron = store.create({
          type: rType,
          name: rName,
          content: rContent + (options.task ? `\n任务: ${options.task}` : ''),
          tags: [...rTags, rType],
          source: 'record',
        });
        console.log(`✅ 记录神经元: ${neuron.id} [${rType}] ${rName}`);

        // 自动连接相关记忆
        const { activate } = require('./lib/activation-engine');
        const Hebbian = require('./lib/hebbian');
        const searchResult = activate(rName + ' ' + (rTags.join(' ') || ''));
        const relatedIds = searchResult.activated.map(n => n.id).filter(id => id !== neuron.id).slice(0, 10);
        if (relatedIds.length > 0) {
          for (const rid of relatedIds) {
            matrix.connectBidirectional(neuron.id, rid, 0.35);
          }
          const hebb = new Hebbian(store, matrix);
          hebb.learn([neuron.id, ...relatedIds], { rate: 0.1 });
          console.log(`   🔗 已连接 ${relatedIds.length} 个相关记忆`);
        }
      }
      break;
    }

    // ─── list ───
    case 'list': {
      const typeFilter = filtered[0];
      const all = typeFilter ? store.findByType(typeFilter) : store.getAll();
      const archived = store.listArchived();

      if (isJson) {
        console.log(JSON.stringify({ active: all, archived }, null, 2));
        return;
      }

      console.log(`\n📋 神经元列表 (${all.length} 活跃, ${archived.length} 存档)`);
      console.log('━'.repeat(50));
      const byType = {};
      for (const n of all) {
        if (!byType[n.type]) byType[n.type] = [];
        byType[n.type].push(n);
      }
      for (const [type, neurons] of Object.entries(byType)) {
        console.log(`\n  [${type}] ${neurons.length}个:`);
        for (const n of neurons) {
          const aCount = n.activationCount || 0;
          const last = n.lastActivated ? new Date(n.lastActivated).toLocaleDateString('zh-CN') : '从未';
          const name = n.name.length > 45 ? n.name.substring(0, 43) + '..' : n.name;
          console.log(`    ${n.id}  ${name.padEnd(47)} 激活${aCount}次 最后:${last}`);
        }
      }
      break;
    }

    // ─── show ───
    case 'show': {
      const id = filtered[0];
      if (!id) { console.error('❌ 需要神经元ID'); process.exit(1); }
      const neuron = store.get(id);
      if (!neuron) { console.error('❌ 未找到'); process.exit(1); }

      if (isJson) {
        console.log(JSON.stringify(neuron, null, 2));
        return;
      }

      console.log(`\n🧬 神经元: ${neuron.id}`);
      console.log('━'.repeat(50));
      console.log(`  类型:     ${neuron.type}`);
      console.log(`  名称:     ${neuron.name}`);
      console.log(`  内容:     ${neuron.content}`);
      console.log(`  标签:     ${(neuron.tags || []).join(', ')}`);
      console.log(`  阈值:     ${neuron.threshold}`);
      console.log(`  激活:     ${neuron.activationCount} 次`);
      console.log(`  最后活跃: ${neuron.lastActivated || '从未'}`);
      console.log(`  创建:     ${neuron.created}`);
      console.log(`  来源:     ${neuron.source || '-'}`);

      // Show connections
      const outgoing = matrix.getOutgoing(id);
      const incoming = matrix.getIncoming(id);
      if (outgoing.length > 0) {
        console.log(`\n  → 传出连接 (${outgoing.length}):`);
        for (const s of outgoing.slice(0, 10)) {
          const target = store.get(s.targetId);
          const tName = target ? target.name.substring(0, 30) : '(已删除)';
          console.log(`    → ${s.targetId}  ${tName.padEnd(32)} ${(s.weight * 100).toFixed(0)}%`);
        }
      }
      if (incoming.length > 0) {
        console.log(`\n  ← 传入连接 (${incoming.length}):`);
        for (const s of incoming.slice(0, 10)) {
          const source = store.get(s.sourceId);
          const sName = source ? source.name.substring(0, 30) : '(已删除)';
          console.log(`    ← ${s.sourceId}  ${sName.padEnd(32)} ${(s.weight * 100).toFixed(0)}%`);
        }
      }
      break;
    }

    // ─── connect ───
    case 'connect': {
      const a = filtered[0], b = filtered[1];
      if (!a || !b) { console.error('❌ 需要两个神经元ID'); process.exit(1); }
      const weight = parseFloat(options.weight) || 0.5;
      matrix.connectBidirectional(a, b, weight);
      console.log(`✅ 双向连接: ${a} ↔ ${b} (${weight})`);
      break;
    }

    // ─── disconnect ───
    case 'disconnect': {
      const a = filtered[0], b = filtered[1];
      if (!a || !b) { console.error('❌ 需要两个神经元ID'); process.exit(1); }
      matrix.disconnect(a, b);
      matrix.disconnect(b, a);
      console.log(`✅ 已断开: ${a} ↔ ${b}`);
      break;
    }

    // ─── delete ───
    case 'delete': {
      const id = filtered[0];
      if (!id) { console.error('❌ 需要神经元ID'); process.exit(1); }
      const synRemoved = matrix.removeAll(id);
      const ok = store.delete(id);
      console.log(`✅ ${ok ? '已删除' : '未找到'} 神经元 ${id}, 清理 ${synRemoved} 条突触`);
      break;
    }

    // ─── learn ───
    case 'learn': {
      const idsStr = filtered[0] || options.ids;
      if (!idsStr) { console.error('❌ 需要共激活的神经元ID列表 (逗号分隔)'); process.exit(1); }
      const ids = idsStr.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length < 2) { console.error('❌ 至少需要2个神经元'); process.exit(1); }

      let result;
      if (serverAvailable) {
        result = await serverFetch('POST', '/learn', {
          ids,
          rate: parseFloat(options.rate) || 0.1,
        });
      } else {
        const learner = new HebbianLearner(store, matrix);
        result = learner.learn(ids, {
          rate: parseFloat(options.rate) || 0.1,
          updateTimestamps: true,
        });
      }

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`🧬 Hebbian 学习完成: 强化 ${result.strengthened} 条, 新增 ${result.created} 条突触`);
      break;
    }

    // ─── consolidate ───
    case 'consolidate': {
      let result;
      if (serverAvailable) {
        result = await serverFetch('POST', '/consolidate', {});
      } else {
        const consolidator = new Consolidator(store, matrix);
        result = consolidator.consolidate();
      }
      const r = result.report;

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n💤 记忆巩固完成`);
      console.log('━'.repeat(40));
      console.log(`  突触衰减:     ${r.synapticDecay.count} 条弱连接被修剪 (衰减因子 ${r.synapticDecay.factor})`);
      console.log(`  休眠归档:     ${r.dormantArchived.archived} 个归档, ${r.dormantArchived.dormant} 个标记休眠`);
      console.log(`  孤儿清理:     ${r.orphansRemoved.count} 条孤儿突触`);
      if (r.patternsFound.clustersFound > 0) {
        console.log(`  模式发现:     ${r.patternsFound.clustersFound} 个潜在模式簇:`);
        for (const c of r.patternsFound.clusters) {
          console.log(`    · ${c.neuronCount} 神经元群, 总激活 ${c.totalActivations} 次, 平均连接强度 ${(c.averageStrength * 100).toFixed(0)}%`);
          console.log(`      成员: ${c.neurons.map(n => n.name).join(', ')}`);
        }
      }
      console.log(`\n  📊 突触统计: ${r.synapticDecay.beforeEdges} → ${r.synapticDecay.afterEdges} 条`);
      break;
    }

    // ─── migrate ───
    case 'migrate': {
      const migrator = new Migrator(store, matrix);
      const result = migrator.migrate();
      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      }
      break;
    }

    // ─── stats ───
    case 'stats': {
      let result;
      if (serverAvailable) {
        result = await serverFetch('GET', '/stats');
      } else {
        const nStats = store.stats();
        const sStats = matrix.stats();
        result = { neurons: nStats, synapses: sStats };
      }
      const { neurons: nStats, synapses: sStats } = result;
      const archived = store.listArchived();

      if (isJson) {
        console.log(JSON.stringify({ neurons: nStats, synapses: sStats, archivedCount: archived.length }, null, 2));
        return;
      }

      console.log(`\n📊 神经记忆系统统计`);
      console.log('━'.repeat(40));
      console.log(`  🧬 神经元:    ${nStats.total} 活跃 + ${nStats.archived} 存档`);
      console.log(`     类型分布:  ${Object.entries(nStats.byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      console.log(`     总激活:    ${nStats.totalActivationCount} 次`);
      console.log(`  🔗 突触:      ${sStats.edges} 条 (${sStats.sources} 源节点)`);
      console.log(`     平均权重:  ${sStats.avgWeight}`);
      if (sStats.weightDistribution) {
        console.log(`     权重分布:  ${Object.entries(sStats.weightDistribution).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
      console.log(`     全连接率:  ${nStats.total > 1 ? (sStats.edges / (nStats.total * (nStats.total - 1)) * 100).toFixed(2) : 0}%`);
      break;
    }

    // ─── neighbors ───
    case 'neighbors': {
      const id = filtered[0];
      if (!id) { console.error('❌ 需要神经元ID'); process.exit(1); }
      const neuron = store.get(id);
      if (!neuron) { console.error('❌ 未找到'); process.exit(1); }

      const neighborIds = matrix.getNeighbors(id);
      const neighbors = store.findByIds(neighborIds);

      if (isJson) {
        console.log(JSON.stringify({ neuron: { id: neuron.id, name: neuron.name }, neighbors }, null, 2));
        return;
      }

      console.log(`\n🔗 ${neuron.name} 的神经连接`);
      console.log('━'.repeat(40));
      if (neighbors.length === 0) {
        console.log('  (无连接)');
      } else {
        for (const n of neighbors) {
          const wAB = matrix.getWeight(id, n.id);
          const wBA = matrix.getWeight(n.id, id);
          console.log(`  ${n.id}  ${n.name.padEnd(40)} →${(wAB * 100).toFixed(0)}%  ←${(wBA * 100).toFixed(0)}%  [${n.type}]`);
        }
      }
      break;
    }

    default:
      console.error(`❌ 未知命令: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
