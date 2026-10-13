/* =====================================================================
   GENERATORE DEI RADIOAIUTI (VOR) per il mondo "Piemonte"
   ---------------------------------------------------------------------
   Uso (dalla cartella del progetto):  node strumenti/genera-radio.js
   Fonte: OurAirports, navaids.csv (pubblico dominio). Scrive dati/piemonte-radio.js.
   Gli ILS non sono in OurAirports: il simulatore li crea da solo sulle piste
   asfaltate abbastanza lunghe (vedi js/radio.js).
   ===================================================================== */
'use strict';
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
  const testo=`/* Radioaiuti (VOR) generati da strumenti/genera-radio.js.
   Fonte: OurAirports, navaids.csv (pubblico dominio). Frequenze in MHz, posizioni in metri
   (x verso est, y verso nord) dal punto lat ${LAT0}, lon ${LON0}. Non modificare a mano. */
window.RADIO={vor:[
${vor.map(v=>'  '+JSON.stringify(v)).join(',\n')}
]};
`;
  fs.writeFileSync(path.join(RADICE,'dati','piemonte-radio.js'),testo);
  console.log(`VOR: ${vor.length}`);
  for(const v of vor)console.log(`  ${v.id.padEnd(4)} ${v.freq.toFixed(2)}  ${v.nome}${v.dme?' (DME)':''}`);
})();
