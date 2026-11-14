'use strict';
/* ============================================================
   WONDER TOYS — NIGHT SHIFT
   A first-person horror experience in the spirit of Poppy Playtime.
   Three.js · touch-first (Pixel 9 class phones) · desktop supported
   ============================================================ */

/* ---------------- error trap (visible in screenshots) ---------------- */
const ERR = document.getElementById('err');
function showErr(m){ ERR.style.display='block'; ERR.textContent = (ERR.textContent + m + '\n').slice(-900); }
window.addEventListener('error', e => showErr('ERR: ' + e.message + ' @' + (e.filename||'').split('/').pop() + ':' + (e.lineno||'?')));
window.addEventListener('unhandledrejection', e => showErr('REJ: ' + (e.reason && e.reason.message || e.reason)));

/* ---------------- constants / utils ---------------- */
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const CS = 2.0;            // grid cell size (meters)
const WH = 3.4;            // wall height
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
const lerp  = (a,b,t)=> a+(b-a)*t;
const dlerp = (a,b,t)=>{ let d=b-a; while(d> Math.PI) d-=TAU; while(d<-Math.PI) d+=TAU; return a+d*t; };
function mulberry(seed){ return function(){ seed|=0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed>>>15, 1|seed); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t; return ((t ^ t>>>14)>>>0) / 4294967296; }; }
let RNG = mulberry(987654321);
const rr  = (a,b)=> a + RNG()*(b-a);
const ri  = (a,b)=> Math.floor(rr(a, b+1));
const pick = arr => arr[Math.floor(RNG()*arr.length)];
const cw   = (cx,cy)=> [ (cx+0.5)*CS, (cy+0.5)*CS ];  // cell -> world
const wc   = (x,z)=> [ Math.floor(x/CS), Math.floor(z/CS) ]; // world -> cell

/* ---------------- global game state ---------------- */
const SAVE_KEY = 'wondertoys_ns_v1';
const G = {
  state:'boot',            // boot title slides card play pause dead tape ending
  ch:0, stage:0,
  flags:{},                // per-chapter script flags
  inv:{ fuse:0, gear:0, keycard:0, part:0, grabpack:false },
  tapes:new Set(), toys:new Set(),
  deaths:0, playT:0, chapterT:0,
  running:false, locked:false,
  quality:'auto', autoLevel:2, // auto -> current tier 0..2
  settings:{ sens:1.0, invertY:false, quality:'auto', diff:'normal', vol:0.8 },
  checkpoint:null,
  dev:(()=>{ const p=new URLSearchParams(location.search); return {
      top:p.get('top'), ch:p.get('ch')?parseInt(p.get('ch')):0,
      autostart:p.has('autostart'), quiet:p.has('quiet'), seat:p.has('seat') }; })(),
  hintIdx:0, lastHint:'',
  fpsAcc:0, fpsN:0, slowT:0,
};
function saveGame(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify({
    ch:G.ch, stage:G.stage, tapes:[...G.tapes], toys:[...G.toys],
    deaths:G.deaths, unlocked:SAVE.unlocked, settings:G.settings, playT:G.playT
  })); }catch(e){}
}
function loadSave(){
  try{ const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return d && typeof d==='object' ? d : null; }catch(e){ return null; }
}
let SAVE = loadSave() || { unlocked:1 };

/* ---------------- procedural canvas textures ---------------- */
function cnv(w,h,fn){ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); fn(x,w,h); return c; }
function ctex(c, srgb=true){ const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; if(srgb && THREE.SRGBColorSpace) t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t; }
function speckle(x,w,h,n,a){ for(let i=0;i<n;i++){ const g=ri(0,255); x.fillStyle='rgba('+g+','+g+','+g+','+a+')'; x.fillRect(ri(0,w),ri(0,h),ri(1,3),ri(1,3)); } }
function drips(x,w,h,n,col){ x.strokeStyle=col; for(let i=0;i<n;i++){ const px=rr(0,w), len=rr(h*0.1,h*0.6); x.globalAlpha=rr(0.06,0.2); x.lineWidth=rr(2,7); x.beginPath(); x.moveTo(px,rr(0,h*0.3)); x.lineTo(px+rr(-4,4), rr(0,h*0.3)+len); x.stroke(); } x.globalAlpha=1; }

const TX = {}; // texture cache
function texWall(base, dark){
  const key='w'+base+dark; if(TX[key]) return TX[key];
  const c = cnv(256,384,(x,w,h)=>{
    x.fillStyle=base; x.fillRect(0,0,w,h);
    speckle(x,w,h,2600,0.05);
    // concrete panel seams
    x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=3;
    x.strokeRect(6,6,w-12,h/2-12); x.strokeRect(6,h/2+6,w-12,h/2-12);
    x.fillStyle='rgba(0,0,0,0.08)';
    for(let i=0;i<10;i++) x.fillRect(ri(0,w), ri(0,h), rr(20,90), rr(8,40));
    drips(x,w,h,9,'rgba(30,40,30,1)');
    // grime at bottom
    const g=x.createLinearGradient(0,h*0.6,0,h); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.55)');
    x.fillStyle=g; x.fillRect(0,h*0.6,w,h*0.4);
    // scuffs
    x.strokeStyle='rgba(0,0,0,0.2)'; x.lineWidth=2;
    for(let i=0;i<7;i++){ x.beginPath(); x.moveTo(rr(0,w),rr(h*0.5,h)); x.lineTo(rr(0,w),rr(h*0.5,h)); x.stroke(); }
    if(dark){ x.fillStyle='rgba(0,0,0,0.25)'; x.fillRect(0,0,w,h); }
  });
  return TX[key]=ctex(c);
}
function texFloor(){
  if(TX.fl) return TX.fl;
  const c = cnv(256,256,(x,w,h)=>{
    x.fillStyle='#23241f'; x.fillRect(0,0,w,h);
    const t=w/2;
    for(let i=0;i<2;i++) for(let j=0;j<2;j++){
      x.fillStyle = (i+j)%2? '#2c2d26' : '#33342b';
      x.fillRect(i*t+2,j*t+2,t-4,t-4);
      x.fillStyle='rgba(0,0,0,0.12)';
      for(let k=0;k<24;k++) x.fillRect(i*t+ri(4,t-8), j*t+ri(4,t-8), rr(2,14), rr(2,6));
    }
    // grout
    x.fillStyle='#191a15'; x.fillRect(0,t-3,w,6); x.fillRect(t-3,0,6,h);
    speckle(x,w,h,1800,0.05);
    drips(x,w,h,5,'rgba(10,12,10,1)');
    x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=1.5;
    for(let i=0;i<9;i++){ x.beginPath(); x.moveTo(rr(0,w),rr(0,h)); x.lineTo(rr(0,w),rr(0,h)); x.stroke(); }
  });
  return TX.fl=ctex(c);
}
function texCeil(){
  if(TX.ce) return TX.ce;
  const c = cnv(256,256,(x,w,h)=>{
    x.fillStyle='#1b1d1c'; x.fillRect(0,0,w,h);
    x.fillStyle='#222523';
    for(let i=0;i<2;i++) for(let j=0;j<2;j++) x.fillRect(i*w/2+4,j*h/2+4,w/2-8,h/2-8);
    speckle(x,w,h,900,0.04);
    drips(x,w,h,7,'rgba(0,0,0,1)');
  });
  return TX.ce=ctex(c);
}
function texMetal(col){
  const key='m'+col; if(TX[key]) return TX[key];
  const c = cnv(256,256,(x,w,h)=>{
    x.fillStyle=col; x.fillRect(0,0,w,h);
    for(let i=0;i<h;i+=2){ x.fillStyle='rgba(255,255,255,'+(0.02+0.03*Math.random())+')'; x.fillRect(0,i,w,1); }
    speckle(x,w,h,1200,0.06);
    x.strokeStyle='rgba(0,0,0,0.4)'; x.lineWidth=2; x.strokeRect(4,4,w-8,h-8);
    x.fillStyle='rgba(0,0,0,0.5)';
    for(const [px,py] of [[12,12],[w-12,12],[12,h-12],[w-12,h-12]]){ x.beginPath(); x.arc(px,py,4,0,TAU); x.fill(); }
    drips(x,w,h,6,'rgba(40,25,10,1)');
  });
  return TX[key]=ctex(c);
}
function texCrate(){
  if(TX.cr) return TX.cr;
  const c = cnv(256,256,(x,w,h)=>{
    x.fillStyle='#4a3a26'; x.fillRect(0,0,w,h);
    for(let i=0;i<6;i++){ x.fillStyle=i%2?'#453623':'#503f2a'; x.fillRect(0,i*h/6,w,h/6-3); }
    x.strokeStyle='#2c2115'; x.lineWidth=6; x.strokeRect(3,3,w-6,h-6);
    x.beginPath(); x.moveTo(0,0); x.lineTo(w,h); x.moveTo(w,0); x.lineTo(0,h); x.stroke();
    speckle(x,w,h,900,0.05);
    x.fillStyle='rgba(0,0,0,0.35)'; x.font='bold 34px monospace'; x.textAlign='center';
    x.fillText('WONDER',w/2,h/2-8); x.fillText('TOYS CO.',w/2,h/2+30);
  });
  return TX.cr=ctex(c);
}
function texPoster(kind){
  const key='p'+kind; if(TX[key]) return TX[key];
  const c = cnv(160,224,(x,w,h)=>{
    x.fillStyle='#d9d2b8'; x.fillRect(0,0,w,h);
    x.fillStyle='rgba(120,100,60,0.15)'; for(let i=0;i<40;i++) x.fillRect(ri(0,w),ri(0,h),rr(2,20),rr(2,10));
    x.textAlign='center';
    const big=(t,y,s,col)=>{ x.fillStyle=col||'#22261f'; x.font='bold '+s+'px monospace'; x.fillText(t,w/2,y); };
    if(kind===0){ big('WONDER',46,30); big('TOYS CO.',78,26); big('FRIENDS',130,22,'#a33'); big('ARE FOREVER',158,16); }
    else if(kind===1){ big('SMILE',50,34,'#a33'); big('WIDE!',82,26);
      x.strokeStyle='#22261f'; x.lineWidth=5; x.beginPath(); x.arc(w/2,140,34,0.15*Math.PI,0.85*Math.PI); x.stroke();
      for(let i=0;i<6;i++){ x.beginPath(); x.moveTo(w/2-34+ (i*68/5),108); x.lineTo(w/2-34+(i*68/5),128); x.stroke(); } }
    else if(kind===2){ big('SAFETY',40,26); big('FIRST',68,26); big('report loose',110,13); big('friends to your',130,13); big('floor manager',150,13); }
    else if(kind===3){ big('HAVE YOU',34,17,'#a33'); big('SEEN ME?',54,17,'#a33');
      x.fillStyle='#33392c'; x.fillRect(52,70,56,66); x.fillStyle='#d9d2b8'; x.fillRect(60,80,14,10); x.fillRect(88,80,14,10);
      x.strokeStyle='#33392c'; x.lineWidth=3; x.beginPath(); x.moveTo(70,120); x.quadraticCurveTo(80,132,92,120); x.stroke();
      big('MOLLY, 9 — LAST SEEN',160,9); big('AT PLAYCARE. LEVEL -2',172,9); }
    else { big('NOTICE',40,24,'#a33'); big('THE RECALL IS',70,14); big('VOLUNTARY.',86,14); big('(MOSTLY.)',110,18,'#a33'); }
    x.strokeStyle='rgba(0,0,0,0.3)'; x.lineWidth=8; x.strokeRect(0,0,w,h);
  });
  return TX[key]=ctex(c);
}
function texFace(){
  if(TX.fc) return TX.fc;
  const c = cnv(256,256,(x,w,h)=>{
    x.fillStyle='#26343a'; x.fillRect(0,0,w,h);            // fur base
    speckle(x,w,h,2400,0.08);
    x.fillStyle='#2e4046'; x.beginPath(); x.ellipse(w/2,h*0.62,64,52,0,0,TAU); x.fill(); // muzzle patch
    // huge grin
    x.fillStyle='#0a0708'; x.beginPath(); x.ellipse(w/2,h*0.68,58,30,0,0,Math.PI); x.fill();
    x.fillStyle='#e8e2cf';
    for(let i=0;i<9;i++){ const tx=w/2-50+i*(100/8); x.beginPath(); x.moveTo(tx,h*0.68-6); x.lineTo(tx+6,h*0.68+16); x.lineTo(tx+13,h*0.68-6); x.closePath(); x.fill(); }
    // stitched scars
    x.strokeStyle='#101a1c'; x.lineWidth=4;
    for(let i=0;i<4;i++){ const sx=rr(20,w-20), sy=rr(10,h*0.4); x.beginPath(); x.moveTo(sx,sy); x.lineTo(sx+rr(-16,16),sy+rr(6,20)); x.stroke(); }
    x.lineWidth=2;
    for(let i=0;i<6;i++){ const sx=rr(0,w), sy=rr(0,h*0.5); x.beginPath(); x.moveTo(sx-4,sy-4); x.lineTo(sx+4,sy+4); x.moveTo(sx+4,sy-4); x.lineTo(sx-4,sy+4); x.stroke(); }
  });
  return TX.fc=ctex(c);
}
function texFur(col){
  const key='f'+col; if(TX[key]) return TX[key];
  const c = cnv(128,128,(x,w,h)=>{
    x.fillStyle=col; x.fillRect(0,0,w,h);
    x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=1;
    for(let i=0;i<600;i++){ const sx=ri(0,w), sy=ri(0,h); x.beginPath(); x.moveTo(sx,sy); x.lineTo(sx+rr(-3,3),sy+rr(3,7)); x.stroke(); }
  });
  return TX[key]=ctex(c);
}
function texPastel(col){ // nursery wallpaper
  const key='pa'+col; if(TX[key]) return TX[key];
  const c = cnv(256,256,(x,w,h)=>{
    x.fillStyle=col; x.fillRect(0,0,w,h);
    x.strokeStyle='rgba(255,255,255,0.25)'; x.lineWidth=2;
    for(let i=0;i<8;i++) for(let j=0;j<8;j++){ x.beginPath(); x.arc(i*32+16,j*32+16,8,0,TAU); x.stroke(); }
    speckle(x,w,h,1400,0.05);
    drips(x,w,h,10,'rgba(60,20,20,1)');
  });
  return TX[key]=ctex(c);
}
function glowSpriteTex(){
  if(TX.gl) return TX.gl;
  const c = cnv(64,64,(x,w,h)=>{
    const g=x.createRadialGradient(32,32,2,32,32,30);
    g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,255,255,0.35)'); g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g; x.fillRect(0,0,w,h);
  });
  return TX.gl=ctex(c,false);
}

/* ============================================================
   AUDIO — everything synthesized with WebAudio (no assets)
   ============================================================ */
const SND = (()=>{
  let AC=null, master=null, sfx=null, amb=null, mon=null, noiseBuf=null;
  let droneNodes=[], ambTimer=null, hbTimer=null, hbNext=0, hbRate=1.2, hbOn=false;
  let staticNodes=null, humNodes=null;
  function ensure(){
    if(AC) return true;
    try{
      AC = new (window.AudioContext||window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = G.settings.vol; master.connect(AC.destination);
      sfx = AC.createGain(); sfx.connect(master);
      amb = AC.createGain(); amb.gain.value=0.8; amb.connect(master);
      mon = AC.createGain(); mon.connect(master);
      noiseBuf = AC.createBuffer(1, AC.sampleRate*2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
      return true;
    }catch(e){ return false; }
  }
  function resume(){ if(AC && AC.state==='suspended') AC.resume(); }
  function vol(){ if(master) master.gain.value = G.settings.vol; }
  function noise(dur, filterType, freq, q, gain, dest, pan){
    if(!AC) return;
    const src=AC.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const f=AC.createBiquadFilter(); f.type=filterType; f.frequency.value=freq; if(q) f.Q.value=q;
    const g=AC.createGain(); g.gain.setValueAtTime(gain, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime+dur);
    let n=src; src.connect(f); f.connect(g);
    if(pan!==undefined && AC.createStereoPanner){ const p=AC.createStereoPanner(); p.pan.value=pan; g.connect(p); p.connect(dest||sfx); }
    else g.connect(dest||sfx);
    src.start(); src.stop(AC.currentTime+dur+0.05);
  }
  function tone(type,f0,f1,dur,gain,dest,pan){
    if(!AC) return;
    const o=AC.createOscillator(); o.type=type;
    o.frequency.setValueAtTime(f0,AC.currentTime);
    if(f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1), AC.currentTime+dur);
    const g=AC.createGain(); g.gain.setValueAtTime(gain,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime+dur);
    o.connect(g);
    if(pan!==undefined && AC.createStereoPanner){ const p=AC.createStereoPanner(); p.pan.value=pan; g.connect(p); p.connect(dest||sfx); }
    else g.connect(dest||sfx);
    o.start(); o.stop(AC.currentTime+dur+0.05);
  }
  /* --- positioned helper: returns [pan, gainMul] for a world pos --- */
  function pos3(x,z,maxDist=30){
    if(!VIEW.cam) return [0,1];
    const dx=x-VIEW.cam.position.x, dz=z-VIEW.cam.position.z;
    const d=Math.hypot(dx,dz);
    const fw = new THREE.Vector3(); VIEW.cam.getWorldDirection(fw);
    const rightx = fw.z, rightz = -fw.x; // right = forward x up(-y)
    const pan = clamp((dx*rightx+dz*rightz)/(d||1), -1, 1)*0.8;
    const g = clamp(1 - d/maxDist, 0, 1)**2;
    return [pan, g];
  }
  /* --- ambience --- */
  function startAmb(kind){
    if(!ensure()) return; stopAmb();
    const o1=AC.createOscillator(); o1.type='sawtooth'; o1.frequency.value=36;
    const o2=AC.createOscillator(); o2.type='sine'; o2.frequency.value=54.5;
    const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=110;
    const g=AC.createGain(); g.gain.value=0.045;
    const lfo=AC.createOscillator(); lfo.frequency.value=0.07; const lg=AC.createGain(); lg.gain.value=0.02;
    lfo.connect(lg); lg.connect(g.gain);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(amb);
    o1.start(); o2.start(); lfo.start();
    droneNodes=[o1,o2,lfo];
    const creak=()=>{ if(!AC) return;
      const r=Math.random();
      if(r<0.4){ tone('sawtooth', rr(70,110), rr(55,80), 0.5, 0.012, amb); }
      else if(r<0.7){ noise(0.4,'lowpass',rr(80,150),1,0.03,amb); }
      else { tone('sine', rr(45,60), rr(30,40), 0.8, 0.05, amb); } // distant thump
      ambTimer=setTimeout(creak, rr(4000,12000));
    };
    ambTimer=setTimeout(creak, 3500);
  }
  function stopAmb(){
    droneNodes.forEach(n=>{ try{n.stop();}catch(e){} }); droneNodes=[];
    if(ambTimer){ clearTimeout(ambTimer); ambTimer=null; }
    if(hbTimer){ clearInterval(hbTimer); hbTimer=null; } hbOn=false;
    stopStatic(); stopHum();
  }
  /* --- heartbeat (fear) --- */
  function setHeartbeat(on, rate){
    if(!ensure()) return;
    hbOn=on; if(rate) hbRate=rate;
    if(on && !hbTimer){
      hbNext=AC.currentTime+0.1;
      hbTimer=setInterval(()=>{ if(!hbOn||!AC) return;
        while(hbNext < AC.currentTime+0.15){
          const t=hbNext, v=0.16;
          scheduleThump(t,v); scheduleThump(t+0.14,v*0.7);
          hbNext += 60/hbRate;
        }
      }, 60);
    }
    if(!on && hbTimer){ clearInterval(hbTimer); hbTimer=null; }
  }
  function scheduleThump(t,v){
    const o=AC.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(58,t); o.frequency.exponentialRampToValueAtTime(38,t+0.09);
    const g=AC.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.012); g.gain.exponentialRampToValueAtTime(0.0001,t+0.12);
    o.connect(g); g.connect(amb); o.start(t); o.stop(t+0.2);
  }
  /* --- one-shots --- */
  function step(volv, sprint){
    if(!AC) return;
    noise(0.09,'lowpass', rr(300,520), 1, volv*(sprint?0.16:0.09));
    tone('sine', rr(90,120), 60, 0.06, volv*0.02);
  }
  function monStep(x,z){
    const [pan,g]=pos3(x,z,26); if(g<0.02) return;
    noise(0.16,'lowpass',120,1,0.5*g,mon,pan);
    tone('sine',55,30,0.14,0.5*g,mon,pan);
    noise(0.05,'bandpass',rr(2000,4000),3,0.1*g,mon,pan); // metal click
  }
  function growl(x,z,agg){
    const [pan,g]=pos3(x,z,34); if(g<0.02) return;
    if(!AC) return;
    const t=AC.currentTime;
    const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(rr(42,60),t);
    o.frequency.linearRampToValueAtTime(rr(30,45),t+1.1);
    const lfo=AC.createOscillator(); lfo.frequency.value=rr(7,11); const lg=AC.createGain(); lg.gain.value=agg?14:7;
    lfo.connect(lg); lg.connect(o.frequency);
    const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=agg?500:260;
    const gn=AC.createGain(); gn.gain.setValueAtTime(0.0001,t); gn.gain.exponentialRampToValueAtTime((agg?0.55:0.3)*g,t+0.1); gn.gain.exponentialRampToValueAtTime(0.0001,t+1.2);
    o.connect(f); f.connect(gn); gn.connect(mon);
    if(AC.createStereoPanner){ const p=AC.createStereoPanner(); p.pan.value=pan; gn.disconnect(); gn.connect(p); p.connect(mon); }
    o.start(t); lfo.start(t); o.stop(t+1.3); lfo.stop(t+1.3);
    noise(0.5,'bandpass',rr(300,600),2,0.2*g,mon,pan);
  }
  function scream(){
    if(!AC) return; const t=AC.currentTime;
    [196,233,311,147].forEach((f,i)=>{
      const o=AC.createOscillator(); o.type='sawtooth';
      o.frequency.setValueAtTime(f,t); o.frequency.exponentialRampToValueAtTime(f*2.4,t+0.5); o.frequency.exponentialRampToValueAtTime(f*0.6,t+1.3);
      const g=AC.createGain(); g.gain.setValueAtTime(0.14,t); g.gain.exponentialRampToValueAtTime(0.0001,t+1.4);
      o.connect(g); g.connect(master); o.start(t); o.stop(t+1.5);
    });
    noise(1.2,'highpass',900,1,0.5,master);
    tone('sine',70,28,1.2,0.6,master);
  }
  function whoosh(){ noise(0.22,'bandpass',1400,2,0.25); }
  function latch(){ tone('square',180,90,0.08,0.12); noise(0.06,'highpass',3000,1,0.2); }
  function grabHit(){ tone('sine',140,60,0.1,0.25); noise(0.08,'lowpass',600,1,0.3); }
  function spark(){ noise(0.3,'highpass',2500,1,0.35); tone('square',rr(300,500),rr(100,200),0.15,0.1); }
  function pickupSfx(){ tone('sine',660,880,0.09,0.14); tone('sine',990,1320,0.12,0.1); }
  function toySfx(){ tone('triangle',880,1180,0.1,0.12); tone('triangle',1320,1760,0.14,0.09); }
  function uiClick(){ tone('square',220,180,0.04,0.06); }
  function uiBack(){ tone('square',180,120,0.05,0.06); }
  function powerUp(){ if(!AC) return; const t=AC.currentTime;
    const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(40,t); o.frequency.exponentialRampToValueAtTime(120,t+0.8);
    const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=400;
    const g=AC.createGain(); g.gain.setValueAtTime(0.001,t); g.gain.exponentialRampToValueAtTime(0.3,t+0.4); g.gain.exponentialRampToValueAtTime(0.0001,t+1.2);
    o.connect(f); f.connect(g); g.connect(sfx); o.start(t); o.stop(t+1.3); }
  function doorSlide(open){ noise(0.5,'lowpass',300,1,0.25); tone('square',open?90:70,open?130:50,0.5,0.07); }
  function leverSfx(){ tone('square',120,80,0.1,0.15); noise(0.08,'lowpass',800,1,0.3); }
  function valveSfx(){ for(let i=0;i<4;i++) setTimeout(()=>tone('square',rr(140,180),rr(90,120),0.07,0.1),i*140); }
  function errBuzz(){ tone('square',110,90,0.25,0.12); }
  function lockBuzz(){ tone('square',80,70,0.2,0.15); }
  function stopHum(){ if(humNodes){ humNodes.forEach(n=>{try{n.stop();}catch(e){}}); humNodes=null; } }
  function startHum(){ if(!AC||humNodes) return;
    const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=100;
    const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=180;
    const g=AC.createGain(); g.gain.value=0.05;
    o.connect(f); f.connect(g); g.connect(amb); o.start(); humNodes=[o]; }
  /* tape static + gibberish voice */
  function startStatic(){ if(!AC||staticNodes) return;
    const src=AC.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=2000;
    const g=AC.createGain(); g.gain.value=0.06;
    src.connect(f); f.connect(g); g.connect(sfx); src.start();
    staticNodes=[src];
    tone('sine',1000,1000,0.15,0.1); // leader beep
  }
  function stopStatic(){ if(staticNodes){ staticNodes.forEach(n=>{try{n.stop();}catch(e){}}); staticNodes=null; } }
  function voice(lenMs){
    if(!AC) return;
    const t0=AC.currentTime, n=Math.floor(lenMs/120);
    for(let i=0;i<n;i++){
      const t=t0+i*0.12+rr(0,0.03);
      const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(rr(90,190),t);
      o.frequency.linearRampToValueAtTime(rr(70,170),t+0.09);
      const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=rr(500,1400); f.Q.value=3;
      const g=AC.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.06,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.1);
      o.connect(f); f.connect(g); g.connect(sfx); o.start(t); o.stop(t+0.12);
    }
  }
  function chaseMusic(on){
    if(!AC) return;
    if(on && !SND._chase){
      const o=AC.createOscillator(); o.type='square'; o.frequency.value=55;
      const lfo=AC.createOscillator(); lfo.frequency.value=5.2; const lg=AC.createGain(); lg.gain.value=18;
      lfo.connect(lg); lg.connect(o.frequency);
      const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=300;
      const g=AC.createGain(); g.gain.value=0.0;
      g.gain.linearRampToValueAtTime(0.09, AC.currentTime+0.6);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(); lfo.start(); SND._chase=[o,lfo];
    } else if(!on && SND._chase){
      const [o,lfo]=SND._chase;
      try{ o.stop(AC.currentTime+0.5); lfo.stop(AC.currentTime+0.5); }catch(e){}
      SND._chase=null;
    }
  }
  return { ensure, resume, vol, pos3, startAmb, stopAmb, setHeartbeat, step, monStep, growl,
    scream, whoosh, latch, grabHit, spark, pickupSfx, toySfx, uiClick, uiBack, powerUp,
    doorSlide, leverSfx, valveSfx, errBuzz, lockBuzz, startHum, stopHum, startStatic, stopStatic, voice, chaseMusic };
})();

/* ---------------- simple caption / toast system ---------------- */
const Cap = (()=>{
  const el=$('cap'); let q=[], cur=null, t0=0;
  function say(text, ms=3200, monster=false){ q.push({text, ms, monster}); }
  function update(dt){
    if(cur){ if(performance.now()-t0 > cur.ms){ el.style.display='none'; cur=null; } }
    if(!cur && q.length){ cur=q.shift(); t0=performance.now();
      el.textContent=cur.text; el.classList.toggle('m', !!cur.monster); el.style.display='block';
      el.style.opacity='1';
    }
  }
  function clear(){ q=[]; cur=null; el.style.display='none'; }
  return { say, update, clear };
})();
/* ============================================================
   INPUT — touch (dual zone) + keyboard/mouse, unified
   ============================================================ */
const IN = {
  move:{x:0,y:0}, lookDX:0, lookDY:0,
  run:false, grab:false, grabEdge:false, actEdge:false, flashEdge:false,
  keys:{}, stickId:-1, lookId:-1, stickBase:{x:0,y:0}, isTouch:('ontouchstart' in window)||matchMedia('(pointer:coarse)').matches,
  pauseEdge:false,
};
(function initInput(){
  const doc = document.documentElement;
  doc.addEventListener('contextmenu', e=>e.preventDefault());
  doc.addEventListener('touchmove', e=>{ if(G.state==='play') e.preventDefault(); }, {passive:false});
  doc.addEventListener('dblclick', e=>e.preventDefault());

  // touch look/stick zones
  const cvs=$('c');
  cvs.addEventListener('pointerdown', e=>{
    SND.ensure(); SND.resume();
    if(G.state==='play' && !IN.isTouch && document.pointerLockElement!==cvs){ cvs.requestPointerLock && cvs.requestPointerLock(); return; }
    if(!IN.isTouch) return;
    if(e.pointerId===IN.stickId || e.pointerId===IN.lookId) return;
    if(e.clientX < innerWidth*0.44 && IN.stickId===-1){
      IN.stickId=e.pointerId; IN.stickBase={x:e.clientX,y:e.clientY};
      const sb=$('stickbase'); sb.style.display='block';
      sb.style.left=(e.clientX-60)+'px'; sb.style.top=(e.clientY-60)+'px'; sb.style.bottom='auto';
    } else if(IN.lookId===-1){
      IN.lookId=e.pointerId; IN.lookLast={x:e.clientX,y:e.clientY};
    }
  });
  cvs.addEventListener('pointermove', e=>{
    if(e.pointerId===IN.stickId){
      const dx=e.clientX-IN.stickBase.x, dy=e.clientY-IN.stickBase.y;
      const d=Math.hypot(dx,dy), max=52;
      const k=d>max?max/d:1;
      IN.move.x=dx*k/max; IN.move.y=dy*k/max;
      const nub=$('sticknub'); nub.style.left=(50+dx*k*0.9)+'%'; nub.style.top=(50+dy*k*0.9)+'%';
      nub.style.transform='translate(-50%,-50%)';
    } else if(e.pointerId===IN.lookId){
      const s=0.0032*G.settings.sens;
      IN.lookDX += (e.clientX-IN.lookLast.x)*s;
      IN.lookDY += (e.clientY-IN.lookLast.y)*s*(G.settings.invertY?-1:1);
      IN.lookLast={x:e.clientX,y:e.clientY};
    }
  });
  const endP = e=>{
    if(e.pointerId===IN.stickId){ IN.stickId=-1; IN.move.x=0; IN.move.y=0; $('stickbase').style.display='none'; }
    if(e.pointerId===IN.lookId) IN.lookId=-1;
  };
  cvs.addEventListener('pointerup', endP); cvs.addEventListener('pointercancel', endP);

  // mouse look (pointer lock)
  document.addEventListener('mousemove', e=>{
    if(document.pointerLockElement===cvs && G.state==='play'){
      const s=0.0023*G.settings.sens;
      IN.lookDX += e.movementX*s;
      IN.lookDY += e.movementY*s*(G.settings.invertY?-1:1);
    }
  });
  document.addEventListener('mousedown', e=>{
    if(document.pointerLockElement===cvs && G.state==='play' && e.button===0){ IN.grab=true; IN.grabEdge=true; }
  });
  document.addEventListener('mouseup', e=>{ if(e.button===0) IN.grab=false; });

  // keyboard
  addEventListener('keydown', e=>{
    if(e.repeat) return;
    const k=e.key.toLowerCase();
    IN.keys[k]=true;
    if(G.state==='play'){
      if(k==='e'){ IN.actEdge=true; }
      if(k==='f'){ IN.flashEdge=true; }
      if(k===' '){ IN.grab=true; IN.grabEdge=true; }
      if(k==='escape'){ IN.pauseEdge=true; }
    } else if(G.state==='tape' && (k==='e'||k==='escape')){ IN.actEdge=true; }
    else if((G.state==='slides'||G.state==='ending'||G.state==='card') && (k==='e'||k===' '||k==='enter')){ IN.actEdge=true; }
    else if(G.state==='dead' && k==='e'){ IN.actEdge=true; }
    if(k===' ') e.preventDefault();
  });
  addEventListener('keyup', e=>{ IN.keys[e.key.toLowerCase()]=false; });
  addEventListener('blur', ()=>{ IN.keys={}; IN.grab=false; IN.run=false; });

  // on-screen buttons
  const bindBtn=(id,down,up)=>{
    const el=$(id);
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); SND.resume(); el.classList.add('held'); down(); });
    const u=e=>{ el.classList.remove('held'); up&&up(); };
    el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('pointerleave', u);
  };
  bindBtn('bGrab', ()=>{ IN.grab=true; IN.grabEdge=true; }, ()=>{ IN.grab=false; });
  bindBtn('bAct', ()=>{ IN.actEdge=true; });
  bindBtn('bFlash', ()=>{ IN.flashEdge=true; });
  bindBtn('bRun', ()=>{ IN.run=true; }, ()=>{ IN.run=false; });
  $('bPause').addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); IN.pauseEdge=true; });
})();

/* ============================================================
   RENDERER / SCENE / QUALITY
   ============================================================ */
const VIEW = {};
(function initRenderer(){
  const canvas=$('c');
  VIEW.renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance', stencil:false });
  VIEW.renderer.outputColorSpace = THREE.SRGBColorSpace;
  VIEW.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  VIEW.renderer.toneMappingExposure = 1.12;
  VIEW.renderer.shadowMap.type = THREE.PCFShadowMap;
  VIEW.scene = new THREE.Scene();
  VIEW.camera = new THREE.PerspectiveCamera(74, innerWidth/innerHeight, 0.05, 80);
  VIEW.cam = VIEW.camera; // alias used by audio/pos3 and LM
  VIEW.camHolder = new THREE.Object3D(); // flashlight parent
  VIEW.scene.add(VIEW.camHolder);
  // flashlight
  const fl = new THREE.SpotLight(0xffe9c4, 0, 26, 0.52, 0.55, 1.15);
  fl.castShadow=false; fl.shadow.mapSize.set(1024,1024); fl.shadow.camera.near=0.2; fl.shadow.camera.far=26; fl.shadow.bias=-0.004;
  VIEW.camHolder.add(fl); VIEW.camHolder.add(fl.target);
  fl.position.set(0.12,-0.12,0); fl.target.position.set(0,0,-1);
  VIEW.flash=fl;
  // GrabPack hand light (small, warm)
  const gl2=new THREE.PointLight(0xff5533, 0, 5, 2); VIEW.camHolder.add(gl2); VIEW.handLight=gl2; gl2.position.set(-0.4,-0.3,-0.6);
  VIEW.hemi = new THREE.HemisphereLight(0x27333a, 0x050607, 0.55); VIEW.scene.add(VIEW.hemi);
  addEventListener('resize', ()=>{
    VIEW.camera.aspect=innerWidth/innerHeight; VIEW.camera.updateProjectionMatrix();
    VIEW.renderer.setSize(innerWidth,innerHeight);
    checkOrient();
  });
  VIEW.renderer.setSize(innerWidth,innerHeight);
})();
const QUALITY = [
  { name:'LOW',  pr:0.75, shadow:false, lightN:4 },
  { name:'MED',  pr:1.15, shadow:false, lightN:5 },
  { name:'HIGH', pr:Math.min(devicePixelRatio||1,2), shadow:true, lightN:6 },
];
function applyQuality(){
  let q = G.settings.quality;
  let tier;
  if(q==='auto'){ tier = G.autoLevel; } else tier = {low:0,med:1,high:2}[q] ?? 1;
  const t=QUALITY[tier];
  VIEW.renderer.setPixelRatio(t.pr);
  VIEW.renderer.setSize(innerWidth,innerHeight);
  VIEW.renderer.shadowMap.enabled = t.shadow;
  VIEW.flash.castShadow = t.shadow;
  QUALITY.active=t; QUALITY.tier=tier;
}
function autoQualityTick(dt){
  if(G.settings.quality!=='auto') return;
  G.fpsAcc+=dt; G.fpsN++;
  if(G.fpsAcc>2.5){
    const avg=G.fpsAcc/G.fpsN; G.fpsAcc=0; G.fpsN=0;
    if(avg>0.034 && G.autoLevel>0){ G.autoLevel--; applyQuality(); }
    else if(avg<0.019 && G.autoLevel<2){ G.autoLevel++; applyQuality(); }
  }
}
function checkOrient(){
  const portrait = innerHeight > innerWidth*1.05;
  const touchy = IN.isTouch;
  $('rotate').style.display = (portrait && touchy && G.state!=='title') ? 'flex' : 'none';
}
addEventListener('orientationchange', ()=>setTimeout(checkOrient,300));

/* --------- light manager: pool of real lights for nearest lamps --------- */
const LM = {
  pool:[], lamps:[], MAX:6,
  init(){
    this.pool.forEach(l=>{ VIEW.scene.remove(l); });
    this.pool=[];
    for(let i=0;i<QUALITY.active.lightN;i++){
      const l=new THREE.PointLight(0xffffff, 0, 14, 1.8); l.castShadow=false;
      VIEW.scene.add(l); this.pool.push(l);
    }
  },
  set(lamps){ this.lamps=lamps; },
  update(){
    if(!this.pool.length) return;
    const c=VIEW.cam.position;
    const arr=this.lamps;
    // nearest N
    const near=[];
    for(let i=0;i<arr.length;i++){
      const L=arr[i]; L._d=(L.x-c.x)*(L.x-c.x)+(L.z-c.z)*(L.z-c.z);
      if(L._d<900) near.push(L);
    }
    near.sort((a,b)=>a._d-b._d);
    for(let i=0;i<this.pool.length;i++){
      const pl=this.pool[i], L=near[i];
      if(!L){ pl.intensity=0; continue; }
      pl.position.set(L.x, L.y, L.z);
      pl.color.setHex(L.color);
      let it=L.i * (L.flicker? L.flickerVal||1 : 1);
      pl.intensity=it;
      pl.distance=L.dist;
    }
  }
};

/* ============================================================
   LEVEL BUILDER — grid maps -> geometry + entities
   Legend: # wall | . floor | P player | M monster | E exit | D locked door
   d door | F fuse | g gear | K keycard | Y part | T tape | o toy
   L locker | B crate | X console | W lever | S socket | U switch
   Z statue | _ low obstacle (belt/ball pit) | 1-9 waypoint | a-f trigger
   ============================================================ */
let LVL=null;
function normalizeMap(rows){
  const W=Math.max(...rows.map(r=>r.length));
  return rows.map(r=>r.padEnd(W,'#'));
}
function buildLevel(def){
  const rows=normalizeMap(def.map);
  const W=rows[0].length, H=rows.length;
  RNG = mulberry(def.seed||42);
  const lvl = {
    def, W, H, solid:new Uint8Array(W*H), low:new Uint8Array(W*H), doorAt:new Map(),
    ents:[], doors:[], pickups:[], tapes:[], toys:[], lockers:[], levers:[], sockets:[],
    switches:[], crates:[], triggers:[], waypoints:[], consoles:[], statue:null,
    playerSpawn:[5,5], monsterSpawn:[2,2], exitCell:null, lamps:[], props:[], group:new THREE.Scene()
  };
  const scene=lvl.group;
  VIEW.scene.remove(VIEW.scene.children.find?0:0); // noop guard
  // clear old scene
  const old=VIEW._lvlScene; if(old){ VIEW.scene.remove(old); }
  VIEW._lvlScene=scene; VIEW.scene.add(scene);
  VIEW.scene.fog = new THREE.FogExp2(def.fogColor||0x04070a, def.fogDensity||0.055);
  VIEW.scene.background = new THREE.Color(def.fogColor||0x04070a);
  VIEW.hemi.intensity = def.hemi ?? 0.5;
  VIEW.hemi.color.setHex(def.hemiSky||0x27333a);

  /* materials */
  const wallTex = def.wallTex||texWall(def.wallBase||'#3a4142');
  wallTex.repeat.set(1,1);
  const matWall=new THREE.MeshStandardMaterial({map:wallTex, roughness:0.94, metalness:0.02});
  const flTex=texFloor(); flTex.repeat.set(W,H);
  const matFloor=new THREE.MeshStandardMaterial({map:flTex, roughness:0.85, metalness:0.05});
  const ceTex=texCeil(); ceTex.repeat.set(W,H);
  const matCeil=new THREE.MeshStandardMaterial({map:ceTex, roughness:1});
  if(def.floorTex==='pastel'){ const pt=texPastel(def.wallBase||'#7a8a94'); pt.repeat.set(W,H); lvl.matFloorOverride=new THREE.MeshStandardMaterial({map:pt,roughness:0.7}); }

  /* parse cells */
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const ch=rows[y][x];
    if(ch==='#'){ lvl.solid[y*W+x]=1; continue; }
    if(ch==='_'){ lvl.low[y*W+x]=1; continue; }
    if(ch==='P') lvl.playerSpawn=[x,y];
    if(ch==='M') lvl.monsterSpawn=[x,y];
    if(ch==='E') lvl.exitCell=[x,y];
    if(ch>='1'&&ch<='9') lvl.waypoints[+ch-1]=[x,y];
    if(ch>='a'&&ch<='f') lvl.triggers.push({x,y,id:def.triggerMap?def.triggerMap[ch]:ch, fired:false});
    lvl.ents.push({x,y,ch});
  }

  /* geometry: walls (instanced) */
  const wallCells=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(lvl.solid[y*W+x]) wallCells.push([x,y]);
  const wallGeo=new THREE.BoxGeometry(CS,WH,CS);
  const walls=new THREE.InstancedMesh(wallGeo, matWall, wallCells.length);
  const m4=new THREE.Matrix4();
  wallCells.forEach((c,i)=>{ const [wx,wz]=cw(c[0],c[1]); m4.makeTranslation(wx, WH/2, wz); walls.setMatrixAt(i,m4); });
  walls.castShadow=false; walls.receiveShadow=true;
  scene.add(walls);

  /* floor + ceiling */
  const fmat = lvl.matFloorOverride||matFloor;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(W*CS,H*CS), fmat);
  floor.rotation.x=-Math.PI/2; floor.position.set(W*CS/2,0,H*CS/2); floor.receiveShadow=true;
  scene.add(floor);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W*CS,H*CS), matCeil);
  ceil.rotation.x=Math.PI/2; ceil.position.set(W*CS/2,WH,H*CS/2);
  scene.add(ceil);
  // ceiling height override for vent-y chapters
  if(def.ceilH && def.ceilH<WH){ ceil.position.y=def.ceilH; lvl.ceilH=def.ceilH; }

  /* helpers */
  const usedCells=new Set();
  const mark=(x,y)=>usedCells.add(x+','+y);
  lvl.ents.forEach(e=>mark(e.x,e.y));
  mark(lvl.playerSpawn[0],lvl.playerSpawn[1]);
  if(lvl.exitCell) mark(lvl.exitCell[0],lvl.exitCell[1]);

  const wallNeighbor=(x,y)=>{ // which side has a wall (for wall-mounted stuff)
    const s=(xx,yy)=> xx<0||yy<0||xx>=W||yy>=H||lvl.solid[yy*W+xx];
    if(s(x,y-1)) return [0,-1]; if(s(x,y+1)) return [0,1];
    if(s(x-1,y)) return [-1,0]; if(s(x+1,y)) return [1,0];
    return [0,1];
  };
  lvl.wallNeighbor=wallNeighbor;

  /* low obstacles: conveyor belts / ball pits */
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(lvl.low[y*W+x]){
    const [wx,wz]=cw(x,y);
    const belt = def.lowKind!=='ball';
    const g=new THREE.Group(); g.position.set(wx,0,wz);
    const base=new THREE.Mesh(new THREE.BoxGeometry(CS,0.86,CS), new THREE.MeshStandardMaterial({map:belt?texMetal('#22262a'):texPastel('#20323a'), roughness:0.6}));
    base.position.y=0.43; g.add(base);
    if(belt){
      const bt=cnv(64,64,(x2,w2,h2)=>{ x2.fillStyle='#181a1c'; x2.fillRect(0,0,w2,h2); x2.fillStyle='#2a2e31'; for(let i=0;i<8;i++) x2.fillRect(0,i*8,w2,4); });
      const btex=ctex(bt); btex.repeat.set(1,1);
      const top=new THREE.Mesh(new THREE.BoxGeometry(CS*1.02,0.06,CS*0.86), new THREE.MeshStandardMaterial({map:btex, roughness:0.5, metalness:0.4}));
      top.position.y=0.89; g.add(top);
      lvl.belts=lvl.belts||[]; lvl.belts.push({tex:btex, top});
    } else {
      // colorful balls
      const ballGeo=new THREE.SphereGeometry(0.16,8,6);
      const im=new THREE.InstancedMesh(ballGeo, new THREE.MeshStandardMaterial({roughness:0.4}), 40);
      const cols=[0xd4453a,0x3a7bd4,0xe8c34b,0x4bbd6a,0xc069d4];
      for(let i=0;i<40;i++){ m4.makeTranslation(rr(-0.8,0.8), 0.9+((i%2)*0.05), rr(-0.8,0.8)); im.setMatrixAt(i,m4); im.setColorAt(i,new THREE.Color(cols[i%5])); }
      g.add(im);
    }
    scene.add(g);
  }

  /* doors */
  function makeDoor(x,y,kind,id){
    const [wx,wz]=cw(x,y);
    const horiz = lvl.solid[y*W+clamp(x-1,0,W-1)] && lvl.solid[y*W+clamp(x+1,0,W-1)]; // walls E/W -> slide along x
    const g=new THREE.Group(); g.position.set(wx,0,wz);
    if(!horiz) g.rotation.y=Math.PI/2;
    const mat=new THREE.MeshStandardMaterial({map:texMetal(kind==='exit'?'#37424b':'#3d4348'), roughness:0.5, metalness:0.7});
    const panel=new THREE.Mesh(new THREE.BoxGeometry(CS*0.96,2.6,0.14), mat);
    panel.position.y=1.3; panel.castShadow=true; g.add(panel);
    // frame
    const post=new THREE.BoxGeometry(0.18,WH,0.3);
    const p1=new THREE.Mesh(post,mat); p1.position.set(-CS/2+0.09,WH/2,0); g.add(p1);
    const p2=new THREE.Mesh(post,mat); p2.position.set(CS/2-0.09,WH/2,0); g.add(p2);
    const head=new THREE.Mesh(new THREE.BoxGeometry(CS,WH-2.6,0.3),mat); head.position.y=2.6+(WH-2.6)/2; g.add(head);
    // stripes on panel
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(CS*0.96,0.34,0.02), new THREE.MeshStandardMaterial({color:0xd4a017,roughness:0.7}));
    stripe.position.set(0,0.4,0.09); panel.add(stripe);
    // lock light
    const lampM=new THREE.MeshStandardMaterial({color:0x220000, emissive:0xff2222, emissiveIntensity:1.4});
    const lock=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,0.05), lampM); lock.position.set(0.55,1.75,0.1); panel.add(lock);
    scene.add(g);
    const door={x,y,kind,id, panel, lockMat:lampM, open:false, t:0, slideDir:1, autoClose:0};
    lvl.doors.push(door); lvl.doorAt.set(x+','+y, door);
    return door;
  }
  let doorIdx=0;
  for(const e of lvl.ents){
    if(e.ch==='D'||e.ch==='d'){
      const kind = e.ch==='D' ? 'power' : 'plain';
      const d=makeDoor(e.x,e.y,kind,'D'+(doorIdx++));
      if(kind==='power') d.locked='power';
      e.door=d;
    }
  }

  /* pickups (fuse/gear/keycard/part) — auto-collect on touch */
  const pickupGeo={ fuse:new THREE.CylinderGeometry(0.05,0.05,0.24,10), gear:new THREE.TorusGeometry(0.13,0.05,8,14),
    keycard:new THREE.BoxGeometry(0.16,0.02,0.24), part:new THREE.SphereGeometry(0.16,10,8) };
  const pickupCol={ fuse:0xe8b34b, gear:0x9aa4ad, keycard:0xd4453a, part:0x7ad4b0 };
  let pIdx={fuse:0,gear:0,keycard:0,part:0};
  for(const e of lvl.ents){
    const kindMap={F:'fuse',g:'gear',K:'keycard',Y:'part'};
    if(!kindMap[e.ch]) continue;
    const kind=kindMap[e.ch];
    const [wx,wz]=cw(e.x,e.y);
    const mesh=new THREE.Mesh(pickupGeo[kind], new THREE.MeshStandardMaterial({color:pickupCol[kind], emissive:pickupCol[kind], emissiveIntensity:0.5, roughness:0.4, metalness:0.5}));
    mesh.position.set(wx+rr(-0.4,0.4), 0.95, wz+rr(-0.4,0.4));
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowSpriteTex(), color:pickupCol[kind], transparent:true, opacity:0.5, blending:THREE.AdditiveBlending, depthWrite:false}));
    spr.scale.set(0.9,0.9,1); mesh.add(spr);
    scene.add(mesh);
    const pk={kind,x:wx,z:wz,mesh,taken:false, idx:pIdx[kind]++, cell:[e.x,e.y]};
    lvl.pickups.push(pk); mark(e.x,e.y);
  }

  /* tapes: little TV on stand */
  for(const e of lvl.ents){
    if(e.ch!=='T') continue;
    const [wx,wz]=cw(e.x,e.y);
    const g=new THREE.Group(); g.position.set(wx,0,wz);
    const stand=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.75,0.5), new THREE.MeshStandardMaterial({map:texMetal('#3a3f44'),roughness:0.6,metalness:0.5}));
    stand.position.y=0.375; g.add(stand);
    const tv=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.55,0.55), new THREE.MeshStandardMaterial({map:texMetal('#20242a'),roughness:0.4,metalness:0.6}));
    tv.position.y=1.0; g.add(tv);
    const scr=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.38), new THREE.MeshBasicMaterial({color:0x9fb4c4}));
    scr.position.set(0,1.0,0.281); g.add(scr);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowSpriteTex(), color:0x9fb4c4, transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, depthWrite:false}));
    spr.scale.set(1.4,1.4,1); spr.position.y=1.0; g.add(spr);
    g.rotation.y = -wallNeighbor(e.x,e.y)[0]- (wallNeighbor(e.x,e.y)[1]? (wallNeighbor(e.x,e.y)[1]<0?0:Math.PI) : (wallNeighbor(e.x,e.y)[0]<0?Math.PI/2:-Math.PI/2)) + (wallNeighbor(e.x,e.y)[1]<0?Math.PI:0);
    scene.add(g);
    lvl.tapes.push({x:wx,z:wz,mesh:g,scr, cell:[e.x,e.y], idx:lvl.tapes.length, taken:false});
    mark(e.x,e.y);
  }

  /* toys (collectibles) */
  const toyGeo=new THREE.CylinderGeometry(0.09,0.12,0.3,8);
  const toyHead=new THREE.SphereGeometry(0.1,8,6);
  for(const e of lvl.ents){
    if(e.ch!=='o') continue;
    const [wx,wz]=cw(e.x,e.y);
    const g=new THREE.Group(); g.position.set(wx,0.03,wz);
    const col=new THREE.Color().setHSL(RNG(),0.7,0.6);
    const mat=new THREE.MeshStandardMaterial({color:col, roughness:0.5, emissive:col, emissiveIntensity:0.25});
    const b=new THREE.Mesh(toyGeo,mat); b.position.y=0.15; g.add(b);
    const h=new THREE.Mesh(toyHead,mat); h.position.y=0.36; g.add(h);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowSpriteTex(), color:col, transparent:true, opacity:0.4, blending:THREE.AdditiveBlending, depthWrite:false}));
    spr.scale.set(0.8,0.8,1); spr.position.y=0.3; g.add(spr);
    scene.add(g);
    lvl.toys.push({x:wx,z:wz,mesh:g, cell:[e.x,e.y], taken:false});
    mark(e.x,e.y);
  }

  /* lockers */
  const lockerGeo=new THREE.BoxGeometry(0.75,2.2,0.6);
  for(const e of lvl.ents){
    if(e.ch!=='L') continue;
    const [wx,wz]=cw(e.x,e.y); const [nx,nz]=wallNeighbor(e.x,e.y);
    const g=new THREE.Group();
    const mesh=new THREE.Mesh(lockerGeo, new THREE.MeshStandardMaterial({map:texMetal('#2e4a52'),roughness:0.55,metalness:0.6}));
    mesh.castShadow=true; g.add(mesh);
    // vents
    for(let i=0;i<3;i++){ const v=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.05,0.02), new THREE.MeshStandardMaterial({color:0x11181a})); v.position.set(0,0.75-i*0.14,0.31); g.add(v); }
    const doorLine=new THREE.Mesh(new THREE.BoxGeometry(0.02,2.0,0.02), new THREE.MeshStandardMaterial({color:0x11181a})); doorLine.position.set(0.02,1.05,0.31); g.add(doorLine);
    const handle=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.16,0.04), new THREE.MeshStandardMaterial({color:0x8a949c,metalness:0.8,roughness:0.3})); handle.position.set(-0.2,1.0,0.33); g.add(handle);
    g.position.set(wx+nx*(CS/2-0.35), 0, wz+nz*(CS/2-0.35));
    g.rotation.y = nx===1 ? -Math.PI/2 : nx===-1 ? Math.PI/2 : nz===1 ? Math.PI : 0;
    scene.add(g);
    lvl.lockers.push({x:wx,z:wz,g, cell:[e.x,e.y], busy:false});
    mark(e.x,e.y);
  }

  /* crates (grabbable noise objects) + random crates */
  const crateGeo=new THREE.BoxGeometry(0.85,0.85,0.85);
  const crateMat=new THREE.MeshStandardMaterial({map:texCrate(), roughness:0.9});
  function addCrate(x,z){
    const mesh=new THREE.Mesh(crateGeo, crateMat);
    mesh.position.set(x,0.43,z); mesh.rotation.y=rr(0,TAU); mesh.castShadow=true;
    scene.add(mesh);
    const c={x,z,mesh, vy:0}; lvl.crates.push(c); return c;
  }
  for(const e of lvl.ents){
    if(e.ch!=='B') continue;
    const [wx,wz]=cw(e.x,e.y); mark(e.x,e.y);
    addCrate(wx+rr(-0.3,0.3), wz+rr(-0.3,0.3));
  }

  /* consoles (X) */
  const consoleGeo=new THREE.BoxGeometry(1.1,1.5,0.55);
  for(const e of lvl.ents){
    if(e.ch!=='X') continue;
    const [wx,wz]=cw(e.x,e.y); const [nx,nz]=wallNeighbor(e.x,e.y);
    const g=new THREE.Group();
    const body=new THREE.Mesh(consoleGeo, new THREE.MeshStandardMaterial({map:texMetal('#43484d'),roughness:0.5,metalness:0.6}));
    body.castShadow=true; g.add(body);
    const scr=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.4), new THREE.MeshStandardMaterial({color:0x0a1410,emissive:0x1a5c38,emissiveIntensity:1.1}));
    scr.position.set(0,0.35,0.285); g.add(scr);
    for(let i=0;i<3;i++){ const b=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.06), new THREE.MeshStandardMaterial({color:0xd4453a,roughness:0.4})); b.position.set(-0.3+i*0.3,-0.15,0.29); g.add(b); }
    g.position.set(wx+nx*(CS/2-0.32), 0, wz+nz*(CS/2-0.32));
    g.rotation.y = nx===1 ? -Math.PI/2 : nx===-1 ? Math.PI/2 : nz===1 ? Math.PI : 0;
    scene.add(g);
    lvl.consoles.push({x:wx,z:wz,g, cell:[e.x,e.y], scr, idx:lvl.consoles.length, done:false});
    mark(e.x,e.y);
  }

  /* levers (W) — grabbable wall handles */
  for(const e of lvl.ents){
    if(e.ch!=='W') continue;
    const [wx,wz]=cw(e.x,e.y); const [nx,nz]=wallNeighbor(e.x,e.y);
    const g=new THREE.Group();
    const base=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.6,0.12), new THREE.MeshStandardMaterial({map:texMetal('#3d4348'),roughness:0.5,metalness:0.6}));
    g.add(base);
    const pivot=new THREE.Group(); pivot.position.z=0.1; g.add(pivot);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.5,0.08), new THREE.MeshStandardMaterial({color:0xb8463a,roughness:0.4,metalness:0.5}));
    arm.position.y=0.18; pivot.add(arm);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6), new THREE.MeshStandardMaterial({color:0xd4453a,roughness:0.35,emissive:0x400000}));
    knob.position.y=0.42; pivot.add(knob);
    g.position.set(wx+nx*(CS/2-0.12), 1.3, wz+nz*(CS/2-0.12));
    g.rotation.y = nx===1 ? -Math.PI/2 : nx===-1 ? Math.PI/2 : nz===1 ? Math.PI : 0;
    scene.add(g);
    lvl.levers.push({x:wx,z:wz,g,pivot, cell:[e.x,e.y], idx:lvl.levers.length, pulled:false});
    mark(e.x,e.y);
  }

  /* sockets (S) — GrabPack circuit points */
  const sockGeo=new THREE.BoxGeometry(0.34,0.44,0.12);
  for(const e of lvl.ents){
    if(e.ch!=='S') continue;
    const [wx,wz]=cw(e.x,e.y); const [nx,nz]=wallNeighbor(e.x,e.y);
    const g=new THREE.Group();
    const body=new THREE.Mesh(sockGeo, new THREE.MeshStandardMaterial({map:texMetal('#2b3138'),roughness:0.4,metalness:0.7}));
    g.add(body);
    const hole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.06,10), new THREE.MeshStandardMaterial({color:0x090a0b}));
    hole.rotation.x=Math.PI/2; hole.position.z=0.07; g.add(hole);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.1,0.02,6,12), new THREE.MeshStandardMaterial({color:0xe8b34b,emissive:0x604010,roughness:0.4}));
    ring.position.z=0.08; g.add(ring);
    g.position.set(wx+nx*(CS/2-0.1), 1.25, wz+nz*(CS/2-0.1));
    g.rotation.y = nx===1 ? -Math.PI/2 : nx===-1 ? Math.PI/2 : nz===1 ? Math.PI : 0;
    scene.add(g);
    lvl.sockets.push({x:wx,z:wz,g, cell:[e.x,e.y], idx:lvl.sockets.length, latched:false, plug:null, hole});
    mark(e.x,e.y);
  }

  /* switches (U) — big red wall switches */
  for(const e of lvl.ents){
    if(e.ch!=='U') continue;
    const [wx,wz]=cw(e.x,e.y); const [nx,nz]=wallNeighbor(e.x,e.y);
    const g=new THREE.Group();
    const box=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.14), new THREE.MeshStandardMaterial({map:texMetal('#4a4126'),roughness:0.5,metalness:0.4}));
    g.add(box);
    const btn=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,0.1,10), new THREE.MeshStandardMaterial({color:0xd4453a,emissive:0x550000,roughness:0.35}));
    btn.rotation.x=Math.PI/2; btn.position.z=0.1; g.add(btn);
    const lampt=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.06,0.05), new THREE.MeshStandardMaterial({color:0x221111,emissive:0xff4422,emissiveIntensity:0.6}));
    lampt.position.set(0,0.42,0.09); g.add(lampt);
    g.position.set(wx+nx*(CS/2-0.12), 1.35, wz+nz*(CS/2-0.12));
    g.rotation.y = nx===1 ? -Math.PI/2 : nx===-1 ? Math.PI/2 : nz===1 ? Math.PI : 0;
    scene.add(g);
    lvl.switches.push({x:wx,z:wz,g,btn, cell:[e.x,e.y], idx:lvl.switches.length, on:false});
    mark(e.x,e.y);
  }

  /* statue (Z) */
  for(const e of lvl.ents){
    if(e.ch!=='Z') continue;
    const [wx,wz]=cw(e.x,e.y);
    const g=new THREE.Group(); g.position.set(wx,0,wz);
    const bear=makeBearMesh(2.6, 0x5a4a6a, true); // patchwork statue
    bear.position.y=0; g.add(bear);
    // three empty slots (emissive rings)
    const slots=[];
    [[0,1.1,0.55],[0,1.55,0.5],[0.75,1.3,0.5]].forEach(p=>{
      const r=new THREE.Mesh(new THREE.TorusGeometry(0.16,0.03,6,14), new THREE.MeshStandardMaterial({color:0x222,emissive:0x7ad4b0,emissiveIntensity:1.2}));
      r.position.set(p[0],p[1],p[2]); g.add(r); slots.push(r);
    });
    scene.add(g);
    lvl.statue={x:wx,z:wz,g,slots, placed:0, cell:[e.x,e.y]};
    mark(e.x,e.y);
  }

  /* exit door + sign */
  if(lvl.exitCell){
    const [ex,ey]=lvl.exitCell; const [nx,nz]=wallNeighbor(ex,ey);
    const [wx,wz]=cw(ex,ey);
    const g=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({map:texMetal('#2e3d46'),roughness:0.45,metalness:0.7});
    const d1=new THREE.Mesh(new THREE.BoxGeometry(0.9,2.5,0.12),mat); d1.position.set(-0.48,1.25,0); g.add(d1);
    const d2=new THREE.Mesh(new THREE.BoxGeometry(0.9,2.5,0.12),mat); d2.position.set(0.48,1.25,0); g.add(d2);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.26,0.06), new THREE.MeshStandardMaterial({color:0x0a1a0a,emissive:0x2fd45c,emissiveIntensity:1.6}));
    sign.position.y=2.75; g.add(sign);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowSpriteTex(), color:0x2fd45c, transparent:true, opacity:0.5, blending:THREE.AdditiveBlending, depthWrite:false}));
    spr.scale.set(2.4,1.2,1); spr.position.y=2.75; g.add(spr);
    g.position.set(wx+nx*(CS/2-0.1), 0, wz+nz*(CS/2-0.1));
    g.rotation.y = nx===1 ? -Math.PI/2 : nx===-1 ? Math.PI/2 : nz===1 ? Math.PI : 0;
    scene.add(g);
    lvl.exit={x:wx,z:wz,g,d1,d2, open:false, t:0, cell:[ex,ey]};
  }

  /* random decorative props */
  const propCells=[];
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
    if(lvl.solid[y*W+x]||lvl.low[y*W+x]||usedCells.has(x+','+y)) continue;
    propCells.push([x,y]);
  }
  // shuffle
  for(let i=propCells.length-1;i>0;i--){ const j=Math.floor(RNG()*(i+1)); const t=propCells[i]; propCells[i]=propCells[j]; propCells[j]=t; }
  const barrelGeo=new THREE.CylinderGeometry(0.32,0.32,0.8,10);
  const barrelMat=new THREE.MeshStandardMaterial({map:texMetal('#4d4335'),roughness:0.6,metalness:0.3});
  const toyboxGeo=new THREE.BoxGeometry(0.8,0.6,0.6);
  let propN=Math.min(Math.floor(propCells.length*0.14), 34);
  for(let i=0;i<propN;i++){
    const [x,y]=propCells[i]; const [wx,wz]=cw(x,y);
    const r=RNG();
    if(r<0.4){ const b=new THREE.Mesh(barrelGeo,barrelMat); b.position.set(wx+rr(-0.4,0.4),0.4,wz+rr(-0.4,0.4)); b.castShadow=true; scene.add(b); }
    else if(r<0.7){ addCrate(wx+rr(-0.3,0.3), wz+rr(-0.3,0.3)); }
    else { const c=new THREE.Color().setHSL(RNG(),0.4,0.4);
      const tb=new THREE.Mesh(toyboxGeo,new THREE.MeshStandardMaterial({color:c,roughness:0.7})); tb.position.set(wx+rr(-0.3,0.3),0.3,wz+rr(-0.3,0.3)); tb.castShadow=true; scene.add(tb); }
  }

  /* posters on walls */
  const posterCells=[];
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
    if(!lvl.solid[y*W+x]) continue;
    // wall cell with open neighbor
    const dirs=[[0,1],[0,-1],[1,0],[-1,0]];
    for(const [dx,dy] of dirs){
      const ox=x+dx, oy=y+dy;
      if(ox<0||oy<0||ox>=W||oy>=H) continue;
      if(!lvl.solid[oy*W+ox] && !lvl.low[oy*W+ox]){ posterCells.push([x,y,dx,dy]); break; }
    }
  }
  for(let i=0;i<posterCells.length;i+=4){
    const [x,y,dx,dy]=posterCells[i];
    const [wx,wz]=cw(x,y);
    const kind=Math.floor(RNG()*5);
    const p=new THREE.Mesh(new THREE.PlaneGeometry(0.85,1.15), new THREE.MeshStandardMaterial({map:texPoster(kind),roughness:0.9}));
    p.position.set(wx+dx*(CS/2+0.02), 1.7+rr(-0.2,0.3), wz+dy*(CS/2+0.02));
    p.rotation.y = dx===1 ? Math.PI/2 : dx===-1 ? -Math.PI/2 : dy===1 ? Math.PI : 0;
    p.rotation.z=rr(-0.06,0.06);
    scene.add(p);
  }

  /* ceiling lamps (auto) */
  const lampCells=[];
  for(let y=2;y<H-2;y++) for(let x=2;x<W-2;x++){
    if(lvl.solid[y*W+x]||lvl.low[y*W+x]) continue;
    let open=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(!lvl.solid[(y+dy)*W+x+dx]) open++;
    if(open>=9) lampCells.push([x,y]);
  }
  const lampStep = def.lampStep||4;
  lvl.lamps=[];
  const lampGeo=new THREE.BoxGeometry(0.5,0.12,0.5);
  const lampCount=Math.min(lampCells.length, 26);
  for(let i=0;i<lampCount;i+=lampStep){
    const [x,y]=lampCells[i]; const [wx,wz]=cw(x,y);
    const col = def.lampColor||0xffe2b0;
    const broken=RNG()<(def.brokenLampChance||0.25);
    const lamp={x:wx, y:(lvl.ceilH||WH)-0.25, z:wz, color:col, i:broken?2.2:(def.lampI||7), dist:13,
      flicker: broken||RNG()<0.2, flickerVal:1, mesh:null, spr:null, broken};
    const mesh=new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({color:0x1a1c1c, emissive:col, emissiveIntensity: broken?0.15:1.6}));
    mesh.position.set(wx, lamp.y, wz); scene.add(mesh);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowSpriteTex(), color:col, transparent:true, opacity: broken?0.12:0.5, blending:THREE.AdditiveBlending, depthWrite:false}));
    spr.scale.set(2.6,1.4,1); spr.position.set(wx, lamp.y-0.1, wz); scene.add(spr);
    lamp.mesh=mesh; lamp.spr=spr;
    lvl.lamps.push(lamp);
  }
  LM.set(lvl.lamps); LM.init();

  /* pipes along walls */
  const pipeMat=new THREE.MeshStandardMaterial({color:0x2e3336,roughness:0.5,metalness:0.7});
  let pipes=0;
  for(let y=1;y<H-1&&pipes<10;y++){
    let run=0, start=-1;
    for(let x=0;x<W;x++){
      const openF = !lvl.solid[y*W+x] && y>0 && lvl.solid[(y-1)*W+x];
      if(openF){ if(run===0) start=x; run++; }
      else { if(run>=4 && pipes<10){ const [ax]=cw(start,0), [bx]=cw(start+run-1,0); const [ ,wz]=cw(0,y);
        const p=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,run*CS-0.4,8), pipeMat);
        p.rotation.z=Math.PI/2; p.position.set((ax+bx)/2, (lvl.ceilH||WH)-0.35, wz-CS/2+0.3); scene.add(p); pipes++; }
        run=0; }
    }
  }
  for(let x=1;x<W-1&&pipes<14;x++){
    let run=0, start=-1;
    for(let y=0;y<H;y++){
      const openF = !lvl.solid[y*W+x] && x>0 && lvl.solid[y*W+x-1];
      if(openF){ if(run===0) start=y; run++; }
      else { if(run>=4 && pipes<14){ const [ ,az]=cw(0,start), [ ,bz]=cw(0,start+run-1); const [wx]=cw(x,0);
        const p=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,run*CS-0.4,8), pipeMat);
        p.rotation.x=Math.PI/2; p.position.set(wx-CS/2+0.3, (lvl.ceilH||WH)-0.35, (az+bz)/2); scene.add(p); pipes++; }
        run=0; }
    }
  }

  /* validate connectivity (doors considered passable) */
  lvl.reach = (function(){
    const ok=new Uint8Array(W*H); const q=[lvl.playerSpawn];
    ok[lvl.playerSpawn[1]*W+lvl.playerSpawn[0]]=1;
    while(q.length){ const [x,y]=q.pop();
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const i=ny*W+nx;
        if(ok[i]||lvl.solid[i]) continue;
        ok[i]=1; q.push([nx,ny]);
      }
    }
    return ok;
  })();
  const unreachable=[];
  for(const e of lvl.ents){
    const i=e.y*W+e.x;
    if('#PM'.includes(e.ch)) continue;
    if(!lvl.reach[i]) unreachable.push(e.ch+'@'+e.x+','+e.y);
  }
  if(unreachable.length) showErr('MAP WARNING '+def.name+' unreachable: '+unreachable.join(' '));

  return lvl;
}
/* grid helpers on LVL */
function cellSolid(x,y){
  if(!LVL) return true;
  if(x<0||y<0||x>=LVL.W||y>=LVL.H) return true;
  if(LVL.solid[y*LVL.W+x]) return true;
  if(LVL.low[y*LVL.W+x]) return true;
  const d=LVL.doorAt.get(x+','+y);
  if(d && d.t<0.75) return true;
  if(LVL.exit && LVL.exit.cell[0]===x && LVL.exit.cell[1]===y && LVL.exit.t<0.75) return true;
  return false;
}
function losGrid(x0,z0,x1,z1){
  const dist=Math.hypot(x1-x0,z1-z0);
  const steps=Math.ceil(dist/0.5);
  for(let i=1;i<steps;i++){
    const t=i/steps;
    const [cx,cy]=wc(x0+(x1-x0)*t, z0+(z1-z0)*t);
    if(cellSolid(cx,cy)) return false;
  }
  return true;
}
/* A* pathfinding (returns array of [x,y] cells) */
function findPath(sx,sy,tx,ty){
  const W=LVL.W,H=LVL.H,N=W*H;
  const open=[], came=new Int32Array(N).fill(-1), gS=new Float32Array(N).fill(1e9);
  const Hidx=(x,y)=>Math.abs(x-tx)+Math.abs(y-ty);
  const si=sy*W+sx, ti=ty*W+tx;
  if(LVL.solid[ti]) { // target inside wall: find nearest open
    outer: for(let r=1;r<4;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      const nx=tx+dx, ny=ty+dy;
      if(nx<0||ny<0||nx>=W||ny>=H||LVL.solid[ny*W+nx]) continue;
      tx=nx; ty=ny; ti=ny*W+nx; break outer;
    }
  }
  gS[si]=0; open.push({i:si,f:Hidx(sx,sy)});
  const inOpen=new Uint8Array(N); inOpen[si]=1;
  while(open.length){
    let bi=0; for(let i=1;i<open.length;i++) if(open[i].f<open[bi].f) bi=i;
    const cur=open.splice(bi,1)[0]; inOpen[cur.i]=0;
    if(cur.i===ti) break;
    const cx=cur.i%W, cy=(cur.i-cx)/W;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=cx+dx, ny=cy+dy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const ni=ny*W+nx;
      if(cellSolid(nx,ny)) continue;
      const g=gS[cur.i]+1;
      if(g<gS[ni]){ gS[ni]=g; came[ni]=cur.i;
        const f=g+Hidx(nx,ny);
        if(!inOpen[ni]){ open.push({i:ni,f}); inOpen[ni]=1; }
      }
    }
    if(open.length>900) break; // safety
  }
  if(came[ti]===-1 && ti!==si) return null;
  const path=[]; let cur=ti;
  while(cur!==si && cur!==-1){ path.push([cur%W,(cur-cur%W)/W]); cur=came[cur]; }
  path.reverse();
  return path;
}

/* --------- debug top-down map render --------- */
function drawTopdown(){
  const cv=$('topdown'); cv.style.display='block';
  const x2=cv.getContext('2d');
  const W=LVL.W,H=LVL.H,s=Math.floor(Math.min(cv.width/W, cv.height/H));
  x2.fillStyle='#000'; x2.fillRect(0,0,cv.width,cv.height);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(LVL.solid[y*W+x]) x2.fillStyle='#3a4142';
    else if(LVL.low[y*W+x]) x2.fillStyle='#7a5a20';
    else x2.fillStyle = LVL.reach[y*W+x] ? '#181d1e' : '#552222';
    x2.fillRect(x*s,y*s,s-1,s-1);
  }
  const dot=(cx,cy,col,r)=>{ x2.fillStyle=col; x2.beginPath(); x2.arc(cx*s+s/2,cy*s+s/2,r,0,TAU); x2.fill(); };
  for(const e of LVL.ents){
    const map={F:'#e8b34b',g:'#9aa4ad',K:'#d4453a',Y:'#7ad4b0',T:'#7ab0d4',o:'#d47ad4',L:'#2e7a52',B:'#8a6a3a',X:'#d4d4d4',W:'#b8463a',S:'#e8e24b',U:'#ff4422',Z:'#a06ad4',E:'#2fd45c',M:'#ff0000',P:'#4bbdff'};
    if(map[e.ch]) dot(e.x,e.y,map[e.ch], s*0.32);
  }
  dot(PL.x/CS, PL.z/CS, '#4bbdff', s*0.35);
  if(MON.active) dot(MON.x/CS, MON.z/CS, '#ff3030', s*0.35);
  x2.fillStyle='#fff'; x2.font='16px monospace'; x2.fillText('TOPDOWN ch'+(G.ch+1)+' — blue: player, red: monster', 10, 20);
}
/* ============================================================
   PLAYER
   ============================================================ */
const PL = {
  x:5, z:5, yaw:0, pitch:0, y:1.62,
  stamina:100, exhausted:false,
  hidden:false, hideLocker:null, hidePrev:null,
  flashOn:false, bobT:0, bobPhase:0, speed:0, dead:false,
  fov:74, camShake:0,
};
const NOISES=[];
function emitNoise(x,z,r){ NOISES.push({x,z,r,t:1.2}); }

function resolveCollision(px,pz,r){
  // vs walls
  const [cx,cy]=wc(px,pz);
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    const gx=cx+dx, gy=cy+dy;
    if(!cellSolid(gx,gy)) continue;
    const [wx,wz]=cw(gx,gy);
    const minX=wx-CS/2, maxX=wx+CS/2, minZ=wz-CS/2, maxZ=wz+CS/2;
    const nx=clamp(px,minX,maxX), nz=clamp(pz,minZ,maxZ);
    let ddx=px-nx, ddz=pz-nz;
    let d=Math.hypot(ddx,ddz);
    if(d<r){
      if(d<0.0001){ ddx=px-wx; ddz=pz-wz; d=Math.hypot(ddx,ddz)||1; }
      px += ddx/d*(r-d); pz += ddz/d*(r-d);
    }
  }
  // vs crates & statue
  const circles=[];
  for(const c of LVL.crates) circles.push([c.x,c.z,0.5]);
  if(LVL.statue) circles.push([LVL.statue.x,LVL.statue.z,0.85]);
  for(const [ox,oz,or] of circles){
    const ddx=px-ox, ddz=pz-oz, d=Math.hypot(ddx,ddz), rr2=r+or;
    if(d<rr2 && d>0.001){ px+=ddx/d*(rr2-d); pz+=ddz/d*(rr2-d); }
  }
  return [px,pz];
}

function playerUpdate(dt){
  // look
  PL.yaw -= IN.lookDX; PL.pitch -= IN.lookDY;
  PL.pitch = clamp(PL.pitch, -1.35, 1.35);
  IN.lookDX=0; IN.lookDY=0;
  if(PL.hidden){
    PL.x=PL.hideLocker.fx; PL.z=PL.hideLocker.fz;
    if(IN.actEdge){ IN.actEdge=false; exitLocker(); }
  } else {
    let mx=IN.move.x, my=IN.move.y;
    if(IN.keys['w']||IN.keys['arrowup']) my-=1;
    if(IN.keys['s']||IN.keys['arrowdown']) my+=1;
    if(IN.keys['a']||IN.keys['arrowleft']) mx-=1;
    if(IN.keys['d']||IN.keys['arrowright']) mx+=1;
    const ml=Math.hypot(mx,my);
    if(ml>1){ mx/=ml; my/=ml; }
    const wantRun = (IN.run||IN.keys['shift']) && ml>0.4 && !PL.exhausted;
    const sprint = wantRun && PL.stamina>0;
    if(sprint){ PL.stamina-=dt*26; if(PL.stamina<=0){ PL.stamina=0; PL.exhausted=true; } }
    else { PL.stamina+=dt*15; if(PL.stamina>=35) PL.exhausted=false; PL.stamina=Math.min(PL.stamina,100); }
    const diffMul = {story:1.05, normal:1, nightmare:0.95}[G.settings.diff];
    const spd = (sprint?5.2:3.05)*diffMul;
    const fx=-Math.sin(PL.yaw), fz=-Math.cos(PL.yaw);
    const rx=Math.cos(PL.yaw), rz=-Math.sin(PL.yaw);
    let vx=(fx*-my + rx*mx)*spd;   // stick up (my<0) = forward
    let vz=(fz*-my + rz*mx)*spd;
    let nx=PL.x+vx*dt, nz=PL.z+vz*dt;
    [nx,nz]=resolveCollision(nx,nz,0.34);
    PL.x=nx; PL.z=nz;
    PL.speed=Math.hypot(vx,vz);
    // footsteps + noise
    PL.bobPhase += PL.speed*dt*2.6;
    if(PL.speed>0.4){
      const cyc=Math.floor(PL.bobPhase/Math.PI);
      if(cyc!==PL._lastCyc){ PL._lastCyc=cyc; SND.step(1, sprint); emitNoise(PL.x,PL.z, sprint?10:4.5); }
    }
    PL.bobT += dt*(sprint?11:7)*(PL.speed>0.4?1:0.2);
    // flashlight
    if(IN.flashEdge){ IN.flashEdge=false; PL.flashOn=!PL.flashOn; SND.uiClick(); }
  }
  // grab / act edges
  if(IN.grabEdge){ IN.grabEdge=false; if(G.state==='play' && !PL.hidden) GP.shoot(); }
  if(IN.actEdge){ IN.actEdge=false; tryInteract(); }

  // camera
  const bobY = Math.sin(PL.bobT*2)*0.035*(PL.speed>0.4?1:0.3);
  const bobX = Math.cos(PL.bobT)*0.02*(PL.speed>0.4?1:0);
  VIEW.camera.position.set(PL.x+bobX, PL.hidden?1.35:1.62+bobY, PL.z);
  VIEW.camera.rotation.set(PL.pitch, PL.yaw, 0, 'YXZ');
  const targetFov = (IN.run||IN.keys['shift']) && PL.speed>4 ? 80 : 74;
  PL.fov=lerp(PL.fov,targetFov,dt*5);
  if(Math.abs(VIEW.camera.fov-PL.fov)>0.1){ VIEW.camera.fov=PL.fov; VIEW.camera.updateProjectionMatrix(); }
  // flashlight follows with lag
  const fh=VIEW.camHolder;
  fh.position.copy(VIEW.camera.position);
  fh.quaternion.slerp(VIEW.camera.quaternion, 1-Math.pow(0.0001,dt));
  VIEW.flash.intensity = PL.flashOn ? (MON.active && distToMon()<7 ? (13+Math.sin(performance.now()*0.04)*6) : 24) : 0;
  // stamina bar
  $('stamfill').style.width=PL.stamina+'%';
  $('stamfill').style.background = PL.exhausted? '#d4453a' : '#b7c4a8';
  updateInteract();
}
function distToMon(){ return MON.active? Math.hypot(MON.x-PL.x,MON.z-PL.z) : 999; }

/* -------- interact -------- */
let INTERACT_TGT=null;
function interactCandidates(){
  const list=[];
  for(const d of LVL.doors){
    const dp=d.panel.getWorldPosition(new THREE.Vector3());
    const dist=Math.hypot(dp.x-PL.x, dp.z-PL.z);
    if(dist<2.0) list.push({kind:'door',ref:d,dist,dx:dp.x,dz:dp.z,label: d.open?'Close door':(d.locked? (d.locked==='power'?'NO POWER — link the circuit':'LOCKED — find a key') : 'Open door')});
  }
  for(const l of LVL.lockers){
    const dist=Math.hypot(l.x-PL.x,l.z-PL.z);
    if(dist<1.8 && !PL.hidden) list.push({kind:'locker',ref:l,dist,dx:l.x,dz:l.z,label:'Hide in locker'});
  }
  for(const t of LVL.tapes){
    if(t.taken) continue;
    const dist=Math.hypot(t.x-PL.x,t.z-PL.z);
    if(dist<2.0) list.push({kind:'tape',ref:t,dist,dx:t.x,dz:t.z,label:'Play tape #'+(t.idx+1)});
  }
  for(const c of LVL.consoles){
    const dist=Math.hypot(c.x-PL.x,c.z-PL.z);
    if(dist<2.0 && !c.done) list.push({kind:'console',ref:c,dist,dx:c.x,dz:c.z,label:LVL.def.consoleLabel||'Use machine'});
  }
  for(const s of LVL.switches){
    if(s.on) continue;
    const dist=Math.hypot(s.x-PL.x,s.z-PL.z);
    if(dist<1.8) list.push({kind:'switch',ref:s,dist,dx:s.x,dz:s.z,label:'Pull switch'});
  }
  if(LVL.statue && LVL.statue.placed<3){
    const dist=Math.hypot(LVL.statue.x-PL.x,LVL.statue.z-PL.z);
    if(dist<2.4) list.push({kind:'statue',ref:LVL.statue,dist,dx:LVL.statue.x,dz:LVL.statue.z,label:LVL.def.statueLabel||'Place part'});
  }
  if(LVL.exit && LVL.exit.open){
    const dist=Math.hypot(LVL.exit.x-PL.x,LVL.exit.z-PL.z);
    if(dist<2.2) list.push({kind:'exit',ref:LVL.exit,dist,dx:LVL.exit.x,dz:LVL.exit.z,label:'ESCAPE'});
  }
  return list;
}
function updateInteract(){
  const cands=interactCandidates();
  let best=null;
  for(const c of cands){
    const dx=c.dx-PL.x, dz=c.dz-PL.z;
    if(Math.hypot(dx,dz)>0.35){
      const fa=Math.atan2(-dx,-dz);
      const dd=Math.abs(((fa-PL.yaw+Math.PI*3)%TAU)-Math.PI);
      if(dd>1.5) continue;
    }
    if(!best||c.dist<best.dist) best=c;
  }
  INTERACT_TGT=best;
  const pr=$('prompt');
  if(best && !PL.hidden){ pr.textContent=best.label; pr.style.display='block'; }
  else if(PL.hidden){ pr.textContent='Leave locker'; pr.style.display='block'; }
  else pr.style.display='none';
  $('bAct').style.display=(best||PL.hidden)&&IN.isTouch?'flex':'none';
  // crosshair heat when a grabbable is under the crosshair
  let hot=false;
  if(!PL.hidden){
    const ray=new THREE.Raycaster(); ray.far=13;
    ray.setFromCamera({x:0,y:0}, VIEW.camera);
    const hits=ray.intersectObjects(VIEW._lvlScene?VIEW._lvlScene.children:[], true);
    if(hits.length){
      let o=hits[0].object;
      while(o){ if(o.userData&&o.userData.grab){ hot=true; break; } o=o.parent; }
    }
  }
  $('cross').classList.toggle('hot',hot);
}
function tryInteract(){
  if(PL.hidden){ exitLocker(); return; }
  if(!INTERACT_TGT) return;
  const c=INTERACT_TGT;
  if(c.kind==='door'){
    const d=c.ref;
    if(d.open){ d.open=false; SND.doorSlide(false); }
    else if(!d.locked){ d.open=true; SND.doorSlide(true); emitNoise(d.panel.position.x,d.panel.position.z,6); }
    else if(d.locked==='keycard' && G.inv.keycard>0){ d.locked=null; d.open=true; SND.doorSlide(true); SND.powerUp(); Cap.say('KEYCARD accepted. The gate is open.',2800); advance(); }
    else SND.lockBuzz();
  }
  else if(c.kind==='locker') enterLocker(c.ref);
  else if(c.kind==='tape') playTape(c.ref);
  else if(c.kind==='console') useConsole(c.ref);
  else if(c.kind==='switch') flipSwitch(c.ref);
  else if(c.kind==='statue') placePart(c.ref);
  else if(c.kind==='exit') endChapter();
}
function enterLocker(l){
  PL.hidden=true; PL.hideLocker={fx:l.x, fz:l.z};
  PL.x=l.x; PL.z=l.z;
  l.busy=true; PL.hideLockerRef=l;
  SND.doorSlide(false);
  PL.hideEnterSeen = (MON.state==='chase' && distToMon()<10);
  Cap.say('Hiding… stay still. (USE to exit)',2400);
}
function exitLocker(){
  const l=PL.hideLockerRef; PL.hidden=false;
  if(l){ l.busy=false;
    const fx=Math.sin(l.g.rotation.y), fz=Math.cos(l.g.rotation.y);
    PL.x=l.x - fx*0.95; PL.z=l.z - fz*0.95;
    const [rx,rz]=resolveCollision(PL.x,PL.z,0.34); PL.x=rx; PL.z=rz;
  }
  SND.doorSlide(true);
}
function useConsole(c){
  const def=LVL.def;
  if(!def.consoleNeed) return;
  const {kind,count}=def.consoleNeed;
  const got = def.consoleHave ? def.consoleHave(c) : G.inv[kind];
  if(got>=count){
    G.inv[kind]-=count; c.done=true;
    SND.powerUp(); SND.spark();
    if(LVL.script&&LVL.script.onConsole) LVL.script.onConsole(c);
    setObjectiveFromScript();
  } else {
    SND.errBuzz();
    Cap.say('Machine: MISSING COMPONENTS ('+got+'/'+count+' '+kind+'s).',3000,true);
  }
}
function flipSwitch(s){
  s.on=true; SND.leverSfx(); SND.powerUp();
  s.btn.material.color.setHex(0x2fd45c); s.btn.material.emissive.setHex(0x0a4a1a);
  emitNoise(s.x,s.z,20);
  if(LVL.script&&LVL.script.onSwitch) LVL.script.onSwitch(s);
}
function placePart(st){
  if(G.inv.part<=0){ SND.errBuzz(); return; }
  G.inv.part--; st.placed++;
  const col=[0x7ad4b0,0xe8b34b,0xd4453a][st.placed-1];
  st.slots[st.placed-1].material.emissive.setHex(col);
  SND.grabHit(); SND.powerUp();
  Cap.say('Part '+st.placed+'/3 placed.',2200);
  if(st.placed>=3 && LVL.script&&LVL.script.onStatue) LVL.script.onStatue(st);
  setObjectiveFromScript();
}

/* ============================================================
   GRABPACK
   ============================================================ */
const GP = {
  state:'idle', t:0, from:new THREE.Vector3(), to:new THREE.Vector3(),
  target:null, cable:[], latched:null, crateAnim:null, leverAnim:null,
};
(function initGP(){
  const g=new THREE.Group();
  const palm=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.09,0.26), new THREE.MeshStandardMaterial({color:0xc23b2e,roughness:0.5}));
  g.add(palm);
  for(let i=0;i<4;i++){
    const f=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.05,0.16), palm.material);
    f.position.set(-0.08+i*0.055, 0, -0.2); g.add(f);
  }
  const thumb=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.13), palm.material);
  thumb.position.set(0.13,0,-0.1); thumb.rotation.y=0.5; g.add(thumb);
  const wrist=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,0.14,8), new THREE.MeshStandardMaterial({color:0x8a2a20,roughness:0.5}));
  wrist.position.y=0.09; g.add(wrist);
  g.position.set(-0.42,-0.35,-0.55);
  VIEW.camHolder.add(g);
  GP.rest=g;
  for(let i=0;i<12;i++){
    const s=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,5), new THREE.MeshStandardMaterial({color:0xd4453a,roughness:0.4}));
    s.visible=false; VIEW.camHolder.add(s); GP.cable.push(s);
  }
})();
function gpPackPos(){
  const v=new THREE.Vector3(0.4,-0.15,-0.3);
  VIEW.camHolder.localToWorld(v); return v;
}
GP.shoot=function(){
  if(!G.inv.grabpack){ SND.errBuzz(); Cap.say('You need the GRABPACK.',2000); return; }
  if(GP.state!=='idle') return;
  SND.whoosh();
  const ray=new THREE.Raycaster(); ray.far=13;
  ray.setFromCamera({x:0,y:0}, VIEW.camera);
  const hits=ray.intersectObjects(VIEW._lvlScene?VIEW._lvlScene.children:[], true);
  let target=null;
  for(const h of hits){
    let o=h.object; let found=null;
    while(o){ if(o.userData&&o.userData.grab){ found=o.userData.grab; break; } o=o.parent; }
    if(found){ target={grab:found, point:h.point}; break; }
    if(!target){ target={grab:null, point:h.point}; break; } // wall whiff
  }
  if(!target) target={grab:null, point:VIEW.camera.position.clone().add(new THREE.Vector3(Math.sin(-PL.yaw)*10, -1, Math.cos(-PL.yaw)*10))};
  GP.state='fly'; GP.t=0;
  GP.from.copy(gpPackPos());
  GP.to.copy(target.point);
  GP.target=target;
  GP.rest.visible=false;
  if(!GP.worldHand){ GP.worldHand=GP.rest.clone(); VIEW.scene.add(GP.worldHand); }
  GP.worldHand.visible=true;
};
GP.update=function(dt){
  const pack=gpPackPos();
  if(GP.state==='fly'){
    GP.t+=dt*3.2;
    const t=Math.min(1,GP.t);
    const p=GP.from.clone().lerp(GP.to,t);
    GP.worldHand.position.copy(p);
    GP.worldHand.lookAt(GP.to);
    drawCable(pack,p,Math.min(1,GP.t*1.5));
    if(t>=1){
      SND.grabHit();
      if(GP.target.grab) doGrab(GP.target.grab, GP.target.point);
      GP.state='back'; GP.t=0; GP.from.copy(GP.to);
    }
  } else if(GP.state==='back'){
    GP.t+=dt*4.5;
    const t=Math.min(1,GP.t);
    const p=GP.from.clone().lerp(pack,t);
    GP.worldHand.position.copy(p);
    drawCable(pack,p,1-t*0.5);
    if(t>=1){ GP.state='idle'; GP.worldHand.visible=false; GP.rest.visible=true; drawCable(pack,pack,0); }
  }
  if(GP.crateAnim){
    const a=GP.crateAnim; a.t+=dt*3;
    const t=Math.min(1,a.t);
    a.crate.x=lerp(a.sx,a.tx,t); a.crate.z=lerp(a.sz,a.tz,t);
    a.crate.mesh.position.set(a.crate.x,0.43+Math.sin(t*Math.PI)*0.3,a.crate.z);
    if(t>=1) GP.crateAnim=null;
  }
  if(GP.leverAnim){
    const a=GP.leverAnim; a.t+=dt*2.5;
    a.ref.pivot.rotation.x=-Math.min(1,a.t)*1.35;
    if(a.t>=1) GP.leverAnim=null;
  }
  if(GP.latched){
    const sp=new THREE.Vector3(); GP.latched.g.getWorldPosition(sp);
    drawCable(pack, sp, 1);
  }
  GP.rest.position.y=-0.35+Math.sin(performance.now()*0.0012)*0.02;
  VIEW.handLight.intensity = GP.state!=='idle'? 1.2 : 0;
};
function drawCable(a,b,frac){
  const n=GP.cable.length;
  const mid=a.clone().lerp(b,0.5); mid.y-=0.09*a.distanceTo(b);
  for(let i=0;i<n;i++){
    const s=GP.cable[i];
    const t=(i/(n-1))*frac;
    const p=a.clone().lerp(b,t).lerp(mid, Math.sin(t*Math.PI)*0.55);
    s.position.copy(p); s.visible=frac>0.01;
  }
}
function doGrab(gr, point){
  emitNoise(point.x,point.z, gr.type==='crate'?15:6);
  if(gr.type==='socket'){
    const s=gr.ref;
    if(GP.latched && GP.latched!==s){
      const pair = LVL.def.socketPairs||[];
      const linked = pair.some(p=>(p[0]===GP.latched.idx&&p[1]===s.idx)||(p[1]===GP.latched.idx&&p[0]===s.idx));
      if(linked){ completeCircuit(GP.latched, s); return; }
    }
    if(!GP.latched){
      GP.latched=s; s.latched=true;
      const plug=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.1,8), new THREE.MeshStandardMaterial({color:0xd4453a,emissive:0x400000}));
      VIEW.scene.add(plug);
      const sp=new THREE.Vector3(); s.g.getWorldPosition(sp);
      const dir=new THREE.Vector3(0,0,1).applyQuaternion(s.g.quaternion);
      plug.position.copy(sp).add(dir.multiplyScalar(0.12));
      s.plug=plug;
      SND.latch(); Cap.say('Hand latched. Now grab the OTHER socket.',3200);
    }
  }
  else if(gr.type==='lever'){
    const l=gr.ref;
    if(!l.pulled){ l.pulled=true; GP.leverAnim={ref:l,t:0}; SND.leverSfx(); setTimeout(()=>{ if(LVL.script&&LVL.script.onLever) LVL.script.onLever(l); }, 250); }
  }
  else if(gr.type==='crate'){
    const c=gr.ref;
    const dir=new THREE.Vector3(c.x-PL.x,0,c.z-PL.z).normalize();
    const nx=c.x-dir.x*1.1, nz=c.z-dir.z*1.1;
    const [rx,rz]=resolveCollision(nx,nz,0.45);
    GP.crateAnim={crate:c,sx:c.x,sz:c.z,tx:rx,tz:rz,t:0};
    SND.grabHit();
    Cap.say('*CLUNK!* He hears that.',2200,true);
  }
  else if(gr.type==='switch'){
    flipSwitch(gr.ref);
  }
}
function completeCircuit(a,b){
  SND.spark(); SND.powerUp();
  Cap.say('CIRCUIT COMPLETE',2400);
  const pa=new THREE.Vector3(); a.g.getWorldPosition(pa);
  const pb=new THREE.Vector3(); b.g.getWorldPosition(pb);
  const bolt=[]; const n=14;
  for(let i=0;i<n;i++){ const s=new THREE.Mesh(new THREE.SphereGeometry(0.04,4,4), new THREE.MeshBasicMaterial({color:0x9adcff}));
    s.position.copy(pa).lerp(pb,i/(n-1)); s.position.x+=rr(-0.06,0.06); s.position.y+=rr(-0.06,0.06);
    VIEW.scene.add(s); bolt.push(s); }
  setTimeout(()=>{ bolt.forEach(s=>VIEW.scene.remove(s)); },600);
  a.latched=false; b.latched=false;
  if(a.plug){ VIEW.scene.remove(a.plug); a.plug=null; }
  if(b.plug){ VIEW.scene.remove(b.plug); b.plug=null; }
  GP.latched=null;
  if(LVL.script&&LVL.script.onCircuit) LVL.script.onCircuit(a,b);
}
function registerGrabbables(){
  for(const s of LVL.sockets){ s.g.userData.grab={type:'socket',ref:s}; }
  for(const l of LVL.levers){ l.g.userData.grab={type:'lever',ref:l}; }
  for(const c of LVL.crates){ c.mesh.userData.grab={type:'crate',ref:c}; }
  for(const s of LVL.switches){ s.g.userData.grab={type:'switch',ref:s}; }
}

/* ============================================================
   MONSTER — MR. STITCH
   ============================================================ */
function makeBearMesh(scale, color, statue){
  const g=new THREE.Group();
  const fur=new THREE.MeshStandardMaterial({map:texFur(color), roughness:1});
  const furL=new THREE.MeshStandardMaterial({map:texFur('#1d2a2e'), roughness:1});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.5,0.55,6,12), fur);
  body.position.y=1.35; body.castShadow=true; g.add(body);
  const belly=new THREE.Mesh(new THREE.SphereGeometry(0.42,10,10), new THREE.MeshStandardMaterial({map:texFur('#31434a'),roughness:1}));
  belly.scale.set(1,1.2,0.6); belly.position.set(0,1.3,-0.28); g.add(belly);
  const head=new THREE.Group(); head.position.y=2.25; g.add(head);
  const skull=new THREE.Mesh(new THREE.SphereGeometry(0.55,14,12), fur); skull.castShadow=true; head.add(skull);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(0.95,0.95), new THREE.MeshStandardMaterial({map:texFace(),roughness:0.9}));
  face.position.z=-0.47; face.rotation.y=Math.PI; head.add(face);
  const earGeo=new THREE.SphereGeometry(0.16,8,6);
  const e1=new THREE.Mesh(earGeo,fur); e1.position.set(-0.38,0.45,0); head.add(e1);
  const e2=new THREE.Mesh(earGeo,fur); e2.position.set(0.38,0.45,0); head.add(e2);
  const eyeW=new THREE.MeshStandardMaterial({color:0xf2ede0, emissive:0xf2ede0, emissiveIntensity:statue?0.1:0.75, roughness:0.4});
  const pup=new THREE.MeshStandardMaterial({color:0x0a0a0a, roughness:0.6});
  const eyes=[];
  for(const ex of [-0.2,0.2]){
    const e=new THREE.Mesh(new THREE.SphereGeometry(0.11,8,8), eyeW); e.position.set(ex,0.16,-0.44); head.add(e);
    const p=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), pup); p.position.set(ex,0.16,-0.52); head.add(p);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowSpriteTex(), color:0xff3020, transparent:true, opacity:statue?0:0.25, blending:THREE.AdditiveBlending, depthWrite:false}));
    spr.scale.set(0.5,0.5,1); spr.position.set(ex,0.16,-0.6); head.add(spr); eyes.push(spr);
  }
  const armL=new THREE.Group(); armL.position.set(-0.62,1.95,0); g.add(armL);
  const armR=new THREE.Group(); armR.position.set(0.62,1.95,0); g.add(armR);
  const armGeo=new THREE.CapsuleGeometry(0.13,0.85,4,8);
  const aL=new THREE.Mesh(armGeo,furL); aL.position.y=-0.55; armL.add(aL);
  const aR=new THREE.Mesh(armGeo,furL); aR.position.y=-0.55; armR.add(aR);
  const handGeo=new THREE.SphereGeometry(0.19,8,8);
  const hL=new THREE.Mesh(handGeo,furL); hL.position.y=-1.1; hL.scale.set(1,1.25,0.7); armL.add(hL);
  const hR=new THREE.Mesh(handGeo,furL); hR.position.y=-1.1; hR.scale.set(1,1.25,0.7); armR.add(hR);
  const legL=new THREE.Group(); legL.position.set(-0.26,0.62,0); g.add(legL);
  const legR=new THREE.Group(); legR.position.set(0.26,0.62,0); g.add(legR);
  const legGeo=new THREE.CapsuleGeometry(0.16,0.5,4,8);
  const lL=new THREE.Mesh(legGeo,furL); lL.position.y=-0.32; legL.add(lL);
  const lR=new THREE.Mesh(legGeo,furL); lR.position.y=-0.32; legR.add(lR);
  const footGeo=new THREE.BoxGeometry(0.28,0.14,0.4);
  const fL=new THREE.Mesh(footGeo,furL); fL.position.set(0,-0.55,-0.08); legL.add(fL);
  const fR=new THREE.Mesh(footGeo,furL); fR.position.set(0,-0.55,-0.08); legR.add(fR);
  const stMat=new THREE.MeshStandardMaterial({color:0x0e1416, roughness:0.9});
  for(let i=0;i<5;i++){
    const s=new THREE.Mesh(new THREE.BoxGeometry(rr(0.2,0.5),0.02,0.02), stMat);
    s.position.set(rr(-0.4,0.4), rr(0.8,2.4), rr(-0.4,0.42));
    s.rotation.z=rr(0,TAU); g.add(s);
  }
  g.scale.setScalar(scale/2.6);
  g.userData.refs={armL,armR,legL,legR,head,eyes,body};
  return g;
}
const MON = {
  active:false, x:0,z:0,yaw:0, state:'patrol', path:null, pathI:0, repathT:0,
  lostT:0, lastSeen:null, wpI:0, waitT:0, anim:0, speedMul:1, buff:0,
  growlT:3, stepCyc:0, mesh:null,
};
function spawnMonster(){
  if(!LVL.monsterSpawn) return;
  if(!MON.mesh){ MON.mesh=makeBearMesh(2.7,'#223238'); VIEW.scene.add(MON.mesh); }
  MON.mesh.visible=true;
  const [wx,wz]=cw(LVL.monsterSpawn[0],LVL.monsterSpawn[1]);
  MON.x=wx; MON.z=wz; MON.active=true; MON.state='patrol'; MON.path=null; MON.wpI=0;
  MON.speedMul=1; MON.buff=0; MON.lostT=0; MON.waitT=1;
}
function removeMonster(){ MON.active=false; if(MON.mesh) MON.mesh.visible=false; }
const DIFF={ story:{sight:9,chase:2.5,hear:0.7}, normal:{sight:13,chase:3.2,hear:1}, nightmare:{sight:16,chase:3.9,hear:1.3} };
function monsterUpdate(dt){
  if(!MON.active) { SND.chaseMusic(false); return; }
  const D=DIFF[G.settings.diff]||DIFF.normal;
  const def=LVL.def;
  const sightR=(def.sight||D.sight)*(PL.flashOn&&losGrid(MON.x,MON.z,PL.x,PL.z)?1.35:1);
  const chaseSp=(def.chase||D.chase)+MON.buff;
  // ---- senses ----
  let canSee=false;
  if(!PL.hidden && !PL.dead){
    const dx=PL.x-MON.x, dz=PL.z-MON.z, d=Math.hypot(dx,dz);
    if(d<sightR){
      const ang=Math.atan2(-dx,-dz);
      const dd=Math.abs(((ang-MON.yaw+Math.PI*3)%TAU)-Math.PI);
      if(dd<1.15 || d<3.2){
        if(losGrid(MON.x,MON.z,PL.x,PL.z)) canSee=true;
      }
    }
  }
  if(canSee){
    if(MON.state!=='chase'){ SND.growl(MON.x,MON.z,true); Cap.say('HE SEES YOU — RUN!',2400,true); }
    MON.state='chase'; MON.lostT=0; MON.lastSeen=[PL.x,PL.z];
  } else if(MON.state==='chase'){
    MON.lostT+=dt;
    if(MON.lostT>3.5){ MON.state='search'; MON.searchT=6; MON.path=null; }
  }
  // ---- hearing ----
  for(const n of NOISES){
    const d=Math.hypot(n.x-MON.x,n.z-MON.z);
    if(d < n.r*(def.hearMul||D.hear) && MON.state!=='chase'){
      MON.state='invest'; MON.investP=[n.x,n.z]; MON.path=null;
    }
  }
  // ---- behavior ----
  let speed=0, tgt=null;
  if(MON.state==='patrol'){
    const wps=LVL.waypoints;
    if(wps.length){
      tgt=wps[MON.wpI%wps.length];
      const [tx,tz]=cw(tgt[0],tgt[1]);
      if(Math.hypot(tx-MON.x,tz-MON.z)<0.7){ MON.wpI++; MON.waitT=rr(0.5,2.5); }
      speed=def.patrol||1.55;
    } else {
      if(!MON.wander || Math.hypot(MON.wander[0]-MON.x,MON.wander[1]-MON.z)<1.2){
        const [rx,rz]=cw(ri(1,LVL.W-2),ri(1,LVL.H-2)); MON.wander=[rx,rz];
      }
      tgt=[Math.floor(MON.wander[0]/CS),Math.floor(MON.wander[1]/CS)];
      speed=(def.patrol||1.55)*0.8;
    }
    if(MON.waitT>0){ MON.waitT-=dt; speed=0; }
  }
  else if(MON.state==='invest'){
    tgt=[Math.floor(MON.investP[0]/CS),Math.floor(MON.investP[1]/CS)];
    speed=def.invest||2.2;
    const [tx,tz]=cw(tgt[0],tgt[1]);
    if(Math.hypot(tx-MON.x,tz-MON.z)<0.9){ MON.state='search'; MON.searchT=3; MON.path=null; }
  }
  else if(MON.state==='chase'){
    tgt=[Math.floor(PL.x/CS),Math.floor(PL.z/CS)];
    speed=chaseSp;
  }
  else if(MON.state==='search'){
    MON.searchT-=dt;
    if(!MON.searchP || Math.hypot(MON.searchP[0]-MON.x,MON.searchP[1]-MON.z)<0.9){
      const bx=MON.lastSeen?Math.floor(MON.lastSeen[0]/CS):Math.floor(MON.x/CS);
      const by=MON.lastSeen?Math.floor(MON.lastSeen[1]/CS):Math.floor(MON.z/CS);
      MON.searchP=null;
      for(let tries=0;tries<8;tries++){
        const nx=clamp(bx+ri(-3,3),1,LVL.W-2), ny=clamp(by+ri(-3,3),1,LVL.H-2);
        if(!cellSolid(nx,ny)){ MON.searchP=[nx,ny]; break; }
      }
      if(!MON.searchP) MON.searchP=[bx,by];
    }
    tgt=MON.searchP; speed=(def.invest||2.2)*0.85;
    if(MON.searchT<=0){ MON.state='patrol'; MON.searchP=null; }
  }
  // ---- pathing ----
  MON.repathT-=dt;
  const mc=[Math.floor(MON.x/CS),Math.floor(MON.z/CS)];
  if(tgt && (MON.repathT<=0 || !MON.path)){
    MON.path=findPath(mc[0],mc[1],tgt[0],tgt[1]); MON.pathI=0;
    MON.repathT=MON.state==='chase'?0.4:0.9;
  }
  if(MON.path && MON.pathI<MON.path.length && speed>0){
    const [nx,ny]=MON.path[MON.pathI];
    const [tx,tz]=cw(nx,ny);
    const dx=tx-MON.x, dz=tz-MON.z, d=Math.hypot(dx,dz);
    if(d<0.35){ MON.pathI++; }
    else {
      const sp=speed*MON.speedMul;
      MON.x+=dx/d*sp*dt; MON.z+=dz/d*sp*dt;
      const tyaw=Math.atan2(-dx,-dz);
      MON.yaw=dlerp(MON.yaw,tyaw,dt*(MON.state==='chase'?8:4));
      MON.anim+=dt*sp*1.9;
      const cyc=Math.floor(MON.anim/Math.PI);
      if(cyc!==MON.stepCyc){ MON.stepCyc=cyc; SND.monStep(MON.x,MON.z); }
    }
  } else { MON.anim+=dt*0.5; }
  // stuck detection
  MON._moveAcc=(MON._moveAcc||0)+Math.hypot(MON.x-(MON._px??MON.x), MON.z-(MON._pz??MON.z));
  MON._px=MON.x; MON._pz=MON.z;
  MON._moveT=(MON._moveT||0)+dt;
  if(MON._moveT>2){ if(MON._moveAcc<0.3 && speed>0){ MON.path=null; MON.repathT=0; } MON._moveAcc=0; MON._moveT=0; }
  // kill
  if(!PL.dead && !PL.hidden && !G.flags.noKill && Math.hypot(MON.x-PL.x,MON.z-PL.z)<1.15) killPlayer();
  // audio
  MON.growlT-=dt;
  if(MON.growlT<=0){ SND.growl(MON.x,MON.z,MON.state==='chase'); MON.growlT=rr(3,8); }
  const dm=distToMon();
  SND.setHeartbeat(MON.state==='chase'||dm<9, MON.state==='chase'?0.55:0.9);
  SND.chaseMusic(MON.state==='chase');
  // visuals
  const R=MON.mesh.userData.refs;
  MON.mesh.position.set(MON.x, Math.abs(Math.sin(MON.anim))*0.08, MON.z);
  MON.mesh.rotation.y=MON.yaw;
  const sw=Math.sin(MON.anim);
  R.legL.rotation.x=sw*0.55; R.legR.rotation.x=-sw*0.55;
  const armUp = MON.state==='chase'? 1.5 : 0.15;
  R.armL.rotation.x=lerp(R.armL.rotation.x, -sw*0.4-armUp, dt*6);
  R.armR.rotation.x=lerp(R.armR.rotation.x, sw*0.4-armUp, dt*6);
  R.head.rotation.x = MON.state==='chase'? 0.15 : Math.sin(MON.anim*0.5)*0.06;
  const eyeI = MON.state==='chase'? 0.55 : 0.2;
  R.eyes.forEach(s=>{ s.material.opacity=lerp(s.material.opacity, eyeI, dt*4); });
}
function killPlayer(){
  if(G.state!=='play') return;
  PL.dead=true; G.state='dying'; G._dieT=0;
  SND.scream(); SND.setHeartbeat(false); SND.chaseMusic(false);
  $('flashred').style.opacity='0.35';
  const dx=MON.x-PL.x, dz=MON.z-PL.z;
  PL.yaw=Math.atan2(-dx,-dz); PL.pitch=0.15;
  G.deaths++;
}
function dyingUpdate(dt){
  G._dieT+=dt;
  if(MON.active){
    const dir=new THREE.Vector3(Math.sin(MON.yaw+Math.PI),0,Math.cos(MON.yaw+Math.PI));
    const want=new THREE.Vector3(MON.x,0,MON.z).add(dir.multiplyScalar(0.9));
    PL.x=lerp(PL.x,want.x,dt*6); PL.z=lerp(PL.z,want.z,dt*6);
    MON.yaw=dlerp(MON.yaw,Math.atan2(PL.x-MON.x,PL.z-MON.z),dt*6);
    MON.mesh.position.set(MON.x,0,MON.z);
    MON.mesh.rotation.y=MON.yaw;
    MON.mesh.scale.setScalar((2.7/2.6)*(1+G._dieT*0.12));
  }
  VIEW.camera.position.set(PL.x, 1.5+Math.sin(G._dieT*30)*0.02, PL.z);
  VIEW.camera.rotation.set(PL.pitch,PL.yaw,0,'YXZ');
  $('flashred').style.opacity=String(0.2+Math.min(0.6,G._dieT*0.5));
  if(G._dieT>1.35){ $('flashred').style.opacity='0'; showDeath(); }
}
/* ============================================================
   MAP BUILDER
   ============================================================ */
class MB{
  constructor(w,h){ this.w=w; this.h=h; this.g=Array.from({length:h},()=>Array(w).fill('#')); }
  fill(x0,y0,x1,y1,ch='.'){ for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) this.g[y][x]=ch; return this; }
  col(x,y0,y1,ch='#'){ return this.fill(x,y0,x,y1,ch); }
  row(y,x0,x1,ch='#'){ return this.fill(x0,y,x1,y,ch); }
  door(x,y){ this.g[y][x]='d'; return this; }
  pdoor(x,y){ this.g[y][x]='D'; return this; }
  set(x,y,ch){ this.g[y][x]=ch; return this; }
  rows(){ return this.g.map(r=>r.join('')); }
}
function doorById(id){ return LVL.doors.find(d=>d.id===id) || LVL.doorAt.get(id) || null; }
function openDoor(id){ const d=doorById(id); if(d){ d.locked=null; d.open=true; SND.doorSlide(true); } return d; }
function lockDoor(id,why){ const d=doorById(id); if(d) d.locked=why; }
function advance(){
  G.stage++;
  G.checkpoint={ stage:G.stage, flags:JSON.parse(JSON.stringify(G.flags)), inv:{...G.inv},
    taken:LVL.pickups.filter(p=>p.taken).map(p=>p.kind+':'+p.cell.join(',')) };
  saveGame();
  SND.pickupSfx();
  setObjectiveFromScript();
}
function setObjective(t){ $('obj').innerHTML='<b>OBJECTIVE</b> · '+t; }
function setObjectiveFromScript(){
  const o=LVL&&LVL.def&&LVL.def.objective;
  if(o) setObjective(o(G.stage,G.flags));
}
function spawnPickup(kind,cx,cy){
  const [wx,wz]=cw(cx,cy);
  const geo = kind==='grabpack' ? new THREE.BoxGeometry(0.4,0.3,0.3) : new THREE.SphereGeometry(0.16,10,8);
  const col = kind==='grabpack'? 0xc23b2e : 0x7ad4b0;
  const mesh=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.5,roughness:0.4}));
  mesh.position.set(wx,0.95,wz);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowSpriteTex(),color:col,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));
  spr.scale.set(1,1,1); mesh.add(spr);
  VIEW._lvlScene.add(mesh);
  LVL.pickups.push({kind,x:wx,z:wz,mesh,taken:false,idx:0,cell:[cx,cy]});
}

/* ============================================================
   TAPE ARCHIVE — the story of Wonder Toys
   ============================================================ */
const TAPES=[
 {n:"ORIENTATION '87", t:"Welcome to Wonder Toys, kiddo! Remember the Three Rules of the floor:\n\n1. Smile wide.\n2. Play nice.\n\n3. Never, EVER, listen to the walls.\n\nThey get lonely. — Marlow, floor manager"},
 {n:"RECALL NOTICE", t:"INTERNAL — DO NOT COPY.\n\nThe Recall is voluntary.\n\n(Mostly.)\n\nBring your build-friend down to the maintenance level and leave it with the doctor. It will be happier there. You will be happier too.\n\n— Management"},
 {n:"NIGHT SHIFT LOG 7", t:"They stitched number 7 wrong.\n\nIt hums at night. I can hear it through the vents, right above break room B. It hums OUR SONG.\n\nTonight it said my name.\n\nI don't clock in anymore."},
 {n:"DR. ANDERS — NOTES", t:"People keep asking if the Friends are haunted.\n\nHaunted implies ghosts. Ghosts want things.\n\nThese are worse. These are HUNGRY, and what they want is to keep playing."},
 {n:"WAREHOUSE MANIFEST", t:"400 units — 'CUDDLE BEAR' (ship)\n1 unit — 'MR. STITCH' (DO NOT SHIP)\n\nDO NOT FEED.\nDO NOT SAY HIS NAME ON THE FLOOR.\n\nHe counts the footsteps. He knows when one is missing."},
 {n:"SIX HOURS", t:"If you're hearing this: the lights are out, and you followed the parts in. Good.\n\nHe can't count past three. Use that. Break the line of sight, then move on the FOURTH second.\n\nI hid in a locker for six hours once. He stood there, breathing like a bellows. Humming."},
 {n:"PLAYCARE MEMO", t:"Playcare was built for the children of the staff.\n\nThe children are fine.\nThe children were ALWAYS fine.\n\nPlease stop asking about the vents."},
 {n:"IT LEARNED THE DOORS", t:"It learned the fire doors. It learned the elevators.\n\nNow it waits at the ones you like.\n\nIf a door is open that you closed — do not go through it. Go around. Even if it's longer. ESPECIALLY if it's longer."},
 {n:"STITCH PROTOCOL", t:"To kill the power to his den: three switches, then the master lead between the blue sockets.\n\nWhoever pulls the third switch — RUN. The dark after that one is HIS."},
 {n:"PERSONAL — ELLIE", t:"If you found this, then you came. Of course you came.\n\nI got out. I think I got out. The elevator music was wrong, and the doors closed too soft, and\n\n— don't trust the elevator music. — Ellie"},
 {n:"DR. ANDERS — FINAL", t:"Found: one prototype, 'MR. STITCH'. Docile when powered down.\n\nWe gave him a heart so he could love the children.\n\nNobody told us love needs to EAT.\n\nSeal the den. Leave the lights ON."},
 {n:"MR. STITCH — HIS TAPE", t:"(a slow humming. a child's music box, winding down.)\n\n'friends… forever…'\n\n'you came back to play.'\n\n'i counted your footsteps. all of them. even the missing one.'"},
];

/* ============================================================
   CHAPTERS
   ============================================================ */
const INTRO_SLIDES=[
"WONDER TOYS CO.\nEST. 1961 — 'FRIENDS ARE FOREVER'",
"NOTICE OF RECALL — 1993\n\nAll units recalled. Staff: exit the building.\nLeave the friends inside.\nLeave the lights ON.\n\n— Management",
"30 years later.\n\nThe factory still stands.\nThe lights are still on.\n\nNobody ever turned them off.",
"Ellie worked here. Ellie vanished here.\n\nHer last tape arrived with no return address.\n\nTonight, you clock in.",
];
const OUTRO_SLIDES=[
"The elevator doors close.\n\nSomewhere below, something starts to hum.",
"Your sister's tape is in your pocket.\n\n'Don't trust the elevator music.'",
"The music begins to play.\n\nIt is, somehow, in tune.\n\nYou arrive at the surface. The night air is real.\n\nBehind you, deep in the building, something counts:\n\n'…one. two. three.'",
];

const CHAPTERS=[
/* ---------------- CHAPTER 1 : WELCOME BACK ---------------- */
{
 name:"WELCOME BACK", num:"CHAPTER ONE", seed:1101,
 fogColor:0x04070a, fogDensity:0.052, lampColor:0xffe2b0, lampI:7,
 buildMap(){ const m=new MB(30,20);
   m.fill(1,1,28,4); m.col(7,1,4); m.col(17,1,4);
   m.door(7,3); m.door(17,3);
   m.fill(1,6,2,12); m.fill(4,6,11,9); m.door(3,7); m.door(10,5);
   m.fill(18,6,28,9); m.door(23,5);
   m.fill(23,10,23,13); m.pdoor(23,11);
   m.fill(1,14,8,18); m.door(2,13);
   m.fill(22,14,28,18); m.door(23,14);
   m.set(3,2,'P'); m.set(27,17,'M');
   m.set(4,2,'o'); m.set(12,2,'o'); m.set(20,2,'T'); m.set(28,2,'L');
   m.set(28,3,'W');
   m.set(6,8,'F'); m.set(9,7,'B'); m.set(10,6,'o');
   m.set(20,8,'F'); m.set(26,7,'X'); m.set(24,6,'S'); m.set(21,9,'S');
   m.set(2,16,'T'); m.set(6,16,'o'); m.set(1,14,'L');
   m.set(25,18,'E');
   m.set(5,15,'1'); m.set(27,7,'2'); m.set(10,3,'3'); m.set(5,16,'4');
   return m.rows(); },
 tapeIds:[0,1],
 socketPairs:[[0,1]],
 consoleNeed:{kind:'fuse',count:2},
 consoleLabel:'Fusebox — insert fuses',
  exitStage:4,
 triggers:[
   {x:2,y:2,id:'intro'},
   {x:23,y:12,id:'cameo'},
   {x:25,y:16,id:'exitwalk'},
 ],
 leverLinks:{0:'23,5'},
 objective(st,f){
   if(st===0) return 'Find the GRABPACK in the lobby.';
   if(st===1) return 'Collect 2 FUSES. The machine room is sealed — find the lever in the office.';
   if(st===2) return 'Insert the fuses at the FUSEBOX (machine room).';
   if(st===3) return 'Link the two blue SOCKETS with the GrabPack to power the gate.';
   return 'GET TO THE EXIT. Do not stop walking.';
 },
 script:{
   onEnter(){
     spawnPickup('grabpack',4,3);
     lockDoor('23,5','lever');
     lockDoor('23,11','power');
   },
   stages:{
     1(){ lockDoor('23,5','lever'); lockDoor('23,11','power'); },
     2(){ openDoor('23,5'); LVL.levers[0].pulled=true; lockDoor('23,11','power'); },
     3(){ openDoor('23,5'); LVL.levers[0].pulled=true;
          LVL.consoles[0].done=true; G.inv.fuse=0; lockDoor('23,11','power'); },
     4(){ openDoor('23,5'); LVL.levers[0].pulled=true;
          LVL.consoles[0].done=true; G.inv.fuse=0; openDoor('23,11'); },
   },
   onPickup(pk){
     if(pk.kind==='grabpack'){ Cap.say('GRABPACK acquired. AIM at levers, sockets, crates — press GRAB.',4200); advance(); }
     else if(pk.kind==='fuse'){ Cap.say('Fuse '+G.inv.fuse+'/2.',2200); if(G.inv.fuse>=2) advance(); }
   },
   onLever(l){ if(this.def.leverLinks[l.idx]){ openDoor(this.def.leverLinks[l.idx]); Cap.say('Something unlocked, far away.',2600); advance(); } },
   onConsole(){ Cap.say('POWER RESTORED. The sockets are live.',3000); advance(); },
   onCircuit(){ openDoor('23,11'); advance(); Cap.say('The gate is powered. MOVE.',2600); },
   onTrigger(id){
     if(id==='intro') Cap.say('Ellie worked the night shift here. Find her tapes. Get out.',4200);
     if(id==='cameo' && !G.flags.cameo){
       G.flags.cameo=true; G.flags.noKill=true; G.flags.cameoT=0;
       spawnMonster();
       MON.x=27.5*CS; MON.z=17.5*CS; MON.state='invest'; MON.investP=[22,14]; MON.speedMul=2.4;
       SND.scream(); Cap.say('…what was THAT.',3000,true);
     }
     if(id==='exitwalk') SND.startHum();
   },
   update(dt){
     if(G.flags.cameo && G.flags.noKill){
       G.flags.cameoT+=dt;
       if(Math.hypot(MON.x-22.5*CS,MON.z-14.5*CS)<1.2 || G.flags.cameoT>9){
         removeMonster(); G.flags.noKill=false;
         Cap.say('It went into the vents. It knows you are here.',3400,true);
       }
     }
   },
 },
},
/* ---------------- CHAPTER 2 : THE ASSEMBLY LINE ---------------- */
{
 name:"THE ASSEMBLY LINE", num:"CHAPTER TWO", seed:1202,
 fogColor:0x050a06, fogDensity:0.058, lampColor:0xd8ffd0, lampI:6.5,
 buildMap(){ const m=new MB(32,22);
   m.fill(1,1,6,4);                                  // start room
   m.fill(1,6,24,19);                                // main hall
   m.row(5,1,24); m.door(3,5);
   m.fill(26,6,30,9); m.door(25,7);                  // gear room
   m.fill(26,12,30,15); m.door(25,13);               // office (lever-locked)
   m.fill(6,17,9,20); m.door(7,16);                  // closet w/ gear3
   m.fill(26,17,30,20); m.door(25,18);               // keycard room (power)
   m.row(16,1,4); m.fill(1,17,4,20); m.door(3,16);   // exit room (keycard)
   m.fill(6,8,20,9,'_'); m.fill(6,12,20,13,'_');     // conveyor belts
   m.set(2,2,'P'); m.set(20,10,'M');
   m.set(5,2,'T'); m.set(4,3,'o'); m.set(2,14,'o');
   m.set(28,7,'g'); m.set(29,13,'g'); m.set(8,19,'g');
   m.set(2,8,'W');
   m.set(28,18,'K');
   m.set(12,16,'X');
   m.set(29,6,'L'); m.set(1,15,'L');
   m.set(10,7,'B'); m.set(19,14,'B'); m.set(6,17,'B'); m.set(9,19,'B');
   m.set(30,8,'o'); m.set(6,20,'T');
   m.set(2,19,'E');
   m.set(4,10,'1'); m.set(22,7,'2'); m.set(18,13,'3'); m.set(6,18,'4'); m.set(15,10,'5');
   return m.rows(); },
 tapeIds:[2,5,3],
 socketPairs:[],
 consoleNeed:{kind:'gear',count:3},
 consoleLabel:'Gearbox — insert gears',
  exitStage:4,
 leverLinks:{0:'25,13'},
 objective(st,f){
   if(st===0) return 'Collect 3 GEARS: north store, office, south closet.';
   if(st===1) return 'Insert the gears at the GEARBOX (south wall).';
   if(st===2) return 'Find the KEYCARD in the powered east room.';
   if(st===3) return 'Unlock the west gate with the KEYCARD.';
   return 'ESCAPE through the west gate.';
 },
 script:{
   onEnter(){ lockDoor('25,13','lever'); lockDoor('25,18','power'); lockDoor('3,16','keycard');
     spawnMonster(); },
   stages:{
     1(){ openDoor('25,13'); LVL.levers[0].pulled=true; lockDoor('25,18','power'); lockDoor('3,16','keycard'); },
     2(){ openDoor('25,13'); LVL.levers[0].pulled=true; LVL.consoles[0].done=true; G.inv.gear=0;
          lockDoor('25,18','power'); lockDoor('3,16','keycard'); },
     3(){ openDoor('25,13'); LVL.levers[0].pulled=true; LVL.consoles[0].done=true; G.inv.gear=0;
          openDoor('25,18'); G.inv.keycard=1; lockDoor('3,16','keycard'); },
     4(){ openDoor('25,13'); LVL.levers[0].pulled=true; LVL.consoles[0].done=true; G.inv.gear=0;
          openDoor('25,18'); G.inv.keycard=1; openDoor('3,16'); },
   },
   onPickup(pk){
     if(pk.kind==='gear'){ Cap.say('Gear '+G.inv.gear+'/3.',2200); if(G.inv.gear>=3) advance(); }
     if(pk.kind==='keycard'){ Cap.say('KEYCARD. The west gate will open now.',3000); advance(); }
   },
   onLever(l){ if(this.def.leverLinks[l.idx]){ openDoor(this.def.leverLinks[l.idx]); advance(); } },
   onConsole(){ openDoor('25,18'); Cap.say('GEARBOX ONLINE. The east room is powered.',3000); advance(); },
   onCircuit(){}, onTrigger(){}, update(){},
 },
},
/* ---------------- CHAPTER 3 : WAREHOUSE OF FRIENDS ---------------- */
{
 name:"WAREHOUSE OF FRIENDS", num:"CHAPTER THREE", seed:1303,
 fogColor:0x02040a, fogDensity:0.075, lampColor:0x9db8ff, lampI:4, brokenLampChance:0.5, lampStep:6,
 hearMul:1.7, sight:10, chase:3.3, patrol:1.4, invest:2.4,
 buildMap(){ const m=new MB(30,22); const R=mulberry(1303);
   m.fill(1,1,28,20);
   for(let y=3;y<=19;y+=2) for(let x=2;x<=27;x++) if(R()<0.72) m.set(x,y,'#');
   m.fill(12,8,17,13);              // central plaza
   m.set(14,10,'Z');
   m.fill(1,1,4,3); m.fill(25,1,28,3); m.fill(1,18,4,20);
   m.fill(13,1,16,3); m.fill(13,18,16,20);
   m.fill(1,9,3,12); m.fill(26,9,28,12);
   m.col(23,16,20); m.fill(24,16,28,20); m.pdoor(23,18);   // vault
   m.set(2,2,'P'); m.set(20,10,'M');
   m.set(3,2,'Y'); m.set(27,2,'Y'); m.set(2,19,'Y');
   m.set(15,18,'T'); m.set(14,2,'T'); m.set(26,10,'T');
   m.set(2,10,'o'); m.set(27,11,'o'); m.set(15,2,'o');
   m.set(27,19,'E');
   m.set(8,5,'1'); m.set(21,5,'2'); m.set(21,16,'3'); m.set(8,16,'4');
   m.set(1,4,'L'); m.set(28,13,'L');
   return m.rows(); },
 tapeIds:[4,5,3],
 socketPairs:[],
 statueLabel:'Place toy part',
  exitStage:2,
 objective(st,f){
   if(st===0) return 'Find 3 TOY PARTS in the dark. He hears better here — watch your noise.';
   if(st===1) return 'Place the parts on the great bear statue (center).';
   if(st===2) return 'The vault is open. Escape to the south-east vault.';
   return 'ESCAPE.';
 },
 script:{
   onEnter(){ spawnMonster(); lockDoor('23,18','power');
     Cap.say('The flashlight is your friend AND your enemy here.',3800); },
   stages:{
     1(){ lockDoor('23,18','power'); },
     2(){ openDoor('23,18'); LVL.statue.placed=3; G.inv.part=0; },
   },
   onPickup(pk){ if(pk.kind==='part'){ Cap.say('Toy part '+G.inv.part+'/3.',2200);
     if(G.inv.part>=3){ advance(); Cap.say('Bring them to the statue in the center.',3200); } } },
   onStatue(st){ SND.powerUp(); Cap.say('The bear STIRS. The vault grinds open.',3200);
     openDoor('23,18'); advance(); },
   onTrigger(){}, onLever(){}, onConsole(){}, onCircuit(){}, update(){},
 },
},
/* ---------------- CHAPTER 4 : PLAYCARE VENTS ---------------- */
{
 name:"PLAYCARE VENTS", num:"CHAPTER FOUR", seed:1404,
 fogColor:0x060408, fogDensity:0.09, lampColor:0xffc9a0, lampI:5, ceilH:2.5, brokenLampChance:0.4,
 hearMul:1.2, sight:11, chase:3.0, patrol:1.7, invest:2.5,
 buildMap(){ const m=new MB(26,30);
   m.fill(2,26,6,28); m.set(3,27,'P');
   m.fill(2,20,4,26); m.fill(5,22,9,24); m.fill(9,20,12,22);
   m.fill(2,17,4,19); m.fill(4,14,9,16); m.fill(9,17,10,19);
   m.fill(11,14,14,20); m.fill(15,17,20,19);
   m.fill(12,11,15,13); m.fill(12,9,15,10); m.fill(12,4,15,8);
   m.fill(16,8,22,11); m.fill(19,12,20,16);
   m.fill(20,3,24,6); m.fill(9,2,14,3);
   m.pdoor(3,19); m.pdoor(13,13); m.pdoor(20,7);
   m.set(4,23,'W'); m.set(17,18,'W'); m.set(13,5,'W');
   m.set(22,4,'E'); m.set(12,18,'M');
   m.set(3,25,'T'); m.set(18,10,'T'); m.set(12,2,'T');
   m.set(10,21,'o'); m.set(20,17,'o'); m.set(6,15,'o');
   m.set(2,21,'L'); m.set(14,19,'L'); m.set(21,9,'L');
   m.set(5,15,'B'); m.set(19,15,'B');
   m.set(3,21,'1'); m.set(7,23,'2'); m.set(12,15,'3'); m.set(18,9,'4'); m.set(13,7,'5');
   return m.rows(); },
 tapeIds:[6,7,8],
 leverLinks:{0:'3,19',1:'13,13',2:'20,7'},
  exitStage:3,
 objective(st,f){
   if(st<=2) return 'Turn 3 VALVES to open the vents. ('+Math.min(st,3)+'/3)';
   return 'RUN. Vent path to the surface. DO NOT STOP.';
 },
 script:{
   onEnter(){ spawnMonster(); MON.speedMul=0.85; },
   stages:{
     1(){ openDoor('3,19'); LVL.levers[0].pulled=true; },
     2(){ openDoor('3,19'); openDoor('13,13'); LVL.levers[0].pulled=true; LVL.levers[1].pulled=true; },
     3(){ openDoor('3,19'); openDoor('13,13'); openDoor('20,7');
          LVL.levers.forEach(l=>l.pulled=true); G.flags.chase=true; },
   },
   onLever(l){
     openDoor(this.def.leverLinks[l.idx]); SND.valveSfx();
     const n=LVL.levers.filter(x=>x.pulled).length;
     Cap.say('Valve '+n+'/3. Something shifted far below.',3000);
     if(n>=3 && !G.flags.chase){
       G.flags.chase=true; G.flags.forceChase=true;
       const b={story:0.35,normal:0.7,nightmare:1.0}[G.settings.diff]||0.7;
       G.checkpoint={stage:3, flags:{chase:true,forceChase:true}, inv:{...G.inv},
         taken:LVL.pickups.filter(p=>p.taken).map(p=>p.kind+':'+p.cell.join(','))};
       G.stage=3; saveGame();
       spawnMonster();
       MON.x=3.5*CS; MON.z=25.5*CS; MON.state='chase'; MON.buff=b; MON.speedMul=1.15;
       SND.scream(); Cap.say('RUN!!!',2600,true);
       setObjective('RUN. Vent path to the surface. DO NOT STOP.');
     } else if(!G.flags.chase) advance();
   },
   onPickup(){}, onConsole(){}, onCircuit(){}, onTrigger(){}, update(){},
 },
},
/* ---------------- CHAPTER 5 : THE NURSERY ---------------- */
{
 name:"THE NURSERY", num:"FINAL CHAPTER", seed:1505,
 fogColor:0x0a0508, fogDensity:0.06, lampColor:0xffd0e0, lampI:6, wallBase:'#6a5560', floorTex:'pastel', lowKind:'ball',
 buildMap(){ const m=new MB(30,22);
   m.fill(1,1,28,20);
   m.row(7,4,13); m.row(7,16,25); m.row(14,4,12); m.row(14,17,25);
   m.col(14,1,6); m.col(15,8,13); m.col(14,15,20);
   m.set(15,4,'.'); m.set(15,17,'.'); m.door(15,10);
   m.set(2,2,'P'); m.set(27,19,'M');
   m.set(1,2,'U'); m.set(28,8,'U'); m.set(4,20,'U');
   m.set(28,16,'S'); m.set(16,20,'S');
   m.set(28,18,'E');
   m.set(8,4,'T'); m.set(22,3,'T'); m.set(10,19,'T');
   m.set(12,2,'o'); m.set(28,2,'o'); m.set(2,20,'o');
   m.fill(2,15,6,18,'_');
   m.set(10,10,'1'); m.set(24,4,'2'); m.set(20,12,'3'); m.set(8,16,'4'); m.set(24,19,'5');
   m.set(1,6,'L'); m.set(28,15,'L'); m.set(9,20,'L');
   m.set(20,4,'B'); m.set(11,16,'B');
   return m.rows(); },
 tapeIds:[9,10,11],
 socketPairs:[[0,1]],
  exitStage:2,
 objective(st,f){
   if(st===0) return 'Pull 3 SWITCHES to power the elevator circuit. ('+Math.min(f.sw||0,3)+'/3)';
   if(st===1) return 'Link the two master SOCKETS near the elevator.';
   return 'GET IN THE ELEVATOR.';
 },
 script:{
   onEnter(){ spawnMonster(); Cap.say('This is where they kept the children. It is not empty.',3600); },
   stages:{
     1(){ G.flags.sw=3; LVL.switches.forEach(s=>s.on=true); },
     2(){ G.flags.sw=3; LVL.switches.forEach(s=>s.on=true); LVL.exit.open=true; LVL.exit.t=1; },
   },
   onSwitch(s){
     G.flags.sw=(G.flags.sw||0)+1;
     MON.buff+=0.38;
     SND.scream(); Cap.say('SWITCH '+G.flags.sw+'/3 — he is getting FASTER.',3200,true);
     LVL.lamps.forEach(l=>{ l.color=0xff8877; });
     if(G.flags.sw>=3){ advance(); Cap.say('Now link the master sockets by the elevator!',3200); }
     else setObjective('Pull 3 SWITCHES to power the elevator circuit. ('+G.flags.sw+'/3)');
   },
   onCircuit(){ LVL.exit.open=true; advance(); Cap.say('THE ELEVATOR IS LIVE.',3000); },
   onPickup(){}, onLever(){}, onConsole(){}, onTrigger(){}, update(){},
 },
},
];

/* --------- tape playback --------- */
let TAPE_CUR=null, TAPE_T=0;
function playTape(t){
  const id=LVL.def.tapeIds[t.idx] ?? t.idx;
  TAPE_CUR={tape:t,id, text:TAPES[id]?TAPES[id].t:'(silence)', name:TAPES[id]?TAPES[id].n:'UNKNOWN', shown:0};
  G.state='tape'; TAPE_T=0;
  $('tapeview').classList.add('on');
  $('tvhead').innerHTML='<span class="rec"></span>PLAY — '+TAPE_CUR.name;
  $('tvtxt').textContent='';
  SND.startStatic();
  SND.voice(Math.min(9000, TAPE_CUR.text.length*40));
}
function tapeUpdate(dt){
  if(!TAPE_CUR) return;
  TAPE_T+=dt;
  const shown=Math.floor(TAPE_T*34);
  if(shown!==TAPE_CUR.shown && shown<=TAPE_CUR.text.length){
    TAPE_CUR.shown=shown;
    $('tvtxt').textContent=TAPE_CUR.text.slice(0,shown);
  }
  const cv=$('tvcan'), x2=cv.getContext('2d');
  if(Math.random()<0.5){
    const im=x2.createImageData(cv.width,cv.height);
    for(let i=0;i<im.data.length;i+=4){ const v=Math.random()*160; im.data[i]=v*0.8; im.data[i+1]=v; im.data[i+2]=v*0.9; im.data[i+3]=255; }
    x2.putImageData(im,0,0);
  }
}
function stopTape(collect){
  if(!TAPE_CUR) return;
  if(collect && TAPE_CUR.tape){
    G.tapes.add(TAPE_CUR.id);
    TAPE_CUR.tape.taken=true;
    Cap.say('Tape archived ('+G.tapes.size+'/12).',2600);
    saveGame();
  }
  TAPE_CUR=null;
  $('tapeview').classList.remove('on');
  SND.stopStatic();
  if(G.state==='tape') G.state='play';
}
/* ============================================================
   PART 5 — GAME FLOW, WORLD TICK, SCREENS, BOOT
   ============================================================ */
window.addEventListener('error', e=>{ showErr('ERR: '+(e.message||e.type)+' @line '+(e.lineno||'?')); });

/* ---------------- screen manager ---------------- */
const SCREENS=['title','chapters','archive','settings','pause','death','slides','card','tapeview','ending'];
function show(id){
  SCREENS.forEach(s=>{ const el=$(s); if(el) el.classList.toggle('on', s===id); });
  $('hud').classList.toggle('on', !id);
}
function fadeTo(op){ $('fade').style.opacity=String(op); }
function fadePulse(){
  const f=$('fade'); f.style.transition='none'; f.style.opacity='1';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ f.style.transition='opacity .6s'; fadeTo('0'); }));
}
function fmtTime(sec){
  const m=Math.floor(sec/60), s=Math.floor(sec%60);
  return m+':'+String(s).padStart(2,'0');
}
function updateStats(){
  $('stats').textContent='CH'+(G.ch+1)+' · '+fmtTime(G.chapterT)+' · TAPES '+G.tapes.size+'/12 · TOYS '+G.toys.size;
}

/* ---------------- chapter lifecycle ---------------- */
function startChapter(i, fromCk){
  const def=CHAPTERS[i];
  G.ch=i;
  def.map=def.buildMap();
  LVL=buildLevel(def);
  LVL.script=def.script;
  LVL.script.def=def;
  LVL.triggers=(def.triggers||[]).map(t=>({x:t.x,y:t.y,id:t.id,fired:false}));
  registerGrabbables();
  if(MON.mesh) MON.mesh.scale.setScalar(2.7/2.6);
  // player reset
  const [sx,sy]=LVL.playerSpawn; const [px,pz]=cw(sx,sy);
  PL.x=px; PL.z=pz; PL.dead=false; PL.hidden=false; PL.hideLocker=null; PL.hideLockerRef=null;
  PL.stamina=100; PL.exhausted=false; PL.flashOn=false; PL.bobPhase=0; PL.bobT=0; PL.speed=0;
  const wn=LVL.wallNeighbor(sx,sy); PL.yaw=Math.atan2(wn[0],wn[1]); PL.pitch=0;
  NOISES.length=0;
  // state
  G.stage=0; G.flags={}; G.chapterT=0;
  G.inv={fuse:0,gear:0,keycard:0,part:0,grabpack:i>0};
  if(fromCk && G.checkpoint){
    G.stage=G.checkpoint.stage;
    G.flags=JSON.parse(JSON.stringify(G.checkpoint.flags));
    G.inv={...G.checkpoint.inv};
  }
  removeMonster();
  SND.stopAmb();
  if(def.script.onEnter) def.script.onEnter(def);
  if(fromCk && G.checkpoint){
    const tset=new Set(G.checkpoint.taken||[]);
    LVL.pickups.forEach(p=>{ if(tset.has(p.kind+':'+p.cell.join(','))){ p.taken=true; p.mesh.visible=false; } });
    const st=def.script.stages && def.script.stages[G.stage];
    if(st) st();
    if(G.flags.forceChase){
      if(!MON.active) spawnMonster();
      MON.x=12.5*CS; MON.z=18.5*CS; MON.state='chase'; MON.speedMul=1.15;
      MON.buff={story:0.35,normal:0.7,nightmare:1.0}[G.settings.diff]||0.7;
      MON.path=null; MON.lostT=0;
    }
  }
  G.state='play';
  show(null);
  setObjectiveFromScript();
  SND.ensure(); SND.resume(); SND.startAmb();
  if(IN.isTouch){ $('btns').style.display='grid'; $('hint').style.display='none'; }
  else { $('hint').style.display='block'; $('btns').style.display='none'; }
  SAVE.unlocked=Math.max(SAVE.unlocked||1, i+1);
  saveGame(); refreshMenu();
  updateStats();
  checkOrient();
  $('flashred').style.opacity='0';
  Cap.clear();
  G._hintT=0;
  fadePulse();
}

function endChapter(){
  if(G.state!=='play') return;
  G.state='transition';
  SND.stopAmb(); SND.chaseMusic(false); SND.setHeartbeat(false); SND.stopHum();
  removeMonster();
  fadeTo('1');
  setTimeout(()=>{
    if(G.ch>=CHAPTERS.length-1){
      SAVE.unlocked=CHAPTERS.length; saveGame();
      showSlides(OUTRO_SLIDES, showEnding);
    } else {
      SAVE.unlocked=Math.max(SAVE.unlocked, G.ch+2); saveGame();
      showCard(CHAPTERS[G.ch+1], ()=>startChapter(G.ch+1,false));
    }
    fadeTo('0');
  }, 700);
}

/* ---------------- death / ending ---------------- */
const DEATH_TIPS=[
  'He hears running. Walk when he is near. Sprint when he is far.',
  'Lockers break his line of sight. Hide when he is CLOSE — he remembers where you went in.',
  'He counts footsteps. Break the line of sight, then move on the fourth second.',
  'The GrabPack reaches further than his arms. Levers and sockets are safe grabs.',
  'Crates make noise. Throw one to pull him away — or to bring him running.',
  'Tapes tell you where to go. The floor manager was right about one thing: listen.',
  'Flashlight ON makes you visible from further away. Off when you hide, on when you run.',
  'Doors you left open will not stay open. He learned the doors.',
];
function showDeath(){
  G.state='dead';
  show('death');
  $('dtip').textContent=DEATH_TIPS[ri(0,DEATH_TIPS.length-1)];
  $('dcount').textContent='DEATHS: '+G.deaths;
  SND.stopAmb();
}
function showEnding(){
  G.state='ending';
  show('ending');
  $('endstats').innerHTML=
    'TIME ON THE FLOOR — <b>'+fmtTime(G.playT)+'</b><br>'+
    'DEATHS — <b>'+G.deaths+'</b><br>'+
    'TAPES ARCHIVED — <b>'+G.tapes.size+'/12</b><br>'+
    'TOYS FOUND — <b>'+G.toys.size+'</b><br>'+
    'DIFFICULTY — <b>'+String(G.settings.diff).toUpperCase()+'</b>';
  saveGame();
}

/* ---------------- slides & chapter cards ---------------- */
let SLIDE=null;
function showSlides(list, cb){
  SLIDE={list,i:0,cb};
  G.state='slides'; show('slides');
  $('slidetext').textContent=list[0]||'';
}
function slideTick(){
  if(!SLIDE) return;
  if(IN.actEdge){
    IN.actEdge=false;
    SLIDE.i++;
    if(SLIDE.i>=SLIDE.list.length){ const cb=SLIDE.cb; SLIDE=null; SND.uiBack(); if(cb) cb(); }
    else { SND.uiClick(); $('slidetext').textContent=SLIDE.list[SLIDE.i]; }
  }
}
function showCard(def, cb){
  G._cardCb=cb; G._cardT=0;
  G.state='card'; show('card');
  $('card1').textContent=def.num||'';
  $('card2').textContent=def.name||'';
  SND.ensure(); SND.resume(); SND.uiBack();
}
function cardTick(){
  G._cardT=(G._cardT||0)+dtG;
  if(IN.actEdge || G._cardT>2.8){
    IN.actEdge=false; G._cardT=0;
    const cb=G._cardCb; G._cardCb=null;
    if(cb) cb();
  }
}

/* ---------------- pause ---------------- */
function openPause(){
  if(G.state!=='play') return;
  G.state='pause'; show('pause'); SND.uiClick();
  if(document.exitPointerLock) document.exitPointerLock();
}
function closePause(){ G.state='play'; show(null); SND.uiClick(); }

/* ---------------- title / menu ---------------- */
function refreshMenu(){
  const sv=loadSave();
  $('mCont').disabled=!(sv && typeof sv.ch==='number');
}
function toTitle(){
  G.state='title'; show('title');
  SND.stopAmb(); SND.chaseMusic(false); SND.setHeartbeat(false); SND.stopHum(); SND.stopStatic();
  Cap.clear(); removeMonster();
  $('btns').style.display='none';
  $('topdown').style.display='none';
  fadePulse(); checkOrient();
}

/* ---------------- chapters screen ---------------- */
function buildChapters(){
  const grid=$('chgrid'); grid.innerHTML='';
  CHAPTERS.forEach((c,i)=>{
    const b=document.createElement('button');
    b.className='chi';
    b.innerHTML='<b>'+c.num+'</b>'+c.name;
    b.disabled=(i+1)>(SAVE.unlocked||1);
    b.onclick=()=>{ SND.ensure(); SND.resume(); SND.uiClick(); G.checkpoint=null; startChapter(i,false); };
    grid.appendChild(b);
  });
}

/* ---------------- tape archive ---------------- */
function buildArchive(){
  $('archcount').textContent=G.tapes.size+' / '+TAPES.length+' TAPES RECOVERED';
  const grid=$('archgrid'); grid.innerHTML='';
  TAPES.forEach((t,i)=>{
    const b=document.createElement('button');
    b.className='tapei';
    const has=G.tapes.has(i);
    b.innerHTML='<b>'+(has?t.n:'— — — —')+'</b><br>'+(has?('TAPE #'+(i+1)+' · RECOVERED'):'SIGNAL NOT FOUND');
    b.disabled=!has;
    b.onclick=()=>{ SND.ensure(); SND.resume(); SND.uiClick(); previewTape(i); };
    grid.appendChild(b);
  });
}
function previewTape(i){
  G._tapeFrom='archive';
  G.state='tape';
  TAPE_CUR={tape:null,id:i,text:TAPES[i].t,name:TAPES[i].n,shown:0};
  TAPE_T=0;
  show('tapeview');
  $('tvhead').innerHTML='<span class="rec"></span>PLAY — '+TAPE_CUR.name;
  $('tvtxt').textContent='';
  SND.startStatic();
  SND.voice(Math.min(9000, TAPE_CUR.text.length*40));
}
function tapeStopUi(){
  const fromArch=G._tapeFrom==='archive';
  stopTape(true);
  if(fromArch){ G._tapeFrom=null; G.state='archive'; show('archive'); buildArchive(); }
  else { show(null); }
}

/* ---------------- settings ---------------- */
function buildSettings(){
  const p=$('setpanel'); p.innerHTML='';
  const row=(label,el)=>{
    const r=document.createElement('div'); r.className='row';
    const l=document.createElement('label'); l.textContent=label;
    r.appendChild(l); r.appendChild(el); p.appendChild(r);
  };
  const seg=(opts,cur,cb)=>{
    const d=document.createElement('div'); d.className='seg';
    opts.forEach(o=>{
      const b=document.createElement('button'); b.textContent=o.toUpperCase();
      if(o===cur) b.classList.add('sel');
      b.onclick=()=>{ SND.uiClick(); cb(o); buildSettings(); };
      d.appendChild(b);
    });
    return d;
  };
  row('DIFFICULTY', seg(['story','normal','nightmare'], G.settings.diff, v=>{ G.settings.diff=v; saveGame(); }));
  row('QUALITY', seg(['auto','low','med','high'], G.settings.quality, v=>{ G.settings.quality=v; applyQuality(); saveGame(); }));
  const sr=document.createElement('input'); sr.type='range';
  sr.min='0.4'; sr.max='2'; sr.step='0.1'; sr.value=G.settings.sens;
  sr.oninput=()=>{ G.settings.sens=parseFloat(sr.value); saveGame(); };
  row('LOOK SENSITIVITY', sr);
  const vr=document.createElement('input'); vr.type='range';
  vr.min='0'; vr.max='1'; vr.step='0.05'; vr.value=G.settings.vol;
  vr.oninput=()=>{ G.settings.vol=parseFloat(vr.value); SND.vol(); saveGame(); };
  row('VOLUME', vr);
  const ic=document.createElement('input'); ic.type='checkbox'; ic.checked=!!G.settings.invertY;
  ic.onchange=()=>{ G.settings.invertY=ic.checked; saveGame(); };
  row('INVERT LOOK Y', ic);
}
function applySettings(){ applyQuality(); SND.vol(); }

/* ---------------- world tick (things alive even while you stand) ---------------- */
let STAT_T=0;
function worldUpdate(dt){
  // doors
  for(const d of LVL.doors){
    const want=d.open?1:0;
    if(Math.abs(d.t-want)>0.002){
      d.t=clamp(d.t+(want?dt:-dt)*2.2,0,1);
      d.panel.position.x=d.t*1.95;
    }
    d.lockMat.emissiveIntensity = d.locked?1.4:(d.open?0.05:0.7);
  }
  // exit elevator
  if(LVL.exit){
    const want=LVL.exit.open?1:0;
    if(Math.abs(LVL.exit.t-want)>0.002){
      LVL.exit.t=clamp(LVL.exit.t+(want?dt:-dt)*1.4,0,1);
      LVL.exit.d1.position.x=-0.48-0.9*LVL.exit.t;
      LVL.exit.d2.position.x= 0.48+0.9*LVL.exit.t;
    }
  }
  // lamp flicker
  for(const L of LVL.lamps){
    if(!L.flicker) continue;
    if(Math.random()<dt*7) L.flickerVal = Math.random()<0.6? rr(0.12,0.7):1;
    if(L.mesh) L.mesh.material.emissiveIntensity=(L.broken?0.15:1.6)*L.flickerVal;
    if(L.spr) L.spr.material.opacity=(L.broken?0.12:0.5)*L.flickerVal;
  }
  // conveyor belts
  if(LVL.belts) for(const b of LVL.belts) b.tex.offset.y-=dt*0.9;
  // noise decay
  for(let i=NOISES.length-1;i>=0;i--){ NOISES[i].t-=dt; if(NOISES[i].t<=0) NOISES.splice(i,1); }
  // pickup auto-collect
  if(!PL.hidden) for(const p of LVL.pickups){
    if(p.taken) continue;
    if(Math.hypot(p.x-PL.x,p.z-PL.z)<1.0){
      p.taken=true; p.mesh.visible=false;
      SND.pickupSfx();
      if(p.kind==='grabpack') G.inv.grabpack=true;
      else G.inv[p.kind]=(G.inv[p.kind]||0)+1;
      if(LVL.script.onPickup) LVL.script.onPickup(p);
    }
  }
  // toy collectibles
  for(const t of LVL.toys){
    if(t.taken) continue;
    if(Math.hypot(t.x-PL.x,t.z-PL.z)<1.1){
      t.taken=true; t.mesh.visible=false;
      SND.toySfx();
      G.toys.add(t.cell.join(','));
      Cap.say('A little toy. Ellie made these.',2400);
    }
  }
  // triggers
  for(const tr of LVL.triggers){
    if(tr.fired) continue;
    const [tx,tz]=cw(tr.x,tr.y);
    if(Math.hypot(tx-PL.x,tz-PL.z)<1.6){
      tr.fired=true;
      if(LVL.script.onTrigger) LVL.script.onTrigger(tr.id);
    }
  }
  // exit gate opens automatically once the final stage is reached
  if(LVL.exit && !LVL.exit.open && LVL.def.exitStage!==undefined && G.stage>=LVL.def.exitStage){
    LVL.exit.open=true; SND.powerUp(); Cap.say('THE EXIT IS OPEN.',2600);
  }
  // chapter script
  if(LVL.script.update) LVL.script.update(dt);
  // HUD stats
  STAT_T+=dt;
  if(STAT_T>0.25){ STAT_T=0; updateStats(); }
  // fade the control hint after a while so it never collides with the objective
  G._hintT=(G._hintT||0)+dt;
  if(G._hintT>12 && $('hint').style.display!=='none') $('hint').style.display='none';
}

/* ---------------- main loop ---------------- */
let dtG=0, _last=performance.now();
function tick(){
  requestAnimationFrame(tick);
  const now=performance.now();
  dtG=Math.min((now-_last)/1000, 0.06);
  _last=now;
  const dt=dtG;
  if(IN.pauseEdge){
    IN.pauseEdge=false;
    if(G.state==='play') openPause();
    else if(G.state==='pause') closePause();
  }
  const st=G.state;
  if(st==='play'){
    G.playT+=dt; G.chapterT+=dt;
    playerUpdate(dt); monsterUpdate(dt); GP.update(dt); worldUpdate(dt);
    autoQualityTick(dt);
  }
  else if(st==='dying') dyingUpdate(dt);
  else if(st==='tape') tapeUpdate(dt);
  else if(st==='slides') slideTick();
  else if(st==='card') cardTick();
  else if(st==='dead' && IN.actEdge){ IN.actEdge=false; startChapter(G.ch,true); }
  Cap.update(dt);
  if(LVL && QUALITY.active) LM.update();
  VIEW.renderer.render(VIEW.scene, VIEW.camera);
}

/* ============================================================
   BOOT — wire UI, restore save, start loop
   ============================================================ */
(function boot(){
  // restore save meta
  const sv=loadSave();
  if(sv){
    if(sv.settings) Object.assign(G.settings, sv.settings);
    if(sv.tapes) G.tapes=new Set(sv.tapes);
    if(sv.toys) G.toys=new Set(sv.toys);
    G.deaths=sv.deaths||0; G.playT=sv.playT||0;
    if(typeof sv.unlocked==='number') SAVE.unlocked=sv.unlocked;
  }
  applySettings();
  refreshMenu();

  /* menu buttons */
  $('mNew').onclick=()=>{
    SND.ensure(); SND.resume(); SND.uiClick();
    G.deaths=0; G.playT=0; G.checkpoint=null;
    showSlides(INTRO_SLIDES, ()=>showCard(CHAPTERS[0], ()=>startChapter(0,false)));
  };
  $('mCont').onclick=()=>{
    const s=loadSave(); if(!s) return;
    SND.ensure(); SND.resume(); SND.uiClick();
    const ch=clamp(s.ch,0,CHAPTERS.length-1);
    G.checkpoint={ stage:s.stage||0, flags:{}, inv:{fuse:0,gear:0,keycard:0,part:0,grabpack:ch>0}, taken:[] };
    startChapter(ch,true);
  };
  $('mChap').onclick=()=>{ SND.uiClick(); buildChapters(); G.state='menu'; show('chapters'); };
  $('mArch').onclick=()=>{ SND.uiClick(); buildArchive(); G.state='archive'; show('archive'); };
  $('mSet').onclick =()=>{ SND.uiClick(); G._setFrom='title'; buildSettings(); G.state='menu'; show('settings'); };
  $('chBack').onclick  =()=>{ SND.uiBack(); toTitle(); };
  $('archBack').onclick=()=>{ SND.uiBack(); toTitle(); };
  $('setBack').onclick =()=>{
    SND.uiBack();
    if(G._setFrom==='pause'){ G._setFrom=null; G.state='pause'; show('pause'); }
    else toTitle();
  };

  /* pause menu */
  $('pResume').onclick =()=>{ closePause(); };
  $('pRestart').onclick=()=>{ SND.uiClick(); startChapter(G.ch,true); };
  $('pSet').onclick    =()=>{ SND.uiClick(); G._setFrom='pause'; buildSettings(); G.state='menu'; show('settings'); };
  $('pQuit').onclick   =()=>{ SND.uiBack(); toTitle(); };

  /* death */
  $('dRetry').onclick=()=>{ SND.uiClick(); startChapter(G.ch,true); };
  $('dQuit').onclick =()=>{ SND.uiBack(); toTitle(); };

  /* tape viewer */
  $('tvStop').addEventListener('pointerdown', e=>{ e.stopPropagation(); if(G.state==='tape') tapeStopUi(); });

  /* ending */
  $('eMenu').onclick=()=>{ SND.uiBack(); toTitle(); };

  /* tap-to-advance screens */
  $('slides').addEventListener('pointerdown', ()=>{ if(G.state==='slides') IN.actEdge=true; });
  $('card').addEventListener('pointerdown',  ()=>{ if(G.state==='card') IN.actEdge=true; });

  /* auto-pause on focus loss / pointer-lock loss */
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && G.state==='play') openPause(); });
  document.addEventListener('pointerlockchange', ()=>{
    if(!document.pointerLockElement && G.state==='play' && !IN.isTouch) openPause();
  });

  /* dev: ?top=1 toggles a debug map with M */
  addEventListener('keydown', e=>{
    if(G.dev.top && e.key.toLowerCase()==='m'){
      const cv=$('topdown');
      if(cv.style.display==='block'){ cv.style.display='none'; }
      else if(LVL) drawTopdown();
    }
  });

  window.addEventListener('beforeunload', ()=>{ if(G.state==='play') saveGame(); });

  /* go */
  G.state='title';
  checkOrient();
  fadeTo('0');
  if(G.dev.autostart){
    G.checkpoint=null;
    startChapter(clamp(G.dev.ch,0,CHAPTERS.length-1), false);
  }
  requestAnimationFrame(tick);
})();
