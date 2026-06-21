import React, { useState, useEffect, useRef, useCallback } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Phone, ZoomIn, ZoomOut, Home, Droplets, HeartPulse, Navigation, Clock, CheckCircle2, PhoneOff, X } from "lucide-react"

// ─── Color Palette (PNG_image-1.png — strict) ────────────────────────────────
// Color 1: Minted Eucalyptus | Color 2: Seaglass Veil | Color 3: Peach Blushlight
// Color 4: Golden Nectar     | Color 5: Poppy Glaze   | Color 6: Terracotta Ember
const C = {
  bg:         "#f5e4cc",   // Peach Blushlight, lightened for page ground
  panel:      "#eddbc4",   // Peach Blushlight — panel surfaces
  card:       "#fff9f3",   // near-white warm card
  teal:       "#5b9a96",   // Minted Eucalyptus — answer btn, match highlight
  tealLight:  "#b5d5ce",   // Seaglass Veil — light teal fills
  peach:      "#eddbc4",   // Peach Blushlight
  amber:      "#e8a84a",   // Golden Nectar — warnings, P2
  poppy:      "#c85a3a",   // Poppy Glaze — primary CTA, RELAY brand
  rust:       "#8b3b28",   // Terracotta Ember — darkest, dispatch bg
  // Text
  ink:        "#2c1206",
  inkMid:     "#6b3520",
  inkSoft:    "#9a6246",
  inkFaint:   "#c49070",
  // Borders
  border:     "rgba(139,59,40,0.14)",
  borderMid:  "rgba(139,59,40,0.28)",
  // Resource types (water stays blue per user request)
  shelter:    "#5b9a96",   // Minted Eucalyptus
  shelterBg:  "#dff0ee",
  water:      "#2563eb",   // blue — exception
  waterBg:    "#dbeafe",
  medical:    "#c85a3a",   // Poppy Glaze
  medicalBg:  "#fdeadf",
  caller:     "#e8a84a",   // Golden Nectar
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ResourceType = "shelter" | "medical" | "water"
type AppStage = "ringing" | "listening" | "matched"

interface Resource {
  id: string; name: string; type: ResourceType
  lat: number; lng: number; capacity: number; remaining: number
  address: string; has: string[]; distanceKm: number; driveMin: number; note: string
}

interface Turn {
  speaker: "caller" | "relay"
  text: string
  translation?: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const CALLER_LAT = 29.7387, CALLER_LNG = -95.4162

function hkm(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371, dl = ((la2-la1)*Math.PI)/180, dg = ((lo2-lo1)*Math.PI)/180
  const a = Math.sin(dl/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dg/2)**2
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*10)/10
}

const RAW = [
  { id:"lakewood", name:"Lakewood Church Community Hub", type:"shelter" as ResourceType, lat:29.7214, lng:-95.4423, cap:320,  rem:87,  addr:"3700 Southwest Fwy",          has:["shelter","water","food"],          note:"87 beds · water on-site · fits family of 4" },
  { id:"nrg",      name:"NRG Center Mega-Shelter",        type:"shelter" as ResourceType, lat:29.6836, lng:-95.4097, cap:2400, rem:612, addr:"NRG Pkwy, Houston TX 77054",   has:["shelter","water","medical","food"], note:"612 beds · full services · medical staff" },
  { id:"grb",      name:"GRB Convention Center",          type:"shelter" as ResourceType, lat:29.7533, lng:-95.3654, cap:850,  rem:203, addr:"1001 Avenida de las Americas", has:["shelter","water","food"],          note:"203 beds · no medical staff on site" },
  { id:"bentaub",  name:"Ben Taub General Hospital",      type:"medical" as ResourceType, lat:29.7118, lng:-95.3997, cap:60,   rem:14,  addr:"1504 Taub Loop",               has:["medical","water"],                 note:"ER open · 14 beds remaining" },
  { id:"txch",     name:"Texas Children's Hospital",      type:"medical" as ResourceType, lat:29.7068, lng:-95.3993, cap:40,   rem:8,   addr:"6621 Fannin St",               has:["medical","water"],                 note:"Pediatric focus · nearly at capacity" },
  { id:"bbwater",  name:"Buffalo Bayou Water Dist.",       type:"water"   as ResourceType, lat:29.7519, lng:-95.3862, cap:5000, rem:3200,addr:"Memorial Dr & Shepherd Dr",    has:["water"],                           note:"Drive-through water pickup only" },
  { id:"heights",  name:"Heights Water Station",           type:"water"   as ResourceType, lat:29.7925, lng:-95.4008, cap:3000, rem:1820,addr:"1415 N Shepherd Dr",           has:["water"],                           note:"Open until 10 pm" },
  { id:"humble",   name:"Humble Civic Center",             type:"shelter" as ResourceType, lat:29.9988, lng:-95.2627, cap:180,  rem:45,  addr:"8233 Will Clayton Pkwy",       has:["shelter","water"],                 note:"45 beds · farther out but available" },
]
const RESOURCES: Resource[] = RAW.map(r => ({
  id:r.id, name:r.name, type:r.type, lat:r.lat, lng:r.lng,
  capacity:r.cap, remaining:r.rem, address:r.addr, has:r.has, note:r.note,
  distanceKm: hkm(CALLER_LAT,CALLER_LNG,r.lat,r.lng),
  driveMin: Math.round((hkm(CALLER_LAT,CALLER_LNG,r.lat,r.lng)/28)*60),
}))
const MATCHES = RESOURCES.filter(r=>r.type==="shelter"&&r.remaining>30).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,3)

// ─── Conversation turns with translations ─────────────────────────────────────
const TURNS_DATA: (Turn & { speakMs: number })[] = [
  { speaker:"caller", text:"नमस्ते, हमें मदद चाहिए! हम Montrose area में बाढ़ में फंसे हुए हैं। हमें पानी और आश्रय की जरूरत है।",
    translation:"Hello, we need help! We are trapped in flooding in the Montrose area. We need water and shelter.", speakMs:3800 },
  { speaker:"relay",  text:"I understand — you need water and shelter. How many people are with you? Any injuries?", speakMs:0 },
  { speaker:"caller", text:"हमारे साथ 4 लोग हैं — 2 बड़े और 2 बच्चे। कोई चोट नहीं है।",
    translation:"There are 4 of us — 2 adults and 2 children. No one is injured.", speakMs:2600 },
  { speaker:"relay",  text:"Understood — family of 4, no injuries. Can you describe your exact location?", speakMs:0 },
  { speaker:"caller", text:"हम Westheimer Road के पास हैं, Kirby Drive के नजदीक। पानी बहुत तेज बढ़ रहा है।",
    translation:"We are near Westheimer Road, close to Kirby Drive. The water is rising very fast.", speakMs:3200 },
  { speaker:"relay",  text:"Got it — near Westheimer & Kirby. Locating the nearest shelter with water now.", speakMs:0 },
]

// ─── Agent process steps ──────────────────────────────────────────────────────
const AGENT_STEPS = [
  { t:0,  text:"Deepgram STT connected · Streaming audio..." },
  { t:2,  text:"Language detected: Hindi (hi) · Confidence 0.94" },
  { t:5,  text:"Claude reading utterance 1 · Extracting triage fields..." },
  { t:7,  text:"Triage field: needs = ['shelter', 'water']" },
  { t:9,  text:"Claude reading utterance 2 · People count..." },
  { t:11, text:"Triage field: people = 4, children = 2" },
  { t:13, text:"Location geocoded → 29.7387, -95.4162 (Montrose)" },
  { t:15, text:"Matchmaker running · Redis vector search..." },
  { t:16, text:"4 shelter candidates ranked by distance + capacity" },
  { t:18, text:"Match: Lakewood Church Hub · 3.2 km · 87 beds" },
  { t:19, text:"Dispatch issued → Human operator notified ✓" },
]

// ─── OSRM road routing ────────────────────────────────────────────────────────
async function fetchRoute(fLa:number,fLo:number,tLa:number,tLo:number): Promise<[number,number][]> {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${fLo},${fLa};${tLo},${tLa}?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(4000)})
    const d = await res.json()
    if (d.code==="Ok"&&d.routes?.length) return d.routes[0].geometry.coordinates.map(([g,l]:[number,number])=>[l,g])
  } catch { /* fallback */ }
  // Grid fallback — approximates Houston block layout
  return [[fLa,fLo],[fLa,fLo+(tLo-fLo)*0.5],[fLa+(tLa-fLa)*0.7,fLo+(tLo-fLo)*0.7],[tLa,tLo]]
}

// ─── Leaflet icon builders (SVG, no emojis except caller) ────────────────────
const ICONS_SVG: Record<ResourceType,string> = {
  shelter: `<svg width="13" height="12" viewBox="0 0 13 12" fill="white"><path d="M6.5 1L1 5.5V11.5H5V8H8V11.5H12V5.5L6.5 1Z"/></svg>`,
  water:   `<svg width="11" height="13" viewBox="0 0 11 13" fill="white"><path d="M5.5 0.5C5.5 0.5 0.5 5.2 0.5 8.5a5 5 0 0010 0C10.5 5.2 5.5 0.5 5.5 0.5Z"/></svg>`,
  medical: `<svg width="12" height="12" viewBox="0 0 12 12" fill="white"><path d="M5 1V5H1V7H5V11H7V7H11V5H7V1H5Z"/></svg>`,
}
function typeColor(t:ResourceType){ return t==="shelter"?C.shelter:t==="water"?C.water:C.medical }
function typeBg(t:ResourceType){ return t==="shelter"?C.shelterBg:t==="water"?C.waterBg:C.medicalBg }

function makeResourceIcon(type:ResourceType, selected:boolean, isMatch=false){
  const col=typeColor(type), sz=selected?36:isMatch?30:26
  const shadow=selected?`box-shadow:0 0 0 5px ${col}33,0 2px 8px rgba(0,0,0,0.2);`
    :isMatch?`box-shadow:0 0 0 3px ${col}44;`:`box-shadow:0 1px 4px rgba(0,0,0,0.18);`
  return L.divIcon({
    html:`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${col};${shadow}display:flex;align-items:center;justify-content:center;border:2.5px solid white;">${ICONS_SVG[type]}</div>`,
    className:"",iconSize:[sz,sz],iconAnchor:[sz/2,sz/2],
  })
}
function makeCallerIcon(){
  return L.divIcon({
    html:`<div style="position:relative;width:38px;height:38px;"><div style="position:absolute;inset:0;border-radius:50%;background:${C.caller}44;animation:rp 1.8s ease-out infinite;"></div><div style="position:absolute;inset:7px;border-radius:50%;background:${C.caller};border:2.5px solid white;box-shadow:0 2px 10px ${C.caller}88;display:flex;align-items:center;justify-content:center;font-size:12px;">📞</div></div>`,
    className:"",iconSize:[38,38],iconAnchor:[19,19],
  })
}

// ─── MapPanel (imperative Leaflet) ────────────────────────────────────────────
function MapPanel({selectedId,callerVisible,onResourceClick,matchIds}:{
  selectedId:string|null;callerVisible:boolean;onResourceClick:(id:string)=>void;matchIds:string[]
}){
  const cRef=useRef<HTMLDivElement>(null),mapR=useRef<L.Map|null>(null)
  const mks=useRef<Map<string,L.Marker>>(new Map())
  const calR=useRef<L.Marker|null>(null),routeR=useRef<L.Polyline|null>(null),prevSel=useRef<string|null>(null)

  useEffect(()=>{
    if(!cRef.current||mapR.current)return
    const map=L.map(cRef.current,{center:[29.76,-95.37],zoom:11,zoomControl:false,attributionControl:false})
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:19}).addTo(map)
    RESOURCES.forEach(r=>{
      const m=L.marker([r.lat,r.lng],{icon:makeResourceIcon(r.type,false,matchIds.includes(r.id))}).addTo(map).on("click",()=>onResourceClick(r.id))
      mks.current.set(r.id,m)
    })
    mapR.current=map
    return()=>{map.remove();mapR.current=null}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  useEffect(()=>{RESOURCES.forEach(r=>mks.current.get(r.id)?.setIcon(makeResourceIcon(r.type,selectedId===r.id,matchIds.includes(r.id))))},[selectedId,matchIds])
  useEffect(()=>{
    if(!mapR.current)return
    if(callerVisible&&!calR.current) calR.current=L.marker([CALLER_LAT,CALLER_LNG],{icon:makeCallerIcon()}).addTo(mapR.current)
    if(!callerVisible&&calR.current){calR.current.remove();calR.current=null}
  },[callerVisible])
  useEffect(()=>{
    if(!mapR.current)return
    routeR.current?.remove();routeR.current=null
    if(!callerVisible||!selectedId){if(callerVisible&&!selectedId&&prevSel.current)mapR.current.flyTo([CALLER_LAT,CALLER_LNG],13,{duration:1});prevSel.current=selectedId;return}
    const r=RESOURCES.find(x=>x.id===selectedId);if(!r)return
    fetchRoute(CALLER_LAT,CALLER_LNG,r.lat,r.lng).then(pts=>{
      if(!mapR.current)return
      routeR.current=L.polyline(pts,{color:typeColor(r.type),weight:4,opacity:0.85}).addTo(mapR.current)
      if(selectedId!==prevSel.current){const b=L.latLngBounds([[CALLER_LAT,CALLER_LNG],[r.lat,r.lng]]).pad(0.32);mapR.current.flyToBounds(b,{duration:1.2})}
    })
    prevSel.current=selectedId
  },[selectedId,callerVisible])

  return(
    <div className="relative size-full">
      <div ref={cRef} className="size-full"/>
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1">
        {([["in",<ZoomIn size={14}/>],["out",<ZoomOut size={14}/>]] as [string,React.ReactNode][]).map(([d,icon])=>(
          <button key={d} onClick={()=>d==="in"?mapR.current?.zoomIn():mapR.current?.zoomOut()}
            style={{width:34,height:34,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",
              background:C.card,border:`1px solid ${C.border}`,color:C.inkMid,cursor:"pointer",
              boxShadow:"0 1px 4px rgba(139,59,40,0.12)"}}>
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Voice bars (live animation) ──────────────────────────────────────────────
const N_BARS = 36
function VoiceBars({speaking}:{speaking:boolean}){
  const [heights,setHeights]=useState(()=>Array.from({length:N_BARS},()=>5))
  useEffect(()=>{
    if(!speaking){setHeights(Array.from({length:N_BARS},()=>5));return}
    const id=setInterval(()=>setHeights(Array.from({length:N_BARS},(_,i)=>{
      const base=Math.abs(Math.sin(i*1.9)*20+Math.sin(i*0.7)*16+22)
      return Math.max(5,Math.min(50,base*(0.35+Math.random()*0.65)))
    })),110)
    return()=>clearInterval(id)
  },[speaking])
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height:56,padding:"0 2px"}}>
      {heights.map((h,i)=>(
        <div key={i} style={{flex:1,borderRadius:"2px 2px 0 0",height:`${h}px`,
          background:i%3===0?C.poppy:i%3===1?C.amber:"#d4826a",
          transition:speaking?"height 0.1s ease":"height 0.6s ease"}}/>
      ))}
    </div>
  )
}

// ─── Brain triage popup (floating over map) ───────────────────────────────────
interface TriageData { people?:string; medical?:string; needs?:string; location?:string; danger?:string }
function BrainPopup({triage,priority,onClose}:{triage:TriageData;priority:"P1"|"P2";onClose:()=>void}){
  const rows:[string,keyof TriageData,string?][]=[
    ["PEOPLE","people"],["MEDICAL","medical"],["NEEDS","needs"],["LOCATION","location"],["STATUS","danger",C.poppy],
  ]
  const pBg=priority==="P1"?C.rust:C.amber
  const pTx=priority==="P1"?"#fff9f3":C.ink
  return(
    <div style={{position:"absolute",top:16,right:16,zIndex:2000,width:270,borderRadius:12,overflow:"hidden",
      boxShadow:"0 8px 32px rgba(139,59,40,0.22)",animation:"slideDown 0.35s ease-out",
      border:`1px solid ${C.borderMid}`,background:C.card}}>
      {/* Priority header */}
      <div style={{background:pBg,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontWeight:800,fontSize:11,letterSpacing:"0.14em",color:pTx}}>
          02 · THE BRAIN — TRIAGE
        </span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:800,fontSize:10,letterSpacing:"0.1em",padding:"2px 8px",borderRadius:4,
            background:priority==="P1"?"rgba(255,249,243,0.2)":"rgba(139,59,40,0.18)",color:pTx}}>
            PRIORITY {priority}
          </span>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:pTx,display:"flex",padding:0}}>
            <X size={13}/>
          </button>
        </div>
      </div>
      {/* Triage fields */}
      <div style={{padding:"4px 0"}}>
        {rows.map(([label,key,color])=>{
          const val=triage[key];if(!val)return null
          return(
            <div key={key} style={{padding:"10px 14px"}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:C.inkFaint,marginBottom:3}}>{label}</div>
              <div style={{fontSize:12,fontWeight:500,lineHeight:1.45,color:color??C.ink}}>{val}</div>
            </div>
          )
        })}
        {Object.keys(triage).length===0&&(
          <div style={{padding:"16px 14px",fontSize:12,color:C.inkFaint,fontStyle:"italic"}}>Extracting triage data…</div>
        )}
      </div>
    </div>
  )
}

// ─── Ear panel — ringing ──────────────────────────────────────────────────────
function EarRinging({onAnswer}:{onAnswer:()=>void}){
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px",gap:24,textAlign:"center"}}>
      {/* Concentric ring animation */}
      <div style={{position:"relative",width:164,height:164,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:`1.5px solid ${C.poppy}22`,animation:"ring 2.2s ease-out infinite"}}/>
        <div style={{position:"absolute",inset:18,borderRadius:"50%",border:`1.5px solid ${C.poppy}33`,animation:"ring 2.2s ease-out 0.45s infinite"}}/>
        <div style={{position:"absolute",inset:36,borderRadius:"50%",border:`1.5px solid ${C.poppy}55`,animation:"ring 2.2s ease-out 0.9s infinite"}}/>
        <div style={{width:72,height:72,borderRadius:"50%",background:C.poppy,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 24px ${C.poppy}55`}}>
          <Phone size={30} color="white" fill="white"/>
        </div>
      </div>
      <div>
        <div style={{fontWeight:800,fontSize:22,color:C.ink,fontFamily:"Inter,sans-serif"}}>Call ringing…</div>
        <div style={{marginTop:8,fontSize:13,lineHeight:1.6,color:C.inkMid,maxWidth:230}}>
          Someone is calling for help in a language you may not speak. Pick up — RELAY listens with you.
        </div>
      </div>
      <button onClick={onAnswer} style={{padding:"12px 32px",borderRadius:10,fontWeight:700,fontSize:14,
        background:C.teal,color:"white",cursor:"pointer",border:"none",
        boxShadow:`0 3px 14px ${C.teal}55`}}>
        Answer the call
      </button>
    </div>
  )
}

// ─── Ear panel — listening ────────────────────────────────────────────────────
function EarListening({turns,activeTurnIdx,speaking}:{turns:Turn[];activeTurnIdx:number|null;speaking:boolean}){
  const scrollRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight},[turns])
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"0 4px 4px",flexShrink:0}}>
        <VoiceBars speaking={speaking}/>
      </div>
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,padding:"8px 12px"}}>
        {turns.map((t,i)=>{
          const isActive=activeTurnIdx===i
          const isCaller=t.speaker==="caller"
          return(
            <div key={i} style={{display:"flex",justifyContent:isCaller?"flex-start":"flex-end"}}>
              <div style={{
                maxWidth:"88%",padding:"9px 12px",borderRadius:isCaller?"4px 12px 12px 12px":"12px 4px 12px 12px",
                background:isActive?(isCaller?C.peach:"#d4eaf8"):isCaller?C.card:"#e8f2fc",
                border:isActive?`1.5px solid ${isCaller?C.poppy:C.teal}`:`1px solid ${C.border}`,
                boxShadow:isActive?`0 0 0 3px ${isCaller?C.poppy+"22":C.teal+"22"}`:"none",
                transition:"all 0.2s ease",
              }}>
                {/* Label */}
                <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",
                  color:isCaller?C.poppy:C.teal,marginBottom:4}}>
                  {isCaller?"CALLER · hi":"RELAY"}
                </div>
                {/* Original text */}
                <div style={{fontSize:11.5,lineHeight:1.55,color:C.ink,
                  fontFamily:isCaller?"JetBrains Mono,monospace":"Inter,sans-serif"}}>
                  {t.text}
                </div>
                {/* Translation */}
                {isCaller&&t.translation&&(
                  <div style={{marginTop:5,paddingTop:4}}>
                    <span style={{fontSize:9,fontWeight:600,letterSpacing:"0.08em",color:C.inkFaint}}>EN → </span>
                    <span style={{fontSize:11,fontStyle:"italic",color:C.inkSoft,lineHeight:1.5}}>{t.translation}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{padding:"6px 14px",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:speaking?C.poppy:C.inkFaint,
          animation:speaking?"rp 1s ease-in-out infinite":"none"}}/>
        <span style={{fontSize:10,color:C.inkSoft}}>live transcription</span>
      </div>
    </div>
  )
}

// ─── Matchmaker panel ─────────────────────────────────────────────────────────
function MatchmakerPanel({selectedId,onSelect}:{selectedId:string|null;onSelect:(id:string)=>void}){
  const typeIcon=(t:string)=>t==="shelter"?<Home size={10}/>:t==="water"?<Droplets size={10}/>:<HeartPulse size={10}/>
  const tagColor=(t:string)=>t==="shelter"?C.shelter:t==="water"?C.water:t==="medical"?C.medical:C.amber
  const tagBg=(t:string)=>t==="shelter"?C.shelterBg:t==="water"?C.waterBg:t==="medical"?C.medicalBg:"#fef3c7"

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:14}}>
        {MATCHES.map((r,i)=>{
          const sel=selectedId===r.id
          const col=typeColor(r.type)
          return(
            <button key={r.id} onClick={()=>onSelect(r.id)} style={{
              width:"100%",textAlign:"left",borderRadius:14,padding:"14px 16px",cursor:"pointer",
              border:`2px solid ${sel?col:C.border}`,
              background:sel?typeBg(r.type):C.card,
              boxShadow:sel?`0 4px 16px ${col}25`:"0 1px 4px rgba(139,59,40,0.07)",
              transition:"all 0.2s ease",
            }}>
              {/* Top row */}
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
                <div style={{flex:1,minWidth:0}}>
                  {i===0&&(
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                      <CheckCircle2 size={11} style={{color:C.teal}}/>
                      <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",color:C.teal}}>MATCH · DISPATCHED</span>
                    </div>
                  )}
                  <div style={{fontWeight:700,fontSize:13,color:C.ink,lineHeight:1.3}}>{r.name}</div>
                  <div style={{fontSize:11,color:C.inkSoft,marginTop:3,lineHeight:1.4}}>{r.note}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:"JetBrains Mono,monospace",fontWeight:800,fontSize:15,color:col}}>{r.distanceKm} km</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3,marginTop:2}}>
                    <Clock size={9} style={{color:C.inkSoft}}/>
                    <span style={{fontSize:10,color:C.inkSoft}}>~{r.driveMin} min</span>
                  </div>
                </div>
              </div>
              {/* Service tags */}
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                {r.has.map(s=>(
                  <span key={s} style={{display:"inline-flex",alignItems:"center",gap:3,
                    fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:20,
                    background:tagBg(s),color:tagColor(s)}}>
                    {typeIcon(s)}{s}
                  </span>
                ))}
              </div>
              {/* Capacity bar */}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1,height:5,borderRadius:3,background:"rgba(139,59,40,0.1)"}}>
                  <div style={{height:"100%",borderRadius:3,background:col,
                    width:`${Math.round(r.remaining/r.capacity*100)}%`,transition:"width 0.4s ease"}}/>
                </div>
                <span style={{fontSize:10,fontFamily:"JetBrains Mono,monospace",color:C.inkSoft,flexShrink:0}}>{r.remaining}/{r.capacity}</span>
              </div>
              {/* Direction hint when selected */}
              {sel&&(
                <div style={{marginTop:10,display:"flex",alignItems:"center",justifyContent:"center",gap:5,
                  padding:"7px",borderRadius:8,background:`${col}18`,color:col,fontSize:11,fontWeight:600}}>
                  <Navigation size={12}/>Route displayed on map
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Dispatch highlight box */}
      <div style={{margin:"0 14px 14px",borderRadius:12,overflow:"hidden",flexShrink:0,
        boxShadow:"0 2px 12px rgba(139,59,40,0.18)"}}>
        <div style={{background:C.rust,padding:"12px 16px"}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",color:"rgba(255,249,243,0.6)",marginBottom:5}}>
            DISPATCH ISSUED · HANDED TO A HUMAN RESPONDER
          </div>
          <div style={{fontSize:12,fontWeight:600,color:"#fff9f3",lineHeight:1.6}}>
            Family of 4 · water + shelter needed
          </div>
          <div style={{fontSize:12,fontWeight:500,color:C.tealLight,lineHeight:1.6}}>
            → {MATCHES[0]?.name} — {MATCHES[0]?.distanceKm} km
          </div>
        </div>
        <div style={{background:"#f0e2d0",padding:"9px 16px"}}>
          <div style={{fontSize:10,fontStyle:"italic",color:C.inkSoft,lineHeight:1.5}}>
            A real responder confirms before anyone is moved. RELAY never closes the loop alone.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Agent log ────────────────────────────────────────────────────────────────
function AgentLog({steps}:{steps:string[]}){
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight},[steps])
  return(
    <div ref={ref} style={{borderTop:`1px solid ${C.border}`,padding:"8px 14px",maxHeight:76,overflowY:"auto",flexShrink:0}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkFaint,marginBottom:4}}>Agent process</div>
      {steps.map((s,i)=>{
        const isCurrent=i===steps.length-1
        return(
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
            <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,
              background:isCurrent?C.poppy:C.teal,opacity:isCurrent?1:0.4}}/>
            <span style={{fontSize:10,fontFamily:"JetBrains Mono,monospace",
              color:isCurrent?C.inkMid:C.inkSoft,
              fontWeight:isCurrent?700:400}}>
              {s}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [stage,       setStage]       = useState<AppStage>("ringing")
  const [turns,       setTurns]       = useState<Turn[]>([])
  const [activeTurnIdx,setActiveTurn] = useState<number|null>(null)
  const [speaking,    setSpeaking]    = useState(false)
  const [triage,      setTriage]      = useState<TriageData>({})
  const [brainVisible,setBrainVisible]= useState(false)
  const [selectedId,  setSelectedId]  = useState<string|null>(null)
  const [agentSteps,  setAgentSteps]  = useState(["Waiting for incoming call…"])
  const [elapsed,     setElapsed]     = useState(0)
  const timers=useRef<ReturnType<typeof setTimeout>[]>([])

  const clr=()=>{timers.current.forEach(clearTimeout);timers.current=[]}
  const at=(fn:()=>void,ms:number)=>timers.current.push(setTimeout(fn,ms))

  // Elapsed clock
  useEffect(()=>{
    if(stage==="ringing"){setElapsed(0);return}
    const id=setInterval(()=>setElapsed(p=>p+1),1000)
    return()=>clearInterval(id)
  },[stage])

  // Agent steps sync
  useEffect(()=>{
    if(stage==="ringing")return
    const vis=AGENT_STEPS.filter(s=>s.t<=elapsed).map(s=>s.text)
    if(vis.length)setAgentSteps(vis)
  },[elapsed,stage])

  const handleAnswer=useCallback(()=>{
    clr()
    setStage("listening")
    setTurns([]);setTriage({});setBrainVisible(false);setSelectedId(null)
    setAgentSteps([AGENT_STEPS[0].text]);setSpeaking(false);setActiveTurn(null)

    // Stream turns with speaking tracking
    let cursor=0
    TURNS_DATA.forEach((td,i)=>{
      // Show turn bubble
      at(()=>{
        setTurns(prev=>[...prev,{speaker:td.speaker,text:td.text,translation:td.translation}])
        setActiveTurn(i)
        if(td.speaker==="caller"){setSpeaking(true)}
      },cursor)
      cursor+=td.speakMs+600
      // Stop speaking after caller turn
      if(td.speaker==="caller"){
        at(()=>setSpeaking(false),cursor-400)
      }
    })

    // Brain popup at 5s
    at(()=>setBrainVisible(true),5000)
    at(()=>setTriage(p=>({...p,needs:"Drinking water · shelter"})),7000)
    at(()=>setTriage(p=>({...p,people:"4 — one family, 2 adults & 2 children"})),11000)
    at(()=>setTriage(p=>({...p,location:"Montrose area, near Westheimer & Kirby"})),13000)
    at(()=>setTriage(p=>({...p,medical:"No injuries reported · safe to transport"})),14500)
    at(()=>setTriage(p=>({...p,danger:"Rapidly rising floodwater — time-sensitive"})),15500)

    // Transition to matched
    at(()=>{
      setStage("matched")
      setBrainVisible(false)
      setActiveTurn(null)
      setSpeaking(false)
      setSelectedId(MATCHES[0].id)
    },22000)
  },[])

  const handleEndCall=useCallback(()=>{
    clr()
    setStage("ringing")
    setTurns([]);setTriage({});setBrainVisible(false);setSelectedId(null)
    setElapsed(0);setSpeaking(false);setActiveTurn(null)
    setAgentSteps(["Waiting for incoming call…"])
  },[])

  const handleResourceClick=useCallback((id:string)=>{
    if(MATCHES.find(r=>r.id===id))setSelectedId(prev=>prev===id?null:id)
  },[])

  const callerVisible=stage!=="ringing"
  const matchIds=MATCHES.map(r=>r.id)
  const priority: "P1"|"P2"=triage.danger?"P1":"P2"
  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`

  return(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",
      fontFamily:"Inter,sans-serif",background:C.bg}}>
      <style>{`
        @keyframes rp  {0%{transform:scale(1);opacity:.8}100%{transform:scale(2.6);opacity:0}}
        @keyframes ring{0%{transform:scale(0.88);opacity:.6}100%{transform:scale(1.55);opacity:0}}
        @keyframes slideDown{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeLeft{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-20px)}}
        @keyframes slideUp{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
        .leaflet-container{background:#e8e0d4;}
        .leaflet-control-attribution,.leaflet-control-zoom{display:none!important;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:rgba(139,59,40,0.2);border-radius:2px;}
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{background:C.card,borderBottom:`1.5px solid ${C.ink}`,height:46,flexShrink:0,
        display:"flex",alignItems:"center",padding:"0 20px",gap:0}}>
        {/* RELAY. wordmark — slab serif */}
        <span style={{fontFamily:"'Roboto Slab',serif",fontWeight:900,fontSize:20,color:C.ink,
          letterSpacing:"-0.01em",lineHeight:1,marginRight:16}}>
          RELAY<span style={{color:C.poppy}}>.</span>
        </span>
        <div style={{width:1,height:22,background:C.border,marginRight:16}}/>
        <span style={{fontSize:10,fontWeight:600,letterSpacing:"0.2em",textTransform:"uppercase",color:C.inkSoft}}>
          Intake Console
        </span>
        {/* Center — line open + case */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          {stage!=="ringing"&&<>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#3db875",animation:"rp 1.5s ease-out infinite"}}/>
              <span style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",color:C.inkSoft}}>LINE OPEN</span>
            </div>
            <div style={{width:1,height:14,background:C.border}}/>
            <span style={{fontSize:10,color:C.inkSoft}}>
              CASE <strong style={{color:C.ink,fontWeight:700}}>INC-2026-0418</strong>
            </span>
          </>}
        </div>
        {/* Right — timer + end call + avatar */}
        {stage!=="ringing"&&<>
          <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:C.inkSoft,marginRight:12}}>{fmt(elapsed)}</span>
          <button onClick={handleEndCall} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 11px",
            borderRadius:7,background:C.poppy,color:"white",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
            marginRight:12}}>
            <PhoneOff size={12}/> End Call
          </button>
        </>}
        <div style={{width:30,height:30,borderRadius:"50%",background:C.peach,border:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:C.poppy}}>A</div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Left panel */}
        <div style={{width:360,flexShrink:0,background:C.panel,borderRight:`1px solid ${C.border}`,
          display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Panel header */}
          <div style={{padding:"10px 14px 8px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.14em",color:C.poppy}}>
                {stage==="matched"?"03 · THE MATCHMAKER":"01 · THE EAR"}
              </span>
              <span style={{fontSize:9,color:C.inkSoft}}>{stage==="matched"?"★ matched":"via Deepgram"}</span>
            </div>
            {stage!=="ringing"&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:C.peach,border:`2px solid ${C.poppy}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:C.poppy,fontSize:14}}>M</div>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:C.ink}}>
                    {stage==="matched"?"Match complete":"Incoming caller"}
                  </div>
                  <div style={{fontSize:11,color:C.inkMid}}>Detected language · <strong>Hindi</strong></div>
                </div>
              </div>
            )}
          </div>
          {/* Body */}
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            {stage==="ringing"&&<EarRinging onAnswer={handleAnswer}/>}
            {stage==="listening"&&<EarListening turns={turns} activeTurnIdx={activeTurnIdx} speaking={speaking}/>}
            {stage==="matched"&&<MatchmakerPanel selectedId={selectedId} onSelect={setSelectedId}/>}
          </div>
          {/* Agent log always present */}
          <AgentLog steps={agentSteps}/>
        </div>

        {/* Map area (full right side) */}
        <div style={{flex:1,position:"relative",overflow:"hidden"}}>
          <MapPanel selectedId={selectedId} callerVisible={callerVisible} onResourceClick={handleResourceClick} matchIds={matchIds}/>

          {/* Brain triage popup */}
          {brainVisible&&<BrainPopup triage={triage} priority={priority} onClose={()=>setBrainVisible(false)}/>}

          {/* Legend — bottom right, above dispatch bar */}
          <div style={{position:"absolute",bottom: stage==="matched"&&selectedId ? 72 : 16,right:16,zIndex:1000,borderRadius:10,
            background:"rgba(245,228,204,0.95)",border:`1px solid ${C.border}`,
            padding:"12px 16px",backdropFilter:"blur(8px)",
            boxShadow:"0 2px 12px rgba(139,59,40,0.1)",minWidth:130,
            transition:"bottom 0.3s ease"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkSoft,marginBottom:8}}>Key</div>
            {([["Shelter",C.shelter],["Water",C.water],["Medical",C.medical]] as [string,string][]).map(([l,col])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:col,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:500,color:C.inkMid}}>{l}</span>
              </div>
            ))}
            {callerVisible&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:C.caller,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:500,color:C.inkMid}}>Caller</span>
              </div>
            )}
          </div>

          {/* Dispatch bar */}
          {stage==="matched"&&selectedId&&(()=>{
            const r=RESOURCES.find(x=>x.id===selectedId);if(!r)return null
            const col=typeColor(r.type)
            return(
              <div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:1000,
                background:"rgba(245,228,204,0.97)",border:`2px solid ${col}`,
                borderRadius:12,padding:"11px 20px",backdropFilter:"blur(8px)",whiteSpace:"nowrap",
                display:"flex",alignItems:"center",gap:10,
                boxShadow:`0 4px 24px ${col}44`,animation:"slideUp 0.3s ease-out"}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:col,boxShadow:`0 0 7px ${col}`,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:500,color:C.ink}}>
                  <span style={{color:C.inkSoft}}>Routing to </span>
                  <strong>{r.name}</strong>
                  <span style={{color:C.inkSoft}}> · {r.distanceKm} km · {r.remaining} beds avail.</span>
                </span>
                <span style={{fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:5,flexShrink:0,
                  background:C.amber,color:C.ink}}>P2 · Urgent</span>
              </div>
            )
          })()}

          {/* Standby overlay */}
          {stage==="ringing"&&(
            <div style={{position:"absolute",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
              <div style={{textAlign:"center",background:"rgba(245,228,204,0.93)",border:`1px solid ${C.border}`,
                borderRadius:16,padding:"28px 36px",backdropFilter:"blur(12px)"}}>
                <div style={{fontSize:14,fontWeight:700,color:C.ink,marginBottom:4}}>Intake system ready</div>
                <div style={{fontSize:12,color:C.inkMid}}>Answer the call to begin the simulation</div>
              </div>
            </div>
          )}

          <div style={{position:"absolute",bottom:8,left:8,zIndex:1000,fontSize:10,color:C.inkFaint,
            background:"rgba(245,228,204,0.85)",padding:"3px 8px",borderRadius:4}}>
            Prototype · Mock dataset · Houston, TX
          </div>
        </div>
      </div>
    </div>
  )
}
