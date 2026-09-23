import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configuration, sessionStorage, authenticate, SetupError } from "./session.mjs";
import { createClient } from "@supabase/supabase-js";

// Synthetic credentials only; these never leave the fake SDK in these tests.
const env = {ARBOR_E2E_EMAIL:"fixture@example.test", ARBOR_E2E_PASSWORD:"synthetic-test-only",
  ARBOR_E2E_USER_ID:"00000000-0000-4000-8000-000000000001", ARBOR_E2E_ACCOUNT_IS_DISPOSABLE:"true",
  NEXT_PUBLIC_SUPABASE_URL:"https://fixture.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"};
const config = configuration(env);
const user = {id:config.userId,email:config.email};

for (const key of ["ARBOR_E2E_EMAIL","ARBOR_E2E_PASSWORD","ARBOR_E2E_USER_ID"]) {
  test(`missing ${key} fails with safe actionable copy`, () => {
    assert.throws(() => configuration({...env,[key]:""}), error => error instanceof SetupError && error.message.includes(".env.e2e.local") && !error.message.includes(env.ARBOR_E2E_PASSWORD));
  });
}
test("disposable acknowledgement and non-production execution are mandatory", () => {
  assert.throws(() => configuration({...env,ARBOR_E2E_ACCOUNT_IS_DISPOSABLE:"false"}), /disposable/);
  assert.throws(() => configuration({...env,NODE_ENV:"production"}), /developer-only/);
});
for (const url of ["https://arbor.ph", "http://localhost.example.com", "http://localhost:3000/#login", "http://a:b@localhost:3000", "http://localhost:3000/path", "file:///tmp/app"]) {
  test(`non-local or ambiguous origin rejected: ${url}`, () => assert.throws(() => configuration({...env,ARBOR_E2E_BASE_URL:url}), /loopback/));
}
test("local origins accepted but malformed/private auth configuration rejected", () => {
  for (const url of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) assert.equal(configuration({...env,ARBOR_E2E_BASE_URL:url}).baseURL,url);
  assert.throws(() => configuration({...env,NEXT_PUBLIC_SUPABASE_URL:"https://fixture.supabase.co/rest/v1"}), /root URL/);
  assert.throws(() => configuration({...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_secret_fixture"}), /forbidden/);
  const serviceRole = `x.${Buffer.from(JSON.stringify({role:"service_role"})).toString("base64url")}.x`;
  assert.throws(() => configuration({...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:serviceRole}), /forbidden/);
  assert.throws(() => configuration({...env,ARBOR_E2E_USER_ID:"not-an-id"}), /user ID/);
});
test("state only contains SDK auth storage for the local app, not personal browser/financial data", () => {
  const storage = sessionStorage(config,{cookies:[{name:"personal"}],origins:[
    {origin:"https://arbor.ph",localStorage:[{name:config.storageKey,value:"personal-session"}]},
    {origin:config.baseURL,localStorage:[{name:config.storageKey,value:"test-session"},{name:"financial-answer",value:"private"}]},
  ]});
  assert.equal(storage.getItem(config.storageKey),"test-session");
  assert.equal(storage.getItem("financial-answer"),null);
  storage.setItem("ignored","value");
  assert.deepEqual(storage.snapshot(), {cookies:[],origins:[{origin:config.baseURL,localStorage:[{name:config.storageKey,value:"test-session"}]}]});
  storage.removeItem(config.storageKey);
  assert.equal(storage.snapshot().origins[0].localStorage.length,0);
});

function sdk({initial={data:{user:null},error:{name:"AuthSessionMissingError"}}, signedUser=user, loginError=null}={}) {
  let logins=0, checks=0, stopped=false;
  const factory = (url,key,options) => {
    assert.equal(url,config.supabaseURL); assert.equal(key,config.key);
    assert.equal(options.auth.debug,false); assert.equal(options.auth.autoRefreshToken,false);
    assert.equal(options.auth.detectSessionInUrl,false);
    return {auth:{
      async getUser() { checks++; return logins ? {data:{user:signedUser},error:null} : initial; },
      async signInWithPassword(input) {
        logins++; assert.deepEqual(input,{email:config.email,password:config.password});
        options.auth.storage.setItem(config.storageKey,"synthetic-sdk-session");
        return {data:{session:loginError ? null : {}},error:loginError};
      },
      stopAutoRefresh() { stopped=true; },
    }};
  };
  return {factory, stats:()=>({logins,checks,stopped})};
}
test("fresh session authenticates once with normal Supabase password method then verifies identity", async () => {
  const mock=sdk(); const result=await authenticate(config,null,mock.factory);
  assert.equal(result.reused,false);
  assert.equal(result.state.origins[0].localStorage[0].name,config.storageKey);
  assert.deepEqual(mock.stats(),{logins:1,checks:2,stopped:true});
});
test("valid or SDK-refreshed session is server-verified and reused without password login", async () => {
  const mock=sdk({initial:{data:{user},error:null}});
  assert.equal((await authenticate(config,null,mock.factory)).reused,true);
  assert.equal(mock.stats().logins,0);
});
for (const error of [{name:"AuthSessionMissingError"},{code:"refresh_token_not_found",status:400},{code:"session_not_found",status:401}]) {
  test(`missing/logged-out/expired session reauthenticates once: ${error.code || error.name}`, async () => {
    const mock=sdk({initial:{data:{user:null},error}});
    assert.equal((await authenticate(config,null,mock.factory)).reused,false);
    assert.equal(mock.stats().logins,1);
  });
}
test("logout is not immediately reversed while saving the browser state", async () => {
  const mock=sdk(); assert.equal(await authenticate(config,null,mock.factory,{allowLogin:false}),null);
  assert.equal(mock.stats().logins,0);
});
test("wrong cached account fails closed without login or browser authorization", async () => {
  const mock=sdk({initial:{data:{user:{...user,id:"different"}},error:null}});
  await assert.rejects(authenticate(config,null,mock.factory), /identity did not match/);
  assert.equal(mock.stats().logins,0);
});
test("wrong authenticated account or changed email also fails closed", async () => {
  for (const signedUser of [{...user,id:"different"},{...user,email:"personal@example.test"}]) {
    await assert.rejects(authenticate(config,null,sdk({signedUser}).factory), /identity did not match/);
  }
});
test("invalid credentials/confirmation errors do not leak provider content", async () => {
  const mock=sdk({loginError:{message:"private provider details"}});
  await assert.rejects(authenticate(config,null,mock.factory), error => /sign-in failed/.test(error.message) && !error.message.includes("private"));
  assert.equal(mock.stats().logins,1);
});
test("network errors do not trigger retries or leak provider content", async () => {
  const mock=sdk({initial:{data:{user:null},error:{status:503,message:"private provider details"}}});
  await assert.rejects(authenticate(config,null,mock.factory), /no automatic login loop/);
  assert.equal(mock.stats().logins,0);
});
test("runner has no personal browser profile, recordings, or production auth modifications", () => {
  const runner=readFileSync(new URL("./auth.mjs",import.meta.url),"utf8");
  assert.match(runner,/mode:0o600/); assert.match(runner,/mode:0o700/);
  assert.match(runner,/browser.newContext/);
  assert.doesNotMatch(runner,/launchPersistentContext|connectOverCDP|recordVideo:|recordHar:|tracing.start|signUp\(/);
  const ignored=readFileSync(new URL("../../.gitignore",import.meta.url),"utf8");
  assert.ok(ignored.includes(".env*")); assert.ok(ignored.includes("/playwright/.auth/"));
});

function transport() {
  const calls=[];
  const factory=(url,key,options) => createClient(url,key,{...options,global:{fetch:async (url, init) => {
    const request=new URL(url);
    const grant=request.searchParams.get("grant_type");
    calls.push(grant || request.pathname);
    if (grant === "password") assert.deepEqual(JSON.parse(init.body),{email:config.email,password:config.password,gotrue_meta_security:{}});
    const payload=grant ? {access_token:"synthetic-access-token",refresh_token:"synthetic-refresh-token",token_type:"bearer",expires_in:3600,user} : user;
    return Response.json(payload);
  }}});
  return {calls,factory};
}
test("real Supabase SDK writes browser-compatible storage and verifies cached sessions without another password request", async () => {
  const wire=transport();
  const first=await authenticate(config,null,wire.factory);
  assert.equal(first.reused,false);
  assert.equal(first.state.origins[0].localStorage[0].name,config.storageKey);
  assert.equal(JSON.parse(first.state.origins[0].localStorage[0].value).user.id,config.userId);
  const second=await authenticate(config,first.state,wire.factory);
  assert.equal(second.reused,true);
  assert.equal(wire.calls.filter(call=>call === "password").length,1);
  assert.ok(wire.calls.includes("/auth/v1/user"));
});
test("real SDK refreshes expired cached storage through the supported refresh-token endpoint", async () => {
  const wire=transport();
  const state={cookies:[],origins:[{origin:config.baseURL,localStorage:[{name:config.storageKey,value:JSON.stringify({
    access_token:"synthetic-expired-token",refresh_token:"synthetic-refresh-token",expires_at:1,expires_in:1,token_type:"bearer",user,
  })}]}]};
  assert.equal((await authenticate(config,state,wire.factory)).reused,true);
  assert.ok(wire.calls.includes("refresh_token"));
  assert.ok(!wire.calls.includes("password"));
});
