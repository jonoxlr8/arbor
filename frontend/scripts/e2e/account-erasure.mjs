// Actual local production-build UI; isolated synthetic auth/routes, no hosted writes.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
const termsDoc=JSON.parse(await readFile(new URL('../../lib/termsDocument.json',import.meta.url),'utf8'));
const origin=process.env.ARBOR_REVIEW_ORIGIN??'http://127.0.0.1:3116';
assert.equal(new URL(origin).hostname,'127.0.0.1');
const output='/tmp/arbor-erasure-captures';await mkdir(output,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000031',email:'erasure@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-10-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const encoded=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const session={access_token:`${encoded({alg:'HS256',typ:'JWT'})}.${encoded({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.fixture-only`,refresh_token:'fixture-only',expires_in:3600,token_type:'bearer',user};
let status={state:'deletion_pending',version:2,access_allowed:false,deletion_request:{id:'synthetic-request',requested_at:'2026-10-01T00:00:00Z'},in_flight_reminders:0,erasure_available:false,processing:{state:'reviewed',verified_at:'2026-10-01T00:00:00Z',completion_target:'2026-10-31T00:00:00Z',held:false}};
let unexpected=0,pageErrors=0,consoleErrors=0;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const setup=context=>context.route('**/*',route=>{
 const r=route.request(),u=new URL(r.url());if(u.origin===origin)return route.continue();
 if(r.method()==='OPTIONS')return route.fulfill({status:204,headers});
 const json=value=>route.fulfill({json:value,headers});
 if(u.pathname.endsWith('/auth/v1/token'))return json(session);
 if(u.pathname.endsWith('/auth/v1/user'))return json(user);
 if(u.pathname.endsWith('/auth/v1/logout'))return json({});
 if(u.pathname.endsWith('/account/terms'))return json({...termsDoc,required:false,accepted_at:null});
 if(u.pathname.endsWith('/account/lifecycle')||u.pathname.endsWith('/account/lifecycle/login'))return json(status);
 unexpected++;return route.abort('blockedbyclient');
});
await withAuthenticatedBrowser(async({page})=>{
 page.on('pageerror',()=>pageErrors++);page.on('console',msg=>{if(msg.type()==='error')consoleErrors++;});
 await page.goto(origin+'/account-deletion');
 await page.getByRole('heading',{name:'Request deletion of your Arbor account'}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Request deletion of your Arbor account'}).count(),1);
 assert.match(await page.getByRole('link',{name:'support@arbor.ph',exact:true}).getAttribute('href'),/^mailto:support@arbor.ph\?subject=/);
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);await page.screenshot({animations:'disabled',path:output+'/web-request-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);await page.screenshot({animations:'disabled',path:output+'/web-request-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill('fixture-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByRole('heading',{name:'Your deletion request',exact:true}).waitFor();
 await page.getByText(/Identity reviewed. Ordinary completion target/).waitFor();
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);await page.screenshot({animations:'disabled',path:output+'/reviewed-mobile.png',fullPage:true});
 assert.equal(status.state,'deletion_pending');
 const cancel=page.getByRole('button',{name:'Cancel deletion request and return to Arbor',exact:true});await cancel.focus();assert.ok(await cancel.evaluate(el=>el===document.activeElement));
 status={...status,processing:{...status.processing,held:true}};
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByText(/A scoped retention hold needs review/).waitFor();
 await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);await page.screenshot({animations:'disabled',path:output+'/held-dark-mobile.png',fullPage:true});
 status={...status,state:'erasing',version:3,processing:{...status.processing,state:'erasing',held:false}};
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByRole('heading',{name:'Account erasure is in progress'}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Cancel deletion request|Download my Arbor data/}).count(),0);
 for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);await page.screenshot({animations:'disabled',path:output+'/erasing-desktop.png',fullPage:true});
 assert.equal(unexpected,0);assert.equal(pageErrors,0);assert.equal(consoleErrors,0);
 console.log(JSON.stringify({syntheticOnly:true,actualProductionBuild:true,widths:[320,390,768,1024,1440,1920],webMailtoAndSignin:true,reviewedTarget:true,scopedHold:true,erasingCancellationExportUnavailable:true,keyboard:true,pageErrors,consoleErrors,unexpectedRemoteRequests:unexpected,hostedWrites:0,captures:output}));
},{syntheticFixture:{baseURL:origin,setup}});
