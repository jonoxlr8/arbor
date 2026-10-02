// Local screenshot fixture only. All remote requests are fulfilled or blocked.
// Financial results come from frozen backend services, never a live account.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {withAuthenticatedBrowser} from './auth.mjs';
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
const termsDocument=JSON.parse(readFileSync(new URL('../../lib/termsDocument.json',import.meta.url),'utf8'));
const origin=process.env.ARBOR_REVIEW_ORIGIN ?? 'http://127.0.0.1:3145';
const output='/tmp/arbor-ask-current-captures';await mkdir(output,{recursive:true});
let exportRequests=0,exportStatus=200,actionCount=0;
let lifecycle={state:'active',version:0,access_allowed:true,deletion_request:null,in_flight_reminders:0,erasure_available:false};
let signInCount=0;
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
const setup = async context => context.route('**/*',route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;
 if(url.origin===origin)return route.continue();
 // No request reaches a remote origin, including test auth/API endpoints.
 const json=body=>route.fulfill({json:body,headers});
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(path.endsWith('/chat')) {
  const {message}=request.postDataJSON();
  const answer=execFileSync('./.venv/bin/python',['-c',"import sys,json; from app.services.arbor.instrument_education import instrument_question,explain_instruments; q=sys.argv[1]; print(json.dumps({'reply':explain_instruments(instrument_question(q))}))",message],{cwd:'../backend',encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_KEY:'synthetic-local-only',OPENAI_API_KEY:'synthetic-local-only'}});
  return json(JSON.parse(answer));
 }
 if(path.endsWith('/auth/v1/token')){signInCount++;return json(session);}
 if(path.endsWith('/auth/v1/logout'))return json({});
 if(path.endsWith('/account/lifecycle/login')){if(lifecycle.state==='deactivated')lifecycle={...lifecycle,state:'active',access_allowed:true,version:lifecycle.version+1};return json(lifecycle);}
 if(path.endsWith('/account/lifecycle'))return json(lifecycle);
 if(path.endsWith('/account/deactivate')){actionCount++;lifecycle={...lifecycle,state:'deactivated',access_allowed:false,version:lifecycle.version+1};return json(lifecycle);}
 if(path.endsWith('/account/deletion-requests')){actionCount++;lifecycle={...lifecycle,state:'deletion_pending',access_allowed:false,version:lifecycle.version+1,deletion_request:{id:'synthetic-request',requested_at:now}};return json(lifecycle);}
 if(path.endsWith('/account/deletion-requests/current/withdraw')){actionCount++;lifecycle={...lifecycle,state:'active',access_allowed:true,version:lifecycle.version+1,deletion_request:null};return json(lifecycle);}
 if(path.endsWith('/auth/v1/user'))return json(user);
 if(path.endsWith('/terms/current'))return json(termsDocument);
 if(path.endsWith('/account/terms'))return json({...termsDocument,required:false,accepted_at:now});
 if(path.endsWith('/profiles/me'))return json(plan);
 if(path.endsWith('/account/export')){assert.equal(request.method(),'GET');assert.equal(url.search,'');exportRequests++;return new Promise(resolve=>setTimeout(()=>resolve(route.fulfill({status:exportStatus,json:exportStatus===200?exportFixture:{detail:'Synthetic failure'},headers})),400));}
 if(path.endsWith('/account/entitlements'))return json({tier:'plus',status:'trial',effective_tier:'plus',private_beta:true,features:['live_portfolio','monthly_contribution_planner','monthly_checkin','future_projection','plan_alignment','ask_arbor_full'],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:true,monthly_checkin:true}});
 if(path.endsWith('/v2/next-action'))return json({key:'review_monthly_contribution',title:'Review your contribution',explanation:'Local fixture',button_label:'Review',blocking:false,destination:'plan'});
 if(path.endsWith('/v2/future-projection'))return json(canonical.projection);
 if(path.endsWith('/v2/monthly-plan'))return json(canonical.monthly);
 if(path.endsWith('/v2/monthly-checkin'))return json({month:nowKey,current:null,history:[]});
 if(path.endsWith('/v2/pending-recordings'))return json({items:[]});
 if(path.endsWith('/v2/portfolio'))return json(portfolio);
 if(path.endsWith('/v2/portfolio/snapshot'))return json({recorded:false,history:historyFixture});
 if(path.endsWith('/v2/portfolio/entries'))return json({entries:[{id:'00000000-0000-4000-8000-000000000301',holding_id:portfolio.holdings[0].id,product_id:'gotrade_vt',provider:'gotrade',investment_date:observedDay(12),units:'0.8',amount_paid_php:'8000.00',recorded_at:now,updated_at:now,revision:1,voided_at:null}],page:0,has_more:false});
 blockedExternal++;return route.abort();
});

await withAuthenticatedBrowser(async ({page}) => {
 page.on('pageerror',()=>pageErrors++);
 page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
 await page.goto(origin+'/#login');
 await page.getByLabel('Email address').fill(user.email);
 await page.getByLabel('Password').fill('fixture-only-password');
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 await page.evaluate(()=>location.hash='ask');
 const input=page.getByRole('textbox',{name:'Your question for Ask Arbor'});
 await input.waitFor();
 await input.fill('Explain ATRAM Global Equity Opportunity Feeder Fund fees');
 await page.getByRole('button',{name:'Send question',exact:true}).click();
 await page.getByText('Annual trust fee:',{exact:false}).waitFor();
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme});
  for(const width of [320,390,768,1024,1440,1920]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
   const source=page.getByRole('link',{name:'ATRAM equity KIIDS',exact:true});
   assert.equal(await source.getAttribute('target'),'_blank');
   assert.equal(await source.getAttribute('rel'),'noopener noreferrer');
   await source.focus();assert.ok(await source.evaluate(el=>el===document.activeElement));
   await page.screenshot({path:output+`/atram-fees-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  }
 }
 await page.getByRole('tab',{name:'Learn',exact:true}).click();
 await page.getByRole('tab',{name:'Chat',exact:true}).click();
 assert.equal(await page.getByRole('link',{name:'ATRAM equity KIIDS',exact:true}).count(),1);
 await input.fill('Explain GCrypto BTC fees');
 await page.getByRole('button',{name:'Send question',exact:true}).click();
 await page.getByRole('link',{name:'GCrypto fees',exact:true}).waitFor();
 assert.equal(await page.getByText('GCrypto BTC:',{exact:false}).count(),1);
 await page.screenshot({path:output+'/bitcoin-fees-mobile-dark.png',fullPage:true,animations:'disabled'});
 assert.equal(actionCount,0);assert.equal(exportRequests,0);assert.equal(signInCount,1);
 assert.equal(pageErrors,0);assert.equal(consoleErrors,0);assert.equal(blockedExternal,0);
 console.log(JSON.stringify({syntheticOnly:true,actualProductionBuild:true,widths:[320,390,768,1024,1440,1920],themes:['light','dark'],captures:13,sourceLinks:true,keyboard:true,conversationSurvivesLearn:true,pageErrors,consoleErrors,blockedExternal,hostedWrites:0}));
},{syntheticFixture:{baseURL:origin,setup}});
