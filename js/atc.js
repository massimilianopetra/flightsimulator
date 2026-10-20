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
   Sulla frequenza si sentono anche gli altri aerei del circuito (js/traffico.js,
   terza voce) e la torre tiene conto di loro con il giocatore: "hold position"
   con traffico in corto finale, "number two" in finale, informazioni di traffico.
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
const lettere=s=>s.replace(/[^A-Z0-9]/gi,"").toUpperCase().split("").map(c=>/\d/.test(c)?NUM[+c]:NATO[c]).join(" ");   // lettere e cifre (marche VDS: I-A742)
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

SIM.creaATC=function({A,T,met,audio,radio,stato}){
  const $=id=>document.getElementById(id);
  /* ---------- nominativo dell'aereo ---------- */
  const REG=(A.registrazione||'I-VOLO').toUpperCase();
  const lett=REG.replace(/[^A-Z0-9]/g,"");
  const TIPO=A.tipoRadio||{d:"Cessna 172",s:"Cessna one seven two"};   // tipo di aereo detto alla radio
  const CS={d:REG,s:lettere(REG)};                                         // completo
  const CSB={d:lett[0]+'-'+lett.slice(-2),s:lettere(lett[0]+lett.slice(-2))};  // abbreviato
  /* ---------- stazioni: una per aeroporto, più la "terra" (Ground) dove esiste ----------
     frequenze e tipo veri da window.RADIO.com (OurAirports, dati/piemonte-radio.js): TWR = torre che autorizza,
     INFO (AFIS) e RADIO = solo informazioni. Dove i dati mancano (e nel mondo inventato) la stazione è simulata:
     torre se la pista principale è asfaltata e lunga almeno 1000 m, altrimenti Radio. */
  const COM=(window.RADIO&&window.RADIO.com)||[];
  const stazioni=new Map(), terra=new Map();
  const staz0=(ap,torre,nome,freq,vera,extra)=>Object.assign({ap,torre,nome,freq,vera,parla:{d:nome,s:nome}},extra);
  T.aeroporti.forEach((ap,i)=>{
    const vere=COM.filter(c=>c.ap===ap.codice);
    const pr=vere.find(c=>c.tipo==='TWR')||vere.find(c=>c.tipo==='INFO')||vere.find(c=>c.tipo==='RADIO');
    if(pr) stazioni.set(ap,staz0(ap,pr.tipo==='TWR',pr.nome,pr.freq,true));
    else{
      const p=ap.piste[0], torre=!p.erba&&p.L>=1000;
      const nome=ap.nome.replace(/\s*\(.*\)/,'').replace(/-/g,' ')+(torre?' Tower':' Radio');
      let f=(118+((i*7)%160)*0.025).toFixed(3);if(f==='121.500')f='121.525';   // mai la frequenza di emergenza
      stazioni.set(ap,staz0(ap,torre,nome,f,false));   // simulata: 118,000…121,975
    }
    const g=vere.find(c=>c.tipo==='GND');
    if(g&&pr&&pr.tipo==='TWR') terra.set(ap,staz0(ap,true,g.nome,g.freq,true,{terra:true}));
  });
  const QNH=Math.round(met.qnh||1016);
  const ventoF=()=>met.ventoNodi<1?{d:'wind calm',s:'wind calm'}:
    {d:`wind ${tre(met.ventoDa)} degrees ${met.ventoNodi} knots`,s:`wind ${cifre(tre(met.ventoDa))} degrees ${cifre(met.ventoNodi)} knots`};
  const ventoIt=()=>met.ventoNodi<1?'vento calmo':`vento da ${tre(met.ventoDa)}° a ${met.ventoNodi} nodi`;
  const qnhF=(q=QNH)=>({d:'QNH '+q,s:'Q N H '+cifre(q)});
  const pistaF=te=>({d:'runway '+te.nome,s:'runway '+cifre(te.nome)});
  const viaF=v=>v&&v.length?{d:' via '+v.join(', '),s:' via '+v.map(r=>r.split('').map(c=>/\d/.test(c)?NUM[+c]:NATO[c.toUpperCase()]||c).join(' ')).join(', ')}:'';
  const freqF=f=>({d:f,s:cifre(f.replace(/0+$/,'').replace(/\.$/,''))});

  /* ---------- transponder ----------
     codice di 4 cifre da 0 a 7 e modi: STBY (acceso ma non risponde, a terra), ON (modo A: solo il codice),
     ALT (modo C: codice e quota, in volo). 7000 = codice VFR in Italia, 7700 = emergenza.
     Le torri assegnano un codice (squawk) nelle autorizzazioni e controllano che sia impostato. */
  const xp={codice:'7000',modo:'STBY',atteso:null,tAtteso:0,richiamato:false,modoRichiamato:false,ident:0,identRichiesto:0,digita:null};
  const cod=c=>({d:c,s:cifre(c)});
  const squawkF=c=>frase('squawk ',cod(c));
  function nuovoCodice(){
    let c;do{c=String(1+Math.floor(Math.random()*6))+[0,1,2].map(()=>Math.floor(Math.random()*8)).join('');}while(c==='2000'||c==='1200'||c===xp.codice);
    return c;
  }
  function codiceSbagliato(c){const i=1+Math.floor(Math.random()*3);return c.slice(0,i)+String((+c[i]+3)%8)+c.slice(i+1);}
  function assegna(c){xp.atteso=c;xp.tAtteso=Date.now();xp.richiamato=false;}
  const identAcceso=()=>Date.now()-xp.ident<18000;
  function disegnaXpdr(){
    const b=$('xpCodice');
    if(b){b.textContent=xp.digita!==null?(xp.digita+'____').slice(0,4):xp.codice;b.classList.toggle('digita',xp.digita!==null);}
    for(const k of document.querySelectorAll('[data-xp]')){const m=k.dataset.xp;
      k.classList.toggle('attivo',m===xp.modo);k.classList.toggle('ident',m==='IDENT'&&identAcceso());}
  }
  function impostaCodice(c){xp.codice=c;xp.digita=null;disegnaXpdr();if(audio.attivo)audio.fruscio(0.05);}
  function impostaModo(m){
    if(m==='IDENT'){if(xp.modo==='STBY')return;xp.ident=Date.now();setTimeout(disegnaXpdr,18100);}
    else xp.modo=m;
    disegnaXpdr();
  }
  function iniziaDigita(){chiudiMenu();xp.digita=xp.digita===null?'':null;disegnaXpdr();}
  {const b=$('xpCodice');if(b)b.addEventListener('click',()=>{iniziaDigita();b.blur();});
   for(const k of document.querySelectorAll('[data-xp]'))k.addEventListener('click',()=>{impostaModo(k.dataset.xp);k.blur();});}
  const testoSquawk=c=>L(`imposta il transponder su ${c} (Maiusc+T o scheda RADIO)`,`set the transponder to ${c} (Shift+T or the RADIO tab)`);

  /* ---------- voci ---------- */
  let voci={atc:null,pilota:null,altro:null};
  function scegliVoci(){
    if(!window.speechSynthesis) return;
    const en=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang));
    if(!en.length) return;
    const gb=en.filter(v=>/GB|UK/i.test(v.lang)), us=en.filter(v=>/US/i.test(v.lang));
    voci.atc=gb[0]||en[0];
    voci.pilota=us.find(v=>v!==voci.atc)||en.find(v=>v!==voci.atc)||voci.atc;
    voci.altro=en.find(v=>v!==voci.atc&&v!==voci.pilota)||voci.pilota;   // gli altri aerei
  }
  if(window.speechSynthesis){scegliVoci();speechSynthesis.addEventListener&&speechSynthesis.addEventListener('voiceschanged',scegliVoci);}

  /* ---------- coda delle trasmissioni ---------- */
  const coda=[];let parlando=false,sicurezza=0,inPausa=false,turno=0;
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
      const v=m.chi==='atc'?voci.atc:m.chi==='altro'?voci.altro:voci.pilota;
      if(v){u.voice=v;u.lang=v.lang;}else u.lang='en-GB';
      u.rate=m.chi==='atc'?1.08:m.chi==='altro'?1.12:1.0;u.pitch=m.chi==='atc'?0.9:m.chi==='altro'?0.8:1.1;
      let fatto=false,partita=false;const io=++turno;
      const una=()=>{if(!fatto){fatto=true;clearTimeout(sveglia);fine();}};
      // se il browser non avvisa la fine: si butta via la frase, così non resta in coda
      // (prima le frasi bloccate si accumulavano e uscivano tutte insieme dopo una pausa)
      const durata=2000+m.sp.length*70;
      const scaduto=()=>{if(inPausa){sicurezza=setTimeout(scaduto,1000);return;}   // in pausa si aspetta
        if(!fatto)speechSynthesis.cancel();una();};
      sicurezza=setTimeout(scaduto,durata);
      // il conto riparte quando la voce comincia davvero (può partire in ritardo)
      u.onstart=()=>{partita=true;if(!fatto){clearTimeout(sicurezza);sicurezza=setTimeout(scaduto,durata);}};
      u.onend=una;u.onerror=una;
      let sveglia=0;
      setTimeout(()=>{
        if(fatto||io!==turno)return;
        // ogni tanto Chrome si inceppa: la voce resta "in pausa" o "occupata" senza parlare
        if(speechSynthesis.speaking||speechSynthesis.pending)speechSynthesis.cancel();
        if(speechSynthesis.paused&&!inPausa)speechSynthesis.resume();
        speechSynthesis.speak(u);
        // se dopo un secondo e mezzo non è ancora partita, la si sblocca come fa pausa/ripresa
        sveglia=setTimeout(()=>{if(!partita&&!fatto&&!inPausa){speechSynthesis.pause();speechSynthesis.resume();}},1500);
      },250);
    }else sicurezza=setTimeout(fine,1500+m.en.length*55);
  }
  function zitto(){coda.length=0;clearTimeout(sicurezza);parlando=false;turno++;if(window.speechSynthesis)speechSynthesis.cancel();}

  /* ---------- pannello ---------- */
  const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const rigaRadio=m=>`<div class="rl ${m.chi}"><b>${m.chi==='atc'?'ATC':m.chi==='altro'?esc(m.nome||''):L('TU','YOU')}</b><span>${esc(m.en)}`+
    (SIM.lingua!=='en'&&m.it?`<i>${esc(m.it)}</i>`:'')+`</span></div>`;
  function disegnaRegistro(nuova){
    const el=$('radioLog');if(!el) return;
    el.innerHTML=registro.map(rigaRadio).join('');
    el.scrollTop=el.scrollHeight;
    if(nuova){ultimaVolta=Date.now();clearTimeout(timerSott);timerSott=setTimeout(sottotitolo,10500);}
    sottotitolo();
    if(SIM.adattaDestra)SIM.adattaDestra();
  }
  /* striscia sotto le linguette (si vede quando la scheda RADIO è chiusa):
     l'ultima trasmissione per 10 secondi e l'avviso su cosa fare */
  let ultimaVolta=0,timerSott=0;
  function sottotitolo(){
    const el=$('radioSott');if(!el) return;
    const m=registro[registro.length-1];
    const h=(m&&Date.now()-ultimaVolta<10000?rigaRadio(m):'')+(avviso?`<div class="radioavviso">${esc(avviso)}</div>`:'');
    if(el.innerHTML!==h)el.innerHTML=h;
    el.hidden=!h;
  }
  function intestazione(){
    const el=$('radioCom');if(el)el.textContent=com?`COM1 ${com.freq} · ${com.nome}`:'COM1 —';
    const sel=$('selCom');if(sel)sel.value=com?String(elencoCom.indexOf(com)):'-1';
  }
  /* ---------- sintonia della radio COM1 ----------
     manuale: il giocatore sceglie la frequenza (menu COM1 o tasto U) e la torre risponde solo se è quella giusta;
     automatica: il gioco sintonizza da solo la stazione giusta quando serve (si può comunque cambiare a mano) */
  const elencoCom=[...stazioni.values(),...terra.values()].sort((a,b)=>a.nome.localeCompare(b.nome));
  let com=null, auto=false;
  try{auto=localStorage.getItem('volo-com-auto')==='1';}catch(e){}
  function sintonizza(s){com=s;intestazione();}
  // la stazione s ci sente? (in automatico la sintonizza)
  function sulCanale(s){
    if(!s) return false;
    if(auto&&com!==s)sintonizza(s);
    return com===s;
  }
  function nessunaRisposta(s){
    avvisa(L(`Nessuna risposta: COM1 è su ${com?com.freq:'—'}, ${s.nome} è su ${s.freq} (tasto U o menu COM1)`,
             `No answer: COM1 is on ${com?com.freq:'—'}, ${s.nome} is on ${s.freq} (U key or COM1 menu)`));
  }
  let avviso='';
  function avvisa(t){
    avviso=t;const el=$('radioAvviso');
    if(el){el.textContent=t;el.hidden=!t;}
    const p=$('radio');if(p)p.classList.toggle('chiama',!!t);
    sottotitolo();
    if(SIM.adattaDestra)SIM.adattaDestra();
  }

  /* ---------- stato della conversazione ---------- */
  let staz=null, fase='pronto', att=null, attTimer=0, ripetuto=false, chiamato=false, uscitaFatta=false, arrivoAvvisato=false;
  let ultimoATC=null, ctx=null, st=stato||null, emergenza=false, maydayFatto=false, benvenuto=false;
  let traffico=null, numeroDue=null;   // altri aerei (js/traffico.js); pista per cui si aspetta l'autorizzazione dopo "number two"
  // c'è traffico in corto finale sulla pista te: la torre fa aspettare (true se ha detto "hold position")
  function aspettaTraffico(te){
    const a=staz&&staz.torre&&traffico?traffico.inCorto(staz.ap,te):null;if(!a) return false;
    atcDice(frase(CSB,', hold position, traffic ',a.tipo,' on short final ',pistaF(te)),`${CSB.d}, mantenete la posizione, traffico ${a.tipo.d} in corto finale pista ${te.nome}.`,
      readback(frase('Holding position, ',CSB),`Manteniamo la posizione, ${CSB.d}.`,null,null,null,null,
        ()=>avvisa(L('Aspetta che l\'altro aereo sia passato sulla pista, poi richiama (T)','Wait until the other aircraft has passed on the runway, then call again (T)'))));
    return true;
  }
  function reset(c){
    zitto();registro.length=0;disegnaRegistro();chiudiMenu();
    xp.codice='7000';xp.modo=c.part&&c.parcheggio&&!c.finale?'STBY':'ALT';xp.atteso=null;xp.modoRichiamato=false;xp.identRichiesto=0;xp.digita=null;disegnaXpdr();
    ctx=c;att=null;ripetuto=false;chiamato=false;numeroDue=null;uscitaFatta=false;arrivoAvvisato=false;emergenza=false;maydayFatto=false;benvenuto=false;ultimoATC=null;
    dich=null;if(traffico&&traffico.emergenza)traffico.emergenza(null);
    if(c.finale&&c.fin){staz=stazioni.get(c.fin.ap);fase='arrivo';
      avvisa(L(`In finale: chiama ${staz.nome} per l'atterraggio (T)`,`On final: call ${staz.nome} for landing (T)`));}
    else if(c.part&&c.parcheggio){staz=terra.get(c.part.ap)||stazioni.get(c.part.ap);fase='parcheggio';
      avvisa(L(`Chiedi a ${staz.nome} di rullare (T)`,`Ask ${staz.nome} for taxi (T)`));}
    else if(c.part){staz=stazioni.get(c.part.ap);fase='pronto';
      avvisa(L(`Chiedi l'autorizzazione al decollo a ${staz.nome} (T)`,`Ask ${staz.nome} for take-off clearance (T)`));}
    else{staz=null;fase='rotta';avvisa('');}
    com=staz;intestazione();
  }
  // la torre parla e aspetta una risposta tra quelle date
  function atcDice(f,it,risposte,forza){
    if(!forza&&!sulCanale(staz)) return;
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
      op.push(...att.map(o=>({f:o.f,it:o.it,verso:staz,fai:()=>{avvisa('');pilotaDice(o.f,o.it);o.fai();}})));
    }else if(emergenza&&!maydayFatto){
      op.push(mayday());
    }else if(fase==='parcheggio'&&staz&&st.aTerra){
      op.push(Object.assign(richiestaRullaggio(),{verso:staz}));
    }else if((fase==='pronto'||fase==='rullaggio')&&staz&&st.aTerra){
      op.push(Object.assign(richiestaDecollo(),{verso:staz}));
    }else if(fase==='arrivo'&&staz){
      op.push(Object.assign(chiamataFinale(),{verso:staz}));
    }else if(fase==='rotta'&&ctx.arr){
      const s2=stazioni.get(ctx.arr.ap),d=Math.hypot(ctx.arr.ap.x-st.pos.x,ctx.arr.ap.z-st.pos.z);
      if(d<30*NM){op.push(Object.assign(chiamataArrivo(false),{verso:s2}));if(s2.torre&&radio.ilsDi(ctx.arr.te))op.push(Object.assign(chiamataArrivo(true),{verso:s2}));}
    }
    if(com)op.push(Object.assign(provaRadio(),{verso:com}));
    if(ultimoATC&&staz)op.push(Object.assign(ripeti(),{verso:staz}));
    // in volo, sempre in fondo: dichiarare (o annullare) un'emergenza
    if(!st.aTerra&&!att){
      const fine=dich?annulla():voceEmergenza();
      return op.slice(0,4).concat(fine);
    }
    return op.slice(0,5);
  }
  // al parcheggio: richiesta di rullaggio fino al punto attesa
  function richiestaRullaggio(){
    const te=ctx.part.te,dest=ctx.arr&&ctx.arr.ap!==ctx.part.ap?ctx.arr.ap:null;
    const f=frase(nomeStaz(),', ',CS,', ',TIPO,' at the apron',
      dest?', VFR to '+dest.nome.replace(/-/g,' '):', VFR local flight',', request taxi');
    const it=`${staz.nome}, ${REG}, ${TIPO.d} al piazzale, VFR ${dest?'per '+dest.nome:'locale'}, chiediamo di rullare.`;
    const tw=staz.terra?stazioni.get(ctx.part.ap):null;   // dalla terra si passa alla torre
    const poi=tw?frase(', at holding point contact ',tw.parla,' ',freqF(tw.freq)):'', poiRb=tw?frase(', ',freqF(tw.freq)):'';
    const poiIt=tw?`, al punto attesa contattate ${tw.nome} su ${tw.freq}`:'', poiRbIt=tw?`, ${tw.freq}`:'';
    const dopo=()=>{fase='rullaggio';
      if(tw){staz=tw;avvisa(L(`Segui la linea gialla a terra fino al punto attesa, poi sintonizza ${tw.nome} ${tw.freq} (U o menu COM1) e chiama (T)`,
        `Follow the yellow line on the ground to the holding point, then tune ${tw.nome} ${tw.freq} (U or the COM1 menu) and call (T)`));}
      else avvisa(L('Segui la linea gialla a terra fino al punto attesa, poi chiama la torre (T)',
        'Follow the yellow line on the ground to the holding point, then call the tower (T)'));};
    return {f,it,fai:()=>{
      pilotaDice(f,it);attendi(1200);
      const altra=te.pista.testate.find(t=>t!==te), sbPista=!!altra&&Math.random()<0.5;
      if(staz.torre){
        const sq=nuovoCodice(),dopoT=()=>{assegna(sq);dopo();if(avviso)avvisa(avviso.replace(/\.?$/,'')+' · '+testoSquawk(sq));};
        const vie=viaF(ctx.vie),vieIt=ctx.vie&&ctx.vie.length?' via '+ctx.vie.join(', '):'';
        const sbCod=Math.random()<0.4, sqS=codiceSbagliato(sq);   // la risposta sbagliata: pista, QNH o codice
        atcDice(frase(CSB,', taxi to holding point ',pistaF(te),vie,', ',qnhF(),', ',squawkF(sq),poi),`${CSB.d}, rullate al punto attesa pista ${te.nome}${vieIt}, QNH ${QNH}, transponder ${sq}${poiIt}.`,
          readback(frase('Taxi to holding point ',pistaF(te),vie,', ',qnhF(),', ',squawkF(sq),poiRb,', ',CSB),`Rulliamo al punto attesa pista ${te.nome}${vieIt}, QNH ${QNH}, transponder ${sq}${poiRbIt}, ${CSB.d}.`,
            sbCod?frase('Taxi to holding point ',pistaF(te),', ',qnhF(),', ',squawkF(sqS),poiRb,', ',CSB):sbPista?frase('Taxi to holding point ',pistaF(altra),', ',qnhF(),', ',squawkF(sq),poiRb,', ',CSB):frase('Taxi to holding point ',pistaF(te),', ',qnhF(QNH+10),', ',squawkF(sq),poiRb,', ',CSB),
            sbCod?`Rulliamo al punto attesa pista ${te.nome}, QNH ${QNH}, transponder ${sqS}${poiRbIt}, ${CSB.d}.`:sbPista?`Rulliamo al punto attesa pista ${altra.nome}, QNH ${QNH}, transponder ${sq}${poiRbIt}, ${CSB.d}.`:`Rulliamo al punto attesa pista ${te.nome}, QNH ${QNH+10}, transponder ${sq}${poiRbIt}, ${CSB.d}.`,
            sbCod?frase(CSB,', negative, ',squawkF(sq)):frase(CSB,', negative, holding point ',pistaF(te),', ',qnhF()),sbCod?`${CSB.d}, negativo, transponder ${sq}.`:`${CSB.d}, negativo, punto attesa pista ${te.nome}, QNH ${QNH}.`,dopoT));
      }else{
        atcDice(frase(CSB,', ',nomeStaz(),', ',pistaF(te),' in use, ',ventoF(),', ',qnhF(),', no reported traffic'),
          `${CSB.d}, ${staz.nome}, pista in uso ${te.nome}, ${ventoIt()}, QNH ${QNH}, nessun traffico segnalato.`,
          readback(frase(pistaF(te),', ',qnhF(),', taxiing to holding point, ',CSB),`Pista ${te.nome}, QNH ${QNH}, rulliamo al punto attesa, ${CSB.d}.`,null,null,null,null,dopo));
      }
    }};
  }
  // al punto attesa (dopo il rullaggio): si entra in pista, la si risale fino alla testata (backtrack) e si decolla
  function decolloDaAttesa(){
    const te=ctx.part.te;
    const f=frase(nomeStaz(),', ',CS,', holding point ',pistaF(te),', ready for departure');   // primo contatto con la torre: nominativo completo
    const it=`${staz.nome}, ${REG}, al punto attesa pista ${te.nome}, pronti per la partenza.`;
    return {f,it,fai:()=>{
      pilotaDice(f,it);attendi(1100);
      const a=ctx.attesa, lontano=a&&Math.hypot(a.x-st.pos.x,a.z-st.pos.z)>80;
      if(staz.torre&&lontano){atcDice(frase(CSB,', negative, report at holding point ',pistaF(te)),`${CSB.d}, negativo, riportate al punto attesa pista ${te.nome}.`);return;}
      if(aspettaTraffico(te)) return;
      const altra=te.pista.testate.find(t=>t!==te);
      if(staz.torre&&!ctx.backtrack){   // una via arriva alla testata: ci si allinea e si parte
        atcDice(frase(CSB,', line up ',pistaF(te),', ',ventoF(),', cleared for take-off'),
          `${CSB.d}, allineatevi pista ${te.nome}, ${ventoIt()}, autorizzati al decollo.`,
          readback(frase('Line up ',pistaF(te),', cleared for take-off, ',CSB),`Ci allineiamo pista ${te.nome}, autorizzati al decollo, ${CSB.d}.`,
            altra?frase('Line up ',pistaF(altra),', cleared for take-off, ',CSB):null,altra?`Ci allineiamo pista ${altra.nome}, autorizzati al decollo, ${CSB.d}.`:null,
            frase(CSB,', negative, ',pistaF(te),', I say again, line up ',pistaF(te),', cleared for take-off'),`${CSB.d}, negativo, pista ${te.nome}, ripeto, allineatevi pista ${te.nome}, autorizzati al decollo.`,
            ()=>{fase='autorizzato';avvisa(L(`Entra in pista ${te.nome}, allineati e decolla`,`Enter runway ${te.nome}, line up and take off`));}));
      }else if(staz.torre){
        atcDice(frase(CSB,', enter and backtrack ',pistaF(te),', line up, ',ventoF(),', cleared for take-off'),
          `${CSB.d}, entrate e risalite la pista ${te.nome}, allineatevi, ${ventoIt()}, autorizzati al decollo.`,
          readback(frase('Backtrack and line up ',pistaF(te),', cleared for take-off, ',CSB),`Risaliamo e ci allineiamo pista ${te.nome}, autorizzati al decollo, ${CSB.d}.`,
            altra?frase('Backtrack and line up ',pistaF(altra),', cleared for take-off, ',CSB):null,altra?`Risaliamo e ci allineiamo pista ${altra.nome}, autorizzati al decollo, ${CSB.d}.`:null,
            frase(CSB,', negative, ',pistaF(te),', I say again, backtrack ',pistaF(te),', cleared for take-off'),`${CSB.d}, negativo, pista ${te.nome}, ripeto, risalite la pista ${te.nome}, autorizzati al decollo.`,
            ()=>{fase='autorizzato';avvisa(L(`Risali la pista fino alla testata ${te.nome}, girati e decolla`,`Backtrack to the runway ${te.nome} threshold, turn around and take off`));}));
      }else{
        atcDice(frase(CSB,', ',pistaF(te),' in use, ',ventoF(),', no reported traffic, report airborne'),
          `${CSB.d}, pista in uso ${te.nome}, ${ventoIt()}, nessun traffico segnalato, riportate in volo.`,
          readback(frase('Backtracking ',pistaF(te),', wilco, ',CSB),`Risaliamo la pista ${te.nome}, eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{fase='autorizzato';}));
      }
    }};
  }
  function richiestaDecollo(){
    if(ctx.parcheggio) return decolloDaAttesa();
    const te=ctx.part.te,dest=ctx.arr&&ctx.arr.ap!==ctx.part.ap?ctx.arr.ap:null;
    const f=frase(nomeStaz(),', ',CS,', ',TIPO,' at the holding point ',pistaF(te),
      dest?', VFR to '+dest.nome.replace(/-/g,' '):', VFR local flight',', ready for departure');
    const it=`${staz.nome}, ${REG}, ${TIPO.d} al punto attesa pista ${te.nome}, VFR ${dest?'per '+dest.nome:'locale'}, pronto per la partenza.`;
    return {f,it,fai:()=>{
      pilotaDice(f,it);attendi(1200);
      if(aspettaTraffico(te)) return;
      const altra=te.pista.testate.find(t=>t!==te), sbPista=!!altra&&Math.random()<0.5;
      if(staz.torre){
        const sq=nuovoCodice(),sqS=codiceSbagliato(sq);
        atcDice(frase(CSB,', ',pistaF(te),', ',ventoF(),', ',qnhF(),', ',squawkF(sq),', cleared for take-off'),
          `${CSB.d}, pista ${te.nome}, ${ventoIt()}, QNH ${QNH}, transponder ${sq}, autorizzato al decollo.`,
          readback(frase(pistaF(te),', cleared for take-off, ',qnhF(),', ',squawkF(sq),', ',CSB),`Pista ${te.nome}, autorizzato al decollo, QNH ${QNH}, transponder ${sq}, ${CSB.d}.`,
            sbPista?frase(pistaF(altra),', cleared for take-off, ',qnhF(),', ',squawkF(sq),', ',CSB):frase(pistaF(te),', cleared for take-off, ',qnhF(),', ',squawkF(sqS),', ',CSB),
            sbPista?`Pista ${altra.nome}, autorizzato al decollo, QNH ${QNH}, transponder ${sq}, ${CSB.d}.`:`Pista ${te.nome}, autorizzato al decollo, QNH ${QNH}, transponder ${sqS}, ${CSB.d}.`,
            frase(CSB,', negative, ',pistaF(te),', ',squawkF(sq),', I say again, ',pistaF(te),', cleared for take-off'),
            `${CSB.d}, negativo, pista ${te.nome}, transponder ${sq}, ripeto, pista ${te.nome}, autorizzato al decollo.`,
            ()=>{fase='autorizzato';assegna(sq);avvisa(L('Prima di partire ','Before take-off ')+testoSquawk(sq)+' · ALT');}));
      }else{
        atcDice(frase(CSB,', ',nomeStaz(),', ',pistaF(te),' in use, ',ventoF(),', ',qnhF(),', no reported traffic, report airborne'),
          `${CSB.d}, ${staz.nome}, pista in uso ${te.nome}, ${ventoIt()}, QNH ${QNH}, nessun traffico segnalato, riportate in volo.`,
          readback(frase(pistaF(te),', ',qnhF(),', wilco, ',CSB),`Pista ${te.nome}, QNH ${QNH}, eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{fase='autorizzato';}));
      }
    }};
  }
  function chiamataArrivo(ils){
    const ap=ctx.arr.ap,te=ctx.arr.te,s2=stazioni.get(ap),pos=posizioneDa(ap),q=piedi(st.pos.y*FT);
    const f=frase(s2.parla,', ',CS,', ',TIPO,', ',pos.f,', ',q,', inbound for landing',ils?', request ILS approach '+'':'',ils?pistaF(te):'');
    const it=`${s2.nome}, ${REG}, ${TIPO.d}, ${pos.it}, ${Math.round(st.pos.y*FT/100)*100} piedi, in arrivo per l'atterraggio${ils?`, chiediamo avvicinamento ILS pista ${te.nome}`:''}.`;
    return {f,it,etichettaIt:ils?L('(arrivo con avvicinamento ILS)','(arrival with ILS approach)'):L('(arrivo a vista)','(visual arrival)'),fai:()=>{
      staz=s2;pilotaDice(f,it);attendi(1300);
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
      let sq=null,id=false;
      if(s2.torre){sq=nuovoCodice();id=Math.random()<0.5;
        ist=frase(squawkF(sq),id?' and ident':'',', ',ist);istIt=`transponder ${sq}${id?' e ident':''}, ${istIt}`;
        rb=frase(squawkF(sq),', ',rb);rbIt=`Transponder ${sq}, ${rbIt}`;}
      atcDice(frase(CSB,', ',s2.parla,', ',ist),`${CSB.d}, ${s2.nome}, ${istIt}.`,
        readback(rb,rbIt,s2.torre?frase(pistaF(te),', ',qnhF(QNH-10),', wilco, ',CSB):null,`Pista ${te.nome}, QNH ${QNH-10}, eseguiremo, ${CSB.d}.`,
          frase(CSB,', negative, ',qnhF(),', I say again, ',qnhF()),`${CSB.d}, negativo, QNH ${QNH}, ripeto, QNH ${QNH}.`,()=>{fase='arrivo';if(sq){assegna(sq);if(id)xp.identRichiesto=Date.now();}
            avvisa((sq?testoSquawk(sq)+(id?L(' e premi IDENT',' and press IDENT'):'')+' · ':'')+L('quando sei in finale, chiama la torre (T)','when on final, call the tower (T)'));}));
    }};
  }
  function chiamataFinale(){
    const te=(ctx.finale&&ctx.fin&&staz&&staz.ap===ctx.fin.ap)?ctx.fin.te:(ctx.arr&&staz&&staz.ap===ctx.arr.ap?ctx.arr.te:null);
    const f=frase(CSB,', final ',te?pistaF(te):'');
    const it=`${CSB.d}, in finale${te?' pista '+te.nome:''}.`;
    return {f,it,fai:()=>{
      pilotaDice(f,it);attendi(1100);
      if(!te){atcDice(frase(CSB,', say again'),`${CSB.d}, ripetete.`);return;}
      const r=rispettoPista(te),inFinale=r.avanti>200&&r.avanti<7*NM&&Math.abs(r.ang)<25;
      if(!inFinale){atcDice(frase(CSB,', negative, you are not on final, report final ',pistaF(te)),`${CSB.d}, negativo, non siete in finale, riportate in finale pista ${te.nome}.`);return;}
      const prima=staz.torre&&traffico?traffico.davanti(staz.ap,te,st.pos):null;
      if(prima){   // un altro aereo atterra prima: l'autorizzazione arriva quando la pista è libera (in aggiorna)
        atcDice(frase(CSB,', number two, traffic ',prima.tipo,' on short final, continue approach'),`${CSB.d}, numero due, traffico ${prima.tipo.d} in corto finale, continuate l'avvicinamento.`,
          readback(frase('Number two, continue approach, ',CSB),`Numero due, continuiamo l'avvicinamento, ${CSB.d}.`,null,null,null,null,()=>{numeroDue=te;}));
        avvisa('');return;
      }
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
  /* ---------- emergenze dichiarate dal pilota ----------
     MAYDAY = pericolo grave e imminente, PAN-PAN = urgenza. Il pilota sceglie il motivo (l'aereo non ha
     guasti veri); la chiamata segue lo schema ICAO: stazione, nominativo, tipo, natura, intenzioni,
     posizione, quota, prua, persone a bordo. Si sente sempre (frequenza di emergenza 121.5): risponde la
     stazione dell'aeroporto più vicino, che dà prua e distanza, precedenza e soccorsi. */
  const CAUSE={
    motore:    {liv:'mayday',f:'engine failure',it:'piantata motore'},
    incendio:  {liv:'mayday',f:'engine fire',it:'incendio al motore'},
    fumo:      {liv:'mayday',f:'smoke in the cockpit',it:'fumo in cabina'},
    irregolare:{liv:'pan',f:'rough running engine',it:'motore che funziona male'},
    carburante:{liv:'pan',f:'low fuel',it:'poco carburante'},
    malore:    {liv:'pan',f:'sick passenger on board',it:'passeggero che sta male'},
    perso:     {liv:'pan',f:'uncertain of position',it:'incerti sulla posizione'},
  };
  let dich=null;   // emergenza in corso: {causa, liv, ap}
  const nomeAp=ap=>ap.nome.replace(/-/g,' ');
  function dichiara(chiave){
    const c=CAUSE[chiave],may=c.liv==='mayday',v=aeroportoVicino(),ap=v.ap,s2=stazioni.get(ap);
    const pos=posizioneDa(ap,nomeAp(ap)),q=piedi(st.pos.y*FT);
    const trk=tre(Math.atan2(st.vel.x,-st.vel.z)*R2D);
    // a motore fermo: si arriva in planata al campo? (efficienza ~9, con un po' di margine)
    const sopra=st.pos.y-(T.terrainH?T.terrainH(ap.x,ap.z):0),arriva=v.d<sopra*7.5;
    const ripeti3=may?'Mayday, Mayday, Mayday, ':'Pan-pan, Pan-pan, Pan-pan, ',parola=may?'Mayday':'Pan-pan';
    const intenz={
      motore:arriva?[`gliding to ${nomeAp(ap)}`,`planiamo verso ${ap.nome}`]:['attempting forced landing','tentiamo un atterraggio fuori campo'],
      incendio:[`diverting to ${nomeAp(ap)}, request immediate landing`,`dirigiamo su ${ap.nome}, chiediamo di atterrare subito`],
      fumo:[`diverting to ${nomeAp(ap)}, request immediate landing`,`dirigiamo su ${ap.nome}, chiediamo di atterrare subito`],
      irregolare:[`diverting to ${nomeAp(ap)}`,`dirigiamo su ${ap.nome}`],
      carburante:[`request priority landing at ${nomeAp(ap)}`,`chiediamo la precedenza per atterrare a ${ap.nome}`],
      malore:[`request priority landing at ${nomeAp(ap)} and medical assistance`,`chiediamo la precedenza per atterrare a ${ap.nome} e assistenza medica`],
      perso:['request position and heading to the nearest airport','chiediamo posizione e prua per l\'aeroporto più vicino'],
    }[chiave];
    const sq7=xp.codice==='7700'&&xp.modo!=='STBY';
    // chi è perso non sa dire dove si trova
    const dove=chiave==='perso'?frase(''):frase(', ',pos.f), doveIt=chiave==='perso'?'':`, ${pos.it}`;
    const due=chiave==='malore';   // con un passeggero a bordo si è in due
    const f=frase(ripeti3,s2.parla,', ',CS,', ',TIPO,', ',c.f,', ',intenz[0],dove,', ',q,', heading ',{d:trk,s:cifre(trk)},due?', two persons on board':', one person on board',sq7?', squawking 7700':'');
    const it=`${ripeti3}${s2.nome}, ${REG}, ${TIPO.d}, ${c.it}, ${intenz[1]}${doveIt}, ${Math.round(st.pos.y*FT/100)*100} piedi, prua ${trk}, ${due?'due persone':'una persona'} a bordo${sq7?', transponder 7700':''}.`;
    return {f,it,fai:()=>{
      dich={causa:chiave,liv:c.liv,ap};emergenza=false;maydayFatto=true;
      if(traffico&&traffico.emergenza)traffico.emergenza(ap);
      if(api.alEmergenza)api.alEmergenza(c.liv);
      avvisa('');pilotaDice(f,it);attendi(1300);
      const b=tre(Math.atan2(ap.x-st.pos.x,-(ap.z-st.pos.z))*R2D),nm=Math.max(1,Math.round(v.d/NM));
      staz=s2;if(auto)sintonizza(s2);
      // codice: 7700 col Mayday, uno nuovo col Pan-pan (per riconoscere l'aereo sul radar)
      const sq=may?'7700':nuovoCodice(),giaSq=may&&sq7;
      if(!giaSq)assegna(sq);
      const vai=frase(', nearest airport ',nomeAp(ap),', heading ',{d:b,s:cifre(b)},', ',{d:nm+(nm===1?' mile':' miles'),s:cifre(nm)+(nm===1?' mile':' miles')});
      const vaiIt=`, aeroporto più vicino ${ap.nome}, prua ${b}, ${nm} ${nm===1?'miglio':'miglia'}`;
      const fuori=chiave==='motore'&&!arriva;
      const f2=frase(CSB,', ',s2.parla,', roger ',parola,giaSq?'':frase(', ',squawkF(sq)),
        chiave==='perso'?frase(', identified, ',posizioneDa(ap,nomeAp(ap)).f):'',vai,
        fuori?', if unable, land at your discretion':'',', ',ventoF(),', ',qnhF(),
        // solo una torre autorizza; un servizio Information/Radio lascia decidere al pilota
        may?(s2.torre?', cleared to land any runway':', landing at your discretion')+', emergency services alerted'
          :', you have priority'+(s2.torre?', cleared to land any runway':', landing at your discretion'),
        chiave==='malore'?', ambulance will be waiting':'');
      const it2=`${CSB.d}, ${s2.nome}, ricevuto ${parola}${giaSq?'':', transponder '+sq}`+
        (chiave==='perso'?`, identificati, ${posizioneDa(ap,nomeAp(ap)).it}`:'')+vaiIt+
        (fuori?', se non ci arrivate atterrate dove ritenete opportuno':'')+`, ${ventoIt()}, QNH ${QNH}`+
        (may?'':', avete la precedenza')+(s2.torre?', autorizzati ad atterrare su qualsiasi pista':', atterraggio a vostra discrezione')+(may?', soccorsi allertati':'')+
        (chiave==='malore'?', un\'ambulanza vi aspetterà':'')+'.';
      const sbagliataB=tre(+b+(Math.random()<0.5?-40:40));
      // (pezzi separati: frase() annidata toglie lo spazio finale)
      const sqRb=giaSq?['Heading ']:['Squawk ',cod(sq),', heading '];
      atcDice(f2,it2,readback(
        frase(...sqRb,{d:b,s:cifre(b)},', ',qnhF(),s2.torre?', cleared to land any runway, ':', ',CSB),
        `${giaSq?'Prua':'Transponder '+sq+', prua'} ${b}, QNH ${QNH}${s2.torre?', autorizzati su qualsiasi pista':''}, ${CSB.d}.`,
        frase(...sqRb,{d:sbagliataB,s:cifre(sbagliataB)},', ',qnhF(),', ',CSB),
        `${giaSq?'Prua':'Transponder '+sq+', prua'} ${sbagliataB}, QNH ${QNH}, ${CSB.d}.`,
        frase(CSB,', negative, heading ',{d:b,s:cifre(b)}),`${CSB.d}, negativo, prua ${b}.`,
        ()=>{fase='finale';avvisa(fuori?L(`Troppo lontano da ${ap.nome}: scegli un campo libero e atterra controvento`,`Too far from ${ap.nome}: pick a clear field and land into the wind`)
          :L(`Emergenza: vai a ${ap.nome}, prua ${b}, ${nm} NM · qualsiasi pista`,`Emergency: go to ${ap.nome}, heading ${b}, ${nm} NM · any runway`));}),true);
    }};
  }
  // annullare l'emergenza (problema risolto)
  function annulla(){
    const parola=dich.liv==='mayday'?'Mayday':'Pan-pan',s2=stazioni.get(dich.ap);
    const f=frase(s2.parla,', ',CSB,', cancel ',parola,', problem solved');
    const it=`${s2.nome}, ${CSB.d}, annulliamo il ${parola}, problema risolto.`;
    return {f,it,fai:()=>{
      pilotaDice(f,it);attendi(1000);dich=null;
      if(traffico&&traffico.emergenza)traffico.emergenza(null);
      const sq=nuovoCodice();
      atcDice(frase(CSB,', roger, ',parola,' cancelled, ',squawkF(sq),', report your intentions'),`${CSB.d}, ricevuto, ${parola} annullato, transponder ${sq}, riportate le vostre intenzioni.`,
        readback(frase(squawkF(sq),', wilco, ',CSB),`Transponder ${sq}, eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{assegna(sq);fase='rotta';}),true);
    }};
  }
  // voce del menu che apre l'elenco dei motivi
  function voceEmergenza(){
    return {f:{d:'EMERGENCY: Mayday / Pan-pan…',s:''},it:'Emergenza: scegli il motivo…',
      sotto:()=>Object.keys(CAUSE).map(k=>{const o=dichiara(k);
        o.etichetta=(CAUSE[k].liv==='mayday'?'MAYDAY · ':'PAN-PAN · ')+L(CAUSE[k].it,CAUSE[k].f);return o;})};
  }
  const mayday=()=>dichiara('motore');   // motore spento senza carburante
  function provaRadio(){
    const c=com,f=frase(c.parla,', ',CSB,', radio check');
    const it=`${c.nome}, ${CSB.d}, prova radio.`;
    return {f,it,fai:()=>{pilotaDice(f,it);attendi(1000);
      trasmetti('atc',frase(CSB,', ',c.parla,', reading you five'),`${CSB.d}, ${c.nome}, vi ricevo forte e chiaro (5).`);}};
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
    mostraMenu(opzioni());
  }
  function mostraMenu(lista){
    menu=lista;
    const el=$('radioMenu');if(!el) return;
    if(!menu.length){menu=null;el.hidden=false;el.innerHTML=`<li class="vuoto">${L('Niente da dire adesso.','Nothing to say right now.')}</li>`;setTimeout(chiudiMenu,1800);return;}
    el.innerHTML=menu.map((o,i)=>`<li><button type="button" data-i="${i}"><kbd>${i+1}</kbd> <span>`+(o.etichetta?`<b>${esc(o.etichetta)}</b><br>`:'')+`${esc(o.f.d)}`+
      (SIM.lingua!=='en'&&o.it?`<i>${esc(o.it)}</i>`:'')+(o.etichettaIt?`<i>${esc(o.etichettaIt)}</i>`:'')+`</span></button></li>`).join('')+
      `<li class="nota">${L('1…'+menu.length+' per scegliere · T o Esc per chiudere','1…'+menu.length+' to choose · T or Esc to close')}</li>`;
    el.hidden=false;
    for(const b of el.querySelectorAll('button[data-i]'))b.addEventListener('click',()=>{scegli(+b.dataset.i);b.blur();});
  }
  function chiudiMenu(){menu=null;const el=$('radioMenu');if(el){el.hidden=true;el.innerHTML='';}}
  function scegli(i){
    if(!menu||!menu[i]) return;
    const o=menu[i];
    if(o.sotto){mostraMenu(o.sotto());return;}   // apre un elenco (motivi dell'emergenza)
    chiudiMenu();
    if(parlando&&coda.length>2) return;
    if(o.verso&&!sulCanale(o.verso)){pilotaDice(o.f,o.it);nessunaRisposta(o.verso);return;}
    o.fai();
  }

  // tasto U: le stazioni più vicine, una dopo l'altra
  function prossimaCom(){
    if(!st) return;
    const vic=[...stazioni.values(),...terra.values()].sort((a,b)=>Math.hypot(a.ap.x-st.pos.x,a.ap.z-st.pos.z)-Math.hypot(b.ap.x-st.pos.x,b.ap.z-st.pos.z)).slice(0,6);
    sintonizza(vic[(vic.indexOf(com)+1)%vic.length]);
    if(audio.attivo)audio.fruscio(0.1);
  }
  // pannello: menu COM1 e casella della sintonia automatica
  const sel=$('selCom');
  if(sel){
    sel.innerHTML=`<option value="-1">— ${L('spenta','off')} —</option>`+elencoCom.map((s,i)=>`<option value="${i}">${s.freq} ${esc(s.nome)}${s.vera?'':' '+L('(simulata)','(simulated)')}</option>`).join('');
    sel.addEventListener('change',()=>{const i=+sel.value;sintonizza(i>=0?elencoCom[i]:null);sel.blur();});
  }
  const ca=$('comAuto');
  if(ca){ca.checked=auto;ca.addEventListener('change',()=>{auto=ca.checked;try{localStorage.setItem('volo-com-auto',auto?'1':'0');}catch(e){}ca.blur();});}

  const api={
    alEmergenza:null,   // (livello) => … chiamata quando il pilota dichiara un'emergenza (js/main.js: libretto)
    reset,
    stazioneDi:ap=>stazioni.get(ap)||null,
    terraDi:ap=>terra.get(ap)||null,
    get menuAperto(){return !!menu;},
    get xpdr(){return {codice:xp.digita!==null?(xp.digita+'____').slice(0,4):xp.codice,modo:xp.modo,ident:identAcceso()};},
    get comFreq(){return com?com.freq:null;},
    // nessuna trasmissione in corso e nessuna risposta attesa (o attesa da più di 40 s)
    get libero(){return !parlando&&(!att||Date.now()-attTimer>40000);},
    usaTraffico(t){traffico=t;},
    /* trasmissioni degli altri aerei e delle risposte (js/traffico.js): righe = [{chi:'altro'|'atc', nome, f, it}].
       Si sentono solo con COM1 su quella stazione e se la radio è libera (niente in corso, nessuna risposta attesa). */
    annuncio(s,righe){
      if(!st||com!==s||parlando||att||coda.length||menu) return false;
      righe.forEach((r,i)=>{if(i)coda.push({pausa:900});coda.push({chi:r.chi,nome:r.nome,en:r.f.d,sp:r.f.s,it:r.it});});
      prossimo();return true;
    },
    // tasti: T apre/chiude il menu; con il menu aperto le cifre scelgono (e non muovono la manetta)
    tasto(e){
      if(xp.digita!==null){   // si sta digitando il codice del transponder: le cifre non toccano la manetta
        if(e.code==='Escape'){xp.digita=null;disegnaXpdr();return true;}
        if(e.code==='Backspace'){xp.digita=xp.digita.slice(0,-1);disegnaXpdr();return true;}
        const c=/^(Digit|Numpad)([0-9])$/.exec(e.code);
        if(c){if(!e.repeat&&+c[2]<8){xp.digita+=c[2];if(xp.digita.length===4)impostaCodice(xp.digita);else disegnaXpdr();}return true;}
      }
      if(e.code==='KeyT'&&e.shiftKey&&!e.repeat){iniziaDigita();return true;}
      if(e.code==='KeyT'&&!e.repeat){if(menu)chiudiMenu();else apriMenu();return true;}
      if(e.code==='KeyU'&&!e.repeat&&!menu){prossimaCom();return true;}
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
      // transponder: la torre controlla il codice assegnato, il modo ALT in volo vicino al campo e l'ident
      if(staz&&!parlando&&!att&&com===staz){
        if(xp.atteso&&xp.codice!==xp.atteso&&!xp.richiamato&&Date.now()-xp.tAtteso>30000&&(staz.torre||xp.atteso==='7700')){
          xp.richiamato=true;const c=xp.atteso;
          atcDice(frase(CSB,', check squawk ',cod(c)),`${CSB.d}, verificate il transponder: codice ${c}.`,
            readback(frase('Squawking ',cod(c),', ',CSB),`Transponder ${c}, ${CSB.d}.`,null,null,null,null,()=>{}));
          avvisa(testoSquawk(c));
        }else if(staz.torre&&!s.aTerra&&s.agl>60&&xp.modo!=='ALT'&&!xp.modoRichiamato&&Math.hypot(staz.ap.x-s.pos.x,staz.ap.z-s.pos.z)<8*NM){
          xp.modoRichiamato=true;
          atcDice(frase(CSB,', check transponder, squawk mode Charlie'),`${CSB.d}, verificate il transponder: modo C (ALT).`,
            readback(frase('Mode Charlie, ',CSB),`Modo C, ${CSB.d}.`,null,null,null,null,()=>{}));
          avvisa(L('Metti il transponder su ALT (scheda RADIO)','Set the transponder to ALT (RADIO tab)'));
        }else if(xp.identRichiesto&&xp.ident>xp.identRichiesto&&xp.codice===xp.atteso&&xp.modo!=='STBY'){
          xp.identRichiesto=0;const p=posizioneDa(staz.ap);
          atcDice(frase(CSB,', identified, ',p.f),`${CSB.d}, identificati, ${p.it}.`);
        }
      }
      // "number two": quando l'aereo davanti ha passato la pista arriva l'autorizzazione all'atterraggio
      if(numeroDue&&staz&&!parlando&&!att&&(!traffico||!traffico.davanti(staz.ap,numeroDue,s.pos))){
        const te=numeroDue;numeroDue=null;
        if(!s.aTerra)atcDice(frase(CSB,', ',pistaF(te),', ',ventoF(),', cleared to land'),`${CSB.d}, pista ${te.nome}, ${ventoIt()}, autorizzato all'atterraggio.`,
          readback(frase('Cleared to land ',pistaF(te),', ',CSB),`Autorizzato all'atterraggio pista ${te.nome}, ${CSB.d}.`,null,null,null,null,()=>{fase='finale';}));
      }
      // informazioni di traffico: un altro aereo vicino (in volo, con la torre del campo sulla frequenza)
      if(traffico&&staz&&staz.torre&&com===staz&&!s.aTerra&&!parlando&&!att&&s.gs>10){
        const trk=(Math.atan2(s.vel.x,-s.vel.z)*R2D+360)%360,t=traffico.daSegnalare(staz.ap,s.pos,trk);
        if(t){
          const nm=t.nm===1?{d:'1 mile',s:'one mile'}:{d:t.nm+' miles',s:cifre(t.nm)+' miles'};
          atcDice(frase(CSB,', traffic ',{d:t.ore+" o'clock",s:(t.ore===10||t.ore===11||t.ore===12?['ten','eleven','twelve'][t.ore-10]:NUM[t.ore])+" o'clock"},', ',nm,', ',t.tipo,' on ',t.fase[0],', ',t.q[0]),
            `${CSB.d}, traffico a ore ${t.ore}, ${t.nm} ${t.nm===1?'miglio':'miglia'}, ${t.tipo.d} in ${t.fase[1]}, ${t.q[1]}.`,
            [{f:frase('Traffic in sight, ',CSB),it:`Traffico in vista, ${CSB.d}.`,fai:()=>{att=null;avvisa('');}},
             {f:frase('Looking out, ',CSB),it:`Lo cerchiamo, ${CSB.d}.`,fai:()=>{att=null;avvisa('');}}]);
        }
      }
      // uscita dalla zona di controllo della partenza
      if(!uscitaFatta&&staz&&ctx.part&&staz.ap===ctx.part.ap&&!s.aTerra&&(fase==='autorizzato'||fase==='partenza')){
        const d=Math.hypot(ctx.part.ap.x-s.pos.x,ctx.part.ap.z-s.pos.z);
        if(d>5*NM&&!parlando&&!att){
          uscitaFatta=true;
          const s2=ctx.arr&&ctx.arr.ap!==ctx.part.ap?stazioni.get(ctx.arr.ap):null;
          const poi=s2?frase(', for arrival contact ',s2.parla,' on ',freqF(s2.freq)):frase('');
          const poiIt=s2?`, per l'arrivo contattate ${s2.nome} su ${s2.freq}`:'';
          if(staz.torre)atcDice(frase(CSB,', leaving the control zone, ',squawkF('7000'),', frequency change approved',poi,', good flight'),`${CSB.d}, state lasciando la zona di controllo, transponder 7000, cambio frequenza approvato${poiIt}, buon volo.`,
            readback(frase('Squawk 7000, frequency change approved',s2?frase(', ',freqF(s2.freq)):frase(''),', good day, ',CSB),`Transponder 7000, cambio frequenza approvato${s2?', '+s2.freq:''}, buona giornata, ${CSB.d}.`,
              s2?frase('Frequency change approved, ',freqF((+s2.freq+0.1).toFixed(3)),', good day, ',CSB):null,s2?`Cambio frequenza approvato, ${(+s2.freq+0.1).toFixed(3)}, buona giornata, ${CSB.d}.`:null,
              s2?frase(CSB,', negative, ',s2.parla,' on ',freqF(s2.freq)):null,s2?`${CSB.d}, negativo, ${s2.nome} su ${s2.freq}.`:null,
              ()=>{fase='rotta';staz=null;assegna('7000');}));
          else{fase='rotta';staz=null;intestazione();}
        }
      }
      // vicino alla destinazione: ricorda di chiamare
      if(fase==='rotta'&&ctx.arr&&!arrivoAvvisato){
        const d=Math.hypot(ctx.arr.ap.x-s.pos.x,ctx.arr.ap.z-s.pos.z);
        if(d<20*NM&&!s.aTerra){arrivoAvvisato=true;const s2=stazioni.get(ctx.arr.ap);
          avvisa(auto?L(`Chiama ${s2.nome} per l'arrivo (T) · ${s2.freq}`,`Call ${s2.nome} for arrival (T) · ${s2.freq}`)
            :L(`Sintonizza ${s2.freq} (${s2.nome}) con U o il menu COM1, poi chiama (T)`,`Tune ${s2.freq} (${s2.nome}) with U or the COM1 menu, then call (T)`));}
      }
      // dopo l'atterraggio, a bassa velocità: liberare la pista
      if(fase==='atterrato'&&!benvenuto&&s.aTerra&&s.gs<12&&!parlando){
        benvenuto=true;
        if(staz){
          const citta=staz.ap.nome.replace(/-.*$/,'');
          // dove parcheggiare (js/main.js, preparaArrivo): piazzola con il numero detto cifra per cifra e le vie da seguire
          const arr=ctx.arrivo||{},vie=viaF(arr.vie),vieIt=arr.vie&&arr.vie.length?' via '+arr.vie.join(', '):'';
          const dove=arr.ref?frase('stand ',{d:arr.ref,s:arr.ref.split('').map(c=>/\d/.test(c)?NUM[+c]:NATO[c.toUpperCase()]||c).join(' ')}):'the apron';
          const doveIt=arr.ref?`alla piazzola ${arr.ref}`:'al piazzale';
          atcDice(frase(CSB,', vacate the runway at the next taxiway, taxi to ',dove,vie,', welcome to ',citta),`${CSB.d}, liberate la pista al prossimo raccordo, rullate ${doveIt}${vieIt}, benvenuti a ${citta}.`,
            readback(frase('Vacating the runway, taxiing to ',dove,vie,', ',CSB),`Liberiamo la pista, rulliamo ${doveIt}${vieIt}, ${CSB.d}.`,null,null,null,null,()=>{}));
        }
      }
    },
    evento(e,s,c){
      st=s;ctx=c;
      if(e.tipo==='incidente'){zitto();chiudiMenu();avvisa('');return;}
      if(e.tipo==='senzaCarburante'){emergenza=true;if(!dich||dich.liv!=='mayday')maydayFatto=false;avvisa(L('Motore spento: dichiara emergenza (T)','Engine out: declare an emergency (T)'));return;}
      if(e.tipo==='decollo'){
        if(staz&&staz.torre&&(fase==='pronto'||fase==='parcheggio'||fase==='rullaggio')){
          atcDice(frase(CSB,', ',nomeStaz(),', you are airborne without take-off clearance, report leaving the control zone'),
            `${CSB.d}, ${staz.nome}, siete decollati senza autorizzazione, riportate quando lasciate la zona di controllo.`,
            readback(frase('Wilco, ',CSB),`Eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{}));
        }
        if(fase==='pronto'||fase==='parcheggio'||fase==='rullaggio'||fase==='autorizzato')fase='partenza';
        avvisa('');
      }
      if(e.tipo==='atterraggio'){
        const v=aeroportoVicino();
        if(dich){   // atterrati in emergenza: arrivano i soccorsi (sul posto, se fuori campo)
          const s2=stazioni.get(dich.ap),fuori=v.d>2500,mal=dich.causa==='malore';
          staz=s2;benvenuto=true;fase='atterrato';avvisa('');
          if(traffico&&traffico.emergenza)traffico.emergenza(null);
          if(fuori)atcDice(frase(CSB,', ',s2.parla,', roger, landed, rescue services are on their way to your position'),
            `${CSB.d}, ${s2.nome}, ricevuto, atterrati: i soccorsi stanno arrivando sul posto.`,
            readback(frase('Roger, we are fine, ',CSB),`Ricevuto, stiamo bene, ${CSB.d}.`,null,null,null,null,()=>{}),true);
          else atcDice(frase(CSB,', stop on the runway, ',mal?'the ambulance is':'emergency vehicles are',' coming to you'),
            `${CSB.d}, fermatevi sulla pista, ${mal?'l\'ambulanza sta':'i mezzi di soccorso stanno'} arrivando.`,
            readback(frase('Stopping on the runway, ',CSB),`Ci fermiamo sulla pista, ${CSB.d}.`,null,null,null,null,()=>{}),true);
          return;
        }
        if(staz&&v.ap===staz.ap&&staz.torre&&fase!=='finale'){
          atcDice(frase(CSB,', ',nomeStaz(),', you landed without clearance, contact the tower after parking'),
            `${CSB.d}, ${staz.nome}, siete atterrati senza autorizzazione, contattate la torre dopo il parcheggio.`,
            readback(frase('Wilco, ',CSB),`Eseguiremo, ${CSB.d}.`,null,null,null,null,()=>{}));
          benvenuto=true;
        }
        if(!staz||v.ap!==staz.ap)staz=stazioni.get(v.ap);
        fase='atterrato';avvisa('');
      }
    },
  };
  return api;
};
})();
