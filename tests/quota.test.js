const { parseQuota, fetchQuota } = require('../src/quota');

const payload = {
  five_hour: { utilization: 58, resets_at: '2026-09-06T23:10:01Z' },
  seven_day: { utilization: 28, resets_at: '2026-09-10T15:00:01Z' },
};

test('parseQuota picks the two rolling windows', () => {
  const q = parseQuota(payload);
  expect(q.fiveHour).toEqual({ utilization: 58, resetsAt: '2026-09-06T23:10:01Z' });
  expect(q.sevenDay.utilization).toBe(28);
  expect(typeof q.fetchedAt).toBe('string');
});

test('fetchQuota sends the bearer token and parses the response', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization, beta: opts.headers['anthropic-beta'] });
    return { ok: true, json: async () => payload };
  };
  const q = await fetchQuota({ token: 'tok', fetchImpl });
  expect(q.sevenDay.utilization).toBe(28);
  expect(calls[0].url).toBe('https://api.anthropic.com/api/oauth/usage');
  expect(calls[0].auth).toBe('Bearer tok');
  expect(calls[0].beta).toBe('oauth-2025-04-20');
});

test('fetchQuota returns null on network error, non-2xx, or no token — never throws', async () => {
  expect(await fetchQuota({ token: 'tok', fetchImpl: async () => { throw new Error('net'); } })).toBeNull();
  expect(await fetchQuota({ token: 'tok', fetchImpl: async () => ({ ok: false, status: 401 }) })).toBeNull();
  expect(await fetchQuota({ token: null, fetchImpl: async () => { throw new Error('must not be called'); } })).toBeNull();
});
