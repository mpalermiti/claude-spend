const { computeSessionDuration, computeForecast } = require('../src/parser');

describe('computeSessionDuration', () => {
  test('calculates duration in minutes from first to last timestamp', () => {
    const session = {
      queries: [
        { assistantTimestamp: '2026-04-01T10:00:00Z' },
        { assistantTimestamp: '2026-04-01T10:30:00Z' },
        { assistantTimestamp: '2026-04-01T11:15:00Z' },
      ]
    };
    expect(computeSessionDuration(session)).toBe(75);
  });

  test('returns 0 for single-query sessions', () => {
    const session = {
      queries: [{ assistantTimestamp: '2026-04-01T10:00:00Z' }]
    };
    expect(computeSessionDuration(session)).toBe(0);
  });

  test('returns 0 for sessions with no timestamps', () => {
    const session = { queries: [{ assistantTimestamp: null }] };
    expect(computeSessionDuration(session)).toBe(0);
  });
});

describe('computeForecast', () => {
  test('projects monthly cost from daily data', () => {
    const dailyUsage = [
      { date: '2026-04-01', cost: 5.00 },
      { date: '2026-04-02', cost: 3.00 },
    ];
    const forecast = computeForecast(dailyUsage);
    expect(forecast.avgDailyCost).toBe(4.00);
    expect(forecast.projectedMonthlyCost).toBe(120.00);
    expect(forecast.daysOfData).toBe(2);
  });

  test('returns zeros for empty data', () => {
    const forecast = computeForecast([]);
    expect(forecast.projectedMonthlyCost).toBe(0);
    expect(forecast.avgDailyCost).toBe(0);
  });
});
