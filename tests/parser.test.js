const path = require('path');
const { parseJSONLFile, extractSessionData } = require('../src/parser');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sample-session.jsonl');

describe('parseJSONLFile', () => {
  test('parses fixture into array of entries', async () => {
    const entries = await parseJSONLFile(FIXTURE_PATH);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(4);
    expect(entries[0].type).toBe('user');
    expect(entries[1].type).toBe('assistant');
    expect(entries[2].type).toBe('user');
    expect(entries[3].type).toBe('assistant');
  });
});

describe('extractSessionData', () => {
  let queries;

  beforeAll(async () => {
    const entries = await parseJSONLFile(FIXTURE_PATH);
    queries = extractSessionData(entries);
  });

  test('extracts queries with token counts', () => {
    expect(queries).toHaveLength(2);

    // First assistant response
    expect(queries[0].inputTokens).toBe(5000);
    expect(queries[0].outputTokens).toBe(1200);
    expect(queries[0].cacheCreationTokens).toBe(3000);
    expect(queries[0].cacheReadTokens).toBe(2000);

    // Second assistant response
    expect(queries[1].inputTokens).toBe(8000);
    expect(queries[1].outputTokens).toBe(2500);
    expect(queries[1].cacheCreationTokens).toBe(1000);
    expect(queries[1].cacheReadTokens).toBe(6000);
  });

  test('extracts tool names', () => {
    expect(queries[0].tools).toEqual(['Read']);
    expect(queries[1].tools).toEqual(['Edit']);
  });

  test('pairs user prompts with assistant responses', () => {
    expect(queries[0].userPrompt).toBe('Fix the login bug');
    expect(queries[1].userPrompt).toBe('Great, now fix it');
  });

  test('calculates cost > 0', () => {
    for (const q of queries) {
      expect(q.cost).toBeGreaterThan(0);
    }
  });
});
