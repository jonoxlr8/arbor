import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { arborMarkPaths, arborMarkViewBox } from "@/lib/arborBrand";

export const alt = "Arbor — Invest with a plan you understand. Illustrative portfolio preview, not actual performance.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const preview = await readFile(join(process.cwd(), "public/product/v3-demo/portfolio-history.png"));
  return new ImageResponse(<div style={{display:"flex",width:"100%",height:"100%",background:"#102c26",color:"#f0f6f3",padding:56,overflow:"hidden"}}>
    <div style={{display:"flex",flexDirection:"column",width:530,flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:12,color:"#a7d3a0",fontSize:26,fontWeight:700,letterSpacing:2}}><svg viewBox={arborMarkViewBox} width="50" height="40" fill="#a7d3a0">{arborMarkPaths.map(d=><path key={d} d={d}/>)}</svg>ARBOR</div>
      <div style={{display:"flex",fontSize:14,marginTop:72,color:"#bdcec6",letterSpacing:2}}>YOUR INVESTMENT COMPANION</div>
      <div style={{display:"flex",fontSize:68,fontWeight:700,letterSpacing:-3,lineHeight:1.06,marginTop:20}}>Invest with a plan you understand.</div>
      <div style={{display:"flex",fontSize:22,color:"#bdcec6",marginTop:24}}>Choose your approach. Track your progress.</div>
      <div style={{display:"flex",fontSize:18,marginTop:30,color:"#a7d3a0"}}>arbor.ph · Philippines-first · Private beta</div>
    </div>
    <div style={{display:"flex",flexDirection:"column",justifyContent:"center",width:700,flexShrink:0,marginLeft:35}}>
      <div style={{display:"flex",padding:20,borderRadius:26,background:"#ffffff",border:"1px solid #ffffff25"}}>
        {/* ImageResponse outputs pixels, so next/image does not apply here. */}
        <img alt="Synthetic Arbor Portfolio preview" src={`data:image/png;base64,${preview.toString("base64")}`} width={690} height={282} style={{borderRadius:18}}/>
      </div>
      <div style={{display:"flex",fontSize:22,color:"#bdcec6",marginTop:18}}>Demo · Not actual performance</div>
    </div>
  </div>,size);
}
