// Public-only local browser QA. Never creates accounts or sends financial writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.ARBOR_PUBLIC_QA_URL ?? 'http://127.0.0.1:3111';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local validation only');
const output=process.env.ARBOR_PUBLIC_QA_OUTPUT ?? '/private/tmp/arbor-polish-after'; await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
let errors=0,consoleErrors=0,externalRequests=0,failedRequests=0,badResponses=0,stage='load';
const shots=[];
const context=await browser.newContext({reducedMotion:'reduce'});
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin===new URL(base).origin)return route.continue();
  externalRequests++;return route.abort();
});
const page=await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror',()=>errors++);
page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
page.on('requestfailed',()=>failedRequests++);
page.on('response',r=>{if(r.status()>=400)badResponses++;});
const capture=async(name,locator=page,fullPage=locator===page)=>{
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow ${name}`);
  await page.evaluate(()=>{if(document.activeElement?.classList.contains('m-skip'))document.activeElement.blur();});
  const file=`${output}/${name}.png`;
  const style='nextjs-portal,.m-skip{visibility:hidden!important}'+(locator===page?'':'.m-header{visibility:hidden!important}');
  await locator.screenshot({path:file,fullPage,animations:'disabled',style});
  shots.push(file);
};
const imagesReady=async()=>{
  for(const image of await page.locator('.marketing-site img:visible').all()){
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(e=>e.complete&&e.naturalWidth>0,await image.elementHandle());
  }
};
try{
  for(const [width,theme] of [[1440,'light'],[1024,'light'],[768,'light'],[390,'light'],[320,'light'],[1920,'light'],[1024,'dark'],[390,'dark']]){
    stage=`${width}-${theme}`;
    await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
    await page.goto(base);await page.locator('.marketing-site').waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('main').count(),1);
    assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);
    const before=await page.locator('#how-it-works').boundingBox();
    await imagesReady();await page.evaluate(()=>scrollTo(0,0));
    const after=await page.locator('#how-it-works').boundingBox();
    assert.ok(Math.abs(before.y-after.y)<2,'image loading must not shift following content');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow ${stage}`);
    for(const image of await page.locator('img:visible').all())assert.ok(await image.getAttribute('alt'));
    if(width===1440&&theme==='light'||width===390&&theme==='light'){
      await capture(`homepage-${width}-${theme}`);
      for(const [name,selector] of [['hero','.m-hero'],['portfolio','#features'],['monthly','#arbor-plus'],['learn','#learn']])
        await capture(`${name}-${width}`,page.locator(selector));
      if(width===390){await capture('cta-mobile',page.locator('.m-final'));await capture('footer-mobile',page.locator('.m-footer'));}
    }else if(theme==='dark')await capture(`hero-${width}-dark`,page.locator('.m-hero'));
    if(width<=900){
      await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Open menu'}).click();
      assert.equal(await page.getByRole('button',{name:'Close menu'}).getAttribute('aria-expanded'),'true');
      assert.ok(await page.getByRole('navigation',{name:'Public navigation'}).getByRole('link').first().evaluate(e=>e===document.activeElement));
      await page.keyboard.press('Escape');assert.ok(await page.getByRole('button',{name:'Open menu'}).evaluate(e=>e===document.activeElement));
      await page.getByRole('button',{name:'Open menu'}).click();
      await page.getByRole('navigation',{name:'Public navigation'}).getByRole('link',{name:'Learn',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Open menu'}).getAttribute('aria-expanded'),'false');
      await page.waitForFunction(()=>document.querySelector('#learn').getBoundingClientRect().top<150);
      await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Open menu'}).click();
      await page.mouse.click(10,900);
      assert.equal(await page.getByRole('button',{name:'Open menu'}).getAttribute('aria-expanded'),'false');
    }
    const question=page.locator('#faq summary').first();await question.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#faq details').first().getAttribute('open'),'');
    await page.keyboard.press('Enter');assert.equal(await page.locator('#faq details').first().getAttribute('open'),null);
    for(const link of await page.locator('a[href^="#"]').all()){
      const id=(await link.getAttribute('href')).slice(1);assert.ok(id);
      if(!['signup','login','welcome'].includes(id))assert.equal(await page.locator(`[id="${id}"]`).count(),1);
    }
    assert.equal(await page.locator('.m-button').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  }
  stage='all CTAs';
  await page.setViewportSize({width:1440,height:950});await page.emulateMedia({colorScheme:'light'});
  // Exercise each of the header, hero and final account-creation actions.
  for(let index=0;index<3;index++){
    await page.goto(base);await page.locator('.marketing-site').waitFor();
    await page.getByRole('link',{name:/Get started/}).nth(index).click();
    await page.getByRole('heading',{name:'Create your Arbor account'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).isDisabled(),true);
    await page.getByRole('link',{name:'Already have an account? Log in'}).click();
    await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  }
  await page.goto(base);await page.getByRole('link',{name:'Sign in',exact:true}).first().click();
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  await page.getByRole('link',{name:'Forgot password?'}).click();assert.ok(page.url().includes('/forgot-password'));
  stage='all sign-in destinations';
  for(let index=0;index<3;index++){
    await page.goto(base);await page.locator('.marketing-site').waitFor();
    await page.locator('a[href="#login"]:visible').nth(index).click();
    await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  }
  await page.setViewportSize({width:390,height:950});await page.goto(base);
  await page.getByRole('button',{name:'Open menu'}).click();
  await page.getByRole('navigation',{name:'Public navigation'}).getByRole('link',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  stage='anchors';
  await page.goto(base);await page.getByRole('link',{name:/See how Arbor works/}).click();
  await page.waitForFunction(()=>document.querySelector('#how-it-works').getBoundingClientRect().top<150);
  await page.setViewportSize({width:1440,height:950});await page.goto(base);
  for(const id of ['how-it-works','features','arbor-plus','learn','faq']){
    await page.locator(`#public-navigation a[href="#${id}"]`).click();
    await page.waitForFunction(id=>document.getElementById(id).getBoundingClientRect().top<150,id);
    assert.equal(new URL(page.url()).hash,`#${id}`);
  }
  await page.goto(`${base}/#faq`);await page.locator('#faq').waitFor();
  await page.waitForFunction(()=>document.querySelector('#faq').getBoundingClientRect().top<150);
  stage='public information';
  for(const width of [320,390,768,1024,1440,1920])for(const theme of (width===390?['light','dark']:['light'])){
    await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme});
    for(const route of ['privacy','terms','investment-disclosures']){
      await page.goto(base);await page.locator(`.m-footer a[href="/${route}"]`).click();
      await page.locator('.m-information').waitFor();
      assert.equal(new URL(page.url()).pathname,`/${route}`);
      assert.equal(await page.locator('h1').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok(await page.locator('main section').count()>=5);
      if(width===390||width===1440)await capture(`${route}-${width}-${theme}`);
      await page.getByRole('link',{name:'Back to Arbor',exact:true}).click();await page.locator('.m-hero').waitFor();
    }
  }
  // Each visible footer destination and support address is grounded locally.
  await page.goto(base);assert.equal(await page.locator('.m-footer a[href="mailto:support@arbor.ph"]').count(),1);
  stage='SEO';
  const response=await page.request.get(base);const source=await response.text();
  assert.ok(source.includes('Invest with a plan'));assert.ok(source.includes('https://arbor.ph'));
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://arbor.ph');
  assert.match(await page.title(),/Invest with a plan you understand/);
  assert.equal(await page.locator('meta[name="twitter:card"]').getAttribute('content'),'summary_large_image');
  const og=await page.locator('meta[property="og:image"]').getAttribute('content');assert.ok(og);
  const social=await page.request.get(`${base}${new URL(og).pathname}`);
  assert.equal(social.status(),200);assert.match(social.headers()['content-type'],/image\/png/);
  await writeFile(`${output}/open-graph.png`,await social.body());shots.push(`${output}/open-graph.png`);
  assert.equal((await page.request.get(`${base}/sitemap.xml`)).status(),200);
  assert.equal((await page.request.get(`${base}/robots.txt`)).status(),200);
  assert.equal(errors,0);assert.equal(consoleErrors,0);assert.equal(externalRequests,0);assert.equal(failedRequests,0);assert.equal(badResponses,0);
  await writeFile(`${output}/results.json`,JSON.stringify({layouts:8,informationLayouts:21,pageErrors:errors,consoleErrors,externalRequests,failedRequests,badResponses,hostedWrites:0},null,2));
  console.log(JSON.stringify({layouts:8,informationLayouts:21,screenshots:shots,pageErrors:errors,consoleErrors,externalRequests,failedRequests,badResponses,authEntry:true,allStartCTAs:true,menuEscape:true,menuOutsideClose:true,faqKeyboard:true,deepLink:true,seo:true,reducedMotion:true,imageLayoutStable:true,hostedWrites:0}));
}catch(error){
  await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{});
  console.error(`Public QA failed at ${stage}: ${error.message}`);process.exitCode=1;
}finally{await browser.close();}
