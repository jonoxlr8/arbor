// Public-only browser QA. No credentials, account creation, or hosted writes.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.ARBOR_PUBLIC_QA_URL ?? 'http://localhost:3000';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local validation only');
const output='/tmp/arbor-3uf'; await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
let shots=0,errors=0,consoleErrors=0,forbiddenRequests=0,stage='load';
const page=await browser.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror',()=>errors++);
page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
page.on('request',r=>{if(/\/v2\/(portfolio|monthly)/.test(r.url()))forbiddenRequests++;});
const capture=async(name,locator=page)=>{
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow ${name}`);
  await page.evaluate(()=>{if(document.activeElement?.classList.contains('m-skip'))document.activeElement.blur();});
  await locator.screenshot({path:`${output}/${name}.png`,fullPage:locator===page&&!name.startsWith('menu'),animations:'disabled',style:locator===page?'':'.m-header,.m-skip{visibility:hidden!important}'});shots++;
};
const imagesReady=async()=>{
  for(const image of await page.locator('.marketing-site img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async e=>{await e.decode();});
  }
};
try {
  for(const width of [1440,1024,768,390,320]) for(const theme of ['light','dark']) {
    stage=`${width}-${theme}`;
    await page.setViewportSize({width,height:960});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
    await page.goto(base);await page.locator('.marketing-site').waitFor();
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    assert.equal(await page.locator('h1').count(),1);
    await imagesReady();await page.evaluate(()=>scrollTo(0,0));
    await capture(`homepage-${width}-${theme}`);
    if([1440,390].includes(width)){
      for(const [name,selector] of [['hero','.m-hero'],['portfolio','#product-portfolio'],['monthly','#monthly-contribution'],['ask','#ask-arbor'],['pricing','#pricing'],['faq','#faq'],['footer','.m-footer']]) await capture(`${name}-${width}-${theme}`,page.locator(selector));
    }
    if(width<=900){
      await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Open menu'}).click();
      assert.equal(await page.getByRole('button',{name:'Close menu'}).getAttribute('aria-expanded'),'true');
      if(width===390)await capture(`menu-390-${theme}`);
      await page.keyboard.press('Escape');assert.ok(await page.getByRole('button',{name:'Open menu'}).evaluate(e=>e===document.activeElement));
      await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('navigation',{name:'Public navigation'}).getByRole('link',{name:'Pricing',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Open menu'}).getAttribute('aria-expanded'),'false');
    }
    // Native details are keyboard operable and leave no inaccessible FAQ content.
    const question=page.locator('#faq summary').first();await question.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#faq details').first().getAttribute('open'),'');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#faq details').first().getAttribute('open'),null);
    for(const link of await page.locator('a[href^="#"]').all()){
      const id=(await link.getAttribute('href')).slice(1);
      if(!['signup','login','welcome'].includes(id))assert.equal(await page.locator(`[id="${id}"]`).count(),1);
    }
  }
  stage='auth entry';await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'light'});await page.goto(base);
  await page.getByRole('link',{name:/Get started free/}).first().click();await page.getByRole('heading',{name:'Create your Arbor account'}).waitFor();
  assert.equal(await page.getByLabel('Email address',{exact:true}).count(),1);assert.equal(await page.getByLabel('Password',{exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).isDisabled(),true);await capture('signup-390');
  await page.getByRole('link',{name:'Already have an account? Log in'}).click();await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);await capture('signin-390');
  await page.getByRole('link',{name:'Forgot password?'}).click();assert.ok(page.url().includes('/forgot-password'));
  await page.goto(`${base}/#faq`);await page.locator('#faq').waitFor();
  await page.waitForFunction(()=>document.querySelector('#faq').getBoundingClientRect().top<150);
  stage='SEO';const response=await page.request.get(base);const source=await response.text();
  assert.ok(source.includes('Invest with clarity.'));assert.ok(source.includes('https://arbor.ph'));
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://arbor.ph');
  const og=await page.locator('meta[property="og:image"]').getAttribute('content');assert.ok(og);
  const ogPath=new URL(og).pathname;const social=await page.request.get(`${base}${ogPath}`);assert.equal(social.status(),200);assert.match(social.headers()['content-type'],/image\/png/);
  assert.equal((await page.request.get(`${base}/sitemap.xml`)).status(),200);
  assert.equal((await page.request.get(`${base}/robots.txt`)).status(),200);
  stage='reduced motion';assert.equal(await page.locator('.m-button').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  assert.equal(errors,0);assert.equal(consoleErrors,0);assert.equal(forbiddenRequests,0);
  console.log(JSON.stringify({layouts:10,shots,pageErrors:errors,consoleErrors,hiddenFeatureRequests:forbiddenRequests,authEntry:true,menuEscape:true,faqKeyboard:true,deepLink:true,seo:true,reducedMotion:true,hostedWrites:0}));
} catch(error) {
  await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{});
  console.error(`Public QA failed at ${stage}: ${error.message}`);process.exitCode=1;
} finally {await browser.close();}
