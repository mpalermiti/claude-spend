# claude-spend

See where your Claude Code tokens go. One command. Local dashboard. No setup.

```bash
npx @mpalermiti/claude-spend
```

<!-- screenshot goes here -->

Reads your local Claude Code session data (`~/.claude/`) and shows you exactly where your tokens go. Everything runs locally. Nothing leaves your machine.

**The dashboard gives you:**

- Token usage over time with a 7-day moving average
- Estimated API cost for any period with daily average breakdown
- Per-session drill-downs with turn-by-turn cost curves and context growth
- Tool usage breakdown (which tools Claude calls most)
- 12 actionable insights (vague prompts, marathon sessions, model mismatch, etc.)
- Date filtering: lifetime, this month, last month, this week, last week, today, or custom range
- Dark mode

**The MCP server** lets Claude query its own spend mid-conversation. "What's my burn today?" just works.

## Install

```bash
npx @mpalermiti/claude-spend
```

Opens `http://localhost:3456`. That's it.

**CLI flags:**

```
--port <port>   Custom port (default: 3456)
--no-open       Don't auto-open browser
--mcp           Run as MCP server (stdio)
--help          Show help
```

## MCP server

Add this to `~/.claude/settings.json` and Claude can query spend data during any conversation:

```json
{
  "mcpServers": {
    "claude-spend": {
      "command": "npx",
      "args": ["@mpalermiti/claude-spend", "--mcp"]
    }
  }
}
```

Five tools: `get_spend_summary`, `get_top_sessions`, `get_project_breakdown`, `get_insights`, `get_daily_trend`. All accept optional `from`/`to` date params.

## How it works

Claude Code writes JSONL session files to `~/.claude/projects/`. This tool parses them, calculates API-equivalent costs per model, aggregates by day/model/project, and generates insights. The cost numbers represent what the usage would cost at API rates (not what you pay on a subscription).

## Origin

Forked from [claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend) by Aniket Parihar. I kept the core parser, then rebuilt the dashboard, added date filtering, analytics, MCP server, and dark mode. MIT license.
