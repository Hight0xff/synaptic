# 🧠 neural-memory — OpenClaw Skill

## Overview

Neural memory system for OpenClaw agents. Provides neuron-based persistent memory with Hebbian learning, BFS activation propagation, and daily consolidation.

## Installation

```bash
openclaw skills install neural-memory
```

Or manual:
```bash
git clone https://github.com/Hight0xff/neural-memory-system.git
openclaw gateway restart
```

## Usage in Agent Context

Once installed, the neural memory system is available as an `@neural-memory` tool:

### Commands

```bash
# Search memory
node neural-memory/recall.js "your query"

# CLI management
node neural-memory/cli.js stats
node neural-memory/cli.js search "query"
node neural-memory/cli.js create fact "name" --content "content"
node neural-memory/cli.js record sensory "event" --content "detail"

# Start HTTP server (for visualization)
node neural-memory/server.js --port 3547 --auth-key your-key
```

### Integration with Agent Workflow

1. **Record** → agent records important conversations/decisions as neurons
2. **Search** → agent retrieves relevant past context before responding
3. **Learn** → Hebbian learning automatically strengthens co-activated connections
4. **Consolidate** → daily cron job decays weak connections, archives dormant neurons

### Data Location

- Neurons: `memory/neural/neurons/` (one JSON file per neuron)
- Synapses: `memory/neural/synapses.json`
- Config: `memory/neural/config.json`

> ⚠️ **Security**: Neuron data contains agent-personal memory. Ensure `.gitignore` excludes `memory/neural/` before committing to public repos.

## Dependencies

Zero. Pure Node.js standard library.

## Visualization

Open `vis.html` in a browser (requires HTTP server running).

## License

MIT
