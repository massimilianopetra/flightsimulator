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
   MISSIONI
   Si scelgono nel briefing e danno uno scopo al volo:
   - A TEMPO: dalla partenza alla destinazione entro un tempo limite
     (calcolato dalla distanza); si arriva quando si tocca la pista.
   - GIRO A TAPPE (corto 2, lungo 3): aeroporti vicini scelti a caso, da
     toccare in ordine (atterraggio completo o tocca e riparti), poi il
     ritorno a casa.
   - ATTERRAGGIO DI PRECISIONE: si parte in finale; il contatto vale fino
     a 100 punti (velocità verticale, punto di mira, asse pista, velocità).
   Ogni missione vale da 0 a 3 stelle. js/main.js chiama avvia, aggiorna,
   atterraggio e incidente; il risultato finisce nel libretto di volo.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const L=(it,en)=>SIM.L?SIM.L(it,en):it;
const NM=1852, KT=1.943844;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lin=(v,buono,zero)=>clamp((zero-v)/(zero-buono),0,1);   // 1 fino a "buono", 0 da "zero" in poi
const mmss=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const stelle=n=>'★'.repeat(n)+'☆'.repeat(3-n);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// punto di mira dopo la soglia, dove stanno i PAPI (come in js/mondo.js)
const mira=pi=>pi.L>=1200?300:pi.L>=800?250:150;
// velocità dell'aereo scelto: crociera stimata (95 kt per il Cessna) e velocità buona al contatto nella precisione
const AE=window.AEREO||{}, VCROC=AE.prestazioni?AE.prestazioni.crociera-5:95, VC=(AE.velocita&&AE.velocita.contatto)||[45,62];
// minuti stimati per una tratta: crociera più 6 minuti tra decollo, salita, circuito e atterraggio
const stima=(a,b)=>dist(a,b)/NM/VCROC*60+6;

SIM.creaMissioni=function(T){
  let m=null;   // missione scelta (preparata nel briefing, attiva in volo)

  const adatto=a=>a.quota<1500&&a.piste.some(p=>p.L>=600);
  // tappe del giro: aeroporti vicini, uno dopo l'altro, senza allontanarsi troppo da casa
  function scegliTappe(casa,n){
    const scelte=[];let da=casa;
    for(let i=0;i<n;i++){
      const ultima=i===n-1;
      let cand=[];
      for(const [min,max] of [[6,30],[4,45],[3,70]]){
        cand=T.aeroporti.filter(a=>a!==casa&&!scelte.includes(a)&&adatto(a)&&
          dist(a,da)>=min*NM&&dist(a,da)<=max*NM&&dist(a,casa)<=(ultima?max:max*1.3)*NM&&
          scelte.every(s=>dist(s,a)>4*NM));
        if(cand.length)break;
      }
      if(!cand.length)break;
      const a=cand[Math.floor(Math.random()*cand.length)];
      scelte.push(a);da=a;
    }
    return scelte;
  }
  /* prepara la missione del briefing. info = {partenza, dest, finale:{ap,te}} */
  function prepara(tipo,info,stessoGiro){
    const casa=info.partenza.ap||null;
    const vecchie=m&&m.tipo===tipo&&m.casa===casa&&stessoGiro?m.tappe:null;
    m=null;
    if(!tipo||tipo==='libero') return null;
    const base={tipo,casa,stato:'pronto',tempo:0,idx:0,atterraggi:[],stelle:0,punti:null,motivo:'',visto:false};
    if(tipo==='tempo'){
      const d=info.dest;
      if(!casa||!d||d===casa){m=Object.assign(base,{nome:L('A tempo','Against the clock'),errore:L('Scegli una destinazione diversa dalla partenza.','Choose a destination different from the departure.')});return m;}
      const limite=Math.ceil(stima(casa,d)*1.25+(info.partenza.parcheggio?4:0))*60;
      m=Object.assign(base,{nome:L('A tempo','Against the clock'),tappe:[d],limite,rotta:`${casa.codice}–${d.codice}`});
    }else if(tipo==='tappe2'||tipo==='tappe3'){
      if(!casa){m=Object.assign(base,{nome:L('Giro a tappe','Tour'),errore:L('Serve un aeroporto di partenza.','A departure airport is needed.')});return m;}
      const n=tipo==='tappe2'?2:3;
      const sc=vecchie?vecchie.slice(0,-1):scegliTappe(casa,n);
      if(!sc.length){m=Object.assign(base,{nome:L('Giro a tappe','Tour'),errore:L('Non ci sono aeroporti abbastanza vicini per un giro.','There are no airports close enough for a tour.')});return m;}
      const tappe=sc.concat([casa]);
      let rif=info.partenza.parcheggio?4:0,da=casa;
      for(const t of tappe){rif+=stima(da,t);da=t;}
      m=Object.assign(base,{nome:n===2?L('Giro corto','Short tour'):L('Giro lungo','Long tour'),tappe,rif:Math.ceil(rif*1.1)*60});
    }else if(tipo==='precisione'){
      const f=info.finale;
      if(!f){m=Object.assign(base,{nome:L('Precisione','Precision'),errore:L('Non c\'è una pista per l\'atterraggio.','There is no runway to land on.')});return m;}
      m=Object.assign(base,{nome:L('Atterraggio di precisione','Precision landing'),tappe:[f.ap],te:f.te,mira:mira(f.te.pista)});
    }
    return m;
  }
  const valida=()=>m&&!m.errore;
  // descrizione per il briefing
  function descrizione(){
    if(!m) return '';
    if(m.errore) return `<b>${m.nome}</b>: ${m.errore}`;
    if(m.tipo==='tempo') return L(`<b>A tempo</b>: atterra a <b>${m.tappe[0].codice} – ${m.tappe[0].nome}</b> entro <b>${mmss(m.limite)}</b> minuti. Il cronometro parte subito; vale il momento in cui le ruote toccano la pista. ★ in tempo · ★★ e atterraggio buono · ★★★ e con un quinto del tempo di margine.`,
      `<b>Against the clock</b>: land at <b>${m.tappe[0].codice} – ${m.tappe[0].nome}</b> within <b>${mmss(m.limite)}</b> minutes. The clock starts right away; it stops when the wheels touch the runway. ★ in time · ★★ and a good landing · ★★★ and a fifth of the time to spare.`);
    if(m.tipo==='precisione') return L(`<b>Atterraggio di precisione</b> sulla pista <b>${m.te.nome}</b> di <b>${m.tappe[0].codice}</b>: parti in finale. Tocca vicino al punto di mira (<b>${m.mira} m</b> dopo la soglia, all'altezza dei PAPI), sulla linea centrale, piano e a ${VC[0]}–${VC[1]} nodi. Fino a 100 punti: ★ da 40, ★★ da 65, ★★★ da 85.`,
      `<b>Precision landing</b> on runway <b>${m.te.nome}</b> at <b>${m.tappe[0].codice}</b>: you start on final. Touch down near the aiming point (<b>${m.mira} m</b> past the threshold, abeam the PAPI), on the centre line, gently and at ${VC[0]}–${VC[1]} knots. Up to 100 points: ★ from 40, ★★ from 65, ★★★ from 85.`);
    const elenco=m.tappe.map((a,i)=>`<b>${a.codice}</b>${i===m.tappe.length-1?L(' (casa)',' (home)'):''}`).join(' ▸ ');
    return L(`<b>${m.nome}</b>: ${elenco}. Tocca ogni pista nell'ordine (atterraggio completo o tocca e riparti), poi torna a casa. Tempo di riferimento <b>${mmss(m.rif)}</b>. ★ giro completo · ★★ e tutti gli atterraggi buoni · ★★★ e entro il tempo di riferimento.`,
      `<b>${m.nome}</b>: ${elenco}. Touch each runway in order (full stop or touch-and-go), then fly home. Reference time <b>${mmss(m.rif)}</b>. ★ tour completed · ★★ and every landing good · ★★★ and within the reference time.`);
  }
  // all'inizio del volo e a ogni "ricomincia": riparte da capo
  function avvia(){
    if(!valida()) return;
    Object.assign(m,{stato:'in corso',tempo:0,idx:0,atterraggi:[],stelle:0,punti:null,motivo:'',visto:false});
  }
  const inCorso=()=>valida()&&m.stato==='in corso';
  const prossima=()=>valida()?m.tappe[Math.min(m.idx,m.tappe.length-1)]:null;
  function fallisci(motivo){if(!inCorso())return;m.stato='fallita';m.motivo=motivo;}
  // ogni fotogramma a gioco attivo; restituisce un testo da mostrare quando succede qualcosa
  function aggiorna(dt){
    if(!inCorso()||m.tipo==='precisione') return null;
    m.tempo+=dt;
    if(m.tipo==='tempo'&&m.tempo>m.limite){fallisci(L('Tempo scaduto.','Time is up.'));return L('<b>Tempo scaduto!</b> La missione è fallita: puoi continuare a volare o riprovare (R).','<b>Time is up!</b> The mission failed: keep flying or try again (R).');}
    return null;
  }
  /* contatto con il suolo. a = {ap (aeroporto della pista toccata o null), suPista, fpm, dalla (m dopo la soglia),
     lat (m dalla linea centrale), W (larghezza pista), kt (velocità all'aria), te}. Restituisce {msg, dest} */
  function atterraggio(a){
    if(!inCorso()) return null;
    const buono=a.suPista&&a.fpm<450;
    if(m.tipo==='precisione'){
      if(a.ap!==m.tappe[0]||!a.suPista){fallisci(L('Atterraggio fuori dalla pista.','Landed off the runway.'));return {msg:L('Fuori pista: missione fallita.','Off the runway: mission failed.')};}
      const pVs=30*lin(a.fpm,100,600);
      const pMira=a.dalla<0?0:30*lin(Math.abs(a.dalla-m.mira),30,330);
      const pAsse=20*lin(a.lat,1,Math.max(2,a.W/2));
      const fuori=a.kt<VC[0]?VC[0]-a.kt:a.kt>VC[1]?a.kt-VC[1]:0;
      const pVel=20*lin(fuori,0,15);
      m.punti=Math.round(pVs+pMira+pAsse+pVel);
      m.dettaglio={pVs:Math.round(pVs),pMira:Math.round(pMira),pAsse:Math.round(pAsse),pVel:Math.round(pVel),fpm:Math.round(a.fpm),dalla:Math.round(a.dalla),lat:a.lat,kt:Math.round(a.kt)};
      m.stelle=m.punti>=85?3:m.punti>=65?2:m.punti>=40?1:0;
      if(m.stelle){m.stato='riuscita';}else{m.stato='fallita';m.motivo=L('Meno di 40 punti.','Less than 40 points.');}
      return {msg:L(`Precisione: <b>${m.punti} punti</b> ${stelle(m.stelle)}`,`Precision: <b>${m.punti} points</b> ${stelle(m.stelle)}`)};
    }
    const obiettivo=m.tappe[m.idx];
    if(a.ap!==obiettivo){
      return a.ap?{msg:L(`Questa non è la tappa: la prossima è <b>${obiettivo.codice}</b>.`,`This is not the stop: the next one is <b>${obiettivo.codice}</b>.`)}:null;
    }
    m.atterraggi.push({ap:a.ap.codice,fpm:Math.round(a.fpm),buono,tempo:m.tempo});
    m.idx++;
    if(m.idx<m.tappe.length){
      const p=m.tappe[m.idx],casa=m.idx===m.tappe.length-1;
      return {msg:L(`Tappa <b>${a.ap.codice}</b> fatta! ${casa?'Ora torna a casa':'Prossima tappa'}: <b>${p.codice}</b> – ${p.nome}`,`Stop <b>${a.ap.codice}</b> done! ${casa?'Now fly home':'Next stop'}: <b>${p.codice}</b> – ${p.nome}`),dest:p};
    }
    // arrivati: missione compiuta
    const tuttiBuoni=m.atterraggi.every(x=>x.buono);
    if(m.tipo==='tempo')m.stelle=1+(tuttiBuoni?1:0)+(tuttiBuoni&&m.tempo<=m.limite*0.8?1:0);
    else m.stelle=1+(tuttiBuoni?1:0)+(tuttiBuoni&&m.tempo<=m.rif?1:0);
    m.stato='riuscita';
    return {msg:L(`<b>Missione compiuta!</b> ${stelle(m.stelle)} in ${mmss(m.tempo)}`,`<b>Mission complete!</b> ${stelle(m.stelle)} in ${mmss(m.tempo)}`)};
  }
  function incidente(){fallisci(L('Incidente.','Crash.'));}
  // finita e non ancora mostrata (main.js apre la finestra del risultato quando l'aereo è fermo)
  const daMostrare=()=>valida()&&(m.stato==='riuscita'||m.stato==='fallita')&&!m.visto;

  /* ---------- testi ---------- */
  // striscia in alto al centro
  function striscia(){
    if(!valida()||m.stato==='pronto') return '';
    if(m.stato==='riuscita') return `<b>${L('MISSIONE COMPIUTA','MISSION COMPLETE')}</b> <span class="stella">${stelle(m.stelle)}</span>`+(m.punti!=null?` · ${m.punti} ${L('punti','pts')}`:'');
    if(m.stato==='fallita') return `<b class="rosso">${L('MISSIONE FALLITA','MISSION FAILED')}</b> · ${m.motivo}`;
    const p=prossima();
    if(m.tipo==='precisione') return `<b>${L('PRECISIONE','PRECISION')}</b> ▸ ${p.codice} ${m.te.nome} · ${L('mira','aim')} ${m.mira} m`;
    if(m.tipo==='tempo'){
      const resta=m.limite-m.tempo,cl=resta<180?'rosso':resta<m.limite*0.2?'ambra':'';
      return `⏱ <b class="${cl}">${mmss(m.tempo)}</b> / ${mmss(m.limite)} · ▸ <b>${p.codice}</b>`;
    }
    const casa=m.idx===m.tappe.length-1;
    return `${casa?L('RITORNO','HOME'):L('TAPPA','STOP')} ${Math.min(m.idx+1,m.tappe.length-1)}/${m.tappe.length-1} ▸ <b>${p.codice}</b> · ⏱ <b class="${m.tempo>m.rif?'ambra':''}">${mmss(m.tempo)}</b>`;
  }
  // scheda MISSIONE
  function pannello(){
    if(!m) return `<div class="dim">${L('Nessuna missione: sceglila nel briefing (Esc).','No mission: choose one in the briefing (Esc).')}</div>`;
    if(m.errore) return `<div class="dim">${m.errore}</div>`;
    let h=`<div class="pv-testa"><b>${m.nome}</b><span>${m.stato==='riuscita'?stelle(m.stelle):''}</span></div>`;
    if(m.tipo==='precisione'){
      h+=`<div>${L(`Pista <b>${m.te.nome}</b> di ${m.tappe[0].codice} · punto di mira a <b>${m.mira} m</b> dalla soglia (PAPI)`,`Runway <b>${m.te.nome}</b> at ${m.tappe[0].codice} · aiming point <b>${m.mira} m</b> past the threshold (PAPI)`)}</div>`;
      h+=`<ul class="mi-punti"><li><b>30</b> ${L('velocità verticale (≤ 100 ft/min)','vertical speed (≤ 100 ft/min)')}</li><li><b>30</b> ${L('punto di contatto (± 30 m dalla mira)','touchdown point (± 30 m from the aim)')}</li><li><b>20</b> ${L('linea centrale (≤ 1 m)','centre line (≤ 1 m)')}</li><li><b>20</b> ${L('velocità '+VC[0]+'–'+VC[1]+' kt','speed '+VC[0]+'–'+VC[1]+' kt')}</li></ul>`;
      if(m.dettaglio)h+=dettaglioPrecisione();
    }else{
      h+=`<ol class="pv-tappe">`+m.tappe.map((a,i)=>{
        const fatto=i<m.idx,ora=i===m.idx&&m.stato==='in corso',x=m.atterraggi[i];
        return `<li class="${fatto?'fatto':''}${ora?' ora':''}"><b>${fatto?'✓':ora?'▸':i+1}</b><span>${a.codice} – ${a.nome}${x?` · ${mmss(x.tempo)} · ${x.fpm} ft/min`:''}</span></li>`;}).join('')+`</ol>`;
      h+=`<div class="pv-pista"><div><span class="lbl">${L('TEMPO','TIME')}</span><b>${mmss(m.tempo)}</b> / ${mmss(m.tipo==='tempo'?m.limite:m.rif)} ${m.tipo==='tempo'?L('limite','limit'):L('riferimento','reference')}</div></div>`;
    }
    if(m.stato==='fallita')h+=`<div class="pv-nota">${L('Missione fallita','Mission failed')}: ${m.motivo} ${L('Premi R per riprovare.','Press R to try again.')}</div>`;
    return h;
  }
  function dettaglioPrecisione(){
    const d=m.dettaglio;
    return `<table class="mi-tab"><tr><td>${L('Velocità verticale','Vertical speed')}</td><td>${d.fpm} ft/min</td><td><b>${d.pVs}</b>/30</td></tr>`+
      `<tr><td>${L('Contatto','Touchdown')}</td><td>${d.dalla} m (${L('mira','aim')} ${m.mira})</td><td><b>${d.pMira}</b>/30</td></tr>`+
      `<tr><td>${L('Linea centrale','Centre line')}</td><td>${d.lat.toFixed(1)} m</td><td><b>${d.pAsse}</b>/20</td></tr>`+
      `<tr><td>${L('Velocità','Speed')}</td><td>${d.kt} kt</td><td><b>${d.pVel}</b>/20</td></tr>`+
      `<tr class="tot"><td>${L('Totale','Total')}</td><td></td><td><b>${m.punti}</b>/100</td></tr></table>`;
  }
  // finestra del risultato
  function esito(){
    m.visto=true;
    const ok=m.stato==='riuscita';
    let h='';
    if(m.tipo==='precisione'&&m.dettaglio)h=dettaglioPrecisione();
    else if(m.tipo==='tempo')h=ok?`<p>${L(`Arrivato a <b>${m.tappe[0].codice}</b> in <b>${mmss(m.tempo)}</b> su ${mmss(m.limite)}.`,`Arrived at <b>${m.tappe[0].codice}</b> in <b>${mmss(m.tempo)}</b> out of ${mmss(m.limite)}.`)}</p>`:'';
    else if(ok)h=`<p>${L(`Giro completo in <b>${mmss(m.tempo)}</b> (riferimento ${mmss(m.rif)}).`,`Tour completed in <b>${mmss(m.tempo)}</b> (reference ${mmss(m.rif)}).`)}</p>`;
    if(m.atterraggi.length&&m.tipo!=='precisione')h+=`<ul class="mi-punti">`+m.atterraggi.map(x=>`<li><b>${x.ap}</b> ${x.fpm} ft/min ${x.buono?'✓':L('(duro o fuori pista)','(hard or off the runway)')}</li>`).join('')+`</ul>`;
    if(!ok)h+=`<p>${m.motivo}</p>`;
    if(ok&&m.stelle<3)h+=`<p class="dim">${consiglio()}</p>`;
    return {titolo:ok?L('MISSIONE COMPIUTA','MISSION COMPLETE'):L('MISSIONE FALLITA','MISSION FAILED'),stelle:ok?stelle(m.stelle):'',html:h,ok};
  }
  function consiglio(){
    if(m.tipo==='precisione'){
      const d=m.dettaglio,peggio=[['pVs',30,L('Riduci il rateo di discesa prima di toccare: richiama dolcemente e togli motore.','Reduce the sink rate before touchdown: flare gently and close the throttle.')],
        ['pMira',30,L('Segui i PAPI (2 bianche e 2 rosse) fino in fondo per toccare al punto di mira.','Follow the PAPI (2 white, 2 red) all the way down to touch at the aiming point.')],
        ['pAsse',20,L('Allineati presto con la linea centrale e correggi con il timone (Q/E).','Line up early with the centre line and correct with the rudder (Q/E).')],
        ['pVel',20,L('Tieni 65 nodi in finale e lascia calare la velocità durante la richiamata.','Hold 65 knots on final and let the speed bleed off in the flare.')]]
        .sort((a,b)=>d[a[0]]/a[1]-d[b[0]]/b[1])[0];
      return peggio[2];
    }
    if(!m.atterraggi.every(x=>x.buono)) return L('Per la seconda stella servono atterraggi sotto 450 ft/min, sulla pista.','For the second star every landing must be under 450 ft/min, on the runway.');
    return m.tipo==='tempo'?L('Per la terza stella risparmia tempo: rotta diretta, crociera a pieno motore e circuito corto.','For the third star save time: direct route, full-power cruise and a short pattern.')
      :L('Per la terza stella vola le tratte più diretto: il tocca e riparti fa risparmiare tempo.','For the third star fly the legs more directly: touch-and-go saves time.');
  }
  // per il libretto di volo
  function risultato(){
    return {nome:m.nome,tipo:m.tipo,riuscita:m.stato==='riuscita',stelle:m.stelle,punti:m.punti,tempo:m.tipo==='precisione'?null:m.tempo,
      rotta:m.rotta||(m.tipo==='precisione'?`${m.tappe[0].codice} ${m.te.nome}`:m.tappe.map(a=>a.codice).join('–')),
      da:m.casa?m.casa.codice:'',a:m.tappe?m.tappe[m.tappe.length-1].codice:''};
  }
  return {prepara,descrizione,avvia,aggiorna,atterraggio,incidente,fallisci,striscia,pannello,esito,risultato,daMostrare,prossima,
    get attiva(){return valida();},get inCorso(){return inCorso();},get tipo(){return m?m.tipo:'libero';},get m(){return m;}};
};
})();
