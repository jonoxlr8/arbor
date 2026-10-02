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
