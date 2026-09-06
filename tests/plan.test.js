const path = require('path');
const { detectPlan, planFromTier } = require('../src/plan');

const HOME = path.join(__dirname, 'fixtures', 'claude-home');

test('reads Max 5x from a .claude.json in the config dir', () => {
  const p = detectPlan({ configDir: HOME, homeDir: '/nonexistent' });
  expect(p).toMatchObject({ id: 'max-5x', label: 'Max 5x', monthlyUsd: 100, tier: 'default_claude_max_5x' });
  expect(p.source).toBe(path.join(HOME, '.claude.json'));
});

test('maps known tiers and leaves unknown ones unpriced', () => {
  expect(planFromTier('default_claude_max_20x').monthlyUsd).toBe(200);
  expect(planFromTier('default_claude_pro').monthlyUsd).toBe(20);
  expect(planFromTier('something_new')).toEqual({ tier: 'something_new', id: 'something_new', label: 'something_new', monthlyUsd: null });
});

test('null when no config file is found', () => {
  expect(detectPlan({ configDir: '/nonexistent', homeDir: '/nonexistent' })).toBeNull();
});
