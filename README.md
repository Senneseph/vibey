# Vibey: AI Coding Agent

**Vibey** is an advanced, offline-first AI coding agent for VS Code. It orchestrates local LLMs (via Ollama) and a suite of powerful tools to help you build, debug, and understand code autonomously.


## Features

- **Offline-First Intelligence**: Powered by local LLMs (Ollama), keeping your code private.
- **Autonomous Agents**: Vibey can plan, execute tools, and verify its own work.
- **Unified Chat & Tasks**: seamlessly switch between chat and structured task tracking.
- **Attention Management**: Advanced context management with checkpoint system to clear working context once items are completed.
- **Tool Ecosystem**:
    - **Filesystem**: Read, write, list files, and scan projects.
    - **Terminal**: Run commands, managing long-running processes (servers, watchers).
    - **Patching**: Apply unified diffs to modifying code safely.
    - **MCP Support**: Connect to Model Context Protocol servers for infinite extensibility.
    - **Browser Automation**: (Coming Soon) Control web browsers for testing.
- **Persistent Memory**: Chat history and task state are preserved across sessions.

## Getting Started

1.  **Install Ollama**: Ensure [Ollama](https://ollama.com) is installed and running.
2.  **Pull a Model**: Run `ollama pull qwen3-coder` (or your preferred model).
3.  **Select Model**: Use the command `Vibey: Select Model` to choose your LLM. Or click the cog icon in the top of the Vibey Chat pane.
4.  **Start Chatting**: Open the Vibey sidebar and ask away!

## Configuration

- `vibey.autoRunTools`: Allow trusted tools to run without approval (default: false).
- `vibey.mcpServers`: Configure external tools via MCP.

## License

MIT
