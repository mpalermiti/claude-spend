const path = require('path');
const { parseJSONLFile, extractSessionData } = require('../src/parser');

const FIXTURE = path.join(__dirname, 'fixtures', 'multi-block-session.jsonl');

test('one API response spread over several block lines counts once', async () => {
  const queries = extractSessionData(await parseJSONLFile(FIXTURE));
  expect(queries).toHaveLength(2);
  expect(queries[0].outputTokens).toBe(400);
  expect(queries[0].cacheCreationTokens).toBe(28000);
  expect(queries[0].tools).toEqual(['Read']); // the tool_use block was on the 3rd line
  expect(queries[0].userPrompt).toBe('Fix the login bug');
  expect(queries[1].outputTokens).toBe(50);
});
