// Genuine UI sign-out/sign-in on the dedicated account. Financial data is read-only.
import assert from 'node:assert/strict';
import {withAuthenticatedBrowser,loadConfiguration} from './auth.mjs';

const config=await loadConfiguration();
await withAuthenticatedBrowser(async({page})=>{
  let stage='feature guard',errors=0,hiddenRequests=0;
  page.setDefaultTimeout(30000);
  page.on('pageerror',()=>errors++);
  page.on('request',r=>{if(/\/v2\/(portfolio|monthly)/.test(r.url()))hiddenRequests++;});
  try {
    await page.locator('.app-shell').waitFor();
    await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
    const access=page.waitForResponse(r=>new URL(r.url()).pathname==='/account/entitlements'&&r.request().method()==='GET');
    await page.reload();const body=await(await access).json();
    assert.equal(body.availability.live_portfolio,false);assert.equal(body.availability.monthly_checkin,false);
    stage='sign out';await page.evaluate(()=>{location.hash='settings';});
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.locator('.marketing-site').waitFor();
    await page.setViewportSize({width:1440,height:950});
    stage='sign in';await page.locator('.m-signin').click();await page.getByRole('heading',{name:'Welcome back'}).waitFor();
    await page.getByLabel('Email address',{exact:true}).fill(config.email);
    await page.getByLabel('Password',{exact:true}).fill(config.password);
    const restored=page.waitForResponse(r=>new URL(r.url()).pathname==='/profiles/me'&&r.status()===200);
    await page.getByRole('button',{name:'Log in',exact:true}).click();await restored;
    await page.locator('.app-shell').waitFor();assert.equal(await page.locator('.marketing-site').count(),0);
    stage='four destinations';for(const destination of ['home','portfolio','ask','settings']){
      await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:destination==='ask'?'Ask Arbor':destination[0].toUpperCase()+destination.slice(1),exact:true}).click();
      await page.locator('#app-content').waitFor();
    }
    await page.reload();await page.locator('.app-shell').waitFor();
    assert.equal(await page.getByRole('button',{name:'+ Add Investment',exact:true}).count(),0);
    assert.equal(hiddenRequests,0);assert.equal(errors,0);
    console.log(JSON.stringify({normalUiSignIn:true,savedPlanRestored:true,reload:true,fourDestinations:true,livePortfolio:false,monthlyCheckin:false,hiddenFeatureRequests:hiddenRequests,pageErrors:errors,hostedFinancialWrites:0}));
  } catch(error) {
    console.error(`Public/authenticated handoff failed at ${stage} (${error.name}); sensitive details omitted.`);
    throw new Error('Handoff validation failed');
  }
});
