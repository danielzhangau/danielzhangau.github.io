---
title: "Claude Code Power User Guide: Hooks, MCP, Plugins, and the Configuration Stack That Actually Matters"
description: "A practical guide to configuring Claude Code for maximum productivity — covering the layered configuration architecture, hooks for 100% enforcement, MCP server integrations, plugin ecosystem, context management, and worktree-based parallel development."
pubDate: 2026-04-24
tags:
  [
    "Claude Code",
    "AI Tools",
    "Developer Productivity",
    "MCP",
    "Agentic AI",
    "Harness Engineering",
  ]
---

Most developers using Claude Code treat it like a smart chatbot in the terminal — ask questions, get code, copy-paste. That leaves most of its capability on the table.

Claude Code is not a chatbot. It is a **configurable agent runtime** with a layered architecture of hooks, permissions, MCP integrations, plugins, custom agents, and skills. The difference between a default install and a tuned setup is the difference between a junior developer who needs constant supervision and a senior engineer who operates autonomously within well-defined guardrails.

This post documents the configuration stack I built over several months of daily use, covering what each layer does, why it matters, and how to set it up. Everything here is from real usage — not documentation summaries.

## The Configuration Stack

Claude Code's configuration follows a clear hierarchy. Understanding this is the foundation for everything else:

| Layer | What It Does | Enforcement | Where It Lives |
| ----- | ------------ | ----------- | -------------- |
| **Deny rules** | Hard-block dangerous operations | 100% — cannot be overridden | `~/.claude/settings.json` |
| **Hooks** | Run scripts on lifecycle events | 100% — executes every time | `~/.claude/settings.json` + `~/.claude/hooks/` |
| **MCP Servers** | Connect external tools and data | On-demand | `~/.claude.json` or `.mcp.json` |
| **Plugins** | Packaged extensions with skills/hooks | On-demand | `~/.claude/settings.json` |
| **CLAUDE.md** | Natural language instructions | Probabilistic — high but not guaranteed | `~/.claude/CLAUDE.md` or project root |
| **Skills** | On-demand knowledge injection | When triggered | `.claude/skills/` |
| **Memory** | Cross-session persistent notes | Loaded at start | `~/.claude/projects/.../memory/` |

The critical insight: **CLAUDE.md is advice, hooks are law.** If you need something to happen every single time — formatting, safety checks, notifications — it belongs in a hook, not in CLAUDE.md.

## Hooks: The 100% Enforcement Layer

Hooks are shell scripts that execute on specific lifecycle events. They are the most underused and most powerful configuration mechanism in Claude Code.

### Key Hook Events

The most commonly used hook events (Claude Code supports additional lifecycle events — see the [official docs](https://docs.anthropic.com/en/docs/claude-code/hooks) for the full list):

| Event | When It Fires | Use Case |
| ----- | ------------- | -------- |
| `PreToolUse` | Before any tool executes | Block dangerous commands, log operations |
| `PostToolUse` | After a tool completes | Auto-format code, validate output |
| `Stop` | When Claude finishes generating | Desktop notifications for long tasks |
| `PreCompact` | Before context compression | Preserve critical information |
| `SessionStart` | When a session begins | Load project context, set environment |

### Safety Guard (PreToolUse)

This hook blocks destructive commands before they execute:

```bash
#!/bin/bash
# ~/.claude/hooks/safety-guard.sh
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ "$TOOL" = "Bash" ] && [ -n "$COMMAND" ]; then
  if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*f|-[a-zA-Z]*r)\s'; then
    echo "BLOCKED: destructive rm detected." >&2
    exit 2
  fi
  if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force'; then
    echo "BLOCKED: force push not allowed." >&2
    exit 2
  fi
  if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
    echo "BLOCKED: hard reset can destroy work." >&2
    exit 2
  fi
fi
exit 0
```

Pair this with deny rules in `settings.json` for double-layer protection:

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force*)",
      "Bash(git reset --hard*)",
      "Bash(*--no-verify*)"
    ]
  }
}
```

Why both? Deny rules block at the permission layer (Claude never even attempts the call). The hook blocks at the execution layer (catches patterns the glob-style deny rules might miss). Defense in depth.

### Auto-Format (PostToolUse)

Every file edit or write gets auto-formatted. No exceptions, no drift:

```bash
#!/bin/bash
# ~/.claude/hooks/format.sh
FILE=$(cat | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.vue|*.css|*.scss|*.json|*.html|*.yaml|*.yml)
    DIR=$(dirname "$FILE")
    while [ "$DIR" != "/" ]; do
      if [ -x "$DIR/node_modules/.bin/prettier" ]; then
        "$DIR/node_modules/.bin/prettier" --write "$FILE" 2>/dev/null
        exit 0
      fi
      DIR=$(dirname "$DIR")
    done
    command -v prettier &>/dev/null && prettier --write "$FILE" 2>/dev/null
    ;;
esac
exit 0
```

### Smart Notifications (Stop + PreToolUse)

The naive approach — notifying on every stop — floods you with alerts on short replies. The better pattern: track when tool usage starts, measure elapsed time, and only notify for long-running tasks.

```bash
#!/bin/bash
# ~/.claude/hooks/mark-start.sh (PreToolUse — marks generation start)
MARKER="/tmp/claude-code-gen-start"
[ ! -f "$MARKER" ] && date +%s > "$MARKER"
exit 0
```

```bash
#!/bin/bash
# ~/.claude/hooks/notify-done.sh (Stop — notifies if task was long)
MARKER="/tmp/claude-code-gen-start"
[ ! -f "$MARKER" ] && exit 0

START=$(cat "$MARKER")
NOW=$(date +%s)
ELAPSED=$((NOW - START))
rm -f "$MARKER"

[ "$ELAPSED" -lt 30 ] && exit 0

if [ "$ELAPSED" -ge 60 ]; then
  DURATION="$((ELAPSED / 60))m$((ELAPSED % 60))s"
else
  DURATION="${ELAPSED}s"
fi

PROJECT=$(basename "$PWD" 2>/dev/null || echo "unknown")
osascript -e "display notification \"Duration: $DURATION\" \
  with title \"Claude Code Done\" subtitle \"$PROJECT\"" 2>/dev/null
exit 0
```

This way, short answers produce zero notifications. Only tasks exceeding 30 seconds trigger an alert — with the project name and duration.

### Context Preservation (PreCompact)

When context approaches the window limit, Claude compresses the conversation. Without guidance, it often drops important details. This hook injects preservation hints:

```bash
#!/bin/bash
# ~/.claude/hooks/pre-compact.sh
cat <<'EOF'
When compacting this conversation, please preserve:
1. Complete list of files modified and their purposes
2. Current task status and any pending items
3. Key architectural decisions made and their rationale
4. Any errors encountered and their solutions
5. User preferences and constraints mentioned
EOF
exit 0
```

### Registering Hooks

All hooks are registered in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/safety-guard.sh", "timeout": 5 }]
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/mark-start.sh", "timeout": 2 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/format.sh", "timeout": 30 }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/notify-done.sh", "timeout": 5 }]
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/pre-compact.sh", "timeout": 5 }]
      }
    ]
  }
}
```

The `matcher` field controls which tools trigger the hook. Empty string means "all tools." `"Edit|Write"` means only Edit and Write tool calls.

## MCP Servers: Connecting the Outside World

MCP (Model Context Protocol) servers give Claude access to external tools and data sources. Without them, Claude is limited to your local filesystem and shell commands.

### Recommended MCP Servers

| Server | What It Does | Scope | Install Command |
| ------ | ------------ | ----- | --------------- |
| **GitHub** | Issues, PRs, workflows, repo management | User (global) | `claude mcp add -s user --transport http github https://api.githubcopilot.com/mcp/` |
| **Figma** | Read designs, components, tokens | User (global) | `claude mcp add -s user --transport http figma https://mcp.figma.com/mcp` |
| **Context7** | Real-time library documentation | User (global) | `claude mcp add -s user -- context7 npx -y @upstash/context7-mcp@latest` |
| **Playwright** | Browser automation and testing | User (global) | `claude mcp add -s user -- playwright npx -y @playwright/mcp@latest` |
| **Database** | Query databases, inspect schemas | Project | `claude mcp add -s project --transport stdio db -- npx -y @bytebase/dbhub --dsn "mysql://..."` |
| **Sentry** | Error tracking, stack traces | Local | `claude mcp add -s local --transport http sentry https://mcp.sentry.dev/mcp` |

### Scope Strategy

MCP servers support three scopes:

- **`--scope user`** — Global, available in every project. Use for general-purpose tools (GitHub, Figma, search).
- **`--scope project`** — Written to `.mcp.json` in the project root. Use for project-specific integrations (databases, custom APIs).
- **`--scope local`** — Per-user, per-project. Use for credentials that shouldn't be shared (Sentry with your personal token).

### Permission Whitelist

After adding an MCP server, add it to the allow list to avoid per-call approval prompts:

```json
{
  "permissions": {
    "allow": [
      "mcp__github",
      "mcp__figma",
      "mcp__context7"
    ]
  }
}
```

## Plugins: Community Extensions

Plugins package skills, hooks, and agents into installable units. The official marketplace is `claude-plugins-official` from Anthropic's repository.

### Installing Plugins

```bash
# Install from the official marketplace
claude plugin install code-review@claude-plugins-official
claude plugin install security-guidance@claude-plugins-official
claude plugin install frontend-design@claude-plugins-official
```

### Worth Installing

| Plugin | What It Does |
| ------ | ------------ |
| **code-review** | Structured code review with quality metrics |
| **security-guidance** | Security best practices and vulnerability scanning |
| **frontend-design** | High-quality UI component generation |

### Community Resources

The plugin ecosystem is growing fast:

- [ClaudeMarketplaces.com](https://claudemarketplaces.com/) — Skills aggregation directory
- [ClaudeSkills.info](https://claudeskills.info/) — Free open-source skills collection
- [awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) — Curated plugin and tool list

## CLAUDE.md: The Guide Layer

CLAUDE.md is the most well-known configuration, but also the most misunderstood. Key principles from the Claude Code creator's own workflow:

### Keep It Lean

The Claude Code team's shared CLAUDE.md (for the Claude Code project itself) is approximately 100 lines. Every line should pass this test: **"Would Claude make a mistake if I removed this?"** If not, delete it.

The reasoning: the model's attention to instructions is finite. The more rules you pile into CLAUDE.md, the less reliably each individual rule gets followed. Overloading it with obvious rules wastes instruction capacity on things the model would do correctly anyway.

### Structure That Works

```markdown
# CLAUDE.md

## Tech Stack
- Framework, language, key dependencies

## Project Structure
- Directory layout (especially for monorepos)

## Build / Test / Lint Commands
- Exact commands, not general patterns

## Critical Conventions
- Things the model gets wrong without explicit instruction
- Non-obvious patterns specific to your project

@docs/architecture.md    <!-- Deep details via @import -->
@lessons.md              <!-- Self-improvement loop -->
```

### The Self-Improvement Loop

Create a `lessons.md` file referenced by CLAUDE.md. Every time Claude makes a mistake, add a rule:

```markdown
# Lessons Learned

### 2026-04-20 Tailwind v4 scoped styles
- **Problem**: Used `@apply` in scoped `<style>` blocks, which fails in Tailwind v4
- **Fix**: Use `@reference "tailwindcss";` at top of scoped style blocks
```

Over time, this file becomes a project-specific knowledge base that eliminates recurring errors. The key insight: **convert failures into rules, not documentation.** This is the self-improving harness pattern.

## Context Management: The Hidden Skill

Context window management is the most underrated productivity skill. Quality degrades as context fills up — the longer the conversation, the more the model's attention gets diluted — yet most developers never think about it.

### Essential Commands

| Command | When to Use |
| ------- | ----------- |
| `/clear` | Switching to an unrelated task |
| `/compact focus on API changes` | Context getting large — compress with preservation hints |
| `/rewind` | Code went wrong — rollback conversation and file state |
| `Shift+Tab` | Cycle through modes: Normal -> Auto-Accept -> Plan Mode |
| `Ctrl+S` | Stash current prompt, ask a quick question, then restore |
| `Ctrl+B` | Send a long-running bash command to background |

### The "Kitchen Sink" Anti-Pattern

The most common mistake: using a single long-running session for everything. A session that starts with "fix login bug" then pivots to "refactor the API" then "write documentation" accumulates irrelevant context that degrades quality on every subsequent task.

**Rule of thumb:** one session, one objective. Use `/clear` between unrelated tasks. Use `/compact` with a focus hint when context grows within a single task.

### Deep Reasoning

Claude Code has extended thinking enabled by default. For complex architectural decisions or difficult debugging, use phrases like `think hard` or `think deeply` in your prompt to encourage more thorough reasoning. Reserve this for genuinely hard problems where the extra thinking time is worth it.

## Worktree: Parallel Development at Scale

This is the **single biggest productivity lever** in Claude Code, according to its creator who routinely runs 10-15 parallel sessions across terminals, browser, and mobile.

### The Concept

A Git worktree creates an additional working directory linked to the same repository. Each worktree checks out a different branch. Combined with Claude Code, this enables true parallelism:

```
main repo (master)     → Terminal 1: claude → "review PR #42"
worktree-a (feat/auth) → Terminal 2: claude → "implement OAuth flow"
worktree-b (fix/perf)  → Terminal 3: claude → "optimize database queries"
worktree-c (docs/api)  → Terminal 4: claude → "generate API documentation"
```

Each session has its own context window, working directory, and Git branch. They share the same Git history but cannot interfere with each other.

### Setup

```bash
# Create worktrees
git worktree add ../project-feat-auth -b feat/auth
git worktree add ../project-fix-perf -b fix/perf

# Launch Claude in each (separate terminals)
cd ../project-feat-auth && claude
cd ../project-fix-perf && claude

# When done, merge and clean up
cd ../project  # back to main repo
git merge feat/auth
git worktree remove ../project-feat-auth
```

Claude Code also has native support:

```bash
# One command: creates worktree + branch + starts Claude
claude --worktree feat-auth
```

### When It Makes Sense

- **Multiple independent features** — the obvious case
- **Fix + feature in parallel** — hotfix on one branch while feature work continues on another
- **Code review + development** — review a PR in one session while working on your own task in another
- **Exploration + implementation** — research approaches in a Plan Mode session while another session implements the chosen approach

### When It Doesn't

- Tasks that modify the same files (merge conflicts are inevitable)
- Small projects where context switching cost is low
- When you're close to API quota limits (parallel sessions burn quota faster)

## Putting It All Together

Here is the complete `settings.json` structure with all layers configured:

```json
{
  "permissions": {
    "allow": [
      "Bash", "Edit", "Read", "Write", "Glob", "Grep",
      "mcp__github", "mcp__figma", "mcp__context7"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force*)",
      "Bash(git reset --hard*)",
      "Bash(*--no-verify*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "~/.claude/hooks/safety-guard.sh", "timeout": 5 }] },
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude/hooks/mark-start.sh", "timeout": 2 }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "~/.claude/hooks/format.sh", "timeout": 30 }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude/hooks/notify-done.sh", "timeout": 5 }] }
    ],
    "PreCompact": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude/hooks/pre-compact.sh", "timeout": 5 }] }
    ]
  },
  "enabledPlugins": {
    "frontend-design@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true
  },
  "outputStyle": "engineer-professional",
  "effortLevel": "high"
}
```

## Key Takeaways

1. **CLAUDE.md is advice (probabilistic), hooks are law (100%).** Put formatting, safety, and notifications in hooks.
2. **The instruction budget is finite.** Keep CLAUDE.md lean. Every unnecessary line displaces a useful one.
3. **Context management is a skill.** One session per objective. `/clear` between tasks. `/compact` with hints.
4. **Worktree parallelism is the #1 lever.** Multiple Claude sessions on independent branches can significantly multiply throughput.
5. **Build a self-improving loop.** `lessons.md` turns every mistake into a permanent fix.
6. **Defense in depth.** Deny rules + hooks + CLAUDE.md = three layers of protection with different enforcement levels.
7. **MCP servers eliminate copy-paste.** Direct database queries, GitHub operations, and design file access inside the conversation.

The gap between a default Claude Code install and a configured one is not incremental — it is categorical. The same model, with the right harness, produces dramatically better results. This is [harness engineering](/blog/harness-engineering-ai-agents) applied to your own development workflow.

---

**References:**

1. [Claude Code Official Documentation — Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
2. [Claude Code Official Documentation — MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
3. [Claude Code Official Documentation — Skills](https://docs.anthropic.com/en/docs/claude-code/skills)
4. [awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) — Comprehensive tool collection
5. [Claude Code Best Practices](https://github.com/shanraisshan/claude-code-best-practice) — Practical tips collection
6. [Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
7. [Claude Code Creator's 100-Line Workflow](https://mindwiredai.com/2026/03/25/claude-code-creator-workflow-claudemd/)
