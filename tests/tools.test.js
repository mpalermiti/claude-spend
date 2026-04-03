const { aggregateToolUsage } = require('../src/parser');

describe('aggregateToolUsage', () => {
  test('counts tool calls across sessions', () => {
    const sessions = [{
      sessionId: 's1',
      queries: [
        { tools: ['Read', 'Bash', 'Read'] },
        { tools: ['Edit', 'Grep'] },
      ]
    }];
    const result = aggregateToolUsage(sessions);
    expect(result.find(t => t.tool === 'Read').count).toBe(2);
    expect(result.find(t => t.tool === 'Bash').count).toBe(1);
    expect(result.find(t => t.tool === 'Edit').count).toBe(1);
    expect(result.find(t => t.tool === 'Grep').count).toBe(1);
  });

  test('sorts by count descending', () => {
    const sessions = [{
      sessionId: 's1',
      queries: [
        { tools: ['Read', 'Read', 'Read'] },
        { tools: ['Edit'] },
      ]
    }];
    const result = aggregateToolUsage(sessions);
    expect(result[0].tool).toBe('Read');
    expect(result[0].count).toBe(3);
  });

  test('tracks session count per tool', () => {
    const sessions = [
      { sessionId: 's1', queries: [{ tools: ['Read'] }] },
      { sessionId: 's2', queries: [{ tools: ['Read', 'Edit'] }] },
    ];
    const result = aggregateToolUsage(sessions);
    expect(result.find(t => t.tool === 'Read').sessionCount).toBe(2);
    expect(result.find(t => t.tool === 'Edit').sessionCount).toBe(1);
  });

  test('returns empty array for no tools', () => {
    const sessions = [{ sessionId: 's1', queries: [{ tools: [] }] }];
    expect(aggregateToolUsage(sessions)).toEqual([]);
  });
});
