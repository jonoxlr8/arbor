// Isolated synthetic browser review. All non-loopback requests are intercepted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.ARBOR_REVIEW_ORIGIN ?? 'http://127.0.0.1:3000';
const waysOnly = process.argv.includes('--ways-only');
const askOnly = process.argv.includes('--ask-only');
const datedOnly = process.argv.includes('--dated-only');
const tabletGraphOnly = process.argv.includes('--tablet-graph-only');
const homeLayoutOnly = process.argv.includes('--home-layout-only');
const reconstructionOnly = process.argv.includes('--reconstruction-only');
const realNavOnly = process.argv.includes('--real-nav-only');
const periodOnly = process.argv.includes('--period-only');
const historyOnly = process.argv.includes('--history-only') || reconstructionOnly || realNavOnly || periodOnly;
const sheetOnly = process.argv.includes('--sheet-only');
const output = waysOnly ? '/private/tmp/arbor-provider-link-review' : periodOnly ? '/private/tmp/arbor-period-chart-review' : realNavOnly ? '/private/tmp/arbor-real-nav-browser-review' : sheetOnly ? '/private/tmp/arbor-sheet-review' : reconstructionOnly ? '/private/tmp/arbor-reconstruction-review' : historyOnly ? '/private/tmp/arbor-history-review' : homeLayoutOnly ? '/private/tmp/arbor-home-layout-review' : tabletGraphOnly ? '/private/tmp/arbor-tablet-graph-review' : datedOnly ? '/private/tmp/arbor-dated-review' : askOnly ? '/private/tmp/arbor-ask-learn-review' : '/private/tmp/arbor-phase2b-retention-review';
const realNavPath = process.env.ARBOR_REAL_NAV_FIXTURE;
if (realNavOnly && (!realNavPath?.startsWith('/private/tmp/arbor-nav-qualification.') || !realNavPath.endsWith('/real-nav-browser.json')))
  throw new Error('Real-NAV browser review requires a task-owned local fixture file');
const realNavFixture = realNavOnly ? JSON.parse(readFileSync(realNavPath, 'utf8')) : null;
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
const observedDay = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0,10);
const observed = (offset,value,cost,gain,pct) => ({day:observedDay(offset),value_php:value,
  value_usd:offset===50?null:(Number(value)/50).toFixed(2),captured_at:`${observedDay(offset)}T12:00:00Z`,
  recorded_cost_php:cost,recorded_gain_php:gain,recorded_gain_percentage:pct,
  cost_complete:cost !== null,cost_context_captured:offset !== 50});
let historyFixture = [observed(50,'9000.00',null,null,null),observed(10,'10000.00','10000.00','0.00','0.00'),
  observed(6,'16000.00','16000.00','0.00','0.00'),observed(3,'16500.00','15000.00','1500.00','10.00'),
  observed(1,'14000.00','15000.00','-1000.00','-6.67'),observed(0,'15000.00','14000.00','1000.00','7.14')];
if (reconstructionOnly) historyFixture = historyFixture.map((point,index) => index === 0 ? point : ({
  ...point,origin:'reconstructed',captured_at:null,cost_context_captured:false,segment:0,
  source_dates:[{price_key:'usd_php',source:'bsp',observation_date:point.day,
    observed_at:`${point.day}T00:00:00Z`,rate:'50',fetched_at:now,
    provenance:'https://www.bsp.gov.ph/statistics/external/day99_data.aspx',valuation_date:point.day}],
}));
if (realNavOnly) {
  assert.ok(Array.isArray(realNavFixture.history) && realNavFixture.history.length > 1);
  historyFixture = realNavFixture.history;
  assert.ok(historyFixture.some(point => point.source_dates?.some(source => source.source === 'toap')));
}
if (periodOnly) {
  const gains = [[1900,'1000'],[400,'2000'],[60,'3000'],[35,'4000'],[31,'5000'],[10,'6000'],[8,'7000'],[6,'8000'],[2,'9000'],[1,'10000'],[0,'12000']];
  historyFixture = gains.map(([offset,gain]) => ({...observed(offset,(20000+Number(gain)).toFixed(2),'20000.00',`${gain}.00`,null),
    value_usd:offset===2?null:((20000+Number(gain))/50).toFixed(2),segment:offset>=6?0:1}));
}
let historyCurrent = { value:'15000.00', cost:'14000.00', gain:'1000.00', percentage:'7.14' };
if (realNavOnly) {
  const latest = historyFixture.at(-1);
  historyCurrent = { value:latest.value_php, cost:latest.recorded_cost_php,
    gain:latest.recorded_gain_php, percentage:latest.recorded_gain_percentage,
    usd:latest.value_usd };
}
if (periodOnly) historyCurrent = {value:'32000.00',cost:'20000.00',gain:'12000.00',percentage:'60.00'};
const weights = [{ role: 'global_equity', percentage_points: 80 }, { role: 'defensive', percentage_points: 0 }, { role: 'technology_tilt', percentage_points: 10 }, { role: 'crypto', percentage_points: 10 }];
const plan = { strategy_engine_version: '2.0', profile: { strategy_engine_version: '2.0', full_name: 'Phase Two QA', country: 'Philippines', currency: 'PHP', emergency_savings: 'three_to_six_months', high_interest_debt: 'none', goal_target: 500000, goal_name: 'Home', goal_date: '2036-09-28', current_portfolio_value: 0, monthly_investment: 10000, horizon: 'ten_plus_years', risk_response: 'hold', saved_preferences: { technology_tilt: 0, bitcoin: 0 }, selected_approach: 'Aggressive', explicit_customization: { technology_tilt: 10, bitcoin: 10 }, implementation_choices: { global_equity: 'gotrade_vt', crypto: 'pdax_btc' } }, plan: { plan_basis: 'user_selected', strategy_engine_version: '2.0', selection: { risk_response: 'hold', horizon: 'ten_plus_years', requested_strategy: 'Growth', horizon_maximum_strategy: 'Aggressive', selected_strategy: 'Growth', is_short_term: false, cap_applied: false, reason: 'requested_strategy_retained' }, readiness: { readiness: 'ready', core_strategy_can_be_shown: true, actionable_contribution_guidance_allowed: true, technology_satellite_readiness_eligible: true, bitcoin_satellite_readiness_eligible: true, message_requirement: 'none' }, inflation_pct: 3, preference_result: { technology_tilt: { requested_percentage_points: 0, effective_percentage_points: 0, strategy_cap_percentage_points: 10, reasons: [] }, bitcoin: { requested_percentage_points: 0, effective_percentage_points: 0, strategy_cap_percentage_points: 10, reasons: [] }, effective_target: { strategy_engine_version: '2.0', base_strategy: 'Aggressive', allocation: { weights: [{ role: 'global_equity', percentage_points: 100 }, { role: 'defensive', percentage_points: 0 }, { role: 'technology_tilt', percentage_points: 0 }, { role: 'crypto', percentage_points: 0 }] } } }, dormant_selected_approach: null, historical_allocation_preserved: false, customization: { technology_tilt: 10, bitcoin: 10, provenance: 'user_selected' }, final_allocation: weights, path: 'long_term', selected_strategy: 'Aggressive', base_allocation: [{ role: 'global_equity', percentage_points: 100 }, { role: 'defensive', percentage_points: 0 }], planning_return_pct: 5.5 }, historical_plan: null, revision: '96613c4986b48f5b2b5e2a255b90a1ffa9be405441b583c34b5a3b02247d3176', profile_warning: null };
const catalog = [
  { product_id: 'gotrade_vt', provider: 'gotrade', provider_name: 'Gotrade', display_name: 'VT', sleeve: 'global_equity', price_kind: 'reference' },
  { product_id: 'pdax_btc', provider: 'pdax', provider_name: 'PDAX', display_name: 'Bitcoin', sleeve: 'crypto', price_kind: 'reference' },
  { product_id: 'gcash_global_equity', provider: 'gcash', provider_name: 'GFunds', display_name: 'ATRAM Global Equity Opportunity Feeder Fund', sleeve: 'global_equity', price_kind: 'nav' },
  { product_id: 'gotrade_vgt', provider: 'gotrade', provider_name: 'Gotrade', display_name: 'VGT', sleeve: 'technology_tilt', price_kind: 'reference' },
];
const breakdown = { contribution_amount: '10000.000', current_portfolio_value: '10000.00', source: 'recorded_portfolio', status: 'active', rows: [
  { sleeve: 'global_equity', target_percentage_points: '80', current_value: '10000', target_value_after_contribution: '16000', deficit: '6000', amount: '8000', product_id: 'gotrade_vt', provider_id: 'gotrade', minimum: null, status: 'ready' },
  { sleeve: 'crypto', target_percentage_points: '10', current_value: '0', target_value_after_contribution: '2000', deficit: '2000', amount: '2000', product_id: 'pdax_btc', provider_id: 'pdax', minimum: null, status: 'ready' },
], provider_groups: [{ provider_id: 'gotrade', amount: '8000', ready_amount: '8000', verify_minimum_amount: '0', waiting_amount: '0' }, { provider_id: 'pdax', amount: '2000', ready_amount: '2000', verify_minimum_amount: '0', waiting_amount: '0' }], ready_amount: '10000', recordable_amount: '10000.000', verify_minimum_amount: '0', waiting_amount: '0', choose_investment_amount: '0', reserve_amount: '0', unallocated_amount: '0' };
let checkin = null;
let entitlementMode = 'plus';
let marketScreenshot = false;
let showOpening = true;
let hasProfile = true;
const pending = [{ id: '00000000-0000-4000-8000-000000000201', product_id: 'gotrade_vt', provider: 'gotrade', source: 'monthly', status: 'pending', started_at: now, resolved_at: null }];
const entries = [];
const keys = new Map();
let pageErrors = 0, consoleErrors = 0, expectedMissingProfile404 = 0, blockedExternal = 0;
let snapshotRequests = 0, pendingWrites = 0;
const providerReferrers = [];
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
  if (waysOnly && ['https://www.heygotrade.com/', 'https://pdax.ph/'].includes(url.href)) {
    providerReferrers.push(request.headers().referer ?? null);
    return route.fulfill({contentType:'text/html',body:'<title>Provider navigation fixture</title>'});
  }
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
  if (path.endsWith('/account/entitlements')) return json({ tier: entitlementMode, status: entitlementMode === 'plus' ? 'trial' : 'active', effective_tier: entitlementMode, private_beta: entitlementMode === 'plus', features: entitlementMode === 'plus' ? ['live_portfolio', 'monthly_contribution_planner', 'monthly_checkin', 'profile_rebuild', 'future_projection', 'plan_alignment', 'ask_arbor_full'] : ['live_portfolio', 'plan_creation', 'basic_implementation'], ask_monthly_limit: entitlementMode === 'plus' ? null : 10, ask_usage: null, ask_usage_available: true, availability: { live_portfolio: true, monthly_checkin: true } });
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
    pendingWrites++;
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
    if (historyOnly) {
      response.history = historyFixture;
      response.known_value_php = historyCurrent.value; response.total_value_php = historyCurrent.value;
      response.total_value_usd = (Number(historyCurrent.value)/50).toFixed(2);
      response.recorded_cost_php = historyCurrent.cost; response.recorded_gain_php = historyCurrent.gain;
      response.recorded_gain_percentage = historyCurrent.percentage;
      response.holdings[0].units = '3'; response.holdings[0].value_php = historyCurrent.value;
      response.holdings[0].cost_basis_php = historyCurrent.cost; response.holdings[0].recorded_gain_php = historyCurrent.gain;
      response.holdings[0].recorded_gain_percentage = historyCurrent.percentage;
      response.provider_values_php.gotrade = historyCurrent.value;
      response.sleeves[0].known_value_php = historyCurrent.value;
    }
    if (realNavOnly) {
      response.holdings = [{ ...catalog[2], id:'00000000-0000-4000-8000-000000000103',
        units:realNavFixture.units, cost_basis_php:historyCurrent.cost, opening_units:'0',
        opening_cost_php:null, has_entries:true, manual_value_php:null, manual_value_updated_at:null,
        value_php:historyCurrent.value, freshness:'fresh', as_of:`${historyFixture.at(-1).day}T00:00:00Z`,
        updated_at:now, created_at:now, valuation_source:'nav',
        unit_price:realNavFixture.latest_nav, unit_price_currency:'PHP',
        recorded_gain_php:historyCurrent.gain,
        recorded_gain_percentage:historyCurrent.percentage }];
      response.total_value_usd = historyCurrent.usd;
      response.provider_values_php = { gcash:historyCurrent.value };
      response.data_sources = ['toap','bsp'];
      response.sleeves = response.sleeves.map(row => ({...row,
        known_value_php:row.sleeve==='global_equity'?historyCurrent.value:'0.00'}));
    }
    if (marketScreenshot) {
      response.holdings.push({ ...response.holdings[0], ...catalog[3], id: '00000000-0000-4000-8000-000000000104',
        units: '1.25', cost_basis_php: '6000.00', opening_units: '1.25', opening_cost_php: '6000.00',
        value_php: '7800.00', unit_price: '125.00', unit_price_currency: 'USD', recorded_gain_php: '1800.00', recorded_gain_percentage: '30.00' });
      response.known_value_php = '17800.00'; response.total_value_php = '17800.00';
      response.recorded_cost_php = '16000.00'; response.recorded_gain_php = '1800.00'; response.recorded_gain_percentage = '11.25';
      response.provider_values_php.gotrade = '17800.00'; response.data_sources.push('exchangerate_api');
      response.sleeves = response.sleeves.map(row => row.sleeve === 'technology_tilt'
        ? {...row, known_value_php: '7800.00', current_percentage: '43.82', difference_pp: '33.82'}
        : row.sleeve === 'global_equity' ? {...row, current_percentage: '56.18', difference_pp: '-23.82'} : row);
    }
    if (entitlementMode === 'free') { response.sleeves = []; response.provider_values_php = {}; }
    return json(response);
  }
  if (path.endsWith('/v2/portfolio/snapshot')) { snapshotRequests++; return json({ recorded: false, history: historyOnly ? historyFixture : [] }); }
  if (path.endsWith('/v2/portfolio/entries') && method === 'GET') {
    const selected = url.searchParams.get('month'); const rows = entries.filter(e => !e.voided_at && (!selected || e.investment_date.startsWith(selected)));
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
  const file = `${output}/${name}.png`; await page.screenshot({ path: file, fullPage: await page.locator('dialog[open]').count() === 0, animations: 'disabled', style: 'nextjs-portal{display:none!important}' }); shots.push(file);
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
async function scrolledViewportShot(name, width) {
  await page.setViewportSize({ width, height: 760 });
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) {
      dialog.scrollTop = dialog.scrollHeight;
      const edge = dialog.getBoundingClientRect();
      const last = dialog.querySelector('.sheet-body')?.lastElementChild?.getBoundingClientRect();
      return { kind: 'dialog', surfaceBottom: edge.bottom, contentBottom: last?.bottom ?? edge.bottom, viewportBottom: innerHeight,
        remainingScroll: dialog.scrollHeight - dialog.clientHeight - dialog.scrollTop };
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const main = document.querySelector('#app-content');
    return { kind: 'page', surfaceBottom: nav?.getBoundingClientRect().top ?? innerHeight,
      contentBottom: main?.lastElementChild?.getBoundingClientRect().bottom ?? 0, viewportBottom: innerHeight };
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(geometry.contentBottom <= geometry.surfaceBottom + 2,
    `${name}: final content is obscured (${JSON.stringify(geometry)})`);
  if (geometry.kind === 'dialog') {
    assert.ok(geometry.remainingScroll <= 2, `${name}: dialog did not reach its final content (${JSON.stringify(geometry)})`);
    assert.ok(geometry.contentBottom <= geometry.viewportBottom - 8, `${name}: dialog end is clipped by viewport (${JSON.stringify(geometry)})`);
    await page.locator('dialog .sheet-body > :last-child').scrollIntoViewIfNeeded();
  }
  const file = `${output}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled', style: 'nextjs-portal{display:none!important}' });
  shots.push(file);
}
try {
  if (sheetOnly) plan.profile.goal_target = 36000000;
  await page.goto(`${origin}/#login`);
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill('fixture-only-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  if (waysOnly) {
    await page.setViewportSize({width:390,height:900});
    await page.evaluate(() => { location.hash='home'; });
    const homeWays=page.locator('.home-plan-actions a[href="#portfolio/ways"]');
    await homeWays.waitFor();
    assert.equal(await homeWays.getAttribute('target'),null,'Home launcher stays in Arbor');
    await homeWays.click();
    const ways=page.getByRole('dialog',{name:'Ways to invest'});
    await ways.waitFor();
    assert.equal(new URL(page.url()).hash,'#portfolio/ways');
    await shot('home-ways-mobile',390);
    const direct=ways.getByRole('button',{name:'Continue with Gotrade (opens in a new tab)'});
    await direct.waitFor();
    const beforeHome=pendingWrites;
    const homePopupEvent=page.waitForEvent('popup');
    await direct.click();
    const homePopup=await homePopupEvent;
    await homePopup.waitForLoadState();
    await homePopup.waitForURL('https://www.heygotrade.com/');
    assert.equal(await homePopup.evaluate(()=>window.opener),null);
    assert.equal(pendingWrites,beforeHome+1);
    assert.equal(new URL(page.url()).hash,'#portfolio/ways','Arbor remains open after Home provider link');
    await homePopup.close();
    await ways.getByRole('button',{name:'Close'}).click();
    assert.equal(new URL(page.url()).hash,'#home');
    await page.evaluate(() => { location.hash='portfolio'; });
    const portfolioWays=page.locator('a[data-sheet-launcher="ways"]');
    await portfolioWays.waitFor();
    assert.equal(await portfolioWays.getAttribute('target'),null,'Portfolio launcher stays in Arbor');
    await portfolioWays.click();
    await ways.waitFor();
    await shot('portfolio-ways-mobile',390);
    const before=pendingWrites;
    const continueButton=ways.getByRole('button',{name:'Continue with PDAX (opens in a new tab)'});
    await continueButton.waitFor();
    const portfolioPopupEvent=page.waitForEvent('popup');
    await continueButton.click();
    const portfolioPopup=await portfolioPopupEvent;
    await portfolioPopup.waitForURL('https://pdax.ph/');
    assert.equal(await portfolioPopup.evaluate(()=>window.opener),null);
    assert.equal(pendingWrites,before+1,'pending return cue saved before provider navigation');
    assert.equal(new URL(page.url()).hash,'#portfolio/ways','Arbor remains open after Portfolio provider link');
    await portfolioPopup.close();
    assert.deepEqual(providerReferrers,[null,null],'provider visits disclose no Arbor referrer');
    assert.equal(pageErrors,0);assert.equal(consoleErrors,0);assert.equal(blockedExternal,0);
    console.log(JSON.stringify({fixtureOnly:true,screenshots:shots,pendingWrites:pendingWrites-before,pageErrors,consoleErrors,blockedExternal}));
  } else if (periodOnly) {
    await page.evaluate(() => { location.hash='portfolio'; });
    const chart=page.locator('.portfolio-chart').first();
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    const shotPeriod=async name=>{const file=`${output}/${name}.png`;await page.screenshot({path:file,animations:'disabled'});shots.push(file);};
    const gainText=()=>chart.locator('.chart-gain').innerText();
    const assertGain=async amount=>assert.ok((await gainText()).includes(amount),`expected ${amount}, got ${await gainText()}`);
    const selectDay=async (offset,type='mouse')=>{
      const first=Date.parse(`${observedDay(29)}T00:00:00Z`),last=Date.parse(`${observedDay(0)}T00:00:00Z`);
      const target=Date.parse(`${observedDay(offset)}T00:00:00Z`);
      const box=await chart.locator('.chart-plot').boundingBox();
      const x=box.x+8+(box.width-16)*(target-first)/(last-first),y=box.y+box.height/2;
      if(type==='mouse') await page.mouse.move(x,y);
      else {
        await chart.locator('.chart-plot').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:77,clientX:x,clientY:y,bubbles:true});
        await page.waitForTimeout(410);
        await chart.locator('.chart-plot').dispatchEvent('pointerup',{pointerType:'touch',pointerId:77,clientX:x,clientY:y,bubbles:true});
      }
      await chart.locator('.chart-selected-date[data-selected="true"]').waitFor();
    };
    const expected=[['1W','+₱5,000.00'],['1M','+₱7,000.00'],['3M','+₱10,000.00'],['6M','+₱10,000.00'],['1Y','+₱10,000.00'],['5Y','+₱11,000.00'],['All','+₱12,000.00']];
    assert.deepEqual(await chart.locator('.chart-range button').allTextContents(),expected.map(([label])=>label));
    for(const [label,amount] of expected){await chart.getByRole('button',{name:`${label} portfolio history`}).click();await assertGain(amount);}
    await chart.getByRole('button',{name:'1M portfolio history'}).click();
    assert.equal(await chart.locator('.chart-gain strong').count(),0,'period percentage is suppressed');
    assert.equal(((await chart.locator('.recharts-area-curve').getAttribute('d')).match(/M/g)||[]).length,1,
      'PHP line connects genuine points across missing dates and segment changes');
    await shotPeriod('portfolio-1m-php-desktop');
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    for(const [label,amount] of expected){await chart.getByRole('button',{name:`${label} portfolio history`}).click();await assertGain(amount);}
    await chart.getByRole('button',{name:'1M portfolio history'}).click();
    const path=await chart.locator('.recharts-area-curve').getAttribute('d');
    assert.equal((path.match(/M/g)||[]).length,1,'one connected curve across missing FX and segment boundaries');
    assert.equal(await chart.locator('.chart-plot').getAttribute('aria-label'),
      'Inspect 5 historical portfolio values. Use left and right arrow keys.');
    await assertGain('+₱7,000.00');
    await shotPeriod('portfolio-1m-usd-connected-desktop');
    await selectDay(6);
    await assertGain('+₱3,000.00');
    const xSix=Number(await chart.locator('.recharts-reference-dot circle').getAttribute('cx'));
    assert.ok((await chart.locator('.chart-selected-date').innerText()).includes(new Date(`${observedDay(6)}T00:00:00Z`).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})));
    await shotPeriod('portfolio-1m-usd-hover');
    await selectDay(1);
    const xOne=Number(await chart.locator('.recharts-reference-dot circle').getAttribute('cx'));
    const plotWidth=(await chart.locator('.chart-plot').boundingBox()).width;
    assert.ok(Math.abs((xOne-xSix)/(plotWidth-16)-5/29)<.03,'five elapsed days preserve calendar spacing in the 30-day window');
    await selectDay(2);
    assert.ok((await chart.locator('.chart-selected-date').innerText()).includes(new Date(`${observedDay(1)}T00:00:00Z`).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})),
      'missing USD date selects nearest genuine observation');
    await page.mouse.move(20,20);await assertGain('+₱7,000.00');
    await chart.locator('.chart-plot').focus();await chart.locator('.chart-plot').press('ArrowRight');
    assert.equal(await chart.locator('.chart-selected-date[data-selected="true"]').count(),1);
    await chart.locator('.chart-plot').press('Escape');await assertGain('+₱7,000.00');
    await chart.getByRole('button',{name:'Switch portfolio display to PHP'}).click();
    await page.setViewportSize({width:390,height:850});
    await shotPeriod('portfolio-1m-php-mobile');
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    await selectDay(6,'touch');await assertGain('+₱3,000.00');
    const dragBox=await chart.locator('.chart-plot').boundingBox();
    const firstTime=Date.parse(`${observedDay(29)}T00:00:00Z`),lastTime=Date.parse(`${observedDay(0)}T00:00:00Z`);
    const touchX=offset=>dragBox.x+8+(dragBox.width-16)*(Date.parse(`${observedDay(offset)}T00:00:00Z`)-firstTime)/(lastTime-firstTime);
    const touchY=dragBox.y+dragBox.height/2;
    await chart.locator('.chart-plot').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:78,clientX:touchX(6),clientY:touchY,bubbles:true});
    await page.waitForTimeout(410);
    await chart.locator('.chart-plot').dispatchEvent('pointermove',{pointerType:'touch',pointerId:78,clientX:touchX(1),clientY:touchY,bubbles:true});
    await chart.locator('.chart-plot').dispatchEvent('pointerup',{pointerType:'touch',pointerId:78,clientX:touchX(1),clientY:touchY,bubbles:true});
    await assertGain('+₱5,000.00');
    await shotPeriod('portfolio-1m-usd-touch-mobile');
    await chart.getByRole('button',{name:'1W portfolio history'}).click();await assertGain('+₱5,000.00');
    historyCurrent={value:'26000.00',cost:'20000.00',gain:'6000.00',percentage:'30.00'};
    await page.reload();await chart.waitFor();
    await chart.getByRole('button',{name:'1W portfolio history'}).click();await assertGain('−₱1,000.00');
    await shotPeriod('portfolio-week-loss-mobile');
    historyFixture=[observed(8,'10000.00','10000.00','0.00','0.00'),observed(0,'60000.00','60000.00','0.00','0.00')];
    historyCurrent={value:'60000.00',cost:'60000.00',gain:'0.00',percentage:'0.00'};
    await page.reload();await chart.waitFor();await chart.getByRole('button',{name:'1W portfolio history'}).click();
    await assertGain('₱0.00');assert.equal(await chart.getAttribute('data-gain'),'zero');
    await shotPeriod('portfolio-contribution-neutral-mobile');
    // Exact Sep 6–8 regression on today's relative calendar: a missing Sep 7
    // must be a horizontal hold followed by a vertical jump, not a blank or slope.
    const gapPoint=(offset,value,cost,gain,usd,segment)=>({...observed(offset,value,cost,gain,null),value_usd:usd,segment});
    const baseline=gapPoint(35,'850000.00','830000.00','20000.00','17000.00',0);
    const sep6=gapPoint(24,'900000.00','870000.00','30000.00','18000.00',0);
    const sep7=gapPoint(23,'915000.00','870000.00','45000.00',null,1);
    const sep8=gapPoint(22,'930000.00','880000.00','50000.00','18600.00',1);
    const sep10=gapPoint(20,'940000.00','880000.00','60000.00','18800.00',1);
    const pathCoordinates=async()=>{
      const path=await chart.locator('.recharts-area-curve').getAttribute('d');
      assert.equal((path.match(/M/g)||[]).length,1,'step chart remains one connected series');
      return [...path.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(match=>({x:Number(match[1]),y:Number(match[2])}));
    };
    const assertHoldThenJump=async(count)=>{
      const coordinates=await pathCoordinates();
      assert.equal(coordinates.length,2*count-1,'each pair of genuine points gets a hold and a jump');
      for(let index=0;index<coordinates.length-2;index+=2){
        assert.ok(Math.abs(coordinates[index].y-coordinates[index+1].y)<.1,'previous value stays flat until next genuine date');
        assert.ok(Math.abs(coordinates[index+1].x-coordinates[index+2].x)<.1,'new value appears at next genuine date');
      }
      return coordinates;
    };
    const assertMissingNotSelected=async(type)=>{
      const box=await chart.locator('.chart-plot').boundingBox();
      const x=box.x+8+(box.width-16)*.25,y=box.y+box.height/2;
      if(type==='touch'){
        await chart.locator('.chart-plot').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:79,clientX:x,clientY:y,bubbles:true});
        await page.waitForTimeout(410);
        await chart.locator('.chart-plot').dispatchEvent('pointerup',{pointerType:'touch',pointerId:79,clientX:x,clientY:y,bubbles:true});
      } else await page.mouse.move(x,y);
      await chart.locator('.chart-selected-date[data-selected="true"]').waitFor();
      assert.ok(!(await chart.locator('.chart-selected-date').innerText()).includes(new Date(`${sep7.day}T00:00:00Z`).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})),
        'unsupported Sep 7 is never selected');
    };
    historyFixture=[baseline,sep6,sep8,sep10];
    historyCurrent={value:'940000.00',cost:'880000.00',gain:'60000.00',percentage:'6.82'};
    await page.setViewportSize({width:1440,height:950});await page.reload();await chart.waitFor();
    await assertGain('+₱40,000.00');
    assert.equal(await chart.locator('.chart-plot').getAttribute('aria-label'),'Inspect 3 historical portfolio values. Use left and right arrow keys.');
    const phpSteps=await assertHoldThenJump(5);
    assert.ok(Math.abs((phpSteps[4].x-phpSteps[2].x)-(phpSteps[6].x-phpSteps[4].x))<1,'two-day spans keep equal calendar-time width');
    await shotPeriod('gap-portfolio-php-desktop');
    await assertMissingNotSelected('mouse');
    await chart.locator('.chart-plot').focus();await chart.locator('.chart-plot').press('Escape');
    await chart.locator('.chart-plot').press('ArrowRight');await chart.locator('.chart-plot').press('ArrowRight');
    assert.ok((await chart.locator('.chart-selected-date').innerText()).includes(new Date(`${sep8.day}T00:00:00Z`).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})));
    await page.setViewportSize({width:390,height:900});await chart.locator('.chart-plot').press('Escape');
    await assertMissingNotSelected('touch');await shotPeriod('gap-portfolio-php-touch-390');
    await page.evaluate(()=>{location.hash='home';});await chart.waitFor();
    await assertHoldThenJump(5);await shotPeriod('gap-home-php-390');
    await page.setViewportSize({width:1440,height:950});await shotPeriod('gap-home-php-desktop');
    historyFixture=[baseline,sep6,sep7,sep8,sep10];
    await page.reload();await chart.waitFor();
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    assert.equal(await chart.locator('.chart-plot').getAttribute('aria-label'),'Inspect 3 historical portfolio values. Use left and right arrow keys.');
    await assertHoldThenJump(5);await shotPeriod('gap-home-usd-desktop');
    await page.setViewportSize({width:390,height:900});await assertMissingNotSelected('touch');
    await shotPeriod('gap-home-usd-touch-390');
    await page.evaluate(()=>{location.hash='portfolio';});await chart.waitFor();
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    await assertGain('+₱40,000.00');await assertHoldThenJump(5);await shotPeriod('gap-portfolio-usd-390');
    await assertMissingNotSelected('touch');
    historyFixture=[baseline,sep6,sep10];
    await page.reload();await chart.waitFor();
    await assertHoldThenJump(4);
    assert.equal(await chart.locator('.chart-plot').getAttribute('aria-label'),'Inspect 2 historical portfolio values. Use left and right arrow keys.');
    await shotPeriod('gap-portfolio-four-day-hold-390');
    historyFixture=[baseline,sep6,sep7,sep8,sep10];
    await page.evaluate(()=>{location.hash='home';});await chart.waitFor();
    assert.deepEqual(await chart.locator('.chart-range button').allTextContents(),expected.map(([label])=>label));
    const homeExpected=[['1W','₱0.00'],['1M','+₱40,000.00'],['3M','Period gain/loss unavailable'],
      ['6M','Period gain/loss unavailable'],['1Y','Period gain/loss unavailable'],
      ['5Y','Period gain/loss unavailable'],['All','+₱60,000.00']];
    for(const [label,amount] of homeExpected){await chart.getByRole('button',{name:`${label} portfolio history`}).click();await assertGain(amount);}
    await chart.getByRole('button',{name:'1M portfolio history'}).click();await assertGain('+₱40,000.00');
    await shotPeriod('home-seven-ranges-390');
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    for(const [label,amount] of homeExpected){await chart.getByRole('button',{name:`${label} portfolio history`}).click();await assertGain(amount);}
    await chart.getByRole('button',{name:'1M portfolio history'}).click();await assertGain('+₱40,000.00');
    await page.setViewportSize({width:1440,height:950});await shotPeriod('home-seven-ranges-desktop');
    const oldPrior=gapPoint(130,'10000.00','9000.00','1000.00','200.00',0);
    const oldFirst=gapPoint(80,'12000.00','9000.00','3000.00','240.00',0);
    const oldMissing=gapPoint(75,'13000.00','9000.00','4000.00',null,1);
    const oldNext=gapPoint(65,'14000.00','9000.00','5000.00','280.00',1);
    const oldMissingTwo=gapPoint(55,'15000.00','9000.00','6000.00',null,2);
    const oldLast=gapPoint(40,'16000.00','9000.00','7000.00','320.00',2);
    historyFixture=[oldPrior,oldFirst,oldMissing,oldNext,oldMissingTwo,oldLast];
    historyCurrent={value:'16000.00',cost:'9000.00',gain:'7000.00',percentage:'77.78'};
    await page.evaluate(()=>{location.hash='portfolio';});await page.reload();await chart.waitFor();
    await chart.getByRole('button',{name:'3M portfolio history'}).click();
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    assert.equal(await chart.locator('.chart-plot').getAttribute('aria-label'),'Inspect 3 historical portfolio values. Use left and right arrow keys.');
    await assertHoldThenJump(5);
    await shotPeriod('older-disjoint-gaps-usd-desktop');
    historyFixture=[oldFirst,oldMissing,oldNext,oldMissingTwo,oldLast];
    await page.reload();await chart.waitFor();await chart.getByRole('button',{name:'3M portfolio history'}).click();
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    const noPrior=await pathCoordinates();
    assert.ok(noPrior[0].x>20,'first supported point begins after the range boundary; no value carries backward');
    await shotPeriod('no-backward-carry-usd-desktop');
    await page.evaluate(()=>{location.hash='ask';});
    await page.getByRole('tab',{name:'Learn'}).click();
    for(const [category,glyph] of [['Basics','facets'],['ETFs','globe'],['Funds','layers'],['Crypto','coin'],['Arbor',null]]){
      await page.getByRole('button',{name:category,exact:true}).click();
      const mark=page.locator(`.learn-mark-${category.toLowerCase()}`).first();
      await mark.waitFor();
      assert.equal(await mark.locator('svg').count(),1,`${category} has a vector mark`);
      if(glyph) assert.equal(await mark.locator('svg').getAttribute('data-glyph'),glyph);
      else assert.ok(await mark.locator('svg path').count(),`${category} uses the Arbor brand mark`);
    }
    await shotPeriod('learn-arbor-mark-desktop');
    await page.setViewportSize({width:390,height:900});await shotPeriod('learn-arbor-mark-390');
    await page.getByRole('button',{name:'All',exact:true}).click();
    await page.setViewportSize({width:1440,height:950});await shotPeriod('learn-marks-desktop');
    await page.setViewportSize({width:390,height:900});await shotPeriod('learn-marks-390');
    await page.emulateMedia({colorScheme:'dark'});await shotPeriod('learn-marks-dark-390');
    assert.equal(pageErrors,0);assert.equal(consoleErrors,0);assert.equal(blockedExternal,0);
    console.log(JSON.stringify({fixtureOnly:true,screenshots:shots,pageErrors,consoleErrors,blockedExternal}));
  } else if (realNavOnly) {
    const first = historyFixture[0];
    assert.equal(first.day,'2026-08-18');
    assert.ok(first.source_dates.some(source => source.source==='toap' && source.observation_date==='2026-08-18'));
    assert.ok(first.source_dates.some(source => source.source==='bsp' && source.observation_date==='2026-08-18'));
    assert.equal(historyFixture.some(point => point.day==='2026-09-29' && point.value_php==='99999'),false);
    await page.evaluate(() => { location.hash='portfolio'; });
    const chart = page.locator('.portfolio-chart').first();
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    await page.locator('.holding-row').filter({hasText:'ATRAM'}).waitFor();
    await chart.getByRole('button',{name:'All portfolio history'}).click();
    await shot('real-nav-portfolio-all-php',1440);
    const inspect = async (type, expectedDate) => {
      await chart.locator('.chart-plot').scrollIntoViewIfNeeded();
      const box=await chart.locator('.chart-plot').boundingBox();
      const x=box.x+8,y=box.y+box.height/2;
      if(type==='touch') {
        await chart.locator('.chart-plot').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:17,clientX:x,clientY:y,bubbles:true});
        await page.waitForTimeout(420);
        await chart.locator('.chart-plot').dispatchEvent('pointermove',{pointerType:'touch',pointerId:17,clientX:x+4,clientY:y,bubbles:true});
        await chart.locator('.chart-plot').dispatchEvent('pointerup',{pointerType:'touch',pointerId:17,clientX:x+4,clientY:y,bubbles:true});
      } else await page.mouse.move(x,y);
      await chart.locator('.chart-selected-date[data-selected="true"]').waitFor();
      assert.ok((await chart.locator('.chart-selected-date').innerText()).includes(expectedDate));
    };
    await inspect('mouse','Aug 18, 2026');
    assert.ok((await chart.locator('.chart-value').innerText()).includes(first.value_php));
    await shot('real-nav-portfolio-aug18-hover-php',1440);
    await chart.getByRole('button',{name:'Switch portfolio display to USD'}).click();
    const usdFirst=historyFixture.find(point=>point.value_usd!==null);
    assert.equal(usdFirst.day,'2026-09-01');
    await inspect('mouse','Sep 1, 2026');
    assert.ok((await chart.locator('.chart-value').innerText()).includes(usdFirst.value_usd));
    assert.ok((await chart.locator('.chart-usd-limitation').innerText()).includes('USD history from Sep 1, 2026'));
    await shot('real-nav-portfolio-sep1-hover-usd',1440);
    await page.setViewportSize({width:390,height:900});
    await inspect('touch','Sep 1, 2026');
    await shot('real-nav-portfolio-sep1-touch-usd-390',390);
    await page.evaluate(() => { location.hash='home'; });
    await page.getByRole('region',{name:'Portfolio value graph'}).waitFor();
    await shot('real-nav-home-390',390);
    assert.equal(pageErrors,0);assert.equal(consoleErrors,0);assert.equal(blockedExternal,0);
    console.log(JSON.stringify({fixtureOnly:true,realImportedNav:true,
      sourceDates:first.source_dates.map(source=>({source:source.source,observation_date:source.observation_date})),
      screenshots:shots,pageErrors,consoleErrors,blockedExternal}));
  } else if (sheetOnly) {
    await page.evaluate(() => { location.hash = 'home'; });
    await page.getByRole('region', { name: 'Portfolio value graph' }).waitFor();
    const geometry = async () => page.evaluate(() => {
      const box = selector => { const element = document.querySelector(selector); const rect = element?.getBoundingClientRect(); return rect ? {top:rect.top,bottom:rect.bottom,height:rect.height} : null; };
      return {portfolio:box('.home-portfolio'),utility:box('.home-utility-stack'),goal:box('.home-goal'),monthly:box('.home-monthly'),projection:box('.home-projection'),plan:box('.home-plan'),activity:box('.home-activity')};
    });
    for (const width of [1440,1280,1024,960,900,820,768,430,390,360,320]) {
      await shot(`home-${width}`,width);
      const parts=await geometry();
      if(width>=1000) assert.ok(Math.abs(parts.portfolio.bottom-parts.utility.bottom)<=2,`${width}: right stack matches Portfolio`);
      else assert.ok(parts.portfolio.top<parts.goal.top && parts.goal.top<parts.monthly.top && parts.monthly.top<parts.projection.top && parts.projection.top<parts.plan.top && parts.plan.top<parts.activity.top,`${width}: stacked Home order`);
      const moneyLayout=await page.evaluate(()=>{
        const current=document.querySelector('.home-goal .home-financial-amount');
        const target=document.querySelector('.home-goal .home-financial-target');
        const monthly=document.querySelector('.home-monthly .home-financial-amount');
        return {current:Number.parseFloat(getComputedStyle(current).fontSize),target:Number.parseFloat(getComputedStyle(target).fontSize),monthly:Number.parseFloat(getComputedStyle(monthly).fontSize),overflow:document.documentElement.scrollWidth-innerWidth,
          targetOverflow:target.scrollWidth-target.clientWidth};
      });
      assert.ok(Math.abs(moneyLayout.current-moneyLayout.monthly)<=1,`${width}: Goal current and Monthly typography match (${JSON.stringify(moneyLayout)})`);
      assert.ok(moneyLayout.target>=moneyLayout.monthly*.8,`${width}: Goal target remains a prominent amount`);
      assert.ok(moneyLayout.overflow<=1 && moneyLayout.targetOverflow<=1,`${width}: long Goal target does not overflow (${JSON.stringify(moneyLayout)})`);
    }
    for (const width of [1024,390]) await shot(`home-dark-${width}`,width,'dark');
    await shot('home-plan-then-activity-mobile',390);
    await scrolledViewportShot('home-bottom-390',390);
    const beforeHomeWays={entries:entries.length,pending:pending.length,snapshots:snapshotRequests,pendingWrites};
    const homeWaysScroll=await page.locator('.home-plan-actions a[href="#portfolio/ways"]').evaluate(element=>{element.scrollIntoView({block:'center'});return scrollY;});
    await page.locator('.home-plan-actions a[href="#portfolio/ways"]').click();
    await page.getByRole('dialog',{name:'Ways to invest'}).waitFor();
    await shot('home-ways-open-390',390);
    assert.deepEqual({entries:entries.length,pending:pending.length,snapshots:snapshotRequests,pendingWrites},beforeHomeWays,'Home Ways launcher is read-only');
    await page.getByRole('dialog',{name:'Ways to invest'}).getByRole('button',{name:'Close'}).click();
    await page.getByRole('heading',{name:'Your plan'}).waitFor();
    assert.equal(new URL(page.url()).hash,'#home','Home Ways Close returns to Home');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('href')),'#portfolio/ways','Home Ways launcher receives focus after close');
    const waysReturnScroll=await page.evaluate(()=>scrollY);
    assert.ok(Math.abs(waysReturnScroll-homeWaysScroll)<200,`Home Ways close preserves a useful scroll position despite fixture viewport resize: ${homeWaysScroll} → ${waysReturnScroll}`);
    for(let index=0;index<10;index++) entries.push({id:`fixture-activity-${index}`,holding_id:'00000000-0000-4000-8000-000000000101',product_id:'gotrade_vt',provider:'gotrade',
      investment_date:observedDay(index),units:'0.1',amount_paid_php:'500.00',recorded_at:now,updated_at:now,revision:1,voided_at:index===9?now:null});
    const recent=page.getByRole('link',{name:'View all recorded activity'});
    const homeActivityScroll=await recent.evaluate(element=>{element.scrollIntoView({block:'center'});return scrollY;});
    await recent.click();
    await page.getByRole('dialog',{name:'Investment activity'}).waitFor();
    assert.equal(await page.getByRole('dialog',{name:'Investment activity'}).locator('.activity-entry').count(),9);
    assert.doesNotMatch(await page.getByRole('dialog',{name:'Investment activity'}).innerText(),/voided|deleted investment/i);
    await page.getByRole('dialog',{name:'Investment activity'}).getByRole('button',{name:'Edit or delete'}).first().click();
    await page.getByRole('dialog',{name:'Investment activity'}).getByRole('button',{name:'Edit',exact:true}).first().waitFor();
    await page.getByRole('dialog',{name:'Investment activity'}).getByRole('button',{name:'Delete',exact:true}).first().waitFor();
    await page.getByRole('button',{name:'All investment activity'}).click();
    await page.getByRole('dialog',{name:'Investment activity'}).locator('.investment-line').first().waitFor();
    assert.equal(new URL(page.url()).hash,'#home/activity');
    assert.equal(await page.locator('.home-dashboard').count(),1,'Home remains beneath the activity sheet');
    await shot('home-activity-open-390',390);
    for(const width of [1440,1024,768,430,390,320]) await shot(`activity-${width}`,width);
    for(const width of [390,320]) await scrolledViewportShot(`activity-bottom-${width}`,width);
    for(const width of [1024,768,390]) await shot(`activity-dark-${width}`,width,'dark');
    await page.getByRole('dialog',{name:'Investment activity'}).getByRole('button',{name:'Close'}).click();
    await page.getByRole('heading',{name:'Recent activity'}).waitFor();
    assert.equal(new URL(page.url()).hash,'#home');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('href')),'#home/activity','Home launcher receives focus after close');
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-homeActivityScroll)<200,'Home Activity close preserves a useful scroll position despite fixture viewport resize');
    await recent.click();
    await page.getByRole('dialog',{name:'Investment activity'}).waitFor();
    await page.goBack();
    await page.getByRole('heading',{name:'Recent activity'}).waitFor();
    assert.equal(await page.getByRole('dialog',{name:'Investment activity'}).count(),0,'browser Back closes Home activity');
    assert.equal(new URL(page.url()).hash,'#home');
    await page.evaluate(()=>{location.hash='portfolio';});
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    for(const width of [1440,768,390,320]) {
      await shot(`portfolio-order-${width}`,width);
      const order=await page.evaluate(()=>['.portfolio-value','#section-holdings','[data-sheet-launcher="ways"]','.portfolio-insights,[class="portfolio-plus-preview"]','[data-sheet-launcher="history"]','.portfolio-data'].map(selector=>document.querySelector(selector)?.getBoundingClientRect().top));
      assert.ok(order.every(Number.isFinite) && order.every((top,index)=>index===0 || top>order[index-1]),`${width}: Portfolio section order ${JSON.stringify(order)}`);
    }
    await scrolledViewportShot('portfolio-bottom-390',390);
    await page.getByRole('link',{name:'Investment activity'}).click();
    await page.getByRole('dialog',{name:'Investment activity'}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    assert.equal(new URL(page.url()).hash,'#portfolio');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-sheet-launcher')),'history','Portfolio launcher receives focus after Escape');
    const before={entries:entries.length,pending:pending.length,snapshots:snapshotRequests,pendingWrites};
    await page.getByRole('link',{name:'Ways to invest'}).click();
    const ways=page.getByRole('dialog',{name:'Ways to invest'});
    await ways.waitFor();
    await ways.locator('.implementation-option').first().waitFor();
    for(const width of [1440,1024,768,430,390,320]) await shot(`ways-${width}`,width);
    for(const width of [390,320]) await scrolledViewportShot(`ways-bottom-${width}`,width);
    for(const width of [1024,768,390]) await shot(`ways-dark-${width}`,width,'dark');
    assert.deepEqual({entries:entries.length,pending:pending.length,snapshots:snapshotRequests,pendingWrites},before,'opening Ways is read-only');
    await page.goBack();
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    assert.equal(await page.getByRole('dialog',{name:'Ways to invest'}).count(),0,'browser Back closes Ways');
    await page.evaluate(()=>{location.hash='portfolio/ways';});
    await ways.waitFor();await page.reload();await ways.waitFor();
    await ways.getByRole('button',{name:'Close'}).click();
    assert.equal(new URL(page.url()).hash,'#portfolio','direct Ways bookmark closes to Portfolio rather than leaving app');
    entitlementMode='free';await page.reload();
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    await page.locator('.portfolio-value').waitFor();
    const freeOrder=await page.evaluate(()=>['[data-sheet-launcher="ways"]','.portfolio-plus-preview','[data-sheet-launcher="history"]','.portfolio-data'].map(selector=>document.querySelector(selector)?.getBoundingClientRect().top));
    assert.ok(freeOrder.every(Number.isFinite) && freeOrder.every((top,index)=>index===0 || top>freeOrder[index-1]),`Free Portfolio keeps the same factual/Plus section order: ${JSON.stringify(freeOrder)} at ${new URL(page.url()).hash}`);
    await page.getByRole('link',{name:'Investment activity'}).click();
    await page.getByRole('dialog',{name:'Investment activity'}).waitFor();
    assert.equal(await page.getByText('Plan Alignment').count(),0,'Free is not sent Plus analysis');
    assert.equal(pageErrors,0,'browser page errors');assert.equal(consoleErrors,0,'browser console errors');assert.equal(blockedExternal,0,'unhandled external requests');
    console.log(JSON.stringify({fixtureOnly:true,screenshots:shots,pageErrors,consoleErrors,blockedExternal,before,after:{entries:entries.length,pending:pending.length,snapshots:snapshotRequests,pendingWrites}}));
  } else if (historyOnly) {
    const capture = async name => { const file=`${output}/${name}.png`; await page.screenshot({path:file,fullPage:false,animations:'disabled',style:'nextjs-portal{display:none!important}'});shots.push(file); };
    const chart = () => page.locator('.portfolio-chart').first();
    const layout = () => chart().evaluate(element => {
      const rect = node => { const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:box.height}; };
      return {card:rect(element.closest('.home-portfolio,.portfolio-value')),plot:rect(element.querySelector('.chart-plot')),
        range:rect(element.querySelector('.chart-range'))};
    });
    const assertStable = (before,after,label) => {
      for(const part of ['card','plot','range']) {
        assert.ok(Math.abs(before[part].height-after[part].height)<=0.1,`${label}: ${part} height shifted by ${after[part].height-before[part].height}px; ${JSON.stringify({before,after})}`);
        if(part !== 'card') assert.ok(Math.abs((before[part].top-before.card.top)-(after[part].top-after.card.top))<=0.1,
          `${label}: ${part} moved within its card`);
      }
      assert.ok(Math.abs(before.card.top-after.card.top)<=1,`${label}: card position moved by more than browser subpixel reflow`);
    };
    const inspect = async (fraction, type='mouse') => {
      const box=await chart().locator('.chart-plot').boundingBox();
      assert.ok(box,'chart plot exists');
      const x=box.x+8+(box.width-16)*fraction, y=box.y+box.height/2;
      if(type==='mouse') await page.mouse.move(x,y);
      else {
        await chart().locator('.chart-plot').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:x,clientY:y,bubbles:true});
        await page.waitForTimeout(420);
        await chart().locator('.chart-plot').dispatchEvent('pointermove',{pointerType:'touch',pointerId:7,clientX:x+4,clientY:y,bubbles:true});
        await chart().locator('.chart-plot').dispatchEvent('pointerup',{pointerType:'touch',pointerId:7,clientX:x+4,clientY:y,bubbles:true});
      }
      await chart().locator('.chart-selected-date[data-selected="true"]').waitFor();
      assert.equal(await chart().locator('.chart-inspection-tooltip').count(),0,'inspection has no floating card');
    };
    await page.getByRole('region',{name:'Portfolio value graph'}).waitFor();
    for(const width of [1440,1280,1024,768,430,390,360,320]) {
      await shot(`home-range-${width}`,width);
      const geometry=await page.evaluate(()=>{
        const box=s=>document.querySelector(s)?.getBoundingClientRect();
        return {portfolio:box('.home-portfolio'),stack:box('.home-utility-stack'),overflow:document.documentElement.scrollWidth-innerWidth};
      });
      assert.ok(geometry.overflow<=0,`Home ${width} horizontal overflow`);
      if(width>=1000) assert.ok(Math.abs(geometry.portfolio.bottom-geometry.stack.bottom)<=2,`Home ${width} paired height`);
    }
    await page.setViewportSize({width:1440,height:900});
    assert.equal(await chart().getAttribute('data-gain'),'positive');
    assert.equal(await chart().locator('.chart-selected-date[data-selected="true"]').count(),0);
    await capture('fidelity-home-idle');
    const homeIdleLayout=await layout();
    const homeHighY=await chart().locator('.chart-extreme-high').evaluate(guide=>guide.getBoundingClientRect().top);
    const homeLabelWidth=await chart().locator('.chart-extreme-text').first().evaluate(label=>label.getBoundingClientRect().width);
    assert.ok(homeLabelWidth<180,'Home high label backing hugs its text');
    await chart().getByRole('button',{name:'1W portfolio history'}).click();
    assert.equal(await chart().getAttribute('data-gain'),'positive','range movement cannot change recorded-cost gain');
    await chart().getByRole('button',{name:'1M portfolio history'}).click();
    await inspect(.7);assert.match(await chart().locator('.chart-value').innerText(),/₱16,500\.00/);
    assert.match(await chart().locator('.chart-gain').innerText(),/\+₱1,500\.00/);
    assertStable(homeIdleLayout,await layout(),'Home desktop inspection');
    assert.equal(await chart().locator('.chart-extrema').count(),0,'Home high/low hide while inspecting');
    const homeHighDotY=await chart().locator('.recharts-reference-dot circle').evaluate(dot=>{const box=dot.getBoundingClientRect();return box.top+box.height/2});
    assert.ok(Math.abs(homeHighY-homeHighDotY)<=2,'Home high guide meets plotted high');
    await capture('fidelity-home-hover');
    await page.mouse.move(220,55);
    assertStable(homeIdleLayout,await layout(),'Home desktop hover exit');
    for(const width of [1280,1024]) {
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(120);
      const before=await layout();await inspect(.7);assertStable(before,await layout(),`Home ${width} inspection`);
      assert.equal(await chart().locator('.chart-extrema').count(),0);
      await page.mouse.move(220,55);assertStable(before,await layout(),`Home ${width} exit`);
    }
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>{location.hash='portfolio';});
    await page.getByRole('heading',{name:'Holdings'}).waitFor();
    assert.match(await chart().locator('.chart-value').innerText(),/₱15,000\.00/);
    assert.match(await chart().locator('.chart-gain').innerText(),/\+₱1,000\.00/);
    assert.equal(await chart().locator('.chart-selected-date[data-selected="true"]').count(),0);
    await capture('fidelity-portfolio-idle-positive');
    const portfolioIdleLayout=await layout();
    const guideY=await chart().locator('.chart-extrema').evaluate(extrema=>({
      high:extrema.querySelector('.chart-extreme-high').getBoundingClientRect().top,
      low:extrema.querySelector('.chart-extreme-low').getBoundingClientRect().top,
    }));
    await inspect(.7);assert.match(await chart().locator('.chart-value').innerText(),/₱16,500\.00/);
    assert.match(await chart().locator('.chart-gain').innerText(),/\+₱1,500\.00/);
    assert.match(await chart().locator('.chart-selected-date').innerText(),/Sep/);
    assertStable(portfolioIdleLayout,await layout(),'Portfolio desktop inspection');
    assert.equal(await chart().locator('.chart-extrema').count(),0,'Portfolio high/low hide while inspecting');
    const highDotY=await chart().locator('.recharts-reference-dot circle').evaluate(dot=>{const box=dot.getBoundingClientRect();return box.top+box.height/2});
    assert.ok(Math.abs(guideY.high-highDotY)<=2,`high guide differs from plotted high by ${guideY.high-highDotY}px`);
    await capture('fidelity-portfolio-hover-positive');
    await inspect(0);
    await page.waitForFunction(()=>document.querySelector('.portfolio-chart .chart-value')?.textContent?.includes('₱10,000.00'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const lowDotY=await chart().locator('.recharts-reference-dot circle').evaluate(dot=>{const box=dot.getBoundingClientRect();return box.top+box.height/2});
    assert.ok(Math.abs(guideY.low-lowDotY)<=2,`low guide differs from plotted low by ${guideY.low-lowDotY}px`);
    await inspect(.9);assert.match(await chart().locator('.chart-value').innerText(),/₱14,000\.00/);
    assert.equal(await chart().locator('.chart-gain').getAttribute('data-gain'),'negative');
    assert.match(await chart().locator('.chart-gain').innerText(),/−₱1,000\.00/);
    await capture('fidelity-portfolio-hover-negative');
    await page.mouse.move(220,55);
    assert.equal(await chart().locator('.chart-selected-date[data-selected="true"]').count(),0,'hover exit restores current headline');
    assert.match(await chart().locator('.chart-value').innerText(),/₱15,000\.00/);
    assertStable(portfolioIdleLayout,await layout(),'Portfolio desktop hover exit');
    for(const width of [1280,1024]) {
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(120);
      const before=await layout();await inspect(.7);assertStable(before,await layout(),`Portfolio ${width} inspection`);
      await page.mouse.move(220,55);assertStable(before,await layout(),`Portfolio ${width} exit`);
    }
    await page.setViewportSize({width:1440,height:900});
    await chart().getByRole('button',{name:'All portfolio history'}).click();
    assert.equal(await chart().locator('.chart-plot .chart-extrema .chart-extreme-high').count(),1);
    assert.equal(await chart().locator('.chart-plot .chart-extrema .chart-extreme-low').count(),1);
    assert.doesNotMatch(await chart().locator('.chart-extrema').innerText(),/High|Low/);
    const selectedPill=await chart().locator('.chart-range button[aria-pressed="true"]').boundingBox();
    const chartWidth=(await chart().boundingBox()).width;
    assert.ok(selectedPill.width<chartWidth/10,'desktop selected range pill hugs its label');
    await capture('fidelity-portfolio-all-guides');
    await chart().getByRole('button',{name:'5Y portfolio history'}).click();await capture('fidelity-portfolio-5y');
    await chart().getByRole('button',{name:'All portfolio history'}).click();
    await chart().getByRole('button',{name:'Switch portfolio display to USD'}).click();
    assert.equal(await chart().getAttribute('data-currency'),'USD');
    assert.match(await chart().innerText(),/USD history from/);
    assert.match(await chart().locator('.chart-value').innerText(),/US\$300\.00/);
    assert.match(await chart().locator('.chart-gain').innerText(),/\+₱1,000\.00/);
    assert.match(await chart().locator('.chart-gain').innerText(),/PHP gain/);
    await capture('fidelity-portfolio-usd');
    await chart().getByRole('button',{name:'Switch portfolio display to PHP'}).click();
    await chart().getByRole('button',{name:'1M portfolio history'}).click();
    await chart().getByRole('button',{name:'1W portfolio history'}).click();
    assert.equal(await chart().getAttribute('data-gain'),'positive');
    assert.match(await chart().locator('.chart-gain').innerText(),/\+₱1,000\.00/);
    await capture('fidelity-falling-range-positive-gain');
    assert.equal(await chart().getByRole('button',{name:'1D portfolio history'}).count(),0);
    await chart().getByRole('button',{name:'All portfolio history'}).click();
    await inspect(0); assert.match(await chart().locator('.chart-value').innerText(),/₱9,000\.00/);
    await chart().getByText('Gain/loss unavailable').waitFor(); await capture('fidelity-portfolio-old-unknown-cost');
    await chart().locator('.chart-plot').focus(); await chart().locator('.chart-plot').press('ArrowRight');
    await chart().locator('.chart-selected-date[data-selected="true"]').waitFor(); await chart().locator('.chart-plot').press('Escape');
    assert.equal(await chart().locator('.chart-selected-date[data-selected="true"]').count(),0,'Escape dismisses keyboard inspection');
    await chart().getByRole('button',{name:'1M portfolio history'}).click();
    for(const width of [768,430,390,360,320]) {
      await shot(`portfolio-range-${width}`,width);
      await page.waitForTimeout(120);
      const mobileIdle=await layout();
      const rangeTops=await chart().locator('.chart-range button').evaluateAll(buttons=>buttons.map(button=>Math.round(button.getBoundingClientRect().top)));
      assert.equal(new Set(rangeTops).size,1,`all seven ranges occupy one row at ${width}`);
      if(width===390) await capture('fidelity-portfolio-mobile-idle');
      if(width===320) await capture('fidelity-portfolio-ranges-320');
      await inspect(.7,'touch'); await capture(`fidelity-portfolio-touch-${width}`);
      assert.equal(await chart().locator('.chart-selected-date[data-selected="true"]').count(),1,'touch selection persists after release');
      assertStable(mobileIdle,await layout(),`Portfolio ${width} touch inspection`);
      assert.equal(await chart().locator('.chart-extrema').count(),0);
      const scroll=await page.evaluate(()=>{window.scrollTo(0,200);return scrollY});
      assert.ok(scroll>0,`normal vertical scrolling at ${width}`);
      await page.evaluate(()=>window.scrollTo(0,0));
    }
    await page.setViewportSize({width:390,height:900});
    await page.getByRole('heading',{name:'Holdings'}).click();
    const tapBox=await chart().locator('.chart-plot').boundingBox();
    const tapX=tapBox.x+tapBox.width*.7,tapY=tapBox.y+tapBox.height/2;
    await chart().locator('.chart-plot').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:9,clientX:tapX,clientY:tapY,bubbles:true});
    await chart().locator('.chart-plot').dispatchEvent('pointerup',{pointerType:'touch',pointerId:9,clientX:tapX,clientY:tapY,bubbles:true});
    await chart().locator('.chart-selected-date[data-selected="true"]').waitFor();
    await page.getByRole('heading',{name:'Holdings'}).click();
    const dragBox=await chart().locator('.chart-plot').boundingBox();
    const startX=dragBox.x+8+(dragBox.width-16)*.7, endX=dragBox.x+8+(dragBox.width-16)*.4;
    const dragY=dragBox.y+dragBox.height/2;
    const touchEvent=(type,x)=>chart().locator('.chart-plot').dispatchEvent(type,{pointerType:'touch',pointerId:8,clientX:x,clientY:dragY,bubbles:true});
    await touchEvent('pointerdown',startX);await page.waitForTimeout(420);
    await touchEvent('pointermove',endX);await touchEvent('pointerup',endX);
    await chart().locator('.chart-gain[data-gain="zero"]').waitFor();
    await capture('fidelity-portfolio-touch-drag-zero-gain');
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y:dragY}]});
    await page.waitForTimeout(430);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:endX,y:dragY}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await chart().locator('.chart-gain[data-gain="zero"]').waitFor();
    await capture('fidelity-portfolio-native-touch-drag-zero-gain');
    await page.evaluate(()=>window.scrollTo(0,0));
    const scrollBox=await chart().locator('.chart-plot').boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:scrollBox.x+20,y:scrollBox.y+100}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:scrollBox.x+20,y:scrollBox.y+20}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>scrollY)>0,'native vertical touch gesture still scrolls the page');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.getByRole('heading',{name:'Holdings'}).click();
    assert.equal(await chart().locator('.chart-selected-date[data-selected="true"]').count(),0,'outside tap dismisses touch selection');
    await inspect(.7,'touch');await chart().getByRole('button',{name:'1W portfolio history'}).click();
    assert.equal(await chart().locator('.chart-selected-date[data-selected="true"]').count(),0,'range change dismisses touch selection');
    await page.evaluate(()=>{location.hash='home';});
    await page.setViewportSize({width:390,height:900});
    await capture('fidelity-home-mobile-idle');
    const homeMobileIdle=await layout();
    await inspect(.7,'touch');assertStable(homeMobileIdle,await layout(),'Home mobile touch inspection');
    assert.equal(await chart().locator('.chart-extrema').count(),0);
    await capture('fidelity-home-mobile-touch');
    for(const width of [1024,768,390]) {
      await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:'dark'});
      await inspect(.7,'touch');await capture(`fidelity-home-dark-touch-${width}`);
    }
    await page.evaluate(()=>{location.hash='portfolio';}); await page.setViewportSize({width:390,height:900});
    await chart().getByRole('button',{name:'1M portfolio history'}).click();
    await capture('fidelity-dark-positive-idle');
    await inspect(.7,'touch');await capture('fidelity-dark-historical-selection');
    historyCurrent={value:'15000.00',cost:'16000.00',gain:'-1000.00',percentage:'-6.25'};
    historyFixture=[...historyFixture.slice(0,-1),observed(0,'15000.00','16000.00','-1000.00','-6.25')];
    await page.reload();await chart().waitFor();
    assert.equal(await chart().getAttribute('data-gain'),'negative');await capture('fidelity-dark-negative');
    await page.emulateMedia({colorScheme:'light'});await capture('fidelity-portfolio-idle-negative');
    await page.setViewportSize({width:1440,height:900});await capture('fidelity-portfolio-idle-negative-desktop');
    await page.setViewportSize({width:390,height:900});
    historyCurrent={value:'15000.00',cost:'15000.00',gain:'0.00',percentage:'0.00'};
    historyFixture=[observed(5,'10000.00','10000.00','0.00','0.00'),observed(0,'15000.00','15000.00','0.00','0.00')];
    await page.reload();await chart().waitFor();
    assert.equal(await chart().getAttribute('data-gain'),'zero');
    assert.match(await chart().locator('.chart-gain').innerText(),/₱0\.00/);
    await capture('fidelity-portfolio-neutral-contribution');
    if (reconstructionOnly) {
      // The SQL fixture proves the immutable stale snapshot remains in storage.
      // This API fixture proves the browser renders only the corrected canonical series.
      const reconstructed=(day,value,usd,cost,gain,pct)=>({day,value_php:value,value_usd:usd,
        captured_at:null,origin:'reconstructed',segment:0,earliest_recorded_date:'2026-08-18',
        cost_complete:true,cost_context_captured:false,
        recorded_cost_php:cost,recorded_gain_php:gain,recorded_gain_percentage:pct,
        source_dates:[{price_key:'usd_php',source:'bsp',observation_date:day,
          observed_at:`${day}T00:00:00Z`,fetched_at:now,rate:'50',
          provenance:'https://www.bsp.gov.ph/statistics/external/day99_data.aspx',valuation_date:day}]});
      historyCurrent={value:'15000.00',cost:'14000.00',gain:'1000.00',percentage:'7.14'};
      historyFixture=[reconstructed('2026-08-18','10000.00','200.00','10000.00','0.00','0.00'),
        reconstructed('2026-08-25','11000.00','220.00','10000.00','1000.00','10.00')];
      await page.reload();await chart().waitFor();
      await chart().getByRole('button',{name:'All portfolio history'}).click();
      await inspect(0);
      assert.match(await chart().locator('.chart-value').innerText(),/₱10,000\.00/);
      assert.match(await chart().locator('.chart-selected-date').innerText(),/Aug 18, 2026/);
      assert.match(await chart().locator('.chart-gain').innerText(),/₱0\.00/);
      assert.doesNotMatch(await chart().innerText(),/99,999/);
      await capture('corrected-all-php');
      await chart().getByRole('button',{name:'Switch portfolio display to USD'}).click();
      await inspect(0);
      assert.match(await chart().locator('.chart-value').innerText(),/US\$200\.00/);
      await capture('corrected-all-usd');
      historyFixture=[historyFixture[1]];
      await page.reload();await chart().waitFor();
      await chart().getByRole('button',{name:'All portfolio history'}).click();
      await chart().getByText('Complete history begins Aug 25, 2026. Earlier values are unavailable.').waitFor();
      await capture('incomplete-earlier-coverage');
    }
    assert.equal(pageErrors,0,'browser page errors');assert.equal(consoleErrors,0,'browser console errors');assert.equal(blockedExternal,0,'unhandled external requests');
    console.log(JSON.stringify({fixtureOnly:true,screenshots:shots,pageErrors,consoleErrors,blockedExternal}));
  } else if (homeLayoutOnly) {
    const readings = [];
    await page.getByRole('region', { name: 'Portfolio value graph' }).waitFor();
    await page.getByRole('heading', { name: 'Where you could be headed' }).waitFor();
    for (const width of [1440, 1280, 1024, 999, 960, 900, 820, 768, 430, 390, 320]) {
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
      assert.equal(reading.pending, null, `${width}: pending recording belongs on Monthly, not Home`);
      if (width >= 1000) {
        assert.ok(Math.abs(reading.portfolio.top - reading.utility.top) <= 2, `${width}: Portfolio and utility stack should share the first row`);
        assert.ok(Math.abs(reading.portfolio.bottom - reading.utility.bottom) <= 2, `${width}: Portfolio and utility stack should share the bottom edge`);
        assert.ok(Math.abs(reading.portfolio.bottom - reading.monthly.bottom) <= 2, `${width}: Monthly card should finish the first row`);
        assert.ok(Math.abs(reading.projection.top - reading.plan.top) <= 2, `${width}: Projection and plan should share the second row`);
        assert.ok(Math.abs(reading.projection.bottom - reading.plan.bottom) <= 2, `${width}: paired Projection and plan cards should match height`);
        assert.ok(reading.activity.top >= Math.max(reading.projection.bottom, reading.plan.bottom), `${width}: Recent activity should follow the second row`);
      } else {
        const sequence = [reading.portfolio, reading.goal, reading.monthly, reading.pending, reading.projection, reading.plan, reading.activity].filter(Boolean);
        assert.ok(sequence.every((section, index) => index === 0 || section.top >= sequence[index - 1].top), `${width}: Home sections should follow reading order`);
      }
      readings.push(reading);
    }
    for (const width of [1024, 768, 390]) await shot(`home-dark-${width}`, width, 'dark');
    await page.evaluate(() => { location.hash = 'home/monthly'; });
    await page.getByRole('heading', { name: 'Finish recording your investment' }).waitFor();
    for (const action of ['Record investment', 'Not yet', 'I didn’t invest', 'I already recorded this'])
      assert.ok(await page.getByRole('button', { name: action, exact: true }).count(), `Monthly pending action: ${action}`);
    for (const width of [1440, 1280, 1024, 960, 900, 820, 768, 430, 390, 320]) await shot(`monthly-pending-${width}`, width);
    for (const width of [1024, 768, 390]) await shot(`monthly-pending-dark-${width}`, width, 'dark');
    await page.getByRole('button', { name: 'Review contribution' }).click();
    await page.getByRole('region', { name: 'Monthly investment breakdown' }).waitFor();
    for (const width of [768, 390, 320]) await scrolledViewportShot(`monthly-bottom-${width}`, width);
    await page.getByRole('button', { name: 'Record investment', exact: true }).click();
    await page.getByLabel('Investment date', { exact: true }).fill(today);
    await page.getByLabel('Shares received').fill('0.5');
    await page.getByLabel('Actual amount paid (PHP)').fill('100.00');
    for (const width of [390, 360, 320]) await scrolledViewportShot(`record-form-bottom-${width}`, width);
    await page.getByRole('button', { name: 'Review investment' }).click();
    await page.getByRole('button', { name: 'Confirm and save' }).waitFor();
    assert.equal(entries.length, 0, 'recording Review does not write');
    for (const width of [390, 360, 320]) await scrolledViewportShot(`record-confirm-bottom-${width}`, width);
    await page.getByRole('button', { name: 'Close' }).click();
    entitlementMode = 'free';
    await page.reload();
    await page.getByRole('heading', { name: 'Finish recording your investment' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Finish recording your investment' }).count(), 1, 'Free sees one factual pending surface');
    assert.ok(await page.getByRole('button', { name: 'Record investment', exact: true }).count(), 'Free can resume factual recording');
    assert.ok(await page.getByRole('link', { name: 'Explore Arbor Plus' }).count(), 'Plus monthly calculator remains locked');
    await page.evaluate(() => { location.hash = 'home'; });
    const freeMonthlyLink = page.getByRole('link', { name: 'Explore Arbor Plus monthly plan' });
    await freeMonthlyLink.waitFor();
    await freeMonthlyLink.click();
    await page.getByRole('heading', { name: 'Finish recording your investment' }).waitFor();
    entitlementMode = 'plus'; marketScreenshot = true;
    await page.evaluate(() => { location.hash = 'portfolio'; });
    await page.reload();
    await page.getByRole('button', { name: 'View VGT' }).waitFor();
    await shot('portfolio-vt-vgt-1440', 1440);
    for (const symbol of ['VT', 'VGT']) {
      const row = page.getByRole('button', { name: `View ${symbol}` });
      const rowShot = `${output}/portfolio-${symbol.toLowerCase()}-price.png`;
      await row.screenshot({ path: rowShot, animations: 'disabled' }); shots.push(rowShot);
      await row.click();
      await shot(`${symbol.toLowerCase()}-holding-detail`, 390);
      if (symbol === 'VT') for (const width of [390, 320]) await scrolledViewportShot(`vt-detail-activity-bottom-${width}`, width);
      await page.getByRole('button', { name: 'Close' }).click();
    }
    await page.evaluate(() => { location.hash = 'ask'; });
    await page.getByRole('heading', { name: 'Ask Arbor' }).waitFor();
    await page.getByText('About your Arbor answers').click();
    await page.getByText('Arbor Plus · Portfolio-aware explanations').waitFor();
    await shot('ask-plus-390', 390);
    await page.evaluate(() => { location.hash = 'settings/plus'; });
    await page.getByText('Arbor Plus Trial').first().waitFor();
    await shot('settings-plus-trial-390', 390);
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
  assert.equal(await page.locator('.home-utility-stack .pending-recording').count(), 0, 'Home never shows pending recording');
  await shot('home-with-pending-elsewhere', 390);
  await page.evaluate(() => { location.hash = 'home/monthly'; });
  await page.getByRole('heading', { name: 'Finish recording your investment' }).waitFor();
  await shot('monthly-one-unfinished', 390);
  pending.push({ id: '00000000-0000-4000-8000-000000000202', product_id: 'pdax_btc', provider: 'pdax', source: 'monthly', status: 'pending', started_at: now, resolved_at: null });
  await page.evaluate(() => window.dispatchEvent(new Event('arbor-pending-changed')));
  await page.locator('.pending-recording li').nth(1).waitFor();
  await shot('monthly-several-unfinished', 1440);
  await shot('monthly-return-cue-expanded', 390);
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
  await page.getByRole('button', { name: 'View VT' }).getByText('US$100.00 per share').waitFor();
  await page.getByRole('button', { name: 'View Bitcoin' }).getByText('₱2,000,000.00 per BTC').waitFor();
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
  await page.getByText('₱2,000,000.00 per BTC', { exact: true }).waitFor();
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
  for (const [cost, tone, expected] of [['500', 'positive', '+₱2,000.00'], ['2500', 'zero', '₱0.00 · 0%']]) {
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
  await page.getByRole('link', { name: 'Ways to invest' }).click();
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
