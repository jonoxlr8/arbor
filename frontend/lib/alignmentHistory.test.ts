import {test} from "node:test";
import assert from "node:assert/strict";
import {isAlignmentHistory} from "./alignmentHistory";
const empty={status:"unavailable",message:"Unavailable",detail:"Missing dated history",current:null,previous:null,drivers:[]};
test("alignment requires complete dated comparisons and known sleeves",()=>{
 assert.ok(isAlignmentHistory(empty));assert.equal(isAlignmentHistory({...empty,status:"closer"}),false);
 const ready={...empty,status:"closer",previous:{date:"2026-09-30",gap_pp:"20.00"},current:{date:"2026-10-02",gap_pp:"0.00"},drivers:[{sleeve:"global_equity",change_pp:"20.00"}]};
 assert.ok(isAlignmentHistory(ready));assert.equal(isAlignmentHistory({...ready,current:{date:"today",gap_pp:"NaN"}}),false);
 assert.equal(isAlignmentHistory({...ready,drivers:[{sleeve:"unknown",change_pp:"20.00"}]}),false);
});

import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {AlignmentGapComparison} from "../components/portfolio/AlignmentOverTime";
import type {AlignmentHistory} from "./alignmentHistory";
const gapData=(previous:string,current:string,status:AlignmentHistory["status"]="closer"):AlignmentHistory=>({status,message:"Existing backend takeaway",detail:"Existing caveat",previous:{date:"2026-09-30",gap_pp:previous},current:{date:"2026-10-02",gap_pp:current},drivers:[]});
for(const [previous,current,status] of [["20.00","0.00","closer"],["0.00","100.00","further"],["1.25","1.25","similar"],["0.00","0.00","similar"]] as const){
 test(`gap bars use the same absolute scale: ${previous} to ${current}`,()=>{
 const data=gapData(previous,current,status),markup=renderToStaticMarkup(createElement(AlignmentGapComparison,{data}));
 assert.match(markup,/Last month/);assert.match(markup,/Now/);assert.match(markup,/2026-09-30/);assert.match(markup,/2026-10-02/);assert.match(markup,/Existing backend takeaway/);assert.match(markup,/lower is better/);assert.match(markup,/percentage points/);
 for(const gap of [previous,current])assert.ok(markup.includes(`width:${Number(gap)}%`));
 assert.equal((markup.match(/alignment-gap-zero-marker/g)||[]).length,[previous,current].filter(x=>Number(x)===0).length);
 assert.doesNotMatch(markup,/score|Buy|Sell/);
 });
}
test("missing comparison never fabricates a zero bar",()=>{
 const markup=renderToStaticMarkup(createElement(AlignmentGapComparison,{data:empty as AlignmentHistory}));assert.match(markup,/Unavailable/);assert.doesNotMatch(markup,/alignment-gap-track|0 pp|Last month|Now/);
});
