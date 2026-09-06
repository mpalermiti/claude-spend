// Anthropic API list prices, USD per million tokens.
// Source: platform.claude.com/docs/en/about-claude/pricing (via the claude-api skill table, 2026-06-24).
//
// These are API-EQUIVALENT estimates: what the same tokens would cost on the API.
// Claude Code subscriptions (Pro / Max) are billed differently — see src/plan.js.
//
// Cache reads default to 0.1× input. Cache writes are 1.25× input for the 5-minute
// TTL and 2× for the 1-hour TTL (Claude Code uses the 1-hour TTL).
const TIERS = {
  'fable-5.1':  { input: 10,  output: 50, cacheRead: 0.25 }, // Fable 5.1 / Mythos 5.1: cache reads 0.025×
  'fable-5':    { input: 10,  output: 50, cacheRead: 1.00 }, // Fable 5 / Mythos 5
  'opus-5':     { input: 5,   output: 25, cacheRead: 0.50 }, // Opus 5, 4.8, 4.7, 4.6, 4.5
  'opus-4':     { input: 15,  output: 75, cacheRead: 1.50 }, // Opus 4.1, 4.0, 3
  'sonnet-5':   { input: 2,   output: 10, cacheRead: 0.20 }, // Sonnet 5
  'sonnet-4':   { input: 3,   output: 15, cacheRead: 0.30 }, // Sonnet 4.6, 4.5, 4, 3.7, 3.5
  'haiku-4.5':  { input: 1,   output: 5,  cacheRead: 0.10 }, // Haiku 4.5
  'haiku-3.5':  { input: 0.8, output: 4,  cacheRead: 0.08 }, // Haiku 3.5, 3
};
const DEFAULT_TIER = 'sonnet-4';
const FAMILIES = ['fable', 'mythos', 'opus', 'sonnet', 'haiku'];

// "claude-opus-4-8", "claude-opus-4-5-20251101", "claude-3-5-haiku-20241022",
// "claude-opus-5[1m]", "us.anthropic.claude-opus-4-8-v1:0" → { family, version }.
// The major version is a single digit, so 8-digit date suffixes never match.
function parseModel(model) {
  const m = String(model || '').toLowerCase();
  const family = FAMILIES.find(f => m.includes(f));
  if (!family) return null;
  const at = m.indexOf(family);
  const after = m.slice(at + family.length).match(/^-?(\d)(?:[-.](\d{1,2}))?(?!\d)/);
  const before = m.slice(0, at).match(/(\d)(?:[-.](\d{1,2}))?-$/);
  const v = after || before;
  const version = v ? parseFloat(`${v[1]}.${v[2] || '0'}`) : 0;
  return { family, version };
}

function tierFor(parsed) {
  if (!parsed) return DEFAULT_TIER;
  const { family, version } = parsed;
  if (family === 'fable' || family === 'mythos') return version >= 5.1 ? 'fable-5.1' : 'fable-5';
  if (family === 'opus') return version >= 4.5 ? 'opus-5' : 'opus-4';
  if (family === 'sonnet') return version >= 5 ? 'sonnet-5' : 'sonnet-4';
  if (family === 'haiku') return version >= 4 ? 'haiku-4.5' : 'haiku-3.5';
  return DEFAULT_TIER;
}

// Per-token USD for a model id.
function getPricing(model) {
  const tier = tierFor(parseModel(model));
  const t = TIERS[tier];
  return {
    tier,
    input: t.input / 1e6,
    output: t.output / 1e6,
    cacheRead: t.cacheRead / 1e6,
    cacheWrite5m: (t.input * 1.25) / 1e6,
    cacheWrite1h: (t.input * 2) / 1e6,
  };
}

// Cost of one API response from its `usage` block. Handles both the modern
// per-TTL breakdown (usage.cache_creation.ephemeral_{5m,1h}_input_tokens) and
// legacy transcripts that only carry cache_creation_input_tokens.
function costForUsage(model, usage = {}) {
  const p = getPricing(model);
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const breakdown = usage.cache_creation || {};
  const w1h = breakdown.ephemeral_1h_input_tokens || 0;
  let w5m = breakdown.ephemeral_5m_input_tokens || 0;
  if (w1h + w5m === 0) w5m = usage.cache_creation_input_tokens || 0;
  const cost = input * p.input + output * p.output + cacheRead * p.cacheRead
    + w5m * p.cacheWrite5m + w1h * p.cacheWrite1h;
  const saved = cacheRead * (p.input - p.cacheRead);
  return { cost, saved, cacheCreationTokens: w1h + w5m };
}

module.exports = { TIERS, parseModel, getPricing, costForUsage };
