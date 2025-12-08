# VS Code Terminal Output Capture

## ✅ Problem Solved

The Vibey Terminal Manager now supports **programmatic output capture** using two methods:

### 1. Shell Integration API (Preferred - VS Code 1.93+)

When available, Vibey uses VS Code's `terminal.shellIntegration.executeCommand()` API which provides:
- Real-time output streaming
- Exit code capture
- Proper async/await support

This method is automatic when the terminal has shell integration enabled.

### 2. File-Based Redirection (Fallback)

For terminals without shell integration, Vibey uses shell-specific output redirection:
- **PowerShell**: `& { command } 2>&1 | Out-File -FilePath "temp.txt"`
- **Bash/Zsh/Sh**: `{ command; } > "temp.txt" 2>&1; echo $? > "exit.txt"`
- **CMD**: `(command) > "temp.txt" 2>&1 & echo %ERRORLEVEL% > "exit.txt"`

The manager polls for completion and reads the output from temporary files.

## Usage

```typescript
// Run command and capture output
const result = await terminalManager.runCommand('npm run build', {
    timeout: 60000  // 60 second timeout
});

console.log(result.output);      // Command output
console.log(result.exitCode);    // Exit code (0 = success)
console.log(result.captureMethod); // 'shell_integration' or 'file_redirect'

// Read last output from a terminal
const lastOutput = terminalManager.getLastOutput(terminalId);

// Get recent command outputs
const recent = terminalManager.getRecentOutputs(terminalId, 5);
```

## Tools Available

| Tool | Description |
|------|-------------|
| `terminal_run` | Run command and capture output |
| `terminal_read_output` | Read output from last command(s) |
| `terminal_history` | Get history with optional output |

## Configuration

Set `timeout` to control how long to wait for command completion (default: 30 seconds).

## Limitations

- Shell integration requires VS Code 1.93+ and a compatible shell
- File-based capture adds slight overhead (~100ms polling)
- Very long outputs may be truncated in history storage (10KB limit)