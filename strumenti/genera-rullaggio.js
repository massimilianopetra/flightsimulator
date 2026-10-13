/* =====================================================================
   GENERATORE DELLE VIE DI RULLAGGIO VERE (mondo "Piemonte")
   ---------------------------------------------------------------------
   Uso (dalla cartella del progetto):  node strumenti/genera-rullaggio.js
   Legge l'estratto OpenStreetMap già scaricato da genera-piemonte.js
   (strumenti/cache/nord-ovest.osm.pbf) e tiene, per ogni aeroporto di
   dati/piemonte.js, le vie di rullaggio (aeroway=taxiway/taxilane) e i
   piazzali (aeroway=apron). Scrive dati/piemonte-rullaggio.js.
   Dati © OpenStreetMap contributors (ODbL). L'estratto copre solo l'Italia
   del nord-ovest: gli aeroporti svizzeri e francesi restano senza dati e il
   gioco usa il rullaggio generico.
   ===================================================================== */
'use strict';
const fs=require('fs'), path=require('path');
const {estraiWay}=require('./leggi-pbf.js');

const ZONA={sud:43.95, nord:46.55, ovest:6.55, est:9.35};
const LAT0=(ZONA.sud+ZONA.nord)/2, LON0=(ZONA.ovest+ZONA.est)/2;
const KLON=111320*Math.cos(LAT0*Math.PI/180), KLAT=110574;
const proietta=(lat,lon)=>({x:(lon-LON0)*KLON, y:(lat-LAT0)*KLAT});
const RADICE=path.join(__dirname,'..'), CACHE=path.join(__dirname,'cache');
const PBF=path.join(CACHE,'nord-ovest.osm.pbf');
const RAGGIO=3500;   // m: vie e piazzali entro questa distanza dal centro dell'aeroporto

global.window=global;require(path.join(RADICE,'dati','piemonte.js'));
const aeroporti=window.MAPPA.aeroporti;

const salvate=path.join(CACHE,'rullaggio_estratto.json');
let way;
if(fs.existsSync(salvate)) way=JSON.parse(fs.readFileSync(salvate,'utf8'));
else{
  if(!fs.existsSync(PBF)){console.error('Manca '+PBF+': lancia prima node strumenti/genera-piemonte.js');process.exit(1);}
  const cat=t=>t.aeroway==='taxiway'||t.aeroway==='taxilane'?'via':t.aeroway==='apron'?'piazzale':null;
  way=estraiWay(PBF,cat).map(w=>({cat:w.cat,ref:(w.tag.ref||w.tag.name||'').split(';')[0].trim(),larghezza:parseFloat(w.tag.width)||0,
    tipo:w.tag.aeroway,punti:w.punti.map(([la,lo])=>[Math.round(la*1e6)/1e6,Math.round(lo*1e6)/1e6])}));
  fs.writeFileSync(salvate,JSON.stringify(way));
}
console.log('Vie e piazzali nell\'estratto:',way.length);

const out={};
for(const ap of aeroporti){
  const vie=[],piazzali=[];
  for(const w of way){
    const pts=w.punti.map(([la,lo])=>proietta(la,lo));
    if(!pts.some(p=>Math.hypot(p.x-ap.x,p.y-ap.y)<RAGGIO)) continue;
    // coordinate relative al centro dell'aeroporto, in decimetri (interi: file più piccolo)
    const rel=pts.flatMap(p=>[Math.round((p.x-ap.x)*10),Math.round((p.y-ap.y)*10)]);
    if(w.cat==='via')vie.push({ref:w.ref,l:w.larghezza||(w.tipo==='taxilane'?10:0),p:rel});
    else if(pts.length>=4)piazzali.push(rel);
  }
  if(vie.length)out[ap.codice]={vie,piazzali};
}
const testo=`/* Vie di rullaggio e piazzali veri, generati da strumenti/genera-rullaggio.js.
   Dati © OpenStreetMap contributors (ODbL). Per ogni aeroporto (sigla ICAO):
     vie: [{ref: nome della via (A, B…), l: larghezza in m (0 = non indicata), p: [x0, y0, x1, y1, …]}]
     piazzali: [[x0, y0, x1, y1, …]]   (contorni chiusi)
   Coordinate in decimetri dal centro dell'aeroporto (x verso est, y verso nord). Non modificare a mano. */
window.RULLAGGIO=${JSON.stringify(out)};
`;
fs.writeFileSync(path.join(RADICE,'dati','piemonte-rullaggio.js'),testo);
console.log(`Scritto dati/piemonte-rullaggio.js (${(testo.length/1024).toFixed(0)} kB)`);
for(const [c,a] of Object.entries(out)){
  const refs=[...new Set(a.vie.map(v=>v.ref).filter(Boolean))].sort();
  console.log(`  ${c}: ${a.vie.length} vie (${refs.join(' ')||'senza nomi'}), ${a.piazzali.length} piazzali`);
}
for(const ap of aeroporti)if(!out[ap.codice])console.log(`  ${ap.codice}: nessun dato (rullaggio generico)`);
