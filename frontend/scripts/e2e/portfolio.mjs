// Uses normal isolated auth. Start tests/e2e_portfolio_app.py on loopback first.
// No profile writes, credentials, session exports, HAR or browser console dumps.
import assert from 'node:assert/strict';
import { withAuthenticatedBrowser } from './auth.mjs';

await withAuthenticatedBrowser(async ({page,reused})=>{
  let stage='open portfolio';
  try {
  page.setDefaultTimeout(15000);
  let pageErrors=0,consoleErrors=0;
  const network=[];
  page.on('pageerror',()=>pageErrors++);
  page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
  page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/v2/portfolio')||path==='/chat')network.push([r.request().method(),path.replace(/\/holdings\/.+/, '/holdings/:id'),r.status()]);});
  const opened=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
  await page.evaluate(()=>{location.hash='portfolio';});
  const initial=await opened;
  assert.equal(initial.headers()['x-arbor-portfolio-fixture'],'isolated','Only the isolated local fixture backend may run this scenario');
  await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().waitFor();
  while(await page.locator('.holding-row').count()) {
    await page.locator('.holding-row').first().click();await page.getByRole('dialog').getByRole('button',{name:/^Remove /}).click();
    const clean=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio'&&r.request().method()==='GET');
    await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();await clean;
    await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().waitFor();
  }
  await page.getByRole('heading',{name:'Start tracking your investments',exact:true}).waitFor();
  async function add(provider,product,units){
    stage=`add ${product}`;
    await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().click();
    stage=`select investment ${product}`;
    await page.locator(`.catalogue-row[data-product="${product}"]`).click();
    stage=`enter units ${product}`;
    if(['gcash','dragonfi'].includes(provider)){
      await page.getByText('I know my fund units',{exact:true}).click();
      await page.getByLabel('Units (optional)',{exact:true}).fill(units);
    } else await page.getByLabel(provider==='gotrade'?'Shares':'Bitcoin amount (BTC)',{exact:true}).fill(units);
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio/holdings'&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Save Investment',exact:true}).click();
    stage=`save response ${product}`;
    assert.equal((await saved).status(),201);
    stage=`wait for saved portfolio ${product}`;
    await page.getByRole('button',{name:'+ Add Investment',exact:true}).first().waitFor();
    await page.locator('.holding-row').last().waitFor();
  }
  await add('gotrade','gotrade_vt','2');
  await add('gcash','gcash_defensive','10');
  await add('pdax','pdax_btc','0.001');
  stage='totals and contribution';
  await page.getByText('₱15,200',{exact:true}).waitFor();
  for(const label of ['Crypto data by Coinranking','Market data by Marketstack','Rates By Exchange Rate API'])
    await page.getByRole('link',{name:label,exact:true}).waitFor();
  for(const name of ['Gotrade','GFunds','PDAX'])await page.locator('.holding-row .provider-brand').filter({hasText:name}).waitFor();
  assert.equal(await page.getByText('Hypothetical current values',{exact:false}).count(),0);
  await page.getByRole('button',{name:'Monthly contribution',exact:true}).click();
  await page.getByLabel('Contribution amount (PHP)',{exact:true}).fill('1000');
  await page.getByRole('button',{name:/Gotrade Access supported/}).click();
  const scenario=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio/scenarios/plan');
  await page.getByRole('button',{name:'Preview contribution',exact:true}).click();
  const response=await scenario;assert.equal(response.status(),200);
  assert.equal((await response.json()).current_portfolio_value,'15200.00');
  await page.getByRole('heading',{name:'Choose where to invest',exact:true}).waitFor();
  for(const checkbox of await page.getByRole('checkbox',{name:/Use /}).all())await checkbox.check();
  const confirmedScenario=page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/portfolio/scenarios/plan');
  await page.getByRole('button',{name:'Use these options in my preview',exact:true}).click();
  assert.equal((await confirmedScenario).status(),200);
  await page.getByRole('heading',{name:'Choose where to invest',exact:true}).waitFor({state:'hidden'});
  for(const question of ['What is my current portfolio worth?','Am I above my Global Equity target?','What should I buy?']){
    stage=`chat ${question}`;
    await page.evaluate(()=>{location.hash='ask';});
    await page.getByRole('textbox',{name:'Your question about your Arbor plan'}).fill(question);
    const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/chat'&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Ask Arbor',exact:true}).click();
    const r=await reply;assert.equal(r.status(),200);const body=await r.json();
    if(question.includes('worth'))assert.match(body.reply,/15,200.00/);
    if(question.includes('above'))assert.match(body.reply,/Global Equity: PHP 11,200.00/);
    if(question.includes('buy'))assert.match(body.reply,/don’t select securities/);
  }
  await page.evaluate(()=>{location.hash='portfolio';});
  stage='edit record';
  await page.getByRole('button',{name:'View VT',exact:true}).click();await page.getByRole('button',{name:'Edit VT',exact:true}).click();
  await page.getByLabel('Shares',{exact:true}).fill('3');
  await page.getByRole('button',{name:'Save Investment',exact:true}).click();
  await page.getByText('₱20,800',{exact:true}).waitFor();
  const layouts=[];
  stage='responsive checks';
  for(const width of [1440,390,320])for(const theme of ['Light','Dark']){
    await page.setViewportSize({width,height:950});
    await page.evaluate(()=>{location.hash='settings';});
    await page.getByRole('radio',{name:theme,exact:true}).check();
    await page.evaluate(()=>{location.hash='portfolio';});
    await page.getByRole('button',{name:'Allocation',exact:true}).click();await page.getByRole('heading',{name:'Plan Alignment',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${theme} overflow`);
    if(width===390)await page.screenshot({path:`/tmp/arbor-live-portfolio-${theme}.png`,fullPage:true});
    layouts.push(`${width}/${theme}`);
  }
  await page.getByRole('button',{name:'Holdings',exact:true}).click();
  for(const name of ['VT','ATRAM Medium Term Peso Bond Fund','PDAX BTC']){
    stage=`remove ${name}`;
    await page.getByRole('button',{name:`View ${name}`,exact:true}).click();await page.getByRole('button',{name:`Remove ${name}`,exact:true}).click();
    await page.getByRole('button',{name:'Remove from Arbor',exact:true}).click();
    await page.getByRole('button',{name:`Remove ${name}`,exact:true}).waitFor({state:'hidden'});
  }
  await page.getByRole('heading',{name:'Start tracking your investments',exact:true}).waitFor();
  assert.equal(pageErrors,0);assert.equal(consoleErrors,0);
  assert.ok(network.every(x=>x[2]<400));
  console.log(JSON.stringify({reused,fixtureMode:true,hostedPortfolioWrites:0,finalFixtureHoldings:0,layouts,pageErrors,consoleErrors,network}));
  } catch (error) {
    console.error(`Portfolio QA stopped at: ${stage}. No raw request/session data logged.`);
    console.error(`Failure category: ${error.name}`);
    await page.screenshot({path:'/tmp/arbor-portfolio-check.png',fullPage:true});
    throw new Error('Portfolio QA assertion failed');
  }
});
