# claude-spend

Token usage analytics for Claude Code. Forked from [claude-spend](https://github.com/writetoaniketparihar-collab/claude-spend) by Aniket Parihar.

## Architecture

No build step. No framework. Vanilla HTML/JS. Published via npm as `@mpalermiti/claude-spend`.

```
src/
├── index.js          CLI entry — --mcp for MCP mode, otherwise Express dashboard
├── server.js         Express server, /api/data (with ?from&to), /api/presets, /api/refresh
├── parser.js         Core parser — reads ~/.claude/projects/ JSONL, date filtering, aggregation
├── mcp.js            MCP server (stdio) — 5 tools wrapping the parser
└── public/
    └── index.html    Single-file dashboard (82KB) — all CSS/JS inline
```

## Key Patterns

- **Date filtering**: `parseAllSessions({ from, to })` — parses all files, then filters by date before aggregating. All API endpoints and MCP tools accept `from`/`to`.
- **Caching**: Server caches unfiltered results only. Filtered requests always reparse.
- **Design system**: CSS variables in `:root` and `[data-theme="dark"]`. Light mode default. Charts read colors via `getComputedStyle`.
- **Charts**: All rendered with Canvas API (no Chart.js dependency). Daily chart, model donut, turn cost, tool bars.
- **Collapsible sections**: All sections toggle via `toggleSection()`. Charts open by default, others collapsed.
- **Fonts**: Outfit (display) + JetBrains Mono (data/labels). Loaded from Google Fonts.

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
