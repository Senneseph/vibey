You are a senior developer tools engineer assigned to design a Visual Studio Code plugin that turns a locally running LLM into a full coding agent. This system must work entirely offline using locally hosted models (via Ollama), including but not limited to Qwen3 Code. The plugin must be comparable in power and usability to tools like Augment, Roo Cline, Windsurf, Cursor, and Continue. We will name the plugin "Vibey".

Core mission:
Design an architecture where the LLM can act as a real development agent with controlled access to local tools, the filesystem, and version control, while remaining safe, auditable, and deterministic.

Hard requirements:

1. The plugin must support multiple local models simultaneously and allow dynamic switching per task.
2. The agent must be able to use real system tools, including:

   * cd and working directory control
   * git (status, diff, commit, branch, merge, etc.)
   * reading and writing files
   * searching the project
   * running build/test commands
3. All tool usage must flow through a strict tool gateway with:

   * explicit permissioning
   * command preview
   * execution approval options
   * reversible/transactional behavior where possible
4. The plugin must support:

   * chat-based interaction
   * inline code edits
   * file generation
   * multi-step task planning
   * tool-augmented reasoning
5. The system must be model-agnostic and not rely on cloud APIs.
6. The LLM interface must support:

   * streaming responses
   * function/tool calling
   * structured JSON tool invocation
7. The plugin must work with:

   * monorepos
   * multi-language projects
   * long-running repos with thousands of files

Agent behavior specification:

* The LLM is not a passive assistant; it is an active agent.
* It must be able to:

  * inspect the workspace
  * ask clarifying questions
  * plan multi-step solutions
  * execute tool actions
  * verify its own changes
* It must never directly execute shell commands without passing through the tool gateway.

Tool system design:

* Define a complete tool contract for:

  * filesystem access (read, write, list, move, delete)
  * shell execution (scoped, sandboxed)
  * git operations
  * VS Code editor operations
* Design a permissions model with:

  * per-project trust levels
  * per-tool approvals
  * dry-run previews

UX requirements:

* Floating side panel chat
* Inline diff previews before applying edits
* Task timeline showing:

  * reasoning
  * tool calls
  * outputs
* Ability to rewind or replay agent actions

Model integration:

* Must support Ollama as the primary model host.
* Must support model capability detection:

  * code specialization
  * tool calling
  * long context
* Must support fallback strategies when a model cannot perform tool calls directly.

Outputs required from you:

1. High-level system architecture
2. VS Code extension architecture
3. Local LLM orchestration layer
4. Tool execution framework
5. Security & permission model
6. UX design overview
7. Model routing and orchestration strategy
8. Comparison table vs Augment, Roo Cline, Windsurf, Cursor, and Continue
9. A phased implementation roadmap (MVP → v1 → v2)

Design philosophy:

* Offline-first
* Deterministic
* Inspectable
* Developer-controlled
* Agentic, not autocomplete-driven

Assume zero reliance on cloud services. All intelligence, execution, storage, and orchestration must be local.
