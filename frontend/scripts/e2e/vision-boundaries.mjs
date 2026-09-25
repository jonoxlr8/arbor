// Scoped local UI checks. Real disposable auth, process-local financial data.
// Authenticated password update is intercepted; no real password is changed.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
const output='/tmp/arbor-vision-boundaries';await mkdir(output,{recursive:true});
await withAuthenticatedBrowser(async({page,context})=>{
  let errors=0,blocked=0,passwordUpdates=0;page.on('pageerror',()=>errors++);
  await context.route('**/rest/v1/**',route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){blocked++;return route.abort();}return route.continue();});
  await page.getByRole('heading',{name:'Hello, Alex.'}).waitFor();
  const go=async hash=>{await page.evaluate(hash=>{location.hash=hash;},hash);};
  const read=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
  const shot=async name=>{
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    for(const [width,theme] of [[1440,'light'],[390,'light'],[390,'dark']]){
      await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
      await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
      await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
      await page.screenshot({path:`${output}/${name}-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
    }
  };
  await go('settings');await page.getByRole('radio',{name:'System',exact:true}).check();
  await page.locator('summary').filter({hasText:'Change password'}).click();
  await page.getByLabel('New password',{exact:true}).waitFor();await shot('change-password');
  await page.route('**/auth/v1/user',async route=>{
    if(route.request().method()!=='PUT')return route.continue();
    passwordUpdates++;
    const response=await context.request.get(route.request().url(),{headers:route.request().headers()});
    assert.equal(response.status(),200);await route.fulfill({json:await response.json()});
  });
  await page.getByLabel('New password',{exact:true}).fill('fixture-only-password');await page.getByLabel('Confirm new password',{exact:true}).fill('fixture-only-password');
  await page.getByRole('button',{name:'Update password',exact:true}).click();await page.getByRole('heading',{name:'Password updated',exact:true}).waitFor();assert.equal(passwordUpdates,1);await shot('change-password-success');
  const initial=read();await go('portfolio');const initialResponse=await initial;assert.equal(initialResponse.headers()['x-arbor-completion-fixture'],'isolated');assert.equal((await initialResponse.json()).holdings.length,0);
  const values=[];
  for(const product of ['gcrypto_btc','coins_btc','pdax_btc']){
    await page.getByRole('button',{name:'+ Add Investment',exact:true}).click();await page.locator(`.catalogue-row[data-product="${product}"]`).click();
    await page.getByLabel('Bitcoin amount (BTC)',{exact:true}).fill('0.001');const saved=read();
    await page.getByRole('button',{name:'Save Investment',exact:true}).click();const result=await saved;assert.equal(result.headers()['x-arbor-completion-fixture'],'isolated');const data=await result.json();
    const holding=data.holdings.find(row=>row.product_id===product);assert.ok(holding);assert.equal(holding.value_php,'3000.00');values.push({provider:holding.provider,value:holding.value_php});
  }
  await page.locator('.holding-row').filter({hasText:'GCrypto'}).waitFor();await shot('bitcoin-provider-parity');
  await page.getByRole('button',{name:'Allocation',exact:true}).click();await page.getByRole('heading',{name:'Plan Alignment'}).waitFor();await shot('bitcoin-allocation');
  await page.getByRole('button',{name:'Holdings',exact:true}).click();
  while(await page.locator('.holding-row').count()){
    await page.locator('.holding-row').first().click();await page.getByRole('button',{name:/^Remove /}).click();const removed=read();await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();await removed;await page.getByRole('button',{name:'+ Add Investment',exact:true}).waitFor();
  }
  await page.getByRole('heading',{name:'Ways to invest',exact:true}).waitFor();assert.equal(errors,0);assert.equal(blocked,0);
  const result={values,source:'shared btc_php fixture',passwordUpdateMocked:true,realPasswordChanges:0,pageErrors:errors,hostedFinancialWrites:blocked,cleanupHoldings:0};await writeFile(`${output}/summary.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
