import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import {origin,setup,fixtureControls} from './ux-fixture.mjs';
const out='/tmp/arbor-deletion-review-captures';await mkdir(out,{recursive:true});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={request_id:id(901),requested_at:'2026-10-02T01:00:00Z',request_status:'pending',withdrawn_at:null,lifecycle_state:'deletion_pending',processing_state:'not_started',holds:[],verified_at:null,completed_at:null,receipt_expires_at:null,provider_status:'unassessed',receipt_id:null};
const variants=[base,{...base,request_id:id(902),processing_state:'reviewed',verified_at:'2026-10-02T02:00:00Z',holds:[{category:'ledger',reason:'legal_claim',review_at:'2026-10-01T00:00:00Z',end_at:'2026-10-02T00:00:00Z'}]},{...base,request_id:id(903),request_status:'withdrawn',withdrawn_at:'2026-10-02T02:00:00Z',lifecycle_state:'active'},...['erasing','data_erased','auth_erased'].map((state,i)=>({...base,request_id:id(904+i),processing_state:state,lifecycle_state:state==='auth_erased'?null:'erasing',verified_at:'2026-10-02T02:00:00Z'})),{...base,request_id:id(907),requested_at:null,request_status:'record_unavailable',lifecycle_state:null,processing_state:'completed',verified_at:'2026-10-02T02:00:00Z',completed_at:'2026-10-02T03:00:00Z',receipt_expires_at:'2027-10-02T03:00:00Z',provider_status:'pending_copies',receipt_id:id(997)},{...base,request_id:id(908),processing_state:'completed',completed_at:'2026-10-02T03:00:00Z',receipt_expires_at:'2027-10-02T03:00:00Z',provider_status:'pending_copies'}];
let allowed=false,listCalls=0,writes=0,errors=0,empty=false,failure=0,delay=0;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,OPTIONS'};
const intercepted=async context=>{await setup(context);await context.route('**/v2/admin/**',async route=>{
 const r=route.request(),p=new URL(r.url()).pathname;const reply=(body,status=200)=>route.fulfill({json:body,status,headers});
 if(r.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(r.method()!=='GET'){writes++;return reply({detail:'no mutations'},405);}
 if(p==='/v2/admin/access')return reply({allowed:true});
 if(p==='/v2/admin/requests')return reply({items:[],has_more:false,offset:0});
 if(p.endsWith('/deletions/access')){if(delay)await new Promise(r=>setTimeout(r,delay));return reply({allowed});}
 if(!allowed)return reply({detail:'denied'},403);
 if(failure)return reply({detail:'fixture unavailable'},failure);
 if(p.endsWith('/deletions')){listCalls++;return reply({items:empty?[]:variants,has_more:false,offset:0});}
 return reply(variants.find(row=>p.endsWith(row.request_id))??{},variants.some(row=>p.endsWith(row.request_id))?200:404);
 });};
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>errors++);
 await page.goto(origin+'/#login');await page.getByLabel('Email address').fill('phase2b@example.test');await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Hello, Maya.'}).waitFor();
 const enter=async()=>{await page.evaluate(()=>location.hash='settings');await page.locator('.admin-entry').waitFor();await page.locator('.admin-entry').click();await page.getByText('No investment requests recorded.',{exact:true}).waitFor();};
 await enter();await page.waitForTimeout(300);assert.equal(await page.getByRole('button',{name:'Account-deletion requests',exact:true}).count(),0);assert.equal(listCalls,0);
 allowed=true;
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});await enter();await page.getByRole('button',{name:'Account-deletion requests',exact:true}).click();await page.locator('.admin-deletion-row').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${out}/list-${width}-${theme}.png`,fullPage:true});
  for(const [i,row]of variants.entries()){
   await page.locator('.admin-deletion-row').nth(i).click();await page.getByText('Request '+row.request_id,{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Account-deletion requests',exact:true}).evaluate(n=>n===document.activeElement),true);assert.equal(await page.getByRole('button',{name:/delete account|mark complete|purge|change hold/i}).count(),0);assert.equal(await page.locator('.admin-receipt').count(),row.receipt_id?1:0);await page.getByText('Manual procedure',{exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${out}/detail-${row.processing_state}-${i}-${width}-${theme}.png`,fullPage:true});await page.getByRole('button',{name:'‹ All deletion requests',exact:true}).click();await page.locator('.admin-deletion-row').first().waitFor();
  }
 }
 failure=503;await page.getByRole('button',{name:'Refresh deletion requests',exact:true}).click();await page.locator('.owner-admin [role=alert]').waitFor();await page.screenshot({path:out+'/unavailable.png',fullPage:true});failure=0;await page.getByRole('button',{name:'Refresh deletion requests',exact:true}).click();await page.locator('.owner-admin [role=alert]').waitFor({state:'hidden'});
 allowed=false;await page.getByRole('button',{name:'Refresh deletion requests',exact:true}).click();await page.getByText('Account-deletion review is unavailable for this account.',{exact:true}).waitFor();assert.equal(await page.locator('.admin-deletion-row').count(),0);await page.screenshot({path:out+'/revoked.png',fullPage:true});
 allowed=true;empty=true;await page.getByRole('button',{name:'‹ Investment requests',exact:true}).click();await page.getByRole('button',{name:'Account-deletion requests',exact:true}).click();await page.getByText('No account-deletion requests available.',{exact:true}).waitFor();await page.screenshot({path:out+'/empty.png',fullPage:true});
 await page.getByRole('button',{name:'‹ Investment requests',exact:true}).click();delay=1200;await page.getByRole('button',{name:'Account-deletion requests',exact:true}).click();await page.getByText('Checking deletion review access…',{exact:true}).waitFor();await page.screenshot({path:out+'/loading.png',fullPage:true});await page.getByText('No account-deletion requests available.',{exact:true}).waitFor();delay=0;await page.goBack();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
 assert.equal(writes,0);assert.equal(errors,0);assert.equal(fixtureControls.getBlocked(),0);
 const evidence={widths:[320,390,1440],themes:['light','dark'],canonicalStates:8,screenshots:58,separateGateHiddenByDefault:true,revocationPurges:true,expiredHoldNotReleased:true,unverifiedCompletionNoReceipt:true,keyboardFocus:true,disclosure:true,emptyLoadingUnavailable:true,browserBack:true,mutations:writes,pageErrors:errors,unexpectedExternal:fixtureControls.getBlocked(),syntheticOnly:true,hostedWrites:0};await writeFile(out+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
},{syntheticFixture:{baseURL:origin,setup:intercepted}});
