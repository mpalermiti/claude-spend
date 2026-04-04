# claude-spend

Token usage analytics for Claude Code. Forked from [claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend) by Aniket Parihar.

## Architecture

No build step. No framework. Vanilla HTML/JS. Published via npm as `@mpalermiti/claude-spend`.

```
src/
├── index.js          CLI entry — --mcp for MCP mode, otherwise Express dashboard
├── server.js         Express server, /api/data (with ?from&to), /api/presets, /api/refresh
├── parser.js         Core parser — reads ~/.claude/projects/ JSONL, date filtering, trend comparison
├── mcp.js            MCP server (stdio) — 5 tools wrapping the parser
└── public/
    └── index.html    Single-file dashboard (~111KB) — all CSS/JS inline
```

## Key Patterns

- **Date filtering**: `parseAllSessions({ from, to })` — parses all files, then filters by date before aggregating. All API endpoints and MCP tools accept `from`/`to`.
- **Trend comparison**: When a date range is specified, parser also computes the equivalent previous period's cost/tokens and returns a `trend` object with delta percentages.
- **Caching**: Server caches unfiltered results only. Filtered requests always reparse.
- **Design system**: CSS variables in `:root` and `[data-theme="dark"]`. Light mode default. Emerald green accent (`#10B981`), rose for cost warnings (`#F43F5E`). Charts read colors via `getComputedStyle`.
- **Charts**: All rendered with Canvas API (no Chart.js). Daily stacked bars with 7-day MA + cumulative cost line, model donut, turn cost area chart, tool usage bars, activity heatmap (hour × day-of-week).
- **Chart tooltips**: Daily chart and donut chart have mousemove tooltip overlays showing detailed breakdowns.
- **Collapsible sections**: All sections toggle via `toggleSection()`. Charts open by default, all others collapsed.
- **Fonts**: Plus Jakarta Sans (body/prose) + JetBrains Mono (data/labels/values). Loaded from Google Fonts.
- **Keyboard navigation**: `j`/`k` navigate sessions, `Enter` drills down, `Escape` closes, `/` focuses search, `d` toggles dark mode, `r` refreshes.
- **ROI multiplier**: Plan selector (localStorage-persisted) computes API-equivalent value vs subscription cost.
- **Share card**: Canvas-rendered 1200×630 PNG with hero cost, ROI badge, stat cards, peak activity, and insight.

## Sections

1. **Hero** — API-equivalent cost (72px), trend delta vs previous period, ROI multiplier badge
2. **Stat cards** — 4 cards: tokens, conversations, messages, cache hit rate (color-coded)
3. **Charts** — Daily token bars (stacked, with cumulative cost overlay) + model donut (hover tooltips)
4. **Activity heatmap** — Hour × day-of-week grid, peak callout
5. **Insights** — Featured top insight as banner, remaining in expandable list
6. **Tool usage** — Horizontal bars, ranked colors, top 15
7. **Projects** — Per-project breakdown with expandable per-prompt drawers
8. **Most expensive prompts** — Top 20, ranked with token composition bars
9. **All sessions** — Sortable/searchable table, click to drill down
10. **Drilldown** — Per-turn cost chart, session insight, turn-by-turn token breakdown

## Commands

```bash
node src/index.js                    # Launch dashboard (auto-opens browser)
node src/index.js --no-open          # Launch without opening browser
node src/index.js --mcp              # Start as MCP server (stdio)
npm test                             # Jest tests (26 tests across 6 suites)
```

## Testing

Jest with supertest for API tests. Fixtures in `tests/fixtures/`. Run `npm test`.

## Publishing

```bash
npm publish --access public          # Publish to npm as @mpalermiti/claude-spend
```

GitHub account: `mpalermiti` (personal).
