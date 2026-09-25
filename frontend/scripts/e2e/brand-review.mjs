// 3U-G.1 identity/catalogue QA. Dedicated auth, local fixtures, no holdings writes.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';

const output='/tmp/arbor-3ug1-identities';await mkdir(output,{recursive:true});
await withAuthenticatedBrowser(async({page})=>{
  let stage='guard',shots=0,errors=0;
  page.on('pageerror',()=>errors++);
  page.on('console',m=>{if(m.type()==='error')errors++;});
  try {
    await page.locator('.app-shell').waitFor();
    await page.getByRole('region',{name:'What should I do next?'}).getByRole('button').waitFor();
    const access=page.waitForResponse(r=>new URL(r.url()).pathname==='/account/entitlements'&&r.request().method()==='GET');
    stage='reload';await page.reload();const r=await access;
    stage='fixture response';assert.equal(r.status(),200);
    assert.equal(r.headers()['x-arbor-portfolio-fixture'],'isolated');
    assert.equal((await r.json()).availability.monthly_checkin,false);
    stage='appearance';await page.evaluate(()=>{location.hash='settings';});
    await page.getByRole('radio',{name:'System',exact:true}).check();
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    stage='catalogue';await page.evaluate(()=>{location.hash='portfolio';});
    const add=page.getByRole('button',{name:'+ Add Investment',exact:true});
    await add.click();
    const groups=page.getByRole('group',{name:'Investment categories'});
    for(const width of [390,320])for(const theme of ['light','dark']){
      stage=`${width}-${theme}`;
      await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
      for(const [label,count] of [['All',12],['Funds',6],['ETFs',3],['Bitcoin',3]]){
        await groups.getByRole('button',{name:label,exact:true}).click();
        assert.equal(await page.locator('.catalogue-row').count(),count);
        for(const img of await page.getByRole('dialog').locator('img').all())await img.evaluate(e=>e.decode());
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.getByRole('dialog').screenshot({path:`${output}/catalogue-${label.toLowerCase()}-${width}-${theme}.png`,animations:'disabled'});shots++;
      }
    }
    stage='search';
    await groups.getByRole('button',{name:'All',exact:true}).click();
    await page.getByRole('searchbox',{name:'Search investments'}).fill('DragonFi');
    assert.equal(await page.locator('.catalogue-row').count(),3);
    const row=page.locator('.catalogue-row').first();
    assert.equal(await row.locator('[data-identity="bpi"] img').count(),1);
    stage='image failure';
    await row.locator('[data-identity="bpi"] img').dispatchEvent('error');
    await row.locator('[data-identity="bpi"][data-logo="false"]').waitFor();
    assert.equal(await row.locator('[data-identity="bpi"]').getAttribute('data-logo'),'false');
    assert.ok((await row.innerText()).includes('BPI Global Equity'));
    assert.ok((await row.innerText()).includes('DragonFi'));
    stage='escape';await groups.getByRole('button',{name:'All',exact:true}).focus();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.waitForFunction(e=>e===document.activeElement,await add.elementHandle());
    stage='console';assert.equal(errors,0);
    console.log(JSON.stringify({shots,filters:true,search:true,imageFallback:true,escapeFocus:true,errors,holdingsWrites:0}));
  }catch(error){console.error(JSON.stringify({stage,type:error.name,navigationInterrupted:/interrupted|ERR_ABORTED/.test(error.message),timeout:/Timeout/.test(error.message)}));throw new Error('Identity QA failed');}
});
