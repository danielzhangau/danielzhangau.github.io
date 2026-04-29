---
title: "Running Claude Code on DeepSeek V4: Same Tool, 7-89x Cheaper"
description: "How I built claude-ds — a drop-in wrapper that runs Claude Code with DeepSeek V4 as the backend. Covers the architecture, environment variable reverse-engineering, vision workarounds, and honest tradeoffs from daily use."
pubDate: 2026-04-29
tags:
  [
    "Claude Code",
    "DeepSeek",
    "AI Tools",
    "Open Source",
    "Cost Optimization",
  ]
---

DeepSeek V4 dropped on April 24, 2026 — a 1.6 trillion parameter MoE model trained entirely on Huawei Ascend chips, released under MIT license. Within days, it became the top trending topic in the AI engineering community. Not because of benchmarks (though those are competitive), but because of what it means for cost.

Claude Code is the best agentic coding tool I have used. It reads my codebase, edits files, runs commands, manages git, and operates autonomously within guardrails I define. But it runs on Claude Opus at **$25 per million output tokens**. For a heavy day of development, that adds up fast.

DeepSeek V4-Pro offers comparable capability at **$3.48/M output tokens**. V4-Flash drops to **$0.28/M**. And DeepSeek provides an [Anthropic-compatible API endpoint](https://api-docs.deepseek.com/guides/anthropic_api) — meaning Claude Code can talk to DeepSeek without knowing the difference.

I built [**claude-ds**](https://github.com/danielzhangau/claude-ds) to make this seamless. This post documents how it works, what I learned reverse-engineering Claude Code's internals, and where DeepSeek V4 falls short.

## The Architecture

![claude-ds architecture](/img/blog/claude-ds-architecture.svg)

Claude Code is fundamentally an agent runtime that sends API requests to an Anthropic-compatible endpoint. The key insight: if you redirect those requests to DeepSeek's Anthropic endpoint, most things work — the tools, the hooks, the MCP servers, the slash commands. Claude Code doesn't verify which model is responding. (There are [edge cases](#where-it-falls-short), but the core workflow is intact.)

`claude-ds` is a thin shell function that launches `claude` with environment variables pointing to DeepSeek. Here is a simplified version showing the key variables (the [actual implementation](https://github.com/danielzhangau/claude-ds/blob/main/scripts/claude-ds.sh) sets additional tier-mapping variables):

```bash
claude-ds() {
  ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic" \
  ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" \
  ANTHROPIC_MODEL="deepseek-v4-pro[1m]" \
  ANTHROPIC_SMALL_FAST_MODEL="deepseek-v4-flash" \
  CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1 \
  claude "$@"
}
```

Two modes:
- **`claude-ds`** (Pro mode): V4-Pro for the main conversation (1M context), V4-Flash for internal tasks like subagents and lightweight operations.
- **`claude-ds-flash`** (Flash mode): V4-Flash for everything. Maximum cost savings.

## Reverse-Engineering Claude Code's Model Variables

The Anthropic docs mention `ANTHROPIC_BASE_URL` and `ANTHROPIC_MODEL`, but Claude Code internally uses several more model-tier variables that are not documented. I found these by examining the Claude Code binary:

| Variable | Purpose | What Happens If Unset |
|----------|---------|----------------------|
| `ANTHROPIC_MODEL` | Primary conversation model | Uses `claude-opus-*` (API error) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus tier mapping | Falls back to Claude model name |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet tier mapping | Falls back to Claude model name |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku tier mapping | Falls back to Claude model name |
| **`ANTHROPIC_SMALL_FAST_MODEL`** | Internal lightweight tasks | **Uses `claude-haiku-*` -- silent failures** |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Agent tool subagents | Falls back to Sonnet tier |
| `CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP` | Prevent model name remapping | May corrupt `deepseek-v4-*` names |

The critical one is `ANTHROPIC_SMALL_FAST_MODEL`. Claude Code references this frequently in its binary for various internal operations. If you don't set it, Claude Code silently tries to call `claude-haiku-*` through DeepSeek's endpoint, which either fails or gets remapped to `deepseek-v4-flash` (depending on endpoint behavior). Most third-party Claude Code wrapper guides miss this variable entirely.

`CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP` is equally important. Without it, Claude Code's model name normalization logic can mangle `deepseek-v4-pro` into something the API doesn't recognize.

## Solving the Vision Problem

![Vision workaround flow](/img/blog/claude-ds-vision-flow.svg)

DeepSeek V4 is text-only — it cannot process images. Without any workaround, this is what happens when using Claude Code:

1. Users paste screenshots via Ctrl+V
2. Claude Code saves pasted images to temp files
3. The model tries to `Read` the image file
4. DeepSeek receives binary data it cannot interpret

The solution has two parts:

### Vision MCP Server

An MCP server that routes image analysis to any OpenAI-compatible vision model (I use Alibaba's Qwen3-VL-Plus):

```json
{
  "mcpServers": {
    "vision": {
      "command": "/path/to/venv/bin/python",
      "args": ["-m", "clipboard_vision_mcp.server"],
      "env": {
        "VISION_API_KEY": "your-key",
        "VISION_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "VISION_MODEL": "qwen3-vl-plus"
      }
    }
  }
}
```

This gives the text-only model two tools: `see_image` (analyze a file on disk) and `see_clipboard` (analyze the current clipboard contents).

### Vision Guard Hook

The MCP server alone is not enough — you need to intercept image reads deterministically. A Claude Code `PreToolUse` hook does this:

```bash
#!/bin/bash
# Only activate on non-Anthropic backends
if [ -z "$ANTHROPIC_BASE_URL" ] || [[ "$ANTHROPIC_BASE_URL" == *"anthropic.com"* ]]; then
  exit 0  # No-op for native Claude (has built-in vision)
fi

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL" = "Read" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  EXT="${FILE_PATH##*.}"
  EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

  case "$EXT_LOWER" in
    png|jpg|jpeg|gif|webp|bmp)
      echo "BLOCKED. You MUST call mcp__vision__see_image now with the same path."
      exit 2  # Block with message
      ;;
  esac
fi
exit 0
```

Exit code 2 tells Claude Code to block the tool call and show the message to the model. The model then (usually) calls `see_image` instead.

I say "usually" because this is where model quality matters. Claude Opus follows hook redirect instructions reliably. DeepSeek V4 sometimes ignores the redirect and says "I cannot view images" instead. Adding few-shot examples to `CLAUDE.md` improved compliance significantly, but it is not 100%.

**This is the fundamental tradeoff**: hooks provide deterministic interception, but model behavior after interception is probabilistic. Stronger models follow redirect instructions more reliably.

## Where It Works Well

For day-to-day coding tasks, DeepSeek V4-Pro through `claude-ds` is genuinely good:

- **Code editing and refactoring**: Reads context, makes targeted changes, follows project conventions. Comparable to Claude Opus for most tasks.
- **Git operations**: Commit messages, branch management, PR descriptions — all work identically since these are tool-driven.
- **Multi-file changes**: The agent loop (plan -> edit -> verify) works the same way.
- **Long context**: V4-Pro supports 1M tokens, matching Claude's context window. Useful for large codebases.

The cost difference is dramatic for heavy use. A session that would cost $5-10 on Claude Opus runs for roughly $0.70-1.40 on V4-Pro, or pennies on V4-Flash.

## Where It Falls Short

Being honest about the limitations:

**Instruction following**: DeepSeek V4 is noticeably weaker at following complex system prompt instructions. Claude Opus treats `CLAUDE.md` rules as near-mandatory; DeepSeek V4 treats them as suggestions. This manifests in:
- Ignoring hook redirect messages (the vision problem above)
- Occasionally using tools in ways that violate stated rules
- Less consistent adherence to output formatting constraints

**Coherence past 500K tokens**: Context quality degrades in very long sessions. Use `/compact` aggressively.

**API reliability**: DeepSeek's API returns 503 during peak hours. The `CLAUDE_CODE_MAX_RETRIES=3` setting handles this automatically, but expect occasional delays.

**Multi-turn reasoning**: V4's `reasoning_content` (thinking mode) can trigger 400 errors in multi-turn conversations. Restarting the session resolves this.

**No image support**: Solved partially via the Vision MCP + hook approach, but it adds latency and depends on a separate vision API.

**Session isolation**: `claude-ds` sessions cannot `/resume` native Claude sessions (different backends, different conversation formats).

## The Cost Math

Rough output-token-only cost estimates (input tokens add to the total, but output is the dominant cost factor):

| Scenario | Claude Opus | DeepSeek V4-Pro | V4-Flash |
|----------|-------------|-----------------|----------|
| Light day (~500K output tokens) | $12.50 | $1.74 | $0.14 |
| Heavy day (~2M output tokens) | $50.00 | $6.96 | $0.56 |
| Monthly (20 heavy days) | $1,000 | $139 | $11.20 |

V4-Pro gives roughly 7x savings at the standard rate. V4-Flash gives 89x. If you are on a Claude Max subscription ($100-200/month depending on tier), the calculus changes — but if you are on API billing or hitting rate limits, the savings are significant.

Note: DeepSeek has been running promotional discounts (75% off V4-Pro at various times). Check [their pricing page](https://api-docs.deepseek.com/quick_start/pricing) for current rates.

## Getting Started

```bash
# Clone
git clone https://github.com/danielzhangau/claude-ds.git
cd claude-ds

# Install (interactive)
./install.sh

# Restart shell
source ~/.zshrc  # or ~/.bashrc

# Use it
claude-ds          # V4-Pro mode
claude-ds-flash    # V4-Flash mode
```

The installer handles everything: shell functions, Vision MCP setup, hook configuration, and `CLAUDE.md` instructions. You need a [DeepSeek API key](https://platform.deepseek.com/api_keys) and optionally a vision API key for image support.

## What This Means for AI Engineering

DeepSeek V4, with its Anthropic-compatible endpoint and competitive pricing, makes running premium agentic tools on a budget genuinely practical. A few broader observations:

**The Anthropic-compatible endpoint is a game-changer.** DeepSeek maintaining API compatibility with Anthropic's message format means tools built for Claude's text API can run on DeepSeek with minimal changes. Not everything is supported — image content blocks, `anthropic-beta` headers, and some advanced features are absent — but for text-based agentic workflows, it is a viable drop-in alternative.

**Model quality still matters for agentic workflows.** The gap between Claude Opus and DeepSeek V4 is not in raw coding ability — it is in instruction following, system prompt compliance, and graceful handling of edge cases. For autonomous agents that need to follow complex rules reliably, this gap is meaningful.

**The cost curve enables new architectures.** At $0.28/M tokens for V4-Flash, you can afford to run speculative execution, multi-agent pipelines, and throwaway exploratory sessions that would be prohibitively expensive on frontier models.

**Huawei Ascend training is a milestone.** V4 is the first frontier-class model trained entirely without Nvidia hardware. Regardless of the geopolitical implications, this proves that alternative hardware ecosystems can produce competitive results. The long-term effect on GPU pricing and availability will be significant.

The AI tooling ecosystem is entering a phase where the **interface** (Claude Code, Cursor, Windsurf) and the **model** (Claude, DeepSeek, GPT) are increasingly separable. `claude-ds` is a small proof of concept, but it points to a future where you pick the best tool for your workflow and the best model for your budget — independently.

---

Source code: [github.com/danielzhangau/claude-ds](https://github.com/danielzhangau/claude-ds)

References:
- [DeepSeek V4 Preview Release Notes](https://api-docs.deepseek.com/news/news260424)
- [DeepSeek Anthropic API Guide](https://api-docs.deepseek.com/guides/anthropic_api)
- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Claude Code Documentation](https://code.claude.com/docs/en/overview)
