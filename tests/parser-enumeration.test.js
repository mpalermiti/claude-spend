const path = require('path');

const HOME = path.join(__dirname, 'fixtures', 'claude-home');
let parseAllSessions;

beforeAll(() => {
  process.env.CLAUDE_CONFIG_DIR = HOME;
  jest.resetModules();
  ({ parseAllSessions } = require('../src/parser'));
});
afterAll(() => { delete process.env.CLAUDE_CONFIG_DIR; });

test('walks workflow subagent transcripts and links them to the parent session', async () => {
  const { sessions } = await parseAllSessions({});
  const top = sessions.find(s => s.sessionId === 'aaaa');
  const agent = sessions.find(s => s.agentId === 'a1');

  expect(top).toBeDefined();
  expect(top.isSubagent).toBe(false);
  expect(top.parentSessionId).toBe('aaaa');
  expect(top.cwd).toBe('/Users/x/proj');

  expect(agent).toBeDefined();
  expect(agent.isSubagent).toBe(true);
  expect(agent.parentSessionId).toBe('aaaa');
  expect(agent.outputTokens).toBe(200);

  // journal.jsonl has no assistant usage → never becomes a session
  expect(sessions.some(s => s.sessionId === 'journal')).toBe(false);
});
