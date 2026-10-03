import test from 'node:test';
import assert from 'node:assert/strict';
import {chartInspectionPoints,historyChartSeries,portfolioPeriodGain} from './portfolioHistory';
import type {PortfolioHistory} from './livePortfolio';
const today='2026-10-03';
const history:PortfolioHistory[]=[{day:'2026-08-01',value_php:'100',value_usd:'2',origin:'reconstructed',captured_at:null,cost_complete:true,recorded_cost_php:'80',recorded_gain_php:'20'},
 {day:'2026-09-30',value_php:'120',value_usd:'2.4',origin:'observed',captured_at:'2026-09-30T01:00:00Z',cost_context_captured:true,cost_complete:true,recorded_cost_php:'90',recorded_gain_php:'30'}];
for(const days of [7,30,90,180,365,1826,0])for(const currency of ['PHP','USD'] as const)test(`${days}/${currency} explicit current endpoint is the last selectable plotted point`,()=>{
 const current=currency==='PHP'?'150':'3';const points=chartInspectionPoints(history,days,currency,today,current);const series=historyChartSeries(history,days,currency,today,current);const end=points.at(-1)!;
 assert.deepEqual(end,{kind:'current',day:today,value:current});assert.equal(Date.parse(end.day+'T00:00:00Z'),series.at(-1)?.timestamp);assert.equal(Number(end.value),series.at(-1)?.plotValue);assert.equal('point' in end,false);
 assert.equal(history.length,2);assert.equal(history[1].day,'2026-09-30');
});
test('today record is deduplicated and keeps its historical cost/FX/origin context',()=>{
 const recorded={...history[1],day:today};const points=chartInspectionPoints([...history,recorded],7,'USD',today,'3');assert.equal(points.filter(p=>p.day===today).length,1);assert.equal(points.at(-1)?.kind,'history');assert.equal(points.at(-1)?.value,'2.4');
});
test('missing today USD remains missing in history while explicit current USD stays separate',()=>{
 const recorded={...history[1],day:today,value_usd:null};const points=chartInspectionPoints([...history,recorded],7,'USD',today,'3');assert.equal(points.at(-1)?.kind,'current');assert.equal(recorded.value_usd,null);assert.equal(chartInspectionPoints([...history,recorded],7,'PHP',today,'150').at(-1)?.kind,'history');
});
test('empty/current-only data does not fabricate historical or plotted points',()=>{
 for(const current of ['0','150',null])assert.deepEqual(chartInspectionPoints([],7,'PHP',today,current),[]);
});
test('null/invalid currency values never make a current selection from a drawing hold',()=>{
 for(const current of [null,undefined,'NaN','-1','Infinity'])assert.ok(chartInspectionPoints(history,7,'USD',today,current).every(p=>p.kind==='history'));
 const unsupported=history.map(p=>({...p,value_usd:null}));assert.deepEqual(chartInspectionPoints(unsupported,7,'USD',today,'3'),[]);
});
test('current-only selection in a range with an older boundary hold does not invent that history',()=>{
 const points=chartInspectionPoints([history[0]],7,'PHP',today,'150');assert.deepEqual(points,[{kind:'current',day:today,value:'150'}]);assert.equal(history[0].day,'2026-08-01');
});
test('current endpoint uses current recorded gain with the genuine historical baseline',()=>{
 assert.equal(portfolioPeriodGain({history,days:7,today,currentGainPhp:'60',currentComplete:true,selected:null}),'40');
 assert.equal(portfolioPeriodGain({history,days:7,today,currentGainPhp:null,currentComplete:false,selected:null}),null);
});

import {portfolioGainForDisplay} from './portfolioHistory';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PortfolioHistoryChart from '../components/portfolio/PortfolioHistoryChart';
const input={history,days:7,today,currentGainPhp:'60',currentComplete:true};
test('valid selected period wins over canonical total',()=>{
 assert.deepEqual(portfolioGainForDisplay(input),{amount:'40',fallback:false});
});
test('short history and genuine history gaps reuse valid canonical total without a fabricated baseline',()=>{
 for(const rows of [[],[history[1]]])assert.deepEqual(portfolioGainForDisplay({...input,days:90,history:rows}),{amount:'60',fallback:true});
});
test('missing canonical cost/gain remains unavailable; zero and negative totals stay distinct from absence',()=>{
 assert.deepEqual(portfolioGainForDisplay({...input,history:[],currentComplete:false}),{amount:null,fallback:false});
 assert.deepEqual(portfolioGainForDisplay({...input,history:[],currentGainPhp:null}),{amount:null,fallback:false});
 for(const amount of ['0','-20'])assert.deepEqual(portfolioGainForDisplay({...input,history:[],currentGainPhp:amount}),{amount,fallback:true});
});
test('historical fallback uses selected known recorded gain, never current gain',()=>{
 assert.deepEqual(portfolioGainForDisplay({...input,days:90,selected:history[1]}),{amount:'30',fallback:true});
 assert.deepEqual(portfolioGainForDisplay({...input,days:90,selected:{...history[1],cost_complete:false}}),{amount:null,fallback:false});
});
test('All is already canonical and does not add a fallback label',()=>{
 assert.deepEqual(portfolioGainForDisplay({...input,days:0}),{amount:'60',fallback:false});
});
test('shared chart visibly distinguishes canonical fallback without changing period-gain arithmetic or claiming lifetime coverage',()=>{
 const html=renderToStaticMarkup(createElement(PortfolioHistoryChart,{history:[],knownValue:'150',holdingsCount:1,currentRecordedCostPhp:'90',currentGainPhp:'60',currentGainPercentage:'66.67'}));
 assert.match(html,/Total recorded gain\/loss/);assert.match(html,/not gain over the selected chart period/);assert.doesNotMatch(html,/All-time gain\/loss|in the past week|in the past month/);
 assert.match(html,/1M portfolio history" aria-pressed="true"|aria-pressed="true" aria-label="1M portfolio history"/);
 const missing=renderToStaticMarkup(createElement(PortfolioHistoryChart,{history:[],knownValue:'150',holdingsCount:1,currentRecordedCostPhp:null,currentGainPhp:null}));assert.doesNotMatch(missing,/class="chart-gain-fallback-label"/);assert.match(missing,/Period gain\/loss unavailable/);
});
