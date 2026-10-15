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
if(SIM.disegnaRullaggio)SIM.disegnaRullaggio(scene);   // vie di rullaggio vere (js/rullaggio.js)
// ora del volo: giorno, tramonto, notte (js/notte.js), scelta nel briefing e ricordata
const notte=SIM.creaNotte(scene,mondo,T);
let oraVolo='giorno';
try{const o=localStorage.getItem('volo-ora');if(o==='tramonto'||o==='notte')oraVolo=o;}catch(e){}
notte.imposta(oraVolo);
camera.far=Math.max(15000,scene.fog.far*1.15);camera.updateProjectionMatrix();
const fis=SIM.creaFisica(A,T), st=fis.st;
const ap=SIM.creaAutopilota(A);   // autopilota (js/autopilota.js)
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
// partenza "in pista" (sulla soglia, pronti al decollo) oppure "dal parcheggio" (sul piazzale: si rulla fino alla pista)
let daParcheggio=false;
try{daParcheggio=localStorage.getItem('volo-partenza-da')==='parcheggio';}catch(e){}
/* rullaggio: il piazzale e il raccordo che js/mondo.js disegna accanto alla pista principale (a metà pista, sul lato
   destro): u lungo la pista, v verso destra. Parcheggio in (-45, 115), punto attesa a 30 m dal bordo della pista. */
function geometriaRullaggio(ap){
  const p=ap.piste[0],rx=-p.dir.z,rz=p.dir.x;
  const P=(u,v)=>({x:p.cx+p.dir.x*u+rx*v,z:p.cz+p.dir.z*u+rz*v});
  return {p,P,parcheggio:P(-45,115),attesa:P(0,p.W/2+30),hdg:(p.hdg+270)%360};
}
function partenzaParcheggio(ap,te){
  // vie di rullaggio vere (js/rullaggio.js): percorso dal piazzale vero al punto attesa della pista scelta
  if(ap.rullaggioVero&&SIM.reteRullaggio){
    const t=te||testataControvento(ap),rr=SIM.reteRullaggio.partenza(ap,t);
    if(!rr) return partenzaDa(ap,t);   // per questa pista non c'è un percorso: si parte in pista
    for(const q of rr.punti)if(q.nome==='ATT')q.nome=L('ATT','HP');
    const c=rr.parcheggio;
    return {x:c.x,z:c.z,y:Math.max(ap.quota,T.meshH(c.x,c.z))+fis.altRuote()-0.04,hdg:rr.hdg,v:0,thr:0,ap,te:t,parcheggio:true,
      attesa:rr.attesa,percorso:rr.punti,vie:rr.refs,backtrack:rr.backtrack};
  }
  const g=geometriaRullaggio(ap);
  // dal piazzale si arriva alla pista principale: la testata scelta se è sua, altrimenti la più controvento
  if(!te||te.pista!==g.p)te=g.p.testate.reduce((a,b)=>Math.cos((a.hdg-met.ventoDa)*D2R)>=Math.cos((b.hdg-met.ventoDa)*D2R)?a:b);
  const c=g.parcheggio;
  const percorso=[c,g.P(-45,100),g.P(0,100),g.P(0,70),Object.assign(g.attesa,{nome:L('ATT','HP')}),g.P(0,0),
    {x:te.x+te.dir.x*15,z:te.z+te.dir.z*15,nome:te.nome}];
  return {x:c.x,z:c.z,y:ap.quota+fis.altRuote()-0.04,hdg:g.hdg,v:0,thr:0,ap,te,parcheggio:true,attesa:g.attesa,percorso,vie:[],backtrack:true};
}
const creaPartenza=(ap,te)=>daParcheggio?partenzaParcheggio(ap,te):partenzaDa(ap,te);
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
    return creaPartenza(ap,te);
  }
  const x=p.x||0,z=-(p.y||0);
  const y=Math.max(p.quota||600,T.terrainH(x,z)+150);
  return {x,z,y,hdg:p.direzione||0,v:(p.velocitaNodi||100)/KT,thr:0.7};
}
let partenza=puntoPartenza();
// dove si prova l'atterraggio: la pista di arrivo della destinazione (la più controvento, come nel piano di volo);
// se non c'è una destinazione diversa dalla partenza, la pista di partenza
function pistaFinale(){
  const d=dest();
  if(d&&d!==partenza.ap)return {ap:d,te:testataControvento(d)};
  return partenza.te?{ap:partenza.ap,te:partenza.te}:null;
}
function puntoFinale(){
  const {ap,te}=pistaFinale(), d=5000;
  return {x:te.x-te.dir.x*d,z:te.z-te.dir.z*d,y:ap.quota+fis.altRuote()+d*Math.tan(3*D2R),
    hdg:te.hdg,v:72/KT,thr:0.35,flapSel:1};
}
let modalita='decollo';
let atterratoA=null;   // aeroporto dove si è appena atterrati: fermi lì, diventa la nuova partenza
let destIdx=T.aeroporti.findIndex(a=>a.codice===M.destinazione);
if(destIdx<0)destIdx=Math.max(0,T.aeroporti.findIndex(a=>a!==partenza.ap));
const dest=()=>T.aeroporti[destIdx]||null;
// piano di volo verso la destinazione (js/piano.js)
// radionavigazione (js/radio.js): VOR e ILS, ricevitore NAV1
const radio=SIM.creaRadio(T);strum.impostaRadio(radio);
const nav={staz:null,crs:0};
const piano=SIM.creaPiano(T,A,met,radio);
// comunicazioni radio con la torre (js/atc.js)
const atc=SIM.creaATC({A,T,met,audio,radio,stato:st});
piano.impostaCom(atc.stazioneDi,atc.terraDi);
// missioni (js/missioni.js) e libretto di volo (js/libretto.js)
const missioni=SIM.creaMissioni(T);
const libretto=SIM.creaLibretto();
let daPiano=null;   // giro a tappe dopo un tocca e riparti: il piano parte dalla pista appena toccata
const ctxATC=()=>({parcheggio:!!partenza.parcheggio&&modalita!=='finale',attesa:partenza.attesa||null,vie:partenza.vie||[],backtrack:partenza.backtrack!==false,part:partenza.ap?{ap:partenza.ap,te:partenza.te}:null,arr:piano.piano?{ap:piano.piano.arr,te:piano.piano.te}:null,finale:modalita==='finale',fin:modalita==='finale'?pistaFinale():null});
let faseMostrata=-1;
function ricalcolaPiano(){
  const d=dest(),p=piano.calcola(daPiano||partenza,d,d&&testataControvento(d));
  $('pianoCorpo').innerHTML=piano.html();faseMostrata=-1;
  strum.impostaRotta(p?{punti:[{x:p.x0,z:p.z0},{x:p.faf.x,z:p.faf.z,nome:p.nomeFaf},{x:p.te.x,z:p.te.z}],prossimo:1}:null);
  aggiornaPiano();adattaDestra();
}
// rullaggio in corso (partenza dal parcheggio, prima del decollo): la mappa mostra il percorso a terra
let rull=null;
function aggiornaPiano(){
  if(rull){
    while(rull.i<rull.punti.length-1&&Math.hypot(rull.punti[rull.i].x-st.pos.x,rull.punti[rull.i].z-st.pos.z)<22)rull.i++;
  }
  const p=piano.aggiorna(st);if(!p){if(rull)strum.impostaRotta({punti:rull.punti,prossimo:rull.i});return;}
  if(p.fase!==faseMostrata){faseMostrata=p.fase;$('pianoCorpo').innerHTML=piano.html();}
  const f=$('pvFase');if(f)scrivi(f,piano.testoFase());
  if(rull)strum.impostaRotta({punti:rull.punti,prossimo:rull.i});
  else strum.impostaRotta({punti:[{x:p.x0,z:p.z0},{x:p.faf.x,z:p.faf.z,nome:p.nomeFaf},{x:p.te.x,z:p.te.z}],prossimo:p.prossimo+1});
}
/* la colonna di destra non deve finire sotto il pannello in basso: se serve, la mappa si rimpicciolisce
   e le altre schede (radio, piano, missione) scorrono */
function adattaDestra(){
  const col=$('destra'),mm=$('minimap');
  mm.style.width='';
  for(const s of document.querySelectorAll('.destra .scheda'))s.style.maxHeight='';
  let limite=innerHeight-12;
  const rc=col.getBoundingClientRect();
  for(const h of document.querySelectorAll('.basso .hud')){
    const r=h.getBoundingClientRect();
    if(r.width&&r.right>rc.left&&r.left<rc.right)limite=Math.min(limite,r.top-8);
  }
  const troppo=rc.bottom-limite;
  if(troppo>0&&mm.offsetWidth)mm.style.width=Math.max(150,mm.offsetWidth-troppo)+'px';
  for(const s of document.querySelectorAll('.destra .scheda:not(.nav)')){
    if(s.hidden)continue;
    const r=s.getBoundingClientRect();
    if(r.bottom>limite)s.style.maxHeight=Math.max(120,limite-r.top)+'px';
  }
  strum.adatta();strum.ridisegnaMappa();
}
addEventListener('resize',()=>adattaDestra());
SIM.adattaDestra=adattaDestra;   // la usa anche la radio (js/atc.js) quando il registro cresce

/* ---------- stato del gioco ---------- */
let avviato=false, inPausa=false, vista=0, tempo=0;
// carburante alla partenza (galloni), scelto nel briefing e ricordato
let carbIniziale=A.carburante.capacita;
try{const c=parseFloat(localStorage.getItem('volo-carburante'));if(c>0&&c<=A.carburante.capacita)carbIniziale=c;}catch(e){}
const NOMI_VISTA=[L('ESTERNA','OUTSIDE'),L('CABINA','COCKPIT'),L('TORRE','TOWER')];

function ricomincia(){
  ap.disinserisci();
  centraCloche();
  if(libretto.aperto)libretto.chiudi(st.crashed?'incidente':'interrotto');
  if(avviato)avviaMissione();
  const p=modalita==='finale'&&pistaFinale()?puntoFinale():partenza;
  fis.reset(p);
  st.carburante=carbIniziale;
  if(p.flapSel){st.flapSel=p.flapSel;st.flap=A.flap.posizioni[p.flapSel];}
  $('crash').hidden=true;
  terreno.aggiorna(st.pos.x,st.pos.z,true);
  primaCamera=true;
  $('thr').value=Math.round(st.thr*100);
  rull=partenza.parcheggio&&modalita!=='finale'?{punti:partenza.percorso,i:1}:null;
  if(piano.piano){piano.piano.prossimo=0;aggiornaPiano();}
  atc.reset(ctxATC());
  atterratoA=null;
  // si parte già in volo (in finale): il volo del libretto comincia subito
  if(avviato&&modalita==='finale')libretto.decollo({mondo:window.MONDO_SCELTO,da:L('in finale','on final'),ora:oraVolo});
  if(avviato&&modalita==='finale'){const f=pistaFinale();messaggio(L(`In finale per la pista <b>${f.te.nome}</b> di <b>${f.ap.codice}</b>: segui le luci PAPI, 65 nodi, flap 30°`,`On final for runway <b>${f.te.nome}</b> at <b>${f.ap.codice}</b>: follow the PAPI lights, 65 knots, flaps 30°`),6);}
  else if(avviato) messaggioPartenza();
}
function messaggioPartenza(){
  if(partenza.parcheggio)messaggio(L(`Sei al parcheggio di <b>${partenza.ap.codice}</b>: chiedi di rullare (T), poi segui la linea gialla a terra (sulla mappa il percorso è in magenta) fino al punto attesa della pista <b>${partenza.te.nome}</b>.`,
    `You are at the parking area of <b>${partenza.ap.codice}</b>: ask for taxi (T), then follow the yellow line on the ground (the route is magenta on the map) to the holding point of runway <b>${partenza.te.nome}</b>.`),8);
  else messaggio(partenza.te?L(`Pronto al decollo: pista <b>${partenza.te.nome}</b> di <b>${partenza.ap.codice}</b>`,`Ready for take-off: runway <b>${partenza.te.nome}</b> at <b>${partenza.ap.codice}</b>`):L('In volo!','Airborne!'),4);
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
function cambiaVista(){vista=(vista+1)%3;primaCamera=true;sg.yaw=sg.pitch=0;}
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
  if(pausaFinestra){pausaFinestra=false;$('pausa').hidden=false;return;}   // già fermi per una finestra: resta in pausa
  inPausa=!inPausa;$('pausa').hidden=!inPausa;atc.pausa(inPausa);
}
/* ---------- colonna di destra a schede: MAPPA (J), RADIO (T), PIANO (I), MISSIONE (Y) ----------
   se ne vede una alla volta; premendo di nuovo la stessa la colonna si nasconde (restano le linguette).
   La scelta viene ricordata. Quando T apre la radio, finita la conversazione si torna alla scheda di prima. */
const SCHEDE=['mappa','radio','piano','ap','missione'];
let scheda='mappa', schedaPrima=null, radioLibera=0;
try{const s=localStorage.getItem('volo-scheda');if(s==='nessuna')scheda=null;else if(SCHEDE.includes(s)&&s!=='missione')scheda=s;}catch(e){}
const linguetta=id=>document.querySelector(`[data-scheda="${id}"]`);
function mostraScheda(id,ricorda=true){
  if(id&&linguetta(id).hidden)id=null;
  scheda=id;schedaPrima=null;
  for(const s of SCHEDE){
    $(s).hidden=s!==id;
    const b=linguetta(s);b.setAttribute('aria-selected',String(s===id));b.classList.toggle('attiva',s===id);
  }
  $('destra').dataset.aperta=id||'';
  if(id==='missione')$('missioneCorpo').innerHTML=missioni.pannello();
  if(id==='ap')aggiornaSchedaAP();
  if(ricorda)try{localStorage.setItem('volo-scheda',id||'nessuna');}catch(e){}
  adattaDestra();
}
function alternaScheda(id){mostraScheda(scheda===id?null:id);}
for(const b of document.querySelectorAll('[data-scheda]'))b.addEventListener('click',()=>{alternaScheda(b.dataset.scheda);b.blur();});
// la radio si apre da sola con T (menu delle frasi); poi, a conversazione finita, torna la scheda di prima
function apriRadio(){
  if(scheda==='radio') return;
  const prima=scheda||'nessuna';mostraScheda('radio',false);schedaPrima=prima;radioLibera=0;
}
function controllaRadio(dt){
  linguetta('radio').classList.toggle('chiama',$('radio').classList.contains('chiama')&&scheda!=='radio');
  if(!schedaPrima||scheda!=='radio') return;
  if(atc.menuAperto||!atc.libero){radioLibera=0;return;}
  radioLibera+=dt;
  if(radioLibera>5){const p=schedaPrima;mostraScheda(p==='nessuna'?null:p,false);}
}

/* ---------- finestre: comandi (H), libretto di volo, risultato della missione ----------
   aperte durante il volo lo mettono in pausa; chiudendole si riparte */
const FINESTRE=['aiuto','esito','libretto'];
let pausaFinestra=false;
function apriFinestra(id){
  if(id==='libretto')$('librettoCorpo').innerHTML=libretto.html();
  $(id).hidden=false;
  if(avviato&&!inPausa&&!st.crashed){inPausa=true;pausaFinestra=true;atc.pausa(true);}
}
function chiudiFinestra(id){
  $(id).hidden=true;
  if(pausaFinestra&&FINESTRE.every(f=>$(f).hidden)){pausaFinestra=false;inPausa=false;atc.pausa(false);}
}
const finestraAperta=()=>FINESTRE.slice().reverse().find(f=>!$(f).hidden)||null;
for(const b of document.querySelectorAll('[data-chiudi]'))b.addEventListener('click',()=>{chiudiFinestra(b.dataset.chiudi);b.blur();});
for(const id of FINESTRE)$(id).addEventListener('click',e=>{if(e.target===$(id))chiudiFinestra(id);});   // clic fuori dalla finestra
function alternaAiuto(){if($('aiuto').hidden)apriFinestra('aiuto');else chiudiFinestra('aiuto');}
$('btnAiuto').addEventListener('click',()=>{alternaAiuto();$('btnAiuto').blur();});
for(const b of document.querySelectorAll('#btnLibretto,.apriLibretto'))b.addEventListener('click',()=>{apriFinestra('libretto');b.blur();});
$('librettoSvuota').addEventListener('click',()=>{
  if(!confirm(L('Cancellare tutti i voli del libretto?','Delete every flight in the logbook?')))return;
  libretto.svuota();$('librettoCorpo').innerHTML=libretto.html();
});
function alternaAudio(){audio.avvia();const on=audio.alterna();aggiornaBtnAudio(on);}
function aggiornaBtnAudio(on){$('btnAudio').textContent=on?'AUDIO ON':'AUDIO OFF';}
aggiornaBtnAudio(audio.attivo);
// torna al briefing iniziale: il volo si ferma e si possono cambiare mondo, partenza, destinazione, ora e carburante
function apriBriefing(){
  if(!avviato) return;
  for(const f of FINESTRE)$(f).hidden=true;
  avviato=false;inPausa=false;pausaFinestra=false;atc.pausa(false);
  $('pausa').hidden=true;$('crash').hidden=true;$('msg').hidden=true;$('obiettivo').hidden=true;
  modalita='decollo';ricomincia();
  $('brief').hidden=false;
  preparaMissione(true);
}
for(const b of document.querySelectorAll('.vaiBriefing'))b.addEventListener('click',()=>{apriBriefing();b.blur();});
function inizia(m){
  if(avviato) return;
  if(missioni.attiva&&missioni.tipo==='precisione')m='finale';   // la precisione parte in finale
  avviato=true;$('brief').hidden=true;audio.avvia();
  if(m==='finale'){modalita='finale';ricomincia();return;}
  avviaMissione();
  messaggioPartenza();
}
/* missione: si (ri)comincia da capo; nei giri a tappe la destinazione è la prima tappa */
function avviaMissione(){
  daPiano=null;
  chiudiFinestra('esito');
  if(!missioni.attiva) return;
  missioni.avvia();
  const p=missioni.prossima();
  if(p&&p!==dest())impostaDest(T.aeroporti.indexOf(p));
  $('missioneCorpo').innerHTML=missioni.pannello();
}
// risultato della missione: la finestra si apre quando l'aereo è fermo; va anche nel libretto
function mostraEsito(){
  const r=missioni.esito();
  $('esitoTitolo').textContent=r.titolo;$('esitoTitolo').className=r.ok?'':'rosso';
  $('esitoStelle').textContent=r.stelle;$('esitoTesto').innerHTML=r.html;
  libretto.missione(missioni.risultato());
  apriFinestra('esito');
}
$('esitoRiprova').addEventListener('click',()=>{$('esitoRiprova').blur();ricomincia();});

/* ---------- autopilota (js/autopilota.js) ----------
   Maiusc+A lo inserisce o lo stacca. Inserito, i tasti della cloche cambiano i valori scelti:
   S/W (o frecce) quota scelta +100 / −100 ft (come tirare o spingere), con Maiusc la velocità verticale ±100 ft/min;
   A/D prua scelta −1° / +1° (tenendo premuto corre); Maiusc+H prua scelta = prua attuale.
   Si stacca anche prendendo la cloche col mouse o col gamepad. */
/* ---------- CDI: sorgente della navigazione, come il tasto CDI del G1000 ----------
   GPS = la rotta magenta del piano di volo; NAV1 = il VOR o l'ILS sintonizzato (ago verde).
   La segue il PFD e, in NAV e APR, l'autopilota. Si cambia col tasto CDI (scheda AP) o Maiusc+C. */
let cdi='GPS';
function impostaCdi(c,silenzioso){
  if(c===cdi) return;
  cdi=c;ap.sorgenteCambiata(st);eventiAP();
  if(!silenzioso)messaggio('CDI: <b>'+nomeCdi()+'</b>',2);
  aggiornaSchedaAP();
}
const nomeCdi=()=>cdi==='GPS'?'GPS':nav.staz?(nav.staz.tipo==='ILS'?'LOC1':'VOR1'):'NAV1';
// tratto attivo della rotta magenta (lo stesso della mappa): dal punto lasciato al prossimo
function trattoGPS(){
  const p=piano.piano;if(!p||rull) return null;
  const punti=[{x:p.x0,z:p.z0},{x:p.faf.x,z:p.faf.z,nome:p.nomeFaf},{x:p.te.x,z:p.te.z,nome:'RW'+p.te.nome}];
  const i=Math.min(p.prossimo+1,2);
  return {a:punti[i-1],b:punti[i],finale:i===2};
}
/* misura GPS, nello stesso formato del ricevitore NAV1: rotta voluta (DTK), distanza dalla rotta (xtk, m,
   + = rotta a destra) e deviazione con fondo scala 2 NM (1 NM sul tratto finale), come sul G1000 */
function misuraGPS(){
  const t=trattoGPS();if(!t) return null;
  const ux=t.b.x-t.a.x,uz=t.b.z-t.a.z,lu=Math.hypot(ux,uz)||1,ex=ux/lu,ez=uz/lu;
  const dtk=((Math.atan2(ex,-ez)*R2D)+360)%360;
  const xtk=-((st.pos.x-t.a.x)*(-ez)+(st.pos.z-t.a.z)*ex);
  const fs=(t.finale?1:2)*1852;
  return {staz:{tipo:'GPS',id:t.b.nome||'WPT',freq:0},ricevuto:true,dev:clamp(xtk/fs,-1,1),daA:'TO',crs:dtk,
    dme:Math.hypot(t.b.x-st.pos.x,t.b.z-st.pos.z)/1852,xtk,dtk,scala:t.finale?'TERM':'ENR'};
}
// la sorgente del CDI per l'autopilota (vedi comanda in js/autopilota.js)
function navPerAP(){
  if(cdi==='GPS'){const g=misuraGPS();return g?{fonte:'GPS',ricevuto:true,dev:g.dev,dtk:g.dtk,xtk:g.xtk,gsErr:null,gsDev:null}:{fonte:'GPS',assente:true,ricevuto:false};}
  const s=nav.staz;if(!s) return {fonte:'VOR',assente:true,ricevuto:false};
  const fonte=s.tipo==='ILS'?'LOC':'VOR', m=radio.misura(s,st.pos,nav.crs);
  if(!m.ricevuto) return {fonte,ricevuto:false};
  const dist=Math.hypot(st.pos.x-s.x,st.pos.z-s.z), xtk=dist*Math.sin(m.dev*(s.tipo==='ILS'?2.5:10)*D2R);
  let gsErr=null;
  if(s.tipo==='ILS'&&m.gs!=null){const dg=Math.hypot(st.pos.x-s.gs.x,st.pos.z-s.gs.z);gsErr=(st.pos.y-s.quota)-dg*Math.tan(3*D2R);}
  return {fonte,ricevuto:true,dev:m.dev,dtk:s.tipo==='ILS'?s.crs:nav.crs,xtk,gsErr,gsDev:m.gs};
}
let minimiFino=0;   // fino a quando lampeggia l'avviso MINIMI
function eventiAP(){
  while(ap.eventi.length){
    const t=ap.eventi.shift();
    if(t==='MINIMI'){
      minimiFino=tempo+6;audio.apStacco();
      messaggio(L("<b>MINIMI</b> (200 ft): stacca l'autopilota (Maiusc+A), togli motore e atterra a mano. Il 172 non atterra da solo.",
                  '<b>MINIMUMS</b> (200 ft): disconnect the autopilot (Shift+A), reduce power and land by hand. The 172 does not land itself.'),6);
    }else messaggio(t,4);
    aggiornaSchedaAP();
  }
}

// scheda AP: tasti dei modi (verde = attivo, contorno bianco = armato) e valori scelti, per chi usa il mouse
function aggiornaSchedaAP(){
  const on=ap.attivo,s=ap.stato();
  const acceso={ap:on,hdg:on&&ap.lat==='HDG',nav:on&&ap.lat==='NAV',apr:on&&(ap.lat==='LOC'||ap.vert==='GS'),alt:on&&ap.vert==='ALT',vs:on&&ap.vert==='VS'};
  const armato={nav:on&&ap.latArm==='NAV',apr:on&&(ap.latArm==='LOC'||ap.gsArm)};
  for(const b of document.querySelectorAll('[data-modo]')){
    const k=b.dataset.modo;b.classList.toggle('on',!!acceso[k]);b.classList.toggle('armato',!acceso[k]&&!!armato[k]);
  }
  const nomeLat={ROL:L('ali livellate (ROL)','wings level (ROL)'),GPS:L('rotta GPS','GPS course'),VOR:L('radiale VOR','VOR radial'),LOC:L('localizzatore','localizer')};
  nomeLat.HDG=L('prua','heading')+' '+String(ap.hdgSel).padStart(3,'0')+'°';
  let h=L('Autopilota spento','Autopilot off');
  if(on){
    const vert=s.vert==='ALT'?L('quota','altitude')+' '+ap.altTenuta+' ft':s.vert==='GS'?L('sentiero ILS','glide slope'):s.vert+' ft/min';
    h='<b>'+(nomeLat[s.lat]||s.lat)+'</b> · <b>'+vert+'</b>'+(s.armato?' · <span class="armato">'+s.armato+'</span>':'');
    if(s.limite)h+=' · <b class="ambra">'+(s.limite==='BASSA'?L('VEL. MINIMA','MIN SPEED'):L('VEL. MASSIMA','MAX SPEED'))+'</b>';
  }
  $('apStato').innerHTML=h;
  $('apHdg').textContent=String(ap.hdgSel).padStart(3,'0')+'°';
  $('apAlt').textContent=on||ap.altSel?ap.altSel+' ft':'-----';
  $('apVs').textContent=(ap.vsSel>0?'+':'')+ap.vsSel;
  $('apCdi').textContent='CDI '+nomeCdi();$('apCdi').classList.toggle('gps',cdi==='GPS');
  linguetta('ap').classList.toggle('acceso',on);
}
for(const b of document.querySelectorAll('[data-ap]'))b.addEventListener('click',()=>{
  const [k,v]=b.dataset.ap.split(':');
  if(k==='hdg')ap.cambiaPrua(+v);else if(k==='alt')ap.cambiaQuota(+v);else if(k==='vs')ap.cambiaVs(+v);else if(k==='sync')ap.pruaAttuale(st);
  aggiornaSchedaAP();b.blur();
});
$('apCdi').addEventListener('click',()=>{impostaCdi(cdi==='GPS'?'NAV1':'GPS');$('apCdi').blur();});
/* tasti dei modi: AP inserisce/stacca; HDG, NAV, APR, ALT e VS scelgono il modo (ad autopilota spento lo inseriscono
   anche). Tastiera: Maiusc+A AP, Maiusc+N NAV, Maiusc+L APR, Maiusc+C CDI */
function premiModo(modo){
  if(!avviato||inPausa||st.crashed) return;
  if(modo==='ap'){alternaAutopilota();return;}
  // APR: serve l'ILS su NAV1, e il CDI passa su LOC1 (come fa il G1000 quando ci si avvicina all'ILS)
  if(modo==='apr'&&nav.staz&&nav.staz.tipo==='ILS'&&cdi==='GPS')impostaCdi('NAV1');
  if(!ap.attivo){
    if(modo==='nav'||modo==='apr'){
      const n=navPerAP();
      if(n.assente||(modo==='apr')!==(n.fonte==='LOC')){messaggio(modo==='apr'?ap.modoApr(st,n):ap.modoNav(st,n),4);return;}
    }
    alternaAutopilota();if(!ap.attivo)return;if(modo==='hdg')return;   // inserito: è già in HDG
  }
  const r=modo==='hdg'?ap.modoHdg():modo==='alt'?ap.modoAlt(st):modo==='vs'?ap.modoVs(st):modo==='nav'?ap.modoNav(st,navPerAP()):ap.modoApr(st,navPerAP());
  if(r)messaggio(r,4);
  aggiornaSchedaAP();
}
for(const b of document.querySelectorAll('[data-modo]'))b.addEventListener('click',()=>{b.blur();premiModo(b.dataset.modo);});
function alternaAutopilota(){
  if(ap.attivo){staccaAP('');return;}
  const r=ap.inserisci(st,inp.elev);
  if(r){messaggio(r,3);return;}
  centraCloche();
  const hs=String(ap.hdgSel).padStart(3,'0');
  messaggio(L('Autopilota <b>inserito</b>: prua <b>'+hs+'°</b>, quota <b>'+ap.altSel+' ft</b>. La manetta resta a te.<br>A/D prua · W/S quota · Maiusc+W/S velocità verticale · Maiusc+A stacca',
    'Autopilot <b>engaged</b>: heading <b>'+hs+'°</b>, altitude <b>'+ap.altSel+' ft</b>. The throttle is still yours.<br>A/D heading · W/S altitude · Shift+W/S vertical speed · Shift+A disconnect'),6);
  aggiornaSchedaAP();
}
function staccaAP(motivo){
  if(!ap.attivo&&!motivo) return;
  ap.disinserisci();centraCloche();audio.apStacco();
  messaggio(L('Autopilota <b>disinserito</b>'+(motivo?': '+motivo:''),'Autopilot <b>disconnected</b>'+(motivo?': '+motivo:'')),3);
  aggiornaSchedaAP();
}
function tastoAutopilota(e){
  if(!avviato||st.crashed||inPausa) return false;
  if(e.shiftKey&&!e.repeat){
    const modo={KeyA:'ap',KeyN:'nav',KeyL:'apr'}[e.code];
    if(modo){premiModo(modo);return true;}
    if(e.code==='KeyC'){impostaCdi(cdi==='GPS'?'NAV1':'GPS');return true;}
  }
  if(!ap.attivo) return false;
  const c=e.code, picchia=c==='KeyW'||c==='ArrowUp', cabra=c==='KeyS'||c==='ArrowDown';
  if(picchia||cabra){if(e.shiftKey)ap.cambiaVs(cabra?100:-100);else ap.cambiaQuota(cabra?100:-100);aggiornaSchedaAP();return true;}
  if(c==='KeyA'||c==='ArrowLeft'||c==='KeyD'||c==='ArrowRight'){ap.cambiaPrua(c==='KeyA'||c==='ArrowLeft'?-1:1);aggiornaSchedaAP();return true;}
  if(e.shiftKey&&c==='KeyH'){ap.pruaAttuale(st);aggiornaSchedaAP();return true;}
  return false;
}
addEventListener('keydown',e=>{
  if(BLOCCA.includes(e.code))e.preventDefault();
  if(e.ctrlKey||e.metaKey||e.altKey) return;      // non interferire con le scorciatoie del browser
  audio.avvia();
  if(avviato&&!st.crashed&&!inPausa&&atc.tasto(e)){   // radio: T e, a menu aperto, le cifre
    e.preventDefault();
    if(atc.menuAperto)apriRadio();
    return;
  }
  if(tastoAutopilota(e)){e.preventDefault();return;}
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
    case 'KeyI':alternaScheda('piano');break;
    case 'KeyJ':alternaScheda('mappa');break;
    case 'KeyY':if(missioni.attiva)alternaScheda('missione');else messaggio(L('Nessuna missione: sceglila nel briefing (Esc).','No mission: choose one in the briefing (Esc).'),2.5);break;
    case 'KeyR':if(avviato)ricomincia();break;
    case 'Enter':case 'NumpadEnter':if(!avviato)inizia();else if(st.crashed)ricomincia();break;
    case 'Escape':{   // (il menu della radio, se aperto, lo chiude prima js/atc.js)
      const f=finestraAperta();
      if(f&&f!=='esito')chiudiFinestra(f);   // chiude la finestra in primo piano
      else apriBriefing();
      break;
    }
  }
});
addEventListener('keyup',e=>{tasti.delete(logico[e.code]||e.code);delete logico[e.code];});
addEventListener('blur',()=>{tasti.clear();for(const q in tieni)tieni[q]=false;});

// mouse/touch come cloche
let trascina=null;
const stickEl=$('stick'),knob=$('knob'),RAGGIO=75;
// il trascinamento riparte dalla posizione attuale della cloche, e al rilascio la cloche resta lì
/* tasto destro del mouse: guardarsi intorno (in cabina gira la testa, fuori ruota la telecamera
   attorno all'aereo); lasciando il tasto la vista torna dritta */
const sg={yaw:0,pitch:0};let sguardo=null;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  audio.avvia();
  if(e.button===2){
    sguardo={id:e.pointerId,x:e.clientX,y:e.clientY,yaw0:sg.yaw,pitch0:sg.pitch};
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    e.preventDefault();return;
  }
  if(e.pointerType==='mouse'&&e.button!==0) return;
  if(ap.attivo)staccaAP(L('hai preso la cloche','you took the stick'));
  trascina={id:e.pointerId,x:e.clientX,y:e.clientY,x0:cloche.x,y0:cloche.y};
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  stickEl.style.left=(e.clientX-cloche.x*RAGGIO)+'px';stickEl.style.top=(e.clientY-cloche.y*RAGGIO)+'px';stickEl.hidden=false;
  knob.style.transform=`translate(${cloche.x*RAGGIO}px,${cloche.y*RAGGIO}px)`;
});
canvas.addEventListener('pointermove',e=>{
  if(sguardo&&e.pointerId===sguardo.id){
    sg.yaw=clamp(sguardo.yaw0-(e.clientX-sguardo.x)*0.005,-2.7,2.7);
    sg.pitch=clamp(sguardo.pitch0-(e.clientY-sguardo.y)*0.005,-1.0,1.2);
    return;
  }
  if(!trascina||e.pointerId!==trascina.id) return;
  cloche.x=clamp(trascina.x0+(e.clientX-trascina.x)/RAGGIO,-1,1);
  cloche.y=clamp(trascina.y0+(e.clientY-trascina.y)/RAGGIO,-1,1);
  knob.style.transform=`translate(${cloche.x*RAGGIO}px,${cloche.y*RAGGIO}px)`;
});
const puntoCloche=$('puntoCloche');
const fineTrascina=e=>{
  if(sguardo&&e.pointerId===sguardo.id){sguardo=null;return;}
  if(trascina&&e.pointerId===trascina.id){trascina=null;stickEl.hidden=true;}
};
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
if(!pistaFinale())$('finale').hidden=true;
$('ancora').addEventListener('click',ricomincia);

function leggiGamepad(dt){
  pad.elev=pad.ail=pad.rud=pad.freno=0;
  const lista=navigator.getGamepads?navigator.getGamepads():[];
  for(const gp of lista){
    if(!gp) continue;
    const zm=v=>Math.abs(v||0)<0.08?0:v;
    pad.ail=zm(gp.axes[0]);pad.elev=zm(gp.axes[1]);pad.rud=zm(gp.axes[2]);
    if(ap.attivo&&(Math.abs(pad.ail)>0.3||Math.abs(pad.elev)>0.3))staccaAP(L('hai preso la cloche','you took the stick'));
    if(ap.attivo){pad.ail=pad.elev=0;}
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
  if(!ap.attivo){cloche.y=clamp(cloche.y+ty*VEL*dt,-1,1);cloche.x=clamp(cloche.x+tx*VEL*dt,-1,1);}
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
    atc.evento(e,st,ctxATC());
    if(e.tipo==='decollo'){
      atterratoA=null;
      if(rull){rull=null;aggiornaPiano();}
      const pv=T.pistaVicina(e.x,e.z,80);
      libretto.decollo({mondo:window.MONDO_SCELTO,da:pv?pv.pista.ap.codice:L('fuori campo','off-field'),ora:oraVolo});
      messaggio(pv?L(`Decollo da <b>${pv.pista.ap.codice}</b>: buon volo!`,`Take-off from <b>${pv.pista.ap.codice}</b>: have a good flight!`):L('Decollo!','Take-off!'),3);
    }else if(e.tipo==='atterraggio'){
      const fpm=-e.vs*FPM;
      audio.colpo(clamp(fpm/700,0,1));
      const giudizio=fpm<120?L('Burro! Atterraggio perfetto','Butter! Perfect landing'):fpm<250?L('Ottimo atterraggio','Great landing'):fpm<450?L('Buon atterraggio','Good landing'):L('Atterraggio duro','Hard landing');
      const pv=e.suolo==='pista'?T.pistaVicina(e.x,e.z,0):null;
      const pa=T.pistaVicina(e.x,e.z,30);   // anche le piste in erba
      atterratoA=pa?pa.pista.ap:null;
      let txt=`<b>${giudizio}</b> — ${Math.round(fpm)} ft/min`;
      if(pv){
        assi();
        const te=pv.pista.testate.find(t=>t.dir.x*fwd.x+t.dir.z*fwd.z>0)||pv.pista.testate[0];
        const dalla=(e.x-te.x)*te.dir.x+(e.z-te.z)*te.dir.z;
        txt+=L(`<br>${pv.pista.ap.codice} pista ${te.nome}: ${Math.round(dalla)} m dalla soglia, ${Math.abs(pv.v).toFixed(1)} m dalla linea centrale`,
              `<br>${pv.pista.ap.codice} runway ${te.nome}: ${Math.round(dalla)} m past the threshold, ${Math.abs(pv.v).toFixed(1)} m from the centre line`);
        if(pv.pista.ap===dest()) txt+=L('<br><b>Destinazione raggiunta!</b>','<br><b>Destination reached!</b>');
      }else txt+=e.suolo==='erba'?L('<br>Fuori pista, sull\'erba','<br>Off the runway, on the grass'):L('<br>Fuori pista','<br>Off the runway');
      // pista toccata (anche in erba): per il libretto e per la missione
      const pr=T.pistaVicina(e.x,e.z,0);
      libretto.atterraggio({ap:pa?pa.pista.ap.codice:'',fpm,giudizio,suPista:!!pr});
      if(missioni.inCorso){
        let dalla=0,lat=0,teT=null;
        if(pr){
          assi();
          teT=pr.pista.testate.find(t=>t.dir.x*fwd.x+t.dir.z*fwd.z>0)||pr.pista.testate[0];
          dalla=(e.x-teT.x)*teT.dir.x+(e.z-teT.z)*teT.dir.z;lat=Math.abs(pr.v);
        }
        const r=missioni.atterraggio({ap:pr?pr.pista.ap:null,suPista:!!pr,fpm,dalla,lat,W:pr?pr.pista.W:0,kt:e.ias*KT,te:teT});
        if(r){
          txt+='<br>'+r.msg;
          if(r.dest){daPiano=teT?{ap:pr.pista.ap,te:teT}:null;impostaDest(T.aeroporti.indexOf(r.dest));}
          $('missioneCorpo').innerHTML=missioni.pannello();
        }
      }
      messaggio(txt,8);
    }else if(e.tipo==='senzaCarburante'){
      messaggio(L('<b>Motore spento: carburante esaurito!</b><br>Tieni circa 65 nodi (miglior planata) e cerca un campo o una pista vicina.',
                '<b>Engine stopped: out of fuel!</b><br>Hold about 65 knots (best glide) and look for a field or a nearby runway.'),10);
    }else if(e.tipo==='incidente'){
      audio.colpo(1);
      libretto.chiudi('incidente');
      missioni.incidente();
      mostraIncidente(e.motivo);
      if(missioni.daMostrare()){missioni.esito();libretto.missione(missioni.risultato());
        $('crashMsg').textContent+=' '+L('La missione è fallita: R per riprovare.','The mission failed: R to try again.');}
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
const qYaw=new THREE.Quaternion(),qPitch=new THREE.Quaternion(),asseX=new THREE.Vector3(1,0,0);
function aggiornaCamera(dt){
  assi();
  if(!sguardo){const r=Math.exp(-dt*3);sg.yaw*=r;sg.pitch*=r;if(Math.abs(sg.yaw)<0.002)sg.yaw=0;if(Math.abs(sg.pitch)<0.002)sg.pitch=0;}
  if(vista===1){
    const cab=mondo.aereo.cabina;
    camera.position.copy(cab.occhio).applyQuaternion(st.q).add(st.pos);
    qYaw.setFromAxisAngle(Y,sg.yaw);qPitch.setFromAxisAngle(asseX,sg.pitch);
    camera.quaternion.copy(st.q).multiply(qYaw).multiply(qPitch).multiply(sguardoGiu);   // testa girata, poi sguardo un po' in basso
    impostaFov(fovCabina);
  }else if(vista===2&&mondo.torri.length){
    const t=torreVicina();
    camera.position.copy(t.pos);camera.up.set(0,1,0);camera.lookAt(st.pos);
    const d=t.pos.distanceTo(st.pos);
    impostaFov(clamp(2*Math.atan(22/Math.max(d,1))*R2D,2,60));
  }else{
    const orizz=Math.hypot(fwd.x,fwd.z)>0.2;
    const giro=Math.abs(sg.yaw)>0.01||Math.abs(sg.pitch)>0.01;
    if(giro&&orizz){ // tasto destro: la telecamera gira attorno all'aereo
      const az=Math.atan2(fwd.x,-fwd.z)+Math.PI-sg.yaw, el=clamp(0.24+sg.pitch,-0.05,1.4);
      bersaglio.set(st.pos.x+Math.sin(az)*Math.cos(el)*18,st.pos.y+Math.sin(el)*18,st.pos.z-Math.cos(az)*Math.cos(el)*18);
    }else bersaglio.copy(st.pos).addScaledVector(fwd,-18).addScaledVector(Y,orizz?4.5:0).addScaledVector(su,orizz?0:4.5);
    const gCam=T.suolo(bersaglio.x,bersaglio.z)+2;
    if(bersaglio.y<gCam)bersaglio.y=gCam;
    if(primaCamera)camera.position.copy(bersaglio);
    else camera.position.lerp(bersaglio,1-Math.exp(-dt*(st.crashed?0.5:4)));
    if(giro&&orizz)guarda.copy(st.pos);else guarda.copy(st.pos).addScaledVector(fwd,6).addScaledVector(Y,-2.5);
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
    nav:cdi==='GPS'?misuraGPS():misuraNav(), ap:ap.stato(),
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
    else if(minimiFino>tempo)w=L('MINIMI','MINIMUMS');
    else if(st.aTerra&&st.gs*KT>15&&sulPiazzale())w=L('RULLA PIÙ PIANO','TAXI SLOWER');
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
  if(!avviato&&typeof preparaMissione==='function')preparaMissione(true);
}
/* ---------- missione scelta nel briefing (ricordata) ---------- */
const selMis=$('selMissione');
try{const s=localStorage.getItem('volo-missione');if(s&&[...selMis.options].some(o=>o.value===s))selMis.value=s;}catch(e){}
// stessoGiro: nei giri a tappe tiene le tappe già estratte (se la partenza è la stessa)
function preparaMissione(stessoGiro){
  missioni.prepara(selMis.value,{partenza,dest:dest(),finale:pistaFinale()},stessoGiro);
  const tipo=missioni.tipo,box=$('briefMissione');
  box.hidden=tipo==='libero';
  box.innerHTML=missioni.descrizione()+(tipo.startsWith('tappe')&&missioni.attiva?` <button type="button" id="altroGiro" class="piccolo">${L('Altro giro','Another tour')}</button>`:'');
  const ag=$('altroGiro');if(ag)ag.addEventListener('click',()=>{preparaMissione(false);});
  // nei giri e nella missione a tempo la mappa e il piano puntano alla prima tappa
  const p=missioni.attiva&&tipo!=='precisione'?missioni.prossima():null;
  if(p&&p!==dest()){impostaDest(T.aeroporti.indexOf(p));return;}   // riscrive il briefing (e ripassa da qui)
  $('finale').hidden=tipo!=='libero'||!pistaFinale();
  $('inizia').innerHTML=tipo==='precisione'?L('Inizia in finale (Invio)','Start on final (Enter)'):L('Decolla (Invio)','Take off (Enter)');
  linguetta('missione').hidden=!missioni.attiva;
  if(!missioni.attiva&&scheda==='missione')mostraScheda('mappa');
  $('missioneCorpo').innerHTML=missioni.pannello();
}
selMis.addEventListener('change',()=>{try{localStorage.setItem('volo-missione',selMis.value);}catch(e){}preparaMissione(false);selMis.blur();});
const selMondo=$('selMondo'),selAp=$('selAeroporto'),selPista=$('selPista'),selDB=$('selDestBrief'),selD=$('selDest');
selMondo.value=window.MONDO_SCELTO||'piemonte';
selMondo.addEventListener('change',()=>{location.search='?mappa='+selMondo.value;});
const selLingua=$('selLingua');
selLingua.value=SIM.lingua;
selLingua.addEventListener('change',()=>SIM.cambiaLingua(selLingua.value));
const opzioniAeroporti=sel=>{sel.innerHTML=T.aeroporti.map((a,i)=>`<option value="${i}">${a.codice} – ${a.nome}</option>`).join('');};
for(const sel of [selAp,selDB,selD])opzioniAeroporti(sel);
function impostaDest(i){destIdx=i;selDB.value=selD.value=String(i);aggiornaBriefing();}
/* fermi dopo un atterraggio: l'aeroporto diventa la partenza del volo successivo (si continua lo stesso volo:
   carburante e posizione restano; R da qui in poi riparte da questo aeroporto) */
function sulPiazzale(){T.suolo(st.pos.x,st.pos.z);return T.tipo==='piazzale';}
function nuovaPartenza(ap){
  let te=testataControvento(ap);
  partenza=creaPartenza(ap,te);te=partenza.te;modalita='decollo';daPiano=null;
  rull=partenza.parcheggio?{punti:partenza.percorso,i:1}:null;
  selAp.value=String(T.aeroporti.indexOf(ap));riempiPiste(ap,te);
  if(dest()===ap){ // arrivati a destinazione: si propone l'aeroporto più vicino come prossima tappa
    let best=-1,bd=Infinity;
    T.aeroporti.forEach((a,i)=>{if(a===ap)return;const d=Math.hypot(a.x-ap.x,a.z-ap.z);if(d<bd){bd=d;best=i;}});
    if(best>=0)destIdx=best;
  }
  impostaDest(destIdx);
  atc.reset(ctxATC());
  const d=dest();
  messaggio(L(`Sei fermo a <b>${ap.codice}</b>. Prossima destinazione: <b>${d?d.codice:'—'}</b> (cambiala con N o il menu DEST).<br>Rulla fino alla pista <b>${te.nome}</b> e chiedi il decollo alla torre (T).`,
              `You are stopped at <b>${ap.codice}</b>. Next destination: <b>${d?d.codice:'—'}</b> (change it with N or the DEST menu).<br>Taxi to runway <b>${te.nome}</b> and ask the tower for take-off clearance (T).`),10);
  if(partenza.parcheggio)setTimeout(messaggioPartenza,10500);
}
function riempiPiste(ap,scelta){
  const opz=[];
  ap.piste.forEach((pi,i)=>pi.testate.forEach((t,j)=>opz.push(`<option value="${i}|${j}">${t.nome} (${pi.L} m${pi.erba?L(', erba',', grass'):''})</option>`)));
  selPista.innerHTML=opz.join('');
  if(scelta){const i=ap.piste.indexOf(scelta.pista);selPista.value=i+'|'+scelta.pista.testate.indexOf(scelta);}
}
function scegliPartenza(){
  const ap=T.aeroporti[+selAp.value];
  const [i,j]=selPista.value.split('|').map(Number);
  partenza=creaPartenza(ap,ap.piste[i]&&ap.piste[i].testate[j]);
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
  // sintonizzare NAV1 porta il CDI su NAV1 (spegnerlo lo riporta sul GPS); in NAV o APR cambia la sorgente
  const eraNav=ap.attivo&&(ap.lat==='NAV'||ap.lat==='LOC');
  if(cdi==='NAV1')ap.sorgenteCambiata(st);
  impostaCdi(s?'NAV1':'GPS',true);
  ap.eventi.length=0;   // l'avviso dell'autopilota va nel messaggio della sintonia, qui sotto
  const nota=eraNav&&ap.lat==='ROL'?L('<br>Sorgente cambiata: autopilota in <b>ROL</b> (ali livellate); ripremi NAV o APR.','<br>Source changed: autopilot in <b>ROL</b> (wings level); press NAV or APR again.'):'';
  if(!s){messaggio(L('NAV1 spento','NAV1 off')+nota,nota?4:1.5);return;}
  const m=radio.misura(s,st.pos,nav.crs);
  messaggio(`NAV1: <b>${s.freq.toFixed(2)} ${s.id}</b> ${s.nome}${m.ricevuto?'':L(' — <b>fuori portata</b>',' — <b>out of range</b>')}`+
    (s.tipo==='VOR'?`<br>CRS ${String(nav.crs).padStart(3,'0')}° `+L('(diretto alla stazione) · cambialo con , e .','(direct to the station) · change it with , and .')
                  :`<br>${L('localizzatore','localizer')} ${String(Math.round(s.crs)).padStart(3,'0')}° · ${L('sentiero','glide slope')} 3°`)+nota,nota?6:4);
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
const selDa=$('selPartenzaDa');
selDa.value=daParcheggio?'parcheggio':'pista';
selDa.addEventListener('change',()=>{daParcheggio=selDa.value==='parcheggio';try{localStorage.setItem('volo-partenza-da',selDa.value);}catch(e){}scegliPartenza();selDa.blur();});
const selOra=$('selOra');
selOra.value=oraVolo;
selOra.addEventListener('change',()=>{oraVolo=selOra.value;notte.imposta(oraVolo);try{localStorage.setItem('volo-ora',oraVolo);}catch(e){}selOra.blur();});
const selCarb=$('selCarb');
if(![...selCarb.options].some(o=>+o.value===carbIniziale))carbIniziale=A.carburante.capacita;
selCarb.value=String(carbIniziale);
selCarb.addEventListener('change',()=>{
  carbIniziale=+selCarb.value;st.carburante=carbIniziale;
  try{localStorage.setItem('volo-carburante',String(carbIniziale));}catch(e){}
  selCarb.blur();
});

/* striscia dell'obiettivo (in alto al centro) e scheda MISSIONE */
let ultimoPannelloMis='';
function aggiornaObiettivo(){
  const s=avviato?missioni.striscia():'',o=$('obiettivo');
  o.hidden=!s;if(s&&o.innerHTML!==s)o.innerHTML=s;
  document.body.classList.toggle('con-obiettivo',!!s);
  if(scheda==='missione'&&n%30===0){const h=missioni.pannello();if(h!==ultimoPannelloMis){ultimoPannelloMis=h;$('missioneCorpo').innerHTML=h;}}
}

/* ---------- ciclo principale ---------- */
preparaMissione(true);
mostraScheda(scheda);
ricomincia();
aggiornaVento(0);
// scorciatoie per le prove: index.html#salta (salta il briefing), #vista=1 (cabina)
SIM.debug={st,fis,terreno,monumenti,scene,atc,renderer,camera,missioni,libretto};  // utile dalla console del browser (F12)
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
    if(ap.attivo){   // l'autopilota comanda equilibratore e alettoni (il timone resta al pilota)
      const c=ap.comanda(st,dt,navPerAP());eventiAP();
      if(c){inp.elev=c.elev;inp.ail=c.ail;puntoCloche.style.transform=`translate(${inp.ail*17}px,${inp.elev*17}px)`;}
      else staccaAP(ap.staccato);
    }
    const passi=Math.max(1,Math.ceil(dt*240)),h=dt/passi;
    for(let i=0;i<passi;i++)fis.passo(h,inp,vento);
    libretto.aggiorna(dt,st);
    const mm=missioni.aggiorna(dt);if(mm)messaggio(mm,6);
  }
  gestisciEventi();
  aggiornaCamera(dt);
  terreno.aggiorna(camera.position.x,camera.position.z,false);
  if(monumenti&&n%10===0)monumenti.aggiorna(camera.position,terreno.vicino());
  if(attivo&&n%15===0){
    atc.aggiorna(st,ctxATC());
    if(daParcheggio&&atterratoA&&atterratoA.rullaggioVero&&SIM.reteRullaggio&&st.aTerra&&st.gs<12&&!rull){   // percorso verso il piazzale
      const pts=SIM.reteRullaggio.versoPiazzale(atterratoA,st.pos);if(pts){rull={punti:pts,i:1};aggiornaPiano();}
    }
    const alPiazzale=()=>atterratoA.rullaggioVero&&SIM.reteRullaggio?SIM.reteRullaggio.suPiazzale(st.pos.x,st.pos.z):sulPiazzale();
    if(atterratoA&&st.aTerra&&st.gs<1.5&&!st.crashed&&atc.libero&&(!daParcheggio||alPiazzale())){const ap=atterratoA;atterratoA=null;nuovaPartenza(ap);}
    // missione finita: il risultato quando l'aereo è fermo
    if(missioni.daMostrare()&&st.aTerra&&st.gs<1&&!st.crashed)mostraEsito();
  }
  if(n%15===0)controllaRadio(attivo?0.25:0);
  if(n%15===0&&scheda==='ap')aggiornaSchedaAP();
  if(n%6===0)aggiornaObiettivo();
  mondo.aggiorna(st,camera.position,vento,attivo?dt:0,vista===1);
  notte.aggiorna(camera.position);
  if(n%2===0)ultimiStrum=aggiornaStrumenti(dt*2);
  if(n%6===0){aggiornaPiano();aggiornaTesti(ultimiStrum.hdg,ultimiStrum.bug);strum.disegnaMappa(st,ultimiStrum.hdg,dest());}
  audio.aggiorna(st,!attivo);
  renderer.render(scene,camera);
  n++;
}
requestAnimationFrame(ciclo);
})();
