// Capture final product UI for the public website. Completion fixture only.
// No customer data, raw network logs, fabricated performance or hosted writes.
import assert from 'node:assert/strict';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {withAuthenticatedBrowser} from './auth.mjs';

// Version the output path so Next's image cache cannot serve an older milestone.
const output = 'public/product/premium';
const finish = process.argv.includes('--finish');
await mkdir(output, {recursive:true});
await mkdir('/tmp/arbor-premium',{recursive:true});
await withAuthenticatedBrowser(async ({page,context}) => {
  let stage = 'local fixture';
  let pageErrors=0,blockedWrites=0;
  page.on('pageerror',()=>pageErrors++);
  await context.route('**/rest/v1/**',async route=>{
    if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){blockedWrites++;await route.abort('blockedbyclient');return;}
    await route.continue();
  });
  const go = async hash => {
    await page.evaluate(hash => {location.hash = hash;}, hash);
    await page.waitForFunction(hash=>location.hash===`#${hash}`&&[...document.querySelectorAll('nav a[aria-current="page"]')].some(a=>a.getAttribute('href')===`#${hash.split('/')[0]}`),hash);
  };
  const read = () => page.waitForResponse(r => new URL(r.url()).pathname === '/v2/portfolio' && r.request().method() === 'GET');
  const add = () => page.getByRole('button', {name:'+ Add Investment',exact:true}).first();
  const readyImages = async locator => {
    await locator.locator('img').evaluateAll(images=>images.forEach(image=>{image.loading='eager';}));
    await page.locator('.app-shell img,dialog[open] img').evaluateAll(images=>images.forEach(image=>{image.loading='eager';}));
    await page.waitForFunction(()=>[...document.querySelectorAll('.app-shell img,dialog[open] img')].every(image=>image.complete&&image.naturalWidth>0),null,{timeout:20000});
    await page.evaluate(()=>document.fonts.ready);
  };
  const capture = async (name, locator) => {
    stage = `capture ${name}`;
    await page.mouse.move(0,0);
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
    assert.doesNotMatch(await locator.innerText(), /Codex|@|sb_secret_/i, 'Public artwork must not contain account identifiers');
    await readyImages(locator);
    const png = await locator.screenshot({animations:'disabled',style:'.app-shell nav[aria-label="Mobile navigation"]{visibility:hidden!important}'});
    const {width,height} = await sharp(png).metadata();
    await sharp(png).png().toFile(`/tmp/arbor-premium/${name}.png`);
    await sharp(png).webp({quality:85}).toFile(`${output}/${name}.webp`);
    if(name==='home')await sharp(png).png({compressionLevel:9}).toFile(`${output}/home-social.png`);
    console.log(JSON.stringify({asset:name,width,height}));
  };
  const viewport = async name => {
    await page.mouse.move(0,0);
    await page.evaluate(()=>scrollTo(0,0));
    assert.doesNotMatch(await page.locator('.app-shell').innerText(),/Codex|@|sb_secret_/i);
    await readyImages(page.locator('.app-shell'));
    const png=await page.screenshot({animations:'disabled'});
    await sharp(png).png().toFile(`/tmp/arbor-premium/${name}.png`);
    await sharp(png).webp({quality:85}).toFile(`${output}/${name}.webp`);
    if(name==='home')await sharp(png).png({compressionLevel:9}).toFile(`${output}/home-social.png`);
    console.log(JSON.stringify({asset:name,...page.viewportSize()}));
  };
  try {
    assert.ok(['localhost','127.0.0.1'].includes(new URL(page.url()).hostname),'Only local app captures are permitted');
    const restored=page.waitForResponse(r=>new URL(r.url()).pathname==='/profiles/me'&&r.request().method()==='GET');
    await page.reload();
    const profileResponse=await restored;
    assert.equal(profileResponse.headers()['x-arbor-completion-fixture'],'isolated','Hosted profile writes are prohibited');
    const startingProfile=await profileResponse.json();
    assert.equal(startingProfile.profile?.full_name,'Alex','Neutral completion fixture identity required');
    await page.getByRole('heading',{name:'Hello, Alex.'}).waitFor();
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
    await go('settings'); await page.getByRole('radio',{name:'System',exact:true}).check();
    if(finish){
      const existing=read();await go('portfolio');const response=await existing;
      assert.equal(response.headers()['x-arbor-completion-fixture'],'isolated');
      const portfolio=await response.json();
      assert.deepEqual(portfolio.holdings.map(row=>row.product_id).sort(),['gcash_global_equity','gotrade_vgt','gotrade_vt','pdax_btc']);
      assert.equal(Number(portfolio.total_value_php),161400,'Resume only the known local marketing example');
    }else{
    stage='choose illustrative plan';
    await page.getByRole('button',{name:/Change Plan/}).click();
    await page.getByRole('button',{name:/^Aggressive/}).click();
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.getByRole('group',{name:/Technology Optional/}).getByRole('radio',{name:'10%',exact:true}).check();
    await page.getByRole('group',{name:/Bitcoin Optional/}).getByRole('radio',{name:'10%',exact:true}).check();
    await page.setViewportSize({width:390,height:950});
    await page.getByRole('button',{name:'Review my plan',exact:true}).click();
    await page.getByText('80%',{exact:true}).waitFor();
    const confirmed=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/profiles/me'&&r.request().method()==='PUT');
    await page.getByRole('button',{name:'Use this as my plan',exact:true}).click();
    assert.equal((await confirmed).status(),200);
    await page.getByRole('button',{name:/Change Plan/}).waitFor();
    const initial = read(); await go('portfolio'); const response = await initial;
    assert.equal(response.headers()['x-arbor-completion-fixture'],'isolated');
    assert.equal(response.headers()['x-arbor-portfolio-fixture'],'isolated');
    assert.equal((await response.json()).holdings.length,0,'Do not overwrite existing fixture data');
    await page.getByRole('heading',{name:'Ways to invest',exact:true}).waitFor();
    for(const [sleeve,product] of [['global_equity','gotrade_vt'],['technology_tilt','gotrade_vgt'],['crypto','pdax_btc']]){
      const group=page.locator(`.implementation-sleeve[data-sleeve="${sleeve}"]`);
      await group.getByRole('button',{name:/Choose investment|^Change$/}).click();
      await page.getByRole('dialog').locator(`input[type="radio"][value="${product}"]`).check();
      const savedChoice=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/implementation-choices'&&r.request().method()==='PUT');
      await page.getByRole('dialog').getByRole('button',{name:/^Use /}).click();
      assert.equal((await savedChoice).status(),200);
      await page.getByRole('dialog').waitFor({state:'hidden'});
    }
    await page.setViewportSize({width:1280,height:950}); await viewport('ways');
    await page.setViewportSize({width:390,height:950}); await viewport('ways-mobile');
    stage = 'create local examples';
    for (const [id,label,value] of [['gcash_global_equity','Current value (PHP)','16000'],['gotrade_vt','Shares','15'],['gotrade_vgt','Shares','10'],['pdax_btc','Bitcoin amount (BTC)','0.0018']]) {
      await add().click(); await page.locator(`.catalogue-row[data-product="${id}"]`).click();
      await page.getByLabel(label,{exact:true}).fill(value);
      const saved = read(); await page.getByRole('button',{name:'Save Investment',exact:true}).click(); await saved; await add().waitFor();
    }
    }
    // Screenshot-only history: replace GET/snapshot responses in this isolated
    // browser. Never insert these demo observations into any data store.
    const history=[145000,147200,146100,150400,152200,151800,157800,161400].map((value,i)=>({day:new Date(Date.UTC(2026,7,8+i*7)).toISOString().slice(0,10),value_php:String(value),captured_at:new Date(Date.UTC(2026,7,8+i*7)).toISOString()}));
    await page.route('**/v2/portfolio',async route=>{
      assert.equal(route.request().method(),'GET');
      const response=await route.fetch();assert.equal(response.headers()['x-arbor-completion-fixture'],'isolated');
      await route.fulfill({response,json:{...await response.json(),history}});
    });
    await page.route('**/v2/portfolio/snapshot',route=>route.fulfill({json:{recorded:false,history}}));
    stage = 'home'; await page.setViewportSize({width:1280,height:1100}); await go('home');
    await page.locator('.home-portfolio > strong').filter({hasText:'₱161,400'}).waitFor();
    await page.locator('.recharts-area').waitFor();
    await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
    await viewport('home');
    await page.setViewportSize({width:390,height:844});
    await viewport('home-mobile');
    await page.setViewportSize({width:1280,height:1300});
    stage = 'portfolio'; await go('portfolio'); await page.locator('.holding-row').first().waitFor();
    await viewport('portfolio');
    // Element screenshots preserve actual UI; demo history exists only in this browser.
    await capture('holdings', page.locator('#section-holdings'));
    await page.setViewportSize({width:390,height:950});
    await viewport('portfolio-mobile');
    await capture('holdings-mobile',page.locator('#section-holdings'));
    await page.setViewportSize({width:1280,height:900});
    await page.getByRole('button',{name:'Allocation',exact:true}).click();
    await capture('allocation', page.getByLabel('Current allocation',{exact:true}));
    await page.setViewportSize({width:390,height:950});
    await capture('allocation-mobile',page.getByLabel('Current allocation',{exact:true}));
    await page.setViewportSize({width:1280,height:900});
    stage = 'contribution'; await go('home/monthly');
    await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('10000');
    await page.getByRole('button',{name:'Review contribution',exact:true}).click();
    await page.getByRole('region',{name:'Monthly investment breakdown'}).waitFor();
    for(const sleeve of ['global_equity','technology_tilt','crypto'])assert.equal(await page.locator(`.monthly-row[data-sleeve="${sleeve}"]`).count(),1);
    assert.ok(await page.locator('.monthly-provider').count()>0,'Chosen provider summary is visible');
    await page.setViewportSize({width:390,height:950});
    await capture('contribution',page.locator('.monthly-providers'));
    stage = 'ask'; await page.setViewportSize({width:390,height:1050}); await go('ask');
    await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill('What is my current portfolio worth?');
    await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();
    await page.getByText(/161,400.00/).waitFor();
    await capture('ask',page.locator('#app-content'));
    await page.setViewportSize({width:1440,height:950});await viewport('ask-desktop');
    stage = 'settings';await page.setViewportSize({width:390,height:844});await go('settings');
    await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();await viewport('settings');
    stage = 'catalogue'; await go('portfolio'); await add().click();
    const categories=page.getByRole('group',{name:'Investment categories'});
    for(const [label,count] of [['Funds',6],['ETFs',3],['Bitcoin',3],['All',12]]){
      await categories.getByRole('button',{name:label,exact:true}).click();
      assert.equal(await page.locator('.catalogue-row').count(),count);
    }
    await capture('catalogue',page.getByRole('dialog'));
    await page.locator('.catalogue-row[data-product="gcash_global_equity"]').click();
    await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
    await capture('fund-value',page.getByRole('dialog')); await page.keyboard.press('Escape');
    for(const width of [1440,390,320]) for(const theme of ['light','dark']) {
      await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
      for(const destination of ['home','portfolio','ask','settings']) {
        await go(destination);
        if(['home','portfolio'].includes(destination))await page.locator('.recharts-area').waitFor();
        if(destination==='home')await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
        await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
        await page.mouse.move(0,0);
        await page.screenshot({path:`/tmp/arbor-premium/${destination}-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
      }
    }
    stage = 'cleanup';
    await page.unroute('**/v2/portfolio');await page.unroute('**/v2/portfolio/snapshot');
    const cleanupRead=read();await go('portfolio');
    assert.equal((await (await cleanupRead).json()).holdings.length,4);
    await page.locator('.holding-row').first().waitFor();
    while (await page.locator('.holding-row').count()) {
      await page.locator('.holding-row').first().click(); await page.getByRole('dialog').getByRole('button',{name:/^Remove /}).click();
      const removed=read(); await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click(); await removed; await add().waitFor();
    }
    await page.getByRole('heading',{name:'Ways to invest',exact:true}).waitFor();
    assert.equal(await page.locator('.holding-row').count(),0);
    assert.equal(pageErrors,0,'No browser runtime errors');
    assert.equal(blockedWrites,0,'No attempted hosted database writes');
    const sizes={};
    for(const file of (await readdir(output)).filter(file=>file.endsWith('.webp')).sort()){
      const {width,height}=await sharp(`${output}/${file}`).metadata();sizes[file.replace('.webp','')]={width,height};
    }
    await writeFile(`${output}/sizes.json`,JSON.stringify(sizes,null,2)+'\n');
    console.log('Final product neutral screenshots captured; explicit 80/10/10 and provider choices verified; zero remaining fixture holdings; no hosted writes.');
  } catch(error) {
    await page.screenshot({path:'/tmp/arbor-marketing-capture-failure.png',animations:'disabled'});
    console.error(`Marketing capture stopped at ${stage} (${error.name}); sensitive details omitted.`);
    throw new Error('Capture failed');
  }
});
