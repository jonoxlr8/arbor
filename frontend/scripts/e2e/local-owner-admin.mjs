import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import {origin,setup,fixtureControls} from './ux-fixture.mjs';
const out='/tmp/arbor-owner-admin-captures';await mkdir(out,{recursive:true});
const base={id:'00000000-0000-4000-8000-000000000501',investment_name:'Example Missing Investment Fund',provider:'Example Provider',received_at:'2026-10-02T01:00:00Z',status:'new',revision:0,updated_at:null};
let row={...base},allowed=true,empty=false,failure=0,writes=0,errors=0,delay=0,listFailure=0;const checked=[];
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,PUT,OPTIONS'};
const intercepted=async context=>{await setup(context);await context.route('**/v2/admin/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 const json=(body,status=200)=>route.fulfill({json:body,status,headers});
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(path==='/v2/admin/deletions/access')return json({allowed:false});
 if(path.endsWith('/access')){if(delay)await new Promise(r=>setTimeout(r,delay));return json({allowed});}
 if(!allowed)return json({detail:'denied'},403);
 if(path.endsWith('/status')){writes++;const body=request.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['expected_revision','status']);if(failure){const status=failure;failure=0;return json({detail:'synthetic failure'},status);}assert.equal(body.expected_revision,row.revision);row={...row,status:body.status,revision:row.revision+1,updated_at:'2026-10-02T02:00:00Z'};return json(row);}
 if(path.endsWith('/requests'))return listFailure?json({detail:'synthetic unavailable'},listFailure):json({items:empty?[]:[row],has_more:false,offset:0});
 return json(row);
 });};
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>errors++);
 await page.goto(origin+'/#login');await page.getByLabel('Email address').fill('phase2b@example.test');await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 for(const width of[320,390,1440])for(const theme of['light','dark']){
  row={...base};allowed=true;empty=false;await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});
  await page.evaluate(()=>location.hash='settings');const entry=page.getByRole('link',{name:'Admin Review submitted investment requests'});await entry.waitFor();await page.waitForTimeout(350);await page.screenshot({path:`${out}/settings-${width}-${theme}.png`,fullPage:true});await entry.focus();await page.keyboard.press('Enter');
  const request=page.locator('.admin-request-row');await request.waitFor();await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${out}/list-${width}-${theme}.png`,fullPage:true});await request.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Request details',exact:true}).waitFor();assert.equal(await page.locator('#section-investment').count(),0);assert.equal(await page.getByRole('heading',{name:'Request details',exact:true}).evaluate(n=>n===document.activeElement),true);await page.screenshot({path:`${out}/new-${width}-${theme}.png`,fullPage:true});
  for(const status of['Reviewing','Resolved']){await page.getByRole('button',{name:status,exact:true}).click();await page.getByRole('button',{name:status,exact:true}).waitFor({state:'visible'});await page.waitForFunction(s=>document.querySelector(`.admin-statuses button[aria-pressed="true"]`)?.textContent===s,status);assert.equal(await page.getByRole('button',{name:status,exact:true}).isDisabled(),true);await page.screenshot({path:`${out}/${status.toLowerCase()}-${width}-${theme}.png`,fullPage:true});}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checked.push({width,theme});
 }
 for(const status of[409,503]){failure=status;await page.getByRole('button',{name:'New',exact:true}).click();await page.locator('.owner-admin [role=alert]').waitFor();assert.equal(await page.getByRole('button',{name:'Reviewing',exact:true}).isDisabled(),true);await page.screenshot({path:`${out}/error-${status}.png`,fullPage:true});await page.getByRole('button',{name:'Refresh requests',exact:true}).click();await page.locator('.owner-admin [role=alert]').waitFor({state:'hidden'});await page.waitForFunction(()=>[...document.querySelectorAll('.admin-statuses button')].some(n=>n.textContent==='New'&&!n.disabled));}
 allowed=false;await page.getByRole('button',{name:'New',exact:true}).click();await page.locator('.owner-admin [role=alert]').waitFor();assert.equal(await page.locator('.admin-detail-layout').count(),0);assert.equal(await page.locator('.admin-request-row').count(),0);await page.screenshot({path:`${out}/revoked-owner.png`,fullPage:true});
 await page.evaluate(()=>location.hash='settings');await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();assert.equal(await page.locator('.admin-entry').count(),0);await page.evaluate(()=>location.hash='settings/admin');await page.getByText('Owner Admin access is unavailable for this account.',{exact:true}).waitFor();assert.equal(await page.locator('.admin-card').count(),0);await page.screenshot({path:`${out}/ordinary-bookmark-denied.png`,fullPage:true});
 allowed=true;empty=true;await page.evaluate(()=>location.hash='settings');await page.locator('.admin-entry').waitFor();await page.locator('.admin-entry').click();await page.getByText('No investment requests recorded.',{exact:true}).waitFor();await page.screenshot({path:`${out}/empty.png`,fullPage:true});
 await page.evaluate(()=>location.hash='settings');await page.locator('.admin-entry').waitFor();delay=1200;await page.locator('.admin-entry').click();await page.getByText('Checking Admin access…',{exact:true}).waitFor();await page.screenshot({path:`${out}/loading.png`,fullPage:true});await page.getByText('No investment requests recorded.',{exact:true}).waitFor();delay=0;listFailure=503;await page.getByRole('button',{name:'Refresh requests',exact:true}).click();await page.locator('.owner-admin [role=alert]').waitFor();await page.screenshot({path:`${out}/list-unavailable.png`,fullPage:true});listFailure=0;await page.getByRole('button',{name:'Refresh requests',exact:true}).click();await page.locator('.owner-admin [role=alert]').waitFor({state:'hidden'});
 assert.equal(errors,0);assert.equal(fixtureControls.getBlocked(),0);
 const evidence={checked,screenshots:37,syntheticUIFixtures:true,realDatabaseQualificationSeparate:true,keyboardEntryListDetail:true,focusDetail:true,revision409AndAmbiguous503Refresh:true,revokedAccessPurgesDisplayedRecords:true,ordinaryBookmarkDenied:true,empty:true,loadingAndUnavailable:true,statusWrites:writes,pageErrors:errors,unexpectedExternal:fixtureControls.getBlocked(),hostedWrites:0};await writeFile(out+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
},{syntheticFixture:{baseURL:origin,setup:intercepted}});
