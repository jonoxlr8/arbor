// Bounded Portfolio error/retry regression against the isolated local fixture.
// Intercepts reads only; no credential or financial payload is logged.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
await mkdir('/tmp/arbor-premium',{recursive:true});
await withAuthenticatedBrowser(async({page,context})=>{
  let stage='fixture read';
  try {
  let errors=0,writes=0,expectedConsoleErrors=0;
  page.on('pageerror',()=>errors++);
  page.on('console',message=>{if(message.type()==='error')expectedConsoleErrors++;});
  await context.route('**/rest/v1/**',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
  await page.getByRole('heading',{name:'Hello, Alex.',exact:true}).waitFor();
  await page.evaluate(()=>{location.hash='settings';});
  await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  const initial=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
  await page.evaluate(()=>{location.hash='portfolio';});
  const response=await initial;stage='fixture contract';
  assert.equal(response.headers()['x-arbor-completion-fixture'],'isolated');
  const portfolio=await response.json();assert.equal(portfolio.holdings.length,0);
  // A browser-only populated response proves Retry cannot create a snapshot.
  // These contract-test amounts are never stored in the fixture or hosted data.
  const fund=portfolio.catalog.find(row=>row.product_id==='gcash_global_equity');assert.ok(fund);
  const populated={...portfolio,data_sources:['toap'],known_value_php:'200.00',total_value_php:'200.00',provider_values_php:{gcash:'200.00'},
    holdings:[{...fund,id:'retry-fixture',units:'1',cost_basis_php:null,manual_value_php:null,value_php:'200.00',freshness:'fresh',valuation_source:'nav',as_of:portfolio.valued_at,updated_at:portfolio.valued_at}],
    sleeves:portfolio.sleeves.map(row=>({...row,known_value_php:row.sleeve==='global_equity'?'200.00':'0.00',current_percentage:row.sleeve==='global_equity'?'100':'0',difference_pp:row.sleeve==='global_equity'?'20':row.sleeve==='defensive'?'0':'-10'}))};
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/v2/portfolio')&&r.method()!=='GET')writes++;});
  await page.setViewportSize({width:390,height:844});
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const cases=[
    [401,'Your session has expired. Sign in again to continue.'],
    [403,'Portfolio tracking is available with Arbor Plus. Explore plans in Settings.'],
    [404,'Portfolio tracking is not available right now. Please try again later.'],
    [500,'Portfolio records are temporarily unavailable. Please retry.'],
    [503,'Portfolio records are temporarily unavailable. Please retry.'],
    ['network','We couldn’t reach Arbor. Check your connection and try again.'],
    ['contract','We couldn’t load your portfolio correctly. Please refresh and try again.'],
    ['unknown-source','We couldn’t load your portfolio correctly. Please refresh and try again.'],
    ['malformed-json','We couldn’t load your portfolio correctly. Please refresh and try again.'],
  ];
  for(const [kind,message] of cases){
    stage=`error ${kind}`;
    let retry=false,reads=0,release;
    await page.evaluate(()=>{location.hash='settings';});await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
    await page.route('**/v2/portfolio',async route=>{
      reads++;assert.equal(route.request().method(),'GET');
      if(retry){await new Promise(resolve=>{release=resolve;});await route.fulfill({json:kind===500?populated:{...portfolio,data_sources:['toap']}});return;}
      if(kind==='network'){await route.abort('failed');return;}
      if(kind==='contract'){await route.fulfill({json:{internal:'never display this payload'}});return;}
      if(kind==='unknown-source'){await route.fulfill({json:{...portfolio,data_sources:['arbitrary']}});return;}
      if(kind==='malformed-json'){await route.fulfill({status:200,body:'not json'});return;}
      await route.fulfill({status:kind,json:{detail:'never display raw server details'}});
    });
    await page.evaluate(()=>{location.hash='portfolio';});
    const alert=page.locator('#app-content [role="alert"]');await alert.waitFor();assert.ok((await alert.textContent()).includes(message));
    assert.doesNotMatch(await alert.innerText(),/never display|portfolio_auth|https:/);
    stage=`disabled action ${kind}`;
    assert.equal(await page.getByRole('button',{name:'+ Add Investment',exact:true}).isDisabled(),true);
    stage=`screenshot ${kind}`;
    await page.screenshot({path:`/tmp/arbor-premium/error-${kind}-390.png`,animations:'disabled'});
    retry=true;stage=`click retry ${kind}`;await page.getByRole('button',{name:'Retry',exact:true}).click();
    stage=`retry ${kind}`;
    await page.getByText('Loading your portfolio…',{exact:true}).waitFor({state:'attached'});
    assert.equal(await page.locator('#app-content [role="alert"]').count(),0,'Retry clears previous error');
    await page.waitForFunction(()=>document.querySelector('.portfolio-skeleton')!==null);
    assert.ok(release,'Fresh GET reached the test transport');release();
    if(kind===500){await page.locator('.holding-row').waitFor();assert.equal(await page.locator('.holding-row').count(),1);}
    else await page.getByRole('heading',{name:'Ways to invest',exact:true}).waitFor();
    await page.getByRole('link',{name:'NAV data by TOAP / UITF.com.ph',exact:true}).waitFor();
    assert.equal(reads,2);assert.equal(await page.getByRole('button',{name:'+ Add Investment',exact:true}).isEnabled(),true);
    await page.unroute('**/v2/portfolio');
  }
  assert.equal(errors,0);assert.equal(writes,0);
  const result={cases:cases.length,allSafe:true,retryClearsError:true,freshGetOnly:true,populatedRetryNoSnapshot:true,toapRenders:true,unknownSourceRejected:true,portfolioWrites:writes,pageErrors:errors,expectedInjectedConsoleErrors:expectedConsoleErrors};
  await writeFile('/tmp/arbor-premium/errors.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } catch(error) {
    await page.screenshot({path:'/tmp/arbor-premium/error-failure.png',animations:'disabled'});
    await writeFile('/tmp/arbor-premium/error-failure.json',JSON.stringify({stage,type:error.name,diagnostic:error.message.split('\n')[0].replace(/https?:\S+/g,'[URL]')}));
    console.error(`Portfolio error QA stopped at ${stage} (${error.name})`);throw Error('Local error regression failed');
  }
});
