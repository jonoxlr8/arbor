// Local disposable-account QA only. No profile writes, recordings or token output.
import assert from 'node:assert/strict';
import {withAuthenticatedBrowser} from './auth.mjs';

const mode = process.argv[2] ?? 'plus_trial';
if (!['free','plus_trial','plus_active','expired_plus'].includes(mode)) throw new Error('Unknown QA mode');
const exhausted = process.argv.includes('--exhausted');
const plus = mode.startsWith('plus_');
await withAuthenticatedBrowser(async ({page,context,reused}) => {
  page.setDefaultTimeout(12000);
  let pageErrors=0, consoleErrors=0, authorization, api;
  const network=[];
  page.on('pageerror',()=>pageErrors++);
  page.on('console',message=>{if(message.type()==='error')consoleErrors++;});
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.pathname==='/account/entitlements' && ['127.0.0.1','localhost'].includes(url.hostname)) {
      authorization=request.headers().authorization;api=url.origin;
    }
  });
  page.on('response',response=>{
    const path=new URL(response.url()).pathname;
    if(['/account/entitlements','/v2/next-action','/chat'].includes(path))network.push([path,response.status()]);
  });
  // Reload after listeners are installed; capture only normal owner-scoped auth in memory.
  await page.reload();
  await page.getByRole('region',{name:'What should I do next?'}).waitFor();
  await page.evaluate(()=>{location.hash='settings';});
  await page.getByRole('heading',{name:'Compare Arbor plans'}).waitFor();
  assert.ok(authorization && api,'Normal authenticated account request must occur');
  const expected=mode==='plus_trial'?'Arbor Plus — Private Beta':plus?'Arbor Plus':'Arbor Free';
  await page.getByText(`Current plan: ${expected}`,{exact:true}).waitFor();
  console.log('Verified account status.');
  const account=await context.request.get(`${api}/account/entitlements?tier=plus&user_id=ignored`,{headers:{Authorization:authorization}});
  assert.equal(account.status(),200);
  assert.equal((await account.json()).effective_tier,plus?'plus':'free');
  const layouts=[];
  for(const width of [1440,390,320])for(const theme of ['Light','Dark']) {
    await page.setViewportSize({width,height:950});
    await page.getByRole('radio',{name:theme,exact:true}).check();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow at ${width}/${theme}`);
    layouts.push(`${width}/${theme}`);
    if(width===390)await page.locator('section[aria-labelledby="compare-plans-title"]').screenshot({path:`/tmp/arbor-3ua-${mode}-${theme}.png`});
  }
  console.log('Verified responsive themes.');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{location.hash='home';});
  await page.getByRole('button',{name:plus?'Review contribution':'Explore Arbor Plus',exact:true}).click();
  if(!plus)await page.getByRole('heading',{name:'Compare Arbor plans'}).waitFor();
  console.log('Verified next-action destination.');
  await page.evaluate(()=>{location.hash='portfolio';});
  if(plus)await page.getByRole('heading',{name:'Contribution scenarios',exact:true}).waitFor();
  else {
    await page.getByRole('heading',{name:'Monthly Contribution Planner',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Contribution amount').count(),0);
    // A browser UI change cannot grant server access, even with forged tier fields.
    for(const path of ['/contributions/plan','/contributions/recommendation']) {
      const response=await context.request.post(`${api}${path}`,{headers:{Authorization:authorization},data:{tier:'plus'}});
      assert.equal(response.status(),403);
    }
  }
  console.log('Verified contribution access.');
  await page.evaluate(()=>{location.hash='plan';});
  await page.getByRole('button',{name:'Edit investment profile',exact:true}).click();
  if(!plus)await page.getByRole('heading',{name:'Review and rebuild your investment profile',exact:true}).waitFor();
  else await page.getByRole('button',{name:'Cancel editing',exact:true}).waitFor();
  console.log('Verified profile edit access.');
  await page.getByRole('button',{name:plus?'Cancel editing':'Back to your plan',exact:true}).click();
  await page.evaluate(()=>{location.hash='ask';});
  const question=page.getByRole('textbox',{name:'Your question about your Arbor plan'});
  await question.waitFor();
  if(exhausted) {
    await page.getByText('You’ve used your Free Ask Arbor questions for this month.',{exact:true}).waitFor();
    assert.equal(await question.isDisabled(),true);
    const response=await context.request.post(`${api}/chat`,{headers:{Authorization:authorization},data:{message:'Explain my plan'}});
    assert.equal(response.status(),429);
  } else if(plus) {
    await question.fill('What subscription plan am I on?');
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/chat' && r.request().method()==='POST');
    await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();
    assert.equal((await response).status(),200);
    await page.getByText(plus && mode==='plus_trial'?/You’re currently on Arbor Plus — Private Beta/:/Your account has Arbor Plus access/).waitFor();
  } else {
    await page.getByText('Ask Arbor usage is temporarily unavailable. Your saved plan remains accessible.',{exact:true}).waitFor();
    const response=await context.request.post(`${api}/chat`,{headers:{Authorization:authorization},data:{message:'Explain my plan'}});
    assert.equal(response.status(),503); // Honest missing-migration condition.
  }
  assert.equal(pageErrors,0);assert.equal(consoleErrors,0);
  console.log(JSON.stringify({mode,exhausted,reused,layouts,pageErrors,consoleErrors,network,profileWrites:0}));
});
