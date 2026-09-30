import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createAccountExporter} from './accountExport';
import AccountPrivacy from '../components/account/AccountPrivacy';
test('export sends no owner selector and never writes or retries',async()=>{
 let count=0;
 const exporter=createAccountExporter(async owner=>{assert.equal(owner,'A');return 'synthetic';},async(url,options)=>{count++;assert.match(String(url),/\/account\/export$/);assert.equal(options?.body,undefined);assert.equal(options?.method,undefined);assert.equal(options?.cache,'no-store');return new Response('{}',{headers:{'content-type':'application/json'}})});
 assert.equal((await exporter('A')).type,'application/json');assert.equal(count,1);
});
for(const status of [401,403,413,429,503])test(`export safely handles ${status}`,async()=>{
 let count=0;const exporter=createAccountExporter(async()=> 'synthetic',async()=>{count++;return new Response('{}',{status})});
 await assert.rejects(exporter('A'));assert.equal(count,1);
});
test('privacy control exposes download and limitations accessibly',()=>{
 const html=renderToStaticMarkup(createElement(AccountPrivacy,{userId:'A'}));
 assert.match(html,/Download my Arbor data/);assert.match(html,/role="status"/);assert.match(html,/does not delete/);assert.match(html,/logs and backups are not included/);
});
test('cancelled export never requests or downloads',async()=>{
 const controller=new AbortController();controller.abort();let count=0;
 const exporter=createAccountExporter(async()=> 'synthetic',async()=>{count++;return new Response('{}')});
 await assert.rejects(exporter('A',controller.signal),/cancelled/);assert.equal(count,0);
});
test('unexpected content and oversized download fail closed',async()=>{
 for(const response of [new Response('html',{headers:{'content-type':'text/html'}}),new Response('x'.repeat(20971521),{headers:{'content-type':'application/json'}})]){
  await assert.rejects(createAccountExporter(async()=> 'synthetic',async()=>response)('A'));
 }
});
