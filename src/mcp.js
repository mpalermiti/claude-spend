const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');
const { parseAllSessions } = require('./parser');

function createMcpServer() {
  const server = new McpServer({
    name: 'claude-spend',
    version: '2.0.0',
  });

  // Tool 1: Spend summary for a time period
  server.tool(
    'get_spend_summary',
    'Get token usage and cost summary for a time period',
    {
      from: z.string().optional().describe('Start date (YYYY-MM-DD). Omit for all time.'),
      to: z.string().optional().describe('End date (YYYY-MM-DD). Omit for all time.'),
    },
    async ({ from, to }) => {
      const data = await parseAllSessions({ from, to });
      const t = data.totals;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalSessions: t.totalSessions,
            totalQueries: t.totalQueries,
            totalTokens: t.totalTokens,
            totalInputTokens: t.totalInputTokens,
            totalOutputTokens: t.totalOutputTokens,
            totalCacheReadTokens: t.totalCacheReadTokens,
            estimatedCost: '$' + t.totalCost.toFixed(2),
            cacheHitRate: (t.cacheHitRate * 100).toFixed(1) + '%',
            cacheSavings: '$' + t.totalSaved.toFixed(2),
            dateRange: t.dateRange,
          }, null, 2),
        }],
      };
    }
  );

  // Tool 2: Top sessions by cost
  server.tool(
    'get_top_sessions',
    'Get the most expensive sessions, optionally filtered by project and date',
    {
      from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      to: z.string().optional().describe('End date (YYYY-MM-DD)'),
      project: z.string().optional().describe('Filter by project name (partial match)'),
      limit: z.number().optional().describe('Max sessions to return (default 10)'),
    },
    async ({ from, to, project, limit = 10 }) => {
      const data = await parseAllSessions({ from, to });
      let sessions = data.sessions;
      if (project) {
        sessions = sessions.filter(s =>
          s.project.toLowerCase().includes(project.toLowerCase())
        );
      }
      const top = sessions.slice(0, limit).map(s => ({
        date: s.date,
        project: s.project,
        firstPrompt: s.firstPrompt,
        model: s.model,
        queryCount: s.queryCount,
        totalTokens: s.totalTokens,
        cost: '$' + s.cost.toFixed(4),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(top, null, 2) }] };
    }
  );

  // Tool 3: Project breakdown
  server.tool(
    'get_project_breakdown',
    'Get token usage broken down by project',
    {
      from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      to: z.string().optional().describe('End date (YYYY-MM-DD)'),
    },
    async ({ from, to }) => {
      const data = await parseAllSessions({ from, to });
      const projects = data.projectBreakdown.map(p => ({
        project: p.project,
        totalTokens: p.totalTokens,
        sessionCount: p.sessionCount,
        queryCount: p.queryCount,
        models: p.modelBreakdown.map(m => ({ model: m.model, tokens: m.totalTokens })),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
    }
  );

  // Tool 4: Usage insights
  server.tool(
    'get_insights',
    'Get AI-generated insights about token usage patterns',
    {
      from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      to: z.string().optional().describe('End date (YYYY-MM-DD)'),
    },
    async ({ from, to }) => {
      const data = await parseAllSessions({ from, to });
      return { content: [{ type: 'text', text: JSON.stringify(data.insights, null, 2) }] };
    }
  );

  // Tool 5: Daily trend data
  server.tool(
    'get_daily_trend',
    'Get daily token usage and cost data for trend analysis',
    {
      from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      to: z.string().optional().describe('End date (YYYY-MM-DD)'),
    },
    async ({ from, to }) => {
      const data = await parseAllSessions({ from, to });
      return { content: [{ type: 'text', text: JSON.stringify(data.dailyUsage, null, 2) }] };
    }
  );

  return server;
}

async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

module.exports = { createMcpServer, startMcpServer };
