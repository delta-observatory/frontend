import { useEffect, useState } from "react";
import { getJson } from "../api/client";
import { post } from "./api";
interface Transfer { id:string; state:string; request:{tic_id:number;sectors:number[]}; manifest_sha256:string|null; manifest:{products:{filename:string;bytes:number;sector:number}[]}|null; error:string|null; result:{files:{filename:string;state:string}[]}|null }
export function Acquisition({ enabled, onChanged }: {enabled:boolean; onChanged:()=>void}) {
 const [tic,setTic]=useState("100100827"),[sectors,setSectors]=useState("2"),[bytes,setBytes]=useState(128),[items,setItems]=useState<Transfer[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const refresh=()=>getJson<{items:Transfer[]}>("/acquisitions").then(r=>setItems(r.items));
 useEffect(()=>{void refresh().catch(e=>setError(e.message));const timer=setInterval(()=>{void refresh().catch(()=>{});},2500);return()=>clearInterval(timer);},[]);
 async function act(f:()=>Promise<unknown>){setBusy(true);setError("");try{await f();await refresh();onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="product-card"><h2>Acquire TESS observations</h2><p>Preview public SPOC light curves before downloading. The supported cadence is 120 seconds.</p>
 <label className="schema-field">TIC identifier<input value={tic} onChange={e=>setTic(e.target.value)} inputMode="numeric" /></label>
 <label className="schema-field">Sectors, separated by commas<input value={sectors} onChange={e=>setSectors(e.target.value)} /></label>
 <label className="schema-field">Download limit (MiB)<input type="number" min={1} max={2048} value={bytes} onChange={e=>setBytes(Number(e.target.value))}/></label>
 <p>At most 64 files. At least 512 MiB must remain free.</p>
 <button disabled={!enabled||busy} onClick={()=>void act(()=>post('/acquisitions',{contract:'acquisition-request/1',tic_id:Number(tic),sectors:sectors.split(',').map(x=>Number(x.trim())),maximum_files:64,maximum_bytes:bytes*1048576,reserve_bytes:536870912}))}>Preview archive selection</button>
 {error&&<p role="alert" className="error-inline">{error}</p>}
 {items.map(item=><article className="transfer" key={item.id}><strong>TIC {item.request.tic_id} · {item.state}</strong><p>Sector {item.request.sectors.join(', ')} · {item.result?.files.length??0} checked files</p>
 {item.manifest&&<details><summary>{item.manifest.products.length} products · {(item.manifest.products.reduce((sum,p)=>sum+p.bytes,0)/1048576).toFixed(2)} MiB</summary><ul>{item.manifest.products.map(p=><li key={p.filename}>{p.filename} · {p.bytes.toLocaleString()} bytes</li>)}</ul><p className="checksum">SHA-256: {item.manifest_sha256}</p></details>}
 {item.error&&<p className="error-inline">{item.error}</p>}
 {item.state==='preview'&&<button disabled={!enabled||busy} onClick={()=>void act(()=>post(`/acquisitions/${item.id}/approve`,{sha256:item.manifest_sha256}))}>Approve these products and download</button>}
 {['failed','cancelled'].includes(item.state)&&<button disabled={!enabled||busy} onClick={()=>void act(()=>post(`/acquisitions/${item.id}/retry`))}>Retry incomplete acquisition</button>}
 {['querying','preview','queued','downloading'].includes(item.state)&&<button disabled={!enabled||busy} onClick={()=>void act(()=>post(`/acquisitions/${item.id}/cancel`))}>Cancel acquisition</button>}
 </article>)}
 </section>;
}
