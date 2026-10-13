/* =====================================================================
   COMUNICAZIONI RADIO con il controllo del traffico aereo (ATC)
   ---------------------------------------------------------------------
   Le comunicazioni sono in inglese, con la fraseologia standard ICAO,
   e vengono pronunciate dalla sintesi vocale del browser (Web Speech API):
   una voce per la torre, una per il pilota. Il giocatore non parla: sceglie
   la frase da un menu (tasto T, poi 1…4) e il gioco la pronuncia.
   Negli aeroporti con pista asfaltata di almeno 1000 m c'è una "Tower" che
   dà le autorizzazioni; negli altri un servizio "Radio" che dà solo
   informazioni. Frequenze e procedure sono simulate, non quelle vere.
   I testi hanno tre forme: scritta in inglese (en), pronunciata (sp) e la
   traduzione italiana (it), mostrata sotto quando il gioco è in italiano.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const D2R=Math.PI/180, R2D=180/Math.PI, NM=1852, FT=3.28084, KT=1.943844;
const L=(it,en)=>SIM.L?SIM.L(it,en):it;

/* ---------- come si pronunciano numeri e lettere ---------- */
const NUM=['zero','one','two','three','four','five','six','seven','eight','niner'];
const NATO={A:'Alfa',B:'Bravo',C:'Charlie',D:'Delta',E:'Echo',F:'Foxtrot',G:'Golf',H:'Hotel',I:'India',J:'Juliett',K:'Kilo',L:'Lima',
  M:'Mike',N:'November',O:'Oscar',P:'Papa',Q:'Quebec',R:'Romeo',S:'Sierra',T:'Tango',U:'Uniform',V:'Victor',W:'Whiskey',X:'X-ray',Y:'Yankee',Z:'Zulu'};
const cifre=s=>String(s).split('').map(c=>c==='.'?'decimal':NUM[+c]!=null&&/\d/.test(c)?NUM[+c]:'').filter(Boolean).join(' ');
const tre=n=>String(Math.round(((n%360)+360)%360)%360||360).padStart(3,'0');
const lettere=s=>s.replace(/[^A-Z]/gi,'').toUpperCase().split('').map(c=>NATO[c]).join(' ');
function piedi(ft){
  ft=Math.max(0,Math.round(ft/100)*100);
  const k=Math.floor(ft/1000),h=Math.round((ft%1000)/100);
  return {d:ft+' feet',s:(k?cifre(k)+' thousand ':'')+(h?NUM[h]+' hundred ':'')+'feet'};
}
const PUNTI=['north','north-east','east','south-east','south','south-west','west','north-west'];
const PUNTI_IT=['nord','nord-est','est','sud-est','sud','sud-ovest','ovest','nord-ovest'];

/* frase: elenco di pezzi; un pezzo è una stringa (uguale scritta e detta) oppure {d, s} */
function frase(...pezzi){
  let d='',s='';
  for(const p of pezzi){if(p==null) continue;if(typeof p==='string'){d+=p;s+=p;}else{d+=p.d;s+=p.s;}}
  return {d:d.replace(/\s+/g,' ').trim(),s:s.replace(/\s+/g,' ').trim()};
}

SIM.creaATC=function({A,T,met,audio,radio}){
  const $=id=>document.getElementById(id);
  /* ---------- nominativo dell'aereo ---------- */
  const REG=(A.registrazione||'I-VOLO').toUpperCase();
  const lett=REG.replace(/[^A-Z]/g,'');
  const CS={d:REG,s:lettere(REG)};                                         // completo
  const CSB={d:lett[0]+'-'+lett.slice(-2),s:lettere(lett[0]+lett.slice(-2))};  // abbreviato
  /* ---------- stazioni: una per aeroporto ---------- */
  const stazioni=new Map();
  T.aeroporti.forEach((ap,i)=>{
    const p=ap.piste[0], torre=!p.erba&&p.L>=1000;
    const nome=ap.nome.replace(/\s*\(.*\)/,'').replace(/-/g,' ');
    const f=(118+((i*7)%160)*0.025).toFixed(3);   // 118,000…121,975
    stazioni.set(ap,{ap,torre,nome:nome+(torre?' Tower':' Radio'),freq:f,
      parla:{d:nome+(torre?' Tower':' Radio'),s:nome+(torre?' Tower':' Radio')}});
  });
  const QNH=Math.round(met.qnh||1016);
  const ventoF=()=>met.ventoNodi<1?{d:'wind calm',s:'wind calm'}:
    {d:`wind ${tre(met.ventoDa)} degrees ${met.ventoNodi} knots`,s:`wind ${cifre(tre(met.ventoDa))} degrees ${cifre(met.ventoNodi)} knots`};
  const ventoIt=()=>met.ventoNodi<1?'vento calmo':`vento da ${tre(met.ventoDa)}° a ${met.ventoNodi} nodi`;
  const qnhF=(q=QNH)=>({d:'QNH '+q,s:'Q N H '+cifre(q)});
  const pistaF=te=>({d:'runway '+te.nome,s:'runway '+cifre(te.nome)});
  const freqF=f=>({d:f,s:cifre(f.replace(/0+$/,'').replace(/\.$/,''))});

  /* ---------- voci ---------- */
  let voci={atc:null,pilota:null};
  function scegliVoci(){
    if(!window.speechSynthesis) return;
    const en=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang));
    if(!en.length) return;
    const gb=en.filter(v=>/GB|UK/i.test(v.lang)), us=en.filter(v=>/US/i.test(v.lang));
    voci.atc=gb[0]||en[0];
    voci.pilota=us.find(v=>v!==voci.atc)||en.find(v=>v!==voci.atc)||voci.atc;
  }
  if(window.speechSynthesis){scegliVoci();speechSynthesis.addEventListener&&speechSynthesis.addEventListener('voiceschanged',scegliVoci);}

  /* ---------- coda delle trasmissioni ---------- */
  const coda=[];let parlando=false,sicurezza=0,inPausa=false;
  const registro=[];   // ultime trasmissioni mostrate
  function trasmetti(chi,f,it,dopo){coda.push({chi,en:f.d,sp:f.s,it,dopo});if(!parlando)prossimo();}
  function attendi(ms){coda.push({pausa:ms});if(!parlando)prossimo();}
  function prossimo(){
    clearTimeout(sicurezza);
    const m=coda.shift();
    if(!m){parlando=false;return;}
    parlando=true;
    if(m.pausa){sicurezza=setTimeout(prossimo,m.pausa);return;}
    registro.push(m);if(registro.length>4)registro.shift();
    disegnaRegistro(m);
    const fine=()=>{clearTimeout(sicurezza);if(audio.attivo)audio.fruscio(0.15);if(m.dopo)m.dopo();sicurezza=setTimeout(prossimo,450);};
    if(audio.attivo)audio.fruscio();
    if(window.speechSynthesis&&audio.attivo){
      const u=new SpeechSynthesisUtterance(m.sp);
      const v=m.chi==='atc'?voci.atc:voci.pilota;
      if(v){u.voice=v;u.lang=v.lang;}else u.lang='en-GB';
      u.rate=m.chi==='atc'?1.08:1.0;u.pitch=m.chi==='atc'?0.9:1.1;
      let fatto=false;const una=()=>{if(!fatto){fatto=true;fine();}};
      u.onend=una;u.onerror=una;
      sicurezza=setTimeout(una,2000+m.sp.length*70);   // se il browser non avvisa la fine
      setTimeout(()=>speechSynthesis.speak(u),250);
    }else sicurezza=setTimeout(fine,1500+m.en.length*55);
  }
  function zitto(){coda.length=0;clearTimeout(sicurezza);parlando=false;if(window.speechSynthesis)speechSynthesis.cancel();}

  /* ---------- pannello ---------- */
  const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  function disegnaRegistro(){
    const el=$('radioLog');if(!el) return;
    el.innerHTML=registro.map(m=>`<div class="rl ${m.chi}"><b>${m.chi==='atc'?'ATC':L('TU','YOU')}</b><span>${esc(m.en)}`+
      (SIM.lingua!=='en'&&m.it?`<i>${esc(m.it)}</i>`:'')+`</span></div>`).join('');
    el.scrollTop=el.scrollHeight;
    if(SIM.adattaDestra)SIM.adattaDestra();
  }
  function intestazione(){
    const el=$('radioCom');if(!el) return;
    el.textContent=staz?`COM1 ${staz.freq} · ${staz.nome}`:'COM1 —';
  }
  let avviso='';
  function avvisa(t){
    avviso=t;const el=$('radioAvviso');
    if(el){el.textContent=t;el.hidden=!t;}
    const p=$('radio');if(p)p.classList.toggle('chiama',!!t);
    if(SIM.adattaDestra)SIM.adattaDestra();
  }

  /* ---------- stato della conversazione ---------- */
  let staz=null, fase='pronto', att=null, attTimer=0, ripetuto=false, chiamato=false, uscitaFatta=false, arrivoAvvisato=false;
  let ultimoATC=null, ctx=null, st=null, emergenza=false, maydayFatto=false, benvenuto=false;
  function reset(c){
    zitto();registro.length=0;disegnaRegistro();chiudiMenu();
    ctx=c;att=null;ripetuto=false;chiamato=false;uscitaFatta=false;arrivoAvvisato=false;emergenza=false;maydayFatto=false;benvenuto=false;ultimoATC=null;
    if(c.finale&&c.part){staz=stazioni.get(c.part.ap);fase='arrivo';
      avvisa(L(`In finale: chiama ${staz.nome} per l'atterraggio (T)`,`On final: call ${staz.nome} for landing (T)`));}
    else if(c.part){staz=stazioni.get(c.part.ap);fase='pronto';
      avvisa(L(`Chiedi l'autorizzazione al decollo a ${staz.nome} (T)`,`Ask ${staz.nome} for take-off clearance (T)`));}
    else{staz=null;fase='rotta';avvisa('');}
    intestazione();
  }
  // la torre parla e aspetta una risposta tra quelle date
  function atcDice(f,it,risposte){
    ultimoATC={f,it,risposte};
    trasmetti('atc',f,it,()=>{if(risposte){att=risposte;attTimer=Date.now();ripetuto=false;avvisa(L('Rispondi alla torre (T)','Reply to ATC (T)'));}});
  }
  function pilotaDice(f,it){trasmetti('pilota',f,it);}
  const nomeStaz=()=>staz?staz.parla:{d:'',s:''};

  /* ---------- geometria rispetto alla pista ---------- */
  function rispettoPista(te){
    const dx=st.pos.x-te.x,dz=st.pos.z-te.z;
    const avanti=-(dx*te.dir.x+dz*te.dir.z), lato=dx*(-te.dir.z)+dz*te.dir.x;
    return {dist:Math.hypot(dx,dz),avanti,ang:Math.atan2(lato,Math.max(1,avanti))*R2D};
  }
  // posizione "N miglia a nord-est del campo" (oppure "... di <nome>")
  function posizioneDa(ap,nome){
    const dx=st.pos.x-ap.x,dz=st.pos.z-ap.z,b=(Math.atan2(dx,-dz)*R2D+360)%360,i=Math.round(b/45)%8;
    const nm=Math.max(1,Math.round(Math.hypot(dx,dz)/NM)), di=nome||'the field', diIt=nome?'di '+nome:'del campo';
    return {f:{d:`${nm} miles ${PUNTI[i]} of ${di}`,s:`${cifre(nm)} miles ${PUNTI[i].replace('-',' ')} of ${di}`},it:`${nm} miglia a ${PUNTI_IT[i]} ${diIt}`};
  }
  function aeroportoVicino(){
    let best=null,bd=Infinity;
    for(const ap of T.aeroporti){const d=Math.hypot(ap.x-st.pos.x,ap.z-st.pos.z);if(d<bd){bd=d;best=ap;}}
    return {ap:best,d:bd};
  }

  /* ---------- le frasi ---------- */
  // risposte (readback) a un'autorizzazione: quella giusta, una sbagliata, e "say again"
  function readback(giusta,giustaIt,sbagliata,sbagliataIt,correzione,correzioneIt,dopoGiusta){
    const op=[{f:giusta,it:giustaIt,fai:()=>{att=null;avvisa('');if(dopoGiusta)dopoGiusta();}}];
    if(sbagliata)op.push({f:sbagliata,it:sbagliataIt,fai:()=>{att=null;attendi(900);
      atcDice(correzione,correzioneIt,readback(giusta,giustaIt,null,null,null,null,dopoGiusta));}});
    if(op.length>1&&Math.random()<0.5)op.reverse();   // la risposta giusta non è sempre la prima
    return op;
  }
  function opzioni(){
    const op=[];
    if(att){
      op.push(...att.map(o=>({f:o.f,it:o.it,fai:()=>{avvisa('');pilotaDice(o.f,o.it);o.fai();}})));
    }else if(emergenza&&!maydayFatto){
      op.push(mayday());
    }else if(fase==='pronto'&&staz&&st.aTerra){
      op.push(richiestaDecollo());
    }else if(fase==='arrivo'&&staz){
      op.push(chiamataFinale());
    }else if(fase==='rotta'&&ctx.arr){
      const s2=stazioni.get(ctx.arr.ap),d=Math.hypot(ctx.arr.ap.x-st.pos.x,ctx.arr.ap.z-st.pos.z);
      if(d<30*NM){op.push(chiamataArrivo(false));if(s2.torre&&radio.ilsDi(ctx.arr.te))op.push(chiamataArrivo(true));}
    }
    if(staz)op.push(provaRadio());
    if(ultimoATC)op.push(ripeti());
    return op.slice(0,5);
  }
  function richiestaDecollo(){
    const te=ctx.part.te,dest=ctx.arr&&ctx.arr.ap!==ctx.part.ap?ctx.arr.ap:null;
    const f=frase(nomeStaz(),', ',CS,', Cessna ',{d:'172',s:'one seven two'},' at the holding point ',pistaF(te),
      dest?', VFR to '+dest.nome.replace(/-/g,' '):', VFR local flight',', ready for departure');
    const it=`${staz.nome}, ${REG}, Cessna 172 al punto attesa pista ${te.nome}, VFR ${dest?'per '+dest.nome:'locale'}, pronto per la partenza.`;
    return {f,it,fai:()=>{
      pilotaDice(f,it);attendi(1200);
      const altra=te.pista.testate.find(t=>t!==te), sbPista=!!altra&&Math.random()<0.5;
      if(staz.torre){
        atcDice(frase(CSB,', ',pistaF(te),', ',ventoF(),', ',qnhF(),', cleared for take-off'),
          `${CSB.d}, pista ${te.nome}, ${ventoIt()}, QNH ${QNH}, autorizzato al decollo.`,
          readback(frase(pistaF(te),', cleared for take-off, ',qnhF(),', ',CSB),`Pista ${te.nome}, autorizzato al decollo, QNH ${QNH}, ${CSB.d}.`,
            sbPista?frase(pistaF(altra),', cleared for take-off, ',qnhF(),', ',CSB):frase(pistaF(te),', cleared for take-off, ',qnhF(QNH+10),', ',CSB),
            sbPista?`Pista ${altra.nome}, autorizzato al decollo, QNH ${QNH}, ${CSB.d}.`:`Pista ${te.nome}, autorizzato al decollo, QNH ${QNH+10}, ${CSB.d}.`,
            frase(CSB,', negative, ',pistaF(te),', ',qnhF(),', I say again, ',pistaF(te),', cleared for take-off'),
            `${CSB.d}, negativo, pista ${te.nome}, QNH ${QNH}, ripeto, pista ${te.nome}, autorizzato al decollo.`,
            ()=>{fase='autorizzato';}));
      }else{
        atcDice(frase(CSB,', ',nomeStaz(),', ',pistaF(te),' in use, ',ventoF(),', ',qnhF(),', no reported traffic, report airborne'),
          `${CSB.d}, ${staz.nome}, pista in uso ${te.nome}, ${ventoIt()}, QNH ${QNH}, nessun traffico segnalato, riportate in volo.`,
          readback(frase(pistaF(te),', ',qnhF(),', wilco, ',CSB),`Pista ${te.nome}, QNH ${QNH}, eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{fase='autorizzato';}));
      }
    }};
  }
  function chiamataArrivo(ils){
    const ap=ctx.arr.ap,te=ctx.arr.te,s2=stazioni.get(ap),pos=posizioneDa(ap),q=piedi(st.pos.y*FT);
    const f=frase(s2.parla,', ',CS,', Cessna ',{d:'172',s:'one seven two'},', ',pos.f,', ',q,', inbound for landing',ils?', request ILS approach '+'':'',ils?pistaF(te):'');
    const it=`${s2.nome}, ${REG}, Cessna 172, ${pos.it}, ${Math.round(st.pos.y*FT/100)*100} piedi, in arrivo per l'atterraggio${ils?`, chiediamo avvicinamento ILS pista ${te.nome}`:''}.`;
    return {f,it,etichettaIt:ils?L('(arrivo con avvicinamento ILS)','(arrival with ILS approach)'):L('(arrivo a vista)','(visual arrival)'),fai:()=>{
      staz=s2;intestazione();pilotaDice(f,it);attendi(1300);
      const r=rispettoPista(te),allineato=r.avanti>0&&Math.abs(r.ang)<30;
      let ist,istIt,rb,rbIt;
      if(!s2.torre){
        ist=frase(pistaF(te),' in use, ',ventoF(),', ',qnhF(),', no reported traffic, report final');
        istIt=`pista in uso ${te.nome}, ${ventoIt()}, QNH ${QNH}, nessun traffico segnalato, riportate in finale`;
        rb=frase(pistaF(te),', ',qnhF(),', wilco, ',CSB);rbIt=`Pista ${te.nome}, QNH ${QNH}, eseguiremo, ${CSB.d}.`;
      }else if(ils){
        ist=frase('cleared ILS approach ',pistaF(te),', ',qnhF(),', report final');
        istIt=`autorizzato all'avvicinamento ILS pista ${te.nome}, QNH ${QNH}, riportate in finale`;
        rb=frase('Cleared ILS approach ',pistaF(te),', ',qnhF(),', wilco, ',CSB);rbIt=`Autorizzato ILS pista ${te.nome}, QNH ${QNH}, eseguiremo, ${CSB.d}.`;
      }else if(allineato){
        ist=frase('straight-in approach ',pistaF(te),' approved, ',ventoF(),', ',qnhF(),', report final');
        istIt=`avvicinamento diretto pista ${te.nome} approvato, ${ventoIt()}, QNH ${QNH}, riportate in finale`;
        rb=frase('Straight-in ',pistaF(te),', ',qnhF(),', wilco, ',CSB);rbIt=`Diretti pista ${te.nome}, QNH ${QNH}, eseguiremo, ${CSB.d}.`;
      }else{
        ist=frase('join the traffic circuit ',pistaF(te),', ',ventoF(),', ',qnhF(),', report final');
        istIt=`entrate nel circuito di traffico pista ${te.nome}, ${ventoIt()}, QNH ${QNH}, riportate in finale`;
        rb=frase('Join circuit ',pistaF(te),', ',qnhF(),', wilco, ',CSB);rbIt=`Entriamo nel circuito pista ${te.nome}, QNH ${QNH}, eseguiremo, ${CSB.d}.`;
      }
      atcDice(frase(CSB,', ',s2.parla,', ',ist),`${CSB.d}, ${s2.nome}, ${istIt}.`,
        readback(rb,rbIt,s2.torre?frase(pistaF(te),', ',qnhF(QNH-10),', wilco, ',CSB):null,`Pista ${te.nome}, QNH ${QNH-10}, eseguiremo, ${CSB.d}.`,
          frase(CSB,', negative, ',qnhF(),', I say again, ',qnhF()),`${CSB.d}, negativo, QNH ${QNH}, ripeto, QNH ${QNH}.`,()=>{fase='arrivo';avvisa(L('Quando sei in finale, chiama la torre (T)','When on final, call the tower (T)'));}));
    }};
  }
  function chiamataFinale(){
    const te=(ctx.finale&&ctx.part&&staz&&staz.ap===ctx.part.ap)?ctx.part.te:(ctx.arr&&staz&&staz.ap===ctx.arr.ap?ctx.arr.te:null);
    const f=frase(CSB,', final ',te?pistaF(te):'');
    const it=`${CSB.d}, in finale${te?' pista '+te.nome:''}.`;
    return {f,it,fai:()=>{
      pilotaDice(f,it);attendi(1100);
      if(!te){atcDice(frase(CSB,', say again'),`${CSB.d}, ripetete.`);return;}
      const r=rispettoPista(te),inFinale=r.avanti>200&&r.avanti<7*NM&&Math.abs(r.ang)<25;
      if(!inFinale){atcDice(frase(CSB,', negative, you are not on final, report final ',pistaF(te)),`${CSB.d}, negativo, non siete in finale, riportate in finale pista ${te.nome}.`);return;}
      if(staz.torre){
        atcDice(frase(CSB,', ',pistaF(te),', ',ventoF(),', cleared to land'),`${CSB.d}, pista ${te.nome}, ${ventoIt()}, autorizzato all'atterraggio.`,
          readback(frase('Cleared to land ',pistaF(te),', ',CSB),`Autorizzato all'atterraggio pista ${te.nome}, ${CSB.d}.`,null,null,null,null,()=>{fase='finale';}));
      }else{
        atcDice(frase(CSB,', ',pistaF(te),' free, ',ventoF(),', landing at your discretion'),`${CSB.d}, pista ${te.nome} libera, ${ventoIt()}, atterraggio a vostra discrezione.`,
          readback(frase('Landing ',pistaF(te),', ',CSB),`Atterriamo pista ${te.nome}, ${CSB.d}.`,null,null,null,null,()=>{fase='finale';}));
      }
      avvisa('');
    }};
  }
  function mayday(){
    const v=aeroportoVicino(),pos=posizioneDa(v.ap,v.ap.nome.replace(/-/g,' ')),q=piedi(st.pos.y*FT);
    const f=frase('Mayday, Mayday, Mayday, ',CS,', engine failure, ',q,', ',pos.f,', attempting forced landing');
    const it=`Mayday, Mayday, Mayday, ${REG}, piantata motore, ${Math.round(st.pos.y*FT/100)*100} piedi, ${pos.it}, tentiamo un atterraggio di emergenza.`;
    return {f,it,fai:()=>{
      maydayFatto=true;avvisa('');pilotaDice(f,it);attendi(1300);
      const s2=stazioni.get(v.ap),b=tre(Math.atan2(v.ap.x-st.pos.x,-(v.ap.z-st.pos.z))*R2D),nm=Math.max(1,Math.round(v.d/NM));
      staz=s2;intestazione();
      atcDice(frase(CSB,', ',s2.parla,', roger Mayday, nearest airport ',v.ap.nome.replace(/-/g,' '),', heading ',{d:b,s:cifre(b)},', ',{d:nm+' miles',s:cifre(nm)+' miles'},', ',ventoF(),', ',qnhF(),', you are cleared to land any runway'),
        `${CSB.d}, ${s2.nome}, ricevuto Mayday, aeroporto più vicino ${v.ap.nome}, prua ${b}, ${nm} miglia, ${ventoIt()}, QNH ${QNH}, autorizzati ad atterrare su qualsiasi pista.`,
        readback(frase('Heading ',{d:b,s:cifre(b)},', ',qnhF(),', ',CSB),`Prua ${b}, QNH ${QNH}, ${CSB.d}.`,null,null,null,null,()=>{fase='finale';}));
    }};
  }
  function provaRadio(){
    const f=frase(nomeStaz(),', ',CSB,', radio check');
    const it=`${staz.nome}, ${CSB.d}, prova radio.`;
    return {f,it,fai:()=>{pilotaDice(f,it);attendi(1000);atcDice(frase(CSB,', ',nomeStaz(),', reading you five'),`${CSB.d}, ${staz.nome}, vi ricevo forte e chiaro (5).`);}};
  }
  function ripeti(){
    const f=frase(nomeStaz(),', ',CSB,', say again');
    const it=`${staz?staz.nome+', ':''}${CSB.d}, ripetete.`;
    return {f,it,fai:()=>{const u=ultimoATC;pilotaDice(f,it);attendi(1000);if(u)atcDice(u.f,u.it,u.risposte||null);}};
  }

  /* ---------- menu ---------- */
  let menu=null;
  function apriMenu(){
    if(!st) return;
    if(parlando){ // non si parla sopra gli altri: si aspetta la fine della trasmissione
      const el=$('radioMenu');menu=[];
      if(el){el.hidden=false;el.innerHTML=`<li class="vuoto">${L('Trasmissione in corso: aspetta e poi premi di nuovo T.','Transmission in progress: wait, then press T again.')}</li>`;}
      setTimeout(chiudiMenu,1800);return;
    }
    menu=opzioni();
    const el=$('radioMenu');if(!el) return;
    if(!menu.length){menu=null;el.hidden=false;el.innerHTML=`<li class="vuoto">${L('Niente da dire adesso.','Nothing to say right now.')}</li>`;setTimeout(chiudiMenu,1800);return;}
    el.innerHTML=menu.map((o,i)=>`<li><button type="button" data-i="${i}"><kbd>${i+1}</kbd> <span>${esc(o.f.d)}`+
      (SIM.lingua!=='en'&&o.it?`<i>${esc(o.it)}</i>`:'')+(o.etichettaIt?`<i>${esc(o.etichettaIt)}</i>`:'')+`</span></button></li>`).join('')+
      `<li class="nota">${L('1…'+menu.length+' per scegliere · T o Esc per chiudere','1…'+menu.length+' to choose · T or Esc to close')}</li>`;
    el.hidden=false;
    for(const b of el.querySelectorAll('button[data-i]'))b.addEventListener('click',()=>{scegli(+b.dataset.i);b.blur();});
  }
  function chiudiMenu(){menu=null;const el=$('radioMenu');if(el){el.hidden=true;el.innerHTML='';}}
  function scegli(i){
    if(!menu||!menu[i]) return;
    const o=menu[i];chiudiMenu();
    if(parlando&&coda.length>2) return;
    o.fai();
  }

  return {
    reset,
    get menuAperto(){return !!menu;},
    // tasti: T apre/chiude il menu; con il menu aperto le cifre scelgono (e non muovono la manetta)
    tasto(e){
      if(e.code==='KeyT'&&!e.repeat){if(menu)chiudiMenu();else apriMenu();return true;}
      if(!menu) return false;
      if(e.code==='Escape'){chiudiMenu();return true;}
      const c=/^(Digit|Numpad)([0-9])$/.exec(e.code);
      if(c){if(!e.repeat&&c[2]!=='0')scegli(+c[2]-1);return true;}   // a menu aperto le cifre non toccano la manetta
      return false;
    },
    pausa(p){inPausa=p;if(window.speechSynthesis){if(p)speechSynthesis.pause();else speechSynthesis.resume();}},
    // da chiamare spesso (qualche volta al secondo) durante il volo
    aggiorna(s,c){
      st=s;ctx=c;
      if(s.crashed) return;
      // nessuna risposta a una chiamata della torre: la torre richiama una volta
      if(att&&!parlando&&!ripetuto&&Date.now()-attTimer>25000){
        ripetuto=true;atcDice(frase(CSB,', ',nomeStaz(),', how do you read?'),`${CSB.d}, ${staz?staz.nome:''}, come ci ricevete?`,att);
      }
      // uscita dalla zona di controllo della partenza
      if(!uscitaFatta&&staz&&ctx.part&&staz.ap===ctx.part.ap&&!s.aTerra&&(fase==='autorizzato'||fase==='partenza')){
        const d=Math.hypot(ctx.part.ap.x-s.pos.x,ctx.part.ap.z-s.pos.z);
        if(d>5*NM&&!parlando&&!att){
          uscitaFatta=true;
          if(staz.torre)atcDice(frase(CSB,', leaving the control zone, frequency change approved, good flight'),`${CSB.d}, state lasciando la zona di controllo, cambio frequenza approvato, buon volo.`,
            readback(frase('Frequency change approved, good day, ',CSB),`Cambio frequenza approvato, buona giornata, ${CSB.d}.`,null,null,null,null,()=>{fase='rotta';staz=null;intestazione();}));
          else{fase='rotta';staz=null;intestazione();}
        }
      }
      // vicino alla destinazione: ricorda di chiamare
      if(fase==='rotta'&&ctx.arr&&!arrivoAvvisato){
        const d=Math.hypot(ctx.arr.ap.x-s.pos.x,ctx.arr.ap.z-s.pos.z);
        if(d<20*NM&&!s.aTerra){arrivoAvvisato=true;const s2=stazioni.get(ctx.arr.ap);
          avvisa(L(`Chiama ${s2.nome} per l'arrivo (T) · ${s2.freq}`,`Call ${s2.nome} for arrival (T) · ${s2.freq}`));}
      }
      // dopo l'atterraggio, a bassa velocità: liberare la pista
      if(fase==='atterrato'&&!benvenuto&&s.aTerra&&s.gs<12&&!parlando){
        benvenuto=true;
        if(staz){
          const citta=staz.ap.nome.replace(/-.*$/,'');
          atcDice(frase(CSB,', vacate the runway at the next taxiway, welcome to ',citta),`${CSB.d}, liberate la pista al prossimo raccordo, benvenuti a ${citta}.`,
            readback(frase('Vacating the runway, ',CSB),`Liberiamo la pista, ${CSB.d}.`,null,null,null,null,()=>{}));
        }
      }
    },
    evento(e,s,c){
      st=s;ctx=c;
      if(e.tipo==='incidente'){zitto();chiudiMenu();avvisa('');return;}
      if(e.tipo==='senzaCarburante'){emergenza=true;avvisa(L('Motore spento: dichiara emergenza (T)','Engine out: declare an emergency (T)'));return;}
      if(e.tipo==='decollo'){
        if(staz&&staz.torre&&fase==='pronto'){
          atcDice(frase(CSB,', ',nomeStaz(),', you are airborne without take-off clearance, report leaving the control zone'),
            `${CSB.d}, ${staz.nome}, siete decollati senza autorizzazione, riportate quando lasciate la zona di controllo.`,
            readback(frase('Wilco, ',CSB),`Eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{}));
        }
        if(fase==='pronto'||fase==='autorizzato')fase='partenza';
        avvisa('');
      }
      if(e.tipo==='atterraggio'){
        const v=aeroportoVicino();
        if(staz&&v.ap===staz.ap&&staz.torre&&fase!=='finale'){
          atcDice(frase(CSB,', ',nomeStaz(),', you landed without clearance, contact the tower after parking'),
            `${CSB.d}, ${staz.nome}, siete atterrati senza autorizzazione, contattate la torre dopo il parcheggio.`,
            readback(frase('Wilco, ',CSB),`Eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{}));
          benvenuto=true;
        }
        if(!staz||v.ap!==staz.ap){staz=stazioni.get(v.ap);intestazione();}
        fase='atterrato';avvisa('');
      }
    },
  };
};
})();
