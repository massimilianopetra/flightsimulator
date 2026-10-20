/* =====================================================================
   LIBRETTO DI VOLO
   Come quello vero del pilota: ogni volo viene scritto da solo, dal
   decollo a quando ci si ferma (o all'incidente). Per ogni volo: data,
   da dove a dove, durata, distanza, quota massima, atterraggi (il più
   dolce) e l'eventuale missione con le stelle. Tutto resta nel browser
   (localStorage 'volo-libretto'); si guarda dal briefing, dalla pausa o
   dal pulsante LIBRETTO.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const L=(it,en)=>SIM.L?SIM.L(it,en):it;
const FT=3.28084, NM=1852, MAX=300;   // voli tenuti al massimo
const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');

SIM.creaLibretto=function(){
  let voli=[];
  try{const d=JSON.parse(localStorage.getItem('volo-libretto')||'null');if(d&&Array.isArray(d.voli))voli=d.voli;}catch(e){}
  const salva=()=>{try{localStorage.setItem('volo-libretto',JSON.stringify({voli:voli.slice(-MAX)}));}catch(e){}};
  let aperto=null;      // volo in corso (dal decollo)
  let fermo=0;          // secondi fermi a terra dopo un atterraggio

  /* decollo: si apre un volo nuovo (se ce n'è già uno aperto, per esempio dopo un tocca e riparti, continua quello) */
  function decollo(info){
    if(aperto) return;
    aperto={data:new Date().toISOString(),aereo:(window.AEREO&&window.AEREO.id)||'c172',mondo:info.mondo||'',da:info.da||'',a:'',durata:0,dist:0,altMax:0,
      atterraggi:0,migliore:null,ultimo:null,ora:info.ora||'giorno',esito:'',missione:null};
  }
  // ogni fotogramma (solo a gioco attivo): tempo, distanza e quota; il volo si chiude quando ci si ferma dopo un atterraggio
  function aggiorna(dt,st){
    if(!aperto) return;
    aperto.durata+=dt;aperto.dist+=st.gs*dt;
    aperto.altMax=Math.max(aperto.altMax,st.pos.y*FT);
    if(aperto.atterraggi&&st.aTerra&&st.gs<0.6){fermo+=dt;if(fermo>3)chiudi('ok');}else fermo=0;
  }
  // atterraggio (anche tocca e riparti): ap = codice dell'aeroporto o '' se fuori pista
  function atterraggio(a){
    if(!aperto) return;
    aperto.atterraggi++;aperto.a=a.ap||L('fuori campo','off-field');
    aperto.ultimo={fpm:Math.round(a.fpm),giudizio:a.giudizio,ap:a.ap||''};
    if(a.suPista&&(aperto.migliore==null||a.fpm<aperto.migliore))aperto.migliore=Math.round(a.fpm);
  }
  // emergenza dichiarata alla radio (js/atc.js): 'mayday' o 'pan' (resta la più grave)
  function emergenza(liv){
    if(!aperto) return;
    if(aperto.emergenza!=='mayday')aperto.emergenza=liv;
  }
  // chiude il volo: 'ok' (fermi dopo l'atterraggio), 'incidente', 'interrotto' (ricomincia o briefing in volo)
  function chiudi(esito){
    if(!aperto) return null;
    aperto.esito=esito;aperto.durata=Math.round(aperto.durata);aperto.dist=Math.round(aperto.dist);aperto.altMax=Math.round(aperto.altMax);
    const v=aperto;voli.push(v);aperto=null;fermo=0;salva();
    return v;
  }
  // risultato di una missione: va sul volo in corso, altrimenti sull'ultimo appena chiuso (entro 2 minuti)
  function missione(r){
    const m={nome:r.nome,tipo:r.tipo,riuscita:!!r.riuscita,stelle:r.stelle||0,punti:r.punti==null?null:r.punti,tempo:r.tempo==null?null:Math.round(r.tempo),rotta:r.rotta||''};
    if(aperto){aperto.missione=m;return;}
    const u=voli[voli.length-1];
    if(u&&!u.missione&&Date.now()-Date.parse(u.data)-u.durata*1000<120000){u.missione=m;salva();return;}
    voli.push({data:new Date().toISOString(),aereo:(window.AEREO&&window.AEREO.id)||'c172',mondo:r.mondo||'',da:r.da||'',a:r.a||'',durata:0,dist:0,altMax:0,atterraggi:0,migliore:null,ultimo:null,ora:'',esito:r.riuscita?'ok':'',missione:m});
    salva();
  }
  function svuota(){voli=[];aperto=null;salva();}

  /* ---------- pagina del libretto ---------- */
  const hhmm=s=>{s=Math.round(s/60);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
  const mmss=s=>{s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
  const stelle=n=>'★'.repeat(n)+'☆'.repeat(3-n);
  const data=iso=>{const d=new Date(iso);return d.toLocaleDateString(SIM.lingua==='en'?'en-GB':'it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'})+' '+d.toLocaleTimeString(SIM.lingua==='en'?'en-GB':'it-IT',{hour:'2-digit',minute:'2-digit'});};
  const NOMI={tempo:L('A tempo','Against the clock'),tappe2:L('Giro corto','Short tour'),tappe3:L('Giro lungo','Long tour'),precisione:L('Precisione','Precision')};
  function html(){
    const tutti=voli.concat(aperto?[aperto]:[]);
    if(!tutti.length) return `<p class="dim">${L('Il libretto è vuoto: ogni volo viene scritto qui da solo, dal decollo a quando ti fermi dopo l\'atterraggio.','The logbook is empty: every flight is written here automatically, from take-off until you stop after landing.')}</p>`;
    let ore=0,dist=0,att=0,dolce=null,miss=0,st=0,inc=0;
    const rec={};   // record per tipo di missione (e per rotta a tempo)
    for(const v of tutti){
      ore+=v.durata;dist+=v.dist;att+=v.atterraggi;if(v.esito==='incidente')inc++;
      if(v.migliore!=null&&(dolce==null||v.migliore<dolce))dolce=v.migliore;
      const m=v.missione;if(!m||!m.riuscita)continue;
      miss++;st+=m.stelle;
      const k=m.tipo==='tempo'?'tempo '+m.rotta:m.tipo;
      const r=rec[k];
      const meglio=m.tipo==='precisione'?(!r||m.punti>r.punti):(!r||m.tempo<r.tempo);
      if(meglio)rec[k]=m;
    }
    const tess=(n,l)=>`<div class="tess"><b>${n}</b><span>${l}</span></div>`;
    let h=`<div class="tessere">`+
      tess(tutti.length,L('voli','flights'))+tess(hhmm(ore),L('ore di volo','flight hours'))+
      tess(att,L('atterraggi','landings'))+tess(Math.round(dist/NM),L('miglia (NM)','nautical miles'))+
      tess(dolce==null?'—':dolce+' ft/min',L('atterraggio più dolce','softest landing'))+
      tess(miss,L('missioni riuscite','missions completed'))+tess(st+' ★',L('stelle','stars'))+
      (inc?tess(inc,L('incidenti','crashes')):'')+`</div>`;
    const righe=Object.values(rec);
    if(righe.length){
      h+=`<h3>${L('Record','Records')}</h3><ul class="record">`+righe.map(m=>`<li><b>${esc(NOMI[m.tipo]||m.nome)}</b>${m.rotta?' '+esc(m.rotta):''} · `+
        (m.tipo==='precisione'?L(`${m.punti} punti`,`${m.punti} points`):mmss(m.tempo))+` <span class="stella">${stelle(m.stelle)}</span></li>`).join('')+`</ul>`;
    }
    h+=`<h3>${L('Voli','Flights')}</h3><div class="tab-libretto"><table><thead><tr><th>${L('Data','Date')}</th><th>${L('Aereo','Aircraft')}</th><th>${L('Da','From')}</th><th>${L('A','To')}</th><th>${L('Durata','Time')}</th><th>NM</th><th>${L('Att.','Ldg')}</th><th>${L('Note','Notes')}</th></tr></thead><tbody>`;
    for(const v of tutti.slice().reverse()){
      const m=v.missione;
      let nota=v===aperto?L('in volo','airborne'):v.esito==='incidente'?L('incidente','crash'):v.esito==='interrotto'?L('interrotto','interrupted'):'';
      if(v.ultimo&&v.esito!=='incidente')nota=(nota?nota+' · ':'')+`${v.ultimo.fpm} ft/min`;
      if(v.ora&&v.ora!=='giorno')nota+=(nota?' · ':'')+(v.ora==='notte'?L('notte','night'):L('tramonto','sunset'));
      if(v.emergenza)nota+=(nota?' · ':'')+(v.emergenza==='mayday'?'MAYDAY':'PAN-PAN');
      if(m)nota+=(nota?' · ':'')+`${esc(NOMI[m.tipo]||m.nome)} `+(m.riuscita?`<span class="stella">${stelle(m.stelle)}</span>`:L('fallita','failed'));
      h+=`<tr class="${v.esito==='incidente'?'male':''}"><td>${data(v.data)}</td><td>${(v.aereo||'c172').toUpperCase()}</td><td>${esc(v.da)||'—'}</td><td>${esc(v.a)||'—'}</td><td>${hhmm(v.durata)}</td><td>${(v.dist/NM).toFixed(1)}</td><td>${v.atterraggi}</td><td>${nota}</td></tr>`;
    }
    return h+`</tbody></table></div>`;
  }
  return {decollo,aggiorna,atterraggio,emergenza,chiudi,missione,svuota,html,get aperto(){return aperto;},get voli(){return voli;}};
};
})();
