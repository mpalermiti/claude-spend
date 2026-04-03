const request = require('supertest');
const { createServer } = require('../src/server');

describe('GET /api/data', () => {
  const app = createServer();

  test('returns JSON with sessions array and totals', async () => {
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessions');
    expect(res.body).toHaveProperty('totals');
  });

  test('accepts from and to query params', async () => {
    const res = await request(app).get('/api/data?from=2099-01-01&to=2099-12-31');
    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBe(0);
  });
});

describe('GET /api/presets', () => {
  const app = createServer();

  test('returns preset date ranges', async () => {
    const res = await request(app).get('/api/presets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('thisWeek');
    expect(res.body).toHaveProperty('lastWeek');
    expect(res.body).toHaveProperty('thisMonth');
    expect(res.body).toHaveProperty('lastMonth');
    expect(res.body).toHaveProperty('lifetime');
    expect(res.body.today).toHaveProperty('from');
    expect(res.body.today).toHaveProperty('to');
    expect(res.body.lifetime).toEqual({});
  });
});

describe('GET /api/refresh', () => {
  const app = createServer();

  test('forces re-parse and returns ok', async () => {
    const res = await request(app).get('/api/refresh');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });
});
