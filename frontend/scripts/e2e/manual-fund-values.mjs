// Local fixture storage + real disposable-account authentication. Never hosted writes.
import assert from 'node:assert/strict';
import { withAuthenticatedBrowser } from './auth.mjs';

await withAuthenticatedBrowser(async ({page,reused})=>{
  let stage='fixture check',errors=0;
  page.setDefaultTimeout(20000);
  page.on('pageerror',()=>errors++);
  page.on('console',m=>{if(m.type()==='error')errors++;});
  try {
    const read=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio');
    await page.evaluate(()=>{location.hash='portfolio';});
    const initial=await read;
    assert.equal(initial.headers()['x-arbor-portfolio-fixture'],'isolated');
    assert.equal((await initial.json()).holdings.length,0,'Start with empty local fixtures');
    stage='add value-only fund';
    await page.getByRole('button',{name:'Add holding',exact:true}).click();
    stage='select provider';await page.getByRole('combobox',{name:/^Provider/}).selectOption('gcash');
    stage='select investment';await page.getByRole('combobox',{name:/^Investment/}).selectOption('gcash_global_equity');
    assert.equal(await page.getByLabel('Units (optional)',{exact:true}).isVisible(),false);
    await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
    const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
    await page.getByRole('button',{name:'Save holding record',exact:true}).click();
    const first=await (await created).json();assert.equal(first.total_value_php,'8000.00');assert.equal(first.holdings[0].units,null);assert.equal(first.holdings[0].valuation_source,'manual_user');
    await page.getByText(/Updated by you/).waitFor();
    await page.getByRole('button',{name:'Update current value',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Clear current value — keep holding',exact:true}).count(),0);
    await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
    const layouts=[];
    stage='responsive form';
    // Theme is an existing local UI preference, not account/profile data.
    for(const width of [1440,390,320])for(const theme of ['Light','Dark']){
      await page.setViewportSize({width,height:950});
      await page.evaluate(()=>{location.hash='settings';});
      await page.getByRole('radio',{name:theme,exact:true}).check();
      await page.evaluate(()=>{location.hash='portfolio';});
      await page.getByRole('button',{name:'Update current value',exact:true}).click();
      await page.getByLabel('Current value (PHP)',{exact:true}).fill('8000');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${theme}`);
      if(width===390)await page.screenshot({path:`/tmp/arbor-manual-${theme}.png`,fullPage:true});
      layouts.push(`${width}/${theme}`);
    }
    async function saveValue(v){
      await page.getByLabel('Current value (PHP)',{exact:true}).fill(v);
      const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/manual-value'));
      const updated=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
      await page.getByRole('button',{name:'Save current value',exact:true}).click();
      assert.equal((await response).status(),200);
      const result=await (await updated).json();assert.equal(result.total_value_php,`${v}.00`);
      assert.equal(result.holdings[0].valuation_source,'manual_user');
      assert.equal(result.sleeves[0].current_percentage,'100');
      assert.equal(Number(result.sleeves[0].difference_pp),100-result.sleeves[0].target_percentage);
      await page.getByText(/Updated by you/).waitFor();
    }
    stage='save and contribution';await saveValue('8000');
    await page.getByRole('button',{name:'Review contribution',exact:true}).click();
    await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('1000');
    await page.getByRole('button',{name:/Gotrade Access supported/}).click();
    const scenario=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio/scenarios/plan');
    await page.getByRole('button',{name:'Calculate scenario',exact:true}).click();
    assert.equal((await scenario).status(),200);
    assert.equal((await (await scenario).json()).current_portfolio_value,'8000.00');
    stage='chat';await page.evaluate(()=>{location.hash='ask';});
    await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill('What is my current portfolio worth?');
    const chat=page.waitForResponse(r=>new URL(r.url()).pathname==='/chat');
    await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();
    const answer=await (await chat).json();assert.match(answer.reply,/8,000.00/);assert.match(answer.reply,/You entered/);assert.match(answer.reply,/not an official NAV/);assert.match(answer.reply,/does not currently have units/);
    stage='update';await page.evaluate(()=>{location.hash='portfolio';});
    await page.getByRole('button',{name:'Update current value',exact:true}).click();await saveValue('9000');
    stage='add units later';await page.getByRole('button',{name:/^Edit ATRAM/}).click();
    await page.getByText('I know my fund units',{exact:true}).click();
    await page.getByLabel('Units (optional)',{exact:true}).fill('10');
    const unitUpdate=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
    await page.getByRole('button',{name:'Save holding record',exact:true}).click();
    const automatic=await (await unitUpdate).json();assert.equal(automatic.holdings[0].valuation_source,'nav');assert.equal(automatic.total_value_php,'1000.00');
    await page.getByText(/Latest NAV updated/).waitFor();
    stage='clear';await page.getByRole('button',{name:'Manage saved value',exact:true}).click();
    const cleared=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
    await page.getByRole('button',{name:'Clear current value — keep holding',exact:true}).click();
    const data=await (await cleared).json();assert.equal(data.holdings.length,1);assert.equal(data.holdings[0].manual_value_php,null);assert.equal(data.holdings[0].value_php,'1000.00');
    await page.getByText(/Latest NAV updated/).waitFor();
    stage='cleanup';await page.getByRole('button',{name:/^Remove ATRAM/}).click();
    const cleaned=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
    await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();
    assert.equal((await (await cleaned).json()).holdings.length,0);
    assert.equal(errors,0);
    console.log(JSON.stringify({reused,localFixture:true,hostedWrites:0,layouts,errors,finalHoldings:0}));
  } catch(error){console.error(`Manual fund QA stopped at ${stage}: ${error.name}. No session/request data logged.`);throw new Error('Manual fund QA failed');}
});
