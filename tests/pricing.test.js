const { parseModel, getPricing, costForUsage } = require('../src/pricing');

describe('parseModel', () => {
  test.each([
    ['claude-opus-5', 'opus', 5],
    ['claude-opus-5[1m]', 'opus', 5],
    ['claude-fable-5-1', 'fable', 5.1],
    ['claude-opus-4-8', 'opus', 4.8],
    ['claude-opus-4-5-20251101', 'opus', 4.5],
    ['claude-opus-4-20250514', 'opus', 4],
    ['claude-3-5-haiku-20241022', 'haiku', 3.5],
    ['claude-3-opus-20240229', 'opus', 3],
    ['claude-sonnet-4-6', 'sonnet', 4.6],
    ['us.anthropic.claude-opus-4-8-v1:0', 'opus', 4.8],
  ])('%s → %s %s', (id, family, version) => {
    expect(parseModel(id)).toEqual({ family, version });
  });

  test('unknown model → null', () => {
    expect(parseModel('gpt-5')).toBeNull();
  });
});

describe('getPricing tiers ($/MTok)', () => {
  const mtok = (p) => ({ input: p.input * 1e6, output: p.output * 1e6, cacheRead: p.cacheRead * 1e6 });

  test('opus 5 is $5/$25', () => {
    expect(mtok(getPricing('claude-opus-5'))).toEqual({ input: 5, output: 25, cacheRead: 0.5 });
  });
  test('opus 4.7 and 4.8 share the opus-5 tier', () => {
    expect(getPricing('claude-opus-4-7').tier).toBe('opus-5');
    expect(getPricing('claude-opus-4-8').tier).toBe('opus-5');
  });
  test('opus 4.1 is legacy $15/$75', () => {
    expect(mtok(getPricing('claude-opus-4-1'))).toEqual({ input: 15, output: 75, cacheRead: 1.5 });
  });
  test('fable 5.1 is $10/$50 with $0.25 cache reads', () => {
    expect(mtok(getPricing('claude-fable-5-1'))).toEqual({ input: 10, output: 50, cacheRead: 0.25 });
  });
  test('fable 5 cache reads are 0.1x', () => {
    expect(mtok(getPricing('claude-fable-5')).cacheRead).toBe(1);
  });
  test('sonnet 5 is $2/$10, sonnet 4.6 is $3/$15', () => {
    expect(mtok(getPricing('claude-sonnet-5')).input).toBe(2);
    expect(mtok(getPricing('claude-sonnet-4-6')).input).toBe(3);
  });
  test('haiku 4.5 is $1/$5', () => {
    expect(mtok(getPricing('claude-haiku-4-5')).output).toBe(5);
  });
  test('unknown model falls back to the sonnet-4 tier', () => {
    expect(getPricing('gpt-5').tier).toBe('sonnet-4');
  });
  test('cache write multipliers: 1.25x for 5m, 2x for 1h', () => {
    const p = getPricing('claude-opus-5');
    expect(p.cacheWrite5m).toBeCloseTo(p.input * 1.25, 12);
    expect(p.cacheWrite1h).toBeCloseTo(p.input * 2, 12);
  });
});

describe('costForUsage', () => {
  test('splits 1h and 5m cache writes', () => {
    const { cost, cacheCreationTokens } = costForUsage('claude-opus-5', {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 2_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 1_000_000 },
    });
    // $5 input + $10 (1h write at 2x) + $6.25 (5m write at 1.25x)
    expect(cost).toBeCloseTo(21.25, 6);
    expect(cacheCreationTokens).toBe(2_000_000);
  });
  test('legacy transcripts without a TTL breakdown price writes at the 5m rate', () => {
    const { cost } = costForUsage('claude-opus-5', { cache_creation_input_tokens: 1_000_000 });
    expect(cost).toBeCloseTo(6.25, 6);
  });
  test('saved = cache reads at (input − cacheRead)', () => {
    const { saved } = costForUsage('claude-fable-5-1', { cache_read_input_tokens: 1_000_000 });
    expect(saved).toBeCloseTo(9.75, 6);
  });
});
