// Actual local production build; every external auth/API request intercepted.
import assert from 'node:assert/strict';
import {readFile,mkdir}from'node:fs/promises';
import {withAuthenticatedBrowser}from'./auth.mjs';
const origin=process.env.ARBOR_REVIEW_ORIGIN??'http://127.0.0.1:3127';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const doc=JSON.parse(await readFile(new URL('../../lib/termsDocument.json',import.meta.url),'utf8'));
const output='/tmp/arbor-terms-review';await mkdir(output,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'terms-fixture@example.test',created_at:'2026-09-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.synthetic-only`;
const session={access_token:token,refresh_token:'synthetic-only',expires_in:3600,token_type:'bearer',user};
const lifecycle={state:'active',version:0,access_allowed:false,deletion_request:null,in_flight_reminders:0,erasure_available:false};
let sdk=0,intents=0,accepts=0,failAcceptance=true,errors=0,unexpected=0;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const setup=async context=>context.route('**/*',route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname;if(url.origin===origin)return route.continue();
 const json=(body,status=200)=>route.fulfill({json:body,status,headers});
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(p.endsWith('/terms/current'))return json({...doc,enforcement_enabled:true,published_at:new Date().toISOString(),effective_at:new Date().toISOString()});
 if(p.endsWith('/terms/signup-intent')){intents++;const b=req.postDataJSON();assert.deepEqual(Object.keys(b).sort(),['confirm','digest','email','version']);assert.equal(b.confirm,true);assert.equal(b.digest,doc.digest);return json({intent_token:'a'.repeat(64),version:doc.version,digest:doc.digest,expires_at:new Date(Date.now()+600000).toISOString()});}
 if(p.endsWith('/auth/v1/signup')){sdk++;assert.equal(req.postDataJSON().data.arbor_terms_intent,'a'.repeat(64));return json({user,session:null});}
 if(p.endsWith('/auth/v1/token'))return json(session);
 if(p.endsWith('/auth/v1/user'))return json(user);
 if(p.endsWith('/auth/v1/logout'))return json({});
 if(p.endsWith('/account/terms/accept')){accepts++;assert.deepEqual(req.postDataJSON(),{version:doc.version,digest:doc.digest,confirm:true});return failAcceptance?json({detail:'Synthetic stale version'},409):json({...doc,required:false,accepted_at:new Date().toISOString()});}
 if(p.endsWith('/account/terms'))return json({...doc,required:true,accepted_at:null});
 if(p.endsWith('/account/lifecycle')||p.endsWith('/account/lifecycle/login'))return json(lifecycle);
 if(p.endsWith('/account/export'))return json({detail:'Synthetic export unavailable'},503);
 unexpected++;return route.abort();
});
await withAuthenticatedBrowser(async({page,context})=>{
 page.on('pageerror',()=>errors++);
 await page.goto(origin+'/#signup');
 await page.getByRole('checkbox').waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);
 await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill('synthetic-only-password');
 assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).isEnabled(),false);assert.equal(sdk,0);
 for(const width of[320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:width<768?844:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390||width===1440)await page.screenshot({path:`${output}/signup-${width}.png`,fullPage:true});
 }
 assert.ok((await page.getByRole('link',{name:'Privacy Notice',exact:true}).getAttribute('href'))==='/privacy');
 const archived=await context.newPage();await archived.goto(origin+'/terms/'+doc.version);await archived.getByRole('heading',{name:'Terms',exact:true}).waitFor();assert.equal(await archived.getByRole('link',{name:'Privacy',exact:true}).count(),1);await archived.screenshot({path:output+'/document.png',fullPage:true});await archived.close();
 await page.getByRole('checkbox').focus();await page.keyboard.press('Space');assert.equal(await page.getByRole('checkbox').isChecked(),true);
 await page.getByRole('button',{name:'Refresh Terms',exact:true}).click();await page.getByRole('checkbox').waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('heading',{name:/Check your email/}).waitFor();assert.equal(sdk,1);assert.equal(intents,1);
 await page.goto(origin+'/#login');await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill('synthetic-only-password');await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByRole('heading',{name:'Review Arbor’s Terms',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);
 assert.equal(await page.getByRole('button',{name:'Accept Terms and continue',exact:true}).isEnabled(),false);
 for(const width of[320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:width<768?844:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390||width===1440)await page.screenshot({path:`${output}/existing-${width}.png`,fullPage:true});
 }
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Accept Terms and continue',exact:true}).evaluate(el=>{el.click();el.click();});await page.getByRole('alert').filter({hasText:'The Terms changed'}).waitFor();assert.equal(accepts,1);
 await page.locator('summary').filter({hasText:'Account & privacy'}).click();assert.equal(await page.getByRole('button',{name:'Request account deletion',exact:true}).count(),1);
 await page.getByRole('button',{name:'Download my Arbor data',exact:true}).click();await page.getByRole('status').filter({hasText:/unavailable|download|retry/i}).last().waitFor();
 await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:output+'/rights-error-dark.png',fullPage:true});
 failAcceptance=false;await page.getByRole('button',{name:'Accept Terms and continue',exact:true}).click();await page.getByRole('heading',{name:'Review Arbor’s Terms',exact:true}).waitFor();assert.equal(accepts,2);
 assert.equal(errors,0);assert.equal(unexpected,0);
 console.log(JSON.stringify({six_widths:[320,390,768,1024,1440,1920],signup_sdk_calls:sdk,intent_calls:intents,acceptance_calls:accepts,page_errors:errors,unexpected_requests:unexpected,hosted_writes:0,output}));
},{syntheticFixture:{baseURL:origin,setup}});
