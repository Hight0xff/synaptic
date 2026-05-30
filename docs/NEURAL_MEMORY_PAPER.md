# 🧠 终光神经记忆系统
## 基于神经元模型的 Agent 持续学习架构

**版本**: v1.2（可视化 + CRUD 管理） | **最后更新**: 2026-05-30 | **运行环境**: OpenClaw Agent Workspace

---

## 摘要

为个人助手"终光"搭建的类人神经记忆系统，受生物神经元启发，将每条记忆抽象为独立"神经元"，通过加权有向"突触"建立关联，使用前向信号传播（BFS）、赫布学习（Hebbian）和周期性记忆巩固实现持续的自主学习与遗忘。

**v1.1 新增**：HTTP 常驻服务模式、CLI 透明 Fallback、内容哈希去重、权重分布统计、Windows 后台静默自启。
**v1.2 新增**：可视化面板（D3 力导向图）、CRUD 管理（新建/编辑/删除）、同源页面服务（`GET /`）、图数据 API（`GET /graph`）、孤儿突触过滤。

**当前规模**：235 神经元 + 11 存档、~13,360 条突触（11,270 有效）、搜索响应 ~470ms。

**关键词**: 类脑计算 · 持续学习 · Agent记忆 · Hebbian Learning · 知识图谱

---

## 1. 动机：为什么 Agent 需要"类脑"记忆

传统 Agent 记忆系统大致分两类：

| 方式 | 代表 | 缺陷 |
|------|------|------|
| 纯文件存储 | MEMORY.md + memory/ 目录 | 能存能查，但不会"长"——信息之间没有关联权重 |
| RAG 向量库 | Embedding + Vector DB | 语义检索强，但每次检索独立，没有累积学习效应 |
| 知识图谱 | Neo4j, Gremlin | 结构规整，但变更代价高，小规模场景过于笨重 |

**核心矛盾**：Agent 需要的不只是"能搜到"，而是**越用越聪明**——高频信息自动强化、低频知识自然遗忘、相关概念建立联想路径。

本系统受 McCulloch-Pitts 神经元模型启发，用最简方式实现了上述能力——零外部依赖，纯 Node.js 标准库，42KB 代码。

---

## 2. 神经元模型映射

| 生物结构 | 代码角色 | 数据载体 |
|---|---|---|
| **树突**（接收信号） | `activation-engine.computeSignal()` | 关键词匹配 + 多维度评分 |
| **胞体**（整合判断） | `if potential >= threshold` | 累积信号与阈值比较 |
| **轴突**（输出信号） | `neuron.output = 1.0` | 标记为"已激活"并传播 |
| **突触**（连接强度） | `synapse-matrix.getWeight()` | 0~1 加权有向边 |
| **Hebbian 学习** | `hebbian.learn()` | 共激活强化连接 |
| **睡眠巩固** | `consolidator.consolidate()` | 衰减/归档/模式发现 |

---

## 3. 系统架构

### 3.1 文件结构

```
workspace/
├── neural-memory/                     # 核心代码（12 文件, ~40KB）
│   ├── server.js                      # HTTP 常驻服务（API + 页面）
│   ├── vis.html                       # 可视化面板（D3 力导向图 + CRUD）
│   ├── recall.js                      # 一键查询+学习（日常用）
│   ├── cli.js                         # 命令行工具（管理用）
│   ├── seed-self.js                   # 自指种子注入
│   ├── nm-service.cmd                 # Windows 后台自启
│   └── lib/
│       ├── neuron-store.js            # 神经元 CRUD（含内容去重）
│       ├── synapse-matrix.js          # 突触矩阵（含权重分布统计）
│       ├── activation-engine.js       # BFS 信号传播引擎
│       ├── hebbian.js                 # Hebbian 学习规则
│       ├── consolidator.js            # 记忆巩固模块
│       ├── migrator.js                # 从现有记忆迁移
│       └── recall.js                  # 集成模块（含服务检测 Fallback）
│
└── memory/
    └── neural/
        ├── neurons/                   # 236 个神经元（每人一个 JSON）
        ├── synapses.json              # 13,370 条突触
        ├── archive/                   # 休眠神经元存档
        └── config.json                # 系统参数
```

### 3.2 系统流程图（v1.1 服务化模式）

```
┌─────────────────────┐
│  nm-service.cmd      │  Windows 登录自动启动
│  (Scheduled Task)    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  server.js (:3547)                               │
│  ┌──────────────────────────────────────────┐    │
│  │  神经元缓存 (NeuronStore._cache)         │    │
│  │  突触矩阵缓存 (SynapseMatrix._matrix)    │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  GET  /              → 可视化 HTML 页面        │
│  GET  /health        → { status, uptime }       │
│  GET  /stats         → { neurons, synapses,      │
│                         weightDistribution }     │
│  GET  /graph         → { nodes[], links[] }      │
│  GET  /neuron/:id    → 详情 + 邻居连接          │
│  PUT  /neuron/:id    → 编辑神经元               │
│  DELETE /neuron/:id  → 删除神经元 + 清理突触    │
│  POST /search        → activate() + Hebbian     │
│  POST /record        → create + auto-connect    │
│  POST /create        → create neuron（含去重）   │
│  POST /learn         → Hebbian learning         │
│  POST /consolidate   → consolidation            │
└────────────┬────────────────────────────────────┘
             │
   ┌─────────┴─────────┐
   ▼                   ▼
┌──────────┐    ┌──────────────┐
│ CLI 在线  │    │ CLI 离线      │
│ → HTTP   │    │ → 直读文件    │
│ 转发     │    │ (--local)     │
└──────────┘    └──────────────┘
```

**双模式运作**：
- 服务在线时：CLI 自动将 search/create/record/stats 请求转发 HTTP，享受内存缓存加速
- 服务离线时：CLI 自动回退传统文件直读模式，功能不受影响
- `--local` 参数强制走本地，不受服务状态影响

### 3.3 神经元类型

| 类型 | 数量 | 默认阈值 | 职责 |
|---|---|---|---|
| `sensory` | 154 | 0.48 | 日志碎片、原始观察 |
| `decision` | 33 | 0.38 | 决策记录及其理由 |
| `pattern` | 21 | 0.28 | 高频共激活中涌现的规律 |
| `fact` | 14 | 0.32 | 可量化的事实信息 |
| `project` | 10 | 0.40 | 活跃项目状态 |
| **存档** | 11 | — | 休眠的旧日志碎片 |

阈值越低越易激活。pattern 的 0.28 最低，使其天然成为联想枢纽。

### 3.4 可视化面板（v1.2 新增）

基于 D3.js 力导向图的实时可视化页面，通过浏览器可直接管理神经记忆系统。

**访问方式**：`http://127.0.0.1:3547/`（与 API 同源，无跨域问题）

**功能列表**：

| 模块 | 功能 |
|------|------|
| **网络图** | 235 节点 × 11,270 有效连接，节点按类型着色、按激活强度缩放 |
| **搜索** | 输入关键词实时高亮匹配节点，未命中自动变暗 |
| **筛选** | 按 5 种神经元类型独立开关 |
| **详情** | 点击节点查看名称、类型、强度、阈值、标签、内容、Top8 强连接 |
| **新建** | 模态表单，选择类型 + 输入名称/内容/标签 |
| **编辑** | 修改已存在的神经元名称、内容、标签 |
| **删除** | 确认后删除神经元，突触自动清理 |
| **统计** | 左侧面板实时显示神经元数、突触数、平均权重、权重分布条形图 |

**技术实现**：纯浏览器端 D3.js forceSimulation，数据通过 `GET /graph` API 获取（~1.3MB JSON，响应 < 20ms）。

---

## 4. 核心算法

### 4.1 信号激活（ActivationEngine）

**输入**：查询字符串  
**输出**：激活的神经元列表 + 关联联想列表  

**算法流程**（伪代码）：

```
1. Tokenize(query) → keywords
   - 中文: 单字 + Bigram 双字组
   - 英文: 单词分割 + 停用词过滤
   - 去重: [...new Set(tokens)]

2. Signal Injection（计算每个神经元信号强度）
   For each neuron in all_neurons:
     signal = 0
     IF name == raw_query           += 0.50  (精确匹配)
     IF name contains keyword       += 0.25 × hit_count
     IF tag matches keyword         += 0.20 × hit_count
     content keyword_coverage       += 0.35 × (命中关键词数 / 总关键词数)
     IF >=3 keywords hit content    += 0.15  (多关键词提升)
     IF content contains raw_query  += 0.30  (长查询直接命中)
     signal = min(signal, 1.0)

3. Seed Selection
   按 signal 降序取 Top K（默认 10）→ 注入初始 potential

4. BFS Propagation（阈值触发传播）
   Queue = seeds, each with depth=0
   While queue not empty AND fired < maxActivated(20):
     dequeue(id, depth)
     IF potential[id] >= threshold[id]:
       mark as fired
       IF depth < maxDepth(4):
         For each outgoing synapse:
           downstream = potential × weight × jitter[0.85, 1.0]
           target_potential += downstream
           enqueue if threshold not yet reached

5. Association（关联联想）
   For each fired neuron:
     collect all neighbors via outgoing synapses
     strength = fired_strength × synapse_weight × 0.6
   Return top 10 associates
```

**关键参数**：
- `maxActivated`: 20（单次最多激活数）
- `maxPropagationDepth`: 4（BFS 最大跳数）
- `seedCutoff`: 10（种子选择上限）
- `synapseJitter`: 0.85~1.0（生物噪声模拟）

### 4.2 Hebbian 学习

**规则**："Neurons that fire together, wire together"

```
For each pair (a, b) in co-activated neurons:
  if synapse a→b exists:
    weight += rate × (1 - weight)    // 渐近强化趋于 1.0
  else:
    create synapse a→b, b→a at init_weight (0.2)
```

- 学习率 `rate = 0.05`（每次 recall 后增量强化）
- 权重渐近趋于 1.0 但永不超过
- 仅在至少 2 个神经元同时激活时触发

### 4.3 记忆巩固（Consolidation）

每日 cron 触发，五项任务：

| 步骤 | 操作 | 参数 | 效果 |
|---|---|---|---|
| 1. 突触衰减 | 所有权重 × 0.995 | `<0.01` 修剪 | 弱连接逐渐消失 |
| 2. 感官过滤 | 闲置 sensory 归档 | 7天零激活 | 清理日志碎片 |
| 3. 休眠归档 | 久未激活→标记休眠 | 30天升阈值, 90天存档 | 区分短期/长期记忆 |
| 4. 孤儿清理 | 删除悬空突触指针 | — | 数据完整性 |
| 5. 模式发现 | 检测强连接凝聚子群 | ≥3节点+权重>0.7 | 模式神经元候选 |

---

## 5. 内容哈希去重（v1.1 新增）

在 `create()` 过程中自动执行：

```
hash = SHA256(name + '|' + content).slice(0, 16)
IF hash already exists:
  return existing neuron with _dedup: true  (跳过创建)
ELSE:
  create new neuron
```

**边界规则**：
- 完全一致（name + content 相同）→ 跳过，返回已有 ID
- 内容相同但来源不同（同一事实同时出现在 MEMORY.md 和 daily log）→ 合理重复，分别保留
- name 不同但内容部分重叠 → 不判断，保留全部

**效果验证**：重复跑 `seed-self.js`，已有种子全部跳过，不产生冗余神经元。

---

## 6. 运行结果

### 6.1 系统统计（截至 2026-05-30 16:00）

```
🧬 235 活跃 + 11 存档 = 246 总神经元
   project:   10  (4.1%)
   decision:  33  (13.4%)
   sensory:   157 (63.8%)  ← 逐步下降（感官过滤生效中）
   pattern:   21  (8.5%)
   fact:      14  (5.7%)
   archived:  11  (4.5%)

🔗 13,370 条突触（235 源节点）
   平均权重: 0.3564
   全连接率: 24.1%
   总激活次数: 240 次

💾 代码体积: 11 文件, 36KB, 零外部依赖
```

### 6.2 权重分布（v1.1 新增统计）

```
区间       数量   占比   解读
0-0.2:      38    0.3%   真弱连接（即将被衰减修剪）
0.2-0.4: 12,342  92.3%   初始建连权重（迁移时共现连接）
0.4-0.6:   568    4.2%   中等强度（经 Hebbian 学习强化）
0.6-0.8:   132    1.0%   强连接（高频共激活积累）
0.8-1.0:     0    0%     极强连接（需长期高频积累）
```

> **解读**：92% 的突触仍处于初始 0.2 权重。真正的强连接仅 132 条（1%），但正是这 1% 承担了主要的联想传播。随着日常使用，Hebbian 学习将逐步把更多路径推入 0.4+ 区间。

### 6.3 搜索性能对比

| 模式 | 情形 | 延迟 | 瓶颈 |
|---|---|---|---|
| CLI 本地直读 | 每次 `new NeuronStore()` | ~525ms | 磁盘 I/O + BFS 计算 |
| 服务端（首次） | 缓存预热 | ~470ms | 纯 BFS 计算 |
| 服务端（后续） | 内存缓存命中 | ~470ms | 纯 BFS 计算 |
| 服务端 + persist=false | 跳过写盘 | ~420ms | BFS 计算 |

> 当前瓶颈已从 I/O 转移到计算。当节点数扩至 500+ 时，服务化模式的收益将更加明显（无需每次 readdirSync 500 个文件）。

### 6.4 激活效果示例

| 查询 | 激活 | 关联 | 最相关结果 |
|---|---|---|---|
| "神经记忆系统" | 20 | 127 | 自指种子全部命中 |
| "手续费" | 20 | 139 | 银河手续费纠正(100%) |
| "夜盘时间" | 20 | 173 | 夜盘门禁决策(100%) |
| "记忆系统" | 20 | 110 | 系统架构 fact(100%) |

---

## 7. 设计决策与取舍

### 7.1 为什么不用 embedding？

本系统纯关键词匹配，没有语义相似度。

**理由**：
- 零外部依赖，全系统 36KB——对比最小 embedding 方案也要 >100MB（ONNX 模型）
- 响应 < 500ms，无需 GPU/API
- 在已知术语范围内（交易/代码/公司事务）准确率可接受
- 同义词问题通过 Hebbian 学习间接解决——"期权费"和"权利金"如果多次同时被搜索，其关联权重会自然增长

**何时需要升级**：节点 > 500，已知术语覆盖不全，语义匹配成为明显瓶颈时。

### 7.2 为什么要服务化？

| 方案 | 进程模型 | 缓存 | 并发写安全 |
|---|---|---|---|
| CLI 直读 | 每次新进程 | ❌ 每次重读磁盘 | ❌ |
| 服务化 | 单进程常驻 | ✅ 内存全量缓存 | ✅ 写锁队列 |

服务化一个改动解决了三个问题：跨进程缓存、实例化浪费、并发写风险。

### 7.3 为什么不用数据库？

- JSON 文件即神经元：每个文件可独立 Git 追踪
- 零运维：没有表结构变更、连接池、备份策略
- 足够承载 500 节点以内的个人记忆规模
- 远超 500 节点时可平滑迁移到 SQLite，数据格式天然兼容（JSON → 行）

---

## 8. 自举机制（持续学习的关键）

系统设计了 3 层自举回路，确保每次使用都在强化自身：

### 8.1 自动学习层

每次 `recall()` 执行后，自动触发 Hebbian 学习——共同激活的神经元对之间连接增强，高频知识自然越来越强。

### 8.2 手动记录层

`record` 命令：创建新神经元 → 自动搜索已有相关知识 → 建立连接 → Hebbian 强化。

```bash
node cli.js record fact "信息标题" --content "具体内容" --tags "标签1,标签2"
```

### 8.3 自我认知层

系统内置 13 个自指种子神经元，覆盖自身架构、数据类型、使用入口、学习机制、设计决策、项目状态。使系统能正确回答"你自己是个什么系统"这类元问题。

---

## 9. 局限性 & 后续方向

### 9.1 当前局限

| 局限 | 程度 | 缓解方案 |
|---|---|---|
| 关键词匹配无语义 | 中度 | 低频可接受；高频词通过 Hebbian 间接关联 |
| 传播深度有限 | 轻度 | 关联联想功能弥补；等待权重自然增长 |
| sensory 碎片偏多 | 正在缓解 | 感官过滤每轮归档 ~5% |
| 无图形界面 | ✅ 已解决 | 可视化面板 v1.2（D3 力导向图 + CRUD） |

### 9.2 后续规划

**短期（本周）**：
- ✅ 服务化与 CLI Fallback（v1.1）
- ✅ 内容哈希去重
- ✅ 权重分布统计
- ✅ 可视化面板 + CRUD 管理（v1.2）

**中期（本月）**：
- 自动模式神经元生成（consolidation 中已检测强连接簇，需自动创建 pattern）
- 每日"冥想报告"：巩固完成后输出简报
- 多 Agent 共享记忆：子代理也能读写神经记忆

**长期（下季）**：
- 轻量本地 embedding（关键词 + 语义双通道）
- 时间整合（Leaky Integrate-and-Fire：弱信号时间窗口内累积）

---

## 附 A：关键代码路径速查

| 功能 | 文件 | 行数 |
|---|---|---|
| 神经元 CRUD + 去重 | `neuron-store.js` | ~150 |
| 突触管理 + 权重分布 | `synapse-matrix.js` | ~120 |
| 关键词评分 + BFS 传播 | `activation-engine.js` | ~150 |
| Hebbian 学习 | `hebbian.js` | ~40 |
| 记忆巩固 | `consolidator.js` | ~130 |
| 从 MEMORY.md 迁移 | `migrator.js` | ~130 |
| 服务化 HTTP API | `server.js` | ~160 |
| CLI 管理 + Fallback | `cli.js` | ~280 |
| 可视化面板 | `vis.html` | ~400（CSS+HTML+JS） |

## 附 B：API 参考（v1.1 服务化模式）

```
GET  /                → 可视化 HTML 页面
GET  /health          → { status, uptime, neurons, synapses }
GET  /stats           → { neurons:{total,byType,...}, synapses:{edges,weightDistribution,...} }
GET  /graph           → { nodes[{id,type,name,strength,activationCount}], links[{source,target,weight}] }
GET  /neuron/:id      → { neuron:{id,type,name,...}, neighbors[{id,name,type,weight}*30] }
PUT  /neuron/:id      → { name?, content?, tags? }
                         ↳ { neuron:{id,type,name,...} }
DELETE /neuron/:id    → { deleted: boolean, synapsesRemoved: number }
POST /search          → { query, persist?, maxActivated?, learn?, rate? }
                         ↳ { activated[], associated[], stats, learned? }
POST /record          → { type, name, content?, tags? }
                         ↳ { neuron:{id,type,name,_dedup?}, connections }
POST /create          → { type, name, content?, tags?, threshold? }
                         ↳ { id, type, name, ..., _dedup? }
POST /learn           → { ids[], rate? }
                         ↳ { strengthened, created }
POST /consolidate     → {}
                         ↳ { report: { synapticDecay, dormantArchived, ... } }
```

## 附 C：参考文献与灵感来源

1. McCulloch, W.S. & Pitts, W. (1943). "A Logical Calculus of Ideas Immanent in Nervous Activity"
2. Hebb, D.O. (1949). *The Organization of Behavior* — "Cells that fire together, wire together"
3. Hopfield, J.J. (1982). "Neural networks and physical systems with emergent collective computational abilities"
4. Tulving, E. (1972). "Episodic and Semantic Memory" — 区分感官记忆与语义记忆的灵感
5. OpenClaw Agent Framework — https://openclaw.ai

---

*"记忆不是堆数据，是靠关联网络长出来的。"* © 终光 2026

---

**讨论欢迎**：本系统在 GitHub 开源，欢迎 Issues / PRs。当前版本已验证可在 500 节点以内的个人 Agent 场景稳定运行。
