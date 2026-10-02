import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import {origin,setup,fixtureControls,canonical} from './ux-fixture.mjs';
const stage=process.env.ARBOR_UX_STAGE??'after',output=`/tmp/arbor-ux-successor-captures-${stage}`;await mkdir(output,{recursive:true});
let pageErrors=0;
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>pageErrors++);
 await page.setViewportSize({width:1440,height:1100});await page.goto(origin+'/#login');await page.getByLabel('Email address').fill('phase2b@example.test');await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 for(const free of [false,true]){
  fixtureControls.setFree(free);await page.evaluate(()=>location.hash='home');await page.reload();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();await page.getByRole('region',{name:'Portfolio overview'}).getByRole('region',{name:'Portfolio value graph'}).waitFor();
  if(stage==='after'){const progress=page.getByRole('region',{name:'This month’s recorded progress'});await progress.getByText('₱12,000.00 left to reach your target',{exact:true}).waitFor();assert.equal(await page.locator('.home-dashboard .plus-eyebrow').count(),1);assert.equal(await page.getByRole('button',{name:'Explore What If',exact:true}).count(),0);}
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===390||width===1440)for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await page.waitForTimeout(300);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/home-${free?'free':'trial'}-${width}-${theme}.png`,fullPage:true});}
  }
 }
 if(stage==='after'){
  fixtureControls.setFree(false);await page.evaluate(()=>location.hash='home');await page.reload();await page.getByRole('link',{name:'Plan your next investment',exact:false}).click();await page.getByRole('heading',{name:'Investment breakdown',exact:true}).waitFor();assert.equal(await page.evaluate(()=>location.hash),'#portfolio/contribution');
  await page.getByLabel('Amount to split (PHP)',{exact:true}).fill('5000');await page.getByRole('button',{name:'See investment breakdown',exact:true}).click();await page.getByRole('heading',{name:'Your estimated split'}).waitFor();
  for(const width of [390,1440])for(const theme of ['light','dark']){await page.setViewportSize({width,height:1100});await page.emulateMedia({colorScheme:theme});await page.waitForTimeout(300);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/breakdown-${width}-${theme}.png`,fullPage:true});}
  await page.getByLabel('Amount to split (PHP)',{exact:true}).fill('7000');assert.equal(await page.getByRole('heading',{name:'Your estimated split'}).count(),0);
  await page.getByRole('link',{name:'‹ Portfolio',exact:true}).click();await page.getByRole('navigation',{name:'Portfolio planning tools'}).waitFor();await page.getByRole('link',{name:'What-if exploration',exact:false}).click();await page.getByRole('region',{name:'What-if exploration'}).getByText('Illustrative future value',{exact:true}).waitFor();
  await page.getByLabel('Monthly amount to explore (PHP)').fill('6000');await page.getByRole('button',{name:'Reset to saved values'}).click();assert.equal(await page.getByLabel('Monthly amount to explore (PHP)').inputValue(),String(canonical.saved.profile.monthly_investment));
  await page.goBack();await page.getByRole('navigation',{name:'Portfolio planning tools'}).waitFor();await page.goForward();await page.getByRole('heading',{name:'What-if',exact:true}).waitFor();
  await page.evaluate(()=>location.hash='home/monthly');await page.getByRole('heading',{name:'Investment breakdown',exact:true}).waitFor();await page.getByRole('link',{name:'‹ Home',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 }
 assert.equal(pageErrors,0);assert.equal(fixtureControls.getBlocked(),0);console.log(JSON.stringify({stage,syntheticOnly:true,widths:[320,390,768,1440],freeTrial:true,lightDark:true,navigationAndRepeat:stage==='after',pageErrors,unexpectedRemote:fixtureControls.getBlocked(),hostedWrites:0,output}));
},{syntheticFixture:{baseURL:origin,setup}});
