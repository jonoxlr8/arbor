// Chart layout fixture ONLY. Never writes/backfills synthetic history anywhere.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
await mkdir('/tmp/arbor-3ue1',{recursive:true});
await withAuthenticatedBrowser(async({page})=>{
 let stage='fixture guard',errors=0;page.setDefaultTimeout(25000);page.on('pageerror',()=>errors++);
 const go=hash=>page.evaluate(hash=>{location.hash=hash;},hash);
 const read=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
 try{
  const initial=read();await go('portfolio');const response=await initial;assert.equal(response.headers()['x-arbor-portfolio-fixture'],'isolated');assert.equal((await response.json()).holdings.length,0);
  await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().click();await page.locator('.catalogue-row[data-product="gotrade_vt"]').click();await page.getByLabel('Shares',{exact:true}).fill('1');const saved=read();await page.getByRole('button',{name:'Save Investment',exact:true}).click();const portfolio=await(await saved).json();
  const history=[3800,4050,4000,4600,4400,4950,5200,5600].map((value,i)=>({day:new Date(Date.UTC(2026,7,1+i*7)).toISOString().slice(0,10),value_php:String(value),captured_at:new Date(Date.UTC(2026,7,1+i*7)).toISOString()}));
  await page.route('**/v2/portfolio',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...portfolio,history})}));
  await page.route('**/v2/portfolio/snapshot',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recorded:false,history})}));
  stage='graph matrix';await go('settings');await page.getByRole('radio',{name:'System',exact:true}).check();await go('portfolio');await page.locator('.recharts-area').waitFor();await page.mouse.move(0,0);
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme});await page.waitForFunction(()=>{const chart=document.querySelector('.recharts-wrapper');return chart?.getBoundingClientRect().width>0&&chart.getBoundingClientRect().width<=chart.parentElement.parentElement.clientWidth;});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:`/tmp/arbor-3ue1/graph-layout-fixture-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'1M',exact:true}).click();assert.equal(await page.getByRole('button',{name:'1M',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByText(/Portfolio history/).click();assert.ok(await page.getByText('₱5,600',{exact:true}).count()>0);
  // Long-history controls wrap safely at the narrowest supported width.
  const longHistory=history.map((point,i)=>({...point,day:new Date(Date.UTC(2025,0,1+i*60)).toISOString().slice(0,10)}));
  await page.unroute('**/v2/portfolio');await page.route('**/v2/portfolio',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...portfolio,history:longHistory})}));
  await page.unroute('**/v2/portfolio/snapshot');await page.route('**/v2/portfolio/snapshot',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({recorded:false,history:longHistory})}));
  await go('home');await go('portfolio');await page.getByRole('button',{name:'1Y',exact:true}).waitFor();assert.equal(await page.getByRole('group',{name:'Portfolio sections'}).count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.evaluate(()=>{const title=document.querySelector('.chart-heading h3').getBoundingClientRect(),range=document.querySelector('.chart-range').getBoundingClientRect();return range.top>=title.bottom||range.left>=title.right;}));
  await page.unroute('**/v2/portfolio');await page.unroute('**/v2/portfolio/snapshot');
  stage='cleanup';await go('home');await go('portfolio');await page.locator('.holding-row').first().click();await page.getByRole('dialog').getByRole('button',{name:/^Remove /}).click();const clean=read();await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();assert.equal((await(await clean).json()).holdings.length,0);assert.equal(errors,0);
  console.log(JSON.stringify({chartLayoutFixture:true,syntheticHistoryPersisted:false,shots:8,pageErrors:errors,hostedWrites:0,finalHoldings:0}));
 }catch(e){await page.screenshot({path:'/tmp/arbor-3ue1/graph-failure.png',fullPage:true});console.error(`Graph layout fixture failed at ${stage}: ${e.name}`);throw new Error('Graph fixture failed; sensitive output omitted');}
});
