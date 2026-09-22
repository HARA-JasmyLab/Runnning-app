const KEY = "atta-mvp-v1";
const defaults = {
  screen:"home-empty", tripStatus:"none", stamps:6, memoryAdded:false,
  diaryReady:false, locationGranted:false, day:1, image:null, note:"",
  interests:["グルメ","絶景","子ども向け"], companion:"家族", pace:"バランス"
};
let state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}"));
const app = document.querySelector("#app");
const overlay = document.querySelector("#overlay");
const sheet = document.querySelector("#sheet");
const toastEl = document.querySelector("#toast");
const offline = document.querySelector("#offline");
const ATTA_CONFIG = window.ATTA_CONFIG || {};
function resolveMapboxToken(){
  const params=new URLSearchParams(location.search);
  const oneTime=params.get("mapbox_token");
  if(oneTime && oneTime.startsWith("pk.")){
    try{ localStorage.setItem("atta-mapbox-public-token",oneTime); }catch{}
    params.delete("mapbox_token");
    const clean=location.pathname+(params.toString()?"?"+params.toString():"")+location.hash;
    history.replaceState(null,"",clean);
    return oneTime;
  }
  try{
    return ATTA_CONFIG.MAPBOX_PUBLIC_TOKEN || localStorage.getItem("atta-mapbox-public-token") || "";
  }catch{
    return ATTA_CONFIG.MAPBOX_PUBLIC_TOKEN || "";
  }
}
let MAPBOX_TOKEN = resolveMapboxToken();
const MAPBOX_STYLE = ATTA_CONFIG.MAPBOX_STYLE_URL || "mapbox://styles/mapbox/dark-v11";

const KYOTO_MAP = {
  fallbackCenter:[135.6732,35.0154],
  current:[135.67755,35.01308],
  bamboo:[135.67133,35.01718],
  tenryuji:[135.67382,35.01573],
  nogu:[135.67425,35.01762]
};
let liveMapInstance = null;
let liveUserMarker = null;
let liveWatchId = null;
let liveGeofenceTimer = null;
let liveRouteStart = null;

function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function go(screen, patch){ state = Object.assign({}, state, patch || {}, {screen}); save(); render(); window.scrollTo(0,0); }
function toast(message){ toastEl.textContent=message; toastEl.classList.add("show"); clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>toastEl.classList.remove("show"),2200); }
function openSheet(html){ sheet.innerHTML=html; overlay.classList.add("open"); overlay.setAttribute("aria-hidden","false"); }
function closeSheet(){ overlay.classList.remove("open"); overlay.setAttribute("aria-hidden","true"); }
function destroyLiveMap(){
  if(liveWatchId!=null && navigator.geolocation){ navigator.geolocation.clearWatch(liveWatchId); liveWatchId=null; }
  if(liveGeofenceTimer){ clearTimeout(liveGeofenceTimer); liveGeofenceTimer=null; }
  liveRouteStart=null;
  if(liveMapInstance){ try{ liveMapInstance.remove(); }catch{} liveMapInstance=null; liveUserMarker=null; }
}
function routeCacheKey(updated){ return updated ? "atta-route-tenryuji-v2" : "atta-route-bamboo-v2"; }
function haversineMeters(a,b){
  const R=6371000, toRad=v=>v*Math.PI/180;
  const dLat=toRad(b[1]-a[1]), dLon=toRad(b[0]-a[0]);
  const lat1=toRad(a[1]), lat2=toRad(b[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function fallbackRoute(updated,startCoord=null){
  const start=startCoord || (updated?KYOTO_MAP.bamboo:KYOTO_MAP.current);
  const coordinates=updated
    ? [start,KYOTO_MAP.tenryuji]
    : startCoord ? [start,KYOTO_MAP.bamboo] : [start,KYOTO_MAP.nogu,KYOTO_MAP.bamboo];
  return {feature:{type:"Feature",geometry:{type:"LineString",coordinates},properties:{}},distance:null,duration:null,live:false};
}
async function fetchWalkingRoute(updated,startCoord=null){
  if(!MAPBOX_TOKEN) return fallbackRoute(updated,startCoord);
  const cacheable=!startCoord;
  const key=routeCacheKey(updated);
  if(cacheable){
    try{
      const cached=sessionStorage.getItem(key);
      if(cached) return JSON.parse(cached);
    }catch{}
  }
  const start=startCoord || (updated?KYOTO_MAP.bamboo:KYOTO_MAP.current);
  const points=updated ? [start,KYOTO_MAP.tenryuji] : startCoord ? [start,KYOTO_MAP.bamboo] : [start,KYOTO_MAP.nogu,KYOTO_MAP.bamboo];
  const coords=points.map(p=>p.join(",")).join(";");
  try{
    const response=await fetch("https://api.mapbox.com/directions/v5/mapbox/walking/"+coords+"?geometries=geojson&overview=full&steps=false&access_token="+encodeURIComponent(MAPBOX_TOKEN));
    if(!response.ok) throw new Error("Directions "+response.status);
    const data=await response.json();
    const route=data.routes && data.routes[0];
    if(!route || !route.geometry) throw new Error("No route");
    const result={feature:{type:"Feature",geometry:route.geometry,properties:{}},distance:route.distance,duration:route.duration,live:true};
    if(cacheable){ try{ sessionStorage.setItem(key,JSON.stringify(result)); }catch{} }
    return result;
  }catch(err){
    console.warn("ATTA Mapbox Directions fallback",err);
    return fallbackRoute(updated,startCoord);
  }
}
function formatDistance(meters){
  if(!Number.isFinite(meters)) return "距離計算中";
  return meters<1000 ? Math.max(1,Math.round(meters/10)*10)+"m" : (meters/1000).toFixed(1)+"km";
}
function updateRouteMeta(routeInfo){
  const eta=document.querySelector('[data-role="route-time"]');
  const meta=document.querySelector('[data-role="route-meta"]');
  if(routeInfo && Number.isFinite(routeInfo.duration)){
    const minutes=Math.max(1,Math.round(routeInfo.duration/60));
    if(eta) eta.textContent="徒歩 "+minutes+"分";
    if(meta) meta.textContent=formatDistance(routeInfo.distance)+" · Mapbox";
  }else{
    if(eta) eta.textContent="徒歩ルート";
    if(meta) meta.textContent="現在地から計算";
  }
}
function triggerGeofenceArrival(){
  if(state.screen!=="live-map" || state.stamps>=7) return;
  go("approaching");
  setTimeout(()=>go("arrival"),850);
  setTimeout(()=>go("stamp",{stamps:Math.max(state.stamps,7)}),2050);
}
function checkGeofence(coords,accuracy,updated){
  if(updated || state.stamps>=7) return;
  const distance=haversineMeters(coords,KYOTO_MAP.bamboo);
  const proximity=document.querySelector('[data-role="proximity"]');
  if(proximity) proximity.textContent=distance<1000?Math.round(distance)+"m":(distance/1000).toFixed(1)+"km";
  const eligible=distance<=150 && Number.isFinite(accuracy) && accuracy<=50;
  if(eligible && !liveGeofenceTimer){
    toast("竹林の小径に到着しました。20秒間、位置を確認します");
    liveGeofenceTimer=setTimeout(triggerGeofenceArrival,20000);
  }else if(!eligible && liveGeofenceTimer){
    clearTimeout(liveGeofenceTimer); liveGeofenceTimer=null;
  }
}
function markerEl(kind,label){
  const el=document.createElement("button");
  el.type="button";
  el.className="atta-map-marker "+kind;
  el.setAttribute("aria-label",label);
  el.innerHTML=kind==="current" ? '<span class="pulse-dot"></span>' : kind==="next" ? '<span class="marker-num">7</span>' : '<span class="marker-check">✓</span>';
  return el;
}
async function initMapboxMap(updated){
  const container=document.querySelector("#mapboxMap");
  const shell=document.querySelector(".map");
  if(!container || !shell) return;
  const mapEngine=MAPBOX_TOKEN ? window.mapboxgl : (window.maplibregl || window.mapboxgl);
  if(!mapEngine){
    shell.classList.add("mapbox-unavailable");
    return;
  }
  try{
    if(MAPBOX_TOKEN && window.mapboxgl) window.mapboxgl.accessToken=MAPBOX_TOKEN;
    const liveStyle=MAPBOX_TOKEN ? MAPBOX_STYLE : {
      version:8,
      sources:{
        osm:{
          type:"raster",
          tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize:256,
          attribution:"© OpenStreetMap contributors"
        }
      },
      layers:[
        {id:"osm",type:"raster",source:"osm",paint:{"raster-saturation":-0.38,"raster-contrast":0.12,"raster-brightness-min":0.08,"raster-brightness-max":0.78}}
      ]
    };
    liveMapInstance=new mapEngine.Map({
      container,
      style:liveStyle,
      center:updated ? [135.6728,35.0164] : [135.6741,35.0153],
      zoom:15.4,
      bearing:-14,
      pitch:38,
      attributionControl:true,
      cooperativeGestures:false
    });
    liveMapInstance.addControl(new mapEngine.NavigationControl({showCompass:false}),"top-right");
    liveMapInstance.once("load",async()=>{
      shell.classList.add("mapbox-live");
      const routeInfo=await fetchWalkingRoute(updated);
      if(!liveMapInstance) return;
      liveMapInstance.addSource("atta-route",{type:"geojson",data:routeInfo.feature});
      liveMapInstance.addLayer({id:"atta-route-casing",type:"line",source:"atta-route",paint:{"line-color":"#ffffff","line-width":8,"line-opacity":0.96}});
      liveMapInstance.addLayer({id:"atta-route-line",type:"line",source:"atta-route",paint:{"line-color":"#ff355c","line-width":4,"line-opacity":1}});
      updateRouteMeta(routeInfo);
      new mapEngine.Marker({element:markerEl("visited","渡月橋")}).setLngLat(KYOTO_MAP.current).addTo(liveMapInstance);
      new mapEngine.Marker({element:markerEl(updated?"visited":"next",updated?"竹林の小径・訪問済み":"竹林の小径")}).setLngLat(KYOTO_MAP.bamboo).addTo(liveMapInstance);
      new mapEngine.Marker({element:markerEl("visited","野宮神社")}).setLngLat(KYOTO_MAP.nogu).addTo(liveMapInstance);
      if(updated) new mapEngine.Marker({element:markerEl("next","天龍寺")}).setLngLat(KYOTO_MAP.tenryuji).addTo(liveMapInstance);
      liveUserMarker=new mapEngine.Marker({element:markerEl("current","現在地")}).setLngLat(KYOTO_MAP.current).addTo(liveMapInstance);

      if(state.locationGranted && navigator.geolocation){
        liveWatchId=navigator.geolocation.watchPosition(async pos=>{
          if(!liveMapInstance || !liveUserMarker) return;
          const coords=[pos.coords.longitude,pos.coords.latitude];
          liveUserMarker.setLngLat(coords);
          checkGeofence(coords,pos.coords.accuracy,updated);
          if(!liveRouteStart && MAPBOX_TOKEN){
            liveRouteStart=coords;
            const liveRoute=await fetchWalkingRoute(updated,coords);
            const src=liveMapInstance && liveMapInstance.getSource("atta-route");
            if(src && src.setData) src.setData(liveRoute.feature);
            updateRouteMeta(liveRoute);
          }
        },()=>{}, {enableHighAccuracy:true,maximumAge:5000,timeout:12000});
      }
    });
    liveMapInstance.on("error",e=>console.warn("ATTA Mapbox",e && e.error ? e.error : e));
  }catch(err){
    console.warn("ATTA Mapbox init fallback",err);
    shell.classList.add("mapbox-unavailable");
  }
}
function brand(){ return '<div class="brand">ATTA<i>!</i></div>'; }
function top(title, back){ return '<div class="topbar">'+(back===false?brand():'<button class="back" data-action="back">‹</button>')+(title?'<strong>'+title+'</strong>':'')+'<button class="icon-btn" data-action="menu">•••</button></div>'; }
function icon(name){
  const icons={
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 3l8.5 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-4.8v-6.2H9.8V21H5a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
    plan:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 5 5-2 6 2 5-2v16l-5 2-6-2-5 2zM9 3v16m6-14v16"/></svg>',
    memories:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2z"/><path d="M7 18a2 2 0 0 0 0 4h12v-4M9 8h6M9 12h4"/></svg>',
    profile:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.5-4.8 3-7.1 7.5-7.1s7 2.3 7.5 7.1"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  return icons[name]||'';
}
function nav(active){
  return '<nav class="bottom-nav">'+
    item("home","home","ホーム",active)+item("plan","plan","プラン",active)+
    '<button class="nav-plus" data-action="new-trip" aria-label="新しい旅">'+icon("plus")+'</button>'+
    item("memories","memories","思い出",active)+item("profile","profile","マイページ",active)+
  '</nav>';
}
function item(id, ico, label, active){ return '<button class="nav-item '+(id===active?'active':'')+'" data-action="tab" data-tab="'+id+'">'+icon(ico)+'<span>'+label+'</span></button>'; }
function chips(values, selected, key){
  return '<div class="pills">'+values.map(v=>'<button class="chip '+(selected.indexOf(v)>=0?'on':'')+'" data-action="chip" data-key="'+key+'" data-value="'+v+'">'+v+'</button>').join("")+'</div>';
}
function stampStrip(count){
  const labels=["京都駅","鉄道","錦市場","清水寺","嵐山","渡月橋","竹林","天龍寺","祇園","伏見"];
  return '<div class="stamp-strip">'+labels.map((v,i)=>'<div class="mini-stamp"><div class="stamp-dot '+(i<count?'earned':'')+'">'+(i<count?'ATTA!':'?')+'</div><div class="caption muted">'+(i<count?v:'未発見')+'</div></div>').join("")+'</div>';
}
function stats(){ return '<div class="stats"><div class="stat"><strong>6</strong><span class="caption">Spot</span></div><div class="stat"><strong>'+state.stamps+'</strong><span class="caption">Stamp</span></div><div class="stat"><strong>18</strong><span class="caption">Photos</span></div><div class="stat"><strong>8.2</strong><span class="caption">km</span></div></div>'; }

function homeEmpty(){
  return '<section class="screen">'+top("",false)+'<div class="content">'+
    '<div style="padding:18px 0 20px"><h1 class="h1">次は、どこへ行こう。</h1><p class="body muted" style="margin-top:8px">AIと一緒に、次の旅を見つけよう。</p></div>'+
    '<div class="hero trip-photo"><div class="hand-note">your next story →</div><div class="postmark">ATTA!<br>TRAVEL</div><svg class="route-doodle" viewBox="0 0 370 282" preserveAspectRatio="none"><path d="M32 226 C82 187,96 215,139 166 S211 126,247 145 S306 104,339 57"/><circle cx="32" cy="226" r="5"/><circle cx="339" cy="57" r="5"/></svg><div class="hero-copy"><div class="caption">CREATE A NEW TRIP</div><h2 class="h2" style="margin:6px 0">旅程づくりは、AIにまかせよう。</h2><p class="small">行き先と気分を伝えるだけ。</p></div></div>'+
    '<button class="btn primary" style="margin-top:14px" data-action="new-trip">✨ AIに旅を考えてもらう</button>'+
    '<div class="section"><div class="row between"><h3 class="h3">これまでの旅</h3><button class="back" data-action="tab" data-tab="memories" style="font-size:13px">すべて見る</button></div>'+
    '<div class="card pad" style="margin-top:10px"><p class="muted small">まだ旅の記録はありません。最初の旅をつくってみましょう。</p></div></div>'+
    '</div>'+nav("home")+'</section>';
}
function plannedHome(active){
  const isActive = active || state.tripStatus==="active";
  return '<section class="screen">'+top("",false)+'<div class="content">'+
    '<div style="padding:12px 0 16px"><div class="caption muted">'+(isActive?'NOW TRAVELING':'UPCOMING TRIP')+'</div><h1 class="h1">'+(isActive?'旅の途中。':'京都をめぐる 2泊3日')+'</h1></div>'+
    '<div class="hero street"><div class="hand-note">'+(isActive?'keep exploring →':'almost time to go →')+'</div><div class="postmark">KYOTO<br>'+(isActive?'DAY 1':'3 DAYS')+'</div><svg class="route-doodle" viewBox="0 0 370 282" preserveAspectRatio="none"><path d="M34 219 C88 182,101 213,148 169 S225 127,264 148 S315 109,338 64"/><circle cx="34" cy="219" r="5"/><circle cx="338" cy="64" r="5"/></svg><div class="hero-copy"><div class="caption">'+(isActive?'DAY 1 · 3 / 6 SPOTS':'2026.09.21 - 09.23')+'</div><h2 class="h2" style="margin:6px 0">'+(isActive?'次は、嵐山。':'京都で見つける、家族の3日間')+'</h2><p class="small">'+(isActive?'竹林の小径まであと18分':'家族4人 · AIがつくった旅のしおり')+'</p></div></div>'+
    '<button class="btn '+(isActive?'red':'primary')+'" style="margin-top:14px" data-action="'+(isActive?'live-map':'itinerary')+'">'+(isActive?'ルートを見る':'旅のしおりを見る')+'</button>'+
    (!isActive?'<button class="btn secondary" style="margin-top:8px" data-action="start-trip">旅を開始</button>':'')+
    '<div class="section ai"><div class="ai-tag">ATTA! AI</div><p class="body" style="margin-top:6px">'+(isActive?'予定より25分早く進んでいます。近くの抹茶カフェに寄れそうです。':'朝の嵐山は比較的人が少なめ。DAY 2の最初に回すプランがおすすめです。')+'</p><button class="btn ghost" style="margin-top:7px;min-height:38px" data-action="ai-suggestion">追加する</button></div>'+
    '<div class="section"><div class="row between"><h3 class="h3">'+(isActive?'今日のスタンプ':'スタンプ予定')+'</h3><strong class="small">'+state.stamps+' / 10</strong></div>'+stampStrip(state.stamps)+'</div>'+
    '</div>'+nav("home")+'</section>';
}
function createTrip(){
  return '<section class="screen no-nav">'+top("旅をつくる",true)+'<div class="content">'+
    '<h1 class="h1">どんな旅にする？</h1><p class="body muted" style="margin-top:7px">ざっくり教えてくれれば、ATTA! AIが旅程をつくります。</p>'+
    '<div class="planner-preview"><span>KYOTO · 3 DAYS · AI ROUTE</span></div><div class="field"><label class="label">希望をひとことで</label><textarea class="textarea" id="wish">京都に家族4人で2泊3日。美味しいものと寺を楽しみたい。歩きすぎないプランがいい。</textarea></div>'+
    '<div class="field"><label class="label">行き先</label><input class="input" id="destination" value="京都"></div>'+
    '<div class="field"><label class="label">旅行期間</label><div class="card date-card"><span>9月21日</span><span>→</span><span>9月23日</span><strong>2泊3日</strong></div></div>'+
    '<div class="field"><label class="label">誰と？</label>'+chips(["ひとり","友だち","カップル","家族"],[state.companion],"companion")+'</div>'+
    '<div class="field"><label class="label">何を楽しみたい？</label>'+chips(["グルメ","絶景","子ども向け","歴史・文化","カフェ","ローカル"],state.interests,"interests")+'</div>'+
    '<div class="field"><label class="label">旅のペース</label>'+chips(["ゆったり","バランス","アクティブ"],[state.pace],"pace")+'</div>'+
    '<button class="btn blue" style="margin-top:26px" data-action="generate">✨ AIで旅をつくる</button>'+
    '<p class="caption muted" style="text-align:center;margin-top:8px">あとから何度でも変更できます</p>'+
    '</div></section>';
}
function generating(){
  return '<section class="screen no-nav"><div class="content" style="padding-top:80px;text-align:center">'+brand()+'<div class="loader"></div><h1 class="h2">あなたの旅を考えています。</h1>'+
    '<div class="steps" style="text-align:left"><div class="step done"><span class="mark">✓</span>好みを分析</div><div class="step done"><span class="mark">✓</span>移動しやすい順番を計算</div><div class="step done"><span class="mark">✓</span>おすすめスポットを選択</div><div class="step active"><span class="mark">●</span>ATTA!スポットを追加</div><div class="step"><span class="mark">○</span>旅のしおりを仕上げています</div></div>'+
    '<p class="small muted">旅行前の手間をAIで減らし、現地では旅そのものを楽しめるようにします。</p></div></section>';
}
const spots=[
  ["09:00","京都駅","旅のスタート","https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=160&q=80"],
  ["10:00","京都鉄道博物館","子どもも楽しめる体験型スポット","https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=160&q=80"],
  ["12:30","錦市場","京都の食を食べ歩き","https://images.unsplash.com/photo-1554797589-7241bb691973?auto=format&fit=crop&w=160&q=80"],
  ["15:00","清水寺","定番の絶景スポット","https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=160&q=80"]
];
function itinerary(){
  return '<section class="screen no-nav">'+top("旅のしおり",true)+'<div class="content">'+
    '<div class="hero trip-photo"><div class="hand-note">3 days in Kyoto</div><div class="postmark">KYOTO<br>21 SEP</div><svg class="route-doodle" viewBox="0 0 370 282" preserveAspectRatio="none"><path d="M40 220 C90 190,112 207,143 174 S210 116,254 147 S306 116,334 65"/><circle cx="40" cy="220" r="5"/><circle cx="334" cy="65" r="5"/></svg><div class="hero-copy"><div class="caption">2026.09.21 - 09.23 · 家族4人</div><h1 class="h2" style="margin-top:6px">京都で見つける、家族の3日間</h1></div></div>'+
    '<div class="ai section"><div class="ai-tag">ATTA! AI</div><p class="small" style="margin-top:5px">子どもが飽きにくく、移動を詰め込みすぎない3日間にしました。スタンプ10個を自然に集められます。</p></div>'+
    '<div class="section pills"><button class="chip on">DAY 1</button><button class="chip">DAY 2</button><button class="chip">DAY 3</button></div>'+
    '<div class="timeline section">'+spots.map((s,i)=>'<div class="tl" data-action="'+(i===3?'spot':'noop')+'"><div class="caption muted">'+s[0]+'</div><div class="spot-row"><div class="thumb" style="background-image:url('+s[3]+')"></div><div><strong>'+s[1]+'</strong><div class="small muted">'+s[2]+'</div></div><div class="stamp-tag">'+(i>0?'STAMP':'')+'</div></div></div>').join("")+'</div>'+
    '<div class="section"><div class="label">AIで調整</div>'+chips(["もっとゆっくり","グルメを増やす","子ども向け","雨の日"],[],"quick")+'</div>'+
    '<button class="btn primary" style="margin-top:22px" data-action="confirm-trip">この旅に決定</button><button class="btn secondary" style="margin-top:8px" data-action="new-trip">編集する</button>'+
    '</div></section>';
}
function confirmed(){
  return '<section class="screen no-nav"><div class="content" style="padding-top:72px;text-align:center">'+brand()+'<div class="success">✓</div><h1 class="h1">旅の準備ができました。</h1><p class="body muted" style="margin-top:10px">京都 2泊3日<br>2026.09.21 - 09.23</p><button class="btn primary" style="margin-top:34px" data-action="planned-home">ホームへ</button><button class="btn ghost" style="margin-top:8px" data-action="share">しおりを共有</button></div></section>';
}
function startTrip(){
  return '<section class="screen no-nav"><div class="photo-hero street">'+top("",true)+'</div><div class="detail-sheet" style="padding-bottom:30px"><h1 class="h1">今日から京都の旅です。</h1><p class="body muted" style="margin-top:8px">ATTA!が旅の流れを静かに記録します。</p><div class="stack section"><div class="card pad">✓ 移動したルート</div><div class="card pad">✓ 訪れた場所</div><div class="card pad">✓ ATTA!スタンプ</div></div><button class="btn red" style="margin-top:24px" data-action="location">旅をはじめる</button><button class="btn ghost" data-action="planned-home">あとで</button></div></section>';
}
function location(){
  return '<section class="screen no-nav">'+top("位置情報",true)+'<div class="content" style="padding-top:24px;text-align:center"><div class="success" style="border-color:var(--blue);color:var(--blue)">⌖</div><h1 class="h1">旅のルートを残そう</h1><p class="body muted" style="margin-top:10px">歩いた道や訪れた場所を記録すると、旅が終わったときにあなただけの地図が完成します。</p><div class="stack section" style="text-align:left"><div class="card pad">✓ 移動ルートを記録</div><div class="card pad">✓ ATTA!スポットを自動判定</div><div class="card pad">✓ 旅日記を自動作成</div></div><button class="btn blue" style="margin-top:24px" data-action="allow-location">位置情報を許可</button><button class="btn ghost" data-action="limited-map">今はしない</button></div></section>';
}
function liveMap(updated){
  const nextName=updated?"天龍寺":"竹林の小径";
  return '<section class="screen no-nav">'+top("京都 2泊3日",true)+'<div class="map">'+
    '<div id="mapboxMap" class="mapbox-canvas" aria-label="京都・嵐山のライブ旅マップ"></div>'+
    '<div class="map-fallback" aria-hidden="true">'+
      '<svg class="route" viewBox="0 0 400 420" preserveAspectRatio="none"><path d="M42 342 C120 300,80 240,166 215 S240 150,306 105 S350 66,370 38" fill="none" stroke="white" stroke-width="9" stroke-linecap="round"/><path d="M42 342 C120 300,80 240,166 215 S240 150,306 105 S350 66,370 38" fill="none" stroke="#ff355c" stroke-width="3" stroke-dasharray="8 9" stroke-linecap="round"/></svg>'+
      '<span class="map-label big" style="left:26px;top:90px">ARASHIYAMA</span><span class="map-label" style="left:286px;top:280px">KATSURA</span><span class="map-label" style="left:122px;top:485px">KYOTO</span><div class="pin current" style="left:44px;top:420px"></div><div class="pin visited" style="left:92px;top:355px">✓</div><div class="pin visited" style="left:160px;top:280px">✓</div><div class="pin '+(updated?'visited':'next')+'" style="left:286px;top:168px">'+(updated?'✓':'7')+'</div><div class="pin" style="left:340px;top:96px">8</div>'+
    '</div>'+
    '<div class="map-status"><span class="map-status-live">'+(MAPBOX_TOKEN?'MAPBOX LIVE':'LIVE MAP · OSM')+'</span><span class="map-status-fallback">MAP LOADING</span></div>'+
    '<div class="map-controls"><button data-action="locate" aria-label="現在地">◎</button><button data-action="assistant" aria-label="ATTA AI">✨</button></div>'+
    '<div class="map-sheet"><div class="caption" style="font-weight:900;color:var(--red)">NEXT</div><div class="row between" style="margin-top:5px"><div><div class="h3">'+nextName+'</div><div class="small muted">京都・嵐山 · <span data-role="proximity">現在地</span></div></div><div style="text-align:right"><strong data-role="route-time">徒歩ルート</strong><div class="small muted" data-role="route-meta">計算中...</div></div></div>'+
    '<button class="btn primary" style="margin-top:12px" data-action="open-navigation">ナビを開始</button>'+
    (!updated?'<button class="btn secondary" style="margin-top:8px" data-action="spot">スポットを見る</button><button class="btn ghost" data-action="simulate-arrival">デモ：到着をシミュレート</button>':'<button class="btn ghost" data-action="finish-trip">旅を終了</button>')+
    '</div></div></section>';
}
function spot(){
  return '<section class="screen no-nav"><div class="photo-hero bamboo"><div class="photo-actions"><button class="icon-btn" data-action="back">‹</button><div class="row"><button class="icon-btn">♡</button><button class="icon-btn" data-action="share">↗</button></div></div></div><div class="detail-sheet"><div class="caption muted">京都・嵐山</div><h1 class="h1">竹林の小径</h1><div class="pills" style="margin-top:12px"><span class="chip on">絶景</span><span class="chip">写真</span><span class="chip">家族向け</span></div><div class="ai section"><div class="ai-tag">ATTA! AI</div><p class="small" style="margin-top:5px">朝や夕方は比較的ゆっくり歩けます。竹の音や木漏れ日まで含めて、短い散策でも印象に残る場所です。</p></div><div class="stamp-card section"><div class="caption" style="color:var(--red);font-weight:900">ATTA! STAMP</div><h3 class="h3" style="margin-top:5px">竹林を歩こう</h3><p class="small muted" style="margin-top:4px">現地に到着すると自動でGET</p></div><button class="btn red" style="margin-top:22px" data-action="live-map">ここへ行く</button><button class="btn secondary" style="margin-top:8px" data-action="simulate-arrival">デモ：到着をシミュレート</button></div></section>';
}
function approaching(){
  return '<section class="screen no-nav">'+top("竹林の小径",true)+'<div class="content" style="padding-top:58px;text-align:center"><div class="loader"></div><h1 class="h1">もうすぐATTA!</h1><p class="body muted" style="margin-top:9px">スポットまであと50m。到着を確認しています。</p><div class="card pad section"><strong>GPS判定</strong><p class="small muted" style="margin-top:4px">MVP基準：半径150m・精度50m以内を目安に判定</p></div><button class="btn red" style="margin-top:30px" data-action="arrival">到着した</button></div></section>';
}
function arrival(){
  return '<section class="screen fullscreen"><div class="full-photo bamboo"><div class="center"><div class="loader"></div><div class="brand">ATTA<i>!</i></div><h1 class="h2" style="margin-top:18px">竹林の小径に到着しました。</h1><p class="small muted" style="margin-top:7px">位置情報を確認しています…</p></div></div></section>';
}
function stamp(){
  return '<section class="screen fullscreen"><div class="full-photo bamboo"><div class="center"><div class="passport-kicker">✦ DISCOVERED IN KYOTO</div>'+brand()+'<h1 class="h2" style="margin-top:12px">新しい発見が、あなたの旅を特別にする。</h1><div class="big-stamp">竹林を<br>歩こう<br><span style="font-size:12px">ARASHIYAMA</span></div><div class="h3">京都・嵐山</div><p class="small muted" style="margin-top:5px">'+state.stamps+' / 10 STAMPS</p><div class="handwritten" style="margin-top:12px">one more memory collected.</div><button class="btn red" style="margin-top:22px" data-action="memory">📷 写真を残す</button><button class="btn ghost" data-action="updated-map">旅を続ける</button></div></div></section>';
}
function memory(){
  return '<section class="screen no-nav">'+top("思い出を追加",true)+'<div class="content"><h1 class="h1">この瞬間を残そう</h1><p class="body muted" style="margin-top:6px">長文は不要。写真とひとことだけで十分です。</p><label class="memory-add section" for="memoryFile">'+(state.image?'<img src="'+state.image+'" alt="選択した写真">':'<span><strong>＋ 写真を追加</strong><br><span class="small">カメラ / ライブラリ</span></span>')+'</label><input id="memoryFile" type="file" accept="image/*" style="display:none"><div class="field"><label class="label">ひとこと</label><textarea id="memoryNote" class="textarea" placeholder="この瞬間をひとことで…">'+(state.note||"")+'</textarea></div><button class="btn secondary" style="margin-top:10px" data-action="ai-caption">✨ AIでひとことを作る</button><button class="btn primary" style="margin-top:18px" data-action="save-memory">思い出に追加</button></div></section>';
}
function finish(){
  return '<section class="screen no-nav"><div class="photo-hero sunset">'+top("",true)+'</div><div class="detail-sheet" style="padding-bottom:28px;text-align:center"><h1 class="h1">京都の旅を終えますか？</h1><p class="body muted" style="margin-top:7px">ここまでの記録から旅日記をつくります。</p><div class="section">'+stats()+'</div><button class="btn red" style="margin-top:26px" data-action="make-diary">旅を終了</button><button class="btn ghost" data-action="updated-map">旅を続ける</button></div></section>';
}
function diary(){
  return '<section class="screen">'+top("京都 2泊3日",true)+'<div class="content"><div class="diary-photo trip-photo"><div class="diary-title"><div class="caption">2026.09.21 - 09.23</div><h1 class="h2">京都で見つけた、家族の時間</h1></div></div><div class="section">'+stats()+'</div><div class="ai section"><div class="ai-tag">AIによる1日のまとめ</div><p class="body" style="margin-top:6px">京都駅から旅をスタート。鉄道博物館では子どもたちが夢中になり、錦市場では京都の味を食べ歩き。午後は清水寺から嵐山へ。竹林で新しいATTA!を見つけ、写真と一緒に旅の記憶が残りました。</p><button class="btn ghost" style="min-height:38px;margin-top:5px" data-action="rewrite">AIで書き直す</button></div><div class="timeline section">'+spots.map(s=>'<div class="tl"><div class="caption muted">'+s[0]+'</div><strong>'+s[1]+'</strong><div class="small muted">'+s[2]+'</div></div>').join("")+'<div class="tl"><div class="caption muted">14:35</div><strong>竹林の小径</strong><div class="stamp-tag">✓ 竹林を歩こう</div></div></div><button class="btn primary" data-action="share">旅をシェア</button></div>'+nav("memories")+'</section>';
}
function stampbook(){
  return '<section class="screen">'+top("スタンプ帳",true)+'<div class="content"><div class="row between"><div><div class="caption muted">TOTAL STAMPS</div><h1 class="h1">'+state.stamps+'</h1></div><div class="card pad"><strong>京都 2泊3日</strong><div class="small muted">'+state.stamps+' / 10</div></div></div><div class="section">'+stampStrip(state.stamps)+'</div><div class="card pad section"><h3 class="h3">あと '+Math.max(0,10-state.stamps)+' つ！</h3><p class="small muted" style="margin-top:4px">10個すべて集めると「KYOTO EXPLORER」バッジを獲得できます。</p></div><button class="btn secondary" style="margin-top:20px" data-action="memories">旅日記を見る</button></div>'+nav("memories")+'</section>';
}
function share(){
  return '<section class="screen no-nav">'+top("旅を共有",true)+'<div class="content"><div class="share-preview"><div class="thumb trip-photo" style="width:100%;height:150px"></div><h2 class="h2" style="margin-top:12px">京都で見つける、家族の3日間</h2><p class="small muted">2026.09.21 - 09.23 · '+state.stamps+' / 10 stamps</p></div><div class="section card pad"><div class="label">共有する内容</div>'+["旅のしおり","地図","スタンプ","旅日記","写真"].map(v=>'<div class="check-row"><span>'+v+'</span><span class="switch"></span></div>').join("")+'</div><div class="section"><div class="label">公開範囲</div><div class="card pad"><strong>リンクを知っている人</strong><p class="small muted" style="margin-top:4px">現在地はリアルタイムでは共有しません。</p></div></div><button class="btn primary" style="margin-top:22px" data-action="native-share">共有する</button><button class="btn secondary" style="margin-top:8px" data-action="copy-link">リンクをコピー</button><button class="btn ghost" data-action="story">公開ページをプレビュー</button></div></section>';
}
function story(){
  return '<section class="screen no-nav"><div class="story">'+top("",true)+'<div class="hero trip-photo"><div class="hero-copy"><div class="caption">HIROSHI’S TRIP</div><h1 class="h2">京都で見つけた、家族の時間</h1><p class="small">SEP 21 - 23</p></div></div><div class="section">'+stats()+'</div><div class="section ai"><div class="ai-tag">TRAVEL STORY</div><p class="body" style="margin-top:6px">旅程、ルート、写真、スタンプ、日記がひとつの物語としてつながります。</p></div><div class="section">'+stampStrip(state.stamps)+'</div><button class="btn red" style="margin-top:22px" data-action="new-trip">ATTA!で自分の旅をつくる</button></div></section>';
}
function plans(){
  return '<section class="screen">'+top("",false)+'<div class="content"><h1 class="h1">プラン</h1><p class="body muted" style="margin-top:6px">次の旅も、AIに任せて短くつくる。</p><div class="card pad section"><div class="caption muted">PLANNED</div><h2 class="h2">京都 2泊3日</h2><p class="small muted">2026.09.21 - 09.23</p><button class="btn primary" style="margin-top:14px" data-action="itinerary">しおりを見る</button></div><button class="btn secondary" style="margin-top:14px" data-action="new-trip">＋ 新しい旅</button></div>'+nav("plan")+'</section>';
}
function memories(){
  return '<section class="screen">'+top("",false)+'<div class="content"><h1 class="h1">思い出</h1><p class="body muted" style="margin-top:6px">旅の記録が、少しずつ自分だけの地図になる。</p><div class="hero trip-photo section"><div class="hero-copy"><div class="caption">KYOTO · 2026</div><h2 class="h2">京都で見つけた、家族の時間</h2><p class="small">'+state.stamps+' stamps · 18 photos · 8.2 km</p></div></div><button class="btn primary" style="margin-top:14px" data-action="diary">旅日記を見る</button><button class="btn secondary" style="margin-top:8px" data-action="stampbook">スタンプ帳を見る</button></div>'+nav("memories")+'</section>';
}
function profile(){
  return '<section class="screen">'+top("",false)+'<div class="content"><h1 class="h1">マイページ</h1><div class="row section"><div class="success" style="width:72px;height:72px;margin:0;font-size:24px;border-width:3px">H</div><div><strong>Hiroshi</strong><div class="small muted">Japan</div></div></div><div class="profile-grid section"><div class="card"><strong>1</strong><div class="caption muted">Trips</div></div><div class="card"><strong>'+state.stamps+'</strong><div class="caption muted">Stamps</div></div><div class="card"><strong>8.2</strong><div class="caption muted">km</div></div></div><div class="card pad section"><h3 class="h3">プライバシー</h3><p class="small muted" style="margin-top:5px">位置情報は初期設定で非公開。共有ページにリアルタイム現在地は表示しません。</p></div><button class="btn secondary" style="margin-top:18px" data-action="reset">デモデータをリセット</button></div>'+nav("profile")+'</section>';
}

function render(){
  if(location.hash==="#story" && state.screen!=="story") state.screen="story";
  const s=state.screen;
  let html = s==="home-empty"?homeEmpty():
    s==="home-planned"?plannedHome(false):
    s==="home-active"?plannedHome(true):
    s==="create"?createTrip():
    s==="generating"?generating():
    s==="itinerary"?itinerary():
    s==="confirmed"?confirmed():
    s==="start"?startTrip():
    s==="location"?location():
    s==="live-map"?liveMap(false):
    s==="updated-map"?liveMap(true):
    s==="spot"?spot():
    s==="approaching"?approaching():
    s==="arrival"?arrival():
    s==="stamp"?stamp():
    s==="memory"?memory():
    s==="finish"?finish():
    s==="diary"?diary():
    s==="stampbook"?stampbook():
    s==="share"?share():
    s==="story"?story():
    s==="plans"?plans():
    s==="memories"?memories():
    s==="profile"?profile():homeEmpty();
  destroyLiveMap();
  app.innerHTML=html;
  bindFile();
  if(s==="live-map" || s==="updated-map"){
    requestAnimationFrame(()=>initMapboxMap(s==="updated-map"));
  }
}
function bindFile(){
  const input=document.querySelector("#memoryFile");
  if(!input) return;
  input.addEventListener("change",e=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{ state.image=r.result; save(); render(); }; r.readAsDataURL(f);
  });
}
function back(){
  const map={create:state.tripStatus==="none"?"home-empty":"home-planned",itinerary:state.tripStatus==="none"?"home-empty":"home-planned",start:"home-planned",location:"start","live-map":"home-active","updated-map":"home-active",spot:"live-map",approaching:"live-map",arrival:"approaching",stamp:"live-map",memory:"stamp",finish:"updated-map",diary:"memories",stampbook:"memories",share:state.diaryReady?"diary":"itinerary",story:"share",plans:"home-planned",memories:"home-planned",profile:"home-planned"};
  go(map[state.screen] || "home-empty");
}
function assistant(){
  openSheet('<div class="row between"><h2 class="h2">ATTA! AI</h2><button class="icon-btn" data-action="close-sheet">×</button></div><p class="body muted" style="margin-top:5px">どうした？</p><div class="stack section"><button class="btn secondary" data-action="assistant-fatigue">ちょっと疲れた</button><button class="btn secondary" data-action="assistant-rain">雨が降ってきた</button><button class="btn secondary" data-action="assistant-hungry">お腹が空いた</button><button class="btn secondary" data-action="assistant-free">時間が余った</button></div>');
}
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return;
  const a=el.dataset.action;
  if(a==="back") back();
  else if(a==="new-trip") go("create");
  else if(a==="generate"){ go("generating"); setTimeout(()=>go("itinerary"),1500); }
  else if(a==="confirm-trip") go("confirmed",{tripStatus:"planned"});
  else if(a==="planned-home") go("home-planned");
  else if(a==="itinerary") go("itinerary");
  else if(a==="start-trip") go("start");
  else if(a==="location") go("location");
  else if(a==="allow-location"){
    if(!navigator.geolocation){ go("live-map",{tripStatus:"active"}); toast("位置情報API非対応のためデモモードで開始します"); return; }
    navigator.geolocation.getCurrentPosition(
      ()=>go("live-map",{tripStatus:"active",locationGranted:true}),
      ()=>{ go("live-map",{tripStatus:"active",locationGranted:false}); toast("位置情報なしの限定モードで開始しました"); },
      {enableHighAccuracy:true,timeout:6500,maximumAge:30000}
    );
  }
  else if(a==="limited-map") go("live-map",{tripStatus:"active",locationGranted:false});
  else if(a==="live-map") go("live-map",{tripStatus:"active"});
  else if(a==="spot" || a==="next-spot") go("spot");
  else if(a==="open-navigation"){
    const target=state.screen==="updated-map"?KYOTO_MAP.tenryuji:KYOTO_MAP.bamboo;
    const lat=target[1], lon=target[0];
    openSheet('<div class="row between"><h2 class="h2">徒歩ナビを開く</h2><button class="icon-btn" data-action="close-sheet">×</button></div><p class="small muted" style="margin-top:8px">ATTA!の旅記録は続けたまま、外部マップで案内します。</p><div class="stack section"><button class="btn primary" data-action="apple-nav" data-lat="'+lat+'" data-lon="'+lon+'">Apple Maps</button><button class="btn secondary" data-action="google-nav" data-lat="'+lat+'" data-lon="'+lon+'">Google Maps</button></div>');
  }
  else if(a==="apple-nav"){
    const lat=el.dataset.lat,lon=el.dataset.lon;
    window.open("https://maps.apple.com/?daddr="+lat+","+lon+"&dirflg=w","_blank","noopener");
    closeSheet();
  }
  else if(a==="google-nav"){
    const lat=el.dataset.lat,lon=el.dataset.lon;
    window.open("https://www.google.com/maps/dir/?api=1&destination="+lat+","+lon+"&travelmode=walking","_blank","noopener");
    closeSheet();
  }
  else if(a==="simulate-arrival") go("approaching");
  else if(a==="arrival"){ go("arrival"); setTimeout(()=>go("stamp",{stamps:Math.max(state.stamps,7)}),1200); }
  else if(a==="memory") go("memory");
  else if(a==="ai-caption"){ state.note="木漏れ日の竹林を歩く時間が、とても気持ちよかった。"; save(); render(); }
  else if(a==="save-memory"){ const note=document.querySelector("#memoryNote"); state.note=note?note.value:state.note; go("updated-map",{memoryAdded:true,stamps:Math.max(state.stamps,7)}); toast("思い出を旅に追加しました"); }
  else if(a==="updated-map") go("updated-map");
  else if(a==="finish-trip") go("finish");
  else if(a==="make-diary"){ go("generating",{tripStatus:"completed"}); setTimeout(()=>go("diary",{diaryReady:true}),1400); }
  else if(a==="diary" || a==="memories") go("diary",{diaryReady:true});
  else if(a==="stampbook") go("stampbook");
  else if(a==="share") go("share");
  else if(a==="story"){ location.hash="story"; go("story"); }
  else if(a==="copy-link"){ const url=location.origin+location.pathname+"#story"; navigator.clipboard?.writeText(url); toast("共有リンクをコピーしました"); }
  else if(a==="native-share"){ const url=location.origin+location.pathname+"#story"; if(navigator.share) navigator.share({title:"ATTA! 京都の旅",text:"京都で見つけた、家族の3日間",url}); else { navigator.clipboard?.writeText(url); toast("共有リンクをコピーしました"); } }
  else if(a==="rewrite"){ openSheet('<div class="row between"><h2 class="h2">AIで書き直す</h2><button class="icon-btn" data-action="close-sheet">×</button></div><div class="stack section"><button class="btn secondary" data-action="rewrite-done">もっと短く</button><button class="btn secondary" data-action="rewrite-done">感情的に</button><button class="btn secondary" data-action="rewrite-done">シンプルに</button><button class="btn secondary" data-action="rewrite-done">子ども目線</button></div>'); }
  else if(a==="rewrite-done"){ closeSheet(); toast("旅日記を書き直しました"); }
  else if(a==="assistant") assistant();
  else if(a.startsWith("assistant-")){ closeSheet(); toast(a==="assistant-fatigue"?"徒歩を約1.8km減らす案に変更できます":a==="assistant-rain"?"屋内中心のルートを提案しました":a==="assistant-hungry"?"近くのランチ候補を3件追加しました":"30分で寄れる場所を追加しました"); }
  else if(a==="ai-suggestion") toast("抹茶カフェを旅程に追加しました");
  else if(a==="locate"){
    if(!state.locationGranted || !navigator.geolocation){ toast("位置情報はOFFです"); }
    else navigator.geolocation.getCurrentPosition(pos=>{
      if(liveMapInstance){
        const coords=[pos.coords.longitude,pos.coords.latitude];
        liveUserMarker?.setLngLat(coords);
        liveMapInstance.easeTo({center:coords,zoom:16,duration:700});
      }
      toast("現在地を更新しました");
    },()=>toast("現在地を取得できませんでした"),{enableHighAccuracy:true,timeout:8000,maximumAge:5000});
  }
  else if(a==="menu") openSheet('<div class="row between"><h2 class="h2">ATTA!</h2><button class="icon-btn" data-action="close-sheet">×</button></div><p class="body muted" style="margin-top:10px">Golden Path v1.0 プロトタイプ</p><div class="card pad section"><div class="row between"><div><strong>Mapbox</strong><div class="small muted">'+(MAPBOX_TOKEN?'接続済み':'OSM fallback')+'</div></div><span class="stamp-tag">'+(MAPBOX_TOKEN?'LIVE':'READY')+'</span></div></div><button class="btn secondary" style="margin-top:12px" data-action="mapbox-config">Mapbox Public Tokenを設定</button><button class="btn secondary" style="margin-top:8px" data-action="reset">デモを最初からやり直す</button>');
  else if(a==="mapbox-config"){
    openSheet('<div class="row between"><h2 class="h2">Mapbox設定</h2><button class="icon-btn" data-action="close-sheet">×</button></div><p class="small muted" style="margin-top:8px">pk. から始まるPublic tokenのみ保存します。Secret tokenは入力しないでください。</p><div class="field"><label class="label">Public token</label><input id="mapboxTokenInput" class="input" autocomplete="off" placeholder="pk...."></div><button class="btn primary" style="margin-top:16px" data-action="save-mapbox-token">保存してMapを再読込</button>');
  }
  else if(a==="save-mapbox-token"){
    const input=document.querySelector("#mapboxTokenInput");
    const value=(input?.value||"").trim();
    if(!value.startsWith("pk.")){ toast("Mapbox Public token（pk.）を入力してください"); return; }
    try{ localStorage.setItem("atta-mapbox-public-token",value); }catch{}
    MAPBOX_TOKEN=value;
    closeSheet();
    toast("Mapboxを接続しました");
    render();
  }
  else if(a==="close-sheet") closeSheet();
  else if(a==="reset"){ closeSheet(); localStorage.removeItem(KEY); state=Object.assign({},defaults); location.hash=""; render(); toast("デモデータをリセットしました"); }
  else if(a==="tab"){ const t=el.dataset.tab; if(t==="home") go(state.tripStatus==="active"?"home-active":state.tripStatus==="none"?"home-empty":"home-planned"); if(t==="plan") go("plans"); if(t==="memories") go("memories"); if(t==="profile") go("profile"); }
  else if(a==="chip"){
    const key=el.dataset.key, v=el.dataset.value;
    if(key==="interests"){ const arr=new Set(state.interests); arr.has(v)?arr.delete(v):arr.add(v); state.interests=[...arr]; }
    if(key==="companion") state.companion=v;
    if(key==="pace") state.pace=v;
    if(key==="quick") toast(v+" の条件で旅程を再提案しました");
    save(); render();
  }
  else if(a==="noop") toast("このスポットの詳細はMVPでは省略しています");
});
overlay.addEventListener("click",e=>{ if(e.target===overlay) closeSheet(); });
function updateOnline(){ offline.classList.toggle("show",!navigator.onLine); }
addEventListener("online",updateOnline); addEventListener("offline",updateOnline); updateOnline();
addEventListener("hashchange",()=>{ if(location.hash==="#story") go("story"); });
render();
