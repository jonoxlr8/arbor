import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import {origin,setup,fixtureControls} from './ux-fixture.mjs';
const output='/tmp/arbor-ux-successor-chart-family';await mkdir(output,{recursive:true});const checked=[];let errors=0;
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>errors++);
 await page.goto(origin+'/#login');await page.getByLabel('Email address').fill('phase2b@example.test');await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 const graph=()=>page.getByRole('region',{name:'Portfolio value graph',exact:true});
 const read=()=>graph().evaluate(el=>({value:el.querySelector('.chart-value').textContent,gain:el.querySelector('.chart-gain').getAttribute('aria-label'),currency:el.dataset.currency,tone:el.dataset.gain,range:el.querySelector('.chart-range [aria-pressed="true"]').textContent,axes:[...el.querySelectorAll('.chart-extreme-text')].map(n=>n.textContent),stroke:el.querySelector('.recharts-area-curve')?.getAttribute('stroke-width'),line:el.querySelector('.recharts-area-curve')?.getAttribute('stroke'),controls:[...el.querySelectorAll('.chart-range button')].map(n=>n.textContent),touch:getComputedStyle(el.querySelector('.chart-plot')).touchAction,tooltip:el.querySelector('[role="tooltip"]')?.textContent??null}));
 for(const width of [390,1440])for(const theme of ['light','dark'])for(const mode of ['month-php','all-usd','inspected-php']){
  await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({colorScheme:theme});let home;
  for(const route of ['home','portfolio']){
   await page.evaluate(h=>location.hash=h,route);await graph().waitFor();await graph().getByRole('button',{name:'1M portfolio history',exact:true}).click();if(await graph().getAttribute('data-currency')==='USD')await graph().getByRole('button',{name:'Switch portfolio display to PHP',exact:true}).click();
   if(mode==='all-usd'){await graph().getByRole('button',{name:'All portfolio history',exact:true}).click();await graph().getByRole('button',{name:'Switch portfolio display to USD',exact:true}).click();}
   if(mode==='inspected-php'){await graph().locator('.chart-plot').focus();await page.keyboard.press('ArrowRight');await graph().getByRole('tooltip').waitFor();}
   await page.waitForTimeout(350);const data=await read();assert.equal(data.touch,'pan-y');if(route==='home')home=data;else assert.deepEqual(data,home,'equivalent source/range/currency/selected point must agree');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await graph().screenshot({path:`${output}/${route}-${mode}-${width}-${theme}.png`});
  }
  checked.push({width,theme,mode,agreed:home});
 }
 assert.equal(errors,0);assert.equal(fixtureControls.getBlocked(),0);await writeFile(output+'/evidence.json',JSON.stringify({checked,errors,unexpectedRemote:0,hostedWrites:0,syntheticOnly:true},null,2));console.log(JSON.stringify({pairedStates:checked.length,errors,unexpectedRemote:0,hostedWrites:0,output}));
},{syntheticFixture:{baseURL:origin,setup}});
