// Capture actual, unchanged app UI for the public website. Local fixtures only.
// No customer data, raw network logs, fabricated performance or hosted writes.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import {withAuthenticatedBrowser} from './auth.mjs';

const output = 'public/product';
await mkdir(output, {recursive:true});
await withAuthenticatedBrowser(async ({page}) => {
  let stage = 'local fixture';
  const go = async hash => page.evaluate(hash => {location.hash = hash;}, hash);
  const read = () => page.waitForResponse(r => new URL(r.url()).pathname === '/v2/portfolio' && r.request().method() === 'GET');
  const add = () => page.getByRole('button', {name:'+ Add Investment',exact:true}).first();
  const capture = async (name, locator) => {
    const png = await locator.screenshot({animations:'disabled'});
    const {width,height} = await sharp(png).metadata();
    await sharp(png).webp({quality:85}).toFile(`${output}/${name}.webp`);
    if(name==='home')await sharp(png).png({compressionLevel:9}).toFile(`${output}/home-social.png`);
    console.log(JSON.stringify({asset:name,width,height}));
  };
  try {
    await page.route('**/profiles/me', async route => {
      const response = await route.fetch();
      const data = await response.json();
      assert.ok(data.profile, 'Expected V2 plan');
      data.profile.full_name = 'Alex';
      await route.fulfill({response,json:data});
    });
    await page.reload();
    await page.getByRole('heading',{name:'Hello, Alex.'}).waitFor();
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
    await go('settings'); await page.getByRole('radio',{name:'System',exact:true}).check();
    const initial = read(); await go('portfolio'); const response = await initial;
    assert.equal(response.headers()['x-arbor-portfolio-fixture'],'isolated');
    assert.equal((await response.json()).holdings.length,0,'Do not overwrite existing fixture data');
    stage = 'create local examples';
    for (const [id,label,value] of [['gcash_global_equity','Current value (PHP)','8000'],['gotrade_vt','Shares','1'],['pdax_btc','Bitcoin amount (BTC)','0.001']]) {
      await add().click(); await page.locator(`.catalogue-row[data-product="${id}"]`).click();
      await page.getByLabel(label,{exact:true}).fill(value);
      const saved = read(); await page.getByRole('button',{name:'Save Investment',exact:true}).click(); await saved; await add().waitFor();
    }
    stage = 'home'; await page.setViewportSize({width:1280,height:900}); await go('home');
    await page.getByText('₱16,600',{exact:true}).waitFor();
    await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
    await capture('home', page.locator('.app-shell'));
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/arbor-3uf/home-mobile-source.png',animations:'disabled'});
    await sharp('/tmp/arbor-3uf/home-mobile-source.png').webp({quality:85}).toFile(`${output}/home-mobile.webp`);
    await page.setViewportSize({width:1280,height:900});
    stage = 'portfolio'; await go('portfolio'); await page.locator('.holding-row').first().waitFor();
    // Element screenshots preserve actual UI; no synthetic chart history.
    await capture('holdings', page.locator('#section-holdings'));
    await page.setViewportSize({width:390,height:950});
    await capture('holdings-mobile',page.locator('#section-holdings'));
    await page.setViewportSize({width:1280,height:900});
    await page.getByRole('button',{name:'Allocation',exact:true}).click();
    await capture('allocation', page.getByLabel('Current allocation',{exact:true}));
    await page.setViewportSize({width:390,height:950});
    await capture('allocation-mobile',page.getByLabel('Current allocation',{exact:true}));
    await page.setViewportSize({width:1280,height:900});
    stage = 'contribution'; await go('portfolio/contribution');
    await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('5000');
    await page.getByRole('button',{name:/Gotrade Access supported/}).click();
    await page.getByRole('button',{name:'Preview contribution',exact:true}).click();
    await page.getByRole('heading',{name:'Choose where to invest',exact:true}).waitFor();
    for (const option of await page.getByRole('checkbox',{name:/Use /}).all()) await option.check();
    await page.getByRole('button',{name:'Use these options in my preview',exact:true}).click();
    await page.setViewportSize({width:500,height:900});
    await capture('contribution', page.getByRole('region',{name:'Contribution result'}));
    stage = 'ask'; await page.setViewportSize({width:390,height:1050}); await go('ask');
    await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill('What is my current portfolio worth?');
    await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();
    await page.getByText(/16,600.00/).waitFor();
    await capture('ask',page.locator('#app-content'));
    stage = 'catalogue'; await go('portfolio'); await add().click();
    await page.locator('.catalogue-row[data-product="gcash_global_equity"]').click();
    await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
    await capture('fund-value',page.getByRole('dialog')); await page.keyboard.press('Escape');
    stage = 'cleanup';
    while (await page.locator('.holding-row').count()) {
      await page.locator('.holding-row').first().click(); await page.getByRole('dialog').getByRole('button',{name:/^Remove /}).click();
      const removed=read(); await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click(); await removed; await add().waitFor();
    }
    assert.equal(await page.locator('.holding-row').count(),0);
    console.log('Neutral local screenshots captured; zero remaining fixture holdings; no hosted writes.');
  } catch {
    console.error(`Marketing capture stopped at ${stage}; sensitive details omitted.`);
    throw new Error('Capture failed');
  }
});
