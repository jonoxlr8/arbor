// Synthetic loopback-only review. No analytics, real account or hosted writes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import {origin,setup as baseSetup,canonical,fixtureControls} from './ux-fixture.mjs';
const fixtures=JSON.parse(execFileSync('./.venv/bin/python',['tests/ask_preview_responses_local.py'],{cwd:'../backend',input:JSON.stringify(canonical.saved),encoding:'utf8',env:{...process.env,PYTHONPATH:'.:tests',SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_KEY:'synthetic-fixture-only'}}));
assert.equal(fixtures.portfolio.total_value_php,'124800.00');
const out='/tmp/arbor-ask-improvements-captures';await mkdir(out,{recursive:true});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
let availability=true,feedbackStatus=200,answerMode='normal',pageErrors=0;const votes=[];let questions=0;
const setup=async context=>{
 await baseSetup(context);
 await context.route('**/v2/portfolio',r=>r.fulfill({json:fixtures.portfolio,headers}));
 await context.route('**/ask/feedback/**',r=>{
  const request=r.request(),p=new URL(request.url()).pathname;
  if(request.method()==='OPTIONS')return r.fulfill({status:204,headers});
  if(p.endsWith('/access')){assert.equal(request.method(),'GET');return r.fulfill({json:{available:availability},headers});}
  assert.equal(request.method(),'PUT');const body=request.postDataJSON();
  assert.deepEqual(Object.keys(body).sort(),['answer_version','helpful','intent','reason']);assert.equal(typeof body.helpful,'boolean');assert.equal(body.answer_version,'deterministic-ask-1');
  votes.push({id:p.split('/').at(-1),body,status:feedbackStatus});
  return r.fulfill({status:feedbackStatus,json:feedbackStatus===200?{saved:true,helpful:body.helpful,reason:body.reason}:{detail:'Synthetic denied'},headers});
 });
 await context.route('**/chat',r=>{
  const request=r.request();if(request.method()==='OPTIONS')return r.fulfill({status:204,headers});
  assert.equal(request.method(),'POST');const body=request.postDataJSON();assert.deepEqual(Object.keys(body),['message']);questions++;
  const answer=answerMode==='missing'?fixtures.missing:answerMode==='empty'?fixtures.empty:fixtures.answers[body.message];assert.ok(answer,body.message);
  return r.fulfill({json:answer,headers});
 });
};
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>pageErrors++);await page.goto(origin+'/#login');await page.getByLabel('Email address').fill('phase2b@example.test');await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 const open=async()=>{await page.evaluate(()=>location.hash='ask');await page.getByLabel('Your question for Ask Arbor').waitFor();};
 const ask=async q=>{await page.getByLabel('Your question for Ask Arbor').fill(q);await page.getByRole('button',{name:'Send question',exact:true}).click();await page.locator('.chat-reply').last().waitFor();await page.getByRole('button',{name:'Send question',exact:true}).waitFor();await page.waitForTimeout(80);};
 let screenshots=0;
 for(const width of [390,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width>=1000?1200:844});await page.emulateMedia({colorScheme:theme});await page.evaluate(()=>location.hash='home');await open();
  const before=votes.length;await ask('Magkano portfolio ko?');assert.equal(votes.length,before);
  const reply=page.locator('.chat-reply').last();assert.match(await reply.textContent(),/124,800/);assert.equal(await reply.getByRole('link',{name:'View portfolio →'}).getAttribute('href'),'#portfolio');
  await reply.screenshot({path:`${out}/worth-${width}-${theme}.png`});screenshots++;
  await reply.getByRole('button',{name:'Not helpful',exact:true}).click();await reply.getByText('Feedback saved.',{exact:true}).waitFor();assert.equal(votes.length,before+1);
  await reply.getByText('Add a reason (optional)',{exact:true}).click();await reply.getByLabel('Optional feedback reason').selectOption('unclear');assert.equal(votes.length,before+1);
  await reply.getByRole('button',{name:'Save reason',exact:true}).click();await page.waitForTimeout(80);assert.equal(votes.length,before+2);assert.equal(votes.at(-1).id,votes.at(-2).id);
  await reply.getByText('What feedback saves',{exact:true}).click();assert.match(await reply.textContent(),/question, answer, financial figures and email are not included/);
  await reply.screenshot({path:`${out}/feedback-${width}-${theme}.png`});screenshots++;
  await reply.getByRole('link',{name:'View portfolio →'}).click();await page.getByRole('heading',{name:'Portfolio',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,"#portfolio");
 }
 await page.setViewportSize({width:390,height:844});await open();
 await ask('Paki explain yung plan ko');const plan=page.locator('.chat-reply').last();assert.equal(await plan.locator('.ask-answer-details').count(),1);await plan.getByText('More detail',{exact:true}).click();assert.match(await plan.textContent(),/Global Equity/);await page.screenshot({path:`${out}/plan-more-detail.png`});screenshots++;
 await ask('Kumusta portfolio ko?');const ambiguous=page.locator('.chat-reply').last();assert.match(await ambiguous.textContent(),/Do you mean/);assert.equal(await ambiguous.locator('.ask-answer-action').count(),0);
 await ask('Bilhin ko ba VT?');assert.match(await page.locator('.chat-reply').last().textContent(),/don’t choose securities or providers/);
 await ask('Ano ang difference ng ETF at UITF?');assert.equal(await page.locator('.chat-reply').last().getByRole('link',{name:'Learn more →'}).getAttribute('href'),'/learn');
 answerMode='missing';await ask('Magkano portfolio ko?');const missing=page.locator('.chat-reply').last();assert.match(await missing.textContent(),/unavailable/i);assert.equal(await missing.locator('.ask-answer-details').count(),0);await missing.screenshot({path:`${out}/missing-history.png`});screenshots++;
 feedbackStatus=403;await missing.getByRole('button',{name:'Helpful',exact:true}).click();await missing.getByRole('alert').waitFor();assert.equal(await missing.getByText('Feedback saved.',{exact:true}).count(),0);
 feedbackStatus=200;await missing.getByRole('button',{name:'Helpful',exact:true}).click();await missing.getByText('Feedback saved.',{exact:true}).waitFor();assert.equal(votes.at(-1).id,votes.at(-2).id);
 availability=false;await page.reload();await open();answerMode='empty';await ask('Magkano portfolio ko?');const empty=page.locator('.chat-reply').last();assert.match(await empty.textContent(),/No holdings/);assert.equal(await empty.locator('.ask-feedback').count(),0);await empty.screenshot({path:`${out}/uninstalled-feedback-empty.png`});screenshots++;
 assert.equal(pageErrors,0);assert.equal(fixtureControls.getBlocked(),0);
 const evidence={screenshots,pageErrors,unexpectedExternal:fixtureControls.getBlocked(),questions,explicitVotes:votes.length,financialWrites:0,canonicalSyntheticRouteResponses:true,noChatOrFinancialFeedbackFields:true,optionalReasonRequiresSave:true,idempotentEditAndRetry:true,uninstalledFeedbackHidden:true,frontendOnlyPreview:true};await writeFile(out+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
},{syntheticFixture:{baseURL:origin,setup}});
