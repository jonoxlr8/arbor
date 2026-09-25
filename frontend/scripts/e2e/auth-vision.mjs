// Visual auth contract test: isolated browser, synthetic identities, ALL auth
// requests intercepted. Does not send email, change a real password or log tokens.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const origin='http://localhost:3000', output='/tmp/arbor-vision-auth';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'alex@example.com',created_at:'2026-09-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
// Non-signable test token exists only in the intercepted browser session.
const fakeToken=`${encoded({alg:'HS256',typ:'JWT'})}.${encoded({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.fixture-only-not-a-signature`;
const session={access_token:fakeToken,refresh_token:'fixture-not-a-real-refresh-token',expires_in:3600,token_type:'bearer',user};
let errors=0,blocked=0,verifyCount=0,updates=0;const shots=[];
async function fresh(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});
  await context.route('**/auth/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname,method=route.request().method();
    if(path.endsWith('/signup'))return route.fulfill({json:{user,session:null}});
    if(path.endsWith('/recover')||path.endsWith('/resend'))return route.fulfill({json:{}});
    if(path.endsWith('/verify')){verifyCount++;return route.fulfill({json:session});}
    if(path.endsWith('/user')){if(method==='PUT')updates++;return route.fulfill({json:user});}
    if(path.endsWith('/logout'))return route.fulfill({status:204});
    blocked++;return route.abort();
  });
  // A fixture session must never reach a real Arbor/Supabase data endpoint.
  await context.route('**/rest/v1/**',route=>{blocked++;return route.abort();});
  const page=await context.newPage();page.on('pageerror',()=>errors++);
  return {page,context};
}
async function capture(page,name){
  await page.evaluate(()=>document.fonts.ready);
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  for(const [width,theme] of [[1440,'light'],[390,'light'],[390,'dark']]){
    await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
    if(new URL(page.url()).hostname==='localhost')await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow ${name}`);
    const file=`${name}-${width}-${theme}.png`;await page.screenshot({path:`${output}/${file}`,fullPage:true,animations:'disabled'});shots.push(file);
  }
}
try{
  {
    const {page,context}=await fresh();
    await page.goto(`${origin}/#login`);await page.getByRole('heading',{name:'Welcome back'}).waitFor();await capture(page,'sign-in');
    await page.goto(`${origin}/#signup`);await page.getByRole('button',{name:'Create account',exact:true}).waitFor();await capture(page,'create-account');
    await page.getByLabel('Email address',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
    await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('heading',{name:'Check your email'}).waitFor();await capture(page,'email-sent');await context.close();
  }
  {
    const {page,context}=await fresh();
    await page.goto(`${origin}/confirm-signup#token_hash=fixture_confirmation_token_123456&type=email`);
    await page.getByRole('button',{name:'Confirm email address'}).waitFor();assert.equal(verifyCount,0,'No redemption before user action');assert.equal(new URL(page.url()).hash,'');await capture(page,'confirm-ready');
    await page.getByRole('button',{name:'Confirm email address'}).click();await page.getByRole('heading',{name:'Email confirmed'}).waitFor();assert.equal(verifyCount,1);await capture(page,'confirm-success');await context.close();
  }
  {
    const {page,context}=await fresh();await page.goto(`${origin}/confirm-signup`);await page.getByRole('heading',{name:'Let’s get you a new link'}).waitFor();await capture(page,'confirm-invalid');await context.close();
  }
  {
    const {page,context}=await fresh();await page.goto(`${origin}/forgot-password`);await page.getByRole('heading',{name:'Reset your password'}).waitFor();await capture(page,'forgot-password');
    await page.getByLabel('Email address').fill(user.email);await page.getByRole('button',{name:'Send reset email'}).click();await page.getByRole('heading',{name:'Check your email'}).waitFor();await capture(page,'reset-email-sent');await context.close();
  }
  {
    const {page,context}=await fresh();await page.goto(`${origin}/reset-password#token_hash=fixture_recovery_token_12345678&type=recovery`);
    await page.getByRole('button',{name:'Verify reset link'}).waitFor();assert.equal(verifyCount,1);assert.equal(new URL(page.url()).hash,'');
    await page.getByRole('button',{name:'Verify reset link'}).click();await page.getByLabel('New password',{exact:true}).waitFor();await capture(page,'reset-password');
    await page.getByLabel('New password',{exact:true}).fill('fixture-only-new-password');await page.getByLabel('Confirm new password',{exact:true}).fill('fixture-only-new-password');
    await page.getByRole('button',{name:'Change password',exact:true}).click();await page.getByRole('heading',{name:'Password updated'}).waitFor();assert.equal(updates,1);await capture(page,'password-changed');await context.close();
  }
  {
    const {page,context}=await fresh();await page.goto(`${origin}/reset-password`);await page.getByRole('heading',{name:'Request a new reset link'}).waitFor();await capture(page,'reset-invalid');await context.close();
  }
  for(const name of ['confirm-signup','reset-password']){
    const {page,context}=await fresh();
    await page.route('https://arbor.ph/arbor-email-logo-v2.png',route=>route.fulfill({path:'public/arbor-email-logo-v2.png'}));
    const html=(await readFile(`../docs/auth-emails/${name}.html`,'utf8')).replaceAll('{{ .TokenHash }}','non-secret-visual-preview');
    await page.setContent(html);await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));await capture(page,`email-${name}`);await context.close();
  }
  assert.equal(errors,0);assert.equal(blocked,0);
  const result={screenshots:shots.length,pageErrors:errors,unexpectedAuthRequests:blocked,explicitVerifyActions:verifyCount,passwordChangesMocked:updates,realEmailOrPasswordMutations:0};
  await writeFile(`${output}/summary.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
