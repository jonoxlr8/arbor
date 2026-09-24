// 3U-E visual/interaction QA. Requires the existing LOCAL monthly/portfolio fixture.
// Real disposable-account authentication; no hosted financial writes or flag changes.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';

const output='/tmp/arbor-3ue1';
await mkdir(output,{recursive:true});
await withAuthenticatedBrowser(async({page,reused})=>{
 let stage='fixture guard',pageErrors=0,consoleErrors=0,expectedFailure=false,shots=0;
 page.setDefaultTimeout(25000);
 page.on('pageerror',()=>pageErrors++);
 page.on('console',m=>{if(m.type()==='error'&&!expectedFailure)consoleErrors++;});
 const go=async hash=>{await page.evaluate(hash=>{location.hash=hash;},hash);};
 const dialog=()=>page.getByRole('dialog');
 const read=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
 const add=()=>page.getByRole('button',{name:'+ Add Investment',exact:true}).first();
 async function capture(name,fullPage=true){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${name}`);await page.screenshot({path:`${output}/${name}.png`,fullPage,animations:"disabled"});shots++;}
 async function addHolding(provider,product,value,units=false){
  await add().click();await page.locator(`.catalogue-row[data-product="${product}"]`).click();
  await page.getByLabel(units?(provider==='gotrade'?'Shares':'Bitcoin amount (BTC)'):'Current value (PHP)',{exact:true}).fill(value);
  const saved=read();await page.getByRole('button',{name:'Save Investment',exact:true}).click();const result=await(await saved).json();await add().waitFor();return result;
 }
 try{
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const initial=read();await go('portfolio');const response=await initial;assert.equal(response.headers()['x-arbor-portfolio-fixture'],'isolated');assert.equal((await response.json()).holdings.length,0,'Start with empty local fixtures');
  await go('settings');await page.getByRole('radio',{name:'System',exact:true}).check();
  stage='empty and add sheet';
  for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme});await go('portfolio');await page.getByRole('heading',{name:'Start tracking your investments'}).waitFor();await capture(`empty-${width}-${theme}`);
   await add().click();assert.ok(await dialog().isVisible());await capture(`add-${width}-${theme}`,false);
   await page.locator('.catalogue-row[data-product="gcash_global_equity"]').click();await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
   assert.equal(await page.getByLabel('Units (optional)',{exact:true}).isVisible(),false);await capture(`fund-value-${width}-${theme}`,false);
   // Native modal keyboard isolation, Escape, and focus restoration.
   await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('dialog')));
   await page.keyboard.press('Escape');assert.equal(await dialog().count(),0);assert.ok(await add().evaluate(e=>e===document.activeElement));
  }
  stage='catalogue search and asset forms';await page.setViewportSize({width:390,height:950});await page.emulateMedia({colorScheme:'light'});
  await add().click();assert.equal(await page.locator('.catalogue-row').count(),12);
  await page.getByRole('searchbox',{name:'Search investments'}).fill('VGT');assert.equal(await page.locator('.catalogue-row').count(),1);await page.getByRole('searchbox').fill('not a supported product');await page.getByText('No supported investments match.',{exact:false}).waitFor();await page.getByRole('searchbox').fill('');
  await page.locator('.catalogue-row[data-product="gotrade_vt"]').click();await page.getByLabel('Shares',{exact:true}).fill('2.4');await capture('add-vt-390-light',false);await page.getByRole('button',{name:'‹ All investments'}).click();
  await page.locator('.catalogue-row[data-product="pdax_btc"]').click();await page.getByLabel('Bitcoin amount (BTC)',{exact:true}).fill('0.001');await capture('add-bitcoin-390-light',false);await page.keyboard.press('Escape');
  stage='populate local records';await addHolding('gcash','gcash_global_equity','8000');await addHolding('gotrade','gotrade_vt','1',true);const portfolio=await addHolding('pdax','pdax_btc','0.001',true);assert.equal(portfolio.total_value_php,'16600.00');
  stage='populated matrix';
  for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme});
   for(const destination of ['home','portfolio','ask','settings']){
    await go(destination);
    if(destination==='home'){await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();await page.getByText('₱16,600',{exact:true}).waitFor();}
    if(destination==='portfolio')await page.getByRole('button',{name:/^View ATRAM/}).waitFor();
    await capture(`${destination}-${width}-${theme}`);
   }
   await go('portfolio');await page.getByRole('button',{name:/^View ATRAM/}).click();await capture(`holding-${width}-${theme}`,false);await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Allocation',exact:true}).click();await page.getByLabel('Current allocation').waitFor();await capture(`allocation-${width}-${theme}`);
  }
  stage='monthly preview';await go('portfolio/contribution');await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('5000');await page.getByRole('button',{name:/Gotrade Access supported/}).click();await page.getByRole('button',{name:'Preview contribution',exact:true}).click();await page.getByRole('heading',{name:'Choose where to invest',exact:true}).waitFor();
  for(const option of await page.getByRole('checkbox',{name:/Use /}).all())await option.check();await page.getByRole('button',{name:'Use these options in my preview',exact:true}).click();await page.getByRole('region',{name:'Contribution result'}).waitFor();await page.getByRole('button',{name:'Mark as invested',exact:true}).waitFor();
  for(const width of [1440,768,390,320])for(const theme of ['light','dark']){await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme});await capture(`contribution-${width}-${theme}`);}
  await page.getByRole('button',{name:'Mark as invested',exact:true}).click();await page.getByRole('button',{name:'Confirm recorded as invested',exact:true}).click();await page.getByRole('link',{name:'Return Home',exact:true}).click();await page.getByRole('heading',{name:/You’re set for/}).waitFor();
  for(const width of [1440,768,390,320])for(const theme of ['light','dark']){await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme});await page.getByText('₱16,600',{exact:true}).waitFor();await capture(`completed-${width}-${theme}`);}
  stage='chat';await go('ask');await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill('What is my current portfolio worth?');await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();await page.getByText(/16,600.00/).waitFor();await capture('chat-response-320-dark');
  stage='undo';await go('portfolio/contribution');await page.getByRole('button',{name:'Undo completion',exact:true}).click();await page.getByRole('button',{name:'Confirm undo completion',exact:true}).click();await page.getByRole('region',{name:'Monthly check-in',exact:true}).getByRole('heading',{name:/check-in/}).waitFor();
  stage='cleanup';await go('portfolio');await page.getByRole('button',{name:/^View ATRAM/}).waitFor();
  while(await page.locator('.holding-row').count()){
   await page.locator('.holding-row').first().click();await dialog().getByRole('button',{name:/^Remove /}).click();const clean=read();await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();await clean;await add().waitFor();
  }
  await page.getByRole('heading',{name:'Start tracking your investments'}).waitFor();
  stage='safe error';await go('home');await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();expectedFailure=true;
  await page.route('**/v2/portfolio',route=>route.fulfill({status:503,body:'fixture failure'}));await go('portfolio');await page.getByRole('alert').filter({hasText:'Portfolio records are temporarily unavailable'}).waitFor();await capture('portfolio-error');await page.unroute('**/v2/portfolio');await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('heading',{name:'Start tracking your investments'}).waitFor();expectedFailure=false;
  assert.equal(pageErrors,0);assert.equal(consoleErrors,0);
  console.log(JSON.stringify({reused,shots,layouts:'1440/768/390/320, Light/Dark',pageErrors,consoleErrors,manualFund:true,monthlyPreview:true,completed:true,undo:true,keyboardDialog:true,errorRetry:true,finalHoldings:0,hostedWrites:0}));
 }catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true});console.error(`Consumer QA stopped at ${stage}: ${error.name}`);throw new Error('Consumer QA failed; sensitive output omitted');}
});
