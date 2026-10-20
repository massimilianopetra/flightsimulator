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
   GENERATORE DEI RADIOAIUTI (VOR) per il mondo "Piemonte"
   ---------------------------------------------------------------------
   Uso (dalla cartella del progetto):  node strumenti/genera-radio.js
   Fonte: OurAirports, navaids.csv e airport-frequencies.csv (pubblico dominio).
   Scrive dati/piemonte-radio.js: i VOR e le frequenze vere degli aeroporti
   (torre, terra, informazioni/AFIS, radio). Gli ILS non sono in OurAirports:
   il simulatore li crea da solo sulle piste asfaltate abbastanza lunghe
   (vedi js/radio.js), con frequenze simulate.
   ===================================================================== */
'use strict';
// intestazione dei file generati: autore, copyright e licenza (i dati restano sotto la licenza della fonte)
const LICENZA=`Volo — simulatore di volo nel browser
   Autore: Massimiliano Petra <massimiliano.petra@gmail.com>
   Copyright (C) 2026 Massimiliano Petra
   Licenza: GNU General Public License versione 3 o successiva
   (GPL-3.0-or-later). Questo programma è software libero: puoi
   ridistribuirlo e/o modificarlo secondo i termini della GNU GPL
   pubblicata dalla Free Software Foundation, versione 3 o (a tua scelta)
   qualunque versione successiva. È distribuito SENZA ALCUNA GARANZIA.
   Testo completo nel file LICENSE.
   I dati contenuti restano sotto la licenza della loro fonte (vedi sotto).
   ---------------------------------------------------------------------
   `;
const fs=require('fs'), path=require('path');

// stessa zona e stessa proiezione di genera-piemonte.js
const ZONA={sud:43.95, nord:46.55, ovest:6.55, est:9.35};
const LAT0=(ZONA.sud+ZONA.nord)/2, LON0=(ZONA.ovest+ZONA.est)/2;
const KLON=111320*Math.cos(LAT0*Math.PI/180), KLAT=110574;
const proietta=(lat,lon)=>({x:(lon-LON0)*KLON, y:(lat-LAT0)*KLAT});
// i VOR un po' fuori dalla zona servono lo stesso (si ricevono da lontano)
const MARGINE=0.4;
const dentro=(lat,lon)=>lat>ZONA.sud-MARGINE&&lat<ZONA.nord+MARGINE&&lon>ZONA.ovest-MARGINE&&lon<ZONA.est+MARGINE;

const RADICE=path.join(__dirname,'..'), CACHE=path.join(__dirname,'cache');
fs.mkdirSync(CACHE,{recursive:true});

async function scarica(url,file){
  const dest=path.join(CACHE,file);
  if(fs.existsSync(dest)&&fs.statSync(dest).size>0) return fs.readFileSync(dest,'utf8');
  const r=await fetch(url,{headers:{'User-Agent':'FlightSimulatorScuola/1.0 (progetto scolastico)'}});
  if(!r.ok) throw new Error('HTTP '+r.status+' '+url);
  const t=await r.text();fs.writeFileSync(dest,t);return t;
}
function leggiCSV(testo){
  const righe=[];let campo='',riga=[],q=false;
  for(let i=0;i<testo.length;i++){
    const ch=testo[i];
    if(q){if(ch==='"'){if(testo[i+1]==='"'){campo+='"';i++;}else q=false;}else campo+=ch;}
    else if(ch==='"')q=true;
    else if(ch===','){riga.push(campo);campo='';}
    else if(ch==='\n'){riga.push(campo.replace(/\r$/,''));righe.push(riga);riga=[];campo='';}
    else campo+=ch;
  }
  if(campo||riga.length){riga.push(campo);righe.push(riga);}
  const testa=righe.shift();
  return righe.filter(r=>r.length===testa.length).map(r=>Object.fromEntries(testa.map((k,i)=>[k,r[i]])));
}
// nomi più leggibili (OurAirports li ha in maiuscolo)
const bello=s=>s.toLowerCase().replace(/(^|[\s\-'/(])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());

(async()=>{
  const nav=leggiCSV(await scarica('https://davidmegginson.github.io/ourairports-data/navaids.csv','navaids.csv'));
  const vor=[];
  for(const n of nav){
    if(!['VOR','VOR-DME','VORTAC'].includes(n.type)) continue;
    const lat=+n.latitude_deg,lon=+n.longitude_deg;
    if(!dentro(lat,lon)) continue;
    const mhz=+n.frequency_khz/1000;
    if(!(mhz>=108&&mhz<=118)) continue;
    const p=proietta(lat,lon);
    vor.push({id:n.ident,nome:bello(n.name),freq:Math.round(mhz*100)/100,dme:n.type!=='VOR',
      x:Math.round(p.x),y:Math.round(p.y),quota:Math.round((+n.elevation_ft||0)*0.3048),
      ...(n.usageType==='TERMINAL'||n.power==='LOW'?{portata:40}:{})});
  }
  vor.sort((a,b)=>a.id.localeCompare(b.id));

  /* ---- frequenze degli aeroporti del mondo Piemonte ---- */
  global.window=global;require(path.join(RADICE,'dati','piemonte.js'));
  const aeroporti=new Map(window.MAPPA.aeroporti.map(a=>[a.codice,a]));
  // nome della stazione come la chiamano i piloti (dove il nome dell'aeroporto non basta)
  const NOMINATIVO={LIMF:'Torino',LIMA:'Aeritalia',LIMC:'Malpensa',LIML:'Linate',LIMJ:'Genova',LIMN:'Cameri',LIMB:'Bresso',
    LSZA:'Lugano',LSZL:'Locarno',LSGS:'Sion'};
  const nomeBase=ap=>NOMINATIVO[ap.codice]||ap.nome.replace(/\s*\(.*\)/,'').split('-')[0].trim();
  const fr=leggiCSV(await scarica('https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv','airport-frequencies.csv'));
  const com=[],scartate=[];
  for(const r of fr){
    const ap=aeroporti.get(r.airport_ident);if(!ap) continue;
    const mhz=+r.frequency_mhz;
    if(!(mhz>=118&&mhz<137)){scartate.push(r.airport_ident+' '+r.type+' '+r.frequency_mhz);continue;}   // valori sbagliati nei dati
    const t=r.type.toUpperCase();
    let tipo=null;
    if(t==='TWR'||t==='TOWER') tipo='TWR';
    else if(t==='GND') tipo='GND';
    else if(t==='AFIS'||t==='INFO') tipo='INFO';
    else if(t==='RDO'||t==='RADIO'||t==='CTAF') tipo='RADIO';
    if(!tipo) continue;   // ATIS, APP, DEP, FIS…: per ora non servono
    const gia=com.findIndex(c=>c.ap===ap.codice&&c.tipo===tipo);
    if(gia>=0){if(com[gia].ctaf&&t!=='CTAF')com.splice(gia,1);else continue;}   // la prima di ogni tipo (meglio "Radio" di CTAF)
    // nome: quello della descrizione se è un nome vero ("Bresso Radio", "CUNEO INFO"), altrimenti costruito
    const d=(r.description||'').trim();
    let nome;
    if(/[a-z]{4,}/i.test(d.replace(/\b(TWR|GND|AFIS|INFO|RDO|ATIS|APP|Radio|Tower|Ground|Information)\b/gi,'').replace(/\[.*?\]/g,'')))
      nome=bello(d.replace(/\[.*?\]/g,'').replace(/\bINFO\b/i,'Information').trim());
    else nome=nomeBase(ap)+' '+{TWR:'Tower',GND:'Ground',INFO:'Information',RADIO:'Radio'}[tipo];
    com.push({ap:ap.codice,tipo,freq:mhz.toFixed(3),nome,...(t==='CTAF'?{ctaf:true}:{})});
  }
  for(const c of com)delete c.ctaf;
  com.sort((a,b)=>a.ap.localeCompare(b.ap)||a.tipo.localeCompare(b.tipo));
  const testo=`/* ${LICENZA}Radioaiuti (VOR) generati da strumenti/genera-radio.js.
   Fonte: OurAirports, navaids.csv (pubblico dominio). Frequenze in MHz, posizioni in metri
   (x verso est, y verso nord) dal punto lat ${LAT0}, lon ${LON0}.
   Frequenze degli aeroporti da airport-frequencies.csv (pubblico dominio). Non modificare a mano. */
window.RADIO={vor:[
${vor.map(v=>'  '+JSON.stringify(v)).join(',\n')}
],
// frequenze vere degli aeroporti: TWR torre, GND terra, INFO informazioni (AFIS), RADIO servizio radio
com:[
${com.map(c=>'  '+JSON.stringify(c)).join(',\n')}
]};
`;
  fs.writeFileSync(path.join(RADICE,'dati','piemonte-radio.js'),testo);
  console.log(`VOR: ${vor.length}`);
  for(const v of vor)console.log(`  ${v.id.padEnd(4)} ${v.freq.toFixed(2)}  ${v.nome}${v.dme?' (DME)':''}`);
  console.log(`Frequenze degli aeroporti: ${com.length} (${new Set(com.map(c=>c.ap)).size} aeroporti); scartate: ${scartate.join(', ')||'nessuna'}`);
  for(const c of com)console.log(`  ${c.ap} ${c.tipo.padEnd(5)} ${c.freq}  ${c.nome}`);
})();
