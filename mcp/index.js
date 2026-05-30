#!/usr/bin/env node
/**
 * Neural Memory MCP Server
 * 
 * Model Context Protocol server wrapping the neural memory system.
 * Enables any MCP client (Claude Desktop, Cursor, etc.) to:
 *   - search/activate memories
 *   - record new memories
 *   - get neuron details & system stats
 *   - run memory consolidation
 * 
 * Protocol: JSON-RPC 2.0 over stdio
 * Spec: https://modelcontextprotocol.io
 */
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// ── Resolve paths ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.NEURAL_MEMORY_DIR || path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'lib');
const NEURONS_DIR = path.join(ROOT, 'memory', 'neural', 'neurons');
const ARCHIVE_DIR = path.join(ROOT, 'memory', 'neural', 'archive');
const SYNAPSE_PATH = path.join(ROOT, 'memory', 'neural', 'synapses.json');
const CONFIG_PATH = path.join(ROOT, 'memory', 'neural', 'config.json');

// Dynamically import core modules
async function loadCore() {
  const NeuronStore = (await import(path.join(LIB_DIR, 'neuron-store.js'))).default;
  const SynapseMatrix = (await import(path.join(LIB_DIR, 'synapse-matrix.js'))).default;
  const { activate } = await import(path.join(LIB_DIR, 'activation-engine.js'));
  const HebbianLearner = (await import(path.join(LIB_DIR, 'hebbian.js'))).default;
  const Consolidator = (await import(path.join(LIB_DIR, 'consolidator.js'))).default;
  return { NeuronStore, SynapseMatrix, activate, HebbianLearner, Consolidator };
}

// ── JSON-RPC 2.0 helpers ──
function rpcError(id, code, message, data) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message, data } }) + '\n';
}
function rpcResult(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
}
function rpcNotification(method, params) {
  return JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
}

// ── MCP Server ──
async function main() {
  const core = await loadCore();
  const { NeuronStore, SynapseMatrix, activate, HebbianLearner, Consolidator } = core;

  // Ensure directories
  for (const dir of [NEURONS_DIR, ARCHIVE_DIR, path.dirname(SYNAPSE_PATH)]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // JSON-RPC message counter
  let msgId = 1;

  // Write to stdout (the MCP transport)
  function send(data) {
    process.stdout.write(data);
  }

  // Handle incoming JSON-RPC message
  async function handleMessage(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send(rpcError(null, -32700, 'Parse error'));
      return;
    }

    const { id, method, params } = msg;
    const isNotification = id === undefined || id === null;

    try {
      switch (method) {
        // ── Lifecycle ──
        case 'initialize': {
          const serverInfo = {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: 'neural-memory-mcp',
              version: '1.0.0',
            },
          };
          send(rpcResult(id, serverInfo));
          break;
        }

        case 'notifications/initialized': {
          // Acknowledged, no response needed for notifications
          break;
        }

        // ── Tools ──
        case 'tools/list': {
          const tools = [
            {
              name: 'search_memory',
              description: 'Search and activate memory neurons by query. Returns activated neurons and associated memories.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                  limit: { type: 'number', description: 'Max results (default: 10)', default: 10 },
                },
                required: ['query'],
              },
            },
            {
              name: 'record_memory',
              description: 'Record a new memory neuron. Auto-connects to related memories via Hebbian learning.',
              inputSchema: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'Neuron type: sensory/fact/decision/pattern/project', default: 'sensory' },
                  name: { type: 'string', description: 'Memory name/title' },
                  content: { type: 'string', description: 'Memory content/details' },
                  tags: { type: 'string', description: 'Comma-separated tags' },
                },
                required: ['name'],
              },
            },
            {
              name: 'get_neuron',
              description: 'Get details of a specific neuron by ID.',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Neuron ID (e.g., n_abc123def0)' },
                },
                required: ['id'],
              },
            },
            {
              name: 'get_stats',
              description: 'Get neural memory system statistics (neuron count, synapse count, type distribution).',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
            {
              name: 'list_neurons',
              description: 'List all neurons, optionally filtered by type.',
              inputSchema: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'Filter by type (sensory/fact/decision/pattern/project)' },
                },
              },
            },
            {
              name: 'consolidate',
              description: 'Run memory consolidation: synaptic decay, dormant archiving, orphan cleanup, pattern discovery.',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
          ];
          send(rpcResult(id, { tools }));
          break;
        }

        case 'tools/call': {
          const { name, arguments: args } = params || {};
          const store = new NeuronStore(NEURONS_DIR, ARCHIVE_DIR);
          const matrix = new SynapseMatrix(SYNAPSE_PATH);

          switch (name) {
            case 'search_memory': {
              const query = args?.query || '';
              const limit = args?.limit || 10;
              if (!query) {
                send(rpcError(id, -32000, 'Query is required'));
                break;
              }
              const result = activate(query, { persist: true });
              const activated = result.activated.slice(0, limit).map(n => ({
                id: n.id,
                type: n.type,
                name: n.name,
                content: n.content,
                tags: n.tags,
                strength: n.strength,
              }));
              const text = [
                `**Search results for:** "${query}"`,
                `Activated: ${result.activated.length} neurons | Total: ${result.stats.totalNeurons} | ${result.stats.elapsed || 'N/A'}ms`,
                '',
                ...activated.map((n, i) =>
                  `${i + 1}. [${n.type.toUpperCase()}] **${n.name}** (${(n.strength * 100).toFixed(0)}%)`
                ),
              ].join('\n');
              send(rpcResult(id, {
                content: [{ type: 'text', text }],
                data: { activated, associated: result.associated?.slice(0, 5) || [], stats: result.stats },
              }));
              break;
            }

            case 'record_memory': {
              const rType = args?.type || 'sensory';
              const rName = args?.name || 'untitled';
              const rContent = args?.content || rName;
              const rTags = (args?.tags || '').split(',').filter(Boolean);
              const neuron = store.create({ type: rType, name: rName, content: rContent, tags: [...rTags, rType], source: 'mcp' });
              // Auto-connect to related memories
              const searchResult = activate(rName + ' ' + (rTags.join(' ') || ''));
              const relatedIds = searchResult.activated.map(n => n.id).filter(id => id !== neuron.id).slice(0, 10);
              if (relatedIds.length > 0) {
                for (const rid of relatedIds) {
                  matrix.connectBidirectional(neuron.id, rid, 0.35);
                }
                new HebbianLearner(store, matrix).learn([neuron.id, ...relatedIds], { rate: 0.1 });
              }
              const text = [
                `✅ **Memory recorded**`,
                `ID: \`${neuron.id}\``,
                `Type: ${rType} | Name: ${rName}`,
                relatedIds.length > 0 ? `Auto-connected to ${relatedIds.length} related memories` : '',
              ].filter(Boolean).join('\n');
              send(rpcResult(id, {
                content: [{ type: 'text', text }],
                data: { neuron, connections: relatedIds.length },
              }));
              break;
            }

            case 'get_neuron': {
              const nId = args?.id;
              if (!nId) {
                send(rpcError(id, -32000, 'Neuron ID is required'));
                break;
              }
              const neuron = store.get(nId);
              if (!neuron) {
                send(rpcResult(id, {
                  content: [{ type: 'text', text: `Neuron \`${nId}\` not found.` }],
                  data: null,
                }));
                break;
              }
              const outgoing = matrix.getOutgoing(nId);
              const incoming = matrix.getIncoming(nId);
              const text = [
                `**Neuron:** ${neuron.name}`,
                `ID: \`${neuron.id}\``,
                `Type: ${neuron.type}`,
                `Content: ${neuron.content || '(empty)'}`,
                `Tags: ${(neuron.tags || []).join(', ') || '(none)'}`,
                `Threshold: ${neuron.threshold}`,
                `Activation Count: ${neuron.activationCount || 0}`,
                `Outgoing Synapses: ${outgoing.length}`,
                `Incoming Synapses: ${incoming.length}`,
              ].join('\n');
              send(rpcResult(id, {
                content: [{ type: 'text', text }],
                data: { neuron, outgoing: outgoing.slice(0, 10), incoming: incoming.slice(0, 10) },
              }));
              break;
            }

            case 'get_stats': {
              const nStats = store.stats();
              const sStats = matrix.stats();
              const archived = store.listArchived();
              const text = [
                '**📊 Neural Memory Statistics**',
                '', '--- Neurons ---',
                `Active: ${nStats.total}`,
                `Archived: ${nStats.archived}`,
                `By Type: ${Object.entries(nStats.byType).map(([k, v]) => `${k}=${v}`).join(', ')}`,
                `Total Activations: ${nStats.totalActivationCount || 0}`,
                '', '--- Synapses ---',
                `Sources: ${sStats.sources}`,
                `Edges: ${sStats.edges}`,
                `Average Weight: ${sStats.avgWeight}`,
              ].join('\n');
              send(rpcResult(id, {
                content: [{ type: 'text', text }],
                data: { neurons: nStats, synapses: sStats, archivedCount: archived.length },
              }));
              break;
            }

            case 'list_neurons': {
              const typeFilter = args?.type;
              const all = typeFilter ? store.findByType(typeFilter) : store.getAll();
              const archived = store.listArchived();
              const grouped = {};
              for (const n of all) {
                if (!grouped[n.type]) grouped[n.type] = [];
                grouped[n.type].push({ id: n.id, name: n.name });
              }
              const text = [
                `**Neurons:** ${all.length} active, ${archived.length} archived`,
                typeFilter ? `Filtered by type: ${typeFilter}` : '',
                '', ...Object.entries(grouped).flatMap(([type, neurons]) =>
                  [`[${type.toUpperCase()}] ${neurons.length}:`, ...neurons.map(n => `  • \`${n.id}\` ${n.name}`)]
                ),
              ].filter(Boolean).join('\n');
              send(rpcResult(id, {
                content: [{ type: 'text', text }],
                data: { active: all, archived },
              }));
              break;
            }

            case 'consolidate': {
              const consolidator = new Consolidator(store, matrix);
              const result = consolidator.consolidate();
              const r = result.report;
              const text = [
                '**🔄 Consolidation Complete**',
                '',
                `Synaptic Decay: ${r.synapticDecay.count} pruned (factor: ${r.synapticDecay.factor})`,
                `  Before: ${r.synapticDecay.beforeEdges} edges → After: ${r.synapticDecay.afterEdges} edges`,
                `Dormant Archiving: ${r.dormantArchived.archived} archived, ${r.dormantArchived.dormant} threshold increased`,
                `Orphan Cleanup: ${r.orphansRemoved.count} orphan synapses removed`,
                `Patterns Found: ${r.patternsFound.clustersFound} clusters`,
              ].join('\n');
              send(rpcResult(id, {
                content: [{ type: 'text', text }],
                data: result,
              }));
              break;
            }

            default:
              send(rpcError(id, -32601, `Tool not found: ${name}`));
          }
          break;
        }

        // ── Resources ──
        case 'resources/list': {
          const resources = [
            {
              uri: 'memory://neural/stats',
              name: 'System Statistics',
              description: 'Neural memory system overview statistics',
              mimeType: 'application/json',
            },
            {
              uri: 'memory://neural/neurons',
              name: 'All Neurons',
              description: 'List of all active neurons',
              mimeType: 'application/json',
            },
          ];
          send(rpcResult(id, { resources }));
          break;
        }

        case 'resources/read': {
          const uri = params?.uri;
          if (uri === 'memory://neural/stats') {
            const store = new NeuronStore(NEURONS_DIR, ARCHIVE_DIR);
            const matrix = new SynapseMatrix(SYNAPSE_PATH);
            const data = { neurons: store.stats(), synapses: matrix.stats() };
            send(rpcResult(id, {
              contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
            }));
          } else if (uri?.startsWith('memory://neural/neuron/')) {
            const nId = uri.split('/').pop();
            const store = new NeuronStore(NEURONS_DIR, ARCHIVE_DIR);
            const neuron = store.get(nId);
            if (!neuron) {
              send(rpcError(id, -32000, `Neuron not found: ${nId}`));
              break;
            }
            send(rpcResult(id, {
              contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(neuron, null, 2) }],
            }));
          } else if (uri === 'memory://neural/neurons') {
            const store = new NeuronStore(NEURONS_DIR, ARCHIVE_DIR);
            const all = store.getAll();
            send(rpcResult(id, {
              contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(all, null, 2) }],
            }));
          } else {
            send(rpcError(id, -32000, `Resource not found: ${uri}`));
          }
          break;
        }

        default:
          send(rpcError(id, -32601, `Method not found: ${method}`));
      }
    } catch (err) {
      send(rpcError(id, -32603, `Internal error: ${err.message}`));
    }
  }

  // ── Transport: read JSON-RPC from stdin, write to stdout ──
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    await handleMessage(line);
  }
}

main().catch(err => {
  console.error('Fatal MCP error:', err);
  process.exit(1);
});
