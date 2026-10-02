// Local screenshot fixture only. All remote requests are fulfilled or blocked.
// Financial results come from frozen backend services, never a live account.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {withAuthenticatedBrowser} from './auth.mjs';
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
const termsDocument=JSON.parse(readFileSync(new URL('../../lib/termsDocument.json',import.meta.url),'utf8'));
const origin=process.env.ARBOR_REVIEW_ORIGIN ?? 'http://127.0.0.1:3142';
const output='/tmp/arbor-vgt-split-captures';await mkdir(output,{recursive:true});
let exportStatus=200;


const exportFixture={schema_version:'1',complete:true,source_availability:{ask_usage:'table_absent'},account:{id:'00000000-0000-4000-8000-000000000001'},profile:[],legacy_holdings:[],portfolio_holdings:[],investment_entries:[],snapshots:[],history_changes:[],monthly_checkins:[],ask_usage:[],pending_recordings:[],reminder_metadata:[],export_operational_metadata:[{cooldown_until:new Date(Date.now()+60000).toISOString()}]};
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const PYTHON_FIXTURE="import json\nfrom decimal import Decimal\nfrom datetime import date\nfrom app.schemas.profile_v2 import ProfileV2Create\nfrom app.services.profile_v2 import profile_v2_row, restore_profile_v2\nfrom app.services.monthly_plan import calculate_monthly_plan\nfrom app.services.contributions.models import CurrentPortfolio\nfrom app.services.future_projection_v2 import future_value\nfrom app.services.strategy_v2 import StrategyType\nprofile=ProfileV2Create(strategy_engine_version='2.0',full_name='Maya',country='Philippines',currency='PHP',emergency_savings='three_to_six_months',high_interest_debt='none',goal_target=3000000,goal_name='A place of my own',goal_date='2036-09-30',current_portfolio_value=0,monthly_investment=15000,horizon='ten_plus_years',risk_response='hold',selected_approach='Aggressive',explicit_customization={'technology_tilt':10,'bitcoin':10},implementation_choices={'global_equity':'gotrade_vt','technology_tilt':'gotrade_vgt','crypto':'pdax_btc'})\nsaved=restore_profile_v2(profile_v2_row(profile,'00000000-0000-4000-8000-000000000001'))\ncurrent=CurrentPortfolio(currency='PHP',global_equity=124800,defensive=0,technology_tilt=0,crypto=0,owned_product_ids=frozenset(['gotrade_vt']))\nmonthly=calculate_monthly_plan(saved,current,Decimal(15000))\nassert sum(row.amount for row in monthly.rows)==15000\nprojection=future_value(Decimal(124800),Decimal(15000),StrategyType.AGGRESSIVE,date(2026,9,30),date(2036,9,30),Decimal(3000000))\nprint(json.dumps({'saved':saved,'monthly':monthly.model_dump(mode='json'),'projection':projection},default=str))\n";
const canonical=JSON.parse(execFileSync('./.venv/bin/python',['-c',PYTHON_FIXTURE],{cwd:'../backend',env:{...process.env,PYTHONPATH:'.'},encoding:'utf8'}));
const catalog = [
  {product_id:'gotrade_vgt',provider:'gotrade',provider_name:'Gotrade',display_name:'VGT',sleeve:'technology_tilt',price_kind:'reference'},
  {product_id:'dragonfi_global_equity',provider:'dragonfi',provider_name:'DragonFi',display_name:'BPI Global Equity',sleeve:'global_equity',price_kind:'nav'},
  {product_id:'dragonfi_technology',provider:'dragonfi',provider_name:'DragonFi',display_name:'BPI World Technology',sleeve:'technology_tilt',price_kind:'nav'},
  { product_id: 'gotrade_vt', provider: 'gotrade', provider_name: 'Gotrade', display_name: 'VT', sleeve: 'global_equity', price_kind: 'reference' },
  { product_id: 'pdax_btc', provider: 'pdax', provider_name: 'PDAX', display_name: 'Bitcoin', sleeve: 'crypto', price_kind: 'reference' },
  { product_id: 'gcash_global_equity', provider: 'gcash', provider_name: 'GFunds', display_name: 'ATRAM Global Equity Opportunity Feeder Fund', sleeve: 'global_equity', price_kind: 'nav' },
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
const portfolio={currency:'PHP',catalog:catalog,history:historyFixture,holdings:[{...catalog.find(p=>p.product_id==='gotrade_vt'),id:'00000000-0000-4000-8000-000000000101',units:'12',unit_price:'185.7142857142857',unit_price_currency:'USD',value_php:'124800.00',opening_units:'11.2',opening_cost_php:'108000.00',cost_basis_php:'116000.00',has_entries:true,valuation_source:'market_reference',freshness:'fresh',as_of:now,updated_at:now,created_at:now,recorded_gain_php:'8800.00',recorded_gain_percentage:'7.59'}],known_value_php:'124800.00',total_value_php:'124800.00',total_value_usd:(124800/56).toFixed(2),recorded_cost_php:'116000.00',recorded_gain_php:'8800.00',recorded_gain_percentage:'7.59',complete:true,unavailable_count:0,stale_count:0,provider_values_php:{gotrade:'124800.00'},valued_at:now,data_sources:['marketstack','bsp'],sleeves:weights.map(w=>({sleeve:w.role,known_value_php:w.role==='global_equity'?'124800.00':'0.00',current_percentage:w.role==='global_equity'?'100.00':'0.00',target_percentage:w.percentage_points,difference_pp:((w.role==='global_equity'?100:0)-w.percentage_points).toFixed(2)}))};
assert.equal(portfolio.holdings.reduce((sum,h)=>sum+Number(h.value_php),0),Number(portfolio.total_value_php));
assert.equal(Number(portfolio.total_value_php)/Number(plan.profile.goal_target)*100,4.16);
assert.equal(canonical.monthly.rows.reduce((sum,row)=>sum+Number(row.amount),0),15000);
let pageErrors=0,blockedExternal=0;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const writes=[],corrections=[],openingCorrections=[];
let activityEntries=[];
const setup = async context => context.route('**/*',route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;
 if(url.origin===origin)return route.continue();
 // No request reaches a remote origin, including test auth/API endpoints.
 const json=body=>route.fulfill({json:body,headers});
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(path.endsWith('/auth/v1/token')){return json(session);}
 if(path.endsWith('/auth/v1/logout'))return json({});
 if(path.endsWith('/auth/v1/user'))return json(user);
 if(path.endsWith('/terms/current'))return json(termsDocument);
 if(path.endsWith('/account/terms')) return json({...termsDocument,required:false,accepted_at:now});
 if(path.endsWith('/account/lifecycle')||path.endsWith('/account/lifecycle/login'))return json({state:'active',version:0,access_allowed:true,deletion_request:null,in_flight_reminders:0,erasure_available:false});
 if(path.endsWith('/profiles/me'))return json(plan);
 if(path.endsWith('/account/export')){assert.equal(request.method(),'GET');assert.equal(url.search,'');return new Promise(resolve=>setTimeout(()=>resolve(route.fulfill({status:exportStatus,json:exportStatus===200?exportFixture:{detail:'Synthetic failure'},headers})),400));}
 if(path.endsWith('/account/entitlements'))return json({tier:'plus',status:'trial',effective_tier:'plus',private_beta:true,features:['live_portfolio','monthly_contribution_planner','monthly_checkin','future_projection','plan_alignment','ask_arbor_full'],ask_monthly_limit:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:true,monthly_checkin:true}});
 if(path.endsWith('/v2/next-action'))return json({key:'review_monthly_contribution',title:'Review your contribution',explanation:'Local fixture',button_label:'Review',blocking:false,destination:'plan'});
 if(path.endsWith('/v2/future-projection'))return json(canonical.projection);
 if(path.endsWith('/v2/monthly-plan'))return json(canonical.monthly);
 if(path.endsWith('/v2/monthly-checkin'))return json({month:nowKey,current:null,history:[]});
 if(path.endsWith('/v2/pending-recordings'))return json({items:[]});
 if(path.endsWith('/v2/portfolio'))return json(portfolio);
 if(path.endsWith('/v2/portfolio/snapshot'))return json({recorded:false,history:historyFixture});
 if(path.endsWith('/v2/portfolio/entries') && request.method()==='POST'){
  const body=request.postDataJSON(); writes.push(body);
  return json({entry_id:'00000000-0000-4000-8000-000000000202',holding_id:'00000000-0000-4000-8000-000000000102',replayed:false});
 }
 if(path.includes('/v2/portfolio/entries/') && request.method()==='PUT'){corrections.push(request.postDataJSON());return json({saved:true});}
 if(path.endsWith('/opening-position') && request.method()==='PUT'){openingCorrections.push(request.postDataJSON());return json({saved:true});}
 if(path.includes('/v2/portfolio/entries/') && path.endsWith('/void'))return json({saved:true});
 if(path.endsWith('/v2/portfolio/entries'))return json({entries:activityEntries,page:0,has_more:false});
 blockedExternal++;return route.abort();
});


portfolio.display_fx={rate:'56',source:'exchangerate_api',as_of:now,valued_at:now,valuation_date:observedDay(0)};
for(const point of historyFixture){
 point.earliest_recorded_date="2026-01-01";
 point.source_dates=[{price_key:'usd_php',source:'bsp',observation_date:point.day,valuation_date:point.day,rate:'56'}];
}
const last=historyFixture.at(-1);
Object.assign(last,{origin:'observed',captured_at:last.day+'T12:00:00Z',cost_context_captured:true,value_usd:'2496.00',display_fx:{rate:'50',source:'captured_snapshot',valuation_date:last.day,captured_at:last.day+'T12:00:00Z',as_of:null}});

await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>pageErrors++);
 await page.goto(origin+'/#login');
 await page.getByLabel('Email address').fill(user.email);
 await page.getByLabel('Password').fill('fixture-only-password');
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor({timeout:7000}).catch(async error=>{console.log(JSON.stringify({syntheticSetupText:await page.locator('body').innerText(),blockedExternal}));throw error;});
 await page.evaluate(()=>location.hash='portfolio');
 async function addVgt(){
  await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().click();
  await page.locator('dialog[open] .catalogue-row[data-product="gotrade_vgt"]').first().click();
 }
 await addVgt();
 await page.getByLabel('Investment date',{exact:true}).fill('2026-04-20');
 for(const invalidUnits of ['', '0']){
  await page.getByLabel('Shares received',{exact:true}).fill(invalidUnits);
  await page.getByRole('button',{name:'Review investment',exact:true}).click();
  await page.getByText('Enter the actual units received, greater than zero, with up to 12 decimal places.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirm and save',exact:true}).count(),0);
 }
 await page.getByLabel('Shares received',{exact:true}).fill('1');
 await page.getByLabel('Actual amount paid (PHP)',{exact:true}).fill('40000');
 const adjusted=page.getByRole('checkbox',{name:'This share count is already adjusted'});
 assert.equal(await adjusted.isChecked(),false);
 await page.screenshot({path:output+'/original-input.png',fullPage:true});
 await page.getByRole('button',{name:'Review investment',exact:true}).click();
 await page.getByText('Original shares before the split',{exact:true}).waitFor();
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme});
  for(const width of [320,390,768,1024,1440,1920]){
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`${output}/original-review-${theme}-${width}.png`,fullPage:true});
  }
 }
 await page.getByRole('button',{name:'Confirm and save',exact:true}).click();
 await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().waitFor();
 assert.equal(writes.length,1);assert.equal(writes[0].share_basis,'before_split');assert.equal(writes[0].units,'1');assert.equal(writes[0].amount_paid_php,'40000');
 await addVgt();
 await page.getByLabel('Investment date',{exact:true}).fill('2026-04-20');
 await page.getByLabel('Shares received',{exact:true}).fill('8');
 await page.getByLabel('Actual amount paid (PHP)',{exact:true}).fill('40000');
 await adjusted.check();
 await page.getByRole('button',{name:'Review investment',exact:true}).click();
 await page.getByText('Already-adjusted shares after the split',{exact:true}).waitFor();
 await page.screenshot({path:output+'/restated-review.png',fullPage:true});
 await page.getByRole('button',{name:'Edit details',exact:true}).click();
 await page.getByLabel('Investment date',{exact:true}).fill('2026-04-21');
 assert.equal(await adjusted.count(),0);
 await page.getByRole('button',{name:'Review investment',exact:true}).click();
 assert.equal(await page.getByText('Share count basis',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Confirm and save',exact:true}).click();
 await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().waitFor();
 assert.equal(writes.length,2);assert.equal(writes[1].share_basis,null);
 const vgt= {...catalog.find(p=>p.product_id==='gotrade_vgt'),id:'00000000-0000-4000-8000-000000000102',units:'1',effective_units:null,valuation_units:null,share_basis_required:true,unit_price:null,unit_price_currency:null,value_php:null,opening_units:'0',opening_cost_php:null,cost_basis_php:'40000',has_entries:true,valuation_source:'unavailable',freshness:'unavailable',as_of:null,updated_at:now,created_at:now,recorded_gain_php:null,recorded_gain_percentage:null};
 portfolio.holdings.push(vgt);portfolio.complete=false;portfolio.total_value_php=null;portfolio.total_value_usd=null;portfolio.unavailable_count=1;
 activityEntries=[{id:'00000000-0000-4000-8000-000000000202',holding_id:vgt.id,product_id:'gotrade_vgt',provider:'gotrade',investment_date:'2026-04-20',units:'1',amount_paid_php:'40000',share_basis:null,revision:1,recorded_at:now,updated_at:now,voided_at:null}];
 await page.getByRole('button',{name:'Refresh portfolio',exact:true}).click();
 await page.locator('.holding-row').filter({hasText:'VGT'}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 const basis=page.getByLabel('VGT share count basis');
 assert.equal(await basis.inputValue(),'');
 assert.ok(await page.getByRole('button',{name:'Review correction',exact:true}).isDisabled());
 await basis.selectOption('before_split');
 await page.getByRole('button',{name:'Review correction',exact:true}).click();
 await page.screenshot({path:output+'/legacy-confirmation.png',fullPage:true});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(corrections.length,0);
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Investment date',{exact:true}).fill('2026-04-21');
 assert.equal(await basis.count(),0);assert.ok(await page.getByRole('button',{name:'Review correction',exact:true}).isEnabled());
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 assert.equal(await basis.inputValue(),'');
 await basis.selectOption('before_split');
 await page.getByRole('button',{name:'Review correction',exact:true}).click();
 await page.getByRole('button',{name:'Confirm correction',exact:true}).click();
 await page.getByRole('button',{name:'Refresh portfolio',exact:true}).waitFor();
 assert.equal(corrections.length,1);assert.equal(corrections[0].share_basis,'before_split');
 assert.equal(corrections[0].units,'1');assert.equal(corrections[0].amount_paid_php,'40000');
 Object.assign(vgt,{opening_units:'1',opening_cost_php:'40000',opening_share_basis:null,has_entries:false});
 activityEntries=[];
 await page.getByRole('button',{name:'Refresh portfolio',exact:true}).click();
 await page.locator('.holding-row').filter({hasText:'VGT'}).click();
 await page.getByRole('button',{name:'Correct opening position',exact:true}).click();
 assert.equal(await basis.inputValue(),'');
 assert.ok(await page.getByRole('button',{name:'Confirm correction',exact:true}).isDisabled());
 await basis.selectOption('after_split');
 assert.ok(await page.getByRole('button',{name:'Confirm correction',exact:true}).isEnabled());
 await page.screenshot({path:output+'/undated-opening-confirmation.png',fullPage:true});
 await page.getByRole('button',{name:'Confirm correction',exact:true}).click();
 await page.getByRole('button',{name:'Refresh portfolio',exact:true}).waitFor();
 assert.equal(openingCorrections.length,1);assert.equal(openingCorrections[0].share_basis,'after_split');
 assert.equal(openingCorrections[0].opening_units,'1');assert.equal(openingCorrections[0].opening_cost_php,'40000');
 assert.equal(pageErrors,0);assert.equal(blockedExternal,0);
 console.log(JSON.stringify({actualProductionBuild:true,syntheticOnly:true,viewports:[320,390,768,1024,1440,1920],themes:['light','dark'],emptyAndZeroUnitsRejected:true,newOriginalDefault:true,restatedOverride:true,postSplitNoQuestion:true,legacyUnknownNoDefault:true,cancelNoWrite:true,repeatedCorrection:true,undatedOpeningExplicit:true,hostedWrites:0,captures:output}));
},{syntheticFixture:{baseURL:origin,setup}});
