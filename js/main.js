/* =====================================================================
   PROGRAMMA PRINCIPALE: collega fisica, mondo, strumenti, comandi e
   telecamere; gestisce briefing, pausa, incidenti e messaggi.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM, M=window.MAPPA||{}, A=window.AEREO;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const D2R=Math.PI/180, R2D=180/Math.PI, KT=1.943844, FT=3.28084, FPM=196.85;

/* ---------- scena ---------- */
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,logarithmicDepthBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,1,0.1,15000);
function ridimensiona(){
  const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',ridimensiona);ridimensiona();

const T=SIM.terreno;
const terreno=T.creaMesh(scene);
const mondo=SIM.creaMondo(scene,renderer);
const fis=SIM.creaFisica(A,T), st=fis.st;
const strum=SIM.creaStrumenti(A);
const audio=SIM.creaAudio();

/* ---------- vento con raffiche ---------- */
const met=mondo.meteo;
const vMedio=met.ventoNodi/KT;
const ventoBase=new THREE.Vector3(-Math.sin(met.ventoDa*D2R),0,Math.cos(met.ventoDa*D2R)).multiplyScalar(vMedio);
const vento=new THREE.Vector3();
function aggiornaVento(t){
  const raff=met.raffiche/KT*(T.vnoise(t*0.25,3.7)*2-1);
  const quota=clamp(0.55+Math.max(0,st.agl)/600,0.55,1);   // vicino al suolo il vento è più debole
  vento.copy(ventoBase).multiplyScalar(vMedio>0?Math.max(0,(vMedio+raff)/vMedio)*quota:0);
  vento.y=met.raffiche/KT*0.3*(T.vnoise(t*0.6,9.1)*2-1)*quota;
}

/* ---------- partenza e destinazione ---------- */
const nomeTestata=n=>String(n).padStart(2,'0');
function puntoPartenza(){
  const p=M.partenza||{};
  if(p.aeroporto&&T.aeroporti.length){
    const ap=T.aeroporti.find(a=>a.codice===p.aeroporto)||T.aeroporti[0];
    let te=null;
    for(const pi of ap.piste)for(const t of pi.testate)if(t.nome===nomeTestata(p.pista))te=t;
    te=te||ap.piste[0].testate[0];
    return {x:te.x+te.dir.x*25,z:te.z+te.dir.z*25,y:ap.quota+fis.altRuote()-0.04,hdg:te.hdg,v:0,thr:0,ap,te};
  }
  const x=p.x||0,z=-(p.y||0);
  const y=Math.max(p.quota||600,T.terrainH(x,z)+150);
  return {x,z,y,hdg:p.direzione||0,v:(p.velocitaNodi||100)/KT,thr:0.7};
}
const partenza=puntoPartenza();
// esercizio di atterraggio: in finale a 2,7 NM dalla pista di partenza, sul sentiero di 3°
function puntoFinale(){
  const te=partenza.te, d=5000;
  return {x:te.x-te.dir.x*d,z:te.z-te.dir.z*d,y:partenza.ap.quota+fis.altRuote()+d*Math.tan(3*D2R),
    hdg:te.hdg,v:72/KT,thr:0.35,flapSel:1};
}
let modalita='decollo';
let destIdx=Math.max(0,T.aeroporti.findIndex(a=>a!==partenza.ap));
const dest=()=>T.aeroporti[destIdx]||null;

/* ---------- stato del gioco ---------- */
let avviato=false, inPausa=false, vista=0, tempo=0;
const NOMI_VISTA=['ESTERNA','CABINA','TORRE'];

function ricomincia(){
  const p=modalita==='finale'&&partenza.te?puntoFinale():partenza;
  fis.reset(p);
  if(p.flapSel){st.flapSel=p.flapSel;st.flap=A.flap.posizioni[p.flapSel];}
  $('crash').hidden=true;
  terreno.aggiorna(st.pos.x,st.pos.z,true);
  primaCamera=true;
  $('thr').value=Math.round(st.thr*100);
  if(avviato&&modalita==='finale') messaggio('In finale per la pista <b>'+partenza.te.nome+'</b>: segui le luci PAPI, 65 nodi, flap 30°',6);
  else if(avviato) messaggio(partenza.te?`Pronto al decollo: pista <b>${partenza.te.nome}</b> di <b>${partenza.ap.codice}</b>`:'In volo!',4);
}

/* ---------- messaggi e avvisi ---------- */
let timerMsg=0;
function messaggio(html,sec=6){const el=$('msg');el.innerHTML=html;el.hidden=false;clearTimeout(timerMsg);timerMsg=setTimeout(()=>el.hidden=true,sec*1000);}
function mostraIncidente(motivo){
  $('crashMsg').textContent=motivo;
  $('crash').hidden=false;
  $('msg').hidden=true;
}

/* ---------- comandi ---------- */
const tasti=new Set(), logico={};
const tieni={rudS:false,rudD:false,freni:false};
const kb={elev:0,ail:0,rud:0};
const pad={elev:0,ail:0,rud:0,freno:0,thr:0,prima:[]};
const stick={x:0,y:0};
const inp={elev:0,ail:0,rud:0};
const k=(...c)=>c.some(x=>tasti.has(x))?1:0;
const BLOCCA=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','PageUp','PageDown'];

function flap(d){
  const n=A.flap.posizioni.length;
  const nuovo=clamp(st.flapSel+d,0,n-1);
  if(nuovo!==st.flapSel){st.flapSel=nuovo;messaggio(`Flap <b>${A.flap.posizioni[nuovo]}°</b>`,1.5);}
}
function cambiaVista(){vista=(vista+1)%3;primaCamera=true;}
function prossimaDest(){
  if(!T.aeroporti.length) return;
  destIdx=(destIdx+1)%T.aeroporti.length;
  const d=dest();messaggio(`Destinazione: <b>${d.codice}</b> ${d.nome}`,2.5);
}
function orientaMappa(){
  const o=strum.cambiaOrientamento();
  messaggio(o==='prua'?'Mappa: <b>prua in alto</b>':'Mappa: <b>nord in alto</b>',1.5);
}
$('minimap').addEventListener('click',orientaMappa);
function alternaPausa(){
  if(!avviato||st.crashed) return;
  inPausa=!inPausa;$('pausa').hidden=!inPausa;
}
function alternaAiuto(){
  const el=$('aiuto');
  const visibile=getComputedStyle(el).display!=='none';
  el.classList.toggle('forza',!visibile);
  el.hidden=visibile;
}
function alternaAudio(){audio.avvia();const on=audio.alterna();aggiornaBtnAudio(on);}
function aggiornaBtnAudio(on){$('btnAudio').textContent=on?'AUDIO ON':'AUDIO OFF';}
aggiornaBtnAudio(audio.attivo);
function inizia(m){
  if(avviato) return;
  avviato=true;$('brief').hidden=true;audio.avvia();
  if(m==='finale'){modalita='finale';ricomincia();return;}
  messaggio(partenza.te?`Pronto al decollo: pista <b>${partenza.te.nome}</b> di <b>${partenza.ap.codice}</b>`:'In volo!',4);
}

addEventListener('keydown',e=>{
  if(BLOCCA.includes(e.code))e.preventDefault();
  if(e.ctrlKey||e.metaKey||e.altKey) return;      // non interferire con le scorciatoie del browser
  audio.avvia();
  let nome=e.code;
  if(e.key==='+'||e.key==='='||e.code==='NumpadAdd'||e.code==='PageUp') nome='PIU';
  else if(e.key==='-'||e.key==='_'||e.code==='NumpadSubtract'||e.code==='PageDown') nome='MENO';
  logico[e.code]=nome;tasti.add(nome);
  if(e.repeat) return;
  const cifra=/^(Digit|Numpad)([0-9])$/.exec(e.code);
  if(cifra){const n=+cifra[2];st.thr=n===0?1:n/10;$('thr').value=Math.round(st.thr*100);return;}
  switch(e.code){
    case 'KeyF':flap(1);break;
    case 'KeyG':flap(-1);break;
    case 'KeyC':cambiaVista();break;
    case 'KeyN':prossimaDest();break;
    case 'KeyM':strum.cambiaZoom();break;
    case 'KeyO':orientaMappa();break;
    case 'KeyP':alternaPausa();break;
    case 'KeyH':alternaAiuto();break;
    case 'KeyR':if(avviato)ricomincia();break;
    case 'Enter':case 'NumpadEnter':if(!avviato)inizia();else if(st.crashed)ricomincia();break;
  }
});
addEventListener('keyup',e=>{tasti.delete(logico[e.code]||e.code);delete logico[e.code];});
addEventListener('blur',()=>{tasti.clear();for(const q in tieni)tieni[q]=false;});

// mouse/touch come cloche
let trascina=null;
const stickEl=$('stick'),knob=$('knob'),RAGGIO=75;
canvas.addEventListener('pointerdown',e=>{
  audio.avvia();
  trascina={id:e.pointerId,x:e.clientX,y:e.clientY};
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  stickEl.style.left=e.clientX+'px';stickEl.style.top=e.clientY+'px';stickEl.hidden=false;knob.style.transform='';
});
canvas.addEventListener('pointermove',e=>{
  if(!trascina||e.pointerId!==trascina.id) return;
  stick.x=clamp((e.clientX-trascina.x)/RAGGIO,-1,1);stick.y=clamp((e.clientY-trascina.y)/RAGGIO,-1,1);
  knob.style.transform=`translate(${stick.x*RAGGIO}px,${stick.y*RAGGIO}px)`;
});
const fineTrascina=e=>{if(trascina&&e.pointerId===trascina.id){trascina=null;stick.x=stick.y=0;stickEl.hidden=true;}};
canvas.addEventListener('pointerup',fineTrascina);canvas.addEventListener('pointercancel',fineTrascina);

// pulsanti a schermo
$('thr').addEventListener('input',()=>{st.thr=$('thr').value/100;});
for(const b of document.querySelectorAll('[data-azione]')){
  b.addEventListener('click',()=>{
    audio.avvia();
    ({flapsu:()=>flap(-1),flapgiu:()=>flap(1),vista:cambiaVista,audio:alternaAudio,reset:()=>{if(avviato)ricomincia();}})[b.dataset.azione]();
    b.blur();
  });
}
for(const b of document.querySelectorAll('[data-tieni]')){
  const q=b.dataset.tieni;
  const su=()=>{tieni[q]=false;b.classList.remove('premuto');};
  b.addEventListener('pointerdown',e=>{e.preventDefault();audio.avvia();tieni[q]=true;b.classList.add('premuto');});
  b.addEventListener('pointerup',su);b.addEventListener('pointerleave',su);b.addEventListener('pointercancel',su);
}
$('inizia').addEventListener('click',()=>inizia());
$('finale').addEventListener('click',()=>inizia('finale'));
if(!partenza.te)$('finale').hidden=true;
$('ancora').addEventListener('click',ricomincia);

function leggiGamepad(dt){
  pad.elev=pad.ail=pad.rud=pad.freno=0;
  const lista=navigator.getGamepads?navigator.getGamepads():[];
  for(const gp of lista){
    if(!gp) continue;
    const zm=v=>Math.abs(v||0)<0.08?0:v;
    pad.ail=zm(gp.axes[0]);pad.elev=zm(gp.axes[1]);pad.rud=zm(gp.axes[2]);
    const piu=gp.buttons[7]?gp.buttons[7].value:0, meno=gp.buttons[6]?gp.buttons[6].value:0;
    const dThr=(piu-meno)*0.6*dt-zm(gp.axes[3])*0.6*dt;
    if(dThr){st.thr=clamp(st.thr+dThr,0,1);$('thr').value=Math.round(st.thr*100);}
    const premuto=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed);
    pad.freno=premuto(0)?1:0;
    const fronte=i=>premuto(i)&&!pad.prima[i];
    if(fronte(5))flap(1);if(fronte(4))flap(-1);if(fronte(3))cambiaVista();if(fronte(9)){if(!avviato)inizia();else alternaPausa();}
    pad.prima=gp.buttons.map(b=>b.pressed);
    break;
  }
}

function comandi(dt){
  const rampa=(cur,t,dt)=>cur+clamp(t-cur,-(t===0?4:1.8)*dt,(t===0?4:1.8)*dt);
  kb.elev=rampa(kb.elev,k('KeyS','ArrowDown')-k('KeyW','ArrowUp'),dt);
  kb.ail=rampa(kb.ail,k('KeyD','ArrowRight')-k('KeyA','ArrowLeft'),dt);
  kb.rud=rampa(kb.rud,(k('KeyE')||tieni.rudD?1:0)-(k('KeyQ')||tieni.rudS?1:0),dt);
  inp.elev=clamp(kb.elev+stick.y+pad.elev,-1,1);
  inp.ail=clamp(kb.ail+stick.x+pad.ail,-1,1);
  inp.rud=clamp(kb.rud+pad.rud,-1,1);
  const dThr=(k('PIU')-k('MENO'))*0.5*dt;
  if(dThr){st.thr=clamp(st.thr+dThr,0,1);$('thr').value=Math.round(st.thr*100);}
  st.trim=clamp(st.trim+(k('KeyZ')-k('KeyX'))*0.25*dt,-0.5,0.5);
  st.freno=Math.max(k('KeyB','Space'),tieni.freni?1:0,pad.freno);
}

/* ---------- eventi della fisica ---------- */
function gestisciEventi(){
  for(const e of st.eventi){
    if(e.tipo==='decollo'){
      const pv=T.pistaVicina(e.x,e.z,80);
      messaggio(pv?`Decollo da <b>${pv.pista.ap.codice}</b>: buon volo!`:'Decollo!',3);
    }else if(e.tipo==='atterraggio'){
      const fpm=-e.vs*FPM;
      audio.colpo(clamp(fpm/700,0,1));
      const giudizio=fpm<120?'Burro! Atterraggio perfetto':fpm<250?'Ottimo atterraggio':fpm<450?'Buon atterraggio':'Atterraggio duro';
      const pv=e.suolo==='pista'?T.pistaVicina(e.x,e.z,0):null;
      let txt=`<b>${giudizio}</b> — ${Math.round(fpm)} ft/min`;
      if(pv){
        assi();
        const te=pv.pista.testate.find(t=>t.dir.x*fwd.x+t.dir.z*fwd.z>0)||pv.pista.testate[0];
        const dalla=(e.x-te.x)*te.dir.x+(e.z-te.z)*te.dir.z;
        txt+=`<br>${pv.pista.ap.codice} pista ${te.nome}: ${Math.round(dalla)} m dalla soglia, ${Math.abs(pv.v).toFixed(1)} m dalla linea centrale`;
        if(pv.pista.ap===dest()) txt+='<br><b>Destinazione raggiunta!</b>';
      }else txt+=`<br>Fuori pista${e.suolo==='erba'?', sull\'erba':''}`;
      messaggio(txt,8);
    }else if(e.tipo==='incidente'){
      audio.colpo(1);mostraIncidente(e.motivo);
    }
  }
  st.eventi.length=0;
}

/* ---------- telecamere ---------- */
const fwd=new THREE.Vector3(),dx=new THREE.Vector3(),su=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
const occhio=new THREE.Vector3(A.occhioPilota.x,A.occhioPilota.y,A.occhioPilota.z);
const bersaglio=new THREE.Vector3(),guarda=new THREE.Vector3();
let primaCamera=true;
function assi(){fwd.set(0,0,-1).applyQuaternion(st.q);dx.set(1,0,0).applyQuaternion(st.q);su.set(0,1,0).applyQuaternion(st.q);}
function torreVicina(){
  let best=null,bd=Infinity;
  for(const t of mondo.torri){const d=t.pos.distanceToSquared(st.pos);if(d<bd){bd=d;best=t;}}
  return best;
}
function impostaFov(f){if(Math.abs(camera.fov-f)>0.01){camera.fov=f;camera.updateProjectionMatrix();}}
function aggiornaCamera(dt){
  assi();
  if(vista===1){
    camera.position.copy(occhio).applyQuaternion(st.q).add(st.pos);
    camera.quaternion.copy(st.q);
    impostaFov(70);
  }else if(vista===2&&mondo.torri.length){
    const t=torreVicina();
    camera.position.copy(t.pos);camera.up.set(0,1,0);camera.lookAt(st.pos);
    const d=t.pos.distanceTo(st.pos);
    impostaFov(clamp(2*Math.atan(22/Math.max(d,1))*R2D,2,60));
  }else{
    const orizz=Math.hypot(fwd.x,fwd.z)>0.2;
    bersaglio.copy(st.pos).addScaledVector(fwd,-18).addScaledVector(Y,orizz?4.5:0).addScaledVector(su,orizz?0:4.5);
    const gCam=T.suolo(bersaglio.x,bersaglio.z)+2;
    if(bersaglio.y<gCam)bersaglio.y=gCam;
    if(primaCamera)camera.position.copy(bersaglio);
    else camera.position.lerp(bersaglio,1-Math.exp(-dt*(st.crashed?0.5:4)));
    guarda.copy(st.pos).addScaledVector(fwd,6).addScaledVector(Y,-2.5);
    camera.up.set(0,1,0);camera.lookAt(guarda);
    impostaFov(60);
  }
  primaCamera=false;
}

/* ---------- strumenti e testi ---------- */
let vsFiltrata=0;
function aggiornaStrumenti(dt){
  assi();
  vsFiltrata+=(st.vs*FPM-vsFiltrata)*Math.min(1,dt*4);
  const d=dest();
  const hdg=((Math.atan2(fwd.x,-fwd.z)*R2D)+360)%360;
  let bug=null;
  if(d) bug=((Math.atan2(d.x-st.pos.x,-(d.z-st.pos.z))*R2D)+360)%360;
  strum.disegnaPFD({
    pitch:Math.asin(clamp(fwd.y,-1,1))*R2D,
    bank:Math.atan2(-dx.y,su.y),
    ias:st.ias*KT, alt:st.pos.y*FT, agl:Math.max(0,st.agl)*FT,
    vs:vsFiltrata, hdg, palla:st.palla, bug, gs:st.gs*KT,
  });
  return {hdg,bug};
}
const el={};
for(const id of ['rpm','flap','trim','gload','thrv','dest','dist','brg','vento','spiaFreni','spiaTerra','spiaVista','avviso'])el[id]=$(id);
const scrivi=(n,t)=>{if(n.textContent!==t)n.textContent=t;};
function aggiornaTesti(hdg,bug){
  scrivi(el.rpm,String(Math.round(st.rpm/10)*10));
  scrivi(el.flap,String(Math.round(st.flap)));
  const tr=Math.round(st.trim*200);
  scrivi(el.trim,(tr>0?'+':'')+tr);
  scrivi(el.gload,st.g.toFixed(1));
  scrivi(el.thrv,String(Math.round(st.thr*100)));
  const d=dest();
  if(d){
    scrivi(el.dest,d.codice);
    scrivi(el.dist,(Math.hypot(d.x-st.pos.x,d.z-st.pos.z)/1852).toFixed(1));
    scrivi(el.brg,String(Math.round(bug)%360).padStart(3,'0'));
  }
  const vk=Math.hypot(vento.x,vento.z)*KT, vda=((Math.atan2(-vento.x,vento.z)*R2D)+360)%360;
  scrivi(el.vento,vk<0.5?'CALMO':`${String(Math.round(vda)).padStart(3,'0')}/${Math.round(vk)}`);
  el.spiaFreni.classList.toggle('warn',st.freno>0);
  el.spiaTerra.classList.toggle('on',st.aTerra);
  scrivi(el.spiaVista,NOMI_VISTA[vista]);

  let w='',rosso=false;
  if(avviato&&!st.crashed){
    const agl=st.agl, vs=st.vs;
    if(!st.aTerra&&agl<90&&vs<-4&&agl/-vs<10){w='PULL UP';rosso=true;}
    else if(st.avvisoStallo){w='STALLO';rosso=true;}
    else if(st.ias*KT>A.velocita.vne){w='VELOCITÀ ECCESSIVA';rosso=true;}
    else if(st.flap>1&&st.ias*KT>A.velocita.vfe+5)w='VELOCITÀ FLAP';
    else if(st.g>3.8||st.g<-1.5)w='SOVRACCARICO';
  }
  el.avviso.hidden=!w;
  if(w){scrivi(el.avviso,w);el.avviso.classList.toggle('rosso',rosso);}
}

/* ---------- briefing ---------- */
(function briefing(){
  const d=dest(), te=partenza.te, ap=partenza.ap;
  let t='';
  if(te) t+=`Sei all'aeroporto <b>${ap.codice} – ${ap.nome}</b> (quota ${Math.round(ap.quota*FT)} ft), allineato sulla pista <b>${te.nome}</b> lunga ${te.pista.L} m. `;
  else t+=`Parti già in volo a ${Math.round(partenza.y*FT)} ft. `;
  t+=met.ventoNodi>0?`Vento da ${String(met.ventoDa).padStart(3,'0')}° a ${met.ventoNodi} nodi${met.raffiche?` con raffiche di ${met.raffiche}`:''}. `:'Vento calmo. ';
  if(d&&d!==ap){
    const dist=Math.hypot(d.x-partenza.x,d.z-partenza.z)/1852;
    t+=`Destinazione suggerita: <b>${d.codice} – ${d.nome}</b>, a ${dist.toFixed(1)} NM (quota ${Math.round(d.quota*FT)} ft). Il rombo magenta sulla bussola e la linea sulla mappa indicano la rotta.`;
  }
  $('briefTesto').innerHTML=t;
  $('briefVr').textContent=A.velocita.vr;$('briefVy').textContent=A.velocita.vy;
})();

/* ---------- ciclo principale ---------- */
ricomincia();
aggiornaVento(0);
// scorciatoie per le prove: index.html#salta (salta il briefing), #vista=1 (cabina)
SIM.debug={st,fis};  // utile dalla console del browser (F12)
if(/salta/.test(location.hash)) inizia();
if(/finale/.test(location.hash)) inizia('finale');
{const mv=/vista=(\d)/.exec(location.hash);if(mv)vista=(+mv[1])%3;}
let ultimo=performance.now(), n=0, ultimiStrum={hdg:0,bug:0};
function ciclo(ora){
  requestAnimationFrame(ciclo);
  const dt=Math.min(0.1,Math.max(0,(ora-ultimo)/1000));ultimo=ora;
  leggiGamepad(dt);
  comandi(dt);
  const attivo=avviato&&!inPausa;
  if(attivo&&!st.crashed){
    tempo+=dt;aggiornaVento(tempo);
    const passi=Math.max(1,Math.ceil(dt*240)),h=dt/passi;
    for(let i=0;i<passi;i++)fis.passo(h,inp,vento);
  }
  gestisciEventi();
  aggiornaCamera(dt);
  terreno.aggiorna(camera.position.x,camera.position.z,false);
  mondo.aggiorna(st,camera.position,vento,attivo?dt:0,vista===1);
  if(n%2===0)ultimiStrum=aggiornaStrumenti(dt*2);
  if(n%6===0){aggiornaTesti(ultimiStrum.hdg,ultimiStrum.bug);strum.disegnaMappa(st,ultimiStrum.hdg,dest());}
  audio.aggiorna(st,!attivo);
  renderer.render(scene,camera);
  n++;
}
requestAnimationFrame(ciclo);
})();
