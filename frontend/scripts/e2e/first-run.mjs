// First-run transport fixture: normal auth, no hosted profile creation/reset.
import assert from 'node:assert/strict';
import {withAuthenticatedBrowser} from './auth.mjs';
await withAuthenticatedBrowser(async({page})=>{
 let stage='canonical fixture',created=false,errors=0;
 try{
  page.setDefaultTimeout(20000);
  const restored=page.waitForResponse(r=>new URL(r.url()).pathname==='/profiles/me');await page.reload();const saved=await(await restored).json();
  assert.equal(saved.strategy_engine_version,'2.0');assert.equal(saved.plan.plan_basis,'user_selected');
  // Closest authenticated onboarding boundary. Host profile is never altered.
  await page.route('**/profiles/me',route=>route.fulfill({status:created?200:404,contentType:'application/json',body:JSON.stringify(created?saved:{detail:'Profile not found'})}));
  await page.route('**/v2/profiles',route=>{
   assert.equal(route.request().method(),'POST');assert.equal(route.request().postDataJSON().selected_approach,saved.profile.selected_approach);created=true;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(saved)});
  });
  await page.reload();
  // Expected 404 restoration is part of this fixture, not an app error.
  page.on('pageerror',()=>errors++);
  stage='questions';
  async function next(){await page.getByRole('button',{name:'Continue →',exact:true}).click();}
  await page.locator('#full_name').fill('Fixture investor');await next();
  await page.getByRole('button',{name:'Philippines · PHP',exact:true}).click();await next();
  await page.getByRole('button',{name:'Not yet',exact:true}).click();
  await page.getByRole('button',{name:'10+ years',exact:true}).click();await next();
  await page.getByRole('button',{name:'3–6 months',exact:true}).click();await next();
  await page.getByRole('button',{name:'None',exact:true}).click();await next();
  await page.locator('#current_portfolio_value').fill('0');await next();
  await page.locator('#monthly_investment').fill('5000');await next();
  await page.getByRole('button',{name:'Hold',exact:true}).click();await page.getByRole('button',{name:'Review approaches',exact:true}).click();
  stage='choice';await page.getByRole('heading',{name:'Choose your investment approach',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Use this as my plan',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:new RegExp(`^${saved.profile.selected_approach} `)}).click();await page.getByRole('button',{name:'Use this as my plan',exact:true}).click();
  stage='confirmation';await page.getByRole('heading',{name:'Your plan is ready',exact:true}).waitFor();await page.getByText(`You chose the ${saved.profile.selected_approach} approach.`,{exact:true}).waitFor();
  for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:'/tmp/arbor-first-run.png',fullPage:true});
  await page.getByRole('button',{name:'Go to Home',exact:true}).click();await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Your plan is ready',exact:true}).count(),0);
  assert.equal(errors,0);console.log(JSON.stringify({firstRun:'authenticated transport fixture',explicitChoice:true,home:true,pageErrors:errors,hostedWrites:0}));
 }catch(e){await page.screenshot({path:'/tmp/arbor-first-run-failure.png',fullPage:true});console.error(`First-run QA failed at ${stage}: ${e.name}`);throw new Error('First-run fixture failed; sensitive diagnostics omitted');}
});
