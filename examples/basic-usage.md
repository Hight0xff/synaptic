# Basic Usage Examples

## 1. CLI — Quick Search

```bash
# Search your memory
node cli.js search "what did I learn about neural networks"

# Output:
# Activated: 5 neurons
# Stats: 243 total, 320ms
```

## 2. CLI — Record New Memory

```bash
# Record a fact
node cli.js record fact "MCP protocol uses JSON-RPC 2.0" --content "Model Context Protocol uses stdio-based JSON-RPC 2.0 transport" --tags "mcp,protocol"

# Output:
# Recorded: n_abc123def0
# Connected to 3 related memories
```

## 3. HTTP Server — Visualize

```bash
# Start server
node server.js --port 3547 --auth-key mykey

# Then open http://localhost:3547 in browser
# You'll see the D3 force-directed graph of your neural network
```

## 4. MCP — With Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neural-memory": {
      "command": "node",
      "args": ["/path/to/neural-memory-system/mcp/index.js"]
    }
  }
}
```

Then in Claude Desktop, ask:
- "Search my memory for project plans"
- "Record that I learned about MCP protocol"
- "Show me my memory statistics"

## 5. MCP — With Cursor

In Cursor settings → MCP Servers → Add:

```
Name: neural-memory
Type: command
Command: node /path/to/neural-memory-system/mcp/index.js
```

Then use `@neural-memory` in your Cursor chat.

## 6. MCP — With VS Code AI

In VS Code settings.json:

```json
{
  "github.copilot.mcpServers": {
    "neural-memory": {
      "command": "node",
      "args": ["/path/to/neural-memory-system/mcp/index.js"]
    }
  }
}
```
