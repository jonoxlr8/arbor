// Local screenshot fixture only. All remote requests are fulfilled or blocked.
// Financial results come from frozen backend services, never a live account.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {withAuthenticatedBrowser} from './auth.mjs';
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
const termsDocument=JSON.parse(readFileSync(new URL('../../lib/termsDocument.json',import.meta.url),'utf8'));
const origin=process.env.ARBOR_REVIEW_ORIGIN ?? 'http://127.0.0.1:3143';
const output='/tmp/arbor-chart-touch-captures';await mkdir(output,{recursive:true});
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
 if(path.endsWith('/v2/portfolio/alignment-history'))return json({status:'unavailable',message:'Last month’s comparison is unavailable.',detail:'Synthetic history intentionally absent.',current:null,previous:null,drivers:[]});
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
 const prior=new Date(Date.parse(point.day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 point.source_dates=[{price_key:'usd_php',source:'bsp',observation_date:prior,valuation_date:point.day,rate:'56'},{price_key:'gotrade_vt',source:'marketstack',observation_date:prior,valuation_date:point.day}];
}
const last=historyFixture.at(-1);
Object.assign(last,{origin:'observed',captured_at:last.day+'T12:00:00Z',cost_context_captured:true,value_usd:'2496.00',display_fx:{rate:'50',source:'captured_snapshot',valuation_date:last.day,captured_at:last.day+'T12:00:00Z',as_of:null}});


await withAuthenticatedBrowser(async ({browser})=>{
 const context=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await setup(context);const page=await context.newPage();
 page.on('pageerror',()=>pageErrors++);
 await page.goto(origin+'/#login');
 await page.getByLabel('Email address').fill(user.email);
 await page.getByLabel('Password').fill('fixture-only-password');
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.locator('.chart-plot').first().waitFor();
 await page.screenshot({path:output+'/patched-home.png',fullPage:true});
 const plot=page.locator('.chart-plot').first();await plot.scrollIntoViewIfNeeded();
 const client=await context.newCDPSession(page);let results=[];
 for(const xpart of [0.02,0.55,0.98])for(const ypart of [0.05,0.5,0.95])for(const duration of [40,500]){
  const r=await plot.boundingBox(),x=r.x+r.width*xpart,y=r.y+r.height*ypart;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await page.waitForTimeout(duration);
  const during=await page.locator('.portfolio-chart').first().evaluate(e=>({selected:e.querySelector('.chart-selected-date').dataset.selected,small:e.querySelectorAll('.recharts-active-dot circle').length,big:e.querySelectorAll('.recharts-reference-dot circle').length}));
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);
  const after=await page.locator('.portfolio-chart').first().evaluate(e=>({selected:e.querySelector('.chart-selected-date').dataset.selected,small:e.querySelectorAll('.recharts-active-dot circle').length,big:e.querySelectorAll('.recharts-reference-dot circle').length}));
  assert.equal(after.small,0);assert.equal(after.big,1);assert.equal(after.selected,'true');assert.equal(await page.locator('.chart-inspection').count(),1);
  results.push({xpart,ypart,duration,during,after});
  await page.screenshot({path:output+`/patched-${xpart}-${ypart}-${duration}.png`,fullPage:true});
  await page.getByRole('button',{name:'1M portfolio history'}).first().click();
 }

 // Long-press drag across the full plot, then cancellation removes inspection.
 let r=await plot.boundingBox();
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+10,y:r.y+r.height*.85}]});await page.waitForTimeout(400);
 const firstDate=await page.locator('.chart-inspection time').textContent();
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width-10,y:r.y+r.height*.85}]});await page.waitForTimeout(80);
 assert.notEqual(await page.locator('.chart-inspection time').textContent(),firstDate);
 await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(80);assert.equal(await page.locator('.chart-inspection').count(),0);
 // Vertical gesture before activation must remain page scrolling.
 await page.getByRole('button',{name:'1M portfolio history'}).first().click();
 r=await plot.boundingBox();const initialScroll=await page.evaluate(()=>scrollY);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.5,y:r.y+r.height*.8}]});
 for(let n=1;n<=5;n++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*.5,y:r.y+r.height*.8-n*18}]});await page.waitForTimeout(20);}
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
 assert.equal(await page.locator('.chart-inspection').count(),0);assert.ok(await page.evaluate(()=>scrollY)>initialScroll);
 // Keyboard and edge placement for both Home and Portfolio, seven ranges, two currencies.
 let screenshots=0;
 for(const width of [320,390,768,1024,1440,1920])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
  for(const destination of ['home','portfolio']){
   await page.evaluate(d=>location.hash=d,destination);await plot.waitFor();await plot.scrollIntoViewIfNeeded();
   for(const name of ['1W','1M','3M','6M','1Y','5Y','All']){
    await page.getByRole('button',{name:name+' portfolio history',exact:true}).first().click();
    await plot.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.chart-inspection').count(),1);assert.match(await page.locator('.chart-inspection').textContent(),/Estimate · last available/);
    const tip=await page.locator('.chart-inspection').boundingBox(),box=await plot.boundingBox();
    assert.ok(tip.x>=box.x && tip.x+tip.width<=box.x+box.width+1);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.chart-inspection').count(),0);
   }
   await page.getByRole('button',{name:'1M portfolio history'}).first().click();
   await plot.focus();await page.keyboard.press('ArrowRight');
   await page.screenshot({path:output+`/patched-${destination}-${width}-${theme}-php.png`,fullPage:true});screenshots++;
   await page.getByRole('button',{name:'Switch portfolio display to USD'}).first().click();
   for(const name of ['1W','1M','3M','6M','1Y','5Y','All']){
    await page.getByRole('button',{name:name+' portfolio history',exact:true}).first().click();await plot.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.chart-inspection').count(),1);
   }
   await page.screenshot({path:output+`/patched-${destination}-${width}-${theme}-usd.png`,fullPage:true});screenshots++;
   await page.getByRole('button',{name:'Switch portfolio display to PHP'}).first().click();
  }
 }
 assert.equal(pageErrors,0);assert.equal(blockedExternal,0);assert.equal(writes.length,0);
 console.log(JSON.stringify({results,screenshots,pageErrors,blockedExternal,financialWrites:writes.length,drag:true,cancel:true,scroll:true,keyboard:true}));await context.close();
},{syntheticFixture:{baseURL:origin,setup}});
