export type RecordedTotal = {amount_php:string|null;record_count:number;missing_amount_count:number};
export type MonthlyReviewData = RecordedTotal & {month:string;current_month:string;in_progress:boolean;currency:"PHP";
  available_months:string[];pattern:(RecordedTotal & {month:string})[];
  breakdown:(RecordedTotal & {product_id:string;provider:string;holding_id:string})[]};
const month = (v:unknown):v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const total = (v:RecordedTotal) => v && (v.amount_php === null || typeof v.amount_php === "string" && /^\d+\.\d{2}$/.test(v.amount_php)) &&
  Number.isInteger(v.record_count) && v.record_count>=0 && Number.isInteger(v.missing_amount_count) && v.missing_amount_count>=0 && v.missing_amount_count<=v.record_count &&
  (v.amount_php!==null || v.record_count===v.missing_amount_count);
export function isMonthlyReview(v:unknown):v is MonthlyReviewData {
  if(!v || typeof v!=="object")return false;
  const r=v as MonthlyReviewData;
  return !!(total(r) && month(r.month) && month(r.current_month) && r.currency==="PHP" && r.in_progress===(r.month===r.current_month) &&
    Array.isArray(r.available_months) && r.available_months.every(month) && Array.isArray(r.pattern) && r.pattern.length===6 &&
    r.pattern.every(p=>month(p.month)&&total(p)) && r.pattern[5].month===r.month &&
    Array.isArray(r.breakdown) && r.breakdown.every(p=>total(p)&&typeof p.product_id==="string"&&typeof p.provider==="string"&&typeof p.holding_id==="string"));
}
export const reviewMonthLabel=(month:string,short=false)=>new Date(month+"-01T00:00:00Z").toLocaleDateString("en-PH",{month:short?"short":"long",...(short?{}:{year:"numeric"}),timeZone:"Asia/Manila"});
export const reviewAmountLabel=(r:RecordedTotal)=>!r.record_count?"No additions recorded":r.amount_php===null?"PHP amounts not recorded":r.missing_amount_count?"Recorded subtotal":"Recorded additions";
