# claude-spend v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fork and extend claude-spend into `@mpalermiti/claude-spend` with a redesigned dashboard, date range filtering, deeper analytics, and an MCP server.

**Architecture:** Same shape as upstream — no build step, vanilla HTML/JS, Express server. Add `mcp.js` for MCP mode, extend `parser.js` with date filtering, redesign `index.html` from scratch. Test with Jest.

**Tech Stack:** Node.js, Express, vanilla JS, Canvas API for charts, `@modelcontextprotocol/sdk` for MCP, Jest for tests.

---

### Task 1: Test Infrastructure + Parser Baseline Tests

**Files:**
- Create: `tests/parser.test.js`
- Create: `tests/fixtures/sample-session.jsonl`
- Modify: `package.json` (add jest)

**Step 1: Install jest**

```bash
cd ~/ClaudeCode/claude-spend && npm install --save-dev jest
```

**Step 2: Add test script to package.json**

Add to `scripts`:
```json
"test": "jest --verbose"
```

**Step 3: Create a minimal JSONL fixture**

Create `tests/fixtures/sample-session.jsonl` with 3-4 realistic entries: a user message, an assistant response with usage data (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens), and a tool_use block. Model the entries on the real format from `~/.claude/projects/`. Include:
- 1 user entry with `type: 'user'`, `message.role: 'user'`, `message.content: 'Fix the login bug'`, `timestamp`
- 1 assistant entry with `type: 'assistant'`, `message.usage` containing all token fields, `message.model: 'claude-opus-4-6'`, `message.content` array with a tool_use block
- 1 user follow-up
- 1 assistant response

**Step 4: Write baseline parser tests**

```javascript
// tests/parser.test.js
const path = require('path');
const { extractSessionData } = require('../src/parser');
const { parseJSONLFile } = require('../src/parser');

describe('parseJSONLFile', () => {
  test('parses fixture file into array of entries', async () => {
    const entries = await parseJSONLFile(
      path.join(__dirname, 'fixtures/sample-session.jsonl')
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty('type');
  });
});

describe('extractSessionData', () => {
  test('extracts queries with token counts from entries', async () => {
    const entries = await parseJSONLFile(
      path.join(__dirname, 'fixtures/sample-session.jsonl')
    );
    const queries = extractSessionData(entries);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]).toHaveProperty('inputTokens');
    expect(queries[0]).toHaveProperty('outputTokens');
    expect(queries[0]).toHaveProperty('model');
    expect(queries[0]).toHaveProperty('cost');
    expect(queries[0].cost).toBeGreaterThan(0);
  });

  test('extracts tool names from assistant content', async () => {
    const entries = await parseJSONLFile(
      path.join(__dirname, 'fixtures/sample-session.jsonl')
    );
    const queries = extractSessionData(entries);
    const withTools = queries.filter(q => q.tools.length > 0);
    expect(withTools.length).toBeGreaterThan(0);
  });

  test('pairs user prompts with assistant responses', async () => {
    const entries = await parseJSONLFile(
      path.join(__dirname, 'fixtures/sample-session.jsonl')
    );
    const queries = extractSessionData(entries);
    expect(queries[0].userPrompt).toBe('Fix the login bug');
  });
});
```

**Step 5: Export parseJSONLFile and extractSessionData from parser.js**

Currently `parseJSONLFile` and `extractSessionData` are not exported. Update the `module.exports` at the bottom of `src/parser.js`:

```javascript
module.exports = { parseAllSessions, parseJSONLFile, extractSessionData };
```

**Step 6: Run tests to verify they pass**

```bash
npm test
```

Expected: All 4 tests PASS.

**Step 7: Commit**

```bash
git add -A && git commit -m "test: add jest infrastructure and baseline parser tests"
```

---

### Task 2: Date Range Filtering in Parser

**Files:**
- Modify: `src/parser.js`
- Create: `tests/parser-filtering.test.js`

**Step 1: Write failing tests for date filtering**

```javascript
// tests/parser-filtering.test.js
const { filterSessionsByDateRange } = require('../src/parser');

describe('filterSessionsByDateRange', () => {
  const sessions = [
    { timestamp: '2026-03-01T10:00:00Z', date: '2026-03-01', totalTokens: 100 },
    { timestamp: '2026-03-15T10:00:00Z', date: '2026-03-15', totalTokens: 200 },
    { timestamp: '2026-04-01T10:00:00Z', date: '2026-04-01', totalTokens: 300 },
  ];

  test('returns all sessions when no range specified', () => {
    expect(filterSessionsByDateRange(sessions, {}).length).toBe(3);
  });

  test('filters by from date', () => {
    const result = filterSessionsByDateRange(sessions, { from: '2026-03-15' });
    expect(result.length).toBe(2);
    expect(result[0].date).toBe('2026-03-15');
  });

  test('filters by to date', () => {
    const result = filterSessionsByDateRange(sessions, { to: '2026-03-15' });
    expect(result.length).toBe(2);
    expect(result[1].date).toBe('2026-03-15');
  });

  test('filters by both from and to', () => {
    const result = filterSessionsByDateRange(sessions, { from: '2026-03-10', to: '2026-03-20' });
    expect(result.length).toBe(1);
    expect(result[0].date).toBe('2026-03-15');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- tests/parser-filtering.test.js
```

Expected: FAIL — `filterSessionsByDateRange` not defined.

**Step 3: Implement filterSessionsByDateRange**

Add to `src/parser.js` before `module.exports`:

```javascript
function filterSessionsByDateRange(sessions, { from, to } = {}) {
  return sessions.filter(s => {
    const date = s.date;
    if (!date || date === 'unknown') return true;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}
```

Export it:
```javascript
module.exports = { parseAllSessions, parseJSONLFile, extractSessionData, filterSessionsByDateRange };
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- tests/parser-filtering.test.js
```

Expected: All 4 tests PASS.

**Step 5: Add `parseAllSessions` date range parameter**

Modify `parseAllSessions` to accept an options object `{ from, to }`. After building the `sessions` array (around line 302 where `sessions.sort(...)` is), filter before aggregating dailyMap/modelMap/etc.

The key change: restructure `parseAllSessions` to:
1. Parse all session files into `sessions` array (existing code)
2. Filter by date range using `filterSessionsByDateRange`
3. Rebuild `dailyMap`, `modelMap`, `projectMap`, `allPrompts`, and `grandTotals` from filtered sessions only

This is a significant refactor of `parseAllSessions`. The cleanest approach:
- Extract aggregation into a separate function `aggregateSessions(sessions)` that takes the filtered session list and returns `{ dailyUsage, modelBreakdown, projectBreakdown, topPrompts, totals, insights }`.
- `parseAllSessions(options)` calls the parser, filters, then calls `aggregateSessions`.

**Step 6: Write a test for parseAllSessions with date filtering**

```javascript
// Add to tests/parser-filtering.test.js
const { parseAllSessions } = require('../src/parser');

describe('parseAllSessions with date range', () => {
  test('accepts from/to options without error', async () => {
    // This will parse real data if it exists, or return empty
    const result = await parseAllSessions({ from: '2099-01-01', to: '2099-12-31' });
    expect(result.sessions.length).toBe(0);
    expect(result.totals.totalTokens).toBe(0);
  });
});
```

**Step 7: Run tests**

```bash
npm test
```

Expected: All tests PASS.

**Step 8: Commit**

```bash
git add -A && git commit -m "feat: add date range filtering to parser"
```

---

### Task 3: API Endpoints for Date Filtering

**Files:**
- Modify: `src/server.js`
- Create: `tests/server.test.js`

**Step 1: Install supertest for API testing**

```bash
npm install --save-dev supertest
```

**Step 2: Write API tests**

```javascript
// tests/server.test.js
const request = require('supertest');
const { createServer } = require('../src/server');

describe('GET /api/data', () => {
  const app = createServer();

  test('returns JSON with sessions array', async () => {
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessions');
    expect(res.body).toHaveProperty('totals');
  });

  test('accepts from and to query params', async () => {
    const res = await request(app).get('/api/data?from=2099-01-01&to=2099-12-31');
    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBe(0);
  });
});
```

**Step 3: Run to verify failure**

```bash
npm test -- tests/server.test.js
```

Expected: The `from`/`to` params test may pass trivially or fail depending on caching. The point is to validate the API shape.

**Step 4: Update server.js to pass date params to parser**

Modify `GET /api/data`:
```javascript
app.get('/api/data', async (req, res) => {
  try {
    const { from, to } = req.query;
    const hasFilter = from || to;
    
    // Use cache only for unfiltered requests
    if (!hasFilter && cachedData) {
      return res.json(cachedData);
    }
    
    const data = await require('./parser').parseAllSessions({ from, to });
    
    if (!hasFilter) {
      cachedData = data;
    }
    
    res.json(data);
  } catch (err) {
    res.status(500).json(friendlyError(err));
  }
});
```

Also update the refresh endpoint similarly.

**Step 5: Add preset helper endpoint**

Add `GET /api/presets` that returns computed date ranges for convenience:
```javascript
app.get('/api/presets', (req, res) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfWeek);
  endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  res.json({
    today: { from: today, to: today },
    thisWeek: { from: startOfWeek.toISOString().split('T')[0], to: today },
    lastWeek: { from: startOfLastWeek.toISOString().split('T')[0], to: endOfLastWeek.toISOString().split('T')[0] },
    thisMonth: { from: startOfMonth.toISOString().split('T')[0], to: today },
    lastMonth: { from: startOfLastMonth.toISOString().split('T')[0], to: endOfLastMonth.toISOString().split('T')[0] },
    lifetime: {},
  });
});
```

**Step 6: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add date range filtering to API endpoints"
```

---

### Task 4: Dashboard Design System Overhaul

**Files:**
- Modify: `src/public/index.html` (CSS section, lines 7-675)

This is a pure CSS/HTML refactoring task. No JS logic changes.

**Step 1: Replace the CSS variables and design tokens**

Strip gradients, glassmorphism, colored accent bars. New design system:

```css
:root {
  /* Light mode */
  --bg: #FAFAFA;
  --surface: #FFFFFF;
  --surface-raised: #FFFFFF;
  --text-primary: #111111;
  --text-secondary: #666666;
  --text-tertiary: #999999;
  --border: #E5E5E5;
  --border-strong: #D4D4D4;
  
  /* Single accent: a distinctive blue-slate */
  --accent: #2563EB;
  --accent-light: #EFF6FF;
  --accent-muted: #93C5FD;
  
  /* Semantic */
  --success: #16A34A;
  --warning: #CA8A04;
  --error: #DC2626;
  
  /* Data viz palette — distinctive, not generic */
  --chart-1: #2563EB;
  --chart-2: #7C3AED;
  --chart-3: #0891B2;
  --chart-4: #059669;
  --chart-5: #D97706;
  
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.06);
  
  --radius: 12px;
  --radius-sm: 8px;
  --font: 'Inter', -apple-system, system-ui, sans-serif;
  --mono: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0A0A0A;
    --surface: #141414;
    --surface-raised: #1A1A1A;
    --text-primary: #EEEEEE;
    --text-secondary: #999999;
    --text-tertiary: #666666;
    --border: #262626;
    --border-strong: #333333;
    --accent-light: #1E293B;
  }
}

[data-theme="dark"] {
  --bg: #0A0A0A;
  --surface: #141414;
  --surface-raised: #1A1A1A;
  --text-primary: #EEEEEE;
  --text-secondary: #999999;
  --text-tertiary: #666666;
  --border: #262626;
  --border-strong: #333333;
  --accent-light: #1E293B;
}
```

**Step 2: Strip decorative elements**

- Remove `body::before` mesh gradient
- Remove `.hero-section` / `.hero-title` gradient text
- Remove all `var(--gradient-*)` usage
- Remove `.accent-bar` colored top borders on cards
- Remove `.logo-mark` gradient background — replace with text or simple icon
- Simplify `.stat-card:hover` — no transform, just subtle border change
- Remove `.insight-indicator` gradient backgrounds — use simple filled circles or text

**Step 3: Tighten the typography**

- Header: smaller, no 800 weight. `font-size: 18px; font-weight: 600;`
- Stat values: `font-family: var(--mono)` instead of Inter bold
- Remove ALL text-transform: uppercase from labels — use normal case with 500 weight
- Reduce stat value size from 34px to 28px
- Section titles: 14px, 600 weight, no icons

**Step 4: Simplify cards**

```css
.stat-card, .chart-card, .insight-card, .sessions-card, .prompts-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: none;
}
```

**Step 5: Add dark mode toggle to header**

Add a simple toggle button in the header-right div:
```html
<button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle dark mode">
  <svg class="icon-sun" ...></svg>
  <svg class="icon-moon" ...></svg>
</button>
```

JS:
```javascript
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}
// On load:
const saved = localStorage.getItem('theme');
if (saved) document.documentElement.setAttribute('data-theme', saved);
else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.setAttribute('data-theme', 'dark');
}
```

**Step 6: Remove the "hero section" and "how tokens work" collapsible**

- The hero title "Your Claude Code usage, visualized" is generic filler — remove it
- Keep the "How Tokens Work" content but move it to a `?` info icon or a footer section
- Remove the privacy notice banner (move the message to footer)

**Step 7: Update the footer**

Replace Aniket's email/LinkedIn with:
```html
<div class="footer">
  All data stays local. Nothing sent anywhere.<br>
  Originally forked from <a href="https://github.com/writetoaniketparihar-collab/claude-spend">claude-spend</a> by Aniket Parihar.
</div>
```

**Step 8: Visual QA — run the dashboard and verify**

```bash
node src/index.js --no-open
# Open http://localhost:3456 manually
```

Verify: clean minimal aesthetic, dark mode works, all data still renders correctly.

**Step 9: Commit**

```bash
git add -A && git commit -m "feat: redesign dashboard with clean minimal design system + dark mode"
```

---

### Task 5: Date Range Picker UI

**Files:**
- Modify: `src/public/index.html` (add date range controls, update fetchData)

**Step 1: Add segmented control HTML**

Insert after the header, before stats:
```html
<div class="date-filter" id="dateFilter">
  <div class="filter-presets">
    <button class="preset active" data-preset="lifetime">Lifetime</button>
    <button class="preset" data-preset="thisMonth">This Month</button>
    <button class="preset" data-preset="lastMonth">Last Month</button>
    <button class="preset" data-preset="thisWeek">This Week</button>
    <button class="preset" data-preset="lastWeek">Last Week</button>
    <button class="preset" data-preset="today">Today</button>
    <button class="preset" data-preset="custom">Custom</button>
  </div>
  <div class="custom-range" id="customRange" style="display:none">
    <input type="date" id="dateFrom">
    <span>to</span>
    <input type="date" id="dateTo">
    <button onclick="applyCustomRange()">Apply</button>
  </div>
</div>
```

**Step 2: Style the segmented control**

```css
.date-filter { margin-bottom: 24px; }
.filter-presets {
  display: flex; gap: 4px; padding: 3px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); width: fit-content;
}
.preset {
  padding: 6px 14px; border: none; border-radius: 6px;
  font-size: 13px; font-weight: 500; font-family: var(--font);
  background: transparent; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.preset:hover { color: var(--text-primary); }
.preset.active {
  background: var(--accent); color: white;
}
.custom-range {
  display: flex; align-items: center; gap: 8px; margin-top: 8px;
}
.custom-range input {
  padding: 6px 10px; border: 1px solid var(--border);
  border-radius: 6px; font-family: var(--font); font-size: 13px;
  background: var(--surface); color: var(--text-primary);
}
```

**Step 3: Wire up the JS**

```javascript
let currentPreset = 'lifetime';
let presets = {};

async function loadPresets() {
  const res = await fetch('/api/presets');
  presets = await res.json();
}

function setPreset(preset) {
  currentPreset = preset;
  document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-preset="${preset}"]`).classList.add('active');
  
  const customRange = document.getElementById('customRange');
  customRange.style.display = preset === 'custom' ? 'flex' : 'none';
  
  if (preset !== 'custom') {
    fetchDataWithRange(presets[preset] || {});
  }
}

function applyCustomRange() {
  const from = document.getElementById('dateFrom').value;
  const to = document.getElementById('dateTo').value;
  fetchDataWithRange({ from, to });
}

async function fetchDataWithRange({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = '/api/data' + (params.toString() ? '?' + params : '');
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.error) { showError(json.error); return; }
    DATA = json;
    render();
  } catch (err) {
    showError('Failed to load data: ' + err.message);
  }
}

// Update initial fetchData to use this
async function fetchData() {
  await loadPresets();
  await fetchDataWithRange({});
}
```

Add click handlers:
```javascript
document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => setPreset(btn.dataset.preset));
});
```

**Step 4: Update the date range display in header**

The `#dateRange` span should show the active filter range, not just the data range. Update `renderStats()` to show both:
```javascript
const filterLabel = currentPreset === 'lifetime' ? 'All time' :
  currentPreset === 'custom' ? `${document.getElementById('dateFrom').value} — ${document.getElementById('dateTo').value}` :
  currentPreset.replace(/([A-Z])/g, ' $1').trim();
document.getElementById('dateRange').textContent = 
  `${filterLabel} · ${formatDate(t.dateRange?.from)} – ${formatDate(t.dateRange?.to)}`;
```

**Step 5: QA — test all presets**

```bash
node src/index.js --no-open
```

Test each preset button. Verify data updates, charts re-render, "Today" shows only today's sessions (or empty state).

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add date range picker with presets and custom range"
```

---

### Task 6: Enhanced Analytics — Time-Series + Cost Forecasting

**Files:**
- Modify: `src/parser.js` (add session duration, forecasting)
- Modify: `src/public/index.html` (7-day MA overlay, forecast card)
- Create: `tests/analytics.test.js`

**Step 1: Write tests for session duration and forecasting**

```javascript
// tests/analytics.test.js
const { computeSessionDuration, computeForecast } = require('../src/parser');

describe('computeSessionDuration', () => {
  test('calculates duration from first to last timestamp', () => {
    const session = {
      queries: [
        { assistantTimestamp: '2026-04-01T10:00:00Z' },
        { assistantTimestamp: '2026-04-01T10:30:00Z' },
        { assistantTimestamp: '2026-04-01T11:15:00Z' },
      ]
    };
    const duration = computeSessionDuration(session);
    expect(duration).toBe(75); // minutes
  });
});

describe('computeForecast', () => {
  test('projects monthly cost from daily data', () => {
    const dailyUsage = [
      { date: '2026-04-01', cost: 5.00 },
      { date: '2026-04-02', cost: 3.00 },
    ];
    const forecast = computeForecast(dailyUsage);
    expect(forecast.projectedMonthlyCost).toBeGreaterThan(0);
    expect(forecast.avgDailyCost).toBe(4.00);
  });
});
```

**Step 2: Implement computeSessionDuration and computeForecast**

Add to `src/parser.js`:

```javascript
function computeSessionDuration(session) {
  const timestamps = session.queries
    .map(q => q.assistantTimestamp || q.userTimestamp)
    .filter(Boolean)
    .map(t => new Date(t).getTime())
    .filter(t => !isNaN(t));
  if (timestamps.length < 2) return 0;
  return Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000);
}

function computeForecast(dailyUsage) {
  if (!dailyUsage.length) return { projectedMonthlyCost: 0, avgDailyCost: 0 };
  const totalCost = dailyUsage.reduce((s, d) => s + d.cost, 0);
  const avgDailyCost = totalCost / dailyUsage.length;
  return {
    projectedMonthlyCost: avgDailyCost * 30,
    avgDailyCost,
    daysOfData: dailyUsage.length,
  };
}
```

Export both.

**Step 3: Add duration to each session in parseAllSessions**

After building each session object (around line 253-268), add:
```javascript
sessions.push({
  ...existingFields,
  durationMinutes: computeSessionDuration({ queries }),
});
```

**Step 4: Add forecast to the response**

After computing `grandTotals`, add:
```javascript
const forecast = computeForecast(dailyUsage);
```

Include `forecast` in the returned object.

**Step 5: Add 7-day moving average to daily chart**

In `renderDailyChart()`, after drawing the stacked bars, overlay a line:

```javascript
// 7-day moving average line
if (data.length >= 7) {
  ctx.beginPath();
  ctx.strokeStyle = 'var(--accent)';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  
  for (let i = 0; i < data.length; i++) {
    const windowStart = Math.max(0, i - 6);
    const window = data.slice(windowStart, i + 1);
    const avg = window.reduce((s, d) => s + d.totalTokens, 0) / window.length;
    const x = startX + i * (barW + gap) + barW / 2;
    const y = chartH + 8 - (avg / maxTotal) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
```

Add "7-day avg" to the legend.

**Step 6: Add forecast stat card**

Add a 5th stat card or replace an existing one:
```javascript
{
  label: 'Projected Monthly',
  value: '$' + DATA.forecast.projectedMonthlyCost.toFixed(2),
  sub: `Based on $${DATA.forecast.avgDailyCost.toFixed(2)}/day avg over ${DATA.forecast.daysOfData} days`,
  tip: 'API-equivalent monthly projection based on your recent daily average. You don\'t pay this on a subscription plan.'
}
```

**Step 7: Add session duration to the sessions table**

Add a "Duration" column showing `session.durationMinutes` formatted as "Xh Ym" or "Xm".

**Step 8: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

**Step 9: Commit**

```bash
git add -A && git commit -m "feat: add time-series 7-day MA, session duration, cost forecasting"
```

---

### Task 7: Tool Usage Analytics

**Files:**
- Modify: `src/parser.js` (aggregate tool usage)
- Modify: `src/public/index.html` (tool usage section)
- Create: `tests/tools.test.js`

**Step 1: Write tests for tool aggregation**

```javascript
// tests/tools.test.js
const { aggregateToolUsage } = require('../src/parser');

describe('aggregateToolUsage', () => {
  test('counts tool calls across sessions', () => {
    const sessions = [{
      queries: [
        { tools: ['Read', 'Bash', 'Read'] },
        { tools: ['Edit', 'Grep'] },
      ]
    }];
    const result = aggregateToolUsage(sessions);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: 'Read', count: 2 }),
      expect.objectContaining({ tool: 'Bash', count: 1 }),
    ]));
  });
});
```

**Step 2: Implement aggregateToolUsage**

```javascript
function aggregateToolUsage(sessions) {
  const toolMap = {};
  for (const s of sessions) {
    for (const q of s.queries) {
      for (const t of (q.tools || [])) {
        if (!toolMap[t]) toolMap[t] = { tool: t, count: 0, sessions: new Set() };
        toolMap[t].count++;
        toolMap[t].sessions.add(s.sessionId);
      }
    }
  }
  return Object.values(toolMap)
    .map(t => ({ tool: t.tool, count: t.count, sessionCount: t.sessions.size }))
    .sort((a, b) => b.count - a.count);
}
```

Export and include in parseAllSessions response.

**Step 3: Render tool usage as a horizontal bar chart**

Add a new section between charts and top prompts:

```html
<div class="tool-usage-section" id="toolSection" style="display:none">
  <div class="section-header">
    <div class="section-title">Tool Usage</div>
  </div>
  <div class="tool-bars" id="toolBars"></div>
</div>
```

Render as horizontal bars:
```javascript
function renderToolUsage() {
  const tools = DATA.toolUsage;
  if (!tools || !tools.length) return;
  document.getElementById('toolSection').style.display = 'block';
  const max = tools[0].count;
  
  document.getElementById('toolBars').innerHTML = tools.slice(0, 15).map(t => {
    const pct = (t.count / max * 100).toFixed(1);
    return `<div class="tool-bar-row">
      <span class="tool-name">${escapeHtml(t.tool)}</span>
      <div class="tool-bar-track">
        <div class="tool-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="tool-count">${fmtFull(t.count)}</span>
    </div>`;
  }).join('');
}
```

**Step 4: Style the tool bars**

```css
.tool-bar-row {
  display: grid; grid-template-columns: 100px 1fr 60px;
  gap: 12px; align-items: center; padding: 4px 0;
}
.tool-name {
  font-family: var(--mono); font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
}
.tool-bar-track {
  height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;
}
.tool-bar-fill {
  height: 100%; background: var(--accent); border-radius: 3px;
  transition: width 0.3s ease;
}
.tool-count {
  font-family: var(--mono); font-size: 13px; font-weight: 600;
  text-align: right; color: var(--text-primary);
}
```

**Step 5: Run tests and QA**

```bash
npm test
node src/index.js --no-open
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add tool usage analytics with horizontal bar chart"
```

---

### Task 8: Enhanced Session Drill-Down

**Files:**
- Modify: `src/public/index.html` (improve drilldown view)

**Step 1: Add token growth visualization to drill-down**

The existing drill-down already has a per-turn cost chart. Enhance it:

- Add cumulative token line overlay showing context growth
- Add tool call indicators on the x-axis (small dots colored by tool type)
- Show session duration in the drilldown meta line

**Step 2: Add per-turn token breakdown**

In each query item in the drill-down, add a mini stacked bar showing input/cache/output proportions (reuse the `token-bar-wrap` pattern from top prompts).

**Step 3: Add a "context size" column**

For each turn, show the running total of input tokens to visualize context window growth:

```javascript
let cumulativeInput = 0;
grouped.map((q, i) => {
  cumulativeInput += q.inputTokens + q.cacheReadTokens;
  // Show cumulativeInput as "Context: X" in each query item
});
```

**Step 4: QA**

Open a session drill-down, verify the enhancements render correctly.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: enhance session drill-down with context growth and tool indicators"
```

---

### Task 9: MCP Server

**Files:**
- Create: `src/mcp.js`
- Modify: `src/index.js` (add --mcp flag)
- Modify: `package.json` (add @modelcontextprotocol/sdk dependency)
- Create: `tests/mcp.test.js`

**Step 1: Install MCP SDK**

```bash
npm install @modelcontextprotocol/sdk
```

**Step 2: Write MCP server**

```javascript
// src/mcp.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { parseAllSessions, filterSessionsByDateRange, computeForecast, aggregateToolUsage } = require('./parser');

function createMcpServer() {
  const server = new McpServer({
    name: 'claude-spend',
    version: '2.0.0',
  });

  server.tool('get_spend_summary', {
    description: 'Get token usage and cost summary for a time period',
    from: { type: 'string', description: 'Start date (YYYY-MM-DD). Omit for all time.' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD). Omit for all time.' },
  }, async ({ from, to }) => {
    const data = await parseAllSessions({ from, to });
    const t = data.totals;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalSessions: t.totalSessions,
          totalQueries: t.totalQueries,
          totalTokens: t.totalTokens,
          totalInputTokens: t.totalInputTokens,
          totalOutputTokens: t.totalOutputTokens,
          totalCacheReadTokens: t.totalCacheReadTokens,
          estimatedCost: `$${t.totalCost.toFixed(2)}`,
          cacheHitRate: `${(t.cacheHitRate * 100).toFixed(1)}%`,
          cacheSavings: `$${t.totalSaved.toFixed(2)}`,
          dateRange: t.dateRange,
          forecast: data.forecast,
        }, null, 2),
      }],
    };
  });

  server.tool('get_top_sessions', {
    description: 'Get the most expensive sessions, optionally filtered by project and date',
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    project: { type: 'string', description: 'Filter by project name (partial match)' },
    limit: { type: 'number', description: 'Number of sessions to return (default 10)' },
  }, async ({ from, to, project, limit = 10 }) => {
    const data = await parseAllSessions({ from, to });
    let sessions = data.sessions;
    if (project) {
      sessions = sessions.filter(s => s.project.toLowerCase().includes(project.toLowerCase()));
    }
    const top = sessions.slice(0, limit).map(s => ({
      date: s.date,
      project: s.project,
      firstPrompt: s.firstPrompt,
      model: s.model,
      queryCount: s.queryCount,
      totalTokens: s.totalTokens,
      cost: `$${s.cost.toFixed(4)}`,
      durationMinutes: s.durationMinutes,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(top, null, 2) }] };
  });

  server.tool('get_project_breakdown', {
    description: 'Get token usage broken down by project',
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
  }, async ({ from, to }) => {
    const data = await parseAllSessions({ from, to });
    const projects = data.projectBreakdown.map(p => ({
      project: p.project,
      totalTokens: p.totalTokens,
      sessionCount: p.sessionCount,
      queryCount: p.queryCount,
      models: p.modelBreakdown.map(m => ({ model: m.model, tokens: m.totalTokens })),
    }));
    return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
  });

  server.tool('get_insights', {
    description: 'Get AI-generated insights about token usage patterns',
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
  }, async ({ from, to }) => {
    const data = await parseAllSessions({ from, to });
    return { content: [{ type: 'text', text: JSON.stringify(data.insights, null, 2) }] };
  });

  server.tool('get_daily_trend', {
    description: 'Get daily token usage and cost data for trend analysis',
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
  }, async ({ from, to }) => {
    const data = await parseAllSessions({ from, to });
    return { content: [{ type: 'text', text: JSON.stringify(data.dailyUsage, null, 2) }] };
  });

  return server;
}

async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

module.exports = { createMcpServer, startMcpServer };
```

**Step 3: Add --mcp flag to index.js**

After the existing CLI arg parsing, add:

```javascript
if (args.includes('--mcp')) {
  require('./mcp').startMcpServer().catch(err => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
  return; // Don't start Express server
}
```

**Step 4: Write basic MCP tests**

```javascript
// tests/mcp.test.js
const { createMcpServer } = require('../src/mcp');

describe('MCP server', () => {
  test('creates server with expected tools', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});
```

**Step 5: Update package.json bin to document MCP mode**

Add to help text in index.js:
```
  claude-spend --mcp        Run as MCP server (stdio)
```

**Step 6: Run tests**

```bash
npm test
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add MCP server with 5 tools for programmatic spend queries"
```

---

### Task 10: Package Rebrand + README

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Update package.json**

```json
{
  "name": "@mpalermiti/claude-spend",
  "version": "2.0.0",
  "description": "See where your Claude Code tokens go. Deep analytics, date filtering, MCP server.",
  "author": "Michael Palermiti",
  "bin": {
    "claude-spend": "src/index.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/mpalermiti/claude-spend.git"
  }
}
```

Keep all existing dependencies + the new ones.

**Step 2: Write new README**

Include:
- One-line description
- Screenshot placeholder
- `npx @mpalermiti/claude-spend` quick start
- Feature list (date filtering, analytics, dark mode, MCP)
- MCP configuration snippet for claude settings:
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
- CLI flags reference
- Credit to Aniket's original

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: rebrand to @mpalermiti/claude-spend v2.0.0"
```

---

### Task 11: Integration QA + Polish

**Files:**
- Various (bug fixes from QA)

**Step 1: Run full test suite**

```bash
npm test
```

All tests must pass.

**Step 2: Manual QA checklist**

Run `node src/index.js` and verify:

- [ ] Dashboard loads with lifetime data
- [ ] All 7 date presets work (Lifetime, This Month, Last Month, This Week, Last Week, Today, Custom)
- [ ] Custom date range picker works
- [ ] Dark mode toggle works
- [ ] Stat cards show correct numbers
- [ ] Daily chart renders with 7-day MA line
- [ ] Model donut chart renders
- [ ] Tool usage horizontal bars render
- [ ] Insights expand/collapse
- [ ] Session table sorts by all columns
- [ ] Session search filters correctly
- [ ] Session drill-down opens with cost chart + context growth
- [ ] Forecast stat card shows reasonable projection
- [ ] Session duration shows in table
- [ ] Share card generates correctly
- [ ] Refresh button works
- [ ] Empty state (date range with no data) shows gracefully

**Step 3: Test MCP mode**

```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":1}' | node src/index.js --mcp
```

Verify it responds with valid MCP initialization.

**Step 4: Fix any issues found**

Address bugs, layout issues, edge cases.

**Step 5: Final commit**

```bash
git add -A && git commit -m "fix: QA polish and bug fixes"
```

---

### Task 12: Create GitHub Repo + Publish

**Step 1: Create GitHub repo**

```bash
gh repo create mpalermiti/claude-spend --public --source=. --remote=origin --push
```

**Step 2: Publish to npm**

```bash
npm publish --access public
```

**Step 3: Verify installation**

```bash
npx @mpalermiti/claude-spend
```

**Step 4: Add MCP config to Claude Code settings**

Add to `~/.claude/settings.json`:
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

**Step 5: Update memory**

Update the claude-spend memory entry to point to the new local project path and `@mpalermiti/claude-spend` package.
