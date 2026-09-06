const path = require('path');

const HOME = path.join(__dirname, 'fixtures', 'claude-home');
let buildReport, renderMarkdown, parseSessionArg;

beforeAll(() => {
  process.env.CLAUDE_CONFIG_DIR = HOME;
  jest.resetModules();
  ({ buildReport, renderMarkdown, parseSessionArg } = require('../src/report'));
});
afterAll(() => { delete process.env.CLAUDE_CONFIG_DIR; });

test('parseSessionArg splits label:id on the last colon; bare ids label themselves', () => {
  expect(parseSessionArg('amby#1:aaaa,bbbb')).toEqual([
    { label: 'amby#1', id: 'aaaa' },
    { label: 'bbbb', id: 'bbbb' },
  ]);
});

test('sessions mode folds subagents into the parent row and flags missing ids', async () => {
  const r = await buildReport({
    sessions: [{ label: 'amby#1', id: 'aaaa' }, { label: 'ghost', id: 'zzzz' }],
    quota: false,
  });
  expect(r.mode).toBe('sessions');
  // parent (2 calls, 450 out) + workflow agent (2 calls, 200 out)
  expect(r.rows[0]).toMatchObject({ label: 'amby#1', found: true, calls: 4, outputTokens: 650, model: 'claude-opus-5' });
  expect(r.rows[1]).toMatchObject({ label: 'ghost', found: false, calls: 0, cost: 0 });
  expect(r.totals.calls).toBe(4);
  expect(r.totals.cost).toBeCloseTo(r.rows[0].cost, 9);
  expect(r.plan.id).toBe('max-5x');
  expect(r.planShare).toBeCloseTo(r.totals.cost / 100, 9);
  expect(r.quota).toBeNull();
  expect(r.other).toEqual({ cost: 0, sessions: 0 });
});

test('projects mode groups by project dir and honors the substring filter', async () => {
  const r = await buildReport({ project: 'x-proj', quota: false });
  expect(r.mode).toBe('projects');
  expect(r.rows).toHaveLength(1);
  expect(r.rows[0]).toMatchObject({ label: '-Users-x-proj', calls: 4 });
  const none = await buildReport({ project: 'nope', quota: false });
  expect(none.rows).toHaveLength(0);
});

test('trend covers the requested days, oldest first, zero-filled', async () => {
  const r = await buildReport({ project: 'x-proj', trendDays: 3, quota: false, today: '2026-09-02' });
  expect(r.trend.map(d => d.date)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02']);
  expect(r.trend[1].cost).toBeGreaterThan(0);
  expect(r.trend[0].cost).toBe(0);
});

test('markdown has the worker table, a totals row, plan and trend lines', async () => {
  const r = await buildReport({ sessions: [{ label: 'amby#1', id: 'aaaa' }], trendDays: 2, quota: false, today: '2026-09-01' });
  const md = renderMarkdown(r);
  expect(md).toMatch(/\| worker \| model \| calls \| tokens \| cache hit \| api-equiv \|/);
  expect(md).toMatch(/\| amby#1 \| opus-5 \| 4 \|/);
  expect(md).toMatch(/\*\*run total\*\*/);
  expect(md).toMatch(/Plan: Max 5x \(\$100\/mo\)/);
  expect(md).toMatch(/2-day/);
  expect(md).not.toMatch(/Quota:/);
});
