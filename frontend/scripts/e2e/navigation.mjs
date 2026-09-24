// Normal disposable authentication; enabled mode requires the isolated local store.
import assert from 'node:assert/strict';
import {withAuthenticatedBrowser} from './auth.mjs';
const enabled=process.env.ARBOR_NAV_E2E_LIVE==='true';
await withAuthenticatedBrowser(async({page,reused})=>{
 let stage='navigation',errors=0,portfolioRequests=0;
 page.setDefaultTimeout(20000);
 // The Next development indicator overlaps the first bottom-nav item at 390px.
 // Hide only this local dev overlay, not application content.
 await page.addStyleTag({content:'nextjs-portal { display: none !important; }'});
 page.on('pageerror',()=>errors++);
 page.on('console',m=>{if(m.type()==='error')errors++;});
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/v2/portfolio'))portfolioRequests++;});
 async function go(id){await page.evaluate(id=>{location.hash=id;},id);await page.locator('h1').waitFor();}
 try {
  await go('home');
  await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
  const layouts=[];
  for(const width of [1440,768,390,320])for(const theme of ['Light','Dark']){
   stage=`navigation ${width}/${theme}`;
   await page.setViewportSize({width,height:900});await go('settings');
   await page.getByRole('radio',{name:theme,exact:true}).check();
   const nav=page.getByRole('navigation',{name:width>=1024?'Primary navigation':'Mobile navigation',exact:true});
   assert.deepEqual(await nav.getByRole('link').allTextContents(),['Home','Portfolio','Ask Arbor','Settings']);
   for(const label of ['Home','Portfolio','Ask Arbor','Settings','Home']){
    stage=`navigation ${width}/${theme}/${label}`;
    await nav.getByRole('link',{name:label,exact:true}).click();
    await page.waitForFunction(label=>document.querySelector('nav a[aria-current="page"]')?.textContent===label,label,{timeout:10000});
    assert.equal(await nav.getByRole('link',{name:label,exact:true}).getAttribute('aria-current'),'page');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${theme}/${label}`);
   }
   layouts.push(`${width}/${theme}`);
   if(width===390){await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();await page.screenshot({path:`/tmp/arbor-3uc-home-${theme}.png`,fullPage:true});}
  }
  stage='back forward';await go('portfolio');await page.getByRole('heading',{name:'Your model targets'}).waitFor();await go('settings');await page.getByRole('heading',{name:'Investment Profile',exact:true}).waitFor();await page.goBack();await page.getByRole('heading',{name:'Your model targets'}).waitFor();await page.goForward();await page.getByRole('heading',{name:'Investment Profile',exact:true}).waitFor();
  stage='profile cancel';await page.getByRole('button',{name:'Edit investment profile',exact:true}).click();await page.getByRole('heading',{name:'Review your investment profile',exact:true}).waitFor();await page.getByRole('button',{name:'Cancel editing',exact:true}).click();
  await page.getByRole('heading',{name:'Compare Arbor plans'}).waitFor();
  stage='chat';await go('ask');
  assert.equal(await page.getByRole('button',{name:'What is my current portfolio worth?',exact:true}).count(),enabled?1:0);
  for(const question of ['What should I do next?','Write Python for me']){
   await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill(question);
   const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/chat');
   await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();const response=await reply;assert.equal(response.status(),200);
   if(question.includes('Python'))assert.match((await response.json()).reply,/here to help/);
  }
  await go('home');await go('ask');await page.getByText('Write Python for me',{exact:true}).waitFor();
  if(enabled){
   stage='fixture manual holding';const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio');await go('portfolio');const response=await loaded;assert.equal(response.headers()['x-arbor-portfolio-fixture'],'isolated');assert.equal((await response.json()).holdings.length,0);
   await page.getByRole('button',{name:'Add holding',exact:true}).click();await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('gcash');await page.getByRole('combobox',{name:'Investment',exact:true}).selectOption('gcash_global_equity');await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');await page.getByRole('button',{name:'Save holding record',exact:true}).click();assert.equal((await(await saved).json()).total_value_php,'8000.00');await page.getByText(/Updated by you/).waitFor();
   await go('home');await page.getByText('₱8,000',{exact:true}).first().waitFor();await page.getByRole('heading',{name:'Portfolio value over time'}).waitFor();
   await go('portfolio');await page.getByRole('heading',{name:'Plan Alignment'}).waitFor();await page.screenshot({path:'/tmp/arbor-3uc-portfolio.png',fullPage:true});
   stage='cleanup';await page.getByRole('button',{name:/^Remove ATRAM/}).click();const clean=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();assert.equal((await(await clean).json()).holdings.length,0);
  }else{
   stage='next action contribution link';await go('home');await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').click();await page.getByLabel('Contribution amount (PHP)',{exact:true}).waitFor();
   assert.equal(portfolioRequests,0);assert.equal(await page.getByRole('button',{name:'Add holding',exact:true}).count(),0);
  }
  assert.equal(errors,0);
  console.log(JSON.stringify({enabled,reused,layouts,errors,portfolioRequests,hostedWrites:0}));
 }catch(e){await page.screenshot({path:'/tmp/arbor-3uc-failure.png',fullPage:true});console.error(`Navigation QA failed at ${stage}: ${e.name}`);throw new Error('Navigation QA failed; credentials and payloads omitted');}
});
