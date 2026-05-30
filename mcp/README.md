# 馃攲 Neural Memory MCP Server

[MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for the neural memory system.

Any MCP-compatible client (Claude Desktop, Cursor, VS Code AI, Continue.dev, etc.) can connect and access persistent neural memory.

## Quick Start

```bash
# Install globally
npm install -g neural-memory-mcp

# Run
neural-memory-mcp
```

Or run directly:
```bash
node index.js
```

## Configure in Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neural-memory": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/index.js"]
    }
  }
}
```

## Available Tools

| Tool | Description | Parameters |
|------|-------------|-----------|
| `search_memory` | Search and activate memory neurons | query (string), limit (number, optional) |
| `record_memory` | Record a new memory neuron | type (string), name (string), content (string), tags (string, optional) |
| `get_neuron` | Get neuron details by ID | id (string) |
| `get_stats` | Get system statistics | 鈥?|
| `list_neurons` | List all neurons, optional type filter | type (string, optional) |
| `consolidate` | Run memory consolidation | 鈥?|

## Available Resources

- `memory://neural/stats` 鈥?System statistics
- `memory://neural/neurons` 鈥?All neurons list
- `memory://neural/neuron/{id}` 鈥?Specific neuron

## Data Location

By default, data is stored at:
- `./memory/neural/neurons/` 鈥?Neuron files
- `./memory/neural/synapses.json` 鈥?Synapse matrix
- `./memory/neural/config.json` 鈥?Configuration

Override with `NEURAL_MEMORY_DIR` environment variable.

## Security

> 鈿狅笍 Neuron data files contain persistent memory that may include personal information. 
> Do not expose the MCP server to untrusted networks.
> Use authentication when running as HTTP service (main server.js).

## License

MIT

