// Dedicated normal authentication; local fixture state only. No hosted writes.
import assert from 'node:assert/strict';
import {withAuthenticatedBrowser} from './auth.mjs';
const live=process.env.ARBOR_MONTHLY_LIVE==='true';
await withAuthenticatedBrowser(async({page,reused})=>{
 let stage='pending',errors=0,portfolioRequests=0,monthlyWrites=0;
 page.setDefaultTimeout(20000);
 page.on('pageerror',()=>errors++);
 page.on('console',m=>{if(m.type()==='error')errors++;});
 page.on('request',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/v2/portfolio'))portfolioRequests++;if(p==='/v2/monthly-checkin'&&r.method()==='POST')monthlyWrites++;});
 async function go(hash){await page.evaluate(hash=>{location.hash=hash;},hash);}
 const region=page.getByRole('region',{name:'Monthly check-in',exact:true});
 try{
  await page.addStyleTag({content:'nextjs-portal {display:none!important;}'});
  let beforeHoldings;
  if(live){
   stage='fixture holding';const initial=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');await go('portfolio');const first=await initial;assert.equal(first.headers()['x-arbor-monthly-fixture'],'isolated');assert.equal((await first.json()).holdings.length,0);
   await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().click();await page.locator('.catalogue-row[data-product="gcash_global_equity"]').click();await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');await page.getByRole('button',{name:'Save Investment',exact:true}).click();beforeHoldings=(await(await saved).json()).holdings;
   await go('home');
  }
  await page.getByRole('region',{name:'What should I do next?'}).getByRole('heading',{name:/check-in/}).waitFor();
  const current=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/monthly-checkin');
  await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').click();
  const initial=await current;assert.equal(initial.headers()['x-arbor-monthly-fixture'],'isolated');assert.equal((await initial.json()).current,null);
  assert.equal(await page.getByRole('button',{name:'Mark as invested',exact:true}).count(),0);
  stage='scenario';await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('5000');await page.getByRole('button',{name:/Gotrade Access supported/}).click();
  if(!live){await page.getByRole('button',{name:/I have no investments yet/}).click();await page.getByRole('radio',{name:'I do not own any products through these options'}).check();}
  const scenario=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(live?'/scenarios/plan':'/contributions/plan'));
  await page.getByRole('button',{name:'Preview contribution',exact:true}).click();const scenarioResponse=await scenario;assert.equal(scenarioResponse.status(),200);if(live)assert.equal((await scenarioResponse.json()).current_portfolio_value,'8000.00');
  await page.getByRole('heading',{name:'Choose where to invest',exact:true}).waitFor();for(const option of await page.getByRole('checkbox',{name:/Use /}).all())await option.check();
  await page.getByRole('button',{name:'Use these options in my preview',exact:true}).click();
  await page.getByRole('button',{name:'Mark as invested',exact:true}).click();
  stage='confirmation cancel';assert.equal(monthlyWrites,0);await region.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(monthlyWrites,0);
  await page.getByRole('button',{name:'Mark as invested',exact:true}).click();
  await page.getByLabel('Amount you invested outside Arbor (PHP)',{exact:true}).fill('5000');
  stage='complete';const recorded=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/monthly-checkin'&&r.request().method()==='POST');await region.getByRole('button',{name:'Confirm recorded as invested',exact:true}).click();const res=await recorded;assert.equal(res.status(),200);const result=await res.json();assert.equal(result.current.amount_php,'5000');assert.equal(result.history.length,1);
  await region.getByText('Recent check-ins',{exact:true}).click();await region.getByText(/Recorded as invested/).waitFor();
  await region.getByRole('link',{name:'Return Home',exact:true}).click();await page.getByRole('heading',{name:/You’re set for/}).waitFor();
  stage='reload';await page.reload();await page.addStyleTag({content:'nextjs-portal {display:none!important;}'});await page.getByRole('heading',{name:/You’re set for/}).waitFor();
  stage='chat';await go('ask');await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill('How much did I record this month?');const chat=page.waitForResponse(r=>new URL(r.url()).pathname==='/chat');await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();const answer=(await(await chat).json()).reply;assert.match(answer,/5,000.00/);assert.match(answer,/not a verified trade/);
  stage='responsive';const layouts=[];
  for(const width of [1440,768,390,320])for(const theme of ['Light','Dark']){
   await page.setViewportSize({width,height:900});await go('settings');await page.getByRole('radio',{name:theme,exact:true}).check();await go('home');await page.getByRole('heading',{name:/You’re set for/}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await go('portfolio/contribution');await region.getByRole('heading',{name:/You’re set for/}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===390)await page.screenshot({path:`/tmp/arbor-monthly-${live?'on':'off'}-${theme}.png`,fullPage:true});
   layouts.push(`${width}/${theme}`);
  }
  stage='undo';await region.getByRole('button',{name:'Undo completion',exact:true}).click();const [undone]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/monthly-checkin/undo')),region.getByRole('button',{name:'Confirm undo completion',exact:true}).click()]);assert.equal((await undone.json()).current,null);
  await go('home');await page.getByRole('region',{name:'What should I do next?'}).getByRole('heading',{name:/check-in/}).waitFor();
  if(live){
   stage='holdings unchanged and cleanup';const reread=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');await go('portfolio');const p=await(await reread).json();assert.deepEqual(p.holdings,beforeHoldings);assert.equal(p.history.length,1);
   await page.getByRole('button',{name:/^View ATRAM/}).click();await page.getByRole('button',{name:/^Remove ATRAM/}).click();const clean=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();assert.equal((await(await clean).json()).holdings.length,0);
  }else assert.equal(portfolioRequests,0);
  assert.equal(errors,0);assert.equal(monthlyWrites,1);
  console.log(JSON.stringify({live,reused,layouts,errors,monthlyWrites,hostedWrites:0,cleanup:'completion undone; local records discarded when fixture stops'}));
 }catch(error){await page.screenshot({path:'/tmp/arbor-monthly-failure.png',fullPage:true});console.error(`Monthly QA failed at ${stage}: ${error.name}`);throw new Error('Monthly QA failed; sensitive output omitted');}
});
