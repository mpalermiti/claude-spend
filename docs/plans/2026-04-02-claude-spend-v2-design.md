# claude-spend v2 Design

**Date**: 2026-04-02
**Author**: Michael Palermiti
**Package**: `@mpalermiti/claude-spend`
**Origin**: Fork of [claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend) by Aniket Parihar (MIT)

---

## Overview

Fork and extend `claude-spend` into a comprehensive Claude Code analytics tool with a redesigned dashboard, deeper analytics, date range filtering, and an MCP server for programmatic access.

## Architecture

No build step. No framework. Vanilla HTML/JS. Published via npm, launched via `npx`.

```
src/
├── index.js          CLI entry — flags for dashboard vs MCP mode
├── server.js         Express server, API endpoints with date filtering
├── parser.js         Extended parser with time range filtering
├── mcp.js            MCP server (stdio transport)
└── public/
    └── index.html    Redesigned single-file dashboard
```

## Track A: Dashboard Redesign

**Aesthetic**: Clean minimal with personality. No gradients, no glassmorphism, near-zero shadows. White background, generous whitespace, SF Mono for numbers, Inter for text. Single distinctive accent hue — not a rainbow. Think Linear meets well-designed CLI output.

- Dark mode toggle (localStorage, respects `prefers-color-scheme`)
- Data-forward layout: stat cards, charts, tables
- Tight typography hierarchy
- Distinctive chart style (custom colors, not Chart.js defaults)

## Track B: Deeper Analytics

- **Time range filtering**: Segmented control — Today, This Week, Last Week, This Month, Last Month, Lifetime, Custom (date picker). All stats/charts/insights recalculate.
- **Time-series trends**: Daily cost trendline with 7-day moving average overlay
- **Session duration**: First-to-last timestamp per session, avg session length
- **Per-conversation drill-down**: Click session to see turn-by-turn token growth, tool calls, cost curve
- **Tool usage heatmap**: Which tools (Read, Edit, Bash, Grep, Agent) consume most tokens
- **Subagent cost attribution**: Attribute child token usage to parent sessions where data supports it
- **Cost forecasting**: "At this rate, your monthly API-equivalent spend is ~$X"

## Track C: MCP Server

`claude-spend --mcp` starts stdio MCP server instead of web dashboard.

**Tools**:
- `get_spend_summary` — totals for a time range
- `get_top_sessions` — most expensive sessions, filterable by project/date
- `get_project_breakdown` — per-project token/cost breakdown
- `get_insights` — generated insights as structured data
- `get_daily_trend` — daily usage array for charting or narrative

All tools accept optional `from`/`to` parameters.

## Track D: Date Range Filtering

Cuts across all tracks:
- **Server**: `/api/data?from=2026-03-01&to=2026-03-31` — parser filters before aggregating
- **Client**: Segmented control sends params, dashboard re-renders
- **MCP**: All tools accept `from`/`to`
- **Presets**: Today, This Week, Last Week, This Month, Last Month, Lifetime, Custom

## Non-Goals

- No React/Vite/build tooling
- No remote data collection or telemetry
- No authentication (local tool only)
- No database — parse JSONL on demand, cache in memory
