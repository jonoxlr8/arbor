export type AlignmentHistory = {status:"unavailable"|"closer"|"further"|"similar";message:string;detail:string;
  current:{date:string;gap_pp:string}|null;previous:{date:string;gap_pp:string}|null;
  drivers:{sleeve:string;change_pp:string}[]};
export function isAlignmentHistory(v:unknown):v is AlignmentHistory {
  if(!v||typeof v!=="object")return false;
  const r=v as AlignmentHistory;
  const point=(p:AlignmentHistory["current"])=>!!p&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&/^\d+\.\d{2}$/.test(p.gap_pp)&&Number(p.gap_pp)<=100;
  return ["unavailable","closer","further","similar"].includes(r.status)&&typeof r.message==="string"&&typeof r.detail==="string"&&
    (r.status==="unavailable"?r.current===null&&r.previous===null:point(r.current)&&point(r.previous))&&
    Array.isArray(r.drivers)&&r.drivers.length<=2&&r.drivers.every(d=>["global_equity","defensive","technology_tilt","crypto"].includes(d.sleeve)&&/^-?\d+\.\d{2}$/.test(d.change_pp));
}
