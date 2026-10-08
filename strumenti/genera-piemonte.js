/* =====================================================================
   GENERATORE DELLA MAPPA REALE DEL PIEMONTE
   Uso (dalla cartella del progetto):   node strumenti/genera-piemonte.js
   Scarica (e tiene in strumenti/cache/):
     - quote del terreno: "terrain tiles" di Mapzen su AWS (SRTM e altri), formato Terrarium
     - strade, ferrovie e fiumi: estratto OpenStreetMap del Nord-Ovest da Geofabrik (© OpenStreetMap contributors, ODbL)
     - aeroporti e piste: OurAirports (pubblico dominio)
     - contorni dei laghi e posizione delle città: OpenStreetMap via Nominatim (© OpenStreetMap contributors, ODbL)
   Produce:
     - dati/piemonte-rilievo.js   (window.RILIEVO: griglia di quote)
     - dati/piemonte-vie.js       (window.VIE: autostrade, strade, ferrovie, fiumi)
     - dati/piemonte.js           (window.MAPPA: aeroporti, laghi, città, meteo, partenza)
   Non servono librerie esterne: basta Node.js 18 o più recente.
   ===================================================================== */
'use strict';
const fs=require('fs'), path=require('path'), zlib=require('zlib');

/* ---------- zona e griglia (modificabili) ---------- */
const ZONA={sud:43.95, nord:46.55, ovest:6.55, est:9.35};   // gradi
const PASSO=250;                                            // metri fra due quote
const ZOOM=10;                                              // dettaglio delle tile (10 = ~110 m)
const LAT0=(ZONA.sud+ZONA.nord)/2, LON0=(ZONA.ovest+ZONA.est)/2;  // origine (0,0) della mappa

const RADICE=path.join(__dirname,'..');
const CACHE=path.join(__dirname,'cache');
fs.mkdirSync(CACHE,{recursive:true});
const UA={'User-Agent':'FlightSimulatorScuola/1.0 (progetto scolastico)'};

/* ---------- proiezione: gradi -> metri (x est, y nord) ---------- */
const KLON=111320*Math.cos(LAT0*Math.PI/180), KLAT=110574;
const proietta=(lat,lon)=>({x:(lon-LON0)*KLON, y:(lat-LAT0)*KLAT});
const inversa=(x,y)=>({lat:LAT0+y/KLAT, lon:LON0+x/KLON});
const dorme=ms=>new Promise(r=>setTimeout(r,ms));

async function scarica(url,file,opz={}){
  const dest=path.join(CACHE,file);
  if(fs.existsSync(dest)&&fs.statSync(dest).size>0) return fs.readFileSync(dest);
  for(let t=0;t<4;t++){
    try{
      const r=await fetch(url,{headers:UA});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const b=Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(dest,b);
      if(opz.pausa) await dorme(opz.pausa);
      return b;
    }catch(e){console.warn('  riprovo',url,e.message);await dorme(2000*(t+1));}
  }
  throw new Error('Impossibile scaricare '+url);
}

/* ---------- PNG minimale (8 bit RGB/RGBA) ---------- */
function leggiPNG(buf){
  let p=8,w,h,tipo,idat=[];
  while(p<buf.length){
    const len=buf.readUInt32BE(p),t=buf.toString('ascii',p+4,p+8);
    if(t==='IHDR'){w=buf.readUInt32BE(p+8);h=buf.readUInt32BE(p+12);tipo=buf[p+17];}
    if(t==='IDAT')idat.push(buf.slice(p+8,p+8+len));
    p+=12+len;
  }
  const bpp=tipo===6?4:3, raw=zlib.inflateSync(Buffer.concat(idat)), stride=w*bpp+1, out=Buffer.alloc(w*h*bpp);
  for(let y=0;y<h;y++){
    const f=raw[y*stride];
    for(let x=0;x<w*bpp;x++){
      const a=x>=bpp?out[y*w*bpp+x-bpp]:0, b=y?out[(y-1)*w*bpp+x]:0, c=(x>=bpp&&y)?out[(y-1)*w*bpp+x-bpp]:0;
      let v=raw[y*stride+1+x];
      if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;
      else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
      out[y*w*bpp+x]=v&255;
    }
  }
  return {w,h,bpp,dati:out};
}

/* ---------- CSV ---------- */
function leggiCSV(testo){
  const righe=[];let campo='',riga=[],q=false;
  for(let i=0;i<testo.length;i++){
    const ch=testo[i];
    if(q){if(ch==='"'){if(testo[i+1]==='"'){campo+='"';i++;}else q=false;}else campo+=ch;}
    else if(ch==='"')q=true;
    else if(ch===','){riga.push(campo);campo='';}
    else if(ch==='\n'){riga.push(campo);righe.push(riga);riga=[];campo='';}
    else if(ch!=='\r')campo+=ch;
  }
  if(campo||riga.length){riga.push(campo);righe.push(riga);}
  const testa=righe.shift();
  return righe.filter(r=>r.length===testa.length).map(r=>Object.fromEntries(testa.map((k,i)=>[k,r[i]])));
}

/* =====================================================================
   1. RILIEVO
   ===================================================================== */
async function rilievo(){
  const n=1<<ZOOM;
  const tx=lon=>(lon+180)/360*n;
  const ty=lat=>{const r=lat*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;};
  const x0=Math.floor(tx(ZONA.ovest)),x1=Math.floor(tx(ZONA.est)),y0=Math.floor(ty(ZONA.nord)),y1=Math.floor(ty(ZONA.sud));
  console.log(`Rilievo: ${(x1-x0+1)*(y1-y0+1)} tile (zoom ${ZOOM})`);
  const tile={};
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const b=await scarica(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`,`t${ZOOM}_${x}_${y}.png`);
    tile[x+'_'+y]=leggiPNG(b);
  }
  const quotaPixel=(px,py)=>{ // px,py in pixel globali
    const X=Math.floor(px/256),Y=Math.floor(py/256),t=tile[X+'_'+Y];
    if(!t) return 0;
    const ix=Math.min(255,Math.max(0,Math.floor(px-X*256))),iy=Math.min(255,Math.max(0,Math.floor(py-Y*256)));
    const o=(iy*256+ix)*t.bpp, d=t.dati;
    return d[o]*256+d[o+1]+d[o+2]/256-32768;
  };
  const quota=(lat,lon)=>{ // bilineare
    const px=tx(lon)*256-0.5,py=ty(lat)*256-0.5,fx=px-Math.floor(px),fy=py-Math.floor(py),bx=Math.floor(px),by=Math.floor(py);
    const a=quotaPixel(bx,by),b=quotaPixel(bx+1,by),c=quotaPixel(bx,by+1),d=quotaPixel(bx+1,by+1);
    return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
  };
  const sw=proietta(ZONA.sud,ZONA.ovest),ne=proietta(ZONA.nord,ZONA.est);
  const xMin=Math.ceil(Math.max(sw.x,proietta(ZONA.nord,ZONA.ovest).x)/PASSO)*PASSO;
  const xMax=Math.floor(Math.min(ne.x,proietta(ZONA.sud,ZONA.est).x)/PASSO)*PASSO;
  const yMin=Math.ceil(sw.y/PASSO)*PASSO, yMax=Math.floor(ne.y/PASSO)*PASSO;
  const W=(xMax-xMin)/PASSO+1, H=(yMax-yMin)/PASSO+1;
  console.log(`Griglia ${W} x ${H} (${(W*PASSO/1000).toFixed(0)} x ${(H*PASSO/1000).toFixed(0)} km)`);
  const q=new Int16Array(W*H);
  for(let j=0;j<H;j++){
    const y=yMax-j*PASSO; // riga 0 = nord
    for(let i=0;i<W;i++){
      const x=xMin+i*PASSO,{lat,lon}=inversa(x,y);
      // media di 4 punti attorno (attenua il rumore delle tile)
      const s=PASSO/4,g1=inversa(x-s,y-s),g2=inversa(x+s,y-s),g3=inversa(x-s,y+s),g4=inversa(x+s,y+s);
      const h=(quota(g1.lat,g1.lon)+quota(g2.lat,g2.lon)+quota(g3.lat,g3.lon)+quota(g4.lat,g4.lon))/4;
      q[j*W+i]=Math.max(-300,Math.min(32000,Math.round(h)));
    }
  }
  const b64=Buffer.from(q.buffer).toString('base64');
  const testo=`/* Quote del terreno (metri) generate da strumenti/genera-piemonte.js.
   Fonte: Mapzen Terrain Tiles su AWS (SRTM, GMTED, ETOPO1 e altri). Non modificare a mano. */
window.RILIEVO={xMin:${xMin},yNord:${yMax},passo:${PASSO},larghezza:${W},altezza:${H},
  lat0:${LAT0},lon0:${LON0},
  dati:"${b64}"};
`;
  fs.writeFileSync(path.join(RADICE,'dati','piemonte-rilievo.js'),testo);
  console.log(`Scritto dati/piemonte-rilievo.js (${(testo.length/1e6).toFixed(1)} MB)`);
  return {quota,xMin,xMax,yMin,yMax,W,H,q};
}

/* =====================================================================
   2. AEROPORTI (OurAirports)
   ===================================================================== */
// nomi in italiano per gli aeroporti più noti (OurAirports li ha spesso in inglese)
const NOMI={LIMF:"Torino-Caselle",LIMC:"Milano-Malpensa",LIML:"Milano-Linate",LIMJ:"Genova",LIMG:"Albenga",
  LIMN:"Cameri (militare)",LIMR:"Novi Ligure",LIMW:"Aosta",LIMZ:"Cuneo-Levaldigi",LILE:"Biella-Cerrione",LILN:"Varese-Venegono",
  LIVV:"Moncucco-Vische",LSZA:"Lugano-Agno",LSGS:"Sion"};
async function aeroporti(dentro){
  const ap=leggiCSV((await scarica('https://davidmegginson.github.io/ourairports-data/airports.csv','airports.csv')).toString('utf8'));
  const rw=leggiCSV((await scarica('https://davidmegginson.github.io/ourairports-data/runways.csv','runways.csv')).toString('utf8'));
  const piste={};
  for(const r of rw){(piste[r.airport_ident]=piste[r.airport_ident]||[]).push(r);}
  const out=[];
  for(const a of ap){
    if(!['large_airport','medium_airport','small_airport'].includes(a.type)) continue;
    if(!/^[A-Z]{4}$/.test(a.ident)) continue;          // solo sigle ICAO vere
    const lat=+a.latitude_deg,lon=+a.longitude_deg;
    if(!dentro(lat,lon)) continue;
    const pos=proietta(lat,lon);
    const lista=[];
    for(const r of (piste[a.ident]||[])){
      if(r.closed==='1') continue;
      const L=(+r.length_ft||0)*0.3048; if(L<250) continue;
      const Wd=Math.max(12,Math.min(60,(+r.width_ft||0)*0.3048||(L>1500?45:23)));
      let hdg=null,cx=pos.x,cy=pos.y;
      const lle=+r.le_latitude_deg,lle2=+r.le_longitude_deg,lhe=+r.he_latitude_deg,lhe2=+r.he_longitude_deg;
      if(lle&&lle2&&lhe&&lhe2){
        const p1=proietta(lle,lle2),p2=proietta(lhe,lhe2);
        hdg=(Math.atan2(p2.x-p1.x,p2.y-p1.y)*180/Math.PI+360)%360;
        cx=(p1.x+p2.x)/2;cy=(p1.y+p2.y)/2;
      }else if(r.le_heading_degT!==''&&!isNaN(+r.le_heading_degT)) hdg=+r.le_heading_degT;
      else{const m=/^(\d{1,2})/.exec(r.le_ident);if(m)hdg=(+m[1])*10;}
      if(hdg==null) continue;
      if(hdg>=180){hdg-=180;}                            // testata "bassa" per prima
      const erba=/grass|turf|gras|dirt|earth/i.test(r.surface);
      lista.push({direzione:Math.round(hdg*10)/10,lunghezza:Math.round(L),larghezza:Math.round(Wd),
        spostamentoEst:Math.round(cx-pos.x),spostamentoNord:Math.round(cy-pos.y),...(erba?{erba:true}:{})});
    }
    if(!lista.length) continue;
    lista.sort((p,q)=>q.lunghezza-p.lunghezza);          // la pista principale per prima
    out.push({codice:a.ident,nome:NOMI[a.ident]||a.name.replace(/ (Airport|Airfield|Aerodrome)$/i,''),
      x:Math.round(pos.x),y:Math.round(pos.y),quota:Math.round((+a.elevation_ft||0)*0.3048),
      tipo:a.type,piste:lista});
  }
  out.sort((p,q)=>p.codice.localeCompare(q.codice));
  console.log(`Aeroporti: ${out.length}`);
  return out;
}

/* =====================================================================
   3. LAGHI E CITTÀ (OpenStreetMap / Nominatim, 1 richiesta al secondo)
   ===================================================================== */
const LAGHI=["Lago Maggiore","Lago d'Orta","Lago di Viverone","Lago di Mergozzo","Lago Grande di Avigliana",
  "Lago di Candia","Lago di Lugano","Lago di Varese","Lago di Como","Lago di Monate","Lago di Comabbio","Lago Sirio",
  "Lago del Moncenisio","Lago di Ceresole"];
// [nome visualizzato, ricerca, abitanti circa]
const CITTA=[
  ['Torino','Torino, Piemonte',850000],['Milano','Milano, Lombardia',1370000],['Genova','Genova, Liguria',560000],
  ['Novara','Novara, Piemonte',102000],['Alessandria','Alessandria, Piemonte',91000],['Asti','Asti, Piemonte',74000],
  ['Cuneo','Cuneo, Piemonte',56000],['Moncalieri','Moncalieri',56000],['Vercelli','Vercelli, Piemonte',45000],
  ['Biella','Biella, Piemonte',43000],['Collegno','Collegno',49000],['Rivoli','Rivoli, Torino',47000],
  ['Nichelino','Nichelino',46000],['Settimo Torinese','Settimo Torinese',46000],['Grugliasco','Grugliasco',37000],
  ['Chieri','Chieri',36000],['Pinerolo','Pinerolo',35000],['Casale Monferrato','Casale Monferrato',33000],
  ['Verbania','Verbania',30000],['Alba','Alba, Cuneo',31000],['Bra','Bra, Cuneo',29000],['Carmagnola','Carmagnola',28000],
  ['Chivasso','Chivasso',27000],['Novi Ligure','Novi Ligure',27000],['Tortona','Tortona',25000],['Fossano','Fossano',24000],
  ['Ivrea','Ivrea',23000],['Mondovì','Mondovì',22000],['Savigliano','Savigliano',21000],['Borgomanero','Borgomanero',21000],
  ['Acqui Terme','Acqui Terme',19000],['Ciriè','Ciriè',18000],['Domodossola','Domodossola',18000],['Valenza','Valenza',18000],
  ['Saluzzo','Saluzzo',17000],['Omegna','Omegna',15000],['Arona','Arona',14000],['Avigliana','Avigliana',12000],
  ['Susa','Susa, Torino',6500],['Aosta','Aosta',33000],['Savona','Savona',59000],['Varese','Varese',80000],
  ['Busto Arsizio','Busto Arsizio',83000],['Gallarate','Gallarate',53000],['Lugano','Lugano, Svizzera',63000],
  ['Como','Como, Lombardia',83000],['Sestriere','Sestriere',900],['Bardonecchia','Bardonecchia',3200],
];
async function nominatim(q,file,poligono){
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it,ch,fr&q='+encodeURIComponent(q)+
    (poligono?'&polygon_geojson=1&polygon_threshold=0.0008':'');
  const b=await scarica(url,file,{pausa:1100});
  const j=JSON.parse(b.toString('utf8'));
  return j[0]||null;
}
async function laghi(ril){
  const out=[];
  for(const nome of LAGHI){
    const r=await nominatim(nome,'lago_'+nome.replace(/\W+/g,'_')+'.json',true);
    if(!r||!r.geojson||!/Polygon/.test(r.geojson.type)){console.warn('  lago non trovato:',nome);continue;}
    const poligoni=r.geojson.type==='Polygon'?[r.geojson.coordinates]:r.geojson.coordinates;
    // tiene il poligono più grande (con le sue isole)
    const area=ring=>{let s=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s/2);};
    poligoni.sort((a,b)=>area(b[0])-area(a[0]));
    const anelli=poligoni[0].map(ring=>ring.map(([lon,lat])=>{const p=proietta(lat,lon);return [Math.round(p.x),Math.round(p.y)];}));
    if(anelli[0].length<4) continue;
    // livello dell'acqua: mediana delle quote lungo l'interno del contorno
    const qs=[];for(const [x,y] of anelli[0]){const {lat,lon}=inversa(x,y);qs.push(ril.quota(lat,lon));}
    const cx=anelli[0].reduce((s,p)=>s+p[0],0)/anelli[0].length,cy=anelli[0].reduce((s,p)=>s+p[1],0)/anelli[0].length;
    const {lat,lon}=inversa(cx,cy);qs.push(ril.quota(lat,lon));
    qs.sort((a,b)=>a-b);
    out.push({nome,quota:Math.round(qs[Math.floor(qs.length*0.3)]),contorno:anelli[0],...(anelli.length>1?{isole:anelli.slice(1)}:{})});
    console.log(`  ${nome}: ${anelli[0].length} punti, quota ${out[out.length-1].quota} m`);
  }
  return out;
}
async function citta(dentro){
  const out=[];
  for(const [nome,q,ab] of CITTA){
    const r=await nominatim(q,'citta_'+q.replace(/\W+/g,'_')+'.json',false);
    if(!r){console.warn('  città non trovata:',nome);continue;}
    const lat=+r.lat,lon=+r.lon;
    if(!dentro(lat,lon)) continue;
    const p=proietta(lat,lon);
    out.push({nome,x:Math.round(p.x),y:Math.round(p.y),raggio:Math.round(Math.min(5500,250+9*Math.sqrt(ab))),edifici:Math.round(Math.min(2200,30+ab/350))});
  }
  console.log(`Città: ${out.length}`);
  return out;
}

/* =====================================================================
   4. VIE DI COMUNICAZIONE (estratto OpenStreetMap di Geofabrik): strade, ferrovie, fiumi
   ===================================================================== */
// Douglas-Peucker: toglie i punti che si discostano dalla linea meno di "tol" metri
function semplifica(p,tol){
  if(p.length<3) return p;
  const tieni=new Uint8Array(p.length);tieni[0]=tieni[p.length-1]=1;
  const pila=[[0,p.length-1]];
  while(pila.length){
    const [a,b]=pila.pop();let max=0,im=-1;
    const [ax,ay]=p[a],[bx,by]=p[b],dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy||1;
    for(let i=a+1;i<b;i++){
      const t=Math.max(0,Math.min(1,((p[i][0]-ax)*dx+(p[i][1]-ay)*dy)/l2));
      const ex=ax+t*dx-p[i][0],ey=ay+t*dy-p[i][1],d=ex*ex+ey*ey;
      if(d>max){max=d;im=i;}
    }
    if(im>=0&&max>tol*tol){tieni[im]=1;pila.push([a,im],[im,b]);}
  }
  return p.filter((_,i)=>tieni[i]);
}
// unisce i tratti che si toccano agli estremi (stessa sigla o nome)
function concatena(linee){
  const chiave=pt=>pt[0]+','+pt[1];
  const perEstremo=new Map();
  const aggiungi=(k,l)=>{if(!perEstremo.has(k))perEstremo.set(k,[]);perEstremo.get(k).push(l);};
  for(const l of linee){aggiungi(chiave(l.p[0]),l);aggiungi(chiave(l.p[l.p.length-1]),l);}
  const usate=new Set(),out=[];
  for(const l of linee){
    if(usate.has(l)) continue;
    usate.add(l);let p=l.p.slice();
    for(let lato=0;lato<2;lato++){
      for(;;){
        const k=chiave(p[p.length-1]);
        const c=(perEstremo.get(k)||[]).find(m=>!usate.has(m)&&m.ref===l.ref);
        if(!c) break;
        usate.add(c);
        const q=chiave(c.p[0])===k?c.p:c.p.slice().reverse();
        p=p.concat(q.slice(1));
      }
      p.reverse();
    }
    out.push({ref:l.ref,p});
  }
  return out;
}
// estratto OpenStreetMap del Nord-Ovest (Piemonte, Valle d'Aosta, Liguria, Lombardia) da Geofabrik
const PBF_URL='https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf';
const CAT_VIE={
  autostrade:{tol:25}, superstrade:{tol:25}, statali:{tol:30}, provinciali:{tol:35},
  ferrovie:{tol:30}, fiumi:{tol:30}, canali:{tol:30},
};
const GRANDI_CANALI=/^(Canale (Cavour|Villoresi|Regina Elena|Depretis)|Naviglio Grande)$/;
function categoria(t){
  if(t.highway==='motorway')return 'autostrade';
  if(t.highway==='trunk')return 'superstrade';
  if(t.highway==='primary')return 'statali';
  if(t.highway==='secondary')return 'provinciali';
  if(t.railway==='rail'&&!t.service&&!/industrial|military|tourism|test/.test(t.usage||''))return 'ferrovie';
  if(t.waterway==='river')return 'fiumi';
  if(t.waterway==='canal'&&GRANDI_CANALI.test(t.name||''))return 'canali';
  return null;
}
async function vie(){
  const estratte=path.join(CACHE,'vie_estratte.json');
  let way;
  if(fs.existsSync(estratte)) way=JSON.parse(fs.readFileSync(estratte,'utf8'));
  else{
    const pbf=path.join(CACHE,'nord-ovest.osm.pbf');
    if(!fs.existsSync(pbf)){
      console.log('  scarico '+PBF_URL+' (circa 600 MB, una volta sola)...');
      const r=await fetch(PBF_URL,{headers:UA});if(!r.ok)throw new Error('HTTP '+r.status);
      fs.writeFileSync(pbf,Buffer.from(await r.arrayBuffer()));
    }
    const {estraiWay}=require('./leggi-pbf.js');
    way=estraiWay(pbf,categoria).map(w=>({cat:w.cat,
      ref:(w.cat==='fiumi'||w.cat==='canali')?(w.tag.name||''):(w.tag.ref||'').split(';')[0].replace(/s+/g,''),
      punti:w.punti.map(([la,lo])=>[Math.round(la*1e6)/1e6,Math.round(lo*1e6)/1e6])}));
    fs.writeFileSync(estratte,JSON.stringify(way));
  }
  const dentro=([la,lo])=>la>=ZONA.sud&&la<=ZONA.nord&&lo>=ZONA.ovest&&lo<=ZONA.est;
  const out={};
  for(const [nome,c] of Object.entries(CAT_VIE)){
    const linee=way.filter(w=>w.cat===nome&&w.punti.some(dentro)&&(nome!=='canali'||GRANDI_CANALI.test(w.ref)))
      .map(w=>({ref:w.ref,p:w.punti.map(([la,lo])=>{const q=proietta(la,lo);return [Math.round(q.x),Math.round(q.y)];})}));
    const unite=concatena(linee).map(l=>({ref:l.ref,p:semplifica(l.p,c.tol)})).filter(l=>l.p.length>1);
    // codifica compatta: primo punto assoluto, poi differenze, in decine di metri
    out[nome]=unite.map(l=>{
      const v=[];let px=0,py=0;
      for(const [x,y] of l.p){const qx=Math.round(x/10),qy=Math.round(y/10);v.push(qx-px,qy-py);px=qx;py=qy;}
      return l.ref?{r:l.ref,p:v}:{p:v};
    });
    const punti=unite.reduce((n,l)=>n+l.p.length,0);
    console.log('  '+nome+': '+linee.length+' tratti -> '+unite.length+' linee, '+punti+' punti');
  }
  const testo='/* Vie di comunicazione (strade, ferrovie, fiumi) generate da strumenti/genera-piemonte.js.\n'+
    '   Fonte: © OpenStreetMap contributors (licenza ODbL). Non modificare a mano.\n'+
    '   Ogni linea: p = [x0, y0, dx1, dy1, ...] in decine di metri (x est, y nord); r = sigla o nome. */\n'+
    'window.VIE='+JSON.stringify(out)+';\n';
  fs.writeFileSync(path.join(RADICE,'dati','piemonte-vie.js'),testo);
  console.log('Scritto dati/piemonte-vie.js ('+(testo.length/1e6).toFixed(2)+' MB)');
}

/* =====================================================================
   SCRITTURA DELLA MAPPA
   ===================================================================== */
(async()=>{
  const ril=await rilievo();
  const dentro=(lat,lon)=>{const p=proietta(lat,lon);return p.x>ril.xMin+3000&&p.x<ril.xMax-3000&&p.y>ril.yMin+3000&&p.y<ril.yMax-3000;};
  const aer=await aeroporti(dentro);
  console.log('Laghi:');const lag=await laghi(ril);
  const cit=await citta(dentro);
  console.log("Vie di comunicazione:");await vie();
  const J=v=>JSON.stringify(v);
  const righeAer=aer.map(a=>`    { codice: ${J(a.codice)}, nome: ${J(a.nome)}, x: ${a.x}, y: ${a.y}, quota: ${a.quota},\n      piste: [ ${a.piste.map(p=>J(p).replace(/"(\w+)":/g,'$1: ')).join(',\n               ')} ] },`).join('\n');
  const righeCit=cit.map(c=>`    ${J(c).replace(/"(\w+)":/g,'$1: ')},`).join('\n');
  const righeLag=lag.map(l=>`    ${J(l).replace(/"(\w+)":/g,'$1: ')},`).join('\n');
  const dim=Math.max(ril.xMax-ril.xMin,ril.yMax-ril.yMin);
  const testo=`/* =====================================================================
   MAPPA REALE DEL PIEMONTE (e dintorni)
   Generata da strumenti/genera-piemonte.js: puoi modificarla a mano, ma se
   rilanci il generatore le modifiche vengono sovrascritte.
   Coordinate in metri dal punto (0,0) = lat ${LAT0}, lon ${LON0}; x verso est, y verso nord.
   Fonti: aeroporti e piste da OurAirports (pubblico dominio);
          laghi e città da OpenStreetMap (© OpenStreetMap contributors, licenza ODbL);
          rilievo da Mapzen Terrain Tiles (SRTM e altri), nel file piemonte-rilievo.js.
   ===================================================================== */

window.MAPPA = {
  nome: "Piemonte",
  reale: true,
  dimensione: ${dim},

  terreno: {
    rilievo: true,          // usa le quote vere di window.RILIEVO
    dettaglio: 1,           // rugosità aggiunta alle quote (0 = nessuna)
    colori: { prato: 700, bosco: 1800, roccia: 2250, neve: 2650 },  // quote dei colori (m)
  },

  meteo: { ventoDa: 360, ventoNodi: 5, raffiche: 2, nuvole: 25, baseNuvole: 2200, visibilita: 70 },

  partenza: { aeroporto: "LIMF", pista: "36" },
  destinazione: "LIMZ",
  alberiVicinoAeroporti: 700,

  aeroporti: [
${righeAer}
  ],

  citta: [
${righeCit}
  ],

  laghi: [
${righeLag}
  ],

  montagne: [],
  boschi: [],
};
`;
  fs.writeFileSync(path.join(RADICE,'dati','piemonte.js'),testo);
  console.log(`Scritto dati/piemonte.js (${(testo.length/1e3).toFixed(0)} kB)`);
})().catch(e=>{console.error(e);process.exit(1);});
