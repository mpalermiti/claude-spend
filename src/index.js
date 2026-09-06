#!/usr/bin/env node

const { createServer } = require('./server');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
claude-spend - See where your Claude Code tokens go

Usage:
  claude-spend [options]

Options:
  --port <port>   Port to run dashboard on (default: 3456)
  --no-open       Don't auto-open browser
  --mcp           Run as MCP server (stdio transport)
  --report        Print a spend report (markdown; --json for machines) and exit
  --quota         Print subscription window utilization and exit
  --help, -h      Show this help message

Report options:
  --from <date> --to <date>   Limit to YYYY-MM-DD range
  --project <substr>          Only project dirs containing this text
  --sessions <label:id,...>   One row per session id (subagents fold in);
                              label is optional ("mission#1:uuid" or just "uuid")
  --trend-days <n>            Append an n-day daily cost line
  --no-quota                  Skip the quota lookup
  --quota-before-file <path>  JSON from an earlier --quota --json, for a before→after line
  --json                      Machine-readable output

Examples:
  npx claude-spend                                  Open dashboard in browser
  claude-spend --port 8080                          Use custom port
  claude-spend --report --project myapp --trend-days 7
  claude-spend --report --sessions build#1:<uuid>,build#2:<uuid> --json
`);
  process.exit(0);
}

const arg = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };

if (args.includes('--quota')) {
  const { fetchQuota, formatQuota } = require('./quota');
  fetchQuota().then(q => {
    if (args.includes('--json')) console.log(JSON.stringify(q));
    else console.log(formatQuota(q));
    process.exit(q ? 0 : 1);
  });
} else if (args.includes('--report')) {
  const fs = require('fs');
  const { buildReport, renderMarkdown, parseSessionArg } = require('./report');
  const beforeFile = arg('--quota-before-file');
  let quotaBefore = null;
  if (beforeFile) {
    try { quotaBefore = JSON.parse(fs.readFileSync(beforeFile, 'utf8')); } catch { quotaBefore = null; }
  }
  buildReport({
    from: arg('--from'),
    to: arg('--to'),
    project: arg('--project'),
    sessions: arg('--sessions') ? parseSessionArg(arg('--sessions')) : undefined,
    trendDays: arg('--trend-days') ? parseInt(arg('--trend-days'), 10) : 0,
    quota: !args.includes('--no-quota'),
    quotaBefore,
  }).then(report => {
    process.stdout.write(args.includes('--json') ? JSON.stringify(report, null, 2) + '\n' : renderMarkdown(report));
  }).catch(err => {
    console.error('Report failed:', err.message || err);
    process.exit(1);
  });
} else if (args.includes('--mcp')) {
  require('./mcp').startMcpServer().catch(err => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
} else {
  const portIndex = args.indexOf('--port');
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3456;
  const noOpen = args.includes('--no-open');

  if (isNaN(port)) {
    console.error('Error: --port must be a number');
    process.exit(1);
  }

  const app = createServer();

  const server = app.listen(port, async () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  claude-spend dashboard running at ${url}\n`);

    if (!noOpen) {
      try {
        const open = (await import('open')).default;
        await open(url);
      } catch {
        console.log('  Could not auto-open browser. Open the URL manually.');
      }
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try --port <other-port>`);
      process.exit(1);
    }
    throw err;
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down...');
    server.close();
    process.exit(0);
  });
}
