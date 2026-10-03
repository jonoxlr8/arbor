import test from "node:test";
import assert from "node:assert/strict";
import {isSheetHash,sheetFallbackHash,destinationFromHash,subscribeNavigation,closePortfolioSheet} from "./appNavigation";

test("planning and Settings bookmarks keep their destination and safe close route",()=>{
 for(const [hash,destination] of [["#home/monthly","home"],["#portfolio/contribution","portfolio"],["#portfolio/what-if","portfolio"],["#settings/plan","settings"],["#settings/goal","settings"],["#plan","home"],["#portfolio/plan","home"]]){
  assert.equal(isSheetHash(hash),true);assert.equal(destinationFromHash(hash),destination);assert.equal(sheetFallbackHash(hash),`#${destination}`);
 }
 assert.equal(isSheetHash("#settings/admin"),false);
});
test("nested sheet back preserves the original opener on each history entry",()=>{
 const previous=globalThis.window;
 let listener:((event:Event)=>void)|undefined,back=0;
 const fake={location:{hash:"#settings/plan",href:"https://arbor.example.test/#settings/plan"},history:{state:{arborSheet:{target:"#settings/plan",opener:"#settings"}},replaceState(state:unknown){this.state=state as typeof this.state;},back(){back++;}},addEventListener(_name:string,fn:(event:Event)=>void){listener=fn;},removeEventListener(){},setTimeout(){}};
 globalThis.window=fake as unknown as Window & typeof globalThis;
 try{
  const unsubscribe=subscribeNavigation(()=>{});
  listener?.({oldURL:"https://arbor.example.test/#portfolio/what-if",newURL:"https://arbor.example.test/#settings/plan"}as unknown as Event);
  assert.equal(fake.history.state.arborSheet.opener,"#settings");closePortfolioSheet();assert.equal(back,1);unsubscribe();
 }finally{globalThis.window=previous;}
});
