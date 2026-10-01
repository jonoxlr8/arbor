// Production-build UI QA. Synthetic auth/API fixture; no request reaches a hosted origin.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {withAuthenticatedBrowser} from './auth.mjs';
const origin='http://127.0.0.1:3138';
const fixtureCode = `import json
from app.schemas.profile_v2 import ProfileV2Create
from app.services.profile_v2 import profile_v2_row,restore_profile_v2
from app.services.strategy_selection_v2 import select_strategy
from app.services.strategy_v2 import StrategyType,get_base_strategy
base=dict(strategy_engine_version='2.0',full_name='Maya',country='Philippines',currency='PHP',horizon='ten_plus_years',emergency_savings='three_to_six_months',high_interest_debt='none')
old={**base,'risk_response':'hold','current_portfolio_value':50000,'monthly_investment':2000,'goal_target':500000}
fixtures={key:restore_profile_v2(profile_v2_row(ProfileV2Create(**data,selected_approach='Growth',**({'explicit_customization':{'technology_tilt':0,'bitcoin':0}} if key=='new' else {})), '00000000-0000-4000-8000-000000000001')) for key,data in [('new',base),('old',old)]}
fixtures['options']={'assessment':select_strategy(None,'ten_plus_years').model_dump(mode='json'),'approaches':[{'strategy':s.value,'allocation':get_base_strategy(s).allocation.model_dump(mode='json')['weights'],'planning_return_pct':float(get_base_strategy(s).planning_annual_rate*100)} for s in StrategyType]}
print(json.dumps(fixtures))`;
const fixtures=JSON.parse(execFileSync(fileURLToPath(new URL('../../../backend/.venv/bin/python',import.meta.url)),['-c',fixtureCode],{cwd:fileURLToPath(new URL('../../../backend/',import.meta.url)),env:{PATH:process.env.PATH,SUPABASE_URL:'https://arbor-test.invalid',SUPABASE_KEY:'arbor-synthetic-test-only-key'},encoding:'utf8'}));
// The pending Terms candidate is optional fixture data, never a release dependency.
const doc=JSON.parse(await readFile(new URL('../../lib/termsDocument.json',import.meta.url),'utf8').catch(() => 'null'));
const output='/tmp/arbor-onboarding-review';await mkdir(output,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'onboarding@example.test',created_at:'2026-09-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.synthetic-only`;
const session={access_token:token,refresh_token:'synthetic-only',expires_in:3600,token_type:'bearer',user};
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
let plus=false;
let saved=null,unexpected=0,errors=0,budgetWrites=0,goalWrites=0,creates=0;
const setup=async context=>context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname;if(url.origin===origin)return route.continue();
 const json=(body,status=200)=>route.fulfill({json:body,status,headers});
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(p.endsWith('/auth/v1/token'))return json(session);
 if(p.endsWith('/auth/v1/user'))return json(user);
 if(p.endsWith('/auth/v1/logout'))return json({});
 if(p.endsWith('/account/terms'))return json({...doc,required:false,accepted_at:null});
 if(p.endsWith('/account/lifecycle')||p.endsWith('/account/lifecycle/login'))return json({state:'active',version:0,access_allowed:true,deletion_request:null,in_flight_reminders:0,erasure_available:false});
 if(p.endsWith('/profiles/me'))return saved?json(saved):json({detail:'Profile not found'},404);
 if(p.endsWith('/account/entitlements'))return json({tier:'free',status:'active',effective_tier:'free',private_beta:false,features:plus?['monthly_contribution_planner','future_projection']:[],ask_monthly_limit:10,ask_usage:null,ask_usage_available:true,availability:{live_portfolio:false,monthly_checkin:false}});
 if(p.endsWith('/v2/approaches')){assert.equal(req.postDataJSON().risk_response,null);return json(fixtures.options);}
 if(p.endsWith('/v2/plan-preview'))return json(fixtures.new);
 if(p.endsWith('/v2/profiles')){const b=req.postDataJSON();for(const key of['risk_response','goal_target','current_portfolio_value','monthly_investment'])assert.equal(b[key],null);assert.equal(b.selected_approach,'Growth');creates++;saved=structuredClone(fixtures.new);return json(saved);}
 if(p.endsWith('/v2/budget')){assert.equal(req.method(),'PUT');const b=req.postDataJSON();assert.equal(b.expected_revision,saved.revision);budgetWrites++;saved={...saved,revision:String(budgetWrites%10).repeat(64),profile:{...saved.profile,monthly_investment:b.monthly_investment}};return json(saved);}
 if(p.endsWith('/v2/goal')){const b=req.postDataJSON();assert.equal(b.expected_revision,saved.revision);goalWrites++;saved={...saved,revision:'c'.repeat(64),profile:{...saved.profile,goal_target:b.goal_target,goal_name:b.goal_name,goal_date:b.goal_date}};return json(saved);}
 if(p.endsWith('/v2/pending-recordings'))return json({items:[]});
 if(p.endsWith('/v2/next-action'))return json({key:'review_monthly_contribution',title:'Review contribution',explanation:'Synthetic',button_label:'Review',blocking:false,destination:'plan'});
 unexpected++;return route.abort();
});
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>errors++);
 try {
 await page.goto(origin+'/#login');await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill('synthetic-only');await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByRole('heading',{name:'What’s your preferred or first name?'}).waitFor();
 assert.ok(await page.getByRole('button',{name:'Continue →',exact:true}).isDisabled());
 for(const theme of['light','dark'])for(const width of[320,390,768,1024,1440,1920]){
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({path:`${output}/onboarding-${theme}-${width}.png`,fullPage:true});
 }
 await page.locator('#full_name').fill('Maya');await page.getByRole('button',{name:'Continue →',exact:true}).click();
 await page.getByRole('button',{name:'Other country',exact:true}).click();assert.ok(await page.getByRole('button',{name:'Continue →',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Philippines · PHP',exact:true}).click();await page.getByRole('button',{name:'Continue →',exact:true}).click();
 await page.getByRole('button',{name:'10+ years',exact:true}).click();await page.getByRole('button',{name:'Continue →',exact:true}).click();
 await page.getByRole('button',{name:'3–6 months',exact:true}).click();await page.getByRole('button',{name:'Continue →',exact:true}).click();
 await page.getByRole('heading',{name:'Do you have high-interest debt, such as credit-card debt?'}).waitFor();
 for(const name of['No','Yes, and repayments are manageable','Yes, and repayments are difficult to manage','I’m not sure'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),1);
 await page.getByRole('button',{name:'No',exact:true}).click();await page.getByRole('button',{name:'Choose my plan',exact:true}).click();
 await page.getByText('No volatility assessment has been inferred.').waitFor();
 await page.getByRole('button',{name:'Compare approaches',exact:true}).click();
 assert.ok(await page.getByRole('button',{name:'Continue',exact:true}).isDisabled());
 await page.getByRole('button',{name:/^Growth More room/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Review my plan',exact:true}).click();await page.getByRole('button',{name:'Use this as my plan',exact:true}).click();
 await page.getByRole('button',{name:'See ways to invest',exact:true}).click();
 await page.evaluate(()=>location.hash='home');await page.getByRole('button',{name:'Set monthly contribution/budget →',exact:true}).waitFor();
 for(const theme of['light','dark'])for(const width of[320,390,768,1024,1440,1920]){
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({path:`${output}/home-${theme}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/monthly contribution\/budget →/}).click();
  assert.ok(await page.getByRole('button',{name:'Save monthly budget',exact:true}).isDisabled());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({path:`${output}/budget-${theme}-${width}.png`,fullPage:false});
  await page.getByLabel('Monthly budget (PHP)').fill('1200');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 assert.equal(budgetWrites,0);
 for(const amount of['0','2500']){
  await page.getByRole('button',{name:/monthly contribution\/budget →/}).click();await page.getByLabel('Monthly budget (PHP)').fill(amount);await page.getByRole('button',{name:'Save monthly budget',exact:true}).dblclick();
  await page.getByRole('button',{name:'Edit monthly contribution/budget →',exact:true}).waitFor();assert.equal(saved.profile.monthly_investment,Number(amount));
  await page.reload();await page.getByRole('button',{name:'Edit monthly contribution/budget →',exact:true}).waitFor();
 }
 assert.equal(budgetWrites,2);
 await page.getByRole('button',{name:/monthly contribution\/budget →/}).click();await page.getByRole('button',{name:'Not set yet',exact:true}).click();await page.getByRole('button',{name:'Set monthly contribution/budget →',exact:true}).waitFor();assert.equal(saved.profile.monthly_investment,null);
 await page.getByRole('button',{name:'Set a goal →',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
 for(const theme of['light','dark'])for(const width of[320,390,768,1024,1440,1920]){
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({path:`${output}/goal-${theme}-${width}.png`,fullPage:false});
 }
 assert.ok(await page.getByRole('button',{name:'Continue',exact:true}).isDisabled());await page.getByLabel('Target amount (future PHP)').fill('0');assert.ok(await page.getByRole('button',{name:'Continue',exact:true}).isDisabled());
 await page.getByLabel('Target amount (future PHP)').fill('500000');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Skip date for now',exact:true}).click();await page.getByRole('button',{name:'Edit goal →',exact:true}).waitFor();assert.equal(saved.profile.goal_date,null);assert.equal(goalWrites,1);
 // Existing profiles restore unchanged, including their actual zero/nonzero planning answers.
 saved=structuredClone(fixtures.old);await page.reload();await page.getByRole('button',{name:'Edit monthly contribution/budget →',exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit monthly contribution/budget →',exact:true}).click();assert.equal(await page.getByLabel('Monthly budget (PHP)').inputValue(),'2000');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.evaluate(()=>location.hash='home/plan');await page.evaluate(()=>location.hash='home');await page.getByRole('button',{name:'Edit monthly contribution/budget →',exact:true}).waitFor();
 assert.deepEqual(saved,fixtures.old);
 plus=true;saved=structuredClone(fixtures.new);await page.reload();await page.getByRole('button',{name:'Set monthly contribution/budget →',exact:true}).waitFor();
 await page.evaluate(()=>location.hash='home/monthly');await page.getByLabel('Contribution amount (PHP)').waitFor();assert.equal(await page.getByLabel('Contribution amount (PHP)').inputValue(),'');
 saved.profile.monthly_investment=0;await page.reload();await page.getByLabel('Contribution amount (PHP)').waitFor();assert.equal(await page.getByLabel('Contribution amount (PHP)').inputValue(),'0');
 assert.equal(creates,1);assert.equal(errors,0);assert.equal(unexpected,0);
 } catch(error) { await page.screenshot({path:output+'/failure.png',fullPage:true}); console.log((await page.locator('body').innerText()).slice(-4500)); throw error; }
},{syntheticFixture:{baseURL:origin,setup}});
console.log('Onboarding/Home production-build QA passed: six widths, light/dark, unset/zero, cancellation, repeated save, reload/navigation, older profile; zero unexpected external requests/page errors.');
