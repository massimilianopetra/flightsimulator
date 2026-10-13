/* =====================================================================
   PROGRAMMA PRINCIPALE: collega fisica, mondo, strumenti, comandi e
   telecamere; gestisce briefing, pausa, incidenti e messaggi.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM, M=window.MAPPA||{}, A=window.AEREO;
const $=id=>document.getElementById(id);
const L=SIM.L;   // testo nella lingua scelta: L('italiano','English') (js/lingua.js)
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
const terreno=T.creaMesh(scene,renderer);
const mondo=SIM.creaMondo(scene,renderer);
const monumenti=SIM.creaMonumenti?SIM.creaMonumenti(scene):null;   // solo mondo reale (js/monumenti.js)
camera.far=Math.max(15000,scene.fog.far*1.15);camera.updateProjectionMatrix();
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
// testata più controvento di un aeroporto (si decolla e si atterra col vento in faccia)
function testataControvento(ap){
  let best=null,bv=-2;
  for(const pi of ap.piste)for(const t of pi.testate){
    const v=Math.cos((t.hdg-met.ventoDa)*D2R)+(pi===ap.piste[0]?0.15:0);   // preferisce la pista principale
    if(v>bv){bv=v;best=t;}
  }
  return best;
}
// punto di partenza sulla soglia di una testata
function partenzaDa(ap,te){
  te=te||testataControvento(ap);
  return {x:te.x+te.dir.x*25,z:te.z+te.dir.z*25,y:ap.quota+fis.altRuote()-0.04,hdg:te.hdg,v:0,thr:0,ap,te};
}
function puntoPartenza(){
  const p=M.partenza||{};
  if(p.aeroporto&&T.aeroporti.length){
    const ap=T.aeroporti.find(a=>a.codice===p.aeroporto)||T.aeroporti[0];
    let te=null;
    for(const pi of ap.piste)for(const t of pi.testate)if(t.nome===nomeTestata(p.pista))te=t;
    return partenzaDa(ap,te);
  }
  const x=p.x||0,z=-(p.y||0);
  const y=Math.max(p.quota||600,T.terrainH(x,z)+150);
  return {x,z,y,hdg:p.direzione||0,v:(p.velocitaNodi||100)/KT,thr:0.7};
}
let partenza=puntoPartenza();
// esercizio di atterraggio: in finale a 2,7 NM dalla pista di partenza, sul sentiero di 3°
function puntoFinale(){
  const te=partenza.te, d=5000;
  return {x:te.x-te.dir.x*d,z:te.z-te.dir.z*d,y:partenza.ap.quota+fis.altRuote()+d*Math.tan(3*D2R),
    hdg:te.hdg,v:72/KT,thr:0.35,flapSel:1};
}
let modalita='decollo';
let destIdx=T.aeroporti.findIndex(a=>a.codice===M.destinazione);
if(destIdx<0)destIdx=Math.max(0,T.aeroporti.findIndex(a=>a!==partenza.ap));
const dest=()=>T.aeroporti[destIdx]||null;
// piano di volo verso la destinazione (js/piano.js)
// radionavigazione (js/radio.js): VOR e ILS, ricevitore NAV1
const radio=SIM.creaRadio(T);strum.impostaRadio(radio);
const nav={staz:null,crs:0};
const piano=SIM.creaPiano(T,A,met,radio);
let faseMostrata=-1;
function ricalcolaPiano(){
  const d=dest(),p=piano.calcola(partenza,d,d&&testataControvento(d));
  $('pianoCorpo').innerHTML=piano.html();faseMostrata=-1;
  strum.impostaRotta(p?{punti:[{x:p.x0,z:p.z0},{x:p.faf.x,z:p.faf.z,nome:p.nomeFaf},{x:p.te.x,z:p.te.z}],prossimo:1}:null);
  aggiornaPiano();adattaDestra();
}
function aggiornaPiano(){
  const p=piano.aggiorna(st);if(!p) return;
  if(p.fase!==faseMostrata){faseMostrata=p.fase;$('pianoCorpo').innerHTML=piano.html();}
  const f=$('pvFase');if(f)scrivi(f,piano.testoFase());
  strum.impostaRotta({punti:[{x:p.x0,z:p.z0},{x:p.faf.x,z:p.faf.z,nome:p.nomeFaf},{x:p.te.x,z:p.te.z}],prossimo:p.prossimo+1});
}
/* la colonna di destra (mappa + piano) non deve finire sotto il pannello in basso: se serve, la mappa si rimpicciolisce */
function adattaDestra(){
  const col=$('destra'),mm=$('minimap');
  mm.style.width='';
  let limite=innerHeight-12;
  const rc=col.getBoundingClientRect();
  for(const h of document.querySelectorAll('.basso .hud')){
    const r=h.getBoundingClientRect();
    if(r.width&&r.right>rc.left&&r.left<rc.right)limite=Math.min(limite,r.top-8);
  }
  const troppo=rc.bottom-limite;
  if(troppo>0&&mm.offsetWidth)mm.style.width=Math.max(150,mm.offsetWidth-troppo)+'px';
  strum.adatta();strum.ridisegnaMappa();
}
addEventListener('resize',()=>adattaDestra());

/* ---------- stato del gioco ---------- */
let avviato=false, inPausa=false, vista=0, tempo=0;
// carburante alla partenza (galloni), scelto nel briefing e ricordato
let carbIniziale=A.carburante.capacita;
try{const c=parseFloat(localStorage.getItem('volo-carburante'));if(c>0&&c<=A.carburante.capacita)carbIniziale=c;}catch(e){}
const NOMI_VISTA=[L('ESTERNA','OUTSIDE'),L('CABINA','COCKPIT'),L('TORRE','TOWER')];

function ricomincia(){
  centraCloche();
  const p=modalita==='finale'&&partenza.te?puntoFinale():partenza;
  fis.reset(p);
  st.carburante=carbIniziale;
  if(p.flapSel){st.flapSel=p.flapSel;st.flap=A.flap.posizioni[p.flapSel];}
  $('crash').hidden=true;
  terreno.aggiorna(st.pos.x,st.pos.z,true);
  primaCamera=true;
  $('thr').value=Math.round(st.thr*100);
  if(piano.piano){piano.piano.prossimo=0;aggiornaPiano();}
  if(avviato&&modalita==='finale') messaggio(L('In finale per la pista <b>'+partenza.te.nome+'</b>: segui le luci PAPI, 65 nodi, flap 30°','On final for runway <b>'+partenza.te.nome+'</b>: follow the PAPI lights, 65 knots, flaps 30°'),6);
  else if(avviato) messaggio(partenza.te?L(`Pronto al decollo: pista <b>${partenza.te.nome}</b> di <b>${partenza.ap.codice}</b>`,`Ready for take-off: runway <b>${partenza.te.nome}</b> at <b>${partenza.ap.codice}</b>`):L('In volo!','Airborne!'),4);
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
// cloche: resta dove la lasci (x = alettoni, y = elevatore; y positivo = tirata). Il timone invece torna al centro.
const cloche={x:0,y:0};
const kb={rud:0};
const pad={elev:0,ail:0,rud:0,freno:0,thr:0,prima:[]};
const inp={elev:0,ail:0,rud:0};
const k=(...c)=>c.some(x=>tasti.has(x))?1:0;
const BLOCCA=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','PageUp','PageDown'];

function flap(d){
  const n=A.flap.posizioni.length;
  const nuovo=clamp(st.flapSel+d,0,n-1);
  if(nuovo!==st.flapSel){st.flapSel=nuovo;messaggio(L(`Flap <b>${A.flap.posizioni[nuovo]}°</b>`,`Flaps <b>${A.flap.posizioni[nuovo]}°</b>`),1.5);}
}
function cambiaVista(){vista=(vista+1)%3;primaCamera=true;}
function prossimaDest(){
  if(!T.aeroporti.length) return;
  impostaDest((destIdx+1)%T.aeroporti.length);
  const d=dest();messaggio(`${L('Destinazione','Destination')}: <b>${d.codice}</b> ${d.nome}`,2.5);
}
function orientaMappa(){
  const o=strum.cambiaOrientamento();
  messaggio(o==='prua'?L('Mappa: <b>prua in alto</b>','Map: <b>heading up</b>'):L('Mappa: <b>nord in alto</b>','Map: <b>north up</b>'),1.5);
}
$('minimap').addEventListener('click',orientaMappa);
// scala della mappa: menu, rotellina sopra la mappa, tasto M
const selScala=$('selScala');
selScala.innerHTML=strum.scale().map((n,i)=>`<option value="${i}">${n}</option>`).join('');
selScala.value=String(strum.zoom);
strum.onZoom(z=>{selScala.value=String(z);});
selScala.addEventListener('change',()=>{strum.impostaZoom(+selScala.value);selScala.blur();});
$('minimap').addEventListener('wheel',e=>{e.preventDefault();if(e.deltaY<0)strum.zoomPiu();else strum.zoomMeno();},{passive:false});
function alternaPausa(){
  if(!avviato||st.crashed) return;
  inPausa=!inPausa;$('pausa').hidden=!inPausa;
}
/* pannelli apribili/chiudibili (comandi e mappa); lo stato viene ricordato */
function apriPannello(id,aperto){
  const el=$(id),btn=el.querySelector('.testa');
  el.classList.toggle('chiuso',!aperto);
  btn.setAttribute('aria-expanded',String(aperto));
  try{localStorage.setItem('volo-pannello-'+id,aperto?'1':'0');}catch(e){}
  if(typeof adattaDestra==='function'&&$('pianoCorpo'))adattaDestra();
}
function alternaPannello(id){apriPannello(id,$(id).classList.contains('chiuso'));}
for(const b of document.querySelectorAll('[data-pannello]')){
  const id=b.dataset.pannello;
  let salvato=null;try{salvato=localStorage.getItem('volo-pannello-'+id);}catch(e){}
  // sugli schermi piccoli i comandi partono chiusi
  apriPannello(id,salvato!=null?salvato==='1':!(id==='aiuto'&&innerWidth<1100));
  b.addEventListener('click',()=>{alternaPannello(id);b.blur();});
}
function alternaAiuto(){alternaPannello('aiuto');}
function alternaAudio(){audio.avvia();const on=audio.alterna();aggiornaBtnAudio(on);}
function aggiornaBtnAudio(on){$('btnAudio').textContent=on?'AUDIO ON':'AUDIO OFF';}
aggiornaBtnAudio(audio.attivo);
function inizia(m){
  if(avviato) return;
  avviato=true;$('brief').hidden=true;audio.avvia();
  if(m==='finale'){modalita='finale';ricomincia();return;}
  messaggio(partenza.te?L(`Pronto al decollo: pista <b>${partenza.te.nome}</b> di <b>${partenza.ap.codice}</b>`,`Ready for take-off: runway <b>${partenza.te.nome}</b> at <b>${partenza.ap.codice}</b>`):L('In volo!','Airborne!'),4);
}

addEventListener('keydown',e=>{
  if(BLOCCA.includes(e.code))e.preventDefault();
  if(e.ctrlKey||e.metaKey||e.altKey) return;      // non interferire con le scorciatoie del browser
  audio.avvia();
  let nome=e.code;
  if(e.key==='+'||e.key==='='||e.code==='NumpadAdd'||e.code==='PageUp') nome='PIU';
  else if(e.key==='-'||e.key==='_'||e.code==='NumpadSubtract'||e.code==='PageDown') nome='MENO';
  logico[e.code]=nome;tasti.add(nome);
  if(e.code==='Comma'||e.code==='Period'){cambiaCrs((e.code==='Period'?1:-1)*(e.shiftKey?10:1));return;}
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
    case 'KeyK':centraCloche();break;
    case 'KeyV':prossimaNav();break;
    case 'KeyL':navIlsArrivo();break;
    case 'KeyP':alternaPausa();break;
    case 'KeyH':alternaAiuto();break;
    case 'KeyI':alternaPannello('piano');break;
    case 'KeyR':if(avviato)ricomincia();break;
    case 'Enter':case 'NumpadEnter':if(!avviato)inizia();else if(st.crashed)ricomincia();break;
  }
});
addEventListener('keyup',e=>{tasti.delete(logico[e.code]||e.code);delete logico[e.code];});
addEventListener('blur',()=>{tasti.clear();for(const q in tieni)tieni[q]=false;});

// mouse/touch come cloche
let trascina=null;
const stickEl=$('stick'),knob=$('knob'),RAGGIO=75;
// il trascinamento riparte dalla posizione attuale della cloche, e al rilascio la cloche resta lì
canvas.addEventListener('pointerdown',e=>{
  audio.avvia();
  trascina={id:e.pointerId,x:e.clientX,y:e.clientY,x0:cloche.x,y0:cloche.y};
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  stickEl.style.left=(e.clientX-cloche.x*RAGGIO)+'px';stickEl.style.top=(e.clientY-cloche.y*RAGGIO)+'px';stickEl.hidden=false;
  knob.style.transform=`translate(${cloche.x*RAGGIO}px,${cloche.y*RAGGIO}px)`;
});
canvas.addEventListener('pointermove',e=>{
  if(!trascina||e.pointerId!==trascina.id) return;
  cloche.x=clamp(trascina.x0+(e.clientX-trascina.x)/RAGGIO,-1,1);
  cloche.y=clamp(trascina.y0+(e.clientY-trascina.y)/RAGGIO,-1,1);
  knob.style.transform=`translate(${cloche.x*RAGGIO}px,${cloche.y*RAGGIO}px)`;
});
const puntoCloche=$('puntoCloche');
const fineTrascina=e=>{if(trascina&&e.pointerId===trascina.id){trascina=null;stickEl.hidden=true;}};
function centraCloche(){cloche.x=cloche.y=0;}
canvas.addEventListener('pointerup',fineTrascina);canvas.addEventListener('pointercancel',fineTrascina);

/* sensibilità della cloche (1…10): velocità con cui i tasti la spostano e curva "esponenziale"
   (piccoli spostamenti vicino al centro danno poco effetto, a fondo corsa resta tutta l'escursione).
   Su richiesta la cloche torna al centro quando non la tocchi, come quella vera rilasciata. */
const opz={sens:5,centro:false};
try{const s=+localStorage.getItem('volo-sens');if(s>=1&&s<=10)opz.sens=s;opz.centro=localStorage.getItem('volo-centro')==='1';}catch(e){}
function curva(v){const e=clamp(0.9-0.08*opz.sens,0.1,0.82);return v*(1-e+e*v*v);}
function aggiornaOpzioni(){
  $('sens').value=String(opz.sens);$('sensv').textContent=String(opz.sens);$('centro').checked=opz.centro;
  $('briefCloche').innerHTML=opz.centro
    ?L('Quando lasci i tasti la cloche <b>torna al centro</b>: per salire o scendere a lungo usa il trim (<kbd>Z</kbd>/<kbd>X</kbd>).',
       'When you release the keys the stick <b>returns to the centre</b>: for long climbs or descents use the trim (<kbd>Z</kbd>/<kbd>X</kbd>).')
    :L('La cloche <b>resta dove la lasci</b>: correggi con <kbd>W</kbd>/<kbd>S</kbd> o centrala con <kbd>K</kbd>.',
       'The stick <b>stays where you leave it</b>: correct with <kbd>W</kbd>/<kbd>S</kbd> or centre it with <kbd>K</kbd>.');
  try{localStorage.setItem('volo-sens',String(opz.sens));localStorage.setItem('volo-centro',opz.centro?'1':'0');}catch(e){}
}
$('sens').addEventListener('input',()=>{opz.sens=+$('sens').value;aggiornaOpzioni();});
$('sens').addEventListener('change',()=>$('sens').blur());
$('centro').addEventListener('change',()=>{opz.centro=$('centro').checked;aggiornaOpzioni();$('centro').blur();});
aggiornaOpzioni();

// pulsanti a schermo
$('thr').addEventListener('input',()=>{st.thr=$('thr').value/100;});
for(const b of document.querySelectorAll('[data-azione]')){
  b.addEventListener('click',()=>{
    audio.avvia();
    ({centra:centraCloche,flapsu:()=>flap(-1),flapgiu:()=>flap(1),vista:cambiaVista,audio:alternaAudio,reset:()=>{if(avviato)ricomincia();}})[b.dataset.azione]();
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
  // tasti: spostano la cloche finché li tieni premuti, poi resta ferma (o torna al centro, se scelto)
  const VEL=0.1*opz.sens;
  const ty=k('KeyS','ArrowDown')-k('KeyW','ArrowUp'), tx=k('KeyD','ArrowRight')-k('KeyA','ArrowLeft');
  cloche.y=clamp(cloche.y+ty*VEL*dt,-1,1);
  cloche.x=clamp(cloche.x+tx*VEL*dt,-1,1);
  if(opz.centro&&!trascina){
    if(!ty)cloche.y-=clamp(cloche.y,-1.5*dt,1.5*dt);
    if(!tx)cloche.x-=clamp(cloche.x,-1.5*dt,1.5*dt);
  }
  kb.rud=rampa(kb.rud,(k('KeyE')||tieni.rudD?1:0)-(k('KeyQ')||tieni.rudS?1:0),dt);
  inp.elev=curva(clamp(cloche.y+pad.elev,-1,1));
  inp.ail=curva(clamp(cloche.x+pad.ail,-1,1));
  puntoCloche.style.transform=`translate(${inp.ail*17}px,${inp.elev*17}px)`;
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
      messaggio(pv?L(`Decollo da <b>${pv.pista.ap.codice}</b>: buon volo!`,`Take-off from <b>${pv.pista.ap.codice}</b>: have a good flight!`):L('Decollo!','Take-off!'),3);
    }else if(e.tipo==='atterraggio'){
      const fpm=-e.vs*FPM;
      audio.colpo(clamp(fpm/700,0,1));
      const giudizio=fpm<120?L('Burro! Atterraggio perfetto','Butter! Perfect landing'):fpm<250?L('Ottimo atterraggio','Great landing'):fpm<450?L('Buon atterraggio','Good landing'):L('Atterraggio duro','Hard landing');
      const pv=e.suolo==='pista'?T.pistaVicina(e.x,e.z,0):null;
      let txt=`<b>${giudizio}</b> — ${Math.round(fpm)} ft/min`;
      if(pv){
        assi();
        const te=pv.pista.testate.find(t=>t.dir.x*fwd.x+t.dir.z*fwd.z>0)||pv.pista.testate[0];
        const dalla=(e.x-te.x)*te.dir.x+(e.z-te.z)*te.dir.z;
        txt+=L(`<br>${pv.pista.ap.codice} pista ${te.nome}: ${Math.round(dalla)} m dalla soglia, ${Math.abs(pv.v).toFixed(1)} m dalla linea centrale`,
              `<br>${pv.pista.ap.codice} runway ${te.nome}: ${Math.round(dalla)} m past the threshold, ${Math.abs(pv.v).toFixed(1)} m from the centre line`);
        if(pv.pista.ap===dest()) txt+=L('<br><b>Destinazione raggiunta!</b>','<br><b>Destination reached!</b>');
      }else txt+=e.suolo==='erba'?L('<br>Fuori pista, sull\'erba','<br>Off the runway, on the grass'):L('<br>Fuori pista','<br>Off the runway');
      messaggio(txt,8);
    }else if(e.tipo==='senzaCarburante'){
      messaggio(L('<b>Motore spento: carburante esaurito!</b><br>Tieni circa 65 nodi (miglior planata) e cerca un campo o una pista vicina.',
                '<b>Engine stopped: out of fuel!</b><br>Hold about 65 knots (best glide) and look for a field or a nearby runway.'),10);
    }else if(e.tipo==='incidente'){
      audio.colpo(1);mostraIncidente(e.motivo);
    }
  }
  st.eventi.length=0;
}

/* ---------- telecamere ---------- */
const fwd=new THREE.Vector3(),dx=new THREE.Vector3(),su=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
const bersaglio=new THREE.Vector3(),guarda=new THREE.Vector3();
let primaCamera=true;
const sguardoGiu=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-12*D2R);
// zoom in cabina con la rotellina del mouse
let fovCabina=70;
canvas.addEventListener('wheel',e=>{if(vista!==1)return;e.preventDefault();fovCabina=clamp(fovCabina+e.deltaY*0.03,25,80);},{passive:false});
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
    const cab=mondo.aereo.cabina;
    camera.position.copy(cab.occhio).applyQuaternion(st.q).add(st.pos);
    camera.quaternion.copy(st.q).multiply(sguardoGiu);   // sguardo un po' verso il basso, sul pannello
    impostaFov(fovCabina);
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
let vsFiltrata=0, virataFiltrata=0;
const wMondo=new THREE.Vector3();
function aggiornaStrumenti(dt){
  assi();
  vsFiltrata+=(st.vs*FPM-vsFiltrata)*Math.min(1,dt*4);
  // rateo di virata (°/s, positivo a destra); come nel virosbandometro vero, sente anche un po' il rollio
  wMondo.copy(st.w).applyQuaternion(st.q);
  const virata=-wMondo.y*R2D+0.15*(-st.w.z*R2D);
  virataFiltrata+=(virata-virataFiltrata)*Math.min(1,dt*3);
  const d=dest();
  const hdg=((Math.atan2(fwd.x,-fwd.z)*R2D)+360)%360;
  let bug=null;
  const b=piano.bersaglio()||d; // si punta al prossimo punto del piano (finale, poi pista)
  if(b) bug=((Math.atan2(b.x-st.pos.x,-(b.z-st.pos.z))*R2D)+360)%360;
  const dati={
    pitch:Math.asin(clamp(fwd.y,-1,1))*R2D,
    bank:Math.atan2(-dx.y,su.y),
    ias:st.ias*KT, alt:st.pos.y*FT, agl:Math.max(0,st.agl)*FT,
    vs:vsFiltrata, hdg, palla:st.palla, bug, gs:st.gs*KT,
    virata:st.aTerra?0:virataFiltrata, trim:st.trim, carb:st.carburante, flusso:st.crashed?0:st.flusso,
    nav:misuraNav(),
  };
  if(vista===1){
    // in cabina: gli strumenti vengono disegnati sugli schermi del pannello
    const cab=mondo.aereo.cabina;
    strum.disegnaPFD(dati,cab.pfd.sup);cab.pfd.tex.needsUpdate=true;
    strum.disegnaRiserva(cab.riserva.sup,dati);cab.riserva.tex.needsUpdate=true;
    if(n%4===0){
      const trk=((Math.atan2(st.vel.x,-st.vel.z)*R2D)+360)%360;
      strum.disegnaMFD(cab.mfd.sup,{s:st,hdg,dest:d,gs:st.gs*KT,trk,thr:st.thr});cab.mfd.tex.needsUpdate=true;
    }
  }else{strum.disegnaPFD(dati);strum.disegnaAux(dati);}
  return {hdg,bug};
}
const el={};
for(const id of ['rpm','flap','trim','gload','thrv','dist','brg','vento','crs','dme','spiaFreni','spiaTerra','spiaVista','avviso'])el[id]=$(id);
const scrivi=(n,t)=>{if(n.textContent!==t)n.textContent=t;};
function aggiornaTesti(hdg,bug){
  scrivi(el.rpm,String(Math.round(st.rpm/10)*10));
  scrivi(el.flap,String(Math.round(st.flap)));
  const tr=Math.round(st.trim*200);
  scrivi(el.trim,(tr>0?'+':'')+tr);
  scrivi(el.gload,st.g.toFixed(1));
  scrivi(el.thrv,String(Math.round(st.thr*100)));
  const d=piano.bersaglio()||dest();
  if(d){
    scrivi(el.dist,(Math.hypot(d.x-st.pos.x,d.z-st.pos.z)/1852).toFixed(1));
    scrivi(el.brg,String(Math.round(bug)%360).padStart(3,'0'));
  }
  const mn=ultimaNav;
  scrivi(el.crs,nav.staz?String(Math.round(mn&&mn.crs!=null?mn.crs:nav.crs)%360).padStart(3,'0'):'---');
  scrivi(el.dme,mn&&mn.ricevuto&&mn.dme!=null?mn.dme.toFixed(1):'--.-');
  const vk=Math.hypot(vento.x,vento.z)*KT, vda=((Math.atan2(-vento.x,vento.z)*R2D)+360)%360;
  scrivi(el.vento,vk<0.5?'CALMO':`${String(Math.round(vda)).padStart(3,'0')}/${Math.round(vk)}`);
  el.spiaFreni.classList.toggle('warn',st.freno>0);
  el.spiaTerra.classList.toggle('on',st.aTerra);
  scrivi(el.spiaVista,NOMI_VISTA[vista]);
  document.body.classList.toggle('vista-cabina',vista===1);

  let w='',rosso=false;
  if(avviato&&!st.crashed){
    const agl=st.agl, vs=st.vs;
    if(!st.aTerra&&agl<90&&vs<-4&&agl/-vs<10){w='PULL UP';rosso=true;}
    else if(st.avvisoStallo){w=L('STALLO','STALL');rosso=true;}
    else if(st.ias*KT>A.velocita.vne){w=L('VELOCITÀ ECCESSIVA','OVERSPEED');rosso=true;}
    else if(st.flap>1&&st.ias*KT>A.velocita.vfe+5)w=L('VELOCITÀ FLAP','FLAP SPEED');
    else if(st.g>3.8||st.g<-1.5)w=L('SOVRACCARICO','OVER-G');
    else if(st.carburante<=0)w=L('MOTORE SPENTO','ENGINE OUT');
    else if(st.carburante<5)w=L('CARBURANTE BASSO','LOW FUEL');
  }
  el.avviso.hidden=!w;
  if(w){scrivi(el.avviso,w);el.avviso.classList.toggle('rosso',rosso);}
}

/* ---------- briefing e selettori (mondo, aeroporto, pista, destinazione) ---------- */
$('crediti').hidden=!M.reale;
function aggiornaBriefing(){
  const d=dest(), te=partenza.te, ap=partenza.ap;
  let t='';
  const vda=String(met.ventoDa).padStart(3,'0');
  if(te) t+=L(`Sei all'aeroporto <b>${ap.codice} – ${ap.nome}</b> (quota ${Math.round(ap.quota*FT)} ft), allineato sulla pista <b>${te.nome}</b> lunga ${te.pista.L} m${te.pista.erba?' (in erba)':''}. `,
              `You are at <b>${ap.codice} – ${ap.nome}</b> (elevation ${Math.round(ap.quota*FT)} ft), lined up on runway <b>${te.nome}</b>, ${te.pista.L} m long${te.pista.erba?' (grass)':''}. `);
  else t+=L(`Parti già in volo a ${Math.round(partenza.y*FT)} ft. `,`You start in flight at ${Math.round(partenza.y*FT)} ft. `);
  t+=met.ventoNodi>0?L(`Vento da ${vda}° a ${met.ventoNodi} nodi${met.raffiche?` con raffiche di ${met.raffiche}`:''}. `,`Wind from ${vda}° at ${met.ventoNodi} knots${met.raffiche?` gusting ${met.raffiche} more`:''}. `):L('Vento calmo. ','Calm wind. ');
  if(d&&d!==ap){
    const dist=Math.hypot(d.x-partenza.x,d.z-partenza.z)/1852;
    t+=L(`Destinazione: <b>${d.codice} – ${d.nome}</b>, a ${dist.toFixed(1)} NM (quota ${Math.round(d.quota*FT)} ft). Il rombo magenta sulla bussola e la linea sulla mappa indicano la rotta.`,
         `Destination: <b>${d.codice} – ${d.nome}</b>, ${dist.toFixed(1)} NM away (elevation ${Math.round(d.quota*FT)} ft). The magenta marker on the compass and the line on the map show the way.`);
  }
  $('briefTesto').innerHTML=t;
  ricalcolaPiano();
  $('briefVr').textContent=A.velocita.vr;$('briefVy').textContent=A.velocita.vy;
}
const selMondo=$('selMondo'),selAp=$('selAeroporto'),selPista=$('selPista'),selDB=$('selDestBrief'),selD=$('selDest');
selMondo.value=window.MONDO_SCELTO||'piemonte';
selMondo.addEventListener('change',()=>{location.search='?mappa='+selMondo.value;});
const selLingua=$('selLingua');
selLingua.value=SIM.lingua;
selLingua.addEventListener('change',()=>SIM.cambiaLingua(selLingua.value));
const opzioniAeroporti=sel=>{sel.innerHTML=T.aeroporti.map((a,i)=>`<option value="${i}">${a.codice} – ${a.nome}</option>`).join('');};
for(const sel of [selAp,selDB,selD])opzioniAeroporti(sel);
function impostaDest(i){destIdx=i;selDB.value=selD.value=String(i);aggiornaBriefing();}
function riempiPiste(ap,scelta){
  const opz=[];
  ap.piste.forEach((pi,i)=>pi.testate.forEach((t,j)=>opz.push(`<option value="${i}|${j}">${t.nome} (${pi.L} m${pi.erba?L(', erba',', grass'):''})</option>`)));
  selPista.innerHTML=opz.join('');
  if(scelta){const i=ap.piste.indexOf(scelta.pista);selPista.value=i+'|'+scelta.pista.testate.indexOf(scelta);}
}
function scegliPartenza(){
  const ap=T.aeroporti[+selAp.value];
  const [i,j]=selPista.value.split('|').map(Number);
  partenza=partenzaDa(ap,ap.piste[i]&&ap.piste[i].testate[j]);
  ricomincia();aggiornaBriefing();
}
if(partenza.ap){selAp.value=String(T.aeroporti.indexOf(partenza.ap));riempiPiste(partenza.ap,partenza.te);}
selAp.addEventListener('change',()=>{const ap=T.aeroporti[+selAp.value];riempiPiste(ap,testataControvento(ap));scegliPartenza();selAp.blur();});
selPista.addEventListener('change',()=>{scegliPartenza();selPista.blur();});
selDB.addEventListener('change',()=>{impostaDest(+selDB.value);selDB.blur();});
selD.addEventListener('change',()=>{impostaDest(+selD.value);messaggio(`${L('Destinazione','Destination')}: <b>${dest().codice}</b> ${dest().nome}`,2.5);selD.blur();});
impostaDest(destIdx);
/* ---------- NAV1: scelta del radioaiuto e della rotta ---------- */
const selNav=$('selNav');
{
  const gr=t=>radio.stazioni.filter(s=>s.tipo===t).map(s=>`<option value="${radio.stazioni.indexOf(s)}">${s.freq.toFixed(2)} ${s.id} – ${s.nome}</option>`).join('');
  selNav.innerHTML=`<option value="-1">${L('— spento —','— off —')}</option>`+
    (radio.stazioni.some(s=>s.tipo==='VOR')?'<optgroup label="VOR">'+gr('VOR')+'</optgroup>':'')+
    (radio.stazioni.some(s=>s.tipo==='ILS')?`<optgroup label="${L('ILS (simulati)','ILS (simulated)')}">`+gr('ILS')+'</optgroup>':'');
}
let ultimaNav=null;
function misuraNav(){
  if(!nav.staz){ultimaNav=null;return null;}
  const m=radio.misura(nav.staz,st.pos,nav.crs);
  m.staz=nav.staz;ultimaNav=m;return m;
}
const rottaVerso=s=>Math.round(((Math.atan2(s.x-st.pos.x,-(s.z-st.pos.z))*R2D)+360)%360);
function sintonizza(s,silenzioso){
  nav.staz=s;selNav.value=String(s?radio.stazioni.indexOf(s):-1);
  if(s)nav.crs=s.tipo==='ILS'?s.crs:rottaVerso(s);   // VOR: rotta diretta verso la stazione
  strum.impostaNav(nav);
  if(silenzioso) return;
  if(!s){messaggio(L('NAV1 spento','NAV1 off'),1.5);return;}
  const m=radio.misura(s,st.pos,nav.crs);
  messaggio(`NAV1: <b>${s.freq.toFixed(2)} ${s.id}</b> ${s.nome}${m.ricevuto?'':L(' — <b>fuori portata</b>',' — <b>out of range</b>')}`+
    (s.tipo==='VOR'?`<br>CRS ${String(nav.crs).padStart(3,'0')}° `+L('(diretto alla stazione) · cambialo con , e .','(direct to the station) · change it with , and .')
                  :`<br>${L('localizzatore','localizer')} ${String(Math.round(s.crs)).padStart(3,'0')}° · ${L('sentiero','glide slope')} 3°`),4);
}
function prossimaNav(){
  // stazioni ricevute, dalla più vicina; ogni pressione passa alla successiva
  const ric=radio.stazioni.filter(s=>radio.misura(s,st.pos,0).ricevuto)
    .sort((a,b)=>Math.hypot(a.x-st.pos.x,a.z-st.pos.z)-Math.hypot(b.x-st.pos.x,b.z-st.pos.z));
  if(!ric.length){messaggio(L('Nessun VOR o ILS ricevuto da qui: sali di quota','No VOR or ILS in range from here: climb higher'),2.5);return;}
  const i=ric.indexOf(nav.staz);
  sintonizza(ric[(i+1)%ric.length]);
}
function navIlsArrivo(){
  const p=piano.piano,ils=p&&radio.ilsDi(p.te);
  if(!ils){messaggio(L('La pista di arrivo non ha l’ILS (serve asfalto e almeno 1000 m)','The arrival runway has no ILS (it needs asphalt and at least 1000 m)'),3);return;}
  sintonizza(ils);
}
function cambiaCrs(d){
  if(!nav.staz||nav.staz.tipo!=='VOR') return;
  nav.crs=(nav.crs+d+360)%360;
}
selNav.addEventListener('change',()=>{const i=+selNav.value;sintonizza(i>=0?radio.stazioni[i]:null);selNav.blur();});
sintonizza(null,true);
const selCarb=$('selCarb');
if(![...selCarb.options].some(o=>+o.value===carbIniziale))carbIniziale=A.carburante.capacita;
selCarb.value=String(carbIniziale);
selCarb.addEventListener('change',()=>{
  carbIniziale=+selCarb.value;st.carburante=carbIniziale;
  try{localStorage.setItem('volo-carburante',String(carbIniziale));}catch(e){}
  selCarb.blur();
});

/* ---------- ciclo principale ---------- */
ricomincia();
aggiornaVento(0);
// scorciatoie per le prove: index.html#salta (salta il briefing), #vista=1 (cabina)
SIM.debug={st,fis,terreno,monumenti};  // utile dalla console del browser (F12)
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
  if(monumenti&&n%10===0)monumenti.aggiorna(camera.position,terreno.vicino());
  mondo.aggiorna(st,camera.position,vento,attivo?dt:0,vista===1);
  if(n%2===0)ultimiStrum=aggiornaStrumenti(dt*2);
  if(n%6===0){aggiornaPiano();aggiornaTesti(ultimiStrum.hdg,ultimiStrum.bug);strum.disegnaMappa(st,ultimiStrum.hdg,dest());}
  audio.aggiorna(st,!attivo);
  renderer.render(scene,camera);
  n++;
}
requestAnimationFrame(ciclo);
})();
