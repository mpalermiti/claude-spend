const express = require('express');
const path = require('path');
function createServer() {
  const app = express();

  // Cache parsed data (reparse on demand via refresh endpoint)
  let cachedData = null;

  function friendlyError(err) {
    const msg = err.message || String(err);
    if (err.code === 'ENOENT') return { error: 'Claude Code data directory not found. Have you used Claude Code yet?', code: 'ENOENT' };
    if (err.code === 'EPERM' || err.code === 'EACCES') return { error: 'Permission denied reading Claude Code data. Try running with elevated permissions.', code: err.code };
    return { error: msg };
  }

  app.get('/api/data', async (req, res) => {
    try {
      const { from, to } = req.query;
      const hasFilter = from || to;
      if (!hasFilter && cachedData) {
        return res.json(cachedData);
      }
      const data = await require('./parser').parseAllSessions({ from, to });
      if (!hasFilter) {
        cachedData = data;
      }
      res.json(data);
    } catch (err) {
      res.status(500).json(friendlyError(err));
    }
  });

  app.get('/api/refresh', async (req, res) => {
    try {
      delete require.cache[require.resolve('./parser')];
      const { from, to } = req.query;
      cachedData = await require('./parser').parseAllSessions({ from, to });
      res.json({ ok: true, sessions: cachedData.sessions.length });
    } catch (err) {
      res.status(500).json(friendlyError(err));
    }
  });

  app.get('/api/version', (req, res) => {
    const pkg = require('../package.json');
    res.json({ version: pkg.version });
  });

  app.get('/api/presets', (req, res) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfWeek);
    endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    res.json({
      today: { from: today, to: today },
      thisWeek: { from: startOfWeek.toISOString().split('T')[0], to: today },
      lastWeek: { from: startOfLastWeek.toISOString().split('T')[0], to: endOfLastWeek.toISOString().split('T')[0] },
      thisMonth: { from: startOfMonth.toISOString().split('T')[0], to: today },
      lastMonth: { from: startOfLastMonth.toISOString().split('T')[0], to: endOfLastMonth.toISOString().split('T')[0] },
      lifetime: {},
    });
  });

  // Serve static dashboard
  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}

module.exports = { createServer };
