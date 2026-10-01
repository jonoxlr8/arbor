import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLifecycleRequester, isAccountLifecycle, type AccountLifecycle } from './accountLifecycle';
import { createAccountRecovery, AccountRestrictedError } from './accountRecovery';
import RestrictedAccount from '../components/account/RestrictedAccount';
const active: AccountLifecycle = {state:'active',version:0,access_allowed:true,deletion_request:null,in_flight_reminders:0,erasure_available:false};
test('lifecycle validates state and rejects unavailable/invalid contracts',()=>{
 assert.ok(isAccountLifecycle(active));
 for(const change of [{state:'deleted'},{version:-1},{version:true},{access_allowed:null},{erasure_available:true},{in_flight_reminders:-1}])assert.equal(isAccountLifecycle({...active,...change}),false);
});
test('lifecycle actions use JWT owner, explicit version/id/confirmation and no automatic retry',async()=>{
 let calls=0;
 const request=createLifecycleRequester(async owner=>{assert.equal(owner,'A');return 'synthetic';},async(url,options)=>{
  calls++;assert.match(String(url),/account\/deactivate$/);assert.equal(options?.method,'POST');assert.equal(options?.cache,'no-store');
  assert.deepEqual(JSON.parse(String(options?.body)),{expected_version:0,action_id:'fixture-id',confirm:true});
  return new Response(JSON.stringify(active));
 });
 assert.equal((await request('A','deactivate',0,'fixture-id')).state,'active');assert.equal(calls,1);
});
for(const code of [401,403,409,429,503])test(`lifecycle ${code} fails without reposting`,async()=>{
 let calls=0;const run=createLifecycleRequester(async()=> 'synthetic',async()=>{calls++;return new Response('{}',{status:code})});
 await assert.rejects(run('A','cancel_deletion',2,'id'));assert.equal(calls,1);
});
test('recovery exposes restricted account without loading a plan or onboarding',async()=>{
 const states: string[]=[];const pending={...active,state:'deletion_pending' as const,access_allowed:false,deletion_request:{id:'fixture-id',requested_at:'2026-09-30T00:00:00Z'}};
 const recovery=createAccountRecovery({getUser:async()=>({id:'A'}),getProfile:async()=>{throw new AccountRestrictedError('A',pending);},onState:s=>states.push(s.status),onIdentityChange:()=>{}});
 await recovery.restore();assert.deepEqual(states,['checking','restricted']);
 const html=renderToStaticMarkup(createElement(RestrictedAccount,{userId:'A',status:pending,onRefresh:()=>{},onSignOut:()=>{}}));
 assert.match(html,/Signing in has not cancelled/);assert.match(html,/Cancel deletion request and return to Arbor/);assert.match(html,/Download my Arbor data/);
 assert.doesNotMatch(html,/Deactivate account/);
});

test('processing status rejects malformed targets and displays scoped hold honestly',()=>{
 const processing={state:'reviewed',verified_at:'2026-10-01T00:00:00Z',completion_target:'2026-10-31T00:00:00Z',held:true};
 assert.ok(isAccountLifecycle({...active,processing}));
 for(const change of [{state:'erased'},{verified_at:'bad'},{completion_target:null},{held:'yes'}])assert.equal(isAccountLifecycle({...active,processing:{...processing,...change}}),false);
 const html=renderToStaticMarkup(createElement(RestrictedAccount,{userId:'A',status:{...active,state:'deletion_pending',access_allowed:false,processing:processing as NonNullable<AccountLifecycle['processing']>},onRefresh:()=>{},onSignOut:()=>{}}));
 assert.match(html,/scoped retention hold/);assert.match(html,/targets, not guaranteed deadlines/);
});
