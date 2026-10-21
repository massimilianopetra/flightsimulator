/* =====================================================================
   Volo — simulatore di volo nel browser
   Autore: Massimiliano Petra <massimiliano.petra@gmail.com>
   Copyright (C) 2026 Massimiliano Petra
   Licenza: GNU General Public License versione 3 o successiva
   (GPL-3.0-or-later). Questo programma è software libero: puoi
   ridistribuirlo e/o modificarlo secondo i termini della GNU GPL
   pubblicata dalla Free Software Foundation, versione 3 o (a tua scelta)
   qualunque versione successiva. È distribuito SENZA ALCUNA GARANZIA.
   Testo completo nel file LICENSE.
   ---------------------------------------------------------------------
   MAPPE (mappe.html), in una scheda a parte, aperta dal pulsante MAPPE del
   simulatore. Due viste:
   - MAPPA GRANDE: la stessa mappa della minimappa (js/strumenti.js) a tutto
     schermo, collegata al volo: aereo, rotta, traffico, traccia percorsa;
     si sposta trascinando e si ingrandisce con la rotella.
   - AEROPORTO: carta dell'aeroporto scelto (piste, vie di rullaggio con i
     nomi, piazzali, piazzole, edifici, torre, punti attesa, PAPI), dati
     (piste, frequenze, ILS, VOR vicini, carburante, METAR se c'è il meteo)
     e per ogni pista l'avvicinamento: circuito, profilo di discesa a 3° con
     le quote miglio per miglio e il rilievo sotto. Tutto SIMULATO: non sono
     le carte ufficiali e non servono per volare davvero.
   Collegamento: il simulatore manda lo stato 5 volte al secondo con postMessage
   (js/main.js, inviaMappe); questa pagina, finché non riceve niente, manda
   "ciao" alla finestra che l'ha aperta e sul BroadcastChannel 'volo-mappe'.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM, L=SIM.L, T=SIM.terreno;
const D2R=Math.PI/180, FT=3.28084, NM=1852;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const MONO='"B612 Mono",monospace', UI='"B612",system-ui,sans-serif';
const tre=n=>String(Math.round(((n%360)+360)%360)||360).padStart(3,'0');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const strum=SIM.creaStrumenti(window.AEREO,{chiaveZoom:'volo-mappe-zoom',chiaveOrient:'volo-mappe-orient'});
const radio=SIM.creaRadio(T);
strum.impostaRadio(radio);
const apDi=c=>T.aeroporti.find(a=>a.codice===c)||null;
const parametro=k=>{const m=new RegExp('[?&]'+k+'=([\\w-]+)').exec(location.search);return m?m[1]:null;};

/* ---------- stato del volo ricevuto dal simulatore ---------- */
let stato=null,ultimoArrivo=0;
const traccia=[];
SIM.traffico={lista:()=>stato&&stato.traffico||[]};   // la mappa di strumenti.js disegna il traffico da qui
function ricevi(d){
  if(!d||d.voloMappe!=='stato') return;
  if(d.mondo&&d.mondo!==(window.MONDO_SCELTO||'piemonte')){   // il simulatore vola in un altro mondo: si ricarica
    location.search='?mappa='+d.mondo+(apScelto?'&ap='+apScelto.codice:'');return;
  }
  const primo=!stato;
  stato=d;ultimoArrivo=Date.now();
  // traccia: un punto ogni 150 m; se l'aereo "salta" (ricomincia, nuova partenza) si riparte da capo
  const u=traccia[traccia.length-1];
  if(u&&Math.hypot(u.x-d.x,u.z-d.z)>8000)traccia.length=0;
  if(d.avviato&&(!u||Math.hypot(u.x-d.x,u.z-d.z)>150)){traccia.push({x:d.x,z:d.z});if(traccia.length>6000)traccia.splice(0,1000);}
  if(primo&&!apScelto&&d.dest)scegliAp(apDi(d.dest),false);
  if(primo&&scheda==='aeroporto')disegnaAeroporto();
  pannelloVolo();
  chiediDisegno();
}
addEventListener('message',e=>ricevi(e.data));
let canale=null;try{if(window.BroadcastChannel){canale=new BroadcastChannel('volo-mappe');canale.onmessage=e=>ricevi(e.data);}}catch(e){}
// finché non arriva niente ci si fa sentire (anche dopo che il simulatore è stato ricaricato)
setInterval(()=>{
  const collegato=Date.now()-ultimoArrivo<3000;
  $('stato').className='stato '+(collegato?'si':'no');
  $('stato').innerHTML=collegato?L('● collegato al volo','● linked to the flight'):L('○ non collegato: apri questa pagina dal pulsante MAPPE del simulatore','○ not linked: open this page from the MAPS button of the simulator');
  if(collegato) return;
  try{if(window.opener)window.opener.postMessage({voloMappe:'ciao'},'*');}catch(e){}
  try{if(canale)canale.postMessage({voloMappe:'ciao'});}catch(e){}
},1000);

/* ---------- schede: mappa grande / aeroporto ---------- */
let scheda=location.hash==='#aeroporto'?'aeroporto':'grande';
function mostra(s){
  scheda=s;history.replaceState(null,'',location.pathname+location.search+'#'+s);
  for(const b of document.querySelectorAll('[data-scheda]'))b.classList.toggle('attiva',b.dataset.scheda===s);
  $('vistaGrande').hidden=s!=='grande';$('vistaAeroporto').hidden=s!=='aeroporto';
  if(s==='grande'){ridimensiona();chiediDisegno();}else disegnaAeroporto();
}
for(const b of document.querySelectorAll('[data-scheda]'))b.addEventListener('click',()=>{mostra(b.dataset.scheda);b.blur();});

/* ---------- scelta dell'aeroporto ---------- */
const selAp=$('selAp');
selAp.innerHTML=T.aeroporti.map((a,i)=>`<option value="${i}">${esc(a.codice)} – ${esc(a.nome)}</option>`).join('');
let apScelto=null;
function scegliAp(ap,centra){
  if(!ap) return;
  apScelto=ap;selAp.value=String(T.aeroporti.indexOf(ap));
  testataScelta=null;
  if(centra){segui=false;centro={x:ap.x,z:ap.z};chiediDisegno();}
  if(scheda==='aeroporto')disegnaAeroporto();
}
selAp.addEventListener('change',()=>{scegliAp(T.aeroporti[+selAp.value],true);selAp.blur();});

/* =====================================================================
   MAPPA GRANDE
   ===================================================================== */
const cv=$('grande'),g=cv.getContext('2d');
let W=0,H=0,dpr=1,segui=true,centro=null,daDisegnare=false;
function ridimensiona(){
  dpr=Math.min(2,window.devicePixelRatio||1);
  const r=cv.getBoundingClientRect();W=r.width;H=r.height;
  cv.width=Math.max(1,Math.round(W*dpr));cv.height=Math.max(1,Math.round(H*dpr));
}
addEventListener('resize',()=>{ridimensiona();chiediDisegno();if(scheda==='aeroporto')disegnaAeroporto();});
function chiediDisegno(){if(!daDisegnare){daDisegnare=true;requestAnimationFrame(disegnaGrande);}}
function disegnaGrande(){
  daDisegnare=false;
  if(scheda!=='grande') return;
  if(!W)ridimensiona();
  const c0=centro||(apScelto?{x:apScelto.x,z:apScelto.z}:{x:0,z:0});
  const s=stato?{pos:{x:stato.x,y:stato.y,z:stato.z}}:{pos:{x:c0.x,y:0,z:c0.z}};
  strum.impostaRotta(stato&&stato.rotta||null);
  strum.disegnaMappa(s,stato?stato.hdg:0,stato&&stato.dest?apDi(stato.dest):null,
    {g,W,H,dpr,centro:stato&&!segui?c0:null,traccia:stato?traccia:null,senzaAereo:!stato});
  $('segui').classList.toggle('attivo',segui);
  $('scalaGrande').textContent=strum.scale()[strum.zoom];
  $('orientGrande').textContent=strum.orientamento==='prua'?L('PRUA ↑','HDG ↑'):L('NORD ↑','NORTH ↑');
}
// trascinare sposta la mappa (e smette di seguire l'aereo); la rotella cambia la scala
let presa=null;
cv.addEventListener('pointerdown',e=>{presa={x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId);});
cv.addEventListener('pointermove',e=>{
  if(!presa) return;
  const dx=e.clientX-presa.x,dy=e.clientY-presa.y;presa={x:e.clientX,y:e.clientY};
  if(!dx&&!dy) return;
  const k=W/strum.rangeMappa(),rot=strum.orientamento==='prua'&&stato?stato.hdg*D2R:0,c=Math.cos(rot),sn=Math.sin(rot);
  const base=centro&&(!segui||!stato)?centro:stato?{x:stato.x,z:stato.z}:(apScelto?{x:apScelto.x,z:apScelto.z}:{x:0,z:0});
  centro={x:base.x-(dx*c-dy*sn)/k,z:base.z-(dx*sn+dy*c)/k};segui=false;chiediDisegno();
});
cv.addEventListener('pointerup',()=>{presa=null;});
cv.addEventListener('wheel',e=>{e.preventDefault();if(e.deltaY<0)strum.zoomPiu();else strum.zoomMeno();chiediDisegno();},{passive:false});
$('zoomPiu').addEventListener('click',()=>{strum.zoomPiu();chiediDisegno();});
$('zoomMeno').addEventListener('click',()=>{strum.zoomMeno();chiediDisegno();});
$('orientGrande').addEventListener('click',()=>{strum.cambiaOrientamento();chiediDisegno();});
$('segui').addEventListener('click',()=>{segui=true;centro=null;chiediDisegno();});
$('cancellaTraccia').addEventListener('click',()=>{traccia.length=0;chiediDisegno();});

// riquadro con i dati del volo
function pannelloVolo(){
  const p=$('datiVolo');
  if(!stato){p.hidden=true;return;}
  p.hidden=false;
  const d=stato.dest?apDi(stato.dest):null,dist=d?Math.hypot(d.x-stato.x,d.z-stato.z)/NM:null;
  const riga=(k,v,u)=>`<div><span class="k">${k}</span><b>${v}</b>${u?`<span class="u">${u}</span>`:''}</div>`;
  p.innerHTML=`<div class="titolo">${esc(stato.reg)} · ${esc(stato.aereo)}${stato.pausa?` <span class="pausa">${L('PAUSA','PAUSED')}</span>`:''}${stato.crashed?` <span class="pausa">${L('INCIDENTE','CRASH')}</span>`:''}</div>`+
    riga('IAS',Math.round(stato.ias),'kt')+riga('GS',Math.round(stato.gs),'kt')+
    riga('ALT',Math.round(stato.alt/10)*10,'ft')+riga('VS',(stato.vs>=0?'+':'')+Math.round(stato.vs/10)*10,'ft/min')+
    riga(L('PRUA','HDG'),tre(stato.hdg)+'°','')+
    (d?riga('DEST',esc(d.codice),dist.toFixed(1)+' NM'):'')+
    riga(L('CARB','FUEL'),stato.carb.toFixed(1),stato.unCarb)+
    (stato.meteo&&stato.meteo.attivo?riga(L('VENTO','WIND'),stato.meteo.ventoNodi<1?L('calmo','calm'):tre(stato.meteo.ventoDa)+'/'+stato.meteo.ventoNodi+(stato.meteo.raffiche>=10?'G'+(stato.meteo.ventoNodi+stato.meteo.raffiche):''),'kt'):'');
}

/* =====================================================================
   AEROPORTO: carta, dati, avvicinamento
   ===================================================================== */
const cc=$('carta'),gc=cc.getContext('2d');
let testataScelta=null;
const a3=c=>window.AEROPORTI3D&&window.AEROPORTI3D[c]||null;
const anello=(ap,a)=>{const o=[];for(let i=0;i<a.length;i+=2)o.push({x:ap.x+a[i]/10,z:ap.z-a[i+1]/10});return o;};
// frequenze: le vere da dati/piemonte-radio.js, altrimenti simulate come in js/atc.js
function frequenze(ap){
  const vere=((window.RADIO&&window.RADIO.com)||[]).filter(c=>c.ap===ap.codice).map(c=>({tipo:c.tipo,nome:c.nome,freq:c.freq,vera:true}));
  if(!vere.some(c=>c.tipo==='TWR'||c.tipo==='INFO'||c.tipo==='RADIO')){
    const i=T.aeroporti.indexOf(ap),p=ap.piste[0],torre=!p.erba&&p.L>=1000;
    let f=(118+((i*7)%160)*0.025).toFixed(3);if(f==='121.500')f='121.525';
    vere.unshift({tipo:torre?'TWR':'RADIO',nome:ap.nome.replace(/\s*\(.*\)/,'').replace(/-/g,' ')+(torre?' Tower':' Radio'),freq:f,vera:false});
  }
  const ord={TWR:0,GND:1,INFO:2,RADIO:3};
  return vere.sort((a,b)=>(ord[a.tipo]??9)-(ord[b.tipo]??9));
}
// circuito di traffico come in js/traffico.js: a sinistra se le colline lo permettono, altrimenti a destra (0 = nessuno)
function latoCircuito(te){
  const p=te.pista,q=p.quota,D=1400,lx=te.dir.z,lz=-te.dir.x;
  for(const s of [1,-1]){
    let max=-1e9;
    for(let u=-2400;u<=p.L+1000;u+=200)for(const v of [D*0.5,D,D*1.3]){
      const x=te.x+te.dir.x*u+lx*v*s,z=te.z+te.dir.z*u+lz*v*s;max=Math.max(max,T.terrainH(x,z));}
    if(max<q+150) return s;
  }
  return 0;
}
// la testata più controvento (col vento del volo, se c'è)
function testataControvento(ap){
  const v=stato&&stato.meteo?stato.meteo.ventoDa:null;
  const tutte=ap.piste.flatMap(p=>p.testate);
  if(v==null) return tutte[0];
  return tutte.reduce((a,b)=>Math.cos((b.hdg-v)*D2R)+(b.pista===ap.piste[0]?0.15:0)>Math.cos((a.hdg-v)*D2R)+(a.pista===ap.piste[0]?0.15:0)?b:a);
}

function disegnaAeroporto(){
  const ap=apScelto||(stato&&stato.dest&&apDi(stato.dest))||T.aeroporti[0];
  if(!apScelto)scegliAp(ap,false);
  const te=testataScelta&&testataScelta.pista.ap===ap?testataScelta:testataControvento(ap);
  testataScelta=te;
  disegnaCarta(ap);
  schedaDati(ap,te);
}

/* ---------- la carta: vista dall'alto col nord in alto, ingrandibile ---------- */
const vista={ap:null,zoom:1,cx:0,cz:0,c0x:0,c0z:0,kFit:1,SX:0,SY:0};
function zoomCarta(f,mx,my){
  if(!vista.ap) return;
  const k=vista.kFit*vista.zoom;
  if(mx==null){mx=vista.SX;my=vista.SY;}
  const wx=vista.cx+(mx-vista.SX)/k,wz=vista.cz+(my-vista.SY)/k;   // il punto sotto il mouse resta fermo
  vista.zoom=clamp(vista.zoom*f,1,60);
  const k2=vista.kFit*vista.zoom;
  vista.cx=wx-(mx-vista.SX)/k2;vista.cz=wz-(my-vista.SY)/k2;
  if(vista.zoom===1){vista.cx=vista.c0x;vista.cz=vista.c0z;}
  disegnaCarta(vista.ap);
}
cc.addEventListener('wheel',e=>{e.preventDefault();const r=cc.getBoundingClientRect();zoomCarta(e.deltaY<0?1.25:0.8,e.clientX-r.left,e.clientY-r.top);},{passive:false});
let presaC=null;
cc.addEventListener('pointerdown',e=>{presaC={x:e.clientX,y:e.clientY};cc.setPointerCapture(e.pointerId);});
cc.addEventListener('pointermove',e=>{
  if(!presaC||!vista.ap) return;
  const k=vista.kFit*vista.zoom;vista.cx-=(e.clientX-presaC.x)/k;vista.cz-=(e.clientY-presaC.y)/k;presaC={x:e.clientX,y:e.clientY};
  disegnaCarta(vista.ap);
});
cc.addEventListener('pointerup',()=>{presaC=null;});
cc.addEventListener('dblclick',()=>{if(vista.ap){vista.zoom=1;vista.cx=vista.c0x;vista.cz=vista.c0z;disegnaCarta(vista.ap);}});
$('cartaPiu').addEventListener('click',()=>zoomCarta(1.5));
$('cartaMeno').addEventListener('click',()=>zoomCarta(1/1.5));
$('cartaTutta').addEventListener('click',()=>{if(vista.ap){vista.zoom=1;vista.cx=vista.c0x;vista.cz=vista.c0z;disegnaCarta(vista.ap);}});
function disegnaCarta(ap){
  const dp=Math.min(2,window.devicePixelRatio||1),r=cc.getBoundingClientRect(),CW=r.width,CH=r.height;
  if(!CW||!CH) return;
  cc.width=Math.round(CW*dp);cc.height=Math.round(CH*dp);
  const c=gc;c.setTransform(dp,0,0,dp,0,0);
  const rete=SIM.reteRullaggio&&SIM.reteRullaggio.di(ap),d3=a3(ap.codice);
  const piste=T.piste.filter(p=>p.ap===ap);
  // estensione: piste, vie, piazzali, edifici
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  const allarga=(x,z)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);};
  for(const p of piste)for(const t of p.testate)allarga(t.x,t.z);
  if(rete){for(const v of rete.vie)for(const q of v.pts)allarga(q.x,q.z);for(const a of rete.piazzali)for(const q of a)allarga(q.x,q.z);}
  if(d3&&d3.edifici)for(const e of d3.edifici)for(const q of anello(ap,e.p))if(Math.hypot(q.x-ap.x,q.z-ap.z)<3500)allarga(q.x,q.z);
  if(!rete){const p=ap.piste[0];for(const u of [-90,90])for(const v of [70,145])allarga(p.cx+p.dir.x*u-p.dir.z*v,p.cz+p.dir.z*u+p.dir.x*v);}
  const marg=120;x0-=marg;x1+=marg;z0-=marg;z1+=marg;
  const TOP=54,BOT=34;
  // vista: tutto l'aeroporto, poi si ingrandisce (rotella, pulsanti) e si sposta (trascinando)
  const kFit=Math.min((CW-40)/(x1-x0),(CH-TOP-BOT)/(z1-z0));
  if(vista.ap!==ap)Object.assign(vista,{ap,zoom:1,cx:(x0+x1)/2,cz:(z0+z1)/2,c0x:(x0+x1)/2,c0z:(z0+z1)/2});
  Object.assign(vista,{kFit,SX:CW/2,SY:TOP+(CH-TOP-BOT)/2});
  const k=kFit*vista.zoom;
  const P=(x,z)=>[vista.SX+(x-vista.cx)*k,vista.SY+(z-vista.cz)*k];
  const poli=(pts,chiudi=true)=>{c.beginPath();pts.forEach((q,i)=>{const [x,y]=P(q.x,q.z);i?c.lineTo(x,y):c.moveTo(x,y);});if(chiudi)c.closePath();};

  // carta chiara (si stampa bene)
  c.fillStyle='#f5f2ea';c.fillRect(0,0,CW,CH);
  if(d3&&d3.perimetro)for(const a of d3.perimetro){poli(anello(ap,a));c.fillStyle='#e4ecd8';c.fill();c.setLineDash([6,4]);c.strokeStyle='#8aa173';c.lineWidth=1;c.stroke();c.setLineDash([]);}
  if(d3&&d3.parcheggi)for(const a of d3.parcheggi){poli(anello(ap,a));c.fillStyle='#e6e3dc';c.fill();}
  // piazzali e vie di rullaggio
  c.lineJoin='round';c.lineCap='round';
  if(rete){
    for(const a of rete.piazzali){poli(a);c.fillStyle='#c9ccd2';c.fill();}
    for(const v of rete.vie){poli(v.pts,false);c.strokeStyle='#b8bcc3';c.lineWidth=Math.max(3,v.w*k);c.stroke();}
    for(const v of rete.vie){poli(v.pts,false);c.strokeStyle='#d9a600';c.lineWidth=1;c.stroke();}
  }else{ // piazzale generico di js/mondo.js accanto alla pista principale (lato destro)
    const p=ap.piste[0],Q=(u,v)=>({x:p.cx+p.dir.x*u-p.dir.z*v,z:p.cz+p.dir.z*u+p.dir.x*v});
    poli([Q(-80,70),Q(80,70),Q(80,140),Q(-80,140)]);c.fillStyle='#c9ccd2';c.fill();
    poli([Q(0,p.W/2),Q(0,70)],false);c.strokeStyle='#b8bcc3';c.lineWidth=Math.max(3,12*k);c.stroke();
    poli([Q(0,p.W/2),Q(0,70)],false);c.strokeStyle='#d9a600';c.lineWidth=1;c.stroke();
  }
  c.lineCap='butt';
  // piste: asfalto scuro o erba, asse tratteggiato, numeri alle testate
  for(const p of piste){
    const a=p.testate[0],b=p.testate[1],rx=-p.dir.z*p.W/2,rz=p.dir.x*p.W/2;
    poli([{x:a.x+rx,z:a.z+rz},{x:b.x+rx,z:b.z+rz},{x:b.x-rx,z:b.z-rz},{x:a.x-rx,z:a.z-rz}]);
    c.fillStyle=p.erba?'#8fb46a':'#3b3f46';c.fill();c.strokeStyle='#1d2026';c.lineWidth=1;c.stroke();
    if(!p.erba){const [ax,ay]=P(a.x,a.z),[bx,by]=P(b.x,b.z);c.strokeStyle='#fff';c.lineWidth=1;c.setLineDash([6,5]);
      c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.stroke();c.setLineDash([]);}
    for(const t of p.testate){
      const [x,y]=P(t.x-t.dir.x*60,t.z-t.dir.z*60);
      const a=t.hdg>90&&t.hdg<270?t.hdg+180:t.hdg;   // sempre leggibile, mai capovolto
      c.save();c.translate(x,y);c.rotate(a*D2R);
      c.font=`700 13px ${MONO}`;c.textAlign='center';c.textBaseline='middle';
      c.fillStyle='#f5f2ea';c.fillRect(-15,-9,30,18);c.fillStyle='#111';c.fillText(t.nome,0,1);c.restore();
    }
  }
  // edifici (sagome OSM dei grandi aeroporti)
  if(d3&&d3.edifici){
    for(const e of d3.edifici){
      poli(anello(ap,e.p));
      c.fillStyle=e.t==='terminal'?'#7d8796':e.t==='hangar'?'#9aa3ad':e.t==='parcheggio'?'#c4c0b8':'#a7adb5';c.fill();
      c.strokeStyle='#4b525c';c.lineWidth=0.8;c.stroke();
    }
    c.font=`700 10px ${UI}`;c.textAlign='center';c.textBaseline='middle';
    for(const e of d3.edifici){
      if(!e.n) continue;
      const q=anello(ap,e.p);let sx=0,sz=0;for(const v of q){sx+=v.x;sz+=v.z;}
      const [x,y]=P(sx/q.length,sz/q.length);
      c.fillStyle='rgba(245,242,234,.8)';const w=c.measureText(e.n).width;c.fillRect(x-w/2-2,y-7,w+4,14);
      c.fillStyle='#222';c.fillText(e.n,x,y);
    }
  }
  // pontili d'imbarco e linee gialle delle piazzole (si vedono ingrandendo)
  if(d3&&d3.pontili&&k>0.5){c.strokeStyle='#6b7280';c.lineWidth=Math.max(2,3.5*k);c.lineCap='round';
    for(const l of d3.pontili){poli(anello(ap,l),false);c.stroke();}c.lineCap='butt';}
  if(d3&&d3.piazzole&&k>0.6){c.strokeStyle='#d9a600';c.lineWidth=1;
    for(const p of d3.piazzole)if(p.l){poli(anello(ap,p.l),false);c.stroke();}}
  // piazzole numerate (più grandi quando si ingrandisce)
  if(d3&&d3.piazzole&&k>0.25){
    const fs=k>2?13:k>1?11:9;
    c.font=`700 ${fs}px ${MONO}`;c.textAlign='center';c.textBaseline='middle';
    for(const p of d3.piazzole){const [x,y]=P(ap.x+p.x/10,ap.z-p.y/10);
      if(k>1){const w=c.measureText(p.r).width+6;c.fillStyle='rgba(245,242,234,.85)';c.fillRect(x-w/2,y-fs/2-2,w,fs+4);}
      c.fillStyle='#1f5aa6';c.fillText(p.r,x,y);}
  }
  // torre
  const tw=d3&&d3.torre?{x:ap.x+d3.torre.x/10,z:ap.z-d3.torre.y/10}:null;
  if(tw){const [x,y]=P(tw.x,tw.z);c.fillStyle='#d23c2c';c.beginPath();c.arc(x,y,6,0,Math.PI*2);c.fill();c.strokeStyle='#fff';c.lineWidth=1.5;c.stroke();
    c.font=`700 10px ${MONO}`;c.textAlign='left';c.fillStyle='#d23c2c';c.fillText('TWR',x+9,y+1);}
  // PAPI: 4 luci a sinistra di chi atterra, all'altezza del punto di mira (come in js/mondo.js)
  for(const p of piste){if(p.erba) continue;
    for(const t of p.testate){const d=p.L>=1200?300:p.L>=800?250:150,lx=t.dir.z,lz=-t.dir.x;
      c.fillStyle='#e11d48';
      for(let i=0;i<4;i++){const off=p.W/2+15+i*9,[x,y]=P(t.x+t.dir.x*d+lx*off,t.z+t.dir.z*d+lz*off);c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();}
    }}
  // punti attesa e nomi delle vie
  if(rete){
    c.font=`700 10px ${MONO}`;c.textAlign='center';c.textBaseline='middle';
    for(const p of piste)for(const t of p.testate){
      const ing=SIM.reteRullaggio.ingresso(ap,t);if(!ing||!ing.attesa) continue;
      const [x,y]=P(ing.attesa.x,ing.attesa.z);
      c.fillStyle='#c81e1e';c.fillRect(x-14,y-7,28,14);c.fillStyle='#fff';c.fillText(t.nome,x,y+0.5);
    }
    const posti=[];
    c.font=`700 10px ${MONO}`;
    for(const v of rete.vie){
      if(!v.ref) continue;
      let lmax=0,m=null;
      for(let i=1;i<v.pts.length;i++){const a=v.pts[i-1],b=v.pts[i],l=Math.hypot(b.x-a.x,b.z-a.z);if(l>lmax){lmax=l;m={x:(a.x+b.x)/2,z:(a.z+b.z)/2};}}
      if(!m||lmax*k<14) continue;
      const [x,y]=P(m.x,m.z);
      if(posti.some(q=>q.r===v.ref&&Math.hypot(q.x-x,q.y-y)<160)) continue;
      posti.push({r:v.ref,x,y});
      const w=c.measureText(v.ref).width+6;
      c.fillStyle='#111';c.fillRect(x-w/2,y-7,w,14);c.fillStyle='#ffd400';c.fillText(v.ref,x,y+0.5);
    }
  }
  // intestazione, nord, scala, avvertenza
  c.fillStyle='#0b1322';c.fillRect(0,0,CW,40);
  c.font=`700 16px ${MONO}`;c.textAlign='left';c.textBaseline='middle';c.fillStyle='#39d7ff';c.fillText(ap.codice,14,20);
  c.font=`700 14px ${UI}`;c.fillStyle='#e8f1f8';c.fillText(ap.nome,14+c.measureText(ap.codice+'  ').width+10,20);
  c.textAlign='right';c.font=`400 11px ${UI}`;c.fillStyle='#8ea6bb';
  c.fillText(L('Elevazione ','Elevation ')+Math.round(ap.quota*FT)+' ft · '+L('carta simulata, non per la navigazione','simulated chart, not for navigation'),CW-14,20);
  const nx=CW-30,ny=TOP+26;c.fillStyle='#0b1322';c.beginPath();c.moveTo(nx,ny-16);c.lineTo(nx+8,ny+8);c.lineTo(nx,ny+3);c.lineTo(nx-8,ny+8);c.closePath();c.fill();
  c.font=`700 12px ${MONO}`;c.textAlign='center';c.fillText('N',nx,ny+20);
  let sm=10;for(const v of [10,20,50,100,200,250,500,1000])if(v*k<CW*0.25)sm=v;
  const sy=CH-16;c.fillStyle='#0b1322';c.fillRect(20,sy-3,sm*k,6);c.fillStyle='#f5f2ea';c.fillRect(20+sm*k/2,sy-2,sm*k/2-1,4);
  c.font=`400 11px ${UI}`;c.textAlign='left';c.fillStyle='#0b1322';c.fillText(sm+' m',24+sm*k,sy+1);
}

/* ---------- dati a lato ---------- */
function schedaDati(ap,te){
  const piste=T.piste.filter(p=>p.ap===ap);
  let h=`<h2><span class="cod">${esc(ap.codice)}</span> ${esc(ap.nome)}</h2>`;
  h+=`<p class="sotto">${L('Elevazione','Elevation')} <b>${Math.round(ap.quota*FT)} ft</b> (${Math.round(ap.quota)} m) · ${L('Carburante','Fuel')}: <b>${SIM.haCarburante&&SIM.haCarburante(ap)?L('sì','yes'):L('no','no')}</b></p>`;
  if(stato&&stato.metar&&stato.metar[ap.codice])h+=`<code class="metar">METAR ${esc(stato.metar[ap.codice])}</code>`;
  else if(stato&&stato.meteo)h+=`<p class="sotto">${L('Vento del volo','Flight wind')}: <b>${stato.meteo.ventoNodi<1?L('calmo','calm'):tre(stato.meteo.ventoDa)+'° '+stato.meteo.ventoNodi+' kt'}</b> · QNH <b>${stato.meteo.qnh||1016}</b></p>`;
  h+=`<h3>${L('Piste','Runways')}</h3><table><tr><th>${L('Pista','Rwy')}</th><th>${L('Rotta','Course')}</th><th>${L('Lunghezza','Length')}</th><th>${L('Fondo','Surface')}</th><th>ILS</th></tr>`;
  for(const p of piste)for(const t of p.testate){const ils=radio.ilsDi(t);
    h+=`<tr${t===te?' class="scelta"':''}><td><b>${esc(t.nome)}</b></td><td>${tre(t.hdg)}°</td><td>${p.L} × ${p.W} m</td><td>${p.erba?L('erba','grass'):L('asfalto','asphalt')}</td><td>${ils?`${esc(ils.id)} ${ils.freq.toFixed(2)}`:'—'}</td></tr>`;}
  h+=`</table><h3>${L('Frequenze','Frequencies')}</h3><table>`;
  for(const f of frequenze(ap))h+=`<tr><td>${f.tipo}</td><td>${esc(f.nome)}</td><td><b>${esc(f.freq)}</b>${f.vera?'':` <span class="sim">${L('simulata','simulated')}</span>`}</td></tr>`;
  h+='</table>';
  const vor=radio.stazioni.filter(s=>s.tipo==='VOR').map(s=>({s,d:Math.hypot(s.x-ap.x,s.z-ap.z)/NM})).filter(o=>o.d<30).sort((a,b)=>a.d-b.d).slice(0,4);
  if(vor.length){h+=`<h3>VOR ${L('vicini','nearby')}</h3><table>`;
    for(const {s,d} of vor){const r=((Math.atan2(ap.x-s.x,-(ap.z-s.z))/D2R)+360)%360;
      h+=`<tr><td><b>${esc(s.id)}</b></td><td>${esc(s.nome)}</td><td>${s.freq.toFixed(2)}</td><td>${L('radiale','radial')} ${tre(r)} · ${d.toFixed(1)} NM</td></tr>`;}
    h+='</table>';}
  // avvicinamento alla pista scelta
  const tutte=piste.flatMap(p=>p.testate);
  h+=`<h3>${L('Avvicinamento','Approach')} <select id="selTestata">${tutte.map((t,i)=>`<option value="${i}"${t===te?' selected':''}>${L('pista','runway')} ${esc(t.nome)}</option>`).join('')}</select></h3>`;
  const lato=latoCircuito(te),q=te.pista.quota,cir=Math.round((q*FT+1000)/100)*100,ils=radio.ilsDi(te);
  h+=`<canvas id="circuito" class="schema"></canvas>`;
  h+=`<ul class="note">`;
  h+=lato?`<li>${L('Circuito','Circuit')} <b>${lato>0?L('a sinistra','left-hand'):L('a destra','right-hand')}</b> ${L('a','at')} <b>${cir} ft</b> QNH (${L('1000 ft sopra il campo','1000 ft above the field')}), ${L('sottovento a circa 1,4 km dalla pista, finale corta (1,5 NM)','downwind about 1.4 km from the runway, short final (1.5 NM)')}.</li>`
         :`<li>${L('Rilievi vicini: niente circuito, solo','High ground nearby: no circuit, only a')} <b>${L('avvicinamento diretto','straight-in approach')}</b>.</li>`;
  h+=`<li>${L('Avvicinamento diretto: finale','Straight-in approach: final')} ${L('da','from')} <b>5 NM</b> ${L('a','at')} <b>${Math.round((q*FT+50+5*NM*Math.tan(3*D2R)*FT)/10)*10} ft</b>, ${L('discesa di 3° (circa 320 ft per miglio, 500 ft/min a 90 kt)','3° descent (about 320 ft per mile, 500 ft/min at 90 kt)')}.</li>`;
  if(!te.pista.erba)h+=`<li>PAPI ${L('a sinistra','on the left')}: <span class="papi"><i class="w"></i><i class="w"></i><i class="r"></i><i class="r"></i></span> ${L('= giusta pendenza','= on slope')}.</li>`;
  h+=ils?`<li>ILS <b>${esc(ils.id)}</b> ${ils.freq.toFixed(2)} MHz, ${L('rotta','course')} <b>${tre(te.hdg)}°</b>, ${L('sentiero','glide slope')} 3°, ${L('minimi','minimums')} <b>${Math.round(q*FT+200)} ft</b> (200 ft ${L('sopra la pista','above the runway')}).</li>`:`<li>${L('Niente ILS su questa pista: avvicinamento a vista.','No ILS on this runway: visual approach.')}</li>`;
  h+=`</ul><canvas id="profilo" class="schema"></canvas><p class="avviso">${L('Procedure simulate dal gioco, non quelle ufficiali.','Procedures simulated by the game, not the official ones.')}</p>`;
  $('dati').innerHTML=h;
  $('selTestata').addEventListener('change',e=>{testataScelta=tutte[+e.target.value];disegnaAeroporto();});
  disegnaCircuito($('circuito'),te,lato);
  disegnaProfilo($('profilo'),te,ils);
}
function tela(cv,h){
  const dp=Math.min(2,window.devicePixelRatio||1),w=cv.getBoundingClientRect().width||360;
  cv.style.height=h+'px';cv.width=Math.round(w*dp);cv.height=Math.round(h*dp);
  const c=cv.getContext('2d');c.setTransform(dp,0,0,dp,0,0);return {c,w,h};
}
// schema del circuito: pista verticale, si atterra verso l'alto
function disegnaCircuito(cv,te,lato){
  const {c,w,h}=tela(cv,230);
  c.fillStyle='#f5f2ea';c.fillRect(0,0,w,h);
  const cx=w/2,L0=te.pista.L,D=1400,k=Math.min((h-60)/(L0+2400),(w*0.4)/D);
  const Y=u=>h-30-(u+1300)*k;     // u = metri lungo la pista dalla soglia
  c.fillStyle='#3b3f46';c.fillRect(cx-5,Y(L0),10,L0*k);
  c.font=`700 11px ${MONO}`;c.textAlign='center';c.fillStyle='#111';c.fillText(te.nome,cx,Y(0)+14);
  if(!lato){c.fillStyle='#c81e1e';c.font=`700 12px ${UI}`;c.fillText(L('solo diretto','straight-in only'),cx,30);}
  else{
    const sx=cx-lato*D*k,top=Y(L0+500),bot=Y(-1000);
    c.strokeStyle='#d0168f';c.lineWidth=2.5;c.beginPath();
    // virate del circuito ad arco (raggio di circa 450 m, 25° di inclinazione)
    const r=Math.max(4,450*k);
    c.moveTo(cx,Y(L0*0.6));c.arcTo(cx,top,sx,top,r);c.arcTo(sx,top,sx,bot,r);c.arcTo(sx,bot,cx,bot,r);c.arcTo(cx,bot,cx,Y(0),r);c.lineTo(cx,Y(0));c.stroke();
    const freccia=(x,y,a)=>{c.save();c.translate(x,y);c.rotate(a);c.fillStyle='#d0168f';c.beginPath();c.moveTo(0,-7);c.lineTo(5,3);c.lineTo(-5,3);c.closePath();c.fill();c.restore();};
    freccia(cx,(Y(L0*0.6)+top)/2,0);freccia(sx,(top+bot)/2,Math.PI);freccia(cx,(bot+Y(0))/2,0);
    freccia((cx+sx)/2,top,-lato*Math.PI/2);freccia((cx+sx)/2,bot,lato*Math.PI/2);
    c.font=`700 10px ${UI}`;c.fillStyle='#333';c.textAlign='center';
    c.fillText(L('sottovento','downwind'),sx-lato*34,(top+bot)/2);
    c.fillText(L('traverso','crosswind'),(cx+sx)/2,top-9);c.fillText(L('base','base'),(cx+sx)/2,bot+14);
    c.fillText(L('finale','final'),cx+lato*30,(bot+Y(0))/2);
  }
  c.fillStyle='#0b1322';c.font=`700 10px ${MONO}`;c.textAlign='left';c.fillText(L('CIRCUITO','CIRCUIT')+' '+te.nome,8,14);
}
// profilo di discesa: 3° dalla soglia (50 ft) fino a 6 NM, rilievo vero sotto, quote miglio per miglio
function disegnaProfilo(cv,te,ils){
  const {c,w,h}=tela(cv,220);
  c.fillStyle='#f5f2ea';c.fillRect(0,0,w,h);
  const q=te.pista.quota*FT,dMax=6.2,ml=44,mr=14,mt=24,mb=40;
  const quotaSentiero=d=>q+50+d*NM*Math.tan(3*D2R)*FT;
  let qMin=q-100,qMax=quotaSentiero(dMax)+300;
  const terreno=[];for(let d=0;d<=dMax;d+=0.05){const x=te.x-te.dir.x*d*NM,z=te.z-te.dir.z*d*NM,t=Math.max(0,T.naturale(x,z))*FT;terreno.push([d,t]);qMax=Math.max(qMax,t+200);}
  const X=d=>w-mr-(d/dMax)*(w-ml-mr),Yq=f=>h-mb-(f-qMin)/(qMax-qMin)*(h-mt-mb);
  c.fillStyle='#c9b48f';c.beginPath();c.moveTo(X(0),h-mb);for(const [d,t] of terreno)c.lineTo(X(d),Yq(Math.max(qMin,t)));c.lineTo(X(dMax),h-mb);c.closePath();c.fill();
  // quota del circuito
  c.strokeStyle='#8ea6bb';c.setLineDash([4,4]);c.lineWidth=1;c.beginPath();c.moveTo(X(dMax),Yq(q+1000));c.lineTo(X(0),Yq(q+1000));c.stroke();c.setLineDash([]);
  // sentiero
  c.strokeStyle='#d0168f';c.lineWidth=2.5;c.beginPath();c.moveTo(X(dMax),Yq(quotaSentiero(dMax)));c.lineTo(X(0),Yq(q+50));c.stroke();
  c.fillStyle='#3b3f46';c.fillRect(X(0)-2,Yq(q)-3,10,4);
  // quote miglio per miglio
  c.font=`700 10px ${MONO}`;c.textAlign='center';
  for(let d=1;d<=6;d++){
    const f=Math.round(quotaSentiero(d)/10)*10,x=X(d),y=Yq(quotaSentiero(d));
    c.fillStyle='#d0168f';c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();
    c.fillStyle='#111';c.fillText(f,x,y-9);
    c.fillStyle='#555';c.fillText(d+' NM',x,h-mb+14);
  }
  c.fillStyle='#d0168f';c.fillText('FAF',X(5),h-mb+27);
  if(ils){c.fillStyle='#16803c';c.fillText('DA '+Math.round(q+200),X(200/(Math.tan(3*D2R)*FT*NM)),Yq(q+200)+14);}
  c.fillStyle='#0b1322';c.textAlign='left';c.font=`700 10px ${MONO}`;
  c.fillText(L('PROFILO','PROFILE')+' '+te.nome+' · 3° · '+tre(te.hdg)+'°'+(ils?' · '+ils.id+' '+ils.freq.toFixed(2):''),8,14);
  c.font=`400 9px ${UI}`;c.fillStyle='#555';c.textAlign='left';c.fillText(L('ft QNH','ft QNH'),4,mt+4);
  c.fillStyle='#8ea6bb';c.textAlign='right';c.fillText(L('circuito','circuit')+' '+Math.round((q+1000)/100)*100,w-mr,Yq(q+1000)-4);
}
$('stampa').addEventListener('click',()=>{window.print();});

/* ---------- avvio ---------- */
scegliAp(apDi(parametro('ap'))||null,false);
if(apScelto){centro={x:apScelto.x,z:apScelto.z};}
mostra(scheda);
// METAR cambiato (il tempo evolve, i temporali si spostano): si ridisegna la scheda dell'aeroporto
let ultimoMetar='';
setInterval(()=>{
  const m=scheda==='aeroporto'&&apScelto&&stato&&stato.metar?stato.metar[apScelto.codice]||'':'';
  if(m&&m!==ultimoMetar){ultimoMetar=m;disegnaAeroporto();}
},10000);
})();
