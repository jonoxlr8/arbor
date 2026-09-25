import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { arborMarkPaths, arborMarkViewBox } from "@/lib/arborBrand";

export const alt = "Arbor — Invest with clarity. An AI investment companion. Actual interface with illustrative preview data.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const preview = await readFile(join(process.cwd(), "public/product/3ug1-supplied/home-social.png"));
  return new ImageResponse(<div style={{display:"flex",width:"100%",height:"100%",background:"linear-gradient(120deg,#f7f9fc,#dcefe8 55%,#e6e5f7)",color:"#14233b",padding:60,overflow:"hidden"}}>
    <div style={{display:"flex",flexDirection:"column",width:460,flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:12,color:"#0f5132",fontSize:26,fontWeight:700,letterSpacing:2}}><svg viewBox={arborMarkViewBox} width="50" height="40" fill="#0f5132">{arborMarkPaths.map(d=><path key={d} d={d}/>)}</svg>ARBOR</div>
      <div style={{display:"flex",fontSize:16,marginTop:72,color:"#0e6546"}}>AI INVESTMENT COMPANION</div>
      <div style={{display:"flex",fontSize:68,letterSpacing:-3,lineHeight:1.04,marginTop:20}}>Invest with clarity.</div>
      <div style={{display:"flex",fontSize:27,color:"#53647c",marginTop:22}}>Keep the longer view.</div>
      <div style={{display:"flex",fontSize:17,marginTop:58,color:"#0e6546"}}>arbor.ph · Free during private beta</div>
    </div>
    <div style={{display:"flex",flexDirection:"column",justifyContent:"center",width:730,marginLeft:40}}>
      {/* ImageResponse renders to PNG, not an HTML page; next/image is inapplicable. */}
      <img alt="Arbor Home preview" src={`data:image/png;base64,${preview.toString("base64")}`} width={730} height={513} style={{borderRadius:18,border:"5px solid #ffffff"}}/>
      <div style={{display:"flex",fontSize:12,color:"#53647c",marginTop:12}}>Product preview · Illustrative data · Gated features not yet enabled</div>
    </div>
  </div>,size);
}
