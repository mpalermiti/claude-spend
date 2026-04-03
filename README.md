# @mpalermiti/claude-spend

See where your Claude Code tokens go. One command, zero setup.

Parses your local `~/.claude/` session data and serves a dashboard with token usage analytics, cost estimates, date filtering, and actionable insights.

## Quick Start

```bash
npx @mpalermiti/claude-spend
```

Opens a local dashboard at `http://localhost:3456`. All data stays on your machine.

## Features

- **Date range filtering** -- Lifetime, This Month, Last Month, This Week, Last Week, Today, or custom range
- **Cost forecasting** -- Projected monthly spend based on daily averages
- **7-day moving average** -- Trend line overlaid on daily usage chart
- **Session duration** -- How long each conversation lasted
- **Tool usage analytics** -- Which tools (Read, Edit, Bash, Grep, Agent) are called most
- **Per-session drill-down** -- Turn-by-turn cost curve, context growth, token breakdown
- **12 insights** -- Actionable suggestions: vague prompts, context growth, marathon sessions, model mismatch, and more
- **Dark mode** -- Toggle or auto-detect from system preference
- **MCP server** -- Query spend data programmatically from Claude or any MCP client
- **Share card** -- Generate a PNG summary of your stats

## CLI Options

```
npx @mpalermiti/claude-spend [options]

Options:
  --port <port>   Port for dashboard (default: 3456)
  --no-open       Don't auto-open browser
  --mcp           Run as MCP server (stdio transport)
  --help, -h      Show help
```

## MCP Server

Run as an MCP server so Claude can query your spend data mid-conversation:

```bash
npx @mpalermiti/claude-spend --mcp
```

Add to your Claude Code settings (`~/.claude/settings.json`):

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

**Available tools:**

| Tool | Description |
|------|-------------|
| `get_spend_summary` | Token usage and cost totals for a time period |
| `get_top_sessions` | Most expensive sessions, filterable by project/date |
| `get_project_breakdown` | Per-project token and cost breakdown |
| `get_insights` | Generated insights about usage patterns |
| `get_daily_trend` | Daily usage data for trend analysis |

All tools accept optional `from` and `to` parameters (YYYY-MM-DD).

## How It Works

Reads JSONL session files from `~/.claude/projects/` -- the same data Claude Code writes locally. Parses token counts, calculates API-equivalent costs, aggregates by day/model/project, and generates insights. Nothing is sent anywhere.

## Credits

Forked from [claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend) by Aniket Parihar. MIT License.
