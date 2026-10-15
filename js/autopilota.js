/* =====================================================================
   AUTOPILOTA (base), ispirato al Garmin GFC 700 del Cessna 172 con G1000
   - inserito (AP) tiene la PRUA scelta (modo HDG: vira verso il "bug" di
     prua, al massimo 20° di inclinazione) e la QUOTA scelta (modo ALT);
   - se cambi la quota scelta sale o scende alla velocità verticale scelta
     (modo VS) e, arrivato vicino, la aggancia da sola (ALTS, poi ALT);
   - come sul 172 vero non tocca la manetta: se la velocità scende troppo
     abbassa il muso (protezione di velocità), se sale troppo lo alza;
   - muove l'equilibratore e, piano piano, il trim (così quando lo stacchi
     l'aereo è già "trimmato" e non dà strappi);
   - si stacca da solo in caso di stallo o di inclinazione / assetto
     eccessivi (e con un segnale acustico, in js/main.js).
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
    lat:'HDG',           // 'HDG' (segue la prua scelta) o 'ROL' (ali livellate)
    vert:'ALT',          // 'ALT' (tiene la quota) o 'VS' (sale/scende verso la quota scelta)
    altTenuta:0,         // quota tenuta in ALT (ft)
    hdgSel:0,            // prua scelta (°)
    altSel:0,            // quota scelta (ft), multipli di 100
    vsSel:500,           // velocità verticale per salire o scendere (ft/min, sempre positiva)
    limite:'',           // '' oppure 'BASSA' / 'ALTA' quando interviene la protezione di velocità
  };
  let tetaCmd=0, iPitch=0, iAil=0, verso=0;   // verso: da che parte hai girato la prua scelta (per le virate di 180°)
  const fwd=new THREE.Vector3(), dx=new THREE.Vector3(), su=new THREE.Vector3();
  function misura(st){
    fwd.set(0,0,-1).applyQuaternion(st.q);dx.set(1,0,0).applyQuaternion(st.q);su.set(0,1,0).applyQuaternion(st.q);
    return {
      pitch:Math.asin(clamp(fwd.y,-1,1))*R2D,
      bank:Math.atan2(-dx.y,su.y)*R2D,           // + = ala destra bassa
      hdg:giro(Math.atan2(fwd.x,-fwd.z)*R2D),
      p:-st.w.z*R2D, q:st.w.x*R2D,               // ratei di rollio e di beccheggio (°/s)
      vs:st.vs*FPM, alt:st.pos.y*FT, ias:st.ias*KT,
    };
  }
  // inserisce l'autopilota: tiene prua e quota attuali (la quota arrotondata ai 100 ft)
  function inserisci(st,elev0){
    if(st.aTerra||st.crashed) return L('L\'autopilota si inserisce solo in volo.','The autopilot can only be engaged in flight.');
    const m=misura(st);
    if(Math.abs(m.bank)>45||Math.abs(m.pitch)>25) return L('Prima rimetti l\'aereo più dritto: troppa inclinazione per l\'autopilota.','Level the aircraft first: too much bank or pitch for the autopilot.');
    ap.attivo=true;ap.hdgSel=Math.round(m.hdg)%360;ap.altSel=Math.round(m.alt/100)*100;ap.altTenuta=ap.altSel;ap.vert='ALT';ap.lat='HDG';ap.limite='';
    tetaCmd=m.pitch;iPitch=clamp(elev0||0,-0.4,0.4);iAil=0;verso=0;   // parte dall'equilibratore attuale: niente strappi
    return '';
  }
  function disinserisci(){ap.attivo=false;ap.limite='';}
  // cambia la quota scelta: se è lontana si passa in VS (sale o scende verso di lei)
  function cambiaQuota(df){
    ap.altSel=clamp(Math.round((ap.altSel+df)/100)*100,500,18000);
    if(ap.attivo)ap.vert='VS';
  }
  function cambiaPrua(dg){ap.hdgSel=Math.round(giro(ap.hdgSel+dg))%360;verso=Math.sign(dg);}
  function cambiaVs(dv){ap.vsSel=clamp(ap.vsSel+dv,100,1500);}
  /* modi scelti col tasto (scheda AP), come sul GFC 700. Restituiscono un testo se il modo non si può scegliere */
  function modoHdg(){ap.lat=ap.lat==='HDG'?'ROL':'HDG';verso=0;return '';}          // HDG <-> ali livellate
  function modoAlt(st){ap.altTenuta=Math.round(misura(st).alt/10)*10;ap.vert='ALT';return '';}   // tiene la quota di adesso
  function modoVs(st){
    if(Math.abs(ap.altSel-misura(st).alt)<60) return L('Scegli prima una quota diversa da quella attuale (W/S o i pulsanti QUOTA).','First choose an altitude different from the current one (W/S or the ALT buttons).');
    ap.vert='VS';return '';
  }
  function pruaAttuale(st){ap.hdgSel=Math.round(misura(st).hdg)%360;verso=0;}

  /* comandi dell'autopilota per questo passo: {elev, ail}; null se si è staccato (motivo in ap.staccato) */
  function comanda(st,dt){
    if(!ap.attivo) return null;
    const m=misura(st);
    // si stacca da solo: stallo, assetti fuori dai limiti, a terra
    let motivo='';
    if(st.avvisoStallo&&m.ias<A.velocita.vs1+2)motivo=L('stallo','stall');
    else if(Math.abs(m.bank)>60||Math.abs(m.pitch)>30)motivo=L('assetto fuori dai limiti','attitude out of limits');
    else if(st.aTerra)motivo=L('a terra','on the ground');
    if(motivo){disinserisci();ap.staccato=motivo;return null;}

    /* ---- laterale: HDG. Inclinazione voluta proporzionale all'errore di prua (max 20°) ---- */
    let errH=diff(ap.hdgSel,m.hdg);
    if(Math.abs(errH)>150&&verso)errH=verso*Math.abs(errH);   // virata grande: dalla parte in cui hai girato
    else if(Math.abs(errH)<5)verso=0;
    const bankCmd=ap.lat==='ROL'?0:clamp(errH*1.2,-20,20);
    // con un piccolo integrale, che compensa la coppia dell'elica a tutta manetta e bassa velocità
    iAil=clamp(iAil+(bankCmd-m.bank)*0.003*dt,-0.12,0.12);
    const ail=clamp(0.035*(bankCmd-m.bank)-0.012*m.p+iAil,-0.35,0.35);

    /* ---- verticale: ALT o VS, poi assetto voluto ---- */
    const errA=(ap.vert==='VS'?ap.altSel:ap.altTenuta)-m.alt;
    let vsCmd;
    if(ap.vert==='VS'){
      vsCmd=Math.sign(errA)*ap.vsSel;
      // aggancio della quota (ALTS): poco prima di arrivarci, con un anticipo che cresce con la velocità verticale
      if(Math.abs(errA)<Math.max(60,Math.abs(m.vs)*0.12)){ap.vert='ALT';ap.altTenuta=ap.altSel;}
    }
    if(ap.vert==='ALT')vsCmd=clamp(((ap.altTenuta-m.alt))*4,-Math.max(500,ap.vsSel),Math.max(500,ap.vsSel));
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
  // riga di stato per il PFD (come la barra dei modi del G1000)
  function stato(){
    if(!ap.attivo) return null;
    return {lat:ap.lat,vert:ap.vert==='ALT'?'ALT':'VS',vsSel:ap.vsSel,altSel:ap.altSel,hdgSel:ap.hdgSel,limite:ap.limite,
      armato:ap.vert==='VS'?'ALTS':''};
  }
  return Object.assign(ap,{inserisci,disinserisci,comanda,modoHdg,modoAlt,modoVs,cambiaQuota,cambiaPrua,cambiaVs,pruaAttuale,stato,misura});
};
})();
