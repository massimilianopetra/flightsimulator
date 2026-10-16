/* =====================================================================
   PIANO DI VOLO
   Un piano minimo da aeroporto ad aeroporto, come quello di un pilota VFR:
   decollo, salita, crociera a una quota sicura sopra il rilievo della rotta,
   inizio della discesa, punto di finale a 5 NM allineato con la pista in uso
   (quella più controvento) e atterraggio. Durante il volo dice in che fase
   si è e qual è il prossimo punto: la rotta (rombo magenta, linea sulla
   mappa) porta prima al punto di finale e poi alla pista.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const D2R=Math.PI/180, FT=3.28084, NM=1852;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const tre=n=>String(Math.round(((n%360)+360)%360)%360).padStart(3,'0');
const nm=m=>(m/NM).toFixed(1);
const Lg=(it,en)=>SIM.L?SIM.L(it,en):it;   // lingua (js/lingua.js)
const rotta=(ax,az,bx,bz)=>((Math.atan2(bx-ax,-(bz-az))/D2R)+360)%360;

// velocità e ratei dell'aereo (A.prestazioni; questi sono quelli del C172, vedi le prove in CLAUDE.md)
let V_SALITA=74, RATEO_SALITA=550, V_CROCIERA=100, V_DISCESA=105, RATEO_DISCESA=500, V_FINALE=70;
const FINALE=5*NM;            // punto di finale a 5 NM dalla soglia
const PENDENZA=3*D2R;         // sentiero di discesa di 3°

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

  /* calcola il piano. da = {ap, te} (partenza) oppure {x, z, y} (in volo); arr = aeroporto; te = testata in uso */
  function calcola(da,arr,te){
    if(!arr||!te){piano=null;return null;}
    const x0=da.te?da.te.x:da.x,z0=da.te?da.te.z:da.z;
    const quotaDep=da.ap?da.ap.quota*FT:(da.y||0)*FT;
    const faf={x:te.x-te.dir.x*FINALE,z:te.z-te.dir.z*FINALE};
    const qCampo=arr.quota*FT;
    const qFaf=Math.round((qCampo+FINALE*Math.tan(PENDENZA)*FT)/100)*100;
    const rt=rotta(x0,z0,faf.x,faf.z), L=Math.hypot(faf.x-x0,faf.z-z0);
    const circuito=L<3*NM||da.ap===arr;
    let crociera,minSicura=0,alta=false;
    if(circuito){
      crociera=Math.ceil((qCampo+1000)/100)*100;
    }else{
      minSicura=terrenoMax(x0,z0,faf.x,faf.z)*FT+1000;
      crociera=quotaVFR(Math.max(minSicura,quotaDep+1500,qFaf+500),rt);
      if(crociera>12500){crociera=quotaVFR(12000,rt);alta=true;}
    }
    // salita e discesa: dove finiscono e dove cominciano lungo la rotta
    let dSalita=Math.max(0,crociera-quotaDep)/RATEO_SALITA*V_SALITA/60*NM;
    let dDiscesa=Math.max(0,crociera-qFaf)/RATEO_DISCESA*V_DISCESA/60*NM;
    const continua=!circuito&&dSalita+dDiscesa>L;
    if(continua){const f=L/(dSalita+dDiscesa);dSalita*=f;dDiscesa*=f;}
    const dCrociera=circuito?0:L-dSalita-dDiscesa;
    const minuti=circuito?(L+FINALE)/NM/V_FINALE*60+4:
      (dSalita/NM/V_SALITA+dCrociera/NM/V_CROCIERA+dDiscesa/NM/V_DISCESA+FINALE/NM/V_FINALE)*60;
    piano={da,arr,te,faf,x0,z0,quotaDep,qCampo,qFaf,crociera,minSicura,alta,rt,L,circuito,continua,
      dSalita,dDiscesa,dCrociera,minuti,prossimo:0,fase:0,tra:0,nomeFaf:'F'+te.nome};
    return piano;
  }

  /* aggiorna fase e prossimo punto con la posizione dell'aereo s (stato della fisica) */
  function aggiorna(s){
    const p=piano;if(!p) return null;
    const x=s.pos.x,z=s.pos.z,te=p.te;
    const dFaf=Math.hypot(p.faf.x-x,p.faf.z-z);
    // dietro la soglia, lungo il prolungamento della pista: si è in finale
    const ax=x-te.x,az=z-te.z,lungo=-(ax*te.dir.x+az*te.dir.z),lato=Math.abs(-ax*te.dir.z+az*te.dir.x);
    const inFinale=lungo>-200&&lungo<FINALE*1.15&&lato<Math.max(250,lungo*0.3);
    if(p.prossimo===0&&(dFaf<0.8*NM||inFinale))p.prossimo=1;
    else if(p.prossimo===1&&!inFinale&&dFaf>1.5*NM&&lungo>FINALE*1.3)p.prossimo=0;
    // fase: 0 a terra, 1 salita, 2 crociera, 3 discesa, 4 finale, 5 atterrato
    const lontano=Math.hypot(x-p.x0,z-p.z0);
    if(s.aTerra&&p.prossimo===1&&Math.hypot(ax,az)<te.pista.L+300){p.fase=5;p.tra=0;}
    else if(s.aTerra&&lontano<3000){p.fase=0;p.tra=0;}
    else if(p.prossimo===1){p.fase=4;p.tra=Math.max(0,lungo);}
    else{
      // avanzamento lungo la rotta partenza -> punto di finale
      const ux=(p.faf.x-p.x0)/(p.L||1),uz=(p.faf.z-p.z0)/(p.L||1);
      const fatto=clamp((x-p.x0)*ux+(z-p.z0)*uz,0,p.L),resta=p.circuito?dFaf:Math.max(dFaf,p.L-fatto);
      const quota=s.pos.y*FT;
      if(p.circuito){p.fase=2;p.tra=dFaf;}
      else if(resta<=p.dDiscesa){p.fase=3;p.tra=dFaf;}
      else if(quota<p.crociera-200&&fatto<p.dSalita+3*NM){p.fase=1;p.tra=Math.max(0,p.dSalita-fatto);}
      else{p.fase=2;p.tra=Math.max(0,resta-p.dDiscesa);}
    }
    return p;
  }

  // punto verso cui puntare adesso (per la rotta e il rombo magenta)
  function bersaglio(){
    const p=piano;if(!p) return null;
    return p.prossimo===0?{x:p.faf.x,z:p.faf.z,nome:p.nomeFaf}:{x:p.te.x,z:p.te.z,nome:'RWY '+p.te.nome};
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
      tappe+=riga(2,Lg('CIR','PAT'),Lg(`circuito a <em>${p.crociera} ft</em>, poi verso ${p.nomeFaf}`,`pattern at <em>${p.crociera} ft</em>, then to ${p.nomeFaf}`));
    }else{
      tappe+=riga(1,Lg('SAL','CLB'),Lg(`fino a <em>${p.crociera} ft</em> (${nm(p.dSalita)} NM)`,`to <em>${p.crociera} ft</em> (${nm(p.dSalita)} NM)`));
      tappe+=riga(2,Lg('CRO','CRZ'),p.continua?Lg(`rotta ${tre(p.rt)}°, nessun tratto livellato`,`course ${tre(p.rt)}°, no level segment`):Lg(`rotta <em>${tre(p.rt)}°</em>`,`course <em>${tre(p.rt)}°</em>`)+` · ${nm(p.dCrociera)} NM · ${V_CROCIERA} kt`);
      tappe+=riga(3,Lg('DIS','DES'),Lg(`a ${nm(p.dDiscesa)} NM da ${p.nomeFaf}, −${RATEO_DISCESA} ft/min`,`${nm(p.dDiscesa)} NM before ${p.nomeFaf}, −${RATEO_DISCESA} ft/min`));
    }
    tappe+=riga(4,p.nomeFaf,Lg(`finale 5 NM · rotta ${tre(te.hdg)}° · <em>${p.qFaf} ft</em>`,`final 5 NM · course ${tre(te.hdg)}° · <em>${p.qFaf} ft</em>`));
    tappe+=riga(5,Lg('ATT','LDG'),Lg(`pista ${te.nome} · ${A.velocita.avvicinamento} kt · flap 30°`,`runway ${te.nome} · ${A.velocita.avvicinamento} kt · flaps 30°`));
    const lato=v.traverso>0.5?Lg('da destra','from the right'):v.traverso<-0.5?Lg('da sinistra','from the left'):'';
    const vento=(met.ventoNodi||0)<1?Lg('calmo','calm'):
      `${Math.round(Math.abs(v.fronte))} kt ${v.fronte>=0?Lg('frontale','headwind'):Lg('in coda','tailwind')}`+(lato?` · ${Math.round(Math.abs(v.traverso))} kt ${lato}`:'');
    const altre=arr.piste.flatMap(q=>q.testate).filter(t=>t!==te).map(t=>t.nome).join(' ');
    const ore=Math.floor(p.minuti/60),min=Math.round(p.minuti%60);
    return `<div class="pv-testa"><b>${dep} ▸ ${arr.codice}</b><span>${nm(p.L+FINALE)} NM · ${ore?ore+' h ':''}${min} min</span></div>`+
      `<ol class="pv-tappe">${tappe}</ol>`+
      `<div class="pv-pista"><div><span class="lbl">${Lg('PISTA','RWY')}</span><b>${te.nome}</b> ${pi.L}×${pi.W} m · ${pi.erba?Lg('erba','grass'):Lg('asfalto','asphalt')} · QFU ${tre(te.hdg)}°</div>`+
      `<div><span class="lbl">${Lg('CAMPO','FIELD')}</span>${Math.round(p.qCampo)} ft · ${Lg('circuito','pattern')} ${Math.ceil((p.qCampo+1000)/100)*100} ft${altre?` · ${Lg('altre','others')}: ${altre}`:''}</div>`+
      `<div><span class="lbl">${Lg('VENTO','WIND')}</span>${vento}</div>`+radioHtml(p)+`</div>`+
      (p.alta?`<div class="pv-nota">${Lg('Montagne alte sulla rotta: valuta un giro più lungo per le valli.','High mountains on the route: consider a longer way through the valleys.')}</div>`:'')+
      `<div class="pv-fase" id="pvFase"></div>`;
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
      case 0:return Lg(`Pronto al decollo · poi rotta ${tre(rotta(p.x0,p.z0,p.faf.x,p.faf.z))}°`,`Ready for take-off · then course ${tre(rotta(p.x0,p.z0,p.faf.x,p.faf.z))}°`);
      case 1:return Lg(`Salita a ${p.crociera} ft · crociera tra ${nm(p.tra)} NM`,`Climb to ${p.crociera} ft · cruise in ${nm(p.tra)} NM`);
      case 2:return p.circuito?Lg(`Verso ${p.nomeFaf} · ${nm(p.tra)} NM`,`To ${p.nomeFaf} · ${nm(p.tra)} NM`):Lg(`Crociera · inizia la discesa tra ${nm(p.tra)} NM`,`Cruise · start descent in ${nm(p.tra)} NM`);
      case 3:return Lg(`Discesa verso ${p.nomeFaf} a ${p.qFaf} ft · ${nm(p.tra)} NM`,`Descend to ${p.nomeFaf} at ${p.qFaf} ft · ${nm(p.tra)} NM`);
      case 4:return Lg(`Finale pista ${p.te.nome} · ${nm(p.tra)} NM · segui il PAPI`,`Final runway ${p.te.nome} · ${nm(p.tra)} NM · follow the PAPI`);
      default:return Lg(`Atterrato a ${p.arr.codice}!`,`Landed at ${p.arr.codice}!`);
    }
  }
  return {calcola,aggiorna,bersaglio,html,testoFase,get piano(){return piano;},impostaCom(f,g){comDi=f;terraDi=g||null;}};
};
})();
