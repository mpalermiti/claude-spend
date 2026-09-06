// Non-interactive spend report: groups sessions either by a caller-supplied
// label→session-id map (a construct run: "mission#iter:uuid,...") or by
// project dir, and renders markdown for a report file or JSON for machines.
//
// Subagent transcripts fold into the session that spawned them via
// parentSessionId, so one worker row = the worker plus everything it delegated.
const { parseAllSessions } = require('./parser');
const { getPricing } = require('./pricing');
const { fetchQuota } = require('./quota');

// "amby#1:aaaa,bbbb" → [{label:'amby#1', id:'aaaa'}, {label:'bbbb', id:'bbbb'}]
function parseSessionArg(arg) {
  return String(arg || '').split(',').map(s => s.trim()).filter(Boolean).map(item => {
    const at = item.lastIndexOf(':');
    return at === -1 ? { label: item, id: item } : { label: item.slice(0, at), id: item.slice(at + 1) };
  });
}

function summarize(sessions) {
  const sum = (key) => sessions.reduce((acc, s) => acc + (s[key] || 0), 0);
  const inputTokens = sum('inputTokens');
  const outputTokens = sum('outputTokens');
  const cacheCreationTokens = sum('cacheCreationTokens');
  const cacheReadTokens = sum('cacheReadTokens');
  const allInput = inputTokens + cacheCreationTokens + cacheReadTokens;
  const modelCounts = {};
  for (const s of sessions) modelCounts[s.model] = (modelCounts[s.model] || 0) + (s.queryCount || 0);
  const model = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    calls: sum('queryCount'),
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    tokens: allInput + outputTokens,
    cost: sum('cost'),
    saved: sum('saved'),
    cacheHitRate: allInput > 0 ? cacheReadTokens / allInput : 0,
    durationMinutes: sessions.reduce((m, s) => Math.max(m, s.durationMinutes || 0), 0),
    model,
  };
}

function inRange(session, from, to) {
  if (!session.date || session.date === 'unknown') return true;
  if (from && session.date < from) return false;
  if (to && session.date > to) return false;
  return true;
}

// Per-day cost for the last `days` days ending at `today`, zero-filled, oldest first.
// Uses per-query timestamps so a session that crosses midnight lands on both days.
function dailyTrend(sessions, days, today) {
  const end = new Date(`${today}T00:00:00Z`);
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setUTCDate(end.getUTCDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const s of sessions) {
    for (const q of s.queries || []) {
      const day = (q.assistantTimestamp || q.userTimestamp || '').slice(0, 10);
      if (buckets.has(day)) buckets.set(day, buckets.get(day) + (q.cost || 0));
    }
  }
  return [...buckets].map(([date, cost]) => ({ date, cost }));
}

async function buildReport({
  from, to, project, sessions, trendDays = 0, quota = true, quotaBefore = null,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const data = await parseAllSessions({});
  const all = data.sessions;
  const inProject = (s) => !project || String(s.project).includes(project);
  const scoped = all.filter(s => inRange(s, from, to));

  let mode, rows, matched, other, trendScope;
  if (sessions && sessions.length) {
    mode = 'sessions';
    const wanted = new Set(sessions.map(s => s.id));
    rows = sessions.map(({ label, id }) => {
      const mine = scoped.filter(s => s.parentSessionId === id);
      return { label, sessionId: id, found: mine.length > 0, ...summarize(mine) };
    });
    matched = scoped.filter(s => wanted.has(s.parentSessionId));
    const days = new Set(matched.map(s => s.date));
    const rest = scoped.filter(s => !wanted.has(s.parentSessionId) && days.has(s.date));
    other = { cost: rest.reduce((a, s) => a + s.cost, 0), sessions: new Set(rest.map(s => s.parentSessionId)).size };
    const projects = new Set(matched.map(s => s.project));
    trendScope = project ? inProject : (s) => projects.has(s.project);
  } else {
    mode = 'projects';
    matched = scoped.filter(inProject);
    const groups = new Map();
    for (const s of matched) groups.set(s.project, [...(groups.get(s.project) || []), s]);
    rows = [...groups].map(([label, group]) => ({ label, sessionId: null, found: true, ...summarize(group) }))
      .sort((a, b) => b.cost - a.cost);
    other = null;
    trendScope = inProject;
  }

  const totals = summarize(matched);
  const plan = data.plan || null;
  const planShare = plan && plan.monthlyUsd ? totals.cost / plan.monthlyUsd : null;
  const trend = trendDays > 0 ? dailyTrend(all.filter(trendScope), trendDays, today) : [];

  let quotaResult = null;
  if (quota !== false) {
    const after = await fetchQuota();
    if (after || quotaBefore) quotaResult = { before: quotaBefore || null, after };
  }

  return { generatedAt: new Date().toISOString(), date: today, mode, project: project || null, rows, totals, other, plan, planShare, quota: quotaResult, trendDays, trend };
}

// ---- rendering ---------------------------------------------------------------

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}
const fmtUsd = (n) => '$' + n.toFixed(2);
const fmtPct = (r) => Math.round(r * 100) + '%';
const tierOf = (model) => (model ? getPricing(model).tier : '—');

function resetsAt(iso, style) {
  if (!iso) return '';
  const d = new Date(iso);
  return style === 'time'
    ? ` (resets ${d.toISOString().slice(11, 16)} UTC)`
    : ` (resets ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`;
}

function quotaLine({ before, after }) {
  const win = (key, style) => {
    const b = before && before[key]; const a = after && after[key];
    if (!a && !b) return null;
    const name = key === 'fiveHour' ? 'session' : 'weekly';
    const arrow = b && a ? `${b.utilization}% → ${a.utilization}%` : `${(a || b).utilization}%`;
    return `${name} ${arrow}${resetsAt((a || b).resetsAt, style)}`;
  };
  return [win('fiveHour', 'time'), win('sevenDay', 'date')].filter(Boolean).join(' · ');
}

function renderMarkdown(r) {
  const lines = [];
  lines.push(`### spend — ${r.date} (API-equivalent at Anthropic list prices)`);
  lines.push('');
  lines.push(r.mode === 'sessions'
    ? '| worker | model | calls | tokens | cache hit | api-equiv |'
    : '| project | model | calls | tokens | cache hit | api-equiv |');
  lines.push('|---|---|---:|---:|---:|---:|');
  for (const row of r.rows) {
    lines.push(row.found
      ? `| ${row.label} | ${tierOf(row.model)} | ${row.calls} | ${fmtTokens(row.tokens)} | ${fmtPct(row.cacheHitRate)} | ${fmtUsd(row.cost)} |`
      : `| ${row.label} | — | — | — | — | not found |`);
  }
  const t = r.totals;
  const scope = r.mode === 'sessions' ? 'run' : 'selection';
  lines.push(`| **${scope} total** | | **${t.calls}** | **${fmtTokens(t.tokens)}** | **${fmtPct(t.cacheHitRate)}** | **${fmtUsd(t.cost)}** |`);
  lines.push('');

  const planBits = [];
  if (r.plan) {
    planBits.push(r.plan.monthlyUsd ? `Plan: ${r.plan.label} ($${r.plan.monthlyUsd}/mo)` : `Plan: ${r.plan.label}`);
    if (r.planShare !== null) planBits.push(`this ${scope} = ${Math.round(r.planShare * 100)}% of a month's plan price`);
  }
  if (r.other) planBits.push(`other sessions on the same days: ${fmtUsd(r.other.cost)} across ${r.other.sessions} session${r.other.sessions === 1 ? '' : 's'}`);
  if (planBits.length) lines.push(planBits.join(' · '));
  if (r.quota) lines.push(`Quota: ${quotaLine(r.quota)}`);
  if (r.trend.length) {
    const scopeLabel = r.project ? ` (${r.project})` : '';
    const first = r.trend[0].date.slice(5).replace('-', '/'), last = r.trend[r.trend.length - 1].date.slice(5).replace('-', '/');
    lines.push(`${r.trendDays}-day${scopeLabel}: ${r.trend.map(d => fmtUsd(d.cost)).join(' · ')} (${first} → ${last})`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { buildReport, renderMarkdown, parseSessionArg, dailyTrend };
