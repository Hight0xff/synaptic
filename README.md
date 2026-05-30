# 🧠 neural-memory — 类人神经记忆系统

> 基于神经元模型的 AI Agent 持续学习记忆架构  
> 零外部依赖 · 纯 Node.js 标准库 · 42KB

---

## 概述

将每条记忆抽象为独立「神经元」，通过加权有向「突触」建立关联，使用前向信号传播（BFS）、赫布学习（Hebbian）和周期性记忆巩固，实现可持续的自主学习与遗忘。

## 快速安装

```bash
# 通过 OpenClaw CLI 安装（推荐）
openclaw skills install neural-memory

# 或从 GitHub 手动安装
git clone https://github.com/Hight0xff/neural-memory-system.git
cd neural-memory-system
npm install  # 零依赖，仅建立软链接
```

安装后运行初始化：
```bash
node seed-self.js   # 创建自引用种子神经元
node cli.js stats   # 验证安装
```

## 架构

```
neural-memory/
├── lib/                        # 核心引擎
│   ├── neuron-store.js         # 神经元存储（文件系统）
│   ├── synapse-matrix.js       # 突触矩阵（加权有向图）
│   ├── activation-engine.js    # 前向信号传播（BFS）
│   ├── hebbian.js              # 赫布学习（共激活强化）
│   ├── consolidator.js         # 睡眠巩固（衰减/归档/模式发现）
│   ├── recall.js               # 统一召回接口
│   └── migrator.js             # 迁移工具（从 MEMORY.md 导入）
├── cli.js                      # 命令行管理工具
├── recall.js                   # 快速召回入口
├── server.js                   # HTTP API 服务（端口 3547）
├── seed-self.js                # 自引用种子初始化
├── install.js                  # 安装脚本
└── vis.html                    # D3 可视化面板
```

## CLI 使用

```bash
# 搜索/激活记忆
node cli.js search "你的查询"

# 记录新记忆
node cli.js record sensory "学习了新知识" --content "详细内容" --tags "tag1,tag2"

# 创建神经元
node cli.js create fact "事实名称" --content "事实内容"

# 查看系统统计
node cli.js stats

# 运行记忆巩固（衰减+归档）
node cli.js consolidate

# 列出记忆
node cli.js list [type]
```

## HTTP API 服务

```bash
node server.js --port 3547 --auth-key your-secret-key
```

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/recall?q=...` | GET | 召回搜索 |
| `/api/neuron/:id` | GET | 获取神经元详情 |
| `/api/neurons` | GET | 列出所有神经元 |
| `/api/create` | POST | 创建神经元 |
| `/api/stats` | GET | 系统统计 |
| `/api/consolidate` | POST | 触发巩固 |
| `/` | GET | 可视化面板 |

## MCP 协议支持

本系统同时提供 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 服务器，使任何兼容 MCP 的 AI 客户端（Claude Desktop、Cursor、VS Code AI 等）都能直接接入神经记忆。

```bash
# 启动 MCP 服务器
cd mcp && node index.js

# 或在 Claude Desktop 中配置：
# {
#   "mcpServers": {
#     "neural-memory": {
#       "command": "node",
#       "args": ["path/to/mcp/index.js"]
#     }
#   }
# }
```

MCP 提供以下工具：
- `search_memory` — 搜索激活记忆
- `record_memory` — 记录新记忆
- `get_neuron` — 获取神经元详情
- `get_stats` — 系统统计
- `consolidate` — 触发巩固
- *计划中*：`list_recent`、`delete_neuron`、`connect_neurons`

---

## 神经科学映射

| 生物结构 | 代码角色 | 实现 |
|---------|---------|------|
| 树突（接收信号） | `activation-engine.computeSignal()` | 关键词匹配 + 多维度评分 |
| 胞体（整合判断） | `if potential >= threshold` | 累积信号与阈值比较 |
| 轴突（输出信号） | `neuron.output = 1.0` | 标记激活并传播 |
| 突触（连接强度） | `synapse-matrix.getWeight()` | 0~1 加权有向边 |
| 赫布学习 | `hebbian.learn()` | 共激活强化连接 |
| 睡眠巩固 | `consolidator.consolidate()` | 衰减/归档/模式发现 |

---

## 🔒 敏感信息安全提示

> **部署前必读**：本系统在运行中会生成真实的对话/决策数据。

### ⚠️ 切勿提交到公开仓库的内容

1. **工作区数据**：`memory/neural/neurons/` 和 `memory/neural/archive/` 下的 JSON 文件包含实际对话记录和个人记忆
2. **突触数据**：`memory/neural/synapses.json` 包含关联权重图
3. **环境变量/密钥**：任何 `.env` 文件、API Key 和密码
4. **配置文件**：`config.json` 可能包含内网路径和服务配置

### 安全使用建议

- 运行 `git add` 前检查 `.gitignore` 是否正确配置
- 使用 `--auth-key` 参数保护 HTTP API 端点
- 定期清理过期的存档数据
- 在公共演示中使用 `seed-self.js` 生成的示例数据，而非真实数据

---

## License

MIT — 自由使用、修改、分发。欢迎 Star ⭐、Issue 💬、PR 🤝。
