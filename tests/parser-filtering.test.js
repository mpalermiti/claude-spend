const { filterSessionsByDateRange, parseAllSessions } = require('../src/parser');

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

describe('parseAllSessions with date range', () => {
  test('accepts from/to options and returns empty for future dates', async () => {
    const result = await parseAllSessions({ from: '2099-01-01', to: '2099-12-31' });
    expect(result.sessions.length).toBe(0);
    expect(result.totals.totalTokens).toBe(0);
  });
});
