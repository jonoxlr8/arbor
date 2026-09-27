// Isolated synthetic browser review. All non-loopback requests are intercepted.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:3000';
const output = '/private/tmp/arbor-phase2b-retention-review';
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
];
const breakdown = { contribution_amount: '10000.000', current_portfolio_value: '10000.00', source: 'recorded_portfolio', status: 'active', rows: [
  { sleeve: 'global_equity', target_percentage_points: '80', current_value: '10000', target_value_after_contribution: '16000', deficit: '6000', amount: '8000', product_id: 'gotrade_vt', provider_id: 'gotrade', minimum: null, status: 'ready' },
  { sleeve: 'crypto', target_percentage_points: '10', current_value: '0', target_value_after_contribution: '2000', deficit: '2000', amount: '2000', product_id: 'pdax_btc', provider_id: 'pdax', minimum: null, status: 'ready' },
], provider_groups: [{ provider_id: 'gotrade', amount: '8000', ready_amount: '8000', verify_minimum_amount: '0', waiting_amount: '0' }, { provider_id: 'pdax', amount: '2000', ready_amount: '2000', verify_minimum_amount: '0', waiting_amount: '0' }], ready_amount: '10000', recordable_amount: '10000.000', verify_minimum_amount: '0', waiting_amount: '0', choose_investment_amount: '0', reserve_amount: '0', unallocated_amount: '0' };
let checkin = null;
const pending = [{ id: '00000000-0000-4000-8000-000000000201', product_id: 'gotrade_vt', provider: 'gotrade', source: 'monthly', status: 'pending', started_at: now, resolved_at: null }];
const entries = [];
const keys = new Map();
let pageErrors = 0, consoleErrors = 0, blockedExternal = 0;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', () => pageErrors++);
page.on('console', message => { if (message.type() === 'error') consoleErrors++; });
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' };
function portfolio() {
  const vt = entries.filter(e => e.product_id === 'gotrade_vt' && !e.voided_at);
  const btc = entries.filter(e => e.product_id === 'pdax_btc' && !e.voided_at);
  const vtUnits = (2 + vt.reduce((sum, e) => sum + Number(e.units), 0)).toFixed(5);
  const btcUnits = btc.reduce((sum, e) => sum + Number(e.units), 0).toFixed(8);
  const vtValue = (Number(vtUnits) * 5000).toFixed(2), btcValue = (Number(btcUnits) * 2000000).toFixed(2);
  const holdings = [{ ...catalog[0], id: '00000000-0000-4000-8000-000000000101', units: vtUnits, cost_basis_php: vt.some(e => e.amount_paid_php === null) ? null : String(10000 + vt.reduce((sum, e) => sum + Number(e.amount_paid_php), 0)), manual_value_php: null, manual_value_updated_at: null, opening_units: '2', opening_cost_php: '10000', has_entries: vt.length > 0, value_php: vtValue, freshness: 'fresh', as_of: now, updated_at: now, created_at: now, valuation_source: 'market_reference', unit_price: '100', unit_price_currency: 'USD', recorded_gain_php: null, recorded_gain_percentage: null }];
  if (btc.length) holdings.push({ ...catalog[1], id: '00000000-0000-4000-8000-000000000102', units: btcUnits, cost_basis_php: btc.some(e => e.amount_paid_php === null) ? null : String(btc.reduce((sum, e) => sum + Number(e.amount_paid_php), 0)), manual_value_php: null, manual_value_updated_at: null, opening_units: '0', opening_cost_php: null, has_entries: true, value_php: btcValue, freshness: 'fresh', as_of: now, updated_at: now, created_at: now, valuation_source: 'market_reference', unit_price: '2000000', unit_price_currency: 'PHP', recorded_gain_php: null, recorded_gain_percentage: null });
  const total = (Number(vtValue) + Number(btcValue)).toFixed(2);
  return { currency: 'PHP', holdings, catalog, history: [], known_value_php: total, total_value_php: total, complete: true, unavailable_count: 0, stale_count: 0, provider_values_php: { gotrade: vtValue, ...(btc.length ? { pdax: btcValue } : {}) }, valued_at: now, data_sources: ['marketstack', 'coinranking'], sleeves: weights.map(w => ({ sleeve: w.role, known_value_php: w.role === 'global_equity' ? vtValue : w.role === 'crypto' ? btcValue : '0.00', current_percentage: w.role === 'global_equity' ? '100' : '0', target_percentage: w.percentage_points, difference_pp: '0' })) };
}
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  if (['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '3000') return route.continue();
  const json = (body, status = 200) => route.fulfill({ status, json: body, headers });
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path.endsWith('/auth/v1/token')) return json(session);
  if (path.endsWith('/auth/v1/user')) return json(user);
  if (path.endsWith('/profiles/me')) return json(plan);
  if (path.endsWith('/account/entitlements')) return json({ tier: 'plus', status: 'trial', effective_tier: 'plus', private_beta: true, features: ['live_portfolio', 'monthly_contribution_planner', 'monthly_checkin', 'profile_rebuild', 'future_projection', 'plan_alignment'], ask_monthly_limit: null, ask_usage: null, ask_usage_available: true, availability: { live_portfolio: true, monthly_checkin: true } });
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
  if (path.endsWith('/v2/portfolio') && method === 'GET') return json(portfolio());
  if (path.endsWith('/v2/portfolio/snapshot')) return json({ recorded: false, history: [] });
  if (path.endsWith('/v2/portfolio/entries') && method === 'GET') {
    const selected = url.searchParams.get('month'); const rows = entries.filter(e => !selected || e.investment_date.startsWith(selected));
    return json({ entries: rows, page: Number(url.searchParams.get('page') || 0), has_more: false });
  }
  if (path.endsWith('/v2/portfolio/entries') && method === 'POST') {
    const body = request.postDataJSON();
    if (keys.has(body.idempotency_key)) return json({ entry_id: keys.get(body.idempotency_key), holding_id: body.product_id === 'pdax_btc' ? '00000000-0000-4000-8000-000000000102' : '00000000-0000-4000-8000-000000000101', replayed: true }, 201);
    const id = `00000000-0000-4000-8000-${String(entries.length + 1).padStart(12, '0')}`;
    const holding_id = body.product_id === 'pdax_btc' ? '00000000-0000-4000-8000-000000000102' : '00000000-0000-4000-8000-000000000101';
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
}
try {
  await page.goto(`${origin}/#login`);
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill('fixture-only-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
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
  await page.getByRole('button', { name: 'Continue with Gotrade for VT' }).waitFor();
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
  await page.getByLabel('Amount paid (PHP, optional)').fill('6500');
  await shot('record-from-pending', 390);
  await page.getByRole('button', { name: 'Review investment' }).click();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await page.getByText('Investment recorded').waitFor();
  await page.locator('.pending-recording').waitFor({ state: 'detached' });
  assert.equal(pending.filter(item => item.status === 'pending').length, 0);
  await shot('pending-resolved-after-ledger', 390);
  await page.locator('.monthly-record-row').last().getByRole('button', { name: 'Record investment' }).click();
  await page.getByLabel('BTC received').fill('0.00015');
  await shot('dark-actual-recording', 390, 'dark');
  await page.getByRole('button', { name: 'Review investment' }).click();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await page.getByText('Investment recorded').waitFor();
  await page.getByText('Recorded Bitcoin').waitFor();
  await page.evaluate(() => { location.hash = 'home'; });
  await page.getByText('Added to Bitcoin').waitFor();
  await shot('home-factual-recent-activity', 390);
  await page.evaluate(() => { location.hash = 'portfolio'; });
  await page.getByRole('button', { name: 'View VT' }).waitFor();
  await page.evaluate(() => { location.hash = 'home/monthly'; });
  await page.getByRole('button', { name: 'Undo completion' }).click();
  await page.getByRole('button', { name: 'Confirm undo completion' }).click();
  await page.getByRole('heading', { name: 'Recorded investment activity' }).waitFor();
  await page.getByText('Recorded VT').waitFor();
  assert.equal(entries.length, 2, 'Undo must not alter investment entries');
  await shot('mobile-320-after-undo', 320);
  assert.equal(entries.length, 2); assert.equal(entries[0].amount_paid_php, '6500'); assert.equal(entries[1].amount_paid_php, null);
  assert.equal(pageErrors, 0); assert.equal(consoleErrors, 0); assert.equal(blockedExternal, 0);
  console.log(JSON.stringify({ fixtureOnly: true, screenshots: shots, entries: entries.length, pageErrors, consoleErrors, blockedExternal }));
} finally { await browser.close(); }
