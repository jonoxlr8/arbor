import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import NextActionCard,{NextActionContent} from "../components/NextActionCard";
import {createNextActionReader,isNextAction,type NextAction} from "./nextAction";

const action:NextAction={key:"review_monthly_contribution",title:"Review this month’s contribution",explanation:"Explore your selected targets.",destination:"portfolio",button_label:"Review contribution",blocking:false};
for(const [key,destination] of [["financial_foundation","investment_profile"],["complete_profile","onboarding"],["review_short_term_path","plan"],["review_historical_plan","investment_profile"],["review_monthly_contribution","portfolio"]] as const) {
  test(`one CTA renders server-provided ${key} and dispatches its destination`,()=>{
    const value={...action,key,destination};
    let received="";
    const element=NextActionContent({action:value,onAction:d=>{received=d;}});
    const html=renderToStaticMarkup(element);
    assert.equal((html.match(/<button/g)||[]).length,1);
    assert.match(html,/What should I do next/);
    assert.match(html,/min-h-11/);
    assert.doesNotMatch(html,/buy|sell|recommended|best for you/i);
    element.props.children.find((child: {type?:string}) => child?.type === "button").props.onClick();
    assert.equal(received,destination);
  });
}
test("loading is explicit, no guessed action while pending",()=>{
  const html=renderToStaticMarkup(createElement(NextActionCard,{userId:"A",onAction:()=>{}}));
  assert.match(html,/role="status"/);assert.match(html,/Checking your next step/);assert.doesNotMatch(html,/<button/);
});
test("reader uses verified owner token and GET with no client state",async()=>{
  const read=createNextActionReader(async id=>{assert.equal(id,"A");return "fixture";},async(url,init)=>{
    assert.ok(String(url).endsWith("/v2/next-action"));
    assert.equal(init?.body,undefined);assert.equal(init?.cache,"no-store");
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer fixture");
    return Response.json(action);
  });
  assert.deepEqual(await read("A",new AbortController().signal),action);
});
for(const status of [401,409,503])test(`safe retryable error for ${status}`,async()=>{
  const read=createNextActionReader(async()=>"fixture",async()=>new Response("private details",{status}));
  await assert.rejects(read("A",new AbortController().signal),error=>error instanceof Error&&!error.message.includes("private"));
});
test("invalid destinations fail closed",()=>{
  assert.equal(isNextAction({...action,destination:"https://evil.example"}),false);
  assert.equal(isNextAction({...action,key:"buy_stock"}),false);
});
test("canonical profile changes remount action and abort old requests; errors allow retry",()=>{
  const parent=readFileSync("components/PlanV2View.tsx","utf8");
  assert.match(parent,/<NextActionCard key=\{`\$\{userId\}:\$\{JSON.stringify\(value\)\}`\}/);
  const card=readFileSync("components/NextActionCard.tsx","utf8");
  assert.match(card,/controller.abort\(\)/);assert.match(card,/!controller.signal.aborted/);
  assert.match(card,/role="alert"/);assert.match(card,/setRetry\(retry\+1\)/);
});
