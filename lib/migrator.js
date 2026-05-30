'use strict';

const fs = require('fs');
const path = require('path');
const NeuronStore = require('./neuron-store');
const SynapseMatrix = require('./synapse-matrix');

const WORKSPACE = path.resolve(__dirname, '../..');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const MEMORY_MD = path.join(WORKSPACE, 'MEMORY.md');

/**
 * 移殖器 v2 — 从现有记忆文件建立神经元
 *
 * 改进：
 * - 正确处理带 emoji 的章节标题
 * - 解析 markdown 链接
 * - 提取 patterns & lessons
 * - 提取公司战略 / 基础设施
 * - 基于共现建立初始突触
 */
class Migrator {
  constructor(store, matrix) {
    this.store = store || new NeuronStore();
    this.matrix = matrix || new SynapseMatrix();
    this._batch = [];
  }

  migrate() {
    console.log('🧠 迁移现有记忆 → 神经元 v2');
    const results = { fromMemoryMd: 0, fromDaily: 0, fromProjects: 0, fromDecisions: 0 };

    results.fromMemoryMd = this._migrateMemoryMd();
    console.log(`  ✓ MEMORY.md: ${results.fromMemoryMd} 个神经元`);

    results.fromDaily = this._migrateDaily();
    console.log(`  ✓ Daily 日志: ${results.fromDaily} 个神经元`);

    results.fromProjects = this._migrateProjects();
    console.log(`  ✓ 项目文件: ${results.fromProjects} 个神经元`);

    results.fromDecisions = this._migrateDecisions();
    console.log(`  ✓ 决策文件: ${results.fromDecisions} 个神经元`);

    const total = Object.values(results).reduce((s, v) => s + v, 0);
    const synStats = this.matrix.stats();
    console.log(`\n✅ 迁移完成: ${total} 神经元, ${synStats.edges} 突触`);
    return results;
  }

  // ─── MEMORY.md ───
  _migrateMemoryMd() {
    if (!fs.existsSync(MEMORY_MD)) return 0;
    const content = fs.readFileSync(MEMORY_MD, 'utf8');
    const sections = this._parseSections(content);
    let count = 0;

    for (const [sectionName, sectionLines] of Object.entries(sections)) {
      const sname = this._stripEmoji(sectionName).toLowerCase();
      const batch = [];

      // ── Active Projects table ──
      if (sname.includes('active projects')) {
        for (const line of sectionLines) {
          if (!line.startsWith('|') || line.includes('---')) continue;
          const cols = line.split('|').map(c => this._cleanMd(c.trim()));
          if (cols.length >= 4 && cols[1] && cols[1] !== '项目') {
            const id = this._create('project', cols[1],
              `状态: ${cols[3] || ''}`, ['project']);
            batch.push(id);
          }
        }
      }

      // ── Key People ──
      if (sname.includes('key people') || sname.includes('人物')) {
        for (const line of sectionLines) {
          if (!line.startsWith('|') || line.includes('---')) continue;
          const cols = line.split('|').map(c => this._cleanMd(c.trim()));
          if (cols.length >= 4 && cols[1] && cols[1] !== '人') {
            const id = this._create('fact', cols[1],
              cols[3] || '', ['people', cols[1].replace(/\s+/g, '_')]);
            batch.push(id);
          }
        }
      }

      // ── Recent Decisions table ──
      if (sname.includes('recent decisions') || sname.includes('决策')) {
        for (const line of sectionLines) {
          if (!line.startsWith('|') || line.includes('---')) continue;
          const cols = line.split('|').map(c => this._cleanMd(c.trim()));
          if (cols.length >= 4 && cols[2] && cols[2] !== '决策') {
            const fd = (cols[1] || '').trim();
            const desc = cols[2].trim();
            const id = this._create('decision', desc.substring(0, 48),
              `(${fd}) ${desc}`, ['decision', ...desc.split(/[\s,，/]+/)]);
            batch.push(id);
          }
        }
      }

      // ── Patterns & Lessons ──
      if (sname.includes('patterns') || sname.includes(' lessons') || sname.includes('经验')) {
        for (const line of sectionLines) {
          const m = line.match(/^-\s+\*{0,2}(.+?)\*{0,2}\s*(?:→|->|—)\s*(.+)/);
          if (m) {
            const title = this._cleanMd(m[1].trim());
            const desc = this._cleanMd(m[2].trim());
            const id = this._create('pattern', title.substring(0, 48),
              desc, ['pattern', ...title.split(/\s+/).filter(w => w.length > 2)]);
            batch.push(id);
            continue;
          }
          // Fallback: - **Title** text (no arrow)
          const m2 = line.match(/^-\s+\*{0,2}(.+?)\*{0,2}\s{2,}(.+)/);
          if (m2 && m2[1].length > 6) {
            const title = this._cleanMd(m2[1].trim());
            const rest = this._cleanMd(m2[2].trim());
            if (rest.length > 5 && !rest.startsWith('`')) {
              const id = this._create('pattern', title.substring(0, 48),
                rest, ['pattern']);
              batch.push(id);
            }
          }
        }
      }

      // ── 公司战略 ──
      if (sname.includes('战略') || sname.includes('strategy')) {
        for (const line of sectionLines) {
          const m = line.match(/^-\s+(.+)/);
          if (m) {
            const txt = this._cleanMd(m[1].trim());
            if (txt.length > 4) {
              const id = this._create('fact', txt.substring(0, 48),
                txt, ['strategy']);
              batch.push(id);
            }
          }
        }
      }

      // ── 基础设施 ──
      if (sname.includes('基础设施') || sname.includes('infrastructure')) {
        for (const line of sectionLines) {
          const m = line.match(/^-\s+(.+)/);
          if (m) {
            const txt = this._cleanMd(m[1].trim());
            if (txt.length > 8) {
              const id = this._create('fact', txt.substring(0, 48),
                txt, ['infrastructure']);
              batch.push(id);
            }
          }
        }
      }

      // 同一批内的神经元建立连接
      if (batch.length >= 2) {
        for (let i = 0; i < batch.length; i++) {
          for (let j = i + 1; j < batch.length; j++) {
            this.matrix.connectBidirectional(batch[i], batch[j], 0.5);
          }
        }
      }
      count += batch.length;
    }
    return count;
  }

  _parseSections(content) {
    const lines = content.split('\n');
    const sections = {};
    let cur = '__top__';
    sections[cur] = [];
    for (const line of lines) {
      if (line.startsWith('## ')) {
        cur = line.slice(3).trim();
        sections[cur] = [];
      } else {
        (sections[cur] || (sections[cur] = [])).push(line);
      }
    }
    return sections;
  }

  _stripEmoji(s) {
    // Remove common emoji ranges
    return s.replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2000}-\u{2FFF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // variation selectors
      .replace(/[\u{2702}-\u{27B0}]/gu, '')
      .trim();
  }

  _cleanMd(text) {
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) → text
      .replace(/\*{1,2}/g, '')                    // **bold** / *italic*
      .replace(/`([^`]+)`/g, '$1')                // `code`
      .trim();
  }

  // ─── Daily logs ───
  _migrateDaily() {
    const dir = path.join(MEMORY_DIR, 'daily');
    if (!fs.existsSync(dir)) return 0;
    let count = 0, total = 0;

    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
      if (total > 400) break;
      const date = file.replace('.md', '');
      let content;
      try { content = fs.readFileSync(path.join(dir, file), 'utf8'); } catch (_) { continue; }

      const batch = [];
      for (const line of content.split('\n')) {
        const m = line.match(/^[-*]\s+(.+)/);
        if (!m) continue;
        let text = this._cleanMd(m[1].trim());
        if (text.length < 8 || text.startsWith('```')) continue;

        const isDecision = /决定|选择|放弃|确认|结论|可知|因此|问题/.test(text);
        const id = this._create(isDecision ? 'decision' : 'sensory',
          text.substring(0, 48), `${date}: ${text}`,
          [isDecision ? 'decision' : 'sensory', date], `daily/${file}`);
        batch.push(id);
        count++;
        total++;
      }

      if (batch.length >= 2) {
        for (let i = 0; i < batch.length; i++) {
          for (let j = i + 1; j < batch.length; j++) {
            this.matrix.connectBidirectional(batch[i], batch[j], 0.35);
          }
        }
      }
    }
    return count;
  }

  _migrateProjects() { return this._migrateDir('projects', 'project'); }
  _migrateDecisions() { return this._migrateDir('decisions', 'decision'); }

  _migrateDir(subdir, type) {
    const dir = path.join(MEMORY_DIR, subdir);
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      let content = '';
      try { content = fs.readFileSync(path.join(dir, file), 'utf8').substring(0, 400); } catch (_) { continue; }
      const name = file.replace('.md', '');
      this._create(type, name, content.split('\n')[0].replace(/^#\s+/, '').trim() || content.substring(0, 100),
        [type, name], `${subdir}/${file}`);
      count++;
    }
    return count;
  }

  _create(type, name, content, tags, source = '') {
    const n = this.store.create({
      type,
      name: name || '(untitled)',
      content: content || name || '',
      tags: tags || [],
      threshold: type === 'pattern' ? 0.28 : type === 'fact' ? 0.32 : type === 'decision' ? 0.38 : type === 'project' ? 0.40 : 0.48,
      source,
    });
    return n.id;
  }
}

module.exports = Migrator;
