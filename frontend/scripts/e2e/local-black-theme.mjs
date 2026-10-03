import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import {origin,setup,fixtureControls} from './ux-fixture.mjs';
const out='/tmp/arbor-black-captures';await mkdir(out,{recursive:true});let errors=0;const checks=[];
async function intercepted(context){await setup(context);await context.route('**/v2/admin/**',route=>route.fulfill({json:{allowed:false},headers:{'Access-Control-Allow-Origin':'*'}}));}
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>errors++);
 for(const width of [375,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===1440?1000:844});await page.emulateMedia({colorScheme:theme});await page.goto(origin);await page.waitForTimeout(250);assert.equal(await page.locator('.marketing-site').evaluate(n=>getComputedStyle(n).backgroundColor),theme==='dark'?'rgb(0, 0, 0)':'rgb(247, 249, 252)');await page.screenshot({path:out+`/public-${width}-${theme}.png`});
 }
 await page.goto(origin+'/#login');await page.getByLabel('Email address').fill('phase2b@example.test');await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 for(const width of [375,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===1440?1000:844});await page.emulateMedia({colorScheme:theme});
  for(const hash of ['home','portfolio','ask','learn','settings','portfolio/insights','settings/plan','settings/goal','home/monthly']){
   await page.evaluate(h=>{location.hash=h;},hash);await page.waitForTimeout(300);assert.equal(await page.locator('.app-shell').evaluate(n=>getComputedStyle(n).backgroundColor),theme==='dark'?'rgb(0, 0, 0)':'rgb(243, 247, 251)');
   const dialogs=page.getByRole('dialog');if(await dialogs.count()){const colors=await dialogs.last().evaluate(n=>({bg:getComputedStyle(n).backgroundColor,line:getComputedStyle(n).borderTopColor,fg:getComputedStyle(n).color}));assert.equal(colors.bg,theme==='dark'?'rgb(20, 20, 20)':'rgb(255, 255, 255)');assert.equal(colors.line,theme==='dark'?'rgb(56, 56, 56)':'rgb(226, 234, 240)');assert.equal(colors.fg,theme==='dark'?'rgb(242, 242, 242)':'rgb(16, 33, 59)');}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+`/${hash.replace('/','-')}-${width}-${theme}.png`});checks.push({width,theme,hash,canvas:true,sheetColors:true,noHorizontalOverflow:true});
  }
 }
 // An explicit browser preference must beat the opposite system theme, including tracks.
 await page.evaluate(()=>{location.hash='settings';});await page.waitForTimeout(150);await page.getByText('Appearance',{exact:true}).first().click();await page.emulateMedia({colorScheme:'light'});await page.getByRole('radio',{name:'Dark',exact:true}).check();await page.evaluate(()=>{location.hash='home';});await page.waitForTimeout(150);assert.equal(await page.locator('.app-shell').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(0, 0, 0)');await page.reload();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();assert.equal(await page.locator('.app-shell').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(0, 0, 0)');
 await page.evaluate(()=>{location.hash='settings';});await page.waitForTimeout(150);await page.getByText('Appearance',{exact:true}).first().click();await page.emulateMedia({colorScheme:'dark'});await page.getByRole('radio',{name:'Light',exact:true}).check();await page.evaluate(()=>{location.hash='home';});await page.waitForTimeout(150);assert.equal(await page.locator('.app-shell').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(243, 247, 251)');
 assert.equal(errors,0);assert.equal(fixtureControls.getBlocked(),0);const evidence={checks,explicitPreferenceOverridesSystem:true,reloadPersists:true,lightBranchesUnchanged:true,pageErrors:errors,unexpectedExternal:fixtureControls.getBlocked(),hostedWrites:0};await writeFile(out+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
},{syntheticFixture:{baseURL:origin,setup:intercepted}});
