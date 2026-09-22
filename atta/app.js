const KEY = "atta-mvp-v2";
const defaults = {
  screen:"home-active", tripStatus:"active", stamps:7, memoryAdded:false,
  diaryReady:false, locationGranted:false, day:1, selectedDay:1, image:null, note:"",
  interests:["グルメ","絶景","子ども向け"], companion:"家族", pace:"バランス",
  builderWish:"京都に家族4人で2泊3日。美味しいものと寺を楽しみたい。歩きすぎないプランがいい。",
  builderDestination:"京都", aiAdjustment:null, aiPlanVersion:1,
  onboardingCompleted:false, tutorialStep:0, onboardingDestination:"京都"
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
let showcaseMapInstance = null;
let showcaseRetry = null;

function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function go(screen, patch){ state = Object.assign({}, state, patch || {}, {screen}); save(); render(); window.scrollTo(0,0); }
function toast(message){ toastEl.textContent=message; toastEl.classList.add("show"); clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>toastEl.classList.remove("show"),2200); }
function openSheet(html){ sheet.innerHTML=html; overlay.classList.add("open"); overlay.setAttribute("aria-hidden","false"); }
function closeSheet(){ overlay.classList.remove("open"); overlay.setAttribute("aria-hidden","true"); }
function destroyLiveMap(){
  if(liveWatchId!=null && navigator.geolocation){ navigator.geolocation.clearWatch(liveWatchId); liveWatchId=null; }
  if(liveGeofenceTimer){ clearTimeout(liveGeofenceTimer); liveGeofenceTimer=null; }
  if(showcaseRetry){ clearTimeout(showcaseRetry); showcaseRetry=null; }
  liveRouteStart=null;
  if(liveMapInstance){ try{ liveMapInstance.remove(); }catch{} liveMapInstance=null; liveUserMarker=null; }
  if(showcaseMapInstance){ try{ showcaseMapInstance.remove(); }catch{} showcaseMapInstance=null; }
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
function addShowcaseRoute(map,type){
  const routes={
    home:[[130.9,33.8],[132.45,34.39],[135.50,34.69],[136.72,35.36],[139.76,35.68]],
    memory:[[-122.4,37.8],[-74.0,40.7],[-0.12,51.5],[13.4,52.5],[139.76,35.68],[151.2,-33.86]],
    spot:[[135.63,34.99],[135.67,35.01],[135.72,35.02]]
  };
  const coords=routes[type]||routes.home;
  map.addSource("showcase-route",{type:"geojson",data:{type:"Feature",geometry:{type:"LineString",coordinates:coords},properties:{}}});
  map.addLayer({id:"showcase-route",type:"line",source:"showcase-route",paint:{
    "line-color":"#ffffff","line-width":3,"line-opacity":0.92,"line-dasharray":[1,2.2]
  }});
}
function initShowcaseMap(type,attempt=0){
  const id=type==="home"?"tripReferenceMap":type==="memory"?"memoryReferenceMap":"spotReferenceMap";
  const container=document.getElementById(id);
  if(!container) return;
  if(!window.mapboxgl || !MAPBOX_TOKEN){
    if(attempt<12){ showcaseRetry=setTimeout(()=>initShowcaseMap(type,attempt+1),180); }
    return;
  }
  try{
    window.mapboxgl.accessToken=MAPBOX_TOKEN;
    const options=type==="home"
      ? {center:[136.0,35.0],zoom:4.35,bearing:-7,pitch:12,style:"mapbox://styles/mapbox/satellite-streets-v12"}
      : type==="memory"
      ? {center:[20,20],zoom:1.18,bearing:-8,pitch:0,style:"mapbox://styles/mapbox/satellite-streets-v12",projection:"globe"}
      : {center:[135.69,35.02],zoom:8.7,bearing:0,pitch:0,style:"mapbox://styles/mapbox/streets-v12"};
    showcaseMapInstance=new window.mapboxgl.Map({
      container,interactive:false,attributionControl:false,fadeDuration:0,...options
    });
    showcaseMapInstance.once("load",()=>{
      container.classList.add("ready");
      if(type==="memory" && showcaseMapInstance.setFog){
        showcaseMapInstance.setFog({color:"#071c2b","high-color":"#071c2b","horizon-blend":0.08,"space-color":"#020a12","star-intensity":0.8});
      }
      addShowcaseRoute(showcaseMapInstance,type);
    });
  }catch(err){ console.warn("ATTA showcase map fallback",err); }
}
function brand(tone="navy"){
  const src=tone==="white"?"/assets/atta-logo-horizontal-white.svg":"/assets/atta-logo-horizontal.svg";
  return '<div class="brand brand-lockup brand-'+tone+'" aria-label="ATTA!"><img src="'+src+'" alt="ATTA!"></div>';
}
function brandStamp(className=""){
  return '<img class="brand-stamp '+className+'" src="/assets/atta-logo-stamp.svg" alt="ATTA! passport stamp">';
}
function brandMark(className=""){
  return '<img class="brand-mark-img '+className+'" src="/assets/atta-mark.svg" alt="" aria-hidden="true">';
}
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
    item("home","home","ホーム",active)+
    item("plan","plan","プラン",active)+
    '<button class="nav-plus" data-action="new-trip" aria-label="新しい旅">'+icon("plus")+'</button>'+
    item("passport","memories","パスポート",active)+
    item("profile","profile","マイページ",active)+
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

function silvaIntro(){
  return '<section class="screen no-nav silva-onboarding">'+
    '<div class="silva-sky">'+
      '<div class="silva-brand">'+brand("navy")+'</div>'+
      '<div class="silva-stage"><div class="silva-halo"></div><img class="silva-hero" src="/assets/silva.svg" alt="旅の案内役 しるべ"></div>'+
      '<div class="silva-dialogue intro"><div class="silva-name"><strong>しるべ</strong><span>Silva · 旅の案内役</span></div><h1>はじめまして。<br>しるべです。</h1><p>まだ知らない景色を、<br>あなたと一緒に見つけに行きたいな。</p></div>'+
    '</div>'+
    '<div class="silva-onboarding-bottom"><div class="tutorial-dots"><i class="on"></i><i></i><i></i><i></i></div><button class="btn primary silva-next" data-action="tutorial-next">よろしく、しるべ！ <span>→</span></button><button class="tutorial-skip" data-action="tutorial-skip">あとで見る</button></div>'+
  '</section>';
}
function silvaTutorial(){
  const step=Math.max(1,Math.min(3,state.tutorialStep||1));
  const data={
    1:{kicker:"PLAN",title:"行きたい場所を<br>しるべに話してみて。",body:"場所・日程・誰と行くか。ざっくり伝えるだけで、移動時間や営業時間まで考えて旅の流れをつくるよ。",visual:"plan"},
    2:{kicker:"DISCOVER",title:"旅先では、<br>ATTA!を見つけよう。",body:"スポットに着くとスタンプを自動でGET。地図には歩いた道と見つけた景色が少しずつ増えていくよ。",visual:"discover"},
    3:{kicker:"REMEMBER",title:"旅が終わったら、<br>思い出がパスポートに残る。",body:"写真・ルート・スタンプから旅日記をまとめるよ。旅するほど、あなたの世界地図が育っていく。",visual:"remember"}
  }[step];
  const dots=[0,1,2,3].map((_,i)=>'<i class="'+(i===step?'on':'')+'"></i>').join("");
  const art=data.visual==="plan"
    ? '<div class="tutorial-plan-card"><div class="tiny-silva"><img src="/assets/silva.svg" alt=""></div><div><small>しるべに相談</small><strong>京都、家族4人、2泊3日。<br>寺とグルメ、歩きすぎない旅。</strong></div><b>→</b></div>'
    : data.visual==="discover"
    ? '<div class="tutorial-map-art"><div class="tutorial-route"></div><span class="t-pin a">京都</span><span class="t-pin b">嵐山</span><span class="t-stamp">ATTA!</span><img src="/assets/silva.svg" alt=""></div>'
    : '<div class="tutorial-passport-art"><div class="mini-globe"></div><div class="passport-card-mini"><small>ATTA! PASSPORT</small><strong>7 STAMPS</strong><span>KYOTO</span></div><img src="/assets/silva.svg" alt=""></div>';
  return '<section class="screen no-nav silva-onboarding tutorial-step-'+step+'">'+
    '<div class="tutorial-top"><button class="tutorial-back" data-action="tutorial-back">‹</button>'+brand("navy")+'<button class="tutorial-skip" data-action="tutorial-skip">スキップ</button></div>'+
    '<div class="tutorial-body"><div class="tutorial-kicker">'+data.kicker+'</div><h1>'+data.title+'</h1><p>'+data.body+'</p><div class="tutorial-visual">'+art+'</div></div>'+
    '<div class="silva-onboarding-bottom"><div class="tutorial-dots">'+dots+'</div><button class="btn primary silva-next" data-action="'+(step===3?"tutorial-start-trip":"tutorial-next")+'">'+(step===3?"最初の旅をつくる":"次へ")+' <span>→</span></button></div>'+
  '</section>';
}
function homeEmpty(){ return plannedHome(true); }
function plannedHome(active){
  const isActive = active || state.tripStatus==="active";
  return '<section class="screen ref-home">'+
    '<div class="ref-home-map">'+
      '<div id="tripReferenceMap" class="showcase-map"></div>'+
      '<div class="satellite-shade"></div>'+
      '<div class="ref-map-header">'+brand("white")+'<div class="segmented ref-segment"><button class="on">地図</button><button>リスト</button></div></div>'+
      '<div class="ref-trip-meta"><span>今回の旅</span><strong>1,250 <b>km</b></strong><small>8 都道府県 · 12 スポット</small></div>'+
      '<div class="ref-photo-pin pin-miyajima"><i></i><span>宮島</span></div>'+
      '<div class="ref-photo-pin pin-hiroshima"><i></i><span>広島</span></div>'+
      '<div class="ref-photo-pin pin-kyoto"><i></i><span>京都</span></div>'+
      '<div class="ref-photo-pin pin-fuji"><i></i><span>富士山</span></div>'+
      '<div class="ref-photo-pin pin-tokyo"><i></i><span>東京</span></div>'+
      '<div class="plane-glyph plane-a">✈</div><div class="plane-glyph plane-b">✈</div>'+
      '<div class="current-dot"></div><button class="ref-locate" data-action="live-map">➤</button>'+
    '</div>'+
    '<div class="ref-home-sheet">'+
      '<button class="ref-stamp-card" data-action="stampbook"><div class="ref-stamp-image"></div><div class="ref-stamp-copy"><small>新しいスタンプを獲得！</small><strong>宮島・厳島神社</strong><span>2026.09.21</span></div><div class="ref-stamp-seal">'+brandStamp("stamp-mini")+'</div><b>›</b></button>'+
      '<div class="ref-move-card"><h3>移動の記録</h3><div class="movement-grid ref-movement"><div><b>♟</b><span>徒歩</span><strong>12 km</strong></div><div><b>▣</b><span>電車</span><strong>420 km</strong></div><div><b>◆</b><span>車</span><strong>310 km</strong></div><div><b>✈</b><span>飛行機</span><strong>480 km</strong></div></div></div>'+
    '</div>'+nav("home")+
  '</section>';
}
function createTrip(){
  const wish=state.builderWish || "京都に家族4人で2泊3日。美味しいものと寺を楽しみたい。歩きすぎないプランがいい。";
  const destination=state.builderDestination || "京都";
  return '<section class="screen no-nav planner-v4">'+
    '<div class="planner-v4-hero">'+
      '<div class="planner-v4-head"><button class="icon-btn glass" data-action="back">‹</button>'+brand("white")+'<button class="icon-btn glass" data-action="menu">☰</button></div>'+
      '<div class="planner-v4-overlay"></div>'+
      '<div class="planner-v4-copy"><div class="eyebrow">PLAN WITH SILVA</div><h1>しるべとつくる、<br>あなただけの旅プラン。</h1><p>行きたい場所と気分を、ひとことで。</p></div>'+
    '</div>'+
    '<div class="planner-v4-sheet">'+
      '<div class="planner-v4-prompt"><div class="row between"><label>どんな旅にしたい？</label><span class="ai-mini">✦ しるべ</span></div><textarea id="wish" class="planner-prompt-input">'+wish+'</textarea><div class="prompt-actions"><button type="button" data-action="voice-demo">◉ 音声で話す</button><span>文章から条件を自動で読み取ります</span></div></div>'+
      '<div class="planner-grid">'+
        '<div class="planner-field"><span>行き先</span><input id="destination" value="'+destination+'"></div>'+
        '<button class="planner-field planner-field-button" data-action="date-info"><span>旅行期間</span><strong>9/21 → 9/23</strong><small>2泊3日</small></button>'+
      '</div>'+
      '<div class="planner-section"><div class="planner-label">しるべが読み取った希望</div><div class="planner-derived"><span>👨‍👩‍👧‍👦 家族4人</span><span>🍜 グルメ</span><span>⛩ 歴史・文化</span><span>🚶 歩きすぎない</span></div></div>'+
      '<div class="planner-section"><div class="planner-label">誰と？</div>'+chips(["ひとり","友だち","カップル","家族"],[state.companion],"companion")+'</div>'+
      '<div class="planner-section"><div class="planner-label">興味</div>'+chips(["グルメ","絶景","子ども向け","歴史・文化","カフェ","ローカル"],state.interests,"interests")+'</div>'+
      '<div class="planner-section"><div class="planner-label">旅のペース</div>'+chips(["ゆったり","バランス","アクティブ"],[state.pace],"pace")+'</div>'+
      '<div class="planner-section planner-budget"><div><div class="planner-label">予算</div><strong>指定なし</strong></div><button data-action="budget-info">設定 ›</button></div>'+
      '<button class="planner-generate" data-action="generate"><span>✦</span><div><strong>しるべと旅をつくる</strong><small>移動時間・営業時間も考慮</small></div><b>→</b></button>'+
      '<p class="planner-footnote">あとから何度でも変更できます</p>'+
    '</div>'+
  '</section>';
}
function generating(){
  return '<section class="screen no-nav generating-v4">'+
    '<div class="generating-photo trip-photo"><div class="generating-shade"></div><div class="generating-brand">'+brand("white")+'</div><div class="generating-copy"><div class="eyebrow">BUILDING YOUR KYOTO TRIP</div><h1>旅の流れを<br>組み立てています。</h1></div></div>'+
    '<div class="generating-sheet">'+
      '<div class="generation-orbit"><span></span><b>Silva</b></div>'+
      '<div class="generation-steps">'+
        '<div class="done"><i>✓</i><span><strong>希望を読み取りました</strong><small>家族4人・グルメ・寺・歩きすぎない</small></span></div>'+
        '<div class="done"><i>✓</i><span><strong>候補スポットを確認</strong><small>営業時間と位置関係を整理</small></span></div>'+
        '<div class="active"><i></i><span><strong>移動しやすい順番を計算</strong><small>徒歩と電車の負担を調整中</small></span></div>'+
        '<div><i></i><span><strong>予約できる体験を追加</strong><small>旅程に自然に入るものだけ</small></span></div>'+
        '<div><i></i><span><strong>しおりを仕上げる</strong><small>ATTA!スポットも確認</small></span></div>'+
      '</div>'+
      '<p class="generation-note">「行きたい場所」より先に、<br>無理のない旅の流れをつくります。</p>'+
    '</div>'+
  '</section>';
}

const tripDays = [
  [
    {time:"09:00",name:"京都駅",desc:"旅のスタート",area:"下京区",img:"https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=520&q=86",travel:"徒歩 18分",stamp:false},
    {time:"10:00",name:"京都鉄道博物館",desc:"子どもも楽しめる体験型スポット",area:"梅小路",img:"https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=520&q=86",travel:"タクシー 12分",stamp:true},
    {time:"12:30",name:"錦市場",desc:"京都の食を少しずつ食べ歩き",area:"中京区",img:"https://images.unsplash.com/photo-1554797589-7241bb691973?auto=format&fit=crop&w=520&q=86",travel:"徒歩 22分",stamp:true},
    {time:"15:00",name:"清水寺",desc:"夕方の光がきれいな定番の絶景",area:"東山区",img:"https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=520&q=86",travel:null,stamp:true,spot:true}
  ],
  [
    {time:"08:30",name:"嵐山・渡月橋",desc:"混雑前の朝に川沿いを散歩",area:"嵐山",img:"https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=520&q=86",travel:"徒歩 11分",stamp:true},
    {time:"09:15",name:"竹林の小径",desc:"竹の音と木漏れ日を楽しむ",area:"嵐山",img:"https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=520&q=86",travel:"徒歩 8分",stamp:true,spot:true},
    {time:"10:30",name:"天龍寺",desc:"庭園をゆっくり散策",area:"嵐山",img:"https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=520&q=86",travel:"徒歩 6分",stamp:true},
    {time:"12:00",name:"嵐山 人力車",desc:"家族で楽しめる40分コース",area:"嵐山",img:"https://images.unsplash.com/photo-1526481280695-3c687fd643ed?auto=format&fit=crop&w=520&q=86",travel:"徒歩 9分",booking:{title:"嵐山 人力車 40分",price:"¥8,000",reward:"+120 JASMY予定"}},
    {time:"13:30",name:"嵐山ランチ",desc:"歩く距離を増やさない近場の昼食",area:"嵐山",img:"https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=520&q=86",travel:null,stamp:false}
  ],
  [
    {time:"09:00",name:"伏見稲荷大社",desc:"朝の千本鳥居を歩く",area:"伏見",img:"https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&w=520&q=86",travel:"電車 28分",stamp:true},
    {time:"11:30",name:"宇治・平等院",desc:"宇治川と世界遺産をゆっくり",area:"宇治",img:"https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=520&q=86",travel:"徒歩 9分",stamp:true},
    {time:"13:00",name:"宇治抹茶ランチ",desc:"最後は抹茶と軽めの昼食",area:"宇治",img:"https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=520&q=86",travel:"電車 35分",stamp:false},
    {time:"15:30",name:"京都駅",desc:"旅の終わり。おみやげ時間も確保",area:"京都駅",img:"https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=520&q=86",travel:null,stamp:false}
  ]
];

function renderTripItem(item,index){
  const action=item.spot?'spot':'noop';
  return '<div class="itinerary-item-v4" data-action="'+action+'">'+
    '<div class="itinerary-time">'+item.time+'</div>'+
    '<div class="itinerary-card-v4">'+
      '<div class="itinerary-photo-v4" style="background-image:url('+item.img+')">'+(item.stamp?'<span class="itinerary-stamp">ATTA!</span>':'')+'</div>'+
      '<div class="itinerary-body-v4"><div class="row between"><div><strong>'+item.name+'</strong><small>'+item.area+'</small></div><button class="item-more" data-action="trip-item-menu">•••</button></div><p>'+item.desc+'</p>'+
      (item.booking?'<button class="inline-booking" data-action="booking-offer"><span><small>予約できる体験</small><strong>'+item.booking.title+'</strong></span><span class="booking-price">'+item.booking.price+'<small>'+item.booking.reward+'</small></span><b>›</b></button>':'')+
      '</div>'+
    '</div>'+
    (item.travel?'<div class="route-leg-v4"><span></span><i>↓</i><b>'+item.travel+'</b></div>':'')+
  '</div>';
}
function itinerary(){
  const day=Math.max(1,Math.min(3,state.selectedDay||1));
  const items=tripDays[day-1];
  const summary=day===1?"徒歩 3.8km · 移動 52分":day===2?"徒歩 2.4km · 移動 34分":"徒歩 2.1km · 移動 63分";
  return '<section class="screen no-nav itinerary-v4">'+
    '<div class="itinerary-v4-hero trip-photo">'+
      '<div class="itinerary-v4-head"><button class="icon-btn glass" data-action="back">‹</button>'+brand("white")+'<div class="row"><button class="icon-btn glass" data-action="trip-map">⌖</button><button class="icon-btn glass" data-action="share">↗</button></div></div>'+
      '<div class="itinerary-v4-shade"></div>'+
      '<div class="itinerary-v4-copy"><small>2026.09.21 - 09.23 · 家族4人</small><h1>京都で見つける、<br>家族の3日間</h1><div class="trip-summary-pills"><span>10 ATTA!</span><span>歩きすぎない</span></div></div>'+
    '</div>'+
    '<div class="itinerary-v4-sheet">'+
      '<div class="ai-plan-note"><div class="ai-orb">✦</div><div><strong>しるべ</strong><p>子どもが飽きにくく、移動を詰め込みすぎない流れにしました。</p></div></div>'+
      '<div class="day-tabs-v4">'+[1,2,3].map(d=>'<button class="'+(d===day?'on':'')+'" data-action="select-day" data-day="'+d+'"><small>DAY '+d+'</small><strong>9/'+(20+d)+'</strong></button>').join("")+'</div>'+
      '<div class="day-overview-v4"><div><small>DAY '+day+'</small><strong>'+(day===1?'京都市内':day===2?'嵐山':'伏見・宇治')+'</strong></div><div><small>今日の負担</small><strong>'+summary+'</strong></div></div>'+
      '<div class="itinerary-list-v4">'+items.map(renderTripItem).join("")+'</div>'+
      '<div class="ai-adjust-v4"><div class="row between"><div><small>しるべに相談</small><strong>この日の流れを変える</strong></div><span>✦</span></div><div class="ai-adjust-chips">'+["もっとゆっくり","雨の日","子ども向け","グルメを増やす"].map(v=>'<button data-action="quick-adjust" data-value="'+v+'">'+v+'</button>').join("")+'</div></div>'+
      '<div class="itinerary-actions-v4"><button class="btn secondary" data-action="edit-day">編集する</button><button class="btn primary" data-action="confirm-trip">この旅に決定</button></div>'+
    '</div>'+
  '</section>';
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
    '<div class="map-controls"><button data-action="locate" aria-label="現在地">◎</button></div><button class="silva-dot" data-action="assistant" aria-label="しるべに相談"><span class="silva-dot-face"><img src="/assets/silva.svg" alt=""></span><span>しるべ</span></button>'+
    '<div class="map-sheet"><div class="caption" style="font-weight:900;color:var(--red)">NEXT</div><div class="row between" style="margin-top:5px"><div><div class="h3">'+nextName+'</div><div class="small muted">京都・嵐山 · <span data-role="proximity">現在地</span></div></div><div style="text-align:right"><strong data-role="route-time">徒歩ルート</strong><div class="small muted" data-role="route-meta">計算中...</div></div></div>'+
    '<button class="btn primary" style="margin-top:12px" data-action="open-navigation">ナビを開始</button>'+
    (!updated?'<button class="btn secondary" style="margin-top:8px" data-action="spot">スポットを見る</button><button class="btn ghost" data-action="simulate-arrival">デモ：到着をシミュレート</button>':'<button class="btn ghost" data-action="finish-trip">旅を終了</button>')+
    '</div></div></section>';
}
function spot(){
  return '<section class="screen no-nav ref-spot">'+
    '<div class="ref-spot-map"><div id="spotReferenceMap" class="showcase-map"></div><div class="spot-map-wash"></div><div class="ref-spot-header">'+brand("navy")+'<div class="row"><button class="icon-btn glass">⌕</button><button class="icon-btn glass" data-action="menu">☰</button></div></div><div class="spot-map-label">竹林の小径 <span>●</span></div><div class="map-photo-bubble b1"></div><div class="map-photo-bubble b2"></div></div>'+
    '<div class="ref-place-card">'+
      '<div class="ref-place-photo bamboo"><button class="ref-back" data-action="back">‹</button><span class="ref-counter">1 / 10</span><button class="heart">♡</button></div>'+
      '<div class="ref-place-content">'+
        '<div class="row between"><div><h1>竹林の小径</h1><p>🇯🇵 京都・嵐山</p></div><button class="place-map-btn" data-action="live-map">▱<span>地図で見る</span></button></div>'+
        '<p class="place-description">竹の音と木漏れ日が心地よい、嵐山を代表する散策路。朝は比較的静かで、家族でも歩きやすいルートです。滞在の目安は30〜45分。</p>'+
        '<div class="pills ref-tags"><span class="chip"># 絶景</span><span class="chip"># 歴史</span><span class="chip"># 散歩</span><span class="chip"># 文化</span><span class="chip"># 写真</span></div>'+
        '<div class="spot-practical card"><div><small>おすすめ時間</small><strong>8:00–10:00</strong></div><div><small>滞在目安</small><strong>30–45分</strong></div><div><small>家族向け</small><strong>◎</strong></div></div>'+
        '<div class="row between nearby-title"><h3>この近くのおすすめスポット</h3><button class="text-btn">すべて見る ›</button></div>'+
        '<div class="nearby-grid ref-nearby"><button><span class="nearby-img n1"></span><strong>天龍寺</strong></button><button><span class="nearby-img n2"></span><strong>渡月橋</strong></button><button><span class="nearby-img n3"></span><strong>野宮神社</strong></button></div>'+
        '<div class="spot-section-title"><div><small>ATTA! STAMP</small><h3>竹林を歩こう</h3></div><span>未獲得</span></div>'+
        '<button class="spot-stamp-card" data-action="live-map"><div class="spot-stamp-seal">'+brandStamp("stamp-mini")+'</div><div><strong>現地に到着すると自動でGET</strong><p>GPSで到着を確認します。手動取得はありません。</p></div><b>›</b></button>'+
        '<div class="spot-section-title booking-title"><div><small>BOOKABLE EXPERIENCES</small><h3>この場所でできる体験</h3></div></div>'+
        '<button class="spot-booking-card" data-action="booking-offer">'+
          '<div class="spot-booking-photo"></div>'+
          '<div class="spot-booking-copy"><small>嵐山 · 体験</small><strong>人力車 40分コース</strong><p>竹林周辺を効率よく巡る家族向けプラン</p><div><b>¥8,000</b><span>+120 JASMY予定</span></div></div>'+
          '<i>›</i>'+
        '</button>'+
        '<p class="reward-disclaimer">JASMYは予約利用確認後に確定します。</p>'+
      '</div>'+
    '</div>'+
  '</section>';
}
function approaching(){
  return '<section class="screen no-nav">'+top("竹林の小径",true)+'<div class="content" style="padding-top:58px;text-align:center"><div class="loader"></div><h1 class="h1">もうすぐATTA!</h1><p class="body muted" style="margin-top:9px">スポットまであと50m。到着を確認しています。</p><div class="card pad section"><strong>GPS判定</strong><p class="small muted" style="margin-top:4px">MVP基準：半径150m・精度50m以内を目安に判定</p></div><button class="btn red" style="margin-top:30px" data-action="arrival">到着した</button></div></section>';
}
function arrival(){
  return '<section class="screen fullscreen"><div class="full-photo bamboo"><div class="center"><div class="loader"></div>'+brand("navy")+'<h1 class="h2" style="margin-top:18px">竹林の小径に到着しました。</h1><p class="small muted" style="margin-top:7px">位置情報を確認しています…</p></div></div></section>';
}
function stamp(){
  return '<section class="screen fullscreen"><div class="full-photo bamboo"><div class="center stamp-success-v2">'+
    '<div class="passport-kicker">DISCOVERED IN KYOTO</div>'+
    brandStamp("stamp-hero")+
    '<h1 class="h2">竹林を歩こう</h1>'+
    '<div class="h3" style="margin-top:5px">京都・嵐山</div>'+
    '<p class="small muted" style="margin-top:5px">'+state.stamps+' / 10 STAMPS</p>'+
    '<div class="stamp-reward-line">+20 JASMY <span>獲得</span></div>'+
    '<div class="handwritten" style="margin-top:10px">one more memory collected.</div>'+
    '<button class="btn red" style="margin-top:20px" data-action="memory">📷 写真を残す</button>'+
    '<button class="btn ghost" data-action="updated-map">旅を続ける</button>'+
  '</div></div></section>';
}
function memory(){
  return '<section class="screen no-nav">'+top("思い出を追加",true)+'<div class="content"><h1 class="h1">この瞬間を残そう</h1><p class="body muted" style="margin-top:6px">長文は不要。写真とひとことだけで十分です。</p><label class="memory-add section" for="memoryFile">'+(state.image?'<img src="'+state.image+'" alt="選択した写真">':'<span><strong>＋ 写真を追加</strong><br><span class="small">カメラ / ライブラリ</span></span>')+'</label><input id="memoryFile" type="file" accept="image/*" style="display:none"><div class="field"><label class="label">ひとこと</label><textarea id="memoryNote" class="textarea" placeholder="この瞬間をひとことで…">'+(state.note||"")+'</textarea></div><button class="btn secondary" style="margin-top:10px" data-action="ai-caption">✨ しるべにひとことを作ってもらう</button><button class="btn primary" style="margin-top:18px" data-action="save-memory">思い出に追加</button></div></section>';
}
function finish(){
  return '<section class="screen no-nav"><div class="photo-hero sunset">'+top("",true)+'</div><div class="detail-sheet" style="padding-bottom:28px;text-align:center"><h1 class="h1">京都の旅を終えますか？</h1><p class="body muted" style="margin-top:7px">ここまでの記録から旅日記をつくります。</p><div class="section">'+stats()+'</div><button class="btn red" style="margin-top:26px" data-action="make-diary">旅を終了</button><button class="btn ghost" data-action="updated-map">旅を続ける</button></div></section>';
}
function diary(){
  return '<section class="screen">'+top("京都 2泊3日",true)+'<div class="content"><div class="diary-photo trip-photo"><div class="diary-title"><div class="caption">2026.09.21 - 09.23</div><h1 class="h2">京都で見つけた、家族の時間</h1></div></div><div class="section">'+stats()+'</div><div class="ai section"><div class="ai-tag">しるべの1日のまとめ</div><p class="body" style="margin-top:6px">京都駅から旅をスタート。鉄道博物館では子どもたちが夢中になり、錦市場では京都の味を食べ歩き。午後は清水寺から嵐山へ。竹林で新しいATTA!を見つけ、写真と一緒に旅の記憶が残りました。</p><button class="btn ghost" style="min-height:38px;margin-top:5px" data-action="rewrite">しるべに書き直してもらう</button></div><div class="timeline section">'+spots.map(s=>'<div class="tl"><div class="caption muted">'+s[0]+'</div><strong>'+s[1]+'</strong><div class="small muted">'+s[2]+'</div></div>').join("")+'<div class="tl"><div class="caption muted">14:35</div><strong>竹林の小径</strong><div class="stamp-tag">✓ 竹林を歩こう</div></div></div><button class="btn primary" data-action="share">旅をシェア</button></div>'+nav("passport")+'</section>';
}
function stampbook(){
  const total=Math.max(state.stamps,7);
  return '<section class="screen collection-v3">'+
    '<div class="collection-header">'+brand()+'<button class="icon-btn" data-action="share">↗</button></div>'+
    '<div class="content">'+
      '<div class="collection-tabs"><button class="on">スタンプ帳</button><button data-action="memories">思い出</button></div>'+
      '<div class="collection-progress card"><div class="row between"><div><div class="caption muted">スタンプコレクション</div><div class="collection-count">'+total+' <span>/ 100</span></div></div><div class="passport-icon">'+brandMark("passport-mark")+'</div></div><div class="progress"><span style="width:'+Math.min(100,total)+'%"></span></div><div class="small muted">まだ見ぬ景色を集めよう。</div></div>'+
      '<div class="pills collection-filter"><button class="chip on">すべて</button><button class="chip">日本</button><button class="chip">アジア</button><button class="chip">ヨーロッパ</button><button class="chip">その他</button></div>'+
      '<div class="stamp-grid">'+["東京","富士山","京都","宮島","奈良","札幌","沖縄","屋久島","金沢"].map((v,i)=>'<button class="stamp-tile '+(i<total?"earned":"locked")+'"><div class="stamp-medallion">'+(i<total?'ATTA!':'?')+'</div><strong>'+v+'</strong><span>'+(i<total?'2026':'まだ訪れていません')+'</span></button>').join("")+'</div>'+
    '</div>'+nav("passport")+
  '</section>';
}
function share(){
  return '<section class="screen no-nav">'+top("旅を共有",true)+'<div class="content"><div class="share-preview"><div class="thumb trip-photo" style="width:100%;height:150px"></div><h2 class="h2" style="margin-top:12px">京都で見つける、家族の3日間</h2><p class="small muted">2026.09.21 - 09.23 · '+state.stamps+' / 10 stamps</p></div><div class="section card pad"><div class="label">共有する内容</div>'+["旅のしおり","地図","スタンプ","旅日記","写真"].map(v=>'<div class="check-row"><span>'+v+'</span><span class="switch"></span></div>').join("")+'</div><div class="section"><div class="label">公開範囲</div><div class="card pad"><strong>リンクを知っている人</strong><p class="small muted" style="margin-top:4px">現在地はリアルタイムでは共有しません。</p></div></div><button class="btn primary" style="margin-top:22px" data-action="native-share">共有する</button><button class="btn secondary" style="margin-top:8px" data-action="copy-link">リンクをコピー</button><button class="btn ghost" data-action="story">公開ページをプレビュー</button></div></section>';
}
function story(){
  return '<section class="screen no-nav"><div class="story">'+top("",true)+'<div class="hero trip-photo"><div class="hero-copy"><div class="caption">HIROSHI’S TRIP</div><h1 class="h2">京都で見つけた、家族の時間</h1><p class="small">SEP 21 - 23</p></div></div><div class="section">'+stats()+'</div><div class="section ai"><div class="ai-tag">TRAVEL STORY</div><p class="body" style="margin-top:6px">旅程、ルート、写真、スタンプ、日記がひとつの物語としてつながります。</p></div><div class="section">'+stampStrip(state.stamps)+'</div><button class="btn red" style="margin-top:22px" data-action="new-trip">ATTA!で自分の旅をつくる</button></div></section>';
}
function plans(){
  return '<section class="screen">'+top("",false)+'<div class="content"><h1 class="h1">プラン</h1><p class="body muted" style="margin-top:6px">次の旅も、しるべと一緒に短くつくる。</p><div class="card pad section"><div class="caption muted">PLANNED</div><h2 class="h2">京都 2泊3日</h2><p class="small muted">2026.09.21 - 09.23</p><button class="btn primary" style="margin-top:14px" data-action="itinerary">しおりを見る</button></div><button class="btn secondary" style="margin-top:14px" data-action="new-trip">＋ 新しい旅</button></div>'+nav("plan")+'</section>';
}
function memories(){
  return '<section class="screen ref-memory">'+
    '<div class="ref-memory-hero">'+
      '<div id="memoryReferenceMap" class="showcase-map globe-map"></div><div class="memory-space-shade"></div>'+
      '<div class="ref-memory-header">'+brand("white")+'<button class="share-circle" data-action="share">↗</button></div>'+
      '<h1>これまでの旅で、<br>世界が少し近くなった。</h1>'+
      '<div class="memory-hand">旅で、<br>世界はもっと<br>広がる。</div>'+
    '</div>'+
    '<div class="ref-memory-sheet">'+
      '<div class="row between"><h2>旅の記録</h2><button class="text-btn">すべて見る ›</button></div>'+
      '<div class="ref-stats"><div><b>◉</b><strong>32<span>か国</span></strong><small>訪れた国</small></div><div><b class="donut">◔</b><strong>16%</strong><small>世界を旅した<br>(195か国中)</small></div></div>'+
      '<h3>訪れた大陸</h3><div class="ref-continents"><span>アジア<b>12か国</b></span><span>ヨーロッパ<b>11か国</b></span><span>北アメリカ<b>4か国</b></span><span>南アメリカ<b>3か国</b></span><span>アフリカ<b>2か国</b></span><span>オセアニア<b>1か国</b></span></div>'+
      '<button class="ref-collection" data-action="stampbook"><div class="passport-icon">'+brandMark("passport-mark")+'</div><div><strong>ATTA! スタンプコレクション</strong><p><b>48</b> / 100</p><div class="progress"><span style="width:48%"></span></div><small>まだ見ぬ景色を集めよう。</small></div><span>›</span></button>'+
    '</div>'+nav("passport")+
  '</section>';
}
function rewardsBookings(){
  const rewards=[
    ["竹林の小径","PLACE STAMP","+20 JASMY","受取済み","settled"],
    ["嵐山 人力車","BOOKING","+120 JASMY","獲得予定","pending"],
    ["KYOTO EXPLORER","TRIP","+80 JASMY","確定","approved"],
    ["ホテル予約取消","BOOKING","-240 JASMY","取消","reversed"]
  ];
  return '<section class="screen rewards-v1">'+
    top("Rewards & Bookings",true)+
    '<div class="content rewards-content">'+
      '<div class="rewards-balance card"><div class="caption muted">ATTA! REWARDS</div><div class="reward-total">3,482 <span>JASMY</span></div><div class="reward-summary"><div><small>獲得予定</small><strong>420</strong></div><div><small>確定</small><strong>3,062</strong></div></div></div>'+
      '<div class="collection-tabs rewards-tabs"><button class="on">リワード</button><button data-action="booking-tab">予約</button></div>'+
      '<div class="reward-ledger">'+rewards.map(r=>'<button class="reward-row card" data-action="reward-detail"><div><strong>'+r[0]+'</strong><small>'+r[1]+'</small></div><div class="reward-row-right"><b>'+r[2]+'</b><span class="reward-status '+r[4]+'">'+r[3]+'</span></div></button>').join("")+'</div>'+
      '<button class="advanced-wallet card" data-action="wallet-details"><div><strong>ウォレット・ネットワーク情報</strong><small>JasmyChainの詳細を見る</small></div><span>›</span></button>'+
    '</div>'+nav("profile")+
  '</section>';
}
function profile(){
  return '<section class="screen account-v1">'+
    top("",false)+
    '<div class="content">'+
      '<h1 class="h1">マイページ</h1>'+
      '<div class="account-person row"><div class="account-avatar">H</div><div><strong>Hiroshi</strong><div class="small muted">Japan</div></div></div>'+
      '<div class="profile-grid section"><div class="card"><strong>12</strong><div class="caption muted">Trips</div></div><div class="card"><strong>'+state.stamps+'</strong><div class="caption muted">Stamps</div></div><div class="card"><strong>8</strong><div class="caption muted">Countries</div></div></div>'+
      '<button class="account-link card" data-action="rewards-bookings"><div><div class="caption muted">ATTA! REWARDS</div><strong>3,482 JASMY</strong><small>予約・リワード履歴</small></div><span>›</span></button>'+
      '<div class="card pad section"><h3 class="h3">プライバシー</h3><p class="small muted" style="margin-top:5px">位置情報は初期設定で非公開。共有ページにリアルタイム現在地は表示しません。</p></div>'+
      '<button class="btn secondary" style="margin-top:18px" data-action="reset">デモデータをリセット</button>'+
    '</div>'+nav("profile")+
  '</section>';
}

function render(){
  if(location.hash==="#story" && state.screen!=="story") state.screen="story";
  if(!state.onboardingCompleted && location.hash!=="#story"){
    const step=Number(state.tutorialStep||0);
    destroyLiveMap();
    app.innerHTML=step===0?silvaIntro():silvaTutorial();
    bindFile();
    return;
  }
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
    s==="rewards-bookings"?rewardsBookings():
    s==="profile"?profile():homeEmpty();
  destroyLiveMap();
  app.innerHTML=html;
  bindFile();
  if(s==="live-map" || s==="updated-map"){
    requestAnimationFrame(()=>initMapboxMap(s==="updated-map"));
  } else if(s==="home-empty" || s==="home-planned" || s==="home-active"){
    requestAnimationFrame(()=>initShowcaseMap("home"));
  } else if(s==="memories"){
    requestAnimationFrame(()=>initShowcaseMap("memory"));
  } else if(s==="spot"){
    requestAnimationFrame(()=>initShowcaseMap("spot"));
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
  const map={create:state.tripStatus==="none"?"home-empty":"home-planned",itinerary:state.tripStatus==="none"?"home-empty":"home-planned",start:"home-planned",location:"start","live-map":"home-active","updated-map":"home-active",spot:"live-map",approaching:"live-map",arrival:"approaching",stamp:"live-map",memory:"stamp",finish:"updated-map",diary:"memories",stampbook:"memories",share:state.diaryReady?"diary":"itinerary",story:"share",plans:"home-planned",memories:"home-planned","rewards-bookings":"profile",profile:"home-planned"};
  go(map[state.screen] || "home-empty");
}
function assistant(){
  openSheet('<div class="silva-sheet-head"><img src="/assets/silva.svg" alt="しるべ"><div><div class="caption muted">Silva · 旅の案内役</div><h2 class="h2">どうした？</h2><p class="small muted">今の旅程を見ながら、次の動きを一緒に考えるよ。</p></div><button class="icon-btn" data-action="close-sheet">×</button></div><div class="silva-suggestion-grid section"><button data-action="assistant-fatigue"><span>😮‍💨</span><strong>ちょっと疲れた</strong><small>歩く距離を減らす</small></button><button data-action="assistant-rain"><span>☔</span><strong>雨が降ってきた</strong><small>屋内中心に変える</small></button><button data-action="assistant-hungry"><span>🍜</span><strong>お腹が空いた</strong><small>近くの食事を探す</small></button><button data-action="assistant-free"><span>⏱</span><strong>時間が余った</strong><small>寄り道をひとつ追加</small></button></div>');
}
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return;
  const a=el.dataset.action;
  if(a==="tutorial-next"){
    state.tutorialStep=Math.min(3,Number(state.tutorialStep||0)+1);
    save(); render(); window.scrollTo(0,0);
  }
  else if(a==="tutorial-back"){
    state.tutorialStep=Math.max(0,Number(state.tutorialStep||1)-1);
    save(); render(); window.scrollTo(0,0);
  }
  else if(a==="tutorial-skip"){
    state.onboardingCompleted=true; state.tutorialStep=3; save(); go("home-active");
  }
  else if(a==="tutorial-start-trip"){
    state.onboardingCompleted=true;
    state.tutorialStep=3;
    state.builderDestination=state.onboardingDestination||"京都";
    save(); go("create");
  }
  else if(a==="back") back();
  else if(a==="new-trip") go("create");
  else if(a==="generate"){
    const wish=document.querySelector("#wish");
    const dest=document.querySelector("#destination");
    state.builderWish=(wish?.value||state.builderWish||"").trim();
    state.builderDestination=(dest?.value||state.builderDestination||"京都").trim()||"京都";
    state.selectedDay=1; state.aiAdjustment=null; save();
    go("generating");
    setTimeout(()=>go("itinerary"),1800);
  }
  else if(a==="select-day"){ state.selectedDay=Number(el.dataset.day)||1; save(); render(); }
  else if(a==="quick-adjust"){
    const v=el.dataset.value||"";
    const detail=v==="もっとゆっくり"?"徒歩 -1.8km · 自由時間 +45分":v==="雨の日"?"屋内スポット 2件に変更 · 徒歩 -0.9km":v==="子ども向け"?"体験スポット +1 · 待ち時間 -20分":"食事・カフェ +1 · 移動 +8分";
    openSheet('<div class="row between"><div><div class="caption muted">しるべ</div><h2 class="h2">'+v+'</h2></div><button class="icon-btn" data-action="close-sheet">×</button></div><p class="body muted" style="margin-top:8px">旅程全体ではなく、この日の流れだけを調整します。</p><div class="ai-change-preview card pad section"><small>変更すると</small><strong>'+detail+'</strong><div class="small muted" style="margin-top:6px">予約済みの予定は動かしません。</div></div><button class="btn primary" data-action="apply-adjust" data-value="'+v+'">この予定に変更</button>');
  }
  else if(a==="apply-adjust"){ state.aiAdjustment=el.dataset.value||""; state.aiPlanVersion=(state.aiPlanVersion||1)+1; save(); closeSheet(); toast("旅程を更新しました"); render(); }
  else if(a==="edit-day") openSheet('<div class="row between"><h2 class="h2">DAY '+(state.selectedDay||1)+' を編集</h2><button class="icon-btn" data-action="close-sheet">×</button></div><p class="body muted" style="margin-top:8px">順番・時間・スポット変更は次の編集画面でまとめて操作します。</p><div class="stack section"><button class="btn secondary" data-action="edit-placeholder">順番を並べ替える</button><button class="btn secondary" data-action="edit-placeholder">スポットを追加</button><button class="btn secondary" data-action="edit-placeholder">時間を変更</button></div>');
  else if(a==="edit-placeholder"){ closeSheet(); toast("Day Editorへ接続する準備ができています"); }
  else if(a==="trip-map"){ toast("Trip Mapは次の画面実装で接続します"); }
  else if(a==="trip-item-menu"){ e.stopPropagation(); openSheet('<div class="row between"><h2 class="h2">予定を編集</h2><button class="icon-btn" data-action="close-sheet">×</button></div><div class="stack section"><button class="btn secondary" data-action="edit-placeholder">時間を変更</button><button class="btn secondary" data-action="edit-placeholder">別の場所に変更</button><button class="btn ghost" data-action="edit-placeholder">この予定をスキップ</button></div>'); }
  else if(a==="booking-offer"){ e.stopPropagation(); openSheet('<div class="row between"><div><div class="caption muted">BOOKABLE EXPERIENCE</div><h2 class="h2">嵐山 人力車 40分</h2></div><button class="icon-btn" data-action="close-sheet">×</button></div><div class="booking-preview-photo section"></div><div class="row between"><div><div class="small muted">2名〜</div><strong class="h3">¥8,000</strong></div><div class="booking-reward-mini"><small>予約すると</small><strong>+120 JASMY予定</strong></div></div><p class="small muted" style="margin-top:12px">予約成立後は旅程に自動で追加。JASMYは利用確認後に確定します。</p><button class="btn primary" style="margin-top:18px" data-action="booking-demo">予約を見る</button>'); }
  else if(a==="booking-demo"){ closeSheet(); toast("Booking Offers画面へ接続する準備ができています"); }
  else if(a==="voice-demo") toast("音声入力はネイティブ実装時に接続します");
  else if(a==="date-info") toast("2026/09/21 - 09/23");
  else if(a==="budget-info") toast("予算条件は任意です");
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
  else if(a==="rewards-bookings") go("rewards-bookings");
  else if(a==="reward-detail") toast("リワード詳細を開きます");
  else if(a==="booking-tab") toast("予約履歴は次のSprintで本番接続します");
  else if(a==="wallet-details") openSheet('<div class="row between"><h2 class="h2">ウォレット情報</h2><button class="icon-btn" data-action="close-sheet">×</button></div><div class="card pad section"><div class="label">Network</div><strong>JasmyChain</strong><div class="label" style="margin-top:14px">Wallet</div><div class="small muted">ユーザーには通常表示しない詳細情報です。</div></div>');
  else if(a==="story"){ location.hash="story"; go("story"); }
  else if(a==="copy-link"){ const url=location.origin+location.pathname+"#story"; navigator.clipboard?.writeText(url); toast("共有リンクをコピーしました"); }
  else if(a==="native-share"){ const url=location.origin+location.pathname+"#story"; if(navigator.share) navigator.share({title:"ATTA! 京都の旅",text:"京都で見つけた、家族の3日間",url}); else { navigator.clipboard?.writeText(url); toast("共有リンクをコピーしました"); } }
  else if(a==="rewrite"){ openSheet('<div class="row between"><h2 class="h2">しるべに書き直してもらう</h2><button class="icon-btn" data-action="close-sheet">×</button></div><div class="stack section"><button class="btn secondary" data-action="rewrite-done">もっと短く</button><button class="btn secondary" data-action="rewrite-done">感情的に</button><button class="btn secondary" data-action="rewrite-done">シンプルに</button><button class="btn secondary" data-action="rewrite-done">子ども目線</button></div>'); }
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
  else if(a==="tab"){ const t=el.dataset.tab; if(t==="home") go(state.tripStatus==="active"?"home-active":state.tripStatus==="none"?"home-empty":"home-planned"); if(t==="plan") go("plans"); if(t==="passport") go("memories"); if(t==="profile") go("profile"); }
  else if(a==="chip"){
    const key=el.dataset.key, v=el.dataset.value;
    if(key==="interests"){ const arr=new Set(state.interests); arr.has(v)?arr.delete(v):arr.add(v); state.interests=[...arr]; }
    if(key==="companion") state.companion=v;
    if(key==="pace") state.pace=v;
    if(key==="quick") toast(v+" の条件を保存しました");
    save(); render();
  }
  else if(a==="noop") toast("このスポットの詳細はMVPでは省略しています");
});
overlay.addEventListener("click",e=>{ if(e.target===overlay) closeSheet(); });
function updateOnline(){ offline.classList.toggle("show",!navigator.onLine); }
addEventListener("online",updateOnline); addEventListener("offline",updateOnline); updateOnline();
addEventListener("hashchange",()=>{ if(location.hash==="#story") go("story"); });
render();
