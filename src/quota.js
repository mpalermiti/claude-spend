// Subscription rate-limit utilization for the signed-in Claude account.
//
// Max/Pro plans are metered as rolling windows (5-hour session, 7-day weekly),
// not dollars. This reads the same endpoint Claude Code's /usage command reads.
// It is not a documented public API, so everything here is best-effort: any
// failure returns null and the caller falls back to token-based estimates.
//
// The OAuth token comes from the macOS login keychain (where Claude Code stores
// it) and/or ~/.claude/.credentials.json — whichever copy is still live. It is never logged.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function keychainCredential() {
  if (process.platform !== 'darwin') return null;
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(raw).claudeAiOauth || null;
  } catch {
    return null;   // keychain locked, item missing, or prompt declined
  }
}

function fileCredential() {
  try {
    return JSON.parse(fs.readFileSync(path.join(claudeDir(), '.credentials.json'), 'utf8')).claudeAiOauth || null;
  } catch {
    return null;
  }
}

// Claude Code keeps credentials in two places on macOS — the login keychain and
// ~/.claude/.credentials.json — and they drift: a refresh can land in the file while the
// keychain copy stays frozen on the token it last wrote. Preferring the keychain and trusting
// it blindly is how a background reader served an expired token for ten hours. So read both
// and take the one that is still live (the later expiry wins; a credential with no expiry is
// taken at its word). If every copy is expired, the freshest is still the best guess.
function pickCredential(creds, now = Date.now()) {
  const usable = creds.filter((c) => c && c.accessToken);
  if (!usable.length) return null;
  const expiry = (c) => (c.expiresAt == null ? Infinity : c.expiresAt);
  const live = usable.filter((c) => expiry(c) > now);
  return (live.length ? live : usable).sort((a, b) => expiry(b) - expiry(a))[0];
}

function readOAuthToken({ creds = [keychainCredential(), fileCredential()], now = Date.now() } = {}) {
  const chosen = pickCredential(creds, now);
  return chosen ? chosen.accessToken : null;
}

function parseQuota(payload) {
  const window = (w) => (w ? { utilization: w.utilization ?? null, resetsAt: w.resets_at ?? null } : null);
  return {
    fiveHour: window(payload.five_hour),
    sevenDay: window(payload.seven_day),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchQuota({ token = readOAuthToken(), fetchImpl = fetch } = {}) {
  if (!token) return null;
  try {
    const res = await fetchImpl(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-spend',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return parseQuota(await res.json());
  } catch {
    return null;
  }
}

// "session 58% (resets 23:10 UTC) · weekly 28% (resets Sep 10)"
function formatQuota(q) {
  if (!q) return 'quota unavailable';
  const when = (iso, style) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (style === 'time') return ` (resets ${d.toISOString().slice(11, 16)} UTC)`;
    return ` (resets ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`;
  };
  const parts = [];
  if (q.fiveHour) parts.push(`session ${q.fiveHour.utilization}%${when(q.fiveHour.resetsAt, 'time')}`);
  if (q.sevenDay) parts.push(`weekly ${q.sevenDay.utilization}%${when(q.sevenDay.resetsAt, 'date')}`);
  return parts.join(' · ') || 'quota unavailable';
}

module.exports = { fetchQuota, parseQuota, readOAuthToken, pickCredential, formatQuota, USAGE_URL };
