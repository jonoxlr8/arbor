// Local screenshot fixture only. All remote requests are fulfilled or blocked.
// Financial results come from frozen backend services, never a live account.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {withAuthenticatedBrowser} from './auth.mjs';
import {mkdir,readFile} from 'node:fs/promises';
const origin=process.env.ARBOR_REVIEW_ORIGIN ?? 'http://127.0.0.1:3134';
const output='/tmp/arbor-eod-captures';await mkdir(output,{recursive:true});
let staleFx=false;const termsDoc=JSON.parse(await readFile(new URL('../../lib/termsDocument.json',import.meta.url),'utf8'));

assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const PYTHON_FIXTURE="import json\nfrom decimal import Decimal\nfrom datetime import date\nfrom app.schemas.profile_v2 import ProfileV2Create\nfrom app.services.profile_v2 import profile_v2_row, restore_profile_v2\nfrom app.services.monthly_plan import calculate_monthly_plan\nfrom app.services.contributions.models import CurrentPortfolio\nfrom app.services.future_projection_v2 import future_value\nfrom app.services.strategy_v2 import StrategyType\nprofile=ProfileV2Create(strategy_engine_version='2.0',full_name='Maya',country='Philippines',currency='PHP',emergency_savings='three_to_six_months',high_interest_debt='none',goal_target=3000000,goal_name='A place of my own',goal_date='2036-09-30',current_portfolio_value=0,monthly_investment=15000,horizon='ten_plus_years',risk_response='hold',selected_approach='Aggressive',explicit_customization={'technology_tilt':10,'bitcoin':10},implementation_choices={'global_equity':'gotrade_vt','technology_tilt':'gotrade_vgt','crypto':'pdax_btc'})\nsaved=restore_profile_v2(profile_v2_row(profile,'00000000-0000-4000-8000-000000000001'))\ncurrent=CurrentPortfolio(currency='PHP',global_equity=124800,defensive=0,technology_tilt=0,crypto=0,owned_product_ids=frozenset(['gotrade_vt']))\nmonthly=calculate_monthly_plan(saved,current,Decimal(15000))\nassert sum(row.amount for row in monthly.rows)==15000\nprojection=future_value(Decimal(124800),Decimal(15000),StrategyType.AGGRESSIVE,date(2026,9,30),date(2036,9,30),Decimal(3000000))\nprint(json.dumps({'saved':saved,'monthly':monthly.model_dump(mode='json'),'projection':projection},default=str))\n";
const canonical=JSON.parse(execFileSync('./.venv/bin/python',['-c',PYTHON_FIXTURE],{cwd:'../backend',env:{...process.env,PYTHONPATH:'.'},encoding:'utf8'}));
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'phase2b@example.test', created_at: '2026-09-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })}.fixture-only`;
const session = { access_token: token, refresh_token: 'fixture-only', expires_in: 3600, token_type: 'bearer', user };
const now = new Date().toISOString();
const plan=canonical.saved;
const valuationPython=PYTHON_FIXTURE.slice(0,PYTHON_FIXTURE.indexOf("current=CurrentPortfolio"))+`from datetime import datetime,timezone
from uuid import UUID
from app.market_data.models import ReferencePrice
from app.services.live_portfolio import Holding,FixtureMarketData,value_portfolio,current_values,catalog
now=datetime(2026,10,2,7,19,18,tzinfo=timezone.utc)
prices=[ReferencePrice(price_key=k,value='100',as_of='2026-09-30T00:00:00Z',fetched_at='2026-10-02T03:25:11Z',source='marketstack',kind='etf_eod',currency='USD') for k in ['gotrade_vt','gotrade_vgt']]
fx=ReferencePrice(price_key='usd_php',value='50',as_of='2026-10-01T00:02:31Z',fetched_at='2026-10-02T03:25:11Z',source='exchangerate_api',kind='fx',currency='PHP')
holdings=[Holding(id=UUID('00000000-0000-4000-8000-00000000010'+str(i)),product_id=k,provider='gotrade',units=1,opening_units=1,cost_basis_php=5000,created_at=now,updated_at=now) for i,k in enumerate(['gotrade_vt','gotrade_vgt'],1)]
fresh=value_portfolio(holdings,FixtureMarketData([*prices,fx]),None,now)
monthly=calculate_monthly_plan(saved,current_values(fresh),Decimal(15000))
old_fx=fx.model_copy(update={'as_of':datetime(2026,9,29,tzinfo=timezone.utc)})
stale=value_portfolio(holdings,FixtureMarketData([*prices,old_fx]),None,now)
assert fresh.complete and fresh.stale_count==0 and stale.stale_count==2
print(json.dumps({'fresh':{**fresh.model_dump(mode='json'),'catalog':catalog()},'stale':{**stale.model_dump(mode='json'),'catalog':catalog()},'monthly':monthly.model_dump(mode='json')},default=str))
`;
const valuations=JSON.parse(execFileSync('./.venv/bin/python',['-c',valuationPython],{cwd:'../backend',env:{...process.env,PYTHONPATH:'.'},encoding:'utf8'}));
const portfolio=valuations.fresh;portfolio.history=[];valuations.stale.history=[];canonical.monthly=valuations.monthly;
assert.equal(Number(portfolio.total_value_php),10000);
assert.equal(portfolio.holdings[0].as_of,'2026-09-30T00:00:00Z');
assert.equal(canonical.monthly.rows.reduce((sum,row)=>sum+Number(row.amount),0),15000);
let pageErrors=0,consoleErrors=0,blockedExternal=0;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};

const setup=async context=>context.route('**/*',route=>{
const req=route.request(),url=new URL(req.url()),path=url.pathname;
if(url.origin===origin)return route.continue();
const json=body=>route.fulfill({json:body,headers});
if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
if(path.endsWith('/auth/v1/token'))return json(session);
if(path.endsWith('/auth/v1/user'))return json(user);
if(path.endsWith('/account/terms'))return json({...termsDoc,required:false,accepted_at:'2026-09-01T00:00:00Z'});
if(path.endsWith('/terms/current'))return json({...termsDoc,enforcement_enabled:true,published_at:now,effective_at:now});
if(path.endsWith('/account/lifecycle')||path.endsWith('/account/lifecycle/login'))return json({state:'active',version:0,access_allowed:true,deletion_request:null,in_flight_reminders:0,erasure_available:false});
if(path.endsWith('/profiles/me'))return json(plan);
if(path.endsWith('/account/entitlements'))return json({tier:'plus',status:'trial',effective_tier:'plus',private_beta:true,features:['live_portfolio','monthly_contribution_planner','monthly_checkin','future_projection','plan_alignment','ask_arbor_full'],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:true,monthly_checkin:true}});
if(path.endsWith('/v2/next-action'))return json({key:'review_monthly_contribution',title:'Review your contribution',explanation:'Local fixture',button_label:'Review',blocking:false,destination:'plan'});
if(path.endsWith('/v2/future-projection'))return json(canonical.projection);
if(path.endsWith('/v2/monthly-checkin'))return json({month:'2026-10',current:null,history:[]});
if(path.endsWith('/v2/portfolio/entries'))return json({entries:[],page:0,has_more:false});
if(path.endsWith('/v2/pending-recordings'))return json({items:[]});
if(path.endsWith('/v2/monthly-plan'))return staleFx?route.fulfill({status:409,json:{detail:'Portfolio values unavailable'},headers}):json(canonical.monthly);
if(path.endsWith('/v2/portfolio'))return json(staleFx?valuations.stale:portfolio);
if(path.endsWith('/v2/portfolio/snapshot'))return json({recorded:false,history:[]});
blockedExternal++;return route.abort();
});
await withAuthenticatedBrowser(async({page})=>{
page.on('pageerror',()=>pageErrors++);page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
await page.goto(origin+'/#login');await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();await page.evaluate(()=>location.hash='portfolio/contribution');
await page.getByRole('heading',{name:'Plan your contribution'}).waitFor();await page.getByRole('button',{name:'Review contribution',exact:true}).click();
const result=page.getByRole('region',{name:'Monthly investment breakdown'});await result.waitFor();assert.equal(await page.getByText(/couldn’t load your investments/).count(),0);
await page.getByText('Calculated from your current values and the gaps to your chosen targets.',{exact:true}).waitFor();
for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390||width===1440){for(const mode of ['light','dark']){await page.emulateMedia({colorScheme:mode});await page.screenshot({path:output+`/monthly-plan-${width}-${mode}.png`,fullPage:true});}}}
staleFx=true;await page.reload();await page.getByRole('heading',{name:'Plan your contribution'}).waitFor();await page.getByRole('button',{name:'Review contribution',exact:true}).click();await page.locator('#monthly-plan-error').waitFor();await page.getByText(/VT, VGT have prices too old for planning/).waitFor();assert.equal(await result.count(),0);await page.locator('#monthly-plan-error').screenshot({path:output+'/stale-fx-blocks-plan.png'});
assert.equal(pageErrors,0);assert.equal(blockedExternal,0);assert.equal(consoleErrors,1);
console.log(JSON.stringify({productionBuild:true,syntheticOnly:true,actualBackendValuationAndMonthlyCalculator:true,rawQuoteDatePreserved:'2026-09-30',widths:[320,390,768,1440],lightDark:true,staleFxBlocksPlan:true,pageErrors,expected409ConsoleErrors:consoleErrors,unexpectedRemoteRequests:blockedExternal,captures:output}));
},{syntheticFixture:{baseURL:origin,setup}});
