// Local synthetic-auth/UI review only. No hosted account, API, or financial data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.ARBOR_REVIEW_ORIGIN ?? 'http://localhost:3000';
const phase2a=process.argv.includes('--phase2a');
const output=phase2a?'/private/tmp/arbor-phase2a-review':'/private/tmp/arbor-phase1-review';
await mkdir(output,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'phase1@example.test',created_at:'2026-09-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=`${encoded({alg:'HS256',typ:'JWT'})}.${encoded({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.fixture-only`;
const session={access_token:token,refresh_token:'fixture-only',expires_in:3600,token_type:'bearer',user};
const weights=[{role:'global_equity',percentage_points:80},{role:'defensive',percentage_points:0},{role:'technology_tilt',percentage_points:10},{role:'crypto',percentage_points:10}];
const plan={strategy_engine_version:'2.0',profile:{strategy_engine_version:'2.0',full_name:'Phase One QA',country:'Philippines',currency:'PHP',emergency_savings:'three_to_six_months',high_interest_debt:'none',goal_target:null,current_portfolio_value:0,monthly_investment:0,horizon:'ten_plus_years',risk_response:'hold',saved_preferences:{technology_tilt:0,bitcoin:0},selected_approach:'Aggressive',explicit_customization:{technology_tilt:10,bitcoin:10},implementation_choices:{}},plan:{plan_basis:'user_selected',strategy_engine_version:'2.0',selection:{risk_response:'hold',horizon:'ten_plus_years',requested_strategy:'Growth',horizon_maximum_strategy:'Aggressive',selected_strategy:'Growth',is_short_term:false,cap_applied:false,reason:'requested_strategy_retained'},readiness:{readiness:'ready',core_strategy_can_be_shown:true,actionable_contribution_guidance_allowed:true,technology_satellite_readiness_eligible:true,bitcoin_satellite_readiness_eligible:true,message_requirement:'none'},inflation_pct:3,preference_result:{technology_tilt:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:10,reasons:[]},bitcoin:{requested_percentage_points:0,effective_percentage_points:0,strategy_cap_percentage_points:10,reasons:[]},effective_target:{strategy_engine_version:'2.0',base_strategy:'Aggressive',allocation:{weights:[{role:'global_equity',percentage_points:100},{role:'defensive',percentage_points:0},{role:'technology_tilt',percentage_points:0},{role:'crypto',percentage_points:0}]}}},dormant_selected_approach:null,historical_allocation_preserved:false,customization:{technology_tilt:10,bitcoin:10,provenance:'user_selected'},final_allocation:weights,path:'long_term',selected_strategy:'Aggressive',base_allocation:[{role:'global_equity',percentage_points:100},{role:'defensive',percentage_points:0}],planning_return_pct:5.5},historical_plan:null,revision:'96613c4986b48f5b2b5e2a255b90a1ffa9be405441b583c34b5a3b02247d3176',profile_warning:null};
if(phase2a){plan.profile.goal_target=500000;plan.profile.goal_name='Home';plan.profile.goal_date='2036-09-28';plan.profile.monthly_investment=2000;}
const catalog=[
 ['gcash_global_equity','gcash','GCash / GFunds','ATRAM Global Equity Opportunity Feeder Fund','global_equity','nav'],
 ['dragonfi_global_equity','dragonfi','DragonFi','BPI Global Equity Fund of Funds','global_equity','nav'],
 ['gotrade_vt','gotrade','Gotrade','VT','global_equity','reference'],
 ['gotrade_vgt','gotrade','Gotrade','VGT','technology_tilt','reference'],
 ['pdax_btc','pdax','PDAX','PDAX BTC','crypto','reference'],
].map(([product_id,provider,provider_name,display_name,sleeve,price_kind])=>({product_id,provider,provider_name,display_name,sleeve,price_kind}));
let entry=null, pageErrors=0, consoleErrors=0, blockedExternal=0, empty=false, free=false, history=[];
const now='2026-09-26T00:00:00Z';
function currentHolding(){
  const active=entry && !entry.voided_at;
  const edited=active && entry.units==='0.50000';
  const units=active?(edited?'2.90000':'2.92314'):'2.40000';
  const value=active?(edited?'14500.00':'14615.70'):'12000.00';
  const cost=active?(edited?'11800.00':'12000.00'):'10000.00';
  const gain=active?(edited?'2700.00':'2615.70'):'2000.00';
  return {...catalog[2],id:'00000000-0000-4000-8000-000000000101',units,cost_basis_php:cost,manual_value_php:null,
    manual_value_updated_at:null,opening_units:'2.40000',opening_cost_php:'10000.00',has_entries:!!entry,
    value_php:value,freshness:'fresh',as_of:now,updated_at:now,created_at:now,
    valuation_source:'market_reference',unit_price:'100.00',unit_price_currency:'USD',recorded_gain_php:gain,
    recorded_gain_percentage:active?(edited?'22.88':'21.80'):'20.00'};
}
function portfolio(){
  const h=currentHolding(), value=h.value_php;
  const known=empty?'0.00':value;
  return {currency:'PHP',holdings:empty?[]:[h],catalog,history,known_value_php:known,total_value_php:known,complete:true,unavailable_count:0,stale_count:0,
    bitcoin_units:'0',provider_values_php:empty?{}:{gotrade:value},valued_at:now,data_sources:empty?[]:['marketstack','exchangerate_api'],
    sleeves:weights.map(w=>({sleeve:w.role,known_value_php:!empty&&w.role==='global_equity'?value:'0.00',current_percentage:empty?null:w.role==='global_equity'?'100':'0',target_percentage:w.percentage_points,difference_pp:empty?null:String((w.role==='global_equity'?100:0)-w.percentage_points)}))};
}
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'};
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:950},colorScheme:'light',reducedMotion:'reduce'});
const page=await context.newPage();
page.on('pageerror',()=>pageErrors++);
page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  if(url.origin===origin && ['localhost','127.0.0.1'].includes(url.hostname)) return route.continue();
  if(method==='OPTIONS') return route.fulfill({status:204,headers});
  const json=(body,status=200)=>route.fulfill({status,json:body,headers});
  if(path.endsWith('/auth/v1/token'))return json(session);
  if(path.endsWith('/auth/v1/user'))return json(user);
  if(path.endsWith('/profiles/me'))return json(plan);
  if(path.endsWith('/account/entitlements'))return json({tier:free?'free':'plus',status:'active',effective_tier:free?'free':'plus',private_beta:!free,features:free?['plan_creation']:['live_portfolio','monthly_contribution_planner','monthly_checkin','profile_rebuild','future_projection'],ask_monthly_limit:free?10:null,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:true,monthly_checkin:true}});
  if(path.endsWith('/v2/next-action'))return json({key:empty?'add_first_holding':'review_monthly_contribution',title:empty?'Record your first investment':'Keep your plan in view',explanation:'A small step, at your pace.',button_label:empty?'Add Investment':'View monthly plan',blocking:false,destination:empty?'portfolio':'plan'});
  if(path.endsWith('/v2/monthly-checkin'))return json({month:new Date().toISOString().slice(0,7),current:null,history:[]});
  if(path.endsWith('/v2/future-projection'))return json({starting_value_php:empty?'0.00':'12000.00',monthly_contribution_php:'2000.00',annual_planning_rate_pct:'5.500',inflation_planning_rate_pct:'3.0',whole_months:120,target_date:'2036-09-28',projected_value_php:'342000.00',goal_target_php:'500000.00',difference_to_goal_php:'-158000.00',illustrative:true});
  if(path.endsWith('/v2/portfolio') && method==='GET')return json(portfolio());
  if(path.endsWith('/v2/portfolio/snapshot'))return json({recorded:false,history});
  if(path.endsWith('/v2/portfolio/entries') && method==='GET')return json({entries:entry&&!entry.voided_at?[entry]:[],page:Number(url.searchParams.get('page')||0),has_more:false});
  if(path.endsWith('/v2/portfolio/entries') && method==='POST'){
    const body=request.postDataJSON();
    if(entry && body.idempotency_key===entry.idempotency_key)return json({entry_id:entry.id,holding_id:entry.holding_id,replayed:true},201);
    entry={id:'00000000-0000-4000-8000-000000000201',holding_id:currentHolding().id,product_id:body.product_id,provider:body.provider,
      idempotency_key:body.idempotency_key,investment_date:body.investment_date,units:body.units,amount_paid_php:body.amount_paid_php,
      recorded_at:now,updated_at:now,revision:1,voided_at:null};
    return json({entry_id:entry.id,holding_id:entry.holding_id,replayed:false},201);
  }
  if(path.endsWith('/v2/portfolio/entries/00000000-0000-4000-8000-000000000201') && method==='PUT'){
    const body=request.postDataJSON();entry={...entry,investment_date:body.investment_date,units:body.units,amount_paid_php:body.amount_paid_php,revision:2};
    return json({entry_id:entry.id,holding_id:entry.holding_id,revision:2});
  }
  if(path.endsWith('/v2/portfolio/entries/00000000-0000-4000-8000-000000000201/void')){
    entry={...entry,voided_at:now,revision:3};return json({entry_id:entry.id,holding_id:entry.holding_id,revision:3});
  }
  blockedExternal++;return route.abort();
});
const shots=[];
async function shot(name,width,theme='light'){
  await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
    elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(e=>({tag:e.tagName,className:typeof e.className==='string'?e.className:'',right:Math.round(e.getBoundingClientRect().right)}))}));
  assert.equal(overflow.scroll<=overflow.width,true,`${name} overflow ${JSON.stringify(overflow)}`);
  assert.equal(await page.locator('[data-nextjs-dialog]').count(),0,`${name} framework overlay`);
  const file=`${output}/${name}.png`;await page.screenshot({path:file,fullPage:true,animations:'disabled',style:'nextjs-portal{display:none!important}'});shots.push(file);
}
async function checkWidth(name,width){
  await page.setViewportSize({width,height:950});
  const sizes=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  assert.ok(sizes.document<=sizes.viewport,`${name} overflow ${JSON.stringify(sizes)}`);
}
async function checkMobileScroll(width,theme='light'){
  await page.setViewportSize({width,height:700});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  const graphHeight=await page.locator('.home-portfolio .chart-plot').evaluate(node=>Math.round(node.getBoundingClientRect().height));
  assert.equal(graphHeight,155,`${width}px ${theme} Home graph height`);
  const bottomPadding=await page.locator('#app-content').evaluate(node=>parseFloat(getComputedStyle(node).paddingBottom));
  assert.ok(bottomPadding>=100,`${width}px ${theme} bottom content padding`);
  const targets=[['Explore What If','.home-projection button'],['How this works','.home-projection details summary'],['Recent activity','.home-activity'],['Your plan','.home-plan'],['Data attribution','.home-data-attribution']];
  const results=[];
  for(const [label,selector] of targets){
    const target=page.locator(selector).first();await target.evaluate(node=>node.scrollIntoView({block:'center'}));
    const position=await page.evaluate(selector=>{
      const element=document.querySelector(selector),nav=document.querySelector('nav[aria-label="Mobile navigation"]');
      const rect=element.getBoundingClientRect(),navRect=nav.getBoundingClientRect();
      return {top:Math.round(rect.top),bottom:Math.round(rect.bottom),navTop:Math.round(navRect.top),pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
    },selector);
    assert.ok(position.top>=0 && position.bottom<=position.navTop-8,`${width}px ${theme} ${label} obscured: ${JSON.stringify(position)}`);
    assert.ok(position.pageWidth<=position.viewportWidth,`${width}px ${theme} horizontal overflow: ${JSON.stringify(position)}`);
    results.push({label,...position});
  }
  await page.locator('.home-projection details summary').evaluate(node=>node.scrollIntoView({block:'center'}));
  const file=`${output}/${theme==='dark'?'home-dark':`home-mobile-${width}`}-scrolled.png`;
  await page.screenshot({path:file,animations:'disabled',style:'nextjs-portal{display:none!important}'});shots.push(file);
  return {width,theme,graphHeight,bottomPadding,results};
}
try{
  await page.goto(`${origin}/#login`);
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill('fixture-only-password');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  if(phase2a){
    await page.locator('.home-goal').waitFor();empty=true;await page.reload();await page.getByText('0.0% complete').waitFor();await shot('home-empty-1440',1440);
    await page.evaluate(()=>{location.hash='portfolio';});await page.locator('.portfolio-chart').getByText('No investments recorded yet.').waitFor();await shot('portfolio-empty-390',390);
    empty=false;await page.evaluate(()=>{location.hash='home';});await page.reload();await page.locator('.home-goal').waitFor();await page.getByText('₱342,000').waitFor();
    await shot('home-plus-1440',1440);await shot('home-mobile-390',390);await shot('home-mobile-320',320);await shot('home-dark-390',390,'dark');
    const mobileScroll=[await checkMobileScroll(390),await checkMobileScroll(320),await checkMobileScroll(390,'dark')];
    const homeSections=await page.evaluate(()=>[...document.querySelectorAll('.home-portfolio,.home-goal,.home-monthly,.home-projection,.home-activity,.home-plan')].map(node=>node.classList[0]));
    assert.deepEqual(homeSections,['home-metric','home-goal','home-metric','home-projection','home-activity','home-plan']);
    assert.equal(await page.getByText('Keep your plan in view').count(),0);
    await page.getByRole('button',{name:'Explore What If'}).click();await page.getByText('Projected value',{exact:true}).waitFor();await shot('what-if-390',390);await page.getByRole('button',{name:'Close'}).click();
    await page.getByRole('button',{name:'Edit goal'}).click();await shot('goal-setup-390',390);await page.getByRole('button',{name:'Close'}).click();
    await checkWidth('home-tablet',1024);await checkWidth('home-tablet-small',768);await checkWidth('home-small',320);
    history=[{day:'2026-09-26',value_php:'12000.00',captured_at:now}];await page.evaluate(()=>{location.hash='portfolio';});await page.getByRole('button',{name:'View VT'}).waitFor();await shot('portfolio-one-history-390',390);
    history=[];await page.reload();await page.getByRole('button',{name:'View VT'}).waitFor();await shot('portfolio-populated-1440',1440);await shot('portfolio-populated-390',390);
    await checkWidth('portfolio-tablet',1024);await checkWidth('portfolio-tablet-small',768);await checkWidth('portfolio-small',320);
    assert.equal(pageErrors,0);assert.equal(consoleErrors,0);assert.equal(blockedExternal,0);
    console.log(JSON.stringify({screenshots:shots,mobileScroll,pageErrors,consoleErrors,blockedExternal,fixtureOnly:true}));await browser.close();process.exit(0);
  }
  await page.evaluate(()=>{location.hash='portfolio';});
  await page.getByRole('button',{name:'View VT'}).waitFor();
  await shot('portfolio-desktop',1440);
  await shot('portfolio-mobile',390);
  await page.getByRole('button',{name:'View VT'}).click();
  await page.getByRole('heading',{name:'Investment activity'}).waitFor();
  await shot('holding-detail',390);
  await page.getByRole('button',{name:'Add more'}).click();
  await page.getByLabel('Shares received').fill('0.52314');
  await page.getByLabel('Actual amount paid (PHP)').fill('2000');
  await page.getByRole('button',{name:'Review investment'}).click();
  await shot('add-to-existing',390);
  await page.getByRole('button',{name:'Confirm and save'}).click();
  await page.getByRole('button',{name:'View VT'}).waitFor();
  await page.getByRole('button',{name:'View VT'}).click();
  await page.getByText('Added investment').waitFor();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Units received').fill('0.50000');
  await page.getByLabel('Actual paid (PHP, optional)').fill('1800');
  await page.getByRole('button',{name:'Review correction'}).click();
  await shot('edit-transaction',390,'dark');
  await page.getByRole('button',{name:'Confirm correction'}).click();
  await page.getByRole('button',{name:'View VT'}).waitFor();
  await page.getByRole('button',{name:'View VT'}).click();
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await shot('delete-confirmation',320);
  await page.getByRole('button',{name:'Delete investment'}).click();
  await page.locator('a[href="#portfolio/history"]').click();
  await page.getByText('No dated additions recorded yet.').waitFor();
  assert.equal(pageErrors,0);assert.equal(consoleErrors,0);assert.equal(blockedExternal,0);
  console.log(JSON.stringify({screenshots:shots,pageErrors,consoleErrors,blockedExternal,fixtureOnly:true}));
}finally{await browser.close();}
