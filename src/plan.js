// Which Claude subscription this machine is signed into.
//
// Claude Code records the org's rate-limit tier in ~/.claude.json (or
// $CLAUDE_CONFIG_DIR/.claude.json) under oauthAccount.organizationRateLimitTier,
// e.g. "default_claude_max_5x". That is enough to pick the plan's monthly price
// for the ROI multiplier without asking the user.
const fs = require('fs');
const os = require('os');
const path = require('path');

const KNOWN = [
  [/max_20x/, { id: 'max-20x', label: 'Max 20x', monthlyUsd: 200 }],
  [/max_5x/,  { id: 'max-5x',  label: 'Max 5x',  monthlyUsd: 100 }],
  [/pro/,     { id: 'pro',     label: 'Pro',     monthlyUsd: 20 }],
];

function planFromTier(tier) {
  const hit = KNOWN.find(([re]) => re.test(tier));
  return { tier, ...(hit ? hit[1] : { id: tier, label: tier, monthlyUsd: null }) };
}

function detectPlan({ configDir = process.env.CLAUDE_CONFIG_DIR, homeDir = os.homedir() } = {}) {
  const candidates = [
    configDir && path.join(configDir, '.claude.json'),
    path.join(homeDir, '.claude.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const account = JSON.parse(fs.readFileSync(file, 'utf8')).oauthAccount || {};
      const tier = account.organizationRateLimitTier || account.userRateLimitTier;
      if (tier) return { ...planFromTier(tier), source: file };
    } catch {
      // unreadable or absent — try the next candidate
    }
  }
  return null;
}

module.exports = { detectPlan, planFromTier };
