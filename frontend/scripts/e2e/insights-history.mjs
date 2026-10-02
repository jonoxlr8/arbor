// Local screenshot fixture only. All remote requests are fulfilled or blocked.
// Financial results come from frozen backend services, never a live account.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {withAuthenticatedBrowser} from './auth.mjs';
import {mkdir,readFile} from 'node:fs/promises';
const origin=process.env.ARBOR_REVIEW_ORIGIN ?? 'http://127.0.0.1:3132';
const output=process.env.ARBOR_REVIEW_CAPTURES ?? '/tmp/arbor-insights-current-captures';await mkdir(output,{recursive:true});
let exportStatus=200;const termsDoc=JSON.parse(await readFile(new URL('../../lib/termsDocument.json',import.meta.url),'utf8'));let budgetMode='normal',alignmentMode='normal';

const exportFixture={schema_version:'1',complete:true,source_availability:{ask_usage:'table_absent'},account:{id:'00000000-0000-4000-8000-000000000001'},profile:[],legacy_holdings:[],portfolio_holdings:[],investment_entries:[],snapshots:[],history_changes:[],monthly_checkins:[],ask_usage:[],pending_recordings:[],reminder_metadata:[],export_operational_metadata:[{cooldown_until:new Date(Date.now()+60000).toISOString()}]};
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const PYTHON_FIXTURE="import json\nfrom decimal import Decimal\nfrom datetime import date\nfrom app.schemas.profile_v2 import ProfileV2Create\nfrom app.services.profile_v2 import profile_v2_row, restore_profile_v2\nfrom app.services.monthly_plan import calculate_monthly_plan\nfrom app.services.contributions.models import CurrentPortfolio\nfrom app.services.future_projection_v2 import future_value\nfrom app.services.strategy_v2 import StrategyType\nprofile=ProfileV2Create(strategy_engine_version='2.0',full_name='Maya',country='Philippines',currency='PHP',emergency_savings='three_to_six_months',high_interest_debt='none',goal_target=3000000,goal_name='A place of my own',goal_date='2036-09-30',current_portfolio_value=0,monthly_investment=15000,horizon='ten_plus_years',risk_response='hold',selected_approach='Aggressive',explicit_customization={'technology_tilt':10,'bitcoin':10},implementation_choices={'global_equity':'gotrade_vt','technology_tilt':'gotrade_vgt','crypto':'pdax_btc'})\nsaved=restore_profile_v2(profile_v2_row(profile,'00000000-0000-4000-8000-000000000001'))\ncurrent=CurrentPortfolio(currency='PHP',global_equity=124800,defensive=0,technology_tilt=0,crypto=0,owned_product_ids=frozenset(['gotrade_vt']))\nmonthly=calculate_monthly_plan(saved,current,Decimal(15000))\nassert sum(row.amount for row in monthly.rows)==15000\nprojection=future_value(Decimal(124800),Decimal(15000),StrategyType.AGGRESSIVE,date(2026,9,30),date(2036,9,30),Decimal(3000000))\nprint(json.dumps({'saved':saved,'monthly':monthly.model_dump(mode='json'),'projection':projection},default=str))\n";
const canonical=JSON.parse(execFileSync('./.venv/bin/python',['-c',PYTHON_FIXTURE],{cwd:'../backend',env:{...process.env,PYTHONPATH:'.'},encoding:'utf8'}));
const catalog = [
  { product_id: 'gotrade_vt', provider: 'gotrade', provider_name: 'Gotrade', display_name: 'VT', sleeve: 'global_equity', price_kind: 'reference' },
  { product_id: 'pdax_btc', provider: 'pdax', provider_name: 'PDAX', display_name: 'Bitcoin', sleeve: 'crypto', price_kind: 'reference' },
  { product_id: 'gcash_global_equity', provider: 'gcash', provider_name: 'GFunds', display_name: 'ATRAM Global Equity Opportunity Feeder Fund', sleeve: 'global_equity', price_kind: 'nav' },
  { product_id: 'gotrade_vgt', provider: 'gotrade', provider_name: 'Gotrade', display_name: 'VGT', sleeve: 'technology_tilt', price_kind: 'reference' },
];
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'phase2b@example.test', created_at: '2026-09-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })}.fixture-only`;
const session = { access_token: token, refresh_token: 'fixture-only', expires_in: 3600, token_type: 'bearer', user };
const now = new Date().toISOString();
const observedDay = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0,10);
const observed = (offset,value,cost,gain,pct) => ({day:observedDay(offset),value_php:value,
  value_usd:offset===50?null:(Number(value)/50).toFixed(2),captured_at:`${observedDay(offset)}T12:00:00Z`,
  recorded_cost_php:cost,recorded_gain_php:gain,recorded_gain_percentage:pct,
  cost_complete:cost !== null,cost_context_captured:offset !== 50});
const weights=canonical.saved.plan.final_allocation;
const plan=canonical.saved;
const nowKey=new Date().toISOString().slice(0,7);
const historyFixture=[[35,111600,108000],[27,113200,108000],[24,112600,108000],[20,114800,108000],[16,115900,108000],[12,124500,116000],[9,122700,116000],[6,123800,116000],[3,124100,116000],[0,124800,116000]].map(([offset,value,cost])=>({...observed(offset,value.toFixed(2),cost.toFixed(2),(value-cost).toFixed(2),null),origin:'reconstructed',captured_at:null,cost_context_captured:false,value_usd:(value/56).toFixed(2)}));
const portfolio={currency:'PHP',catalog:catalog,history:historyFixture,holdings:[{...catalog[0],id:'00000000-0000-4000-8000-000000000101',units:'12',unit_price:'185.7142857142857',unit_price_currency:'USD',value_php:'124800.00',opening_units:'11.2',opening_cost_php:'108000.00',cost_basis_php:'116000.00',has_entries:true,valuation_source:'market_reference',freshness:'fresh',as_of:now,updated_at:now,created_at:now,recorded_gain_php:'8800.00',recorded_gain_percentage:'7.59'}],known_value_php:'124800.00',total_value_php:'124800.00',total_value_usd:(124800/56).toFixed(2),recorded_cost_php:'116000.00',recorded_gain_php:'8800.00',recorded_gain_percentage:'7.59',complete:true,unavailable_count:0,stale_count:0,provider_values_php:{gotrade:'124800.00'},valued_at:now,data_sources:['marketstack','bsp'],sleeves:weights.map(w=>({sleeve:w.role,known_value_php:w.role==='global_equity'?'124800.00':'0.00',current_percentage:w.role==='global_equity'?'100.00':'0.00',target_percentage:w.percentage_points,difference_pp:((w.role==='global_equity'?100:0)-w.percentage_points).toFixed(2)}))};
assert.equal(portfolio.holdings.reduce((sum,h)=>sum+Number(h.value_php),0),Number(portfolio.total_value_php));
assert.equal(Number(portfolio.total_value_php)/Number(plan.profile.goal_target)*100,4.16);
assert.equal(canonical.monthly.rows.reduce((sum,row)=>sum+Number(row.amount),0),15000);
let pageErrors=0,consoleErrors=0,blockedExternal=0;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};

let reviewStatus=200,reviewMode='normal',free=false;
const baseRow={holding_id:'review-holding',product_id:'gotrade_vt',provider:'gotrade',units:'1',recorded_at:now,updated_at:now,revision:1,voided_at:null};
const reviewRows=[{...baseRow,id:'one',investment_date:'2026-09-12',amount_paid_php:'1000.00'},{...baseRow,id:'two',investment_date:'2026-09-23',amount_paid_php:'2000.00'},{...baseRow,id:'unknown',investment_date:'2026-07-12',amount_paid_php:null},{...baseRow,id:'zero',investment_date:'2026-06-12',amount_paid_php:'0.00'}];
const reviewPython="import json\nfrom datetime import datetime,timezone\nfrom app.services.monthly_review import monthly_review\nrows="+JSON.stringify(JSON.stringify(reviewRows))+"\nrows=json.loads(rows)\nclass Store:\n def budget_versions(self): return [{'month':'2026-09-01','amount_php':'5000.00'}]\n def review_activity(self,a,b): return [r for r in rows if a<=r['investment_date']<b]\nprint(json.dumps({m:monthly_review(Store(),m,datetime(2026,10,1,tzinfo=timezone.utc)) for m in ['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']}))";
const reviewFixtures=JSON.parse(execFileSync('./.venv/bin/python',['-c',reviewPython],{cwd:'../backend',env:{...process.env,PYTHONPATH:'.'},encoding:'utf8'}));
const setup = async context => context.route('**/*',route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;
 if(url.origin===origin)return route.continue();
 // No request reaches a remote origin, including test auth/API endpoints.
 const json=body=>route.fulfill({json:body,headers});
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(path.endsWith('/account/terms'))return json({...termsDoc,required:false,accepted_at:'2026-09-01T00:00:00Z'});
 if(path.endsWith('/account/lifecycle')||path.endsWith('/account/lifecycle/login'))return json({state:'active',version:0,access_allowed:true,deletion_request:null,in_flight_reminders:0,erasure_available:false});
 if(path.endsWith('/terms/current'))return json({...termsDoc,enforcement_enabled:true,published_at:now,effective_at:now});
 if(path.endsWith('/v2/portfolio/alignment-history'))return json(alignmentMode==='normal'?alignmentFixture:{status:'unavailable',message:'Last month’s comparison is unavailable.',detail:'A recorded allocation and the plan valid at each observation are needed. Today’s plan is never applied to older records.',current:null,previous:null,drivers:[]});
 if(path.endsWith('/auth/v1/token')){return json(session);}
 if(path.endsWith('/auth/v1/logout'))return json({});
 if(path.endsWith('/auth/v1/user'))return json(user);
 if(path.endsWith('/v2/portfolio/monthly-review')){if(reviewStatus!==200)return route.fulfill({status:reviewStatus,json:{detail:'Synthetic unavailable'},headers});const r=structuredClone(reviewFixtures[url.searchParams.get('month')??'2026-09']);if(reviewMode==='missing'){r.amount_php=null;r.missing_amount_count=r.record_count;r.breakdown.forEach(x=>{x.amount_php=null;x.missing_amount_count=x.record_count;});r.pattern.forEach(x=>{x.amount_php=null;x.missing_amount_count=x.record_count;});}if(budgetMode==='reached')r.budget={status:'reached',target_php:'2000.00',remaining_php:'0.00',progress_pct:'100.00'};if(budgetMode==='zero')r.budget={status:'reached',target_php:'0.00',remaining_php:'0.00',progress_pct:'100.00'};if(budgetMode==='unset')r.budget={status:'unset',target_php:null,remaining_php:null,progress_pct:null};return json(r);}
 if(path.endsWith('/profiles/me'))return json(plan);
 if(path.endsWith('/account/export')){assert.equal(request.method(),'GET');assert.equal(url.search,'');return new Promise(resolve=>setTimeout(()=>resolve(route.fulfill({status:exportStatus,json:exportStatus===200?exportFixture:{detail:'Synthetic failure'},headers})),400));}
 if(path.endsWith('/account/entitlements'))return json({tier:'plus',status:'trial',effective_tier:'plus',private_beta:true,features:free?['live_portfolio']:['live_portfolio','monthly_contribution_planner','monthly_checkin','future_projection','plan_alignment','ask_arbor_full'],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:true,monthly_checkin:true}});
 if(path.endsWith('/v2/next-action'))return json({key:'review_monthly_contribution',title:'Review your contribution',explanation:'Local fixture',button_label:'Review',blocking:false,destination:'plan'});
 if(path.endsWith('/v2/future-projection'))return json(canonical.projection);
 if(path.endsWith('/v2/monthly-plan'))return json(canonical.monthly);
 if(path.endsWith('/v2/monthly-checkin'))return json({month:nowKey,current:null,history:[]});
 if(path.endsWith('/v2/pending-recordings'))return json({items:[]});
 if(path.endsWith('/v2/portfolio'))return json(portfolio);
 if(path.endsWith('/v2/portfolio/snapshot'))return json({recorded:false,history:historyFixture});
 if(path.endsWith('/v2/portfolio/entries')){const rows=reviewRows.filter(r=>(!url.searchParams.get('month')||r.investment_date.startsWith(url.searchParams.get('month')))&&(!url.searchParams.get('holding_id')||r.holding_id===url.searchParams.get('holding_id')));const page=Number(url.searchParams.get('page')??0);return json({entries:rows.slice(page*20,page*20+20),page,has_more:rows.length>(page+1)*20});}
 blockedExternal++;return route.abort();
});


portfolio.display_fx={rate:'56',source:'exchangerate_api',as_of:now,valued_at:now,valuation_date:observedDay(0)};
for(const point of historyFixture){
 point.source_dates=[{price_key:'usd_php',source:'bsp',observation_date:point.day,valuation_date:point.day,rate:'56'}];
}
const last=historyFixture.at(-1);
Object.assign(last,{origin:'observed',captured_at:last.day+'T12:00:00Z',cost_context_captured:true,value_usd:'2496.00',display_fx:{rate:'50',source:'captured_snapshot',valuation_date:last.day,captured_at:last.day+'T12:00:00Z',as_of:null}});

const alignmentPython=PYTHON_FIXTURE.slice(0,PYTHON_FIXTURE.indexOf("print(json.dumps"))+"from app.services.insights_history import alignment_over_time\nfrom datetime import datetime,timezone\nrows=[{'captured_at':'2026-09-30T15:00:00Z','value_php':'100','allocation_values':[{'product_id':'gotrade_vt','value_php':'100'}]},{'captured_at':'2026-10-01T16:00:00Z','value_php':'100','allocation_values':[{'product_id':'gotrade_vt','value_php':'80'},{'product_id':'gotrade_vgt','value_php':'10'},{'product_id':'pdax_btc','value_php':'10'}]}]\nversions=[{'id':1,'valid_from':'2026-09-01T00:00:00Z','profile_data':profile_v2_row(profile,'fixture')}]\nprint(json.dumps(alignment_over_time(rows,versions,datetime(2026,10,2,tzinfo=timezone.utc))))";
const alignmentFixture=JSON.parse(execFileSync('./.venv/bin/python',['-c',alignmentPython],{cwd:'../backend',encoding:'utf8',env:{...process.env,PYTHONPATH:'.'}}));
assert.equal(alignmentFixture.status,'closer');
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>pageErrors++);page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
 await page.setViewportSize({width:1440,height:1100});await page.goto(origin+'/#login');await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();await page.evaluate(()=>location.hash='portfolio/insights');
 const review=page.getByRole('region',{name:'Your monthly review'}),alignment=page.getByRole('region',{name:'Plan alignment over time'});
 await review.getByText('₱2,000.00 left to reach your target',{exact:true}).waitFor();await alignment.getByText('Closer to your plan than last month.',{exact:true}).waitFor();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390||width===1440){for(const mode of ['light','dark']){await page.emulateMedia({colorScheme:mode});await review.screenshot({path:output+`/monthly-${width}-${mode}.png`});await alignment.screenshot({path:output+`/alignment-${width}-${mode}.png`});}}}
 await alignment.getByText('How this comparison works',{exact:true}).click();await alignment.getByText(/Global equity gap/).waitFor();await alignment.screenshot({path:output+'/alignment-details.png'});
 async function reload(){await page.reload();await review.locator('.review-total').waitFor();}
 budgetMode='reached';await reload();await review.getByText('Target reached',{exact:true}).waitFor();await review.screenshot({path:output+'/target-reached.png'});
 budgetMode='zero';await reload();await review.getByText('Your target is explicitly set to ₱0.',{exact:true}).waitFor();
 budgetMode='unset';await reload();await review.getByText('Monthly target not set',{exact:true}).waitFor();
 budgetMode='normal';alignmentMode='unavailable';await reload();await alignment.getByText('Last month’s comparison is unavailable.',{exact:true}).waitFor();await alignment.screenshot({path:output+'/alignment-unavailable.png'});
 await review.getByLabel('Review month').selectOption('2026-10');await review.locator('.review-total-label').filter({hasText:'No investment recorded'}).waitFor();await review.getByText('₱5,000.00 left to reach your target',{exact:true}).waitFor();await review.screenshot({path:output+'/no-investment-current.png'});
 await review.getByLabel('Review month').selectOption('2026-07');await review.getByText('PHP amounts not recorded',{exact:true}).waitFor();await review.getByText('Monthly target history unavailable',{exact:true}).waitFor();
 reviewStatus=503;await review.getByLabel('Review month').selectOption('2026-08');await review.getByRole('alert').waitFor();reviewStatus=200;await review.getByRole('button',{name:'Refresh review'}).click();await review.locator('.review-total').waitFor();
 assert.equal(pageErrors,0);assert.equal(blockedExternal,0);assert.equal(consoleErrors,1); // expected controlled 503 request only
 console.log(JSON.stringify({productionBuild:true,syntheticOnly:true,widths:[320,390,768,1440],lightDark:true,remainingReachedZeroUnset:true,missingHistory:true,retry:true,pageErrors,expected503ConsoleErrors:consoleErrors,unexpectedRemoteRequests:blockedExternal,hostedWrites:0,captures:output}));
},{syntheticFixture:{baseURL:origin,setup}});
