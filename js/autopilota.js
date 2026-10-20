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
   AUTOPILOTA, ispirato al Garmin GFC 700 del Cessna 172 con G1000
   Modi laterali (dove va):
   - ROL  ali livellate
   - HDG  vira verso la prua scelta (al massimo 20° di inclinazione)
   - NAV  segue la sorgente scelta col tasto CDI: GPS (la rotta magenta del
          piano di volo) oppure NAV1 (radiale del VOR o localizzatore)
   - APR  avvicinamento ILS: LOC (localizzatore) e, sotto, GS (sentiero)
   Modi verticali (quota):
   - ALT  tiene la quota;  VS  tiene una velocità verticale;  GS  scende
          sul sentiero di discesa dell'ILS (3°)
   NAV, LOC e GS si "armano" (scritti in bianco) e si agganciano da soli
   quando l'aereo arriva sulla rotta o sul sentiero (diventano verdi);
   ALTS aggancia la quota scelta.
   Come sul 172 vero non tocca la manetta (protezione di velocità col muso),
   muove anche il trim e non atterra da solo: ai minimi (200 ft) avvisa.
   Convenzioni: elev positivo = cabra, ail positivo = rollio a destra.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const L=(it,en)=>SIM.L?SIM.L(it,en):it;
const D2R=Math.PI/180, R2D=180/Math.PI, KT=1.943844, FT=3.28084, FPM=196.85;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const giro=a=>((a%360)+360)%360;
const diff=(a,b)=>((a-b+540)%360)-180;   // a - b fra -180 e 180

SIM.creaAutopilota=function(A){
  const ap={
    attivo:false,
    lat:'HDG',           // 'ROL', 'HDG', 'NAV' (sorgente del CDI) o 'LOC' (avvicinamento)
    latArm:'',           // modo laterale armato: '' | 'NAV' | 'LOC'
    vert:'ALT',          // 'ALT', 'VS' o 'GS'
    gsArm:false,         // sentiero di discesa armato (APR)
    fonte:'GPS',         // sorgente della navigazione per NAV: 'GPS', 'VOR' o 'LOC'
    altTenuta:0,         // quota tenuta in ALT (ft)
    hdgSel:0,            // prua scelta (°)
    altSel:0,            // quota scelta (ft), multipli di 100
    vsSel:500,           // velocità verticale scelta (ft/min, + = sale, − = scende)
    limite:'',           // '' oppure 'BASSA' / 'ALTA' quando interviene la protezione di velocità
    eventi:[],           // messaggi per js/main.js (agganci, segnale perso, minimi)
  };
  let tetaCmd=0, iPitch=0, iAil=0;
  let verso=0;         // da che parte hai girato la prua scelta (per le virate di 180°)
  let ultimaAlt=0;
  let lontano=false;   // la quota scelta era davanti (ALTS armato)
  let minimiDetti=false;
  const fwd=new THREE.Vector3(), dx=new THREE.Vector3(), su=new THREE.Vector3();
  function misura(st){
    fwd.set(0,0,-1).applyQuaternion(st.q);dx.set(1,0,0).applyQuaternion(st.q);su.set(0,1,0).applyQuaternion(st.q);
    return {
      pitch:Math.asin(clamp(fwd.y,-1,1))*R2D,
      bank:Math.atan2(-dx.y,su.y)*R2D,           // + = ala destra bassa
      hdg:giro(Math.atan2(fwd.x,-fwd.z)*R2D),
      trk:st.gs>15?giro(Math.atan2(st.vel.x,-st.vel.z)*R2D):giro(Math.atan2(fwd.x,-fwd.z)*R2D),   // traccia al suolo
      p:-st.w.z*R2D, q:st.w.x*R2D,               // ratei di rollio e di beccheggio (°/s)
      vs:st.vs*FPM, alt:st.pos.y*FT, ias:st.ias*KT,
    };
  }
  const evento=t=>{ap.eventi.push(t);};
  // inserisce l'autopilota: tiene prua e quota attuali (la quota arrotondata ai 100 ft)
  function inserisci(st,elev0){
    if(st.aTerra||st.crashed) return L('L\'autopilota si inserisce solo in volo.','The autopilot can only be engaged in flight.');
    const m=misura(st);
    ultimaAlt=m.alt;
    if(Math.abs(m.bank)>45||Math.abs(m.pitch)>25) return L('Prima rimetti l\'aereo più dritto: troppa inclinazione per l\'autopilota.','Level the aircraft first: too much bank or pitch for the autopilot.');
    Object.assign(ap,{attivo:true,hdgSel:Math.round(m.hdg)%360,altSel:Math.round(m.alt/100)*100,vert:'ALT',lat:'HDG',latArm:'',gsArm:false,limite:''});
    ap.altTenuta=ap.altSel;
    tetaCmd=m.pitch;iPitch=clamp(elev0||0,-0.4,0.4);iAil=0;verso=0;minimiDetti=false;   // parte dall'equilibratore attuale: niente strappi
    return '';
  }
  function disinserisci(){ap.attivo=false;ap.limite='';ap.latArm='';ap.gsArm=false;}
  // cambia la quota scelta: da ALT si passa in VS verso di lei (alla velocità verticale scelta, col segno giusto)
  function cambiaQuota(df){
    ap.altSel=clamp(Math.round((ap.altSel+df)/100)*100,500,18000);
    if(!ap.attivo||ap.vert==='GS') return;
    const err=ap.altSel-ultimaAlt;
    if(Math.abs(err)<60) return;
    const v=Math.max(100,Math.abs(ap.vsSel)||500);
    if(ap.vert==='ALT'||Math.sign(ap.vsSel)!==Math.sign(err)){ap.vert='VS';ap.vsSel=Math.sign(err)*v;}
  }
  function cambiaPrua(dg){ap.hdgSel=Math.round(giro(ap.hdgSel+dg))%360;verso=Math.sign(dg);}
  /* cambia la velocità verticale scelta (anche in discesa). Come la rotella UP/DN del GFC 700:
     se si è in ALT si passa in VS partendo da 0 (quindi +100, +200… oppure −100, −200…) */
  function cambiaVs(dv){
    if(ap.attivo&&ap.vert==='ALT'){ap.vert='VS';ap.vsSel=0;}
    if(ap.vert==='GS') return;
    ap.vsSel=clamp(ap.vsSel+dv,-1500,1500);
  }
  /* ---------- modi scelti col tasto (scheda AP), come sul GFC 700 ----------
     restituiscono un testo se il modo non si può scegliere. nav = misura della sorgente (vedi comanda) */
  function modoHdg(){ap.lat=ap.lat==='HDG'?'ROL':'HDG';ap.latArm='';verso=0;return '';}   // HDG <-> ali livellate
  function modoAlt(st){ap.altTenuta=Math.round(misura(st).alt/10)*10;ap.vert='ALT';ap.gsArm=false;return '';}
  // VS: tiene la velocità verticale di adesso (arrotondata ai 100 ft/min); poi si cambia con ±100
  function modoVs(st){
    ap.vsSel=clamp(Math.round(misura(st).vs/100)*100,-1500,1500);
    ap.vert='VS';ap.gsArm=false;return '';
  }
  // NAV: segue la sorgente del CDI; se l'ago è a fondo scala resta armato e la aggancia arrivandoci
  function modoNav(st,nav){
    if(ap.lat==='NAV'||ap.latArm==='NAV'){ap.latArm='';if(ap.lat==='NAV'){ap.lat='HDG';pruaAttuale(st);}return '';}
    if(!nav||nav.assente) return nav&&nav.fonte==='GPS'?L('Non c\'è una rotta GPS: scegli una destinazione.','There is no GPS route: choose a destination.')
      :L('NAV1 non è sintonizzato: scegli un VOR (V o il menu NAV1) oppure passa al GPS (CDI).','NAV1 is not tuned: choose a VOR (V or the NAV1 menu) or switch to GPS (CDI).');
    if(nav.fonte==='LOC') return L('Con l\'ILS si usa APR (avvicinamento).','With the ILS use APR (approach).');
    ap.fonte=nav.fonte;ap.latArm='NAV';
    if(ap.lat==='LOC')ap.lat='HDG';
    return '';
  }
  // APR: arma LOC e GS dell'ILS sintonizzato su NAV1 (la sorgente del CDI deve essere NAV1: ci pensa js/main.js)
  function modoApr(st,nav){
    if(ap.lat==='LOC'||ap.latArm==='LOC'||ap.vert==='GS'||ap.gsArm){
      ap.latArm='';ap.gsArm=false;
      if(ap.lat==='LOC'){ap.lat='HDG';pruaAttuale(st);}
      if(ap.vert==='GS')modoAlt(st);
      return '';
    }
    if(!nav||nav.fonte!=='LOC') return L('Per l\'avvicinamento sintonizza l\'ILS della pista (L o il menu NAV1).','For the approach tune the runway ILS (L or the NAV1 menu).');
    if(ap.lat==='NAV')ap.lat='HDG';
    ap.latArm='LOC';ap.gsArm=true;minimiDetti=false;
    return '';
  }
  // la sorgente del CDI è cambiata: NAV non vale più (come sul vero, si torna ad ali livellate)
  function sorgenteCambiata(st){
    if(ap.lat==='NAV'||ap.lat==='LOC'){ap.lat='ROL';evento(L('Sorgente di navigazione cambiata: autopilota in ROL (ali livellate).','Navigation source changed: autopilot in ROL (wings level).'));}
    if(ap.latArm==='NAV')ap.latArm='';
  }
  // ALTS armato: la quota scelta è nella direzione in cui si sale o si scende (allora la aggancia da solo)
  // (e davvero davanti, almeno 80 ft: se si parte in VS dalla quota scelta non la si riaggancia subito)
  const armato=()=>ap.vert==='VS'&&ap.vsSel!==0&&(ap.altSel-ultimaAlt)*Math.sign(ap.vsSel)>(lontano?0:80);
  function pruaAttuale(st){ap.hdgSel=Math.round(misura(st).hdg)%360;verso=0;}

  /* comandi dell'autopilota per questo passo: {elev, ail}; null se si è staccato (motivo in ap.staccato).
     nav = misura della sorgente del CDI, preparata da js/main.js:
       {fonte:'GPS'|'VOR'|'LOC', assente, ricevuto, dev (−1..1, + = rotta a destra), dtk (rotta voluta, °),
        xtk (m dalla rotta, + = rotta a destra), gsErr (m sopra il sentiero, solo ILS), gsDev} */
  function comanda(st,dt,nav){
    if(!ap.attivo) return null;
    const m=misura(st);ultimaAlt=m.alt;
    // si stacca da solo: stallo, assetti fuori dai limiti, a terra
    let motivo='';
    if(st.avvisoStallo&&m.ias<A.velocita.vs1+2)motivo=L('stallo','stall');
    else if(Math.abs(m.bank)>60||Math.abs(m.pitch)>30)motivo=L('assetto fuori dai limiti','attitude out of limits');
    else if(st.aTerra)motivo=L('a terra','on the ground');
    if(motivo){disinserisci();ap.staccato=motivo;return null;}

    /* ---- agganci dei modi armati e segnale perso ---- */
    const ok=nav&&nav.ricevuto;
    if(ap.latArm&&ok&&Math.abs(nav.dev)<0.9&&Math.abs(diff(nav.dtk,m.hdg))<100&&(ap.latArm==='LOC')===(nav.fonte==='LOC')){
      ap.lat=ap.latArm;ap.fonte=nav.fonte;ap.latArm='';
      evento(L(`Autopilota: <b>${nav.fonte}</b> agganciato, segue la rotta ${String(Math.round(nav.dtk)%360).padStart(3,'0')}°`,`Autopilot: <b>${nav.fonte}</b> captured, tracking ${String(Math.round(nav.dtk)%360).padStart(3,'0')}°`));
    }
    if((ap.lat==='NAV'||ap.lat==='LOC')&&!ok){
      ap.lat='ROL';if(ap.vert==='GS'){ap.vert='ALT';ap.altTenuta=Math.round(m.alt/10)*10;}
      evento(L('Autopilota: segnale di navigazione perso, passa a ROL (ali livellate).','Autopilot: navigation signal lost, reverting to ROL (wings level).'));
    }
    if(ap.gsArm&&ap.lat==='LOC'&&ok&&nav.gsDev!=null&&Math.abs(nav.gsDev)<0.25){
      ap.vert='GS';ap.gsArm=false;
      evento(L('Autopilota: <b>GS</b> agganciato, scende sul sentiero. Tieni la velocità con la manetta (70–90 kt).','Autopilot: <b>GS</b> captured, descending on the glide slope. Hold the speed with the throttle (70–90 kt).'));
    }
    if(ap.vert==='GS'&&!(ok&&nav.gsErr!=null)){
      ap.vert='ALT';ap.altTenuta=Math.round(m.alt/10)*10;
      evento(L('Autopilota: sentiero di discesa perso, tiene la quota (ALT).','Autopilot: glide slope lost, holding altitude (ALT).'));
    }
    // minimi: il 172 non atterra da solo, a 200 ft sopra la pista si stacca e si atterra a mano
    if((ap.lat==='LOC'||ap.vert==='GS')&&!minimiDetti&&st.agl*FT<200){minimiDetti=true;evento('MINIMI');}

    /* ---- laterale: inclinazione voluta ---- */
    let bankCmd=0;
    if(ap.lat==='HDG'){
      let errH=diff(ap.hdgSel,m.hdg);
      if(Math.abs(errH)>150&&verso)errH=verso*Math.abs(errH);   // virata grande: dalla parte in cui hai girato
      else if(Math.abs(errH)<5)verso=0;
      bankCmd=clamp(errH*1.2,-20,20);
    }else if(ap.lat==='NAV'||ap.lat==='LOC'){
      // traccia voluta = rotta + angolo d'intercettazione che cresce con la distanza dalla rotta;
      // si insegue la traccia al suolo, così il vento è compensato da solo
      const loc=ap.lat==='LOC';
      const trkDes=nav.dtk+clamp(nav.xtk*(loc?0.05:0.03),loc?-30:-45,loc?30:45);
      bankCmd=clamp(diff(trkDes,m.trk)*1.5,loc?-15:-20,loc?15:20);
    }
    // con un piccolo integrale, che compensa la coppia dell'elica a tutta manetta e bassa velocità
    iAil=clamp(iAil+(bankCmd-m.bank)*0.003*dt,-0.12,0.12);
    const ail=clamp(0.035*(bankCmd-m.bank)-0.012*m.p+iAil,-0.35,0.35);

    /* ---- verticale: ALT, VS o GS, poi assetto voluto ---- */
    let vsCmd;
    if(ap.vert==='VS'){
      vsCmd=ap.vsSel;
      // aggancio della quota (ALTS), solo se è nella direzione giusta: poco prima di arrivarci, con un anticipo
      // che cresce con la velocità verticale
      const arm=armato(), errA=ap.altSel-m.alt;
      if(arm&&lontano&&Math.abs(errA)<Math.max(60,Math.abs(m.vs)*0.12)){ap.vert='ALT';ap.altTenuta=ap.altSel;lontano=false;}
      else lontano=arm;
    }
    if(ap.vert==='GS'){
      // discesa del sentiero di 3° alla velocità al suolo attuale, più una correzione per rientrarci
      const base=-st.gs*KT*101.27*Math.tan(3*D2R);
      vsCmd=base+clamp(-nav.gsErr*FT*3,-500,500);
    }
    if(ap.vert==='ALT')vsCmd=clamp((ap.altTenuta-m.alt)*4,-Math.max(500,Math.abs(ap.vsSel)),Math.max(500,Math.abs(ap.vsSel)));
    /* assetto voluto: varia con l'errore di velocità verticale (°/s). La manetta è del pilota, quindi c'è
       una protezione di velocità continua: fra "quanto alzare il muso per la VS" e "quanto per non scendere
       sotto vMin" si prende il più prudente (e lo stesso, al contrario, per non superare vMax) */
    const vMin=65, vMax=A.velocita.vno-4;
    const rVs=clamp((vsCmd-m.vs)*0.004,-2,2);
    const rLento=clamp((m.ias-vMin)*0.15,-2,2), rVeloce=clamp((m.ias-vMax)*0.15,-2,2);
    let r=rVs;ap.limite='';
    if(rLento<r){r=rLento;ap.limite='BASSA';}
    if(rVeloce>r){r=rVeloce;ap.limite='ALTA';}
    tetaCmd=clamp(tetaCmd+r*dt,-10,13);
    // anello interno: equilibratore sull'errore di assetto, smorzato col rateo di beccheggio, con integrale
    const errT=tetaCmd-m.pitch;
    iPitch=clamp(iPitch+errT*0.02*dt,-0.4,0.4);
    let elev=clamp(0.05*errT-0.025*m.q+iPitch,-0.5,0.5);
    // trim automatico: sposta lentamente il trim al posto dell'integrale
    const dTrim=clamp(iPitch*0.5*dt,-0.03*dt,0.03*dt);
    if(Math.abs(st.trim+dTrim)<0.5){st.trim+=dTrim;iPitch-=dTrim;elev-=dTrim;}
    return {elev,ail};
  }
  /* barra dei modi per il PFD (come quella del G1000): attivi in verde, armati in bianco */
  function stato(){
    if(!ap.attivo) return null;
    const lat=ap.lat==='NAV'?ap.fonte:ap.lat;   // NAV si scrive con la sorgente: GPS, VOR
    const latArm=ap.latArm==='NAV'?ap.fonte:ap.latArm;
    const vert=ap.vert==='VS'?`VS ${ap.vsSel>0?'+':''}${ap.vsSel}`:ap.vert;
    const arm=[latArm,ap.gsArm?'GS':'',armato()?'ALTS':''].filter(Boolean);
    return {lat,vert,armati:arm,vsSel:ap.vsSel,altSel:ap.altSel,hdgSel:ap.hdgSel,limite:ap.limite,
      armato:arm.join(' ')};
  }
  return Object.assign(ap,{inserisci,disinserisci,comanda,modoHdg,modoAlt,modoVs,modoNav,modoApr,sorgenteCambiata,
    cambiaQuota,cambiaPrua,cambiaVs,pruaAttuale,stato,misura});
};
})();
