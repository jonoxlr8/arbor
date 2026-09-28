// Isolated synthetic browser review. All non-loopback requests are intercepted.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.ARBOR_REVIEW_ORIGIN ?? 'http://127.0.0.1:3000';
const askOnly = process.argv.includes('--ask-only');
const datedOnly = process.argv.includes('--dated-only');
const tabletGraphOnly = process.argv.includes('--tablet-graph-only');
const homeLayoutOnly = process.argv.includes('--home-layout-only');
const output = homeLayoutOnly ? '/private/tmp/arbor-home-layout-review' : tabletGraphOnly ? '/private/tmp/arbor-tablet-graph-review' : datedOnly ? '/private/tmp/arbor-dated-review' : askOnly ? '/private/tmp/arbor-ask-learn-review' : '/private/tmp/arbor-phase2b-retention-review';
await mkdir(output, { recursive: true });
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'phase2b@example.test', created_at: '2026-09-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })}.fixture-only`;
const session = { access_token: token, refresh_token: 'fixture-only', expires_in: 3600, token_type: 'bearer', user };
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const part = type => dateParts.find(value => value.type === type).value;
const today = `${part('year')}-${part('month')}-${part('day')}`;
const month = today.slice(0, 7);
const now = new Date().toISOString();
const weights = [{ role: 'global_equity', percentage_points: 80 }, { role: 'defensive', percentage_points: 0 }, { role: 'technology_tilt', percentage_points: 10 }, { role: 'crypto', percentage_points: 10 }];
const plan = { strategy_engine_version: '2.0', profile: { strategy_engine_version: '2.0', full_name: 'Phase Two QA', country: 'Philippines', currency: 'PHP', emergency_savings: 'three_to_six_months', high_interest_debt: 'none', goal_target: 500000, goal_name: 'Home', goal_date: '2036-09-28', current_portfolio_value: 0, monthly_investment: 10000, horizon: 'ten_plus_years', risk_response: 'hold', saved_preferences: { technology_tilt: 0, bitcoin: 0 }, selected_approach: 'Aggressive', explicit_customization: { technology_tilt: 10, bitcoin: 10 }, implementation_choices: { global_equity: 'gotrade_vt', crypto: 'pdax_btc' } }, plan: { plan_basis: 'user_selected', strategy_engine_version: '2.0', selection: { risk_response: 'hold', horizon: 'ten_plus_years', requested_strategy: 'Growth', horizon_maximum_strategy: 'Aggressive', selected_strategy: 'Growth', is_short_term: false, cap_applied: false, reason: 'requested_strategy_retained' }, readiness: { readiness: 'ready', core_strategy_can_be_shown: true, actionable_contribution_guidance_allowed: true, technology_satellite_readiness_eligible: true, bitcoin_satellite_readiness_eligible: true, message_requirement: 'none' }, inflation_pct: 3, preference_result: { technology_tilt: { requested_percentage_points: 0, effective_percentage_points: 0, strategy_cap_percentage_points: 10, reasons: [] }, bitcoin: { requested_percentage_points: 0, effective_percentage_points: 0, strategy_cap_percentage_points: 10, reasons: [] }, effective_target: { strategy_engine_version: '2.0', base_strategy: 'Aggressive', allocation: { weights: [{ role: 'global_equity', percentage_points: 100 }, { role: 'defensive', percentage_points: 0 }, { role: 'technology_tilt', percentage_points: 0 }, { role: 'crypto', percentage_points: 0 }] } } }, dormant_selected_approach: null, historical_allocation_preserved: false, customization: { technology_tilt: 10, bitcoin: 10, provenance: 'user_selected' }, final_allocation: weights, path: 'long_term', selected_strategy: 'Aggressive', base_allocation: [{ role: 'global_equity', percentage_points: 100 }, { role: 'defensive', percentage_points: 0 }], planning_return_pct: 5.5 }, historical_plan: null, revision: '96613c4986b48f5b2b5e2a255b90a1ffa9be405441b583c34b5a3b02247d3176', profile_warning: null };
const catalog = [
  { product_id: 'gotrade_vt', provider: 'gotrade', provider_name: 'Gotrade', display_name: 'VT', sleeve: 'global_equity', price_kind: 'reference' },
  { product_id: 'pdax_btc', provider: 'pdax', provider_name: 'PDAX', display_name: 'Bitcoin', sleeve: 'crypto', price_kind: 'reference' },
  { product_id: 'gcash_global_equity', provider: 'gcash', provider_name: 'GFunds', display_name: 'ATRAM Global Equity Opportunity Feeder Fund', sleeve: 'global_equity', price_kind: 'nav' },
];
const breakdown = { contribution_amount: '10000.000', current_portfolio_value: '10000.00', source: 'recorded_portfolio', status: 'active', rows: [
  { sleeve: 'global_equity', target_percentage_points: '80', current_value: '10000', target_value_after_contribution: '16000', deficit: '6000', amount: '8000', product_id: 'gotrade_vt', provider_id: 'gotrade', minimum: null, status: 'ready' },
  { sleeve: 'crypto', target_percentage_points: '10', current_value: '0', target_value_after_contribution: '2000', deficit: '2000', amount: '2000', product_id: 'pdax_btc', provider_id: 'pdax', minimum: null, status: 'ready' },
], provider_groups: [{ provider_id: 'gotrade', amount: '8000', ready_amount: '8000', verify_minimum_amount: '0', waiting_amount: '0' }, { provider_id: 'pdax', amount: '2000', ready_amount: '2000', verify_minimum_amount: '0', waiting_amount: '0' }], ready_amount: '10000', recordable_amount: '10000.000', verify_minimum_amount: '0', waiting_amount: '0', choose_investment_amount: '0', reserve_amount: '0', unallocated_amount: '0' };
let checkin = null;
let entitlementMode = 'plus';
let showOpening = true;
let hasProfile = true;
const pending = [{ id: '00000000-0000-4000-8000-000000000201', product_id: 'gotrade_vt', provider: 'gotrade', source: 'monthly', status: 'pending', started_at: now, resolved_at: null }];
const entries = [];
const keys = new Map();
let pageErrors = 0, consoleErrors = 0, expectedMissingProfile404 = 0, blockedExternal = 0;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', () => pageErrors++);
page.on('console', message => {
  if (message.type() !== 'error') return;
  if (!hasProfile && message.text().includes('404')) { expectedMissingProfile404++; return; }
  consoleErrors++;
});
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' };
function portfolio() {
  const vt = entries.filter(e => e.product_id === 'gotrade_vt' && !e.voided_at);
  const btc = entries.filter(e => e.product_id === 'pdax_btc' && !e.voided_at);
  const fund = entries.filter(e => e.product_id === 'gcash_global_equity' && !e.voided_at);
  const vtUnits = ((showOpening ? 2 : 0) + vt.reduce((sum, e) => sum + Number(e.units), 0)).toFixed(5);
  const btcUnits = btc.reduce((sum, e) => sum + Number(e.units), 0).toFixed(8);
  const vtValue = (Number(vtUnits) * 5000).toFixed(2), btcValue = (Number(btcUnits) * 2000000).toFixed(2);
  const fundUnits = fund.reduce((sum, e) => sum + Number(e.units), 0);
  const fundValue = (fundUnits * 100).toFixed(2);
  const vtCost = vt.some(e => e.amount_paid_php === null) ? null : (showOpening ? 10000 : 0) + vt.reduce((sum, e) => sum + Number(e.amount_paid_php), 0);
  const vtGain = vtCost === null ? null : (Number(vtValue) - vtCost).toFixed(2);
  const holdings = showOpening || vt.length ? [{ ...catalog[0], id: '00000000-0000-4000-8000-000000000101', units: vtUnits, cost_basis_php: vtCost === null ? null : String(vtCost), manual_value_php: null, manual_value_updated_at: null, opening_units: showOpening ? '2' : '0', opening_cost_php: showOpening ? '10000' : null, has_entries: vt.length > 0, value_php: vtValue, freshness: 'fresh', as_of: now, updated_at: now, created_at: now, valuation_source: 'market_reference', unit_price: '100', unit_price_currency: 'USD', recorded_gain_php: vtGain, recorded_gain_percentage: vtGain === null || !vtCost ? null : (Number(vtGain) / vtCost * 100).toFixed(2) }] : [];
  if (btc.length) {
    const btcCost = btc.some(e => e.amount_paid_php === null) ? null : btc.reduce((sum, e) => sum + Number(e.amount_paid_php), 0);
    const btcGain = btcCost === null ? null : Number(btcValue) - btcCost;
    holdings.push({ ...catalog[1], id: '00000000-0000-4000-8000-000000000102', units: btcUnits, cost_basis_php: btcCost === null ? null : String(btcCost), manual_value_php: null, manual_value_updated_at: null, opening_units: '0', opening_cost_php: null, has_entries: true, value_php: btcValue, freshness: 'fresh', as_of: now, updated_at: now, created_at: now, valuation_source: 'market_reference', unit_price: '2000000', unit_price_currency: 'PHP', recorded_gain_php: btcGain === null ? null : btcGain.toFixed(2), recorded_gain_percentage: btcGain === null || !btcCost ? null : (btcGain / btcCost * 100).toFixed(2) });
  }
  if (fund.length) {
    const fundCost = fund.some(e => e.amount_paid_php === null) ? null : fund.reduce((sum, e) => sum + Number(e.amount_paid_php), 0);
    const fundGain = fundCost === null ? null : Number(fundValue) - fundCost;
    holdings.push({ ...catalog[2], id: '00000000-0000-4000-8000-000000000103', units: String(fundUnits), cost_basis_php: fundCost === null ? null : String(fundCost), manual_value_php: null, manual_value_updated_at: null, opening_units: '0', opening_cost_php: null, has_entries: true, value_php: fundValue, freshness: 'fresh', as_of: now, updated_at: now, created_at: now, valuation_source: 'nav', unit_price: '100', unit_price_currency: 'PHP', recorded_gain_php: fundGain === null ? null : fundGain.toFixed(2), recorded_gain_percentage: fundGain === null || !fundCost ? null : (fundGain / fundCost * 100).toFixed(2) });
  }
  const total = (Number(vtValue) + Number(btcValue) + Number(fundValue)).toFixed(2);
  const completeCost = holdings.length > 0 && holdings.every(holding => holding.cost_basis_php !== null);
  const recordedCost = completeCost ? holdings.reduce((sum, holding) => sum + Number(holding.cost_basis_php), 0) : null;
  const recordedGain = recordedCost && recordedCost > 0 ? Number(total) - recordedCost : null;
  return { currency: 'PHP', holdings, catalog, history: [], known_value_php: total, total_value_php: total,
    recorded_cost_php: recordedCost === null ? null : recordedCost.toFixed(2),
    recorded_gain_php: recordedGain === null ? null : recordedGain.toFixed(2),
    recorded_gain_percentage: recordedGain === null ? null : (recordedGain / recordedCost * 100).toFixed(2),
    complete: true, unavailable_count: 0, stale_count: 0, provider_values_php: { ...(showOpening || vt.length ? { gotrade: vtValue } : {}), ...(btc.length ? { pdax: btcValue } : {}), ...(fund.length ? { gcash: fundValue } : {}) }, valued_at: now, data_sources: ['marketstack', 'coinranking', 'toap'], sleeves: weights.map(w => {
    const value = w.role === 'global_equity' ? Number(vtValue) + Number(fundValue) : w.role === 'crypto' ? Number(btcValue) : 0;
    const current = Number(total) > 0 ? value / Number(total) * 100 : null;
    return { sleeve: w.role, known_value_php: value.toFixed(2), current_percentage: current === null ? null : current.toFixed(2), target_percentage: w.percentage_points, difference_pp: current === null ? null : (current - w.percentage_points).toFixed(2) };
  }) };
}
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  if (url.origin === origin) return route.continue();
  const json = (body, status = 200) => route.fulfill({ status, json: body, headers });
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path.endsWith('/auth/v1/token')) return json(session);
  if (path.endsWith('/auth/v1/user')) return json(user);
  if (path.endsWith('/profiles/me')) return hasProfile ? json(plan) : json({ detail: 'Profile not found' }, 404);
  if (path.endsWith('/v2/approaches')) return json({ assessment: { requested_strategy: 'Growth', is_short_term: false }, approaches: [
    { strategy: 'Conservative', allocation: [{ role: 'global_equity', percentage_points: 40 }, { role: 'defensive', percentage_points: 60 }], planning_return_pct: 4.0 },
    { strategy: 'Balanced', allocation: [{ role: 'global_equity', percentage_points: 60 }, { role: 'defensive', percentage_points: 40 }], planning_return_pct: 4.5 },
    { strategy: 'Growth', allocation: [{ role: 'global_equity', percentage_points: 80 }, { role: 'defensive', percentage_points: 20 }], planning_return_pct: 5.0 },
    { strategy: 'Aggressive', allocation: [{ role: 'global_equity', percentage_points: 100 }, { role: 'defensive', percentage_points: 0 }], planning_return_pct: 5.5 },
  ] });
  if (askOnly && path.endsWith('/chat') && method === 'POST') {
    const question = request.postDataJSON().message;
    const reply = question.includes('long explanation')
      ? 'Your recorded portfolio value comes from the units you entered and the reference prices currently available to Arbor. If a reference is unavailable, Arbor should say the total is incomplete rather than count that investment as zero.\n\nRecorded cost is different: it comes from the actual PHP amounts you choose to record. Adding money to an investment can increase the portfolio value without creating investment profit.\n\nYou can review each dated addition in Holding Detail. Arbor keeps those entries separate from genuine portfolio-value snapshots, so an older investment date does not create fictional chart history.'
      : question.includes('ETF') ? 'An ETF is a fund whose shares trade on an exchange. Its market price can differ from its net asset value. Check your provider record for actual shares received.' : 'Your recorded portfolio value comes from canonical holdings and available reference prices. A contribution is not investment profit.';
    return json({ reply, category: 'investment', intent: 'education' });
  }
  if (path.endsWith('/account/entitlements')) return json({ tier: entitlementMode, status: entitlementMode === 'plus' ? 'trial' : 'active', effective_tier: entitlementMode, private_beta: entitlementMode === 'plus', features: entitlementMode === 'plus' ? ['live_portfolio', 'monthly_contribution_planner', 'monthly_checkin', 'profile_rebuild', 'future_projection', 'plan_alignment'] : ['live_portfolio', 'plan_creation', 'basic_implementation'], ask_monthly_limit: entitlementMode === 'plus' ? null : 10, ask_usage: null, ask_usage_available: true, availability: { live_portfolio: true, monthly_checkin: true } });
  if (path.endsWith('/v2/next-action')) return json({ key: 'review_monthly_contribution', title: 'Review your contribution', explanation: 'Local fixture', button_label: 'Review', blocking: false, destination: 'plan' });
  if (path.endsWith('/v2/future-projection')) return json({ starting_value_php: '10000.00', monthly_contribution_php: '10000.00', annual_planning_rate_pct: '5.500', inflation_planning_rate_pct: '3.0', whole_months: 120, target_date: '2036-09-28', projected_value_php: '342000.00', goal_target_php: '500000.00', difference_to_goal_php: '-158000.00', illustrative: true });
  if (path.endsWith('/v2/monthly-plan')) return json(breakdown);
  if (path.endsWith('/v2/monthly-checkin') && method === 'GET') return json({ month, current: checkin, history: checkin ? [checkin] : [] });
  if (path.endsWith('/v2/monthly-checkin') && method === 'POST') {
    const body = request.postDataJSON(); checkin = { month, amount_php: body.amount_php, completed_at: now, undone_at: null };
    return json({ month, current: checkin, history: [checkin] });
  }
  if (path.endsWith('/v2/monthly-checkin/undo') && method === 'POST') {
    checkin = null;
    return json({ month, current: null, history: [{ month, amount_php: '10000.00', completed_at: now, undone_at: now }] });
  }
  if (path.endsWith('/v2/pending-recordings') && method === 'GET') return json({ items: pending.filter(item => item.status === 'pending') });
  if (path.endsWith('/v2/pending-recordings') && method === 'POST') {
    const body = request.postDataJSON();
    const existing = pending.find(item => item.product_id === body.product_id && item.provider === body.provider && item.status === 'pending');
    if (existing) return json(existing, 201);
    const item = { id: `00000000-0000-4000-8000-${String(201 + pending.length).padStart(12, '0')}`, product_id: body.product_id, provider: body.provider, source: 'monthly', status: 'pending', started_at: now, resolved_at: null };
    pending.push(item); return json(item, 201);
  }
  if (path.includes('/v2/pending-recordings/') && path.endsWith('/resolve') && method === 'POST') {
    const id = path.split('/').at(-2), item = pending.find(row => row.id === id);
    if (!item) return json({ detail: 'not found' }, 409);
    item.status = request.postDataJSON().resolution; item.resolved_at = now; return json(item);
  }
  if (path.endsWith('/v2/portfolio') && method === 'GET') {
    const response = portfolio();
    if (entitlementMode === 'free') { response.sleeves = []; response.provider_values_php = {}; }
    return json(response);
  }
  if (path.endsWith('/v2/portfolio/snapshot')) return json({ recorded: false, history: [] });
  if (path.endsWith('/v2/portfolio/entries') && method === 'GET') {
    const selected = url.searchParams.get('month'); const rows = entries.filter(e => !selected || e.investment_date.startsWith(selected));
    return json({ entries: rows, page: Number(url.searchParams.get('page') || 0), has_more: false });
  }
  if (path.endsWith('/v2/portfolio/entries') && method === 'POST') {
    const body = request.postDataJSON();
    if (keys.has(body.idempotency_key)) return json({ entry_id: keys.get(body.idempotency_key), holding_id: body.product_id === 'pdax_btc' ? '00000000-0000-4000-8000-000000000102' : body.product_id === 'gcash_global_equity' ? '00000000-0000-4000-8000-000000000103' : '00000000-0000-4000-8000-000000000101', replayed: true }, 201);
    const id = `00000000-0000-4000-8000-${String(entries.length + 1).padStart(12, '0')}`;
    const holding_id = body.product_id === 'pdax_btc' ? '00000000-0000-4000-8000-000000000102' : body.product_id === 'gcash_global_equity' ? '00000000-0000-4000-8000-000000000103' : '00000000-0000-4000-8000-000000000101';
    entries.push({ id, holding_id, product_id: body.product_id, provider: body.provider, investment_date: body.investment_date, units: body.units, amount_paid_php: body.amount_paid_php, recorded_at: now, updated_at: now, revision: 1, voided_at: null });
    keys.set(body.idempotency_key, id);
    return json({ entry_id: id, holding_id, replayed: false }, 201);
  }
  blockedExternal++; return route.abort();
});
const shots = [];
async function shot(name, width, theme = 'light') {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.scrollTo(0, 0); });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const offenders = overflow > 0 ? await page.evaluate(() => { const element = document.querySelector('.monthly-amount-input'); const chain = []; let current = element; while (current && chain.length < 9) { const r = current.getBoundingClientRect(); chain.push(`${current.tagName}.${String(current.className).slice(0, 35)} x=${Math.round(r.x)} w=${Math.round(r.width)}`); current = current.parentElement; } return chain; }) : [];
  assert.ok(overflow <= 0, `${name}: horizontal overflow ${overflow}px at ${offenders.join(', ')}`);
  const file = `${output}/${name}.png`; await page.screenshot({ path: file, fullPage: true, animations: 'disabled', style: 'nextjs-portal{display:none!important}' }); shots.push(file);
  if (width < 1024) {
    const reachable = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
      const main = document.querySelector('#app-content');
      if (!nav || !main || document.querySelector('[role="dialog"]')) return true;
      window.scrollTo(0, document.documentElement.scrollHeight);
      return (main.lastElementChild?.getBoundingClientRect().bottom ?? 0) <= nav.getBoundingClientRect().top;
    });
    assert.ok(reachable, `${name}: final content is hidden behind mobile navigation`);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}
try {
  await page.goto(`${origin}/#login`);
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill('fixture-only-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  if (homeLayoutOnly) {
    const readings = [];
    await page.getByRole('region', { name: 'Portfolio value graph' }).waitFor();
    await page.getByRole('heading', { name: 'Where you could be headed' }).waitFor();
    for (const width of [1440, 1024, 960, 900, 820, 768, 390, 320]) {
      await shot(`home-${width}`, width);
      const reading = await page.evaluate(() => {
        const box = selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), height: Math.round(rect.height) };
        };
        return { width: innerWidth, portfolio: box('.home-portfolio'), utility: box('.home-utility-stack'), goal: box('.home-goal'), monthly: box('.home-monthly'), pending: box('.home-utility-stack .pending-recording'), projection: box('.home-projection'), activity: box('.home-activity'), plan: box('.home-plan'), plotHeight: Math.round(document.querySelector('.home-portfolio .chart-plot')?.getBoundingClientRect().height ?? 0) };
      });
      assert.ok(reading.activity.height < 160, `${width}: empty Recent activity should stay compact`);
      if (width >= 1000) {
        assert.ok(Math.abs(reading.portfolio.top - reading.utility.top) <= 2, `${width}: Portfolio and utility stack should share the first row`);
        assert.ok(Math.abs(reading.projection.top - reading.plan.top) <= 2, `${width}: Projection and plan should share the second row`);
        assert.ok(Math.abs(reading.projection.bottom - reading.plan.bottom) <= 2, `${width}: paired Projection and plan cards should match height`);
        assert.ok(reading.activity.top >= Math.max(reading.projection.bottom, reading.plan.bottom), `${width}: Recent activity should follow the second row`);
      } else {
        const sequence = [reading.portfolio, reading.goal, reading.monthly, reading.pending, reading.projection, reading.activity, reading.plan].filter(Boolean);
        assert.ok(sequence.every((section, index) => index === 0 || section.top >= sequence[index - 1].top), `${width}: Home sections should follow reading order`);
      }
      readings.push(reading);
    }
    for (const width of [1024, 768, 390]) await shot(`home-dark-${width}`, width, 'dark');
    assert.equal(pageErrors, 0, 'browser page errors'); assert.equal(consoleErrors, 0, 'browser console errors'); assert.equal(blockedExternal, 0, 'unhandled external requests');
    console.log(JSON.stringify({ fixtureOnly: true, screenshots: shots, readings, pageErrors, consoleErrors, blockedExternal }));
  } else if (tabletGraphOnly) {
    const widths = [1440, 1024, 1023, 900, 820, 768, 390, 320];
    const readings = [];
    await page.getByRole('region', { name: 'Portfolio value graph' }).waitFor();
    for (const width of widths) {
      await shot(`home-${width}`, width);
      readings.push(await page.evaluate(() => ({ surface: 'home', width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, plotHeight: Math.round(document.querySelector('.home-portfolio .chart-plot')?.getBoundingClientRect().height ?? 0), cardHeight: Math.round(document.querySelector('.home-portfolio')?.getBoundingClientRect().height ?? 0), sidebarVisible: getComputedStyle(document.querySelector('.app-shell aside')).display !== 'none', mobileNavVisible: getComputedStyle(document.querySelector('nav[aria-label="Mobile navigation"]')).display !== 'none' })));
    }
    await shot('home-dark-768', 768, 'dark');
    await page.evaluate(() => { location.hash = 'portfolio'; });
    await page.getByRole('heading', { name: 'Holdings' }).waitFor();
    await page.getByRole('region', { name: 'Portfolio value graph' }).waitFor();
    for (const width of widths) {
      await shot(`portfolio-${width}`, width);
      readings.push(await page.evaluate(() => ({ surface: 'portfolio', width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, plotHeight: Math.round(document.querySelector('.portfolio-value .chart-plot')?.getBoundingClientRect().height ?? 0), cardHeight: Math.round(document.querySelector('.portfolio-value')?.getBoundingClientRect().height ?? 0), sidebarVisible: getComputedStyle(document.querySelector('.app-shell aside')).display !== 'none', mobileNavVisible: getComputedStyle(document.querySelector('nav[aria-label="Mobile navigation"]')).display !== 'none' })));
    }
    await shot('portfolio-dark-768', 768, 'dark');
    assert.ok(readings.every(reading => reading.overflow <= 0), 'tablet graph layouts must not overflow horizontally');
    assert.equal(pageErrors, 0, 'browser page errors'); assert.equal(consoleErrors, 0, 'browser console errors'); assert.equal(blockedExternal, 0, 'unhandled external requests');
    console.log(JSON.stringify({ fixtureOnly: true, screenshots: shots, readings, pageErrors, consoleErrors, blockedExternal }));
  } else if (datedOnly) {
    await page.getByRole('button', {name:/Finish recording your investment/}).waitFor();
    await shot('home-plan-target-desktop',1440);
    await shot('home-plan-target-mobile',390);
    assert.equal(await page.getByRole('link',{name:'Ways to invest →'}).count(),1);
    await page.setViewportSize({width:390,height:844});
    await page.locator('.pending-recording-toggle').click();
    await page.locator('.pending-recording li').first().getByRole('button',{name:'Record investment'}).click();
    await page.getByLabel('Shares received').fill('.5');
    await page.getByRole('button',{name:'Review investment'}).click();
    await page.getByRole('alert').filter({hasText:'actual PHP amount'}).waitFor();
    assert.equal(entries.length,0,'blank cost and Review must not write');
    await page.getByLabel('Actual amount paid (PHP)').fill('1,23');
    await page.getByRole('button',{name:'Review investment'}).click();
    await page.getByRole('alert').filter({hasText:'PHP amount'}).waitFor();
    await page.getByLabel('Actual amount paid (PHP)').fill('6,500.00');
    await page.getByLabel('Investment date',{exact:true}).fill('2026-08-12');
    await shot('pending-record-required-cost',390);
    await page.getByRole('button',{name:'Review investment'}).click();
    await page.getByRole('button',{name:'Confirm and save'}).waitFor();
    assert.equal(entries.length,0,'Review makes no ledger write');
    await shot('pending-review',390);
    await page.getByRole('button',{name:'Confirm and save'}).click();
    await page.locator('dialog').waitFor({state:'detached'});
    assert.deepEqual([entries[0].investment_date,entries[0].units,entries[0].amount_paid_php],['2026-08-12','0.5','6500.00']);
    await page.evaluate(()=>{location.hash='portfolio';});
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    await page.getByRole('region',{name:'Portfolio value graph'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Investment dates'}).count(),0);
    await shot('portfolio-populated-desktop',1440);
    await shot('portfolio-populated-mobile',390);
    await shot('portfolio-populated-320',320);
    const actualCost=entries[0].amount_paid_php;
    entries[0].amount_paid_php='500';
    await page.reload();
    await page.locator('.holding-row [data-gain="positive"]').waitFor();
    await shot('portfolio-positive-gain',390);
    entries[0].amount_paid_php=null;
    await page.reload();
    await page.locator('.holding-row [data-gain="unknown"]').waitFor();
    await shot('portfolio-legacy-unknown-cost',390);
    entries[0].amount_paid_php=actualCost;
    await page.reload();
    await page.locator('.holding-row [data-gain="negative"]').waitFor();
    await shot('portfolio-negative-gain',390);
    await page.evaluate(()=>{location.hash='home';});
    await page.getByRole('region',{name:'Portfolio value graph'}).waitFor();
    await page.getByText('Current value · No history yet',{exact:true}).waitFor();
    await page.getByText(/Added to VT/).waitFor();
    await shot('home-populated-desktop',1440);
    await shot('home-populated-mobile',390);
    await shot('home-populated-dark',390,'dark');
    await page.evaluate(()=>{location.hash='portfolio/add';});
    await page.locator('.catalogue-row[data-product="pdax_btc"]').click();
    await page.getByLabel('BTC received').fill('.00015');
    await page.getByRole('button',{name:'Review investment'}).click();
    await page.getByRole('alert').filter({hasText:'actual PHP amount'}).waitFor();
    await shot('add-required-cost',390);
    await page.getByLabel('Actual amount paid (PHP)').fill('300');
    await page.getByRole('button',{name:'Review investment'}).click();
    assert.equal(entries.length,1,'Add Investment Review must not write');
    await page.getByRole('button',{name:'Confirm and save'}).click();
    await page.locator('dialog').waitFor({state:'detached'});
    assert.equal(entries.length,2);
    await page.getByRole('button',{name:'+ Add Investment'}).click();
    await page.locator('.catalogue-row[data-product="gcash_global_equity"]').click();
    await page.getByLabel('Fund units received').fill('10');
    await page.getByLabel('Actual amount paid (PHP)').fill('900');
    await page.getByRole('button',{name:'Review investment'}).click();
    assert.equal(entries.length,2,'Fund Review must not write');
    await page.getByRole('button',{name:'Confirm and save'}).click();
    await page.locator('dialog').waitFor({state:'detached'});
    assert.deepEqual([entries[2].product_id,entries[2].units,entries[2].amount_paid_php],['gcash_global_equity','10','900']);
    await page.locator('.holding-row').filter({hasText:'ATRAM'}).waitFor();
    await page.evaluate(()=>{location.hash='home/monthly';});
    await page.getByRole('button',{name:'Review contribution'}).click();
    await page.getByText('Your contribution breakdown').waitFor();
    await page.getByRole('button',{name:'Submit monthly contribution'}).click();
    await page.getByRole('button',{name:'Confirm contribution submitted'}).click();
    await page.getByRole('heading',{name:'Record what you actually invested'}).waitFor();
    await page.locator('.monthly-record-row').first().getByRole('button',{name:'Record investment'}).click();
    await page.getByLabel('Shares received').fill('.4');
    await page.getByText(/Planned contribution: ₱8,000 \(context only\)/).waitFor();
    await page.getByRole('button',{name:'Review investment'}).click();
    await page.getByRole('alert').filter({hasText:'actual PHP amount'}).waitFor();
    await shot('monthly-required-cost',390);
    await page.getByLabel('Actual amount paid (PHP)').fill('6,500');
    await page.getByRole('button',{name:'Review investment'}).click();
    assert.equal(entries.length,3,'Monthly Review must not write');
    await page.getByRole('button',{name:'Confirm and save'}).click();
    await page.getByText('Investment recorded').waitFor();
    assert.equal(entries[3].amount_paid_php,'6500');
    assert.notEqual(entries[3].amount_paid_php,breakdown.rows[0].amount);
    await page.evaluate(()=>{location.hash='portfolio/ways';});
    await page.locator('.implementation-option[data-product="gotrade_vt"]').waitFor();
    await shot('ways-to-invest',390);
    await page.evaluate(()=>{location.hash='portfolio';});
    await shot('portfolio-dark',390,'dark');
    entries.length=0;showOpening=false;checkin=null;
    await page.reload();
    await page.getByRole('heading',{name:'No investments recorded yet.'}).waitFor();
    await shot('portfolio-empty',390);
    await shot('portfolio-empty-desktop',1440);
    await page.evaluate(()=>{location.hash='home';});
    await page.getByText('No investments recorded yet.').waitFor();
    await shot('home-empty',390);

  } else if (askOnly) {
    await page.evaluate(() => { location.hash = 'ask'; });
    await page.getByRole('tab', { name: 'Chat' }).waitFor();
    await shot('chat-empty-mobile-390', 390);
    await shot('chat-empty-mobile-320', 320);
    await page.getByRole('button', { name: "What's the difference between an ETF and a UITF?" }).click();
    assert.match(await page.getByLabel('Your question for Ask Arbor').inputValue(), /ETF/);
    await page.getByLabel('Your question for Ask Arbor').press('Enter');
    await page.getByRole('log').getByText(/An ETF is a fund/).waitFor();
    await shot('chat-exchange-mobile-390', 390);
    await shot('chat-exchange-mobile-320', 320);
    await page.getByLabel('Your question for Ask Arbor').fill('Please give me a long explanation.');
    await page.getByLabel('Your question for Ask Arbor').press('Enter');
    await page.getByRole('log').getByText(/older investment date does not create fictional chart history/).waitFor();
    await shot('chat-long-answer-mobile-390', 390);
    await shot('chat-long-answer-mobile-320', 320);
    await shot('chat-desktop', 1440);
    await page.getByRole('tab', { name: 'Learn' }).click();
    await page.getByText('Investing 101', { exact: true }).waitFor();
    await shot('learn-list-mobile-390', 390);
    await shot('learn-list-mobile-320', 320);
    await page.getByRole('button', { name: 'Funds', exact: true }).click();
    await shot('learn-funds-filter-mobile', 390);
    await page.getByRole('button', { name: /What are UITFs/ }).click();
    await shot('learn-detail-mobile', 390);
    await page.getByRole('button', { name: 'Ask Arbor about this' }).click();
    assert.match(await page.getByLabel('Your question for Ask Arbor').inputValue(), /UITF/);
    assert.deepEqual(await page.evaluate(() => {
      const input = document.querySelector('.chat-composer textarea');
      const composer = document.querySelector('.chat-composer');
      const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
      return { visibleDraft: input.scrollHeight <= input.clientHeight + 1, aboveNav: composer.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1 };
    }), { visibleDraft: true, aboveNav: true }, 'Learn draft must be fully visible above fixed navigation');
    await shot('learn-ask-draft-mobile', 390);
    await page.getByRole('tab', { name: 'Learn' }).click();
    await shot('learn-desktop', 1440);
    await page.getByRole('tab', { name: 'Chat' }).click();
    await shot('chat-dark-mobile', 390, 'dark');
    await page.getByRole('tab', { name: 'Learn' }).click();
    await shot('learn-dark-mobile', 390, 'dark');
    hasProfile = false;
    await page.reload();
    if (await page.getByRole('heading', { name: 'Welcome back' }).isVisible()) {
      await page.getByLabel('Email address').fill(user.email);
      await page.getByLabel('Password').fill('fixture-only-password');
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
    }
    await page.getByRole('heading', { name: 'What’s your name?' }).waitFor();
    await page.getByRole('button', { name: 'Explore Ask Arbor' }).click();
    await page.getByRole('tab', { name: 'Learn' }).click();
    await shot('learn-before-profile-mobile', 390);
  } else {
  await page.getByRole('button', { name: /Finish recording your investment/ }).waitFor();
  await shot('home-one-unfinished', 390);
  pending.push({ id: '00000000-0000-4000-8000-000000000202', product_id: 'pdax_btc', provider: 'pdax', source: 'monthly', status: 'pending', started_at: now, resolved_at: null });
  await page.evaluate(() => window.dispatchEvent(new Event('arbor-pending-changed')));
  await page.getByRole('button', { name: /Finish recording investments/ }).waitFor();
  await shot('home-several-unfinished', 1440);
  await page.getByRole('button', { name: /Finish recording investments/ }).click();
  await shot('home-return-cue-expanded', 390);
  await page.evaluate(() => { location.hash = 'home/monthly'; });
  await page.getByRole('button', { name: 'Review contribution' }).click();
  await page.getByText('Your contribution breakdown').waitFor();
  await page.getByRole('button', { name: /Continue with Gotrade/ }).waitFor();
  await page.getByRole('button', { name: 'Submit monthly contribution' }).click();
  await page.getByRole('button', { name: 'Confirm contribution submitted' }).click();
  await page.getByRole('heading', { name: 'Record what you actually invested' }).waitFor();
  await shot('monthly-finish-recording', 1440);
  await page.locator('.pending-recording li').first().getByRole('button', { name: 'Not yet' }).click();
  await page.getByText('Okay. You can record this when you have the provider details.').waitFor();
  await shot('not-yet-keeps-pending', 390);
  await page.locator('.pending-recording li').filter({ hasText: 'Bitcoin' }).getByRole('button', { name: 'I didn’t invest' }).click();
  await page.locator('.pending-recording li').filter({ hasText: 'Bitcoin' }).waitFor({ state: 'detached' });
  assert.equal(pending.filter(item => item.status === 'pending').length, 1);
  await shot('dismissed-without-ledger', 390);
  await page.locator('.pending-recording li').first().getByRole('button', { name: 'Record investment' }).click();
  await page.getByLabel('Shares received').fill('0.5');
  await page.getByLabel('Actual amount paid (PHP)').fill('6500');
  await shot('record-from-pending', 390);
  await page.getByRole('button', { name: 'Review investment' }).click();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await page.getByText('Investment recorded').waitFor();
  await page.locator('.pending-recording').waitFor({ state: 'detached' });
  assert.equal(pending.filter(item => item.status === 'pending').length, 0);
  await shot('pending-resolved-after-ledger', 390);
  await page.locator('.monthly-record-row').last().getByRole('button', { name: 'Record investment' }).click();
  await page.getByLabel('BTC received').fill('0.00015');
  await page.getByLabel('Actual amount paid (PHP)').fill('300');
  await shot('dark-actual-recording', 390, 'dark');
  await page.getByRole('button', { name: 'Review investment' }).click();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await page.getByText('Investment recorded').waitFor();
  await page.getByText('Recorded Bitcoin').waitFor();
  await page.evaluate(() => { location.hash = 'home'; });
  await page.getByText('Added to Bitcoin').waitFor();
  await shot('home-factual-recent-activity', 390);
  await shot('phase2c-home-desktop', 1440);
  await shot('phase2c-home-mobile', 390);
  await page.evaluate(() => { location.hash = 'portfolio'; });
  await page.getByRole('button', { name: 'View VT' }).waitFor();
  await page.evaluate(() => { location.hash = 'home/monthly'; });
  await page.getByRole('button', { name: 'Undo completion' }).click();
  await page.getByRole('button', { name: 'Confirm undo completion' }).click();
  await page.getByRole('heading', { name: 'Recorded investment activity' }).waitFor();
  await page.getByText('Recorded VT').waitFor();
  assert.equal(entries.length, 2, 'Undo must not alter investment entries');
  await shot('mobile-320-after-undo', 320);
  assert.equal(entries.length, 2); assert.equal(entries[0].amount_paid_php, '6500'); assert.equal(entries[1].amount_paid_php, '300');
  // Phase 2C review reuses this synthetic owner and intercepts every external call.
  await page.evaluate(() => { location.hash = 'portfolio'; });
  await page.getByRole('button', { name: 'View VT' }).waitFor();
  await shot('phase2c-portfolio-plus-desktop', 1440);
  await shot('phase2c-portfolio-plus-laptop', 1024);
  await page.getByRole('button', { name: 'View VT' }).getByText('US$100 per share').waitFor();
  await page.getByRole('button', { name: 'View Bitcoin' }).getByText('₱2,000,000 per BTC').waitFor();
  await shot('phase2c-portfolio-plus-tablet', 768);
  await shot('phase2c-portfolio-plus-mobile', 390);
  await shot('phase2c-portfolio-plus-320', 320);
  await shot('phase2c-gain-loss-dark-mobile', 390, 'dark');
  const gainColors = await page.evaluate(() => {
    const loss = document.querySelector('.holding-row [data-gain="negative"]');
    const neutral = document.querySelector('.holding-row [data-gain="zero"]');
    const value = loss?.closest('.holding-money');
    return [loss, neutral, value].map(element => element ? getComputedStyle(element).color : null);
  });
  assert.ok(gainColors.every(Boolean) && gainColors[0] !== gainColors[1] && gainColors[0] !== gainColors[2], 'loss, zero gain, and current value need distinct dark-mode treatments');
  await shot('phase2c-portfolio-plus-mobile', 390);
  await page.getByRole('button', { name: 'View Bitcoin' }).click();
  await page.getByText('₱2,000,000 per BTC', { exact: true }).waitFor();
  await shot('phase2c-btc-detail-mobile', 390);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'View VT' }).click();
  await shot('phase2c-holding-detail-mobile', 390);
  await shot('phase2c-gain-loss-dark-detail', 390, 'dark');
  await shot('phase2c-holding-detail-mobile', 390);
  await page.getByRole('button', { name: 'Close' }).click();
  const vtEntry = entries.find(entry => entry.product_id === 'gotrade_vt');
  assert.ok(vtEntry, 'synthetic VT addition must exist for gain-color review');
  const originalCost = vtEntry.amount_paid_php;
  for (const [cost, tone, expected] of [['500', 'positive', '+₱2,000'], ['2500', 'zero', '₱0 · 0%']]) {
    vtEntry.amount_paid_php = cost;
    await page.reload();
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const gain = page.getByRole('button', { name: 'View VT' }).locator(`[data-gain="${tone}"]`);
      await gain.waitFor();
      assert.ok((await gain.textContent()).includes(expected));
      const className = await gain.getAttribute('class');
      assert.equal(className, tone === 'positive' ? 'text-emerald-700' : 'text-slate-900');
    }
  }
  vtEntry.amount_paid_php = originalCost;
  await page.reload();
  await page.getByRole('button', { name: 'View VT' }).waitFor();
  await page.evaluate(() => { location.hash = 'portfolio/insights'; });
  await page.getByText('Plan Alignment').waitFor();
  await shot('phase2c-plus-insights', 1440);
  const portfolioIdentity = {};
  for (const [product, label] of [['gotrade_vt', 'VT'], ['pdax_btc', 'Bitcoin']]) {
    const row = page.getByRole('button', { name: `View ${label}` });
    portfolioIdentity[product] = { product: await row.locator(':scope > .identity-mark').getAttribute('data-identity'), provider: await row.locator('.provider-brand [data-identity]').getAttribute('data-identity') };
  }
  await page.getByRole('button', { name: '+ Add Investment' }).click();
  await shot('phase2c-add-investment', 390);
  const addIdentity = {};
  for (const product of ['gotrade_vt', 'pdax_btc']) {
    const row = page.locator(`.catalogue-row[data-product="${product}"]`);
    addIdentity[product] = { product: await row.locator(':scope > .identity-mark').getAttribute('data-identity'), provider: await row.locator('.provider-brand [data-identity]').getAttribute('data-identity') };
  }
  await page.getByRole('button', { name: 'Close' }).click();
  await page.evaluate(() => { location.hash = 'portfolio/ways'; });
  await page.locator('.implementation-option[data-product="gotrade_vt"]').waitFor();
  await shot('phase2c-ways-mobile', 390);
  const waysIdentity = {};
  for (const product of ['gotrade_vt', 'pdax_btc']) {
    const row = page.locator(`.implementation-option[data-product="${product}"]`);
    waysIdentity[product] = { product: await row.locator(':scope > .identity-mark').getAttribute('data-identity'), provider: await row.locator('.provider-brand [data-identity]').getAttribute('data-identity') };
    assert.deepEqual(portfolioIdentity[product], addIdentity[product]);
    assert.deepEqual(portfolioIdentity[product], waysIdentity[product]);
  }
  await page.evaluate(() => { location.hash = 'settings'; });
  await page.getByText('Account details').waitFor();
  await shot('phase2c-settings', 1024);
  entitlementMode = 'free';
  await page.evaluate(() => { location.hash = 'home'; });
  await page.reload();
  await page.getByText('See where your plan could take you').waitFor();
  await shot('phase2c-free-home', 1440);
  await page.evaluate(() => { location.hash = 'portfolio'; });
  await page.getByText('Understand your portfolio').waitFor();
  assert.equal(await page.getByText('Portfolio insights').count(), 0, 'Free must not expose Plus insights');
  assert.equal(await page.getByText('Plan Alignment').count(), 0, 'Free must not expose Plan Alignment');
  await shot('phase2c-free-portfolio-mobile', 390);
  entries.length = 0; showOpening = false;
  await page.reload();
  await page.getByRole('heading', { name: 'No investments recorded yet.' }).waitFor();
  await shot('phase2c-empty-portfolio', 390);
  await page.locator('.portfolio-ways-details summary').click();
  await page.getByRole('heading', { name: 'Ways to invest' }).waitFor();
  await shot('phase2c-free-ways-empty', 390);
  await shot('phase2c-dark-portfolio', 390, 'dark');
  await page.evaluate(() => { location.hash = 'home'; });
  await page.getByText('See where your plan could take you').waitFor();
  await shot('phase2c-free-home-320', 320);
  hasProfile = false;
  await page.reload();
  if (await page.getByRole('heading', { name: 'Welcome back' }).isVisible()) {
    await page.getByLabel('Email address').fill(user.email);
    await page.getByLabel('Password').fill('fixture-only-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
  }
  await shot('phase2c-onboarding-initial', 390);
  await page.getByRole('heading', { name: 'What’s your name?' }).waitFor();
  await page.locator('#full_name').fill('New QA');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByRole('button', { name: /Philippines · PHP/ }).click();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByRole('button', { name: 'Not yet' }).click();
  await page.getByRole('button', { name: /10\+ years/ }).click();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByRole('button', { name: /3–6 months/ }).click();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByRole('button', { name: 'None', exact: true }).click();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.locator('#current_portfolio_value').fill('0');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.locator('#monthly_investment').fill('2000');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByRole('button', { name: 'Hold', exact: true }).click();
  await page.getByRole('button', { name: 'See my investing profile' }).click();
  await page.getByRole('heading', { name: 'Your investing profile' }).waitFor();
  await page.getByText('Comfortable with larger market swings', { exact: true }).waitFor();
  assert.equal(await page.locator('.profile-assessment strong').textContent(), 'Comfortable with larger market swings');
  await shot('phase2c-onboarding-informational-profile', 390);
  await page.getByRole('button', { name: 'Compare approaches' }).click();
  await page.getByRole('heading', { name: 'Choose your approach' }).waitFor();
  assert.equal(await page.locator('.approach-option[aria-pressed="true"]').count(), 0, 'No plan may be silently chosen');
  await shot('phase2c-onboarding-explicit-choice', 390);
  assert.equal(pageErrors, 0, 'browser page errors'); assert.equal(consoleErrors, 0, 'browser console errors'); assert.equal(blockedExternal, 0, 'unhandled external requests');
  console.log(JSON.stringify({ fixtureOnly: true, screenshots: shots, identityComparison: { portfolioIdentity, addIdentity, waysIdentity }, entries: entries.length, pageErrors, consoleErrors, expectedMissingProfile404, blockedExternal }));
  }
  if (askOnly || datedOnly) {
    assert.equal(pageErrors, 0, 'browser page errors'); assert.equal(consoleErrors, 0, 'browser console errors'); assert.equal(blockedExternal, 0, 'unhandled external requests');
    console.log(JSON.stringify({ fixtureOnly: true, screenshots: shots, pageErrors, consoleErrors, blockedExternal }));
  }
} finally { await browser.close(); }
