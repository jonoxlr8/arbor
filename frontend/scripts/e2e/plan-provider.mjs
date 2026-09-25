// 3U-G: normal disposable-account auth, local server-owned entitlement/portfolio
// fixtures only. Never run against the deployed API or change hosted finances.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';

const mode=process.argv[2]??'off';
assert.ok(['off','plus','free'].includes(mode));
const output='/tmp/arbor-3ug';await mkdir(output,{recursive:true});
await withAuthenticatedBrowser(async({page,context})=>{
  let stage='guard',shots=0,pageErrors=0,consoleErrors=0,portfolioRequests=0,authorization,api;
  page.setDefaultTimeout(25000);
  page.on('pageerror',()=>pageErrors++);
  page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
  page.on('request',r=>{
    const u=new URL(r.url());
    if(u.pathname==='/account/entitlements'&&['localhost','127.0.0.1'].includes(u.hostname)){authorization=r.headers().authorization;api=u.origin;}
    if(u.pathname.startsWith('/v2/portfolio'))portfolioRequests++;
  });
  const read=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
  const go=async destination=>{
    await page.evaluate(d=>{location.hash=d;},destination);
    const label={home:'Home',portfolio:'Portfolio',ask:'Ask Arbor',settings:'Settings'}[destination.split('/')[0]];
    await page.getByRole('navigation',{name:page.viewportSize().width>=1024?'Primary navigation':'Mobile navigation'}).getByRole('link',{name:label,exact:true}).waitFor();
    await page.waitForFunction(label=>Array.from(document.querySelectorAll('nav a[aria-current="page"]')).some(a=>a.textContent.trim()===label),label);
    if(destination==='home')await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
    if(destination==='ask')await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).waitFor();
  };
  const add=()=>page.getByRole('button',{name:'+ Add Investment',exact:true});
  const capture=async name=>{
    await page.evaluate(()=>scrollTo(0,0));
    await page.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme===(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow: ${name}`);
    await page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});shots++;
  };
  const verifyOptions=async()=>{
    await page.getByRole('heading',{name:'Ways to invest',exact:true}).waitFor();
    const sleeves=await page.locator('.implementation-sleeve').evaluateAll(nodes=>nodes.map(n=>n.dataset.sleeve));
    assert.deepEqual(sleeves,['global_equity'],'Dedicated saved Aggressive plan: no zero-target sleeves');
    assert.equal(await page.locator('.implementation-option').count(),3);
    for(const link of await page.locator('.provider-open').all()){
      assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
    }
  };
  try {
    await page.locator('.app-shell').waitFor();
    await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
    const entitled=page.waitForResponse(r=>new URL(r.url()).pathname==='/account/entitlements'&&r.request().method()==='GET');
    await page.reload();const result=await entitled;const access=await result.json();
    assert.ok(api&&authorization);assert.equal(new URL(api).hostname,'localhost');
    assert.equal(result.headers()['x-arbor-portfolio-fixture'],'isolated');
    assert.equal(access.effective_tier,mode==='free'?'free':'plus');
    assert.equal(access.availability.live_portfolio,mode!=='off');
    assert.equal(access.availability.monthly_checkin,false);
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    await go('settings');await page.getByRole('radio',{name:'System',exact:true}).check();
    if(mode==='plus'){
      const initial=read();await go('portfolio');const body=await(await initial).json();assert.equal(body.holdings.length,0);
    }
    stage='empty/off matrix';
    for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:960});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
      for(const view of ['home','portfolio','ask','settings']){
        stage=`${mode} ${view} ${width} ${theme}`;
        await go(view);
        if(view==='home'){
          await page.getByRole('region',{name:'Portfolio overview',exact:true}).waitFor();
          if(mode==='plus')await page.locator('.home-history-empty strong').filter({hasText:/No investments/}).waitFor();
        }
        if(view==='portfolio'){
          await verifyOptions();assert.equal(await add().count(),mode==='plus'?1:0);
          assert.equal(await page.getByLabel('Contribution amount (PHP)',{exact:true}).count(),0);
        }
        if(view==='ask'&&width===1440){
          const heading=await page.locator('main > header').boundingBox();const chat=await page.locator('.chat-canvas').boundingBox();
          assert.ok(Math.abs(heading.x-chat.x)<2);assert.ok(chat.width>900);
        }
        await capture(`${mode}-${view}-${width}-${theme}`);
      }
    }
    stage='provider link and return';await page.setViewportSize({width:390,height:900});await page.emulateMedia({colorScheme:'light'});await go('portfolio');await verifyOptions();
    const destination='https://gcash.com/services/gfunds';
    // Exercise browser external navigation without generating a provider session.
    await context.route(destination,route=>route.fulfill({contentType:'text/html',body:'<title>Official destination navigation fixture</title>'}));
    const popupEvent=page.waitForEvent('popup');await page.getByRole('link',{name:'Open GFunds (opens in a new tab)',exact:true}).click();
    const popup=await popupEvent;await popup.waitForLoadState();assert.equal(popup.url(),destination);assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();await context.unroute(destination);
    if(mode==='plus'){
      stage='return to record';await page.getByRole('button',{name:'+ Record investment',exact:true}).click();
      assert.equal(await page.locator('.catalogue-row').count(),12);await capture('plus-add-catalogue-390-light');
      await page.locator('.catalogue-row[data-product="gcash_global_equity"]').click();await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
      assert.equal(await page.getByLabel('Units (optional)',{exact:true}).isVisible(),false);
      await capture('plus-add-fund-390-light');const saved=read();await page.getByRole('button',{name:'Save Investment',exact:true}).click();
      const holding=await(await saved).json();assert.equal(holding.total_value_php,'8000.00');assert.equal(holding.holdings[0].units,null);
      await page.getByRole('button',{name:/^View ATRAM/}).waitFor();assert.equal(await add().count(),1);
      stage='populated matrix';
      for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
        await page.setViewportSize({width,height:960});await page.emulateMedia({colorScheme:theme});
        for(const view of ['home','portfolio']){
          await go(view);await page.getByText('₱8,000',{exact:true}).first().waitFor();
          if(view==='home')await page.locator('.compact-chart').waitFor();
          await capture(`plus-populated-${view}-${width}-${theme}`);
        }
      }
      stage='Home Add route and keyboard';await go('home');await page.getByRole('region',{name:'Portfolio overview'}).getByRole('link',{name:'View portfolio',exact:true}).first().click();
      await add().click();await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('dialog')));await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
      stage='many holdings and contribution';
      for(const [product,label,amount] of [['gotrade_vt','Shares','1'],['pdax_btc','Bitcoin amount (BTC)','0.001']]){
        await add().click();await page.locator(`.catalogue-row[data-product="${product}"]`).click();await page.getByLabel(label,{exact:true}).fill(amount);
        const saved=read();await page.getByRole('button',{name:'Save Investment',exact:true}).click();await saved;await add().waitFor();
      }
      await page.locator('.holding-row').nth(2).waitFor();assert.equal(await page.locator('.holding-row').count(),3);assert.equal(await add().count(),1);
      for(const width of [1440,390])for(const theme of ['light','dark']){
        await page.setViewportSize({width,height:960});await page.emulateMedia({colorScheme:theme});await capture(`plus-many-portfolio-${width}-${theme}`);
      }
      await go('portfolio/contribution');await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('5000');await page.getByRole('button',{name:/Gotrade Access supported/}).click();await page.getByRole('button',{name:'Preview contribution',exact:true}).click();await page.getByRole('heading',{name:'Choose where to invest',exact:true}).waitFor();
      for(const option of await page.getByRole('checkbox',{name:/Use /}).all())await option.check();await page.getByRole('button',{name:'Use these options in my preview',exact:true}).click();await page.getByRole('region',{name:'Contribution result'}).waitFor();
      await capture('plus-contribution-390-dark');
      stage='cleanup';await go('portfolio');await page.getByRole('button',{name:/^View ATRAM/}).waitFor();
      let remaining=3;
      while(remaining){
        await page.locator('.holding-row').first().click();await page.getByRole('dialog').getByRole('button',{name:/^Remove /}).click();const clean=read();await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();remaining=(await(await clean).json()).holdings.length;await add().waitFor();
      }
      assert.equal(remaining,0);
      await go('home');await page.getByRole('button',{name:'Add holding',exact:true}).click();await page.getByRole('dialog',{name:'Add Investment'}).waitFor();await page.keyboard.press('Escape');
      await go('home');await page.getByRole('link',{name:'+ Add Investment',exact:true}).click();await page.getByRole('dialog',{name:'Add Investment'}).waitFor();await page.keyboard.press('Escape');
    } else {
      assert.equal(portfolioRequests,0,'No portfolio requests while unavailable or Free');
      if(mode==='free'){
        stage='Free access stays server-enforced';await page.getByRole('link',{name:'Explore Arbor Plus',exact:false}).first().click();await page.getByRole('heading',{name:'Compare Arbor plans'}).waitFor();
        for(const path of ['/v2/portfolio','/contributions/plan']){
          const r=await context.request.fetch(`${api}${path}?tier=plus`,{method:path.includes('contributions')?'POST':'GET',headers:{Authorization:authorization},...(path.includes('contributions')?{data:{tier:'plus'}}:{})});
          assert.equal(r.status(),403);
        }
      } else {
        stage='manual contribution remains accessible';await go('portfolio/contribution');await page.getByLabel('Contribution amount (PHP)',{exact:true}).waitFor();
      }
    }
    stage='Ask product explanation';await go('ask');
    if(mode!=='free'){
      await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill('What subscription plan am I on?');await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();await page.getByText(/You’re currently on Arbor Plus — Private Beta/).waitFor();
      await page.setViewportSize({width:1440,height:960});await capture(`${mode}-ask-response-1440-light`);
    }else await page.getByText('You’ve used your Free Ask Arbor questions for this month.',{exact:true}).waitFor();
    assert.equal(pageErrors,0);assert.equal(consoleErrors,0);
    console.log(JSON.stringify({mode,shots,pageErrors,consoleErrors,portfolioRequests,externalNavigation:true,openerNull:true,hostedFinancialWrites:0,finalTestHoldings:0}));
  } catch(error) {
    await page.screenshot({path:`${output}/${mode}-failure.png`,fullPage:true}).catch(()=>{});
    console.error(`Plan/provider QA failed at ${stage}: ${error.name}`);throw new Error('Plan/provider QA failed; sensitive output omitted');
  }
});
