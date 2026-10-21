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
   PIANO DI VOLO
   Un piano minimo da aeroporto ad aeroporto, come quello di un pilota VFR:
   decollo, salita, crociera a una quota sicura sopra il rilievo della rotta,
   inizio della discesa, punto di finale a 5 NM allineato con la pista in uso
   (quella più controvento) e atterraggio. Durante il volo dice in che fase
   si è e qual è il prossimo punto: la rotta (rombo magenta, linea sulla
   mappa) porta prima al punto di finale e poi alla pista.
   Rotta come quella di un pilota (21/10/2026): dopo il decollo si sale dritti
   fino a 1,5 NM oltre la pista prima di virare (D36); all'arrivo ci si
   inserisce in finale con 30° al massimo (I36) e, se si arriva dalla parte
   della pista, con sottovento e base (W36, B36); nei voli locali c'è il
   circuito vero con la finale corta. Ogni punto ha il raggio di virata
   (per il disegno ad archi) e si passa al successivo un po' prima, come
   in una virata anticipata.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const D2R=Math.PI/180, FT=3.28084, NM=1852;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/* ---------- carburante negli aeroporti ----------
   c'è dove OpenStreetMap segna il distributore (aeroway=fuel, controllato il 16/10/2026), dove c'è una torre
   o un servizio informazioni (AFIS), o dove c'è una pista asfaltata di almeno 800 m; mai negli aeroporti militari.
   Nelle mappe fatte a mano si può decidere aeroporto per aeroporto con  carburante: true / false. */
const CARB_OSM=['LIMF','LIMA','LILI','LILM','LSGS','LFNC'];
SIM.haCarburante=function(ap){
  if(!ap) return false;
  if(ap.carburante!=null) return !!ap.carburante;
  if(/militare|military/i.test(ap.nome)) return false;
  if(CARB_OSM.includes(ap.codice)) return true;
  const com=(window.RADIO&&window.RADIO.com)||[];
  if(com.some(c=>c.ap===ap.codice&&(c.tipo==='TWR'||c.tipo==='INFO'))) return true;
  return ap.piste.some(p=>!p.erba&&p.L>=800);
};
const tre=n=>String(Math.round(((n%360)+360)%360)%360).padStart(3,'0');
const nm=m=>(m/NM).toFixed(1);
const Lg=(it,en)=>SIM.L?SIM.L(it,en):it;   // lingua (js/lingua.js)
const rotta=(ax,az,bx,bz)=>((Math.atan2(bx-ax,-(bz-az))/D2R)+360)%360;

// velocità e ratei dell'aereo (A.prestazioni; questi sono quelli del C172, vedi le prove in CLAUDE.md)
let V_SALITA=74, RATEO_SALITA=550, V_CROCIERA=100, V_DISCESA=105, RATEO_DISCESA=500, V_FINALE=70;
const FINALE=5*NM;            // punto di finale a 5 NM dalla soglia
const PENDENZA=3*D2R;         // sentiero di discesa di 3°
const FINALE_CIRCUITO=2800;   // nel circuito la finale è corta (1,5 NM)
const R_VIRATA=900;           // raggio di una virata standard (3°/s) a circa 95 kt
const R_CIRCUITO=450;         // virate del circuito (25° di inclinazione a 75 kt)

SIM.creaPiano=function(T,A,met,radio){
  const pr=A.prestazioni;
  if(pr){V_SALITA=pr.salita;RATEO_SALITA=pr.rateoSalita;V_CROCIERA=pr.crociera;V_DISCESA=pr.discesa;RATEO_DISCESA=pr.rateoDiscesa;V_FINALE=pr.finale-2;}
  let piano=null, comDi=null, terraDi=null;   // comDi(ap) -> stazione radio (js/atc.js)

  // componenti del vento sulla pista: frontale (+) e traverso (+ = da destra)
  function ventoPista(hdg){
    const v=met.ventoNodi||0,d=(met.ventoDa-hdg)*D2R;
    return {fronte:v*Math.cos(d),traverso:v*Math.sin(d)};
  }
  // quota più alta del terreno lungo un tratto, in una fascia larga 4 km
  function terrenoMax(ax,az,bx,bz){
    const L=Math.hypot(bx-ax,bz-az),n=Math.max(2,Math.ceil(L/400));
    const ux=(bx-ax)/(L||1),uz=(bz-az)/(L||1);
    let h=-Infinity;
    for(let i=0;i<=n;i++){
      const t=i/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      for(const o of [-2000,0,2000])h=Math.max(h,T.naturale(x-uz*o,z+ux*o));
    }
    return h;
  }
  // regola VFR: rotte verso est (000-179) a migliaia dispari + 500 ft, verso ovest a pari + 500 ft
  function quotaVFR(minFt,rt){
    const dispari=rt<180;
    let q=Math.ceil((minFt-500)/1000)*1000+500;
    if((Math.round((q-500)/1000)%2===1)!==dispari)q+=1000;
    return q;
  }

  // circuito: a sinistra se le colline lo permettono, altrimenti a destra, 0 = impossibile (come in js/traffico.js)
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
  // punto a u metri dalla soglia te nel verso di atterraggio e v metri di lato (s = +1 sinistra, -1 destra)
  const presso=(te,u,v,s,r,nome)=>({x:te.x+te.dir.x*u+te.dir.z*v*s,z:te.z+te.dir.z*u-te.dir.x*v*s,r,nome:nome||''});
  const angolo=(a,b)=>Math.abs(((a-b)%360+540)%360-180);

  /* calcola il piano. da = {ap, te} (partenza) oppure {x, z, y} (in volo); arr = aeroporto; te = testata in uso */
  function calcola(da,arr,te){
    if(!arr||!te){piano=null;return null;}
    const x0=da.te?da.te.x:da.x,z0=da.te?da.te.z:da.z;
    const quotaDep=da.ap?da.ap.quota*FT:(da.y||0)*FT;
    const qCampo=arr.quota*FT;
    const fafStd={x:te.x-te.dir.x*FINALE,z:te.z-te.dir.z*FINALE};
    const circuito=Math.hypot(fafStd.x-x0,fafStd.z-z0)<3*NM||da.ap===arr;
    // i punti della rotta
    const punti=[{x:x0,z:z0,r:0,nome:''}];
    const lato=circuito&&da.te===te?latoCircuito(te):0;
    const fin=lato?FINALE_CIRCUITO:FINALE;
    const faf={x:te.x-te.dir.x*fin,z:te.z-te.dir.z*fin};
    if(lato){   // circuito: salita oltre la pista, traverso, sottovento, base, finale corta
      const Lp=te.pista.L,D=1400;
      punti.push(presso(te,Lp+900,0,lato,R_CIRCUITO),presso(te,Lp+900,D,lato,R_CIRCUITO),presso(te,-fin,D,lato,R_CIRCUITO));
    }else{
      // partenza: dritti fino a 1,5 NM oltre la fine della pista, se poi si deve virare di più di 30°
      if(da.te){
        const dp=da.te.pista.L+1.5*NM,D={x:da.te.x+da.te.dir.x*dp,z:da.te.z+da.te.dir.z*dp,r:R_VIRATA,nome:'D'+da.te.nome};
        if(angolo(da.te.hdg,rotta(D.x,D.z,faf.x,faf.z))>30)punti.push(D);
      }
      // arrivo: in finale con 30° al massimo; arrivando dalla parte della pista, sottovento e base
      const pr=punti[punti.length-1];
      if(angolo(rotta(pr.x,pr.z,faf.x,faf.z),te.hdg)>30){
        const dx=pr.x-faf.x,dz=pr.z-faf.z,u=dx*te.dir.x+dz*te.dir.z,v=dx*te.dir.z-dz*te.dir.x,s=v>=0?1:-1;
        if(u>-1*NM)punti.push(presso(te,-fin-1.5*NM,2*NM,s,R_VIRATA,'W'+te.nome),presso(te,-fin-1.5*NM,0.9*NM,s,R_VIRATA,'B'+te.nome));
        else punti.push(presso(te,-fin-3*NM,1.6*NM,s,R_VIRATA,'I'+te.nome));
      }
    }
    punti.push({x:faf.x,z:faf.z,r:lato?R_CIRCUITO:R_VIRATA,nome:'F'+te.nome});
    const iFaf=punti.length-1;
    punti.push({x:te.x,z:te.z,r:0,nome:'RW'+te.nome});
    // lunghezze dei tratti, virata anticipata a ogni punto (r·tan(angolo/2)), tratto più lungo = rotta di crociera
    const tratto=i=>Math.hypot(punti[i+1].x-punti[i].x,punti[i+1].z-punti[i].z);
    let L=0,rt=rotta(x0,z0,faf.x,faf.z),lMax=0;
    for(let i=0;i<iFaf;i++){const l=tratto(i);L+=l;if(l>lMax){lMax=l;rt=rotta(punti[i].x,punti[i].z,punti[i+1].x,punti[i+1].z);}}
    for(let i=1;i<punti.length-1;i++){
      const a=punti[i-1],b=punti[i],c=punti[i+1],d=angolo(rotta(a.x,a.z,b.x,b.z),rotta(b.x,b.z,c.x,c.z));
      b.anticipo=clamp(b.r*Math.tan(Math.min(d,150)*D2R/2),0.25*NM,1.5*NM);
    }
    const rtPartenza=punti.length>2?rotta(punti[1].x,punti[1].z,punti[2].x,punti[2].z):rt;
    const qFaf=Math.round((qCampo+fin*Math.tan(PENDENZA)*FT)/100)*100;
    let crociera,minSicura=0,alta=false;
    if(circuito){
      crociera=Math.ceil((qCampo+1000)/100)*100;
    }else{
      for(let i=0;i<iFaf;i++)minSicura=Math.max(minSicura,terrenoMax(punti[i].x,punti[i].z,punti[i+1].x,punti[i+1].z)*FT+1000);
      crociera=quotaVFR(Math.max(minSicura,quotaDep+1500,qFaf+500),rt);
      if(crociera>12500){crociera=quotaVFR(12000,rt);alta=true;}
    }
    // salita e discesa: dove finiscono e dove cominciano lungo la rotta
    let dSalita=Math.max(0,crociera-quotaDep)/RATEO_SALITA*V_SALITA/60*NM;
    let dDiscesa=Math.max(0,crociera-qFaf)/RATEO_DISCESA*V_DISCESA/60*NM;
    const continua=!circuito&&dSalita+dDiscesa>L;
    if(continua){const f=L/(dSalita+dDiscesa);dSalita*=f;dDiscesa*=f;}
    const dCrociera=circuito?0:L-dSalita-dDiscesa;
    const minuti=circuito?(L+fin)/NM/V_FINALE*60+(lato?0:4):
      (dSalita/NM/V_SALITA+dCrociera/NM/V_CROCIERA+dDiscesa/NM/V_DISCESA+fin/NM/V_FINALE)*60;
    piano={da,arr,te,faf,x0,z0,quotaDep,qCampo,qFaf,crociera,minSicura,alta,rt,rtPartenza,L,circuito,continua,
      dSalita,dDiscesa,dCrociera,minuti,prossimo:0,fase:0,tra:0,nomeFaf:'F'+te.nome,
      punti,iFaf,idx:1,fin,latoCircuito:lato};
    return piano;
  }

  /* aggiorna fase e prossimo punto con la posizione dell'aereo s (stato della fisica) */
  function aggiorna(s){
    const p=piano;if(!p) return null;
    const x=s.pos.x,z=s.pos.z,te=p.te;
    const dFaf=Math.hypot(p.faf.x-x,p.faf.z-z);
    // dietro la soglia, lungo il prolungamento della pista: si è in finale
    const ax=x-te.x,az=z-te.z,lungo=-(ax*te.dir.x+az*te.dir.z),lato=Math.abs(-ax*te.dir.z+az*te.dir.x);
    const inFinale=lungo>-200&&lungo<p.fin*1.15&&lato<Math.max(250,lungo*0.3);
    if(p.prossimo===0){
      if(p.idx>p.iFaf)p.idx=1;   // si ricomincia
      // punti prima della finale: si passa al successivo un po' prima (virata anticipata) o quando lo si è superato
      while(p.idx<p.iFaf){
        const b=p.punti[p.idx],a=p.punti[p.idx-1],lx=b.x-a.x,lz=b.z-a.z,ll=Math.hypot(lx,lz)||1;
        if(Math.hypot(b.x-x,b.z-z)<b.anticipo||((x-b.x)*lx+(z-b.z)*lz)/ll>0)p.idx++;else break;
      }
    }
    if(p.prossimo===0&&((p.idx===p.iFaf&&dFaf<Math.min(0.8*NM,p.punti[p.iFaf].anticipo+0.2*NM))||inFinale))p.prossimo=1;
    else if(p.prossimo===1&&!inFinale&&dFaf>1.5*NM&&lungo>p.fin*1.3){p.prossimo=0;p.idx=p.iFaf;}
    if(p.prossimo===1)p.idx=p.punti.length-1;
    // fase: 0 a terra, 1 salita, 2 crociera, 3 discesa, 4 finale, 5 atterrato
    const lontano=Math.hypot(x-p.x0,z-p.z0);
    if(s.aTerra&&p.prossimo===1&&Math.hypot(ax,az)<te.pista.L+300){p.fase=5;p.tra=0;}
    else if(s.aTerra&&lontano<3000){p.fase=0;p.tra=0;}
    else if(p.prossimo===1){p.fase=4;p.tra=Math.max(0,lungo);}
    else{
      // avanzamento lungo la rotta: quanto manca al punto di finale passando per i punti che restano
      let resta=Math.hypot(p.punti[p.idx].x-x,p.punti[p.idx].z-z);
      for(let i=p.idx;i<p.iFaf;i++)resta+=Math.hypot(p.punti[i+1].x-p.punti[i].x,p.punti[i+1].z-p.punti[i].z);
      const fatto=clamp(p.L-resta,0,p.L);
      const quota=s.pos.y*FT;
      if(p.circuito){p.fase=2;p.tra=resta;}
      else if(resta<=p.dDiscesa){p.fase=3;p.tra=resta;}
      else if(quota<p.crociera-200&&fatto<p.dSalita+3*NM){p.fase=1;p.tra=Math.max(0,p.dSalita-fatto);}
      else{p.fase=2;p.tra=Math.max(0,resta-p.dDiscesa);}
    }
    return p;
  }

  // punto verso cui puntare adesso (per la rotta e il rombo magenta)
  function bersaglio(){
    const p=piano;if(!p) return null;
    const b=p.punti[p.idx];
    return p.idx===p.punti.length-1?{x:p.te.x,z:p.te.z,nome:'RWY '+p.te.nome}:{x:b.x,z:b.z,nome:b.nome||p.nomeFaf};
  }

  /* ---------- testo del riquadro ---------- */
  function html(){
    const p=piano;if(!p) return `<div class="dim">${Lg('Nessuna destinazione.','No destination.')}</div>`;
    const te=p.te,pi=te.pista,arr=p.arr,v=ventoPista(te.hdg);
    const dep=p.da.ap?p.da.ap.codice:Lg('in volo','airborne');
    const riga=(n,cod,testo)=>`<li class="${p.fase===n?'ora':''}${p.fase>n?' fatto':''}"><b>${cod}</b><span>${testo}</span></li>`;
    let tappe='';
    tappe+=riga(0,Lg('DEC','DEP'),p.da.te?Lg(`${dep} pista ${p.da.te.nome}, sali a ${V_SALITA} kt`,`${dep} runway ${p.da.te.nome}, climb at ${V_SALITA} kt`):Lg(`in volo da ${Math.round(p.quotaDep)} ft`,`airborne at ${Math.round(p.quotaDep)} ft`));
    if(p.circuito){
      tappe+=riga(2,Lg('CIR','PAT'),p.latoCircuito?Lg(`circuito ${p.latoCircuito>0?'a sinistra':'a destra'} a <em>${p.crociera} ft</em>: traverso, sottovento, base`,`${p.latoCircuito>0?'left':'right'}-hand pattern at <em>${p.crociera} ft</em>: crosswind, downwind, base`):Lg(`a <em>${p.crociera} ft</em>, poi verso ${p.nomeFaf}`,`at <em>${p.crociera} ft</em>, then to ${p.nomeFaf}`));
    }else{
      tappe+=riga(1,Lg('SAL','CLB'),Lg(`fino a <em>${p.crociera} ft</em> (${nm(p.dSalita)} NM)`,`to <em>${p.crociera} ft</em> (${nm(p.dSalita)} NM)`));
      const via=p.punti.slice(1,p.iFaf).map(q=>q.nome).filter(Boolean);
      tappe+=riga(2,Lg('CRO','CRZ'),(via.length?`via ${via.join(', ')} · `:'')+(p.continua?Lg(`rotta ${tre(p.rt)}°, nessun tratto livellato`,`course ${tre(p.rt)}°, no level segment`):Lg(`rotta <em>${tre(p.rt)}°</em>`,`course <em>${tre(p.rt)}°</em>`)+` · ${nm(p.dCrociera)} NM · ${V_CROCIERA} kt`));
      tappe+=riga(3,Lg('DIS','DES'),Lg(`a ${nm(p.dDiscesa)} NM da ${p.nomeFaf}, −${RATEO_DISCESA} ft/min`,`${nm(p.dDiscesa)} NM before ${p.nomeFaf}, −${RATEO_DISCESA} ft/min`));
    }
    tappe+=riga(4,p.nomeFaf,Lg(`finale ${nm(p.fin)} NM · rotta ${tre(te.hdg)}° · <em>${p.qFaf} ft</em>`,`final ${nm(p.fin)} NM · course ${tre(te.hdg)}° · <em>${p.qFaf} ft</em>`));
    tappe+=riga(5,Lg('ATT','LDG'),Lg(`pista ${te.nome} · ${A.velocita.avvicinamento} kt · flap ${A.flap.posizioni[A.flap.posizioni.length-1]}°`,`runway ${te.nome} · ${A.velocita.avvicinamento} kt · flaps ${A.flap.posizioni[A.flap.posizioni.length-1]}°`));
    const lato=v.traverso>0.5?Lg('da destra','from the right'):v.traverso<-0.5?Lg('da sinistra','from the left'):'';
    const vento=(met.ventoNodi||0)<1?Lg('calmo','calm'):
      `${Math.round(Math.abs(v.fronte))} kt ${v.fronte>=0?Lg('frontale','headwind'):Lg('in coda','tailwind')}`+(lato?` · ${Math.round(Math.abs(v.traverso))} kt ${lato}`:'');
    const altre=arr.piste.flatMap(q=>q.testate).filter(t=>t!==te).map(t=>t.nome).join(' ');
    const ore=Math.floor(p.minuti/60),min=Math.round(p.minuti%60);
    return `<div class="pv-testa"><b>${dep} ▸ ${arr.codice}</b><span>${nm(p.L+p.fin)} NM · ${ore?ore+' h ':''}${min} min</span></div>`+
      `<ol class="pv-tappe">${tappe}</ol>`+
      `<div class="pv-pista"><div><span class="lbl">${Lg('PISTA','RWY')}</span><b>${te.nome}</b> ${pi.L}×${pi.W} m · ${pi.erba?Lg('erba','grass'):Lg('asfalto','asphalt')} · QFU ${tre(te.hdg)}°</div>`+
      `<div><span class="lbl">${Lg('CAMPO','FIELD')}</span>${Math.round(p.qCampo)} ft · ${Lg('circuito','pattern')} ${Math.ceil((p.qCampo+1000)/100)*100} ft${altre?` · ${Lg('altre','others')}: ${altre}`:''}</div>`+
      `<div><span class="lbl">${Lg('VENTO','WIND')}</span>${vento}</div>`+carbHtml(p)+radioHtml(p)+`</div>`+
      (p.alta?`<div class="pv-nota">${Lg('Montagne alte sulla rotta: valuta un giro più lungo per le valli.','High mountains on the route: consider a longer way through the valleys.')}</div>`:'')+
      `<div class="pv-fase" id="pvFase"></div>`;
  }
  // carburante: quanto ne serve per il volo (più 30 minuti di riserva) e se all'arrivo si può fare rifornimento
  function carbHtml(p){
    const cb=A.carburante,un=cb.unita==='l'?'l':'gal',m=A.motore;
    const flusso=cb.consumoMin+(cb.consumoMax-cb.consumoMin)*Math.pow((m.giriVolo||2400)/m.giriMax,3);   // in crociera
    const volo=flusso*p.minuti/60,ris=flusso*0.5,f=v=>un==='l'?Math.ceil(v):Math.ceil(v*2)/2;
    const si=SIM.haCarburante(p.arr);
    return `<div><span class="lbl">${Lg('CARB','FUEL')}</span>${Lg(`serve circa <em>${f(volo)} ${un}</em> + ${f(ris)} di riserva (30 min)`,`about <em>${f(volo)} ${un}</em> needed + ${f(ris)} reserve (30 min)`)}`+
      ` · ${si?Lg(`rifornimento a ${p.arr.codice}`,`fuel at ${p.arr.codice}`):Lg(`<b class="rosso">niente carburante a ${p.arr.codice}</b>`,`<b class="rosso">no fuel at ${p.arr.codice}</b>`)}</div>`;
  }
  // radioaiuti utili all'arrivo: ILS della pista e VOR più vicino alla destinazione
  function radioHtml(p){
    if(!radio) return '';
    let t='';
    const sd=comDi&&p.da.ap?comDi(p.da.ap):null, sa=comDi?comDi(p.arr):null;
    const gd=terraDi&&p.da.ap?terraDi(p.da.ap):null;
    if(sa)t+=`<div><span class="lbl">COM</span>${gd?`<b>${gd.freq}</b> ${Lg('terra','gnd')} · `:''}${sd&&sd!==sa?`<b>${sd.freq}</b> ${Lg('partenza','dep.')} · `:''}<b>${sa.freq}</b> ${sa.nome}</div>`;
    const ils=radio.ilsDi(p.te);
    if(ils) t+=`<div><span class="lbl">ILS</span><b>${ils.freq.toFixed(2)}</b> ${ils.id} · CRS ${tre(ils.crs)}° · ${Lg('tasto','key')} <b>L</b></div>`;
    let vor=null,dv=Infinity;
    for(const s of radio.stazioni){if(s.tipo!=='VOR')continue;const d=Math.hypot(s.x-p.arr.x,s.z-p.arr.z);if(d<dv){dv=d;vor=s;}}
    if(vor&&dv<60*NM){
      const r=rotta(vor.x,vor.z,p.arr.x,p.arr.z);
      t+=`<div><span class="lbl">VOR</span><b>${vor.freq.toFixed(2)}</b> ${vor.id} ${vor.nome} · ${nm(dv)} NM${dv>0.5*NM?` · ${Lg('radiale','radial')} ${tre(r)}°`:''}</div>`;
    }
    return t;
  }
  // riga che cambia durante il volo
  function testoFase(){
    const p=piano;if(!p) return '';
    switch(p.fase){
      case 0:return p.latoCircuito?Lg('Pronto al decollo · poi circuito','Ready for take-off · then pattern'):Lg(`Pronto al decollo · poi rotta ${tre(p.rtPartenza)}°`,`Ready for take-off · then course ${tre(p.rtPartenza)}°`);
      case 1:return Lg(`Salita a ${p.crociera} ft · crociera tra ${nm(p.tra)} NM`,`Climb to ${p.crociera} ft · cruise in ${nm(p.tra)} NM`);
      case 2:return p.circuito?Lg(`Circuito · finale tra ${nm(p.tra)} NM`,`Pattern · final in ${nm(p.tra)} NM`):Lg(`Crociera · inizia la discesa tra ${nm(p.tra)} NM`,`Cruise · start descent in ${nm(p.tra)} NM`);
      case 3:return Lg(`Discesa verso ${p.nomeFaf} a ${p.qFaf} ft · ${nm(p.tra)} NM`,`Descend to ${p.nomeFaf} at ${p.qFaf} ft · ${nm(p.tra)} NM`);
      case 4:return Lg(`Finale pista ${p.te.nome} · ${nm(p.tra)} NM · segui il PAPI`,`Final runway ${p.te.nome} · ${nm(p.tra)} NM · follow the PAPI`);
      default:return Lg(`Atterrato a ${p.arr.codice}!`,`Landed at ${p.arr.codice}!`);
    }
  }
  return {calcola,aggiorna,bersaglio,html,testoFase,get piano(){return piano;},impostaCom(f,g){comDi=f;terraDi=g||null;}};
};
})();
