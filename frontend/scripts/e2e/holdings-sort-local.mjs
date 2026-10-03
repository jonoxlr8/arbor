// Existing canonical synthetic metrics only; all remote requests mocked/blocked.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import {origin,setup as baseSetup,canonical,fixtureControls} from './ux-fixture.mjs';
const portfolio=JSON.parse(execFileSync('./.venv/bin/python',['tests/holdings_sort_fixture_local.py'],{cwd:'../backend',input:JSON.stringify(canonical.saved),encoding:'utf8',env:{...process.env,PYTHONPATH:'.:tests',SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_KEY:'synthetic-fixture-only'}}));
assert.equal(portfolio.known_value_php,'93000.00');assert.equal(portfolio.unavailable_count,1);
const out='/tmp/arbor-holdings-sort-captures';await mkdir(out,{recursive:true});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,OPTIONS'};
let mutations=0,errors=0;
const setup=async context=>{
 await baseSetup(context);
 await context.route('**/v2/portfolio',r=>{assert.equal(r.request().method(),'GET');return r.fulfill({json:portfolio,headers});});
 await context.route('**/v2/portfolio/**',r=>{
  const request=r.request(),path=new URL(request.url()).pathname;
  if(request.method()==='OPTIONS')return r.fulfill({status:204,headers});
  if(path.endsWith('/snapshot'))return r.fulfill({json:{recorded:false,history:[]},headers});
  if(path.endsWith('/entries'))return r.fulfill({json:{entries:[],has_more:false,page:0},headers});
  if(request.method()!=='GET')mutations++;
  return r.fallback();
 });
};
const products={highest_value:['Bitcoin','ATRAM Global Equity Opportunity Feeder Fund','Vanguard Total World Stock ETF','ATRAM Medium Term Peso Bond Fund','BPI World Technology Feeder Fund'],lowest_value:['ATRAM Medium Term Peso Bond Fund','Vanguard Total World Stock ETF','ATRAM Global Equity Opportunity Feeder Fund','Bitcoin','BPI World Technology Feeder Fund'],highest_gain:['Bitcoin','ATRAM Medium Term Peso Bond Fund','Vanguard Total World Stock ETF','ATRAM Global Equity Opportunity Feeder Fund','BPI World Technology Feeder Fund'],lowest_gain:['ATRAM Global Equity Opportunity Feeder Fund','ATRAM Medium Term Peso Bond Fund','Vanguard Total World Stock ETF','Bitcoin','BPI World Technology Feeder Fund']};
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>errors++);await page.goto(origin+'/#login');await page.getByLabel('Email address').fill('phase2b@example.test');await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 await page.evaluate(()=>location.hash='portfolio');const select=page.getByLabel('Sort holdings');await select.waitFor();assert.equal(await select.inputValue(),'highest_value');
 const names=()=>page.locator('#section-holdings .holding-copy > strong').allTextContents();
 const beforeMetrics=portfolio.holdings.map(h=>[h.id,h.value_php,h.recorded_gain_percentage]);let screenshots=0;
 for(const width of[320,390,1440])for(const theme of['light','dark']){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});
  for(const mode of['highest_value','lowest_value','highest_gain','lowest_gain','name']){
   await select.selectOption(mode);assert.equal(await page.locator('.holding-row').count(),5);assert.equal(await page.locator('.holding-money').filter({hasText:'Value unavailable'}).count(),1);
   if(mode!=='name')assert.deepEqual(await names(),products[mode]);else assert.deepEqual(await names(),[...await names()].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})));
   const heading=await page.locator('.holdings-heading h2').boundingBox(),control=await select.boundingBox();assert.ok(control.x>=heading.x+heading.width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#section-holdings').screenshot({path:`${out}/${mode}-${width}-${theme}.png`});screenshots++;
  }
 }
 assert.deepEqual(portfolio.holdings.map(h=>[h.id,h.value_php,h.recorded_gain_percentage]),beforeMetrics);
 await page.setViewportSize({width:390,height:1000});await page.emulateMedia({colorScheme:'light'});await select.selectOption('highest_value');await page.locator('#section-holdings').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/native-390-light.png'});
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({colorScheme:'dark'});await page.locator('#section-holdings').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/native-1440-dark.png'});
 await select.selectOption('lowest_gain');await page.locator('.holding-row').first().click();await page.getByRole('heading',{name:'ATRAM Global Equity Opportunity',exact:true}).waitFor();assert.match(await page.locator('.holding-detail-identity').textContent(),/ATRAM Global Equity Opportunity Feeder Fund/);await page.getByRole('button',{name:'Close',exact:true}).click();
 await select.focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.equal(await page.locator('.holding-row').count(),5);
 assert.equal(errors,0);assert.equal(mutations,0);assert.equal(fixtureControls.getBlocked(),0);
 const evidence={options:5,default:'Highest value',screenshots,widths:[320,390,1440],themes:['light','dark'],canonicalSyntheticValuedHoldings:true,existingMetricsUnchanged:true,unknownVisibleAndLast:true,fullNamesAndDetailPreserved:true,rightOfHeading:true,keyboardControl:true,errors,unexpectedExternal:fixtureControls.getBlocked(),financialMutations:mutations,hostedWrites:0};await writeFile(out+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
},{syntheticFixture:{baseURL:origin,setup}});
