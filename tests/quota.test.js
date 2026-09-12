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

// Sept 11-12, 2026: the keychain copy expired at 21:14 and Claude Code refreshed the FILE copy
// instead. Reading the keychain first served a dead token to the usage endpoint for ten hours —
// every read came back null and the construct's governor paused all night on "couldn't read your
// usage". The picker must take the live credential whichever file it lives in.
const { pickCredential } = require('../src/quota');
const NOW = Date.UTC(2026, 8, 12, 14, 0);
const kc = { accessToken: 'stale', expiresAt: NOW - 3600e3 };
const file = { accessToken: 'fresh', expiresAt: NOW + 3600e3 };

test('pickCredential skips an expired copy for a live one, in either order', () => {
  expect(pickCredential([kc, file], NOW).accessToken).toBe('fresh');
  expect(pickCredential([file, kc], NOW).accessToken).toBe('fresh');
});

test('pickCredential takes the later expiry when both are live', () => {
  expect(pickCredential([{ accessToken: 'soon', expiresAt: NOW + 60e3 }, file], NOW).accessToken).toBe('fresh');
});

test('pickCredential falls back to the freshest when every copy is expired, and to null when there is none', () => {
  expect(pickCredential([{ accessToken: 'older', expiresAt: NOW - 7200e3 }, kc], NOW).accessToken).toBe('stale');
  expect(pickCredential([null, {}, undefined], NOW)).toBeNull();
});

test('a credential with no expiry is taken at its word', () => {
  expect(pickCredential([{ accessToken: 'no-expiry' }, kc], NOW).accessToken).toBe('no-expiry');
});

test('readOAuthToken returns the live token, not the first one it finds', () => {
  const { readOAuthToken } = require('../src/quota');
  expect(readOAuthToken({ creds: [kc, file], now: NOW })).toBe('fresh');
  expect(readOAuthToken({ creds: [], now: NOW })).toBeNull();
});
