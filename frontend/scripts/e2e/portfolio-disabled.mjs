// Normal dedicated-account auth; no hosted or fixture writes.
import assert from 'node:assert/strict';
import { withAuthenticatedBrowser } from './auth.mjs';

await withAuthenticatedBrowser(async ({page,reused})=>{
  let stage='manual portfolio';
  try {
    page.setDefaultTimeout(15000);
    let portfolioRequests=0,pageErrors=0,consoleErrors=0;
    page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/v2/portfolio'))portfolioRequests++;});
    page.on('pageerror',()=>pageErrors++);
    page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
    await page.evaluate(()=>{location.hash='portfolio';});
    await page.getByText('Hypothetical current values',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Add holding',exact:true}).count(),0);
    await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('1000');
    await page.getByRole('button',{name:/Gotrade Access supported/}).click();
    await page.getByRole('button',{name:/I have no investments yet/}).click();
    await page.getByRole('radio',{name:'I do not own any products through these options'}).check();
    const calculated=page.waitForResponse(r=>new URL(r.url()).pathname==='/contributions/plan');
    await page.getByRole('button',{name:'Calculate scenario',exact:true}).click();
    const response=await calculated;
    assert.equal(response.status(),200);
    assert.equal((await response.json()).current_portfolio_value,'0');
    await page.getByRole('heading',{name:'Choose options for this scenario',exact:true}).waitFor();
    for(const checkbox of await page.getByRole('checkbox',{name:/Use /}).all())await checkbox.check();
    const accepted=page.waitForResponse(r=>new URL(r.url()).pathname==='/contributions/plan');
    await page.getByRole('button',{name:'Use these options in my scenario',exact:true}).click();
    assert.equal((await accepted).status(),200);
    stage='chat';
    await page.evaluate(()=>{location.hash='ask';});
    await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill('What is my current portfolio worth?');
    const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/chat');
    await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();
    const r=await reply;assert.equal(r.status(),200);
    assert.match((await r.json()).reply,/Live Portfolio is not currently available/);
    stage='next action';
    const next=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/next-action');
    await page.evaluate(()=>{location.hash='home';});
    assert.equal((await (await next).json()).key,'review_monthly_contribution');
    for(const width of [1440,390,320])for(const theme of ['Light','Dark']){
      stage=`layout ${width}/${theme}`;
      await page.setViewportSize({width,height:950});
      await page.evaluate(()=>{location.hash='settings';});
      await page.getByRole('radio',{name:theme,exact:true}).check();
      await page.evaluate(()=>{location.hash='portfolio';});
      await page.getByText('Hypothetical current values',{exact:false}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(width===390)await page.screenshot({path:`/tmp/arbor-disabled-${theme}.png`,fullPage:true});
    }
    assert.equal(portfolioRequests,0);assert.equal(pageErrors,0);assert.equal(consoleErrors,0);
    console.log(JSON.stringify({disabled:true,reused,manualPlan:200,chat:200,nextAction:'review_monthly_contribution',portfolioRequests,pageErrors,consoleErrors,hostedWrites:0}));
  } catch {
    console.error(`Disabled portfolio QA failed at ${stage}; no request/session data logged.`);
    throw new Error('Disabled portfolio QA failed');
  }
});
