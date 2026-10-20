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
   GENERATORE DEGLI AEROPORTI IN 3D (mondo "Piemonte")
   ---------------------------------------------------------------------
   Uso (dalla cartella del progetto):  node strumenti/genera-aeroporti.js
   Legge l'estratto OpenStreetMap già scaricato da genera-piemonte.js
   (strumenti/cache/nord-ovest.osm.pbf) attorno ai grandi aeroporti e tiene
   tutto quello che serve per disegnarli "come sono":
     - perimetro del sedime (la recinzione);
     - edifici con la sagoma vera (terminal, hangar, parcheggi multipiano,
       uffici, magazzini, tettoie), altezze e piani quando ci sono;
     - torre di controllo, radar, torri faro dei piazzali, serbatoi;
     - pontili d'imbarco, piazzole numerate, parcheggi auto, strade di servizio.
   Scrive dati/piemonte-aeroporti.js. La prima volta salva in
   strumenti/cache/aeroporti_estratto.json tutto ciò che sta nelle zone (una
   lettura del file da ~1 minuto); le volte dopo riparte da lì.
   Dati © OpenStreetMap contributors (ODbL).
   Le correzioni fatte a mano (stili delle facciate, altezze che mancano,
   forma delle torri) stanno qui sotto in PERSONALIZZA.
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
const {estraiZone}=require('./leggi-pbf.js');

const ZONA={sud:43.95, nord:46.55, ovest:6.55, est:9.35};
const LAT0=(ZONA.sud+ZONA.nord)/2, LON0=(ZONA.ovest+ZONA.est)/2;
const KLON=111320*Math.cos(LAT0*Math.PI/180), KLAT=110574;
const RADICE=path.join(__dirname,'..'), CACHE=path.join(__dirname,'cache');
const PBF=path.join(CACHE,'nord-ovest.osm.pbf');
const MARGINE=150;   // m fuori dal perimetro: anche lì edifici veri (parcheggi, alberghi, uffici) e niente case generate

/* aeroporti da disegnare e loro carattere (dalle foto su Wikimedia Commons, solo come riferimento):
   stile = facciata del terminal; torre = forma della torre di controllo (js/aeroporti-3d.js) */
const PERSONALIZZA={
  LIMF:{raggio:3500, stile:'caselle', torre:{forma:'cilindro',h:36},
        // terminal: vetrata verde-acqua alta circa 18 m; tettoia del viadotto partenze
        altezze:{'Terminal Torino Caselle':18,'Multipiano':15}},
  LIMC:{raggio:5000, stile:'malpensa', torre:{forma:'malpensa'},
        altezze:{'Terminal 1':22,'Terminal 2':16}},
  LIML:{raggio:3500, stile:'linate', torre:{forma:'quadrata',h:34},
        altezze:{'Milano-Linate':17}},
  LIMJ:{raggio:3500, stile:'genova', torre:{forma:'cilindro',h:32},
        altezze:{'Aeroporto Cristoforo Colombo':14}},
  LIMZ:{raggio:3000, stile:'cuneo', torre:{forma:'traliccio',h:13},
        altezze:{'Aeroporto Cuneo Levaldigi':9}},
};

global.window=global;require(path.join(RADICE,'dati','piemonte.js'));
const aeroporti=window.MAPPA.aeroporti;

/* ---------- lettura (o cache) ---------- */
const salvate=path.join(CACHE,'aeroporti_estratto.json');
let D;
if(fs.existsSync(salvate)) D=JSON.parse(fs.readFileSync(salvate,'utf8'));
else{
  if(!fs.existsSync(PBF)){console.error('Manca '+PBF+': lancia prima node strumenti/genera-piemonte.js');process.exit(1);}
  const zone=[];
  for(const [c,o] of Object.entries(PERSONALIZZA)){
    const a=aeroporti.find(a=>a.codice===c),lat=LAT0+a.y/KLAT,lon=LON0+a.x/KLON,r=o.raggio;
    zone.push({c,sud:lat-r/KLAT,nord:lat+r/KLAT,ovest:lon-r/KLON,est:lon+r/KLON});
  }
  D={zone,...estraiZone(PBF,zone)};
  fs.writeFileSync(salvate,JSON.stringify(D));
}
console.log(`Nell'estratto: ${D.nodi.length} nodi con tag, ${D.way.length} linee, ${D.rel.length} relazioni`);
const wayPerId=new Map(D.way.map(w=>[w.id,w]));

/* ---------- geometria ---------- */
const area=p=>{let s=0;for(let i=0,j=p.length-1;i<p.length;j=i++)s+=p[j][0]*p[i][1]-p[i][0]*p[j][1];return s/2;};
const centro=p=>{let a=0,cx=0,cy=0;for(let i=0,j=p.length-1;i<p.length;j=i++){const f=p[j][0]*p[i][1]-p[i][0]*p[j][1];a+=f;cx+=(p[j][0]+p[i][0])*f;cy+=(p[j][1]+p[i][1])*f;}
  if(Math.abs(a)<1e-6){let x=0,y=0;for(const q of p){x+=q[0];y+=q[1];}return [x/p.length,y/p.length];}return [cx/(3*a),cy/(3*a)];};
const dentro=(x,y,a)=>{let c=false;for(let i=0,j=a.length-1;i<a.length;j=i++){const [xi,yi]=a[i],[xj,yj]=a[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
const distSeg=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/l2));return Math.hypot(a[0]+t*dx-x,a[1]+t*dy-y);};
const distAnello=(x,y,a)=>{let d=Infinity;for(let i=0,j=a.length-1;i<a.length;j=i++)d=Math.min(d,distSeg(x,y,a[j],a[i]));return d;};
const chiuso=p=>p.length>3&&p[0][0]===p[p.length-1][0]&&p[0][1]===p[p.length-1][1];
// toglie i punti quasi allineati (meno di 0,4 m dalla retta) e il punto finale ripetuto
function semplifica(p,tol=0.4){
  let q=chiuso(p)?p.slice(0,-1):p.slice();
  for(let cambiato=true;cambiato&&q.length>3;){
    cambiato=false;
    for(let i=0;i<q.length&&q.length>3;i++){
      const a=q[(i+q.length-1)%q.length],b=q[i],c=q[(i+1)%q.length];
      if(distSeg(b[0],b[1],a,c)<tol||Math.hypot(b[0]-a[0],b[1]-a[1])<0.3){q.splice(i,1);cambiato=true;i--;}
    }
  }
  return q;
}
// unisce pezzi di linea (multipoligoni) in anelli chiusi
function anelli(pezzi){
  const liberi=pezzi.filter(p=>p.length>1).map(p=>p.slice()),out=[];
  const ug=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
  while(liberi.length){
    let r=liberi.shift();
    for(let k=0;k<500&&!ug(r[0],r[r.length-1]);k++){
      const i=liberi.findIndex(p=>ug(p[0],r[r.length-1])||ug(p[p.length-1],r[r.length-1]));
      if(i<0) break;
      const p=liberi.splice(i,1)[0];
      if(ug(p[0],r[r.length-1]))r=r.concat(p.slice(1));else r=r.concat(p.slice(0,-1).reverse());
    }
    if(r.length>3)out.push(r);
  }
  return out;
}
// rettangolo minimo orientato: {cx, cy, a (angolo dell'asse lungo, rad), L, W}
function rettangolo(p){
  let best=null;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],ang=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(ang),s=Math.sin(ang);
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(const q of p){const u=q[0]*c+q[1]*s,v=-q[0]*s+q[1]*c;u0=Math.min(u0,u);u1=Math.max(u1,u);v0=Math.min(v0,v);v1=Math.max(v1,v);}
    const ar=(u1-u0)*(v1-v0);
    if(!best||ar<best.ar){const uc=(u0+u1)/2,vc=(v0+v1)/2;best={ar,ang,L:u1-u0,W:v1-v0,cx:uc*c-vc*s,cy:uc*s+vc*c};}
  }
  if(best.W>best.L)best={...best,ang:best.ang+Math.PI/2,L:best.W,W:best.L};
  return best;
}

/* ---------- per ogni aeroporto ---------- */
const OUT={};
const dm=v=>Math.round(v*10);                       // decimetri
const piatto=p=>p.flatMap(([x,y])=>[dm(x),dm(y)]);
const num=v=>{const f=parseFloat(String(v||'').replace(',','.'));return isFinite(f)?f:null;};

for(const [cod,opz] of Object.entries(PERSONALIZZA)){
  const ap=aeroporti.find(a=>a.codice===cod);
  const P=([la,lo])=>[(lo-LON0)*KLON-ap.x,(la-LAT0)*KLAT-ap.y];   // metri dal centro dell'aeroporto, y nord
  const z=D.zone.find(z=>z.c===cod);
  const inZona=(la,lo)=>la>=z.sud&&la<=z.nord&&lo>=z.ovest&&lo<=z.est;

  // perimetro: way o relazione aeroway=aerodrome con l'icao giusto
  let per=[];
  const pw=D.way.find(w=>w.tag.aeroway==='aerodrome'&&w.tag.icao===cod);
  if(pw)per=[pw.punti.map(P)];
  else{const r=D.rel.find(r=>r.tag.aeroway==='aerodrome'&&r.tag.icao===cod);
    if(r)per=anelli(r.membri.filter(m=>m.tipo===1&&m.ruolo!=='inner'&&wayPerId.has(m.id)).map(m=>wayPerId.get(m.id).punti.map(P)));}
  per=per.map(a=>semplifica(a,1.5)).filter(a=>Math.abs(area(a))>20000);
  if(!per.length){console.log(cod+': perimetro non trovato');continue;}
  const nelSedime=(x,y,m=MARGINE)=>per.some(a=>dentro(x,y,a))||per.some(a=>distAnello(x,y,a)<m);
  const strettamente=(x,y)=>per.some(a=>dentro(x,y,a));

  /* --- edifici: way chiuse e multipoligoni con building o building:part --- */
  const forme=[];   // {tag, esterno, buchi, parte}
  for(const w of D.way){
    const t=w.tag;if(!(t.building||t['building:part'])||!w.punti.length||!inZona(...w.punti[0])) continue;
    if(w.punti.length<4||!chiuso(w.punti)) continue;
    forme.push({tag:t,esterno:w.punti.map(P),buchi:[],parte:!t.building});
  }
  for(const r of D.rel){
    const t=r.tag;if(!(t.building||t['building:part'])||t.type!=='multipolygon') continue;
    const ws=r.membri.filter(m=>m.tipo===1&&wayPerId.has(m.id));if(!ws.length) continue;
    if(!inZona(...wayPerId.get(ws[0].id).punti[0])) continue;
    const est=anelli(ws.filter(m=>m.ruolo!=='inner').map(m=>wayPerId.get(m.id).punti.map(P)));
    const inn=anelli(ws.filter(m=>m.ruolo==='inner').map(m=>wayPerId.get(m.id).punti.map(P)));
    for(const e of est)forme.push({tag:t,esterno:e,buchi:inn.filter(h=>{const c=centro(h);return dentro(c[0],c[1],e);}),parte:!t.building});
  }
  for(const f of forme){
    f.esterno=semplifica(f.esterno);f.buchi=f.buchi.map(h=>semplifica(h)).filter(h=>h.length>=3);
    f.area=Math.abs(area(f.esterno))-f.buchi.reduce((s,h)=>s+Math.abs(area(h)),0);
    f.c=centro(f.esterno);
  }
  let scelte=forme.filter(f=>f.esterno.length>=3&&f.area>6&&nelSedime(f.c[0],f.c[1]));
  // regola del 3D di OSM: se un edificio ha delle parti (building:part) si disegnano le parti e non l'edificio
  const parti=scelte.filter(f=>f.parte),interi=scelte.filter(f=>!f.parte);
  const usaParti=new Set();
  for(const b of interi){
    const mie=parti.filter(p=>dentro(p.c[0],p.c[1],b.esterno));
    const coperta=mie.reduce((s,p)=>s+p.area,0);
    if(mie.length&&coperta>=0.5*b.area){b.sostituito=true;for(const p of mie){usaParti.add(p);p.padre=b;}}
  }
  scelte=interi.filter(b=>!b.sostituito).concat([...usaParti]);

  const edifici=[];
  for(const f of scelte){
    const t=f.tag,tb=t.building||(f.padre&&f.padre.tag.building)||'yes',nome=t.name||(f.padre&&f.padre.tag.name)||'';
    const aero=t.aeroway||(f.padre&&f.padre.tag.aeroway)||'';
    if(['construction','ruins','no'].includes(tb)&&!aero) continue;
    let tipo;
    if(aero==='tower'||t['tower:type']==='aircraft_control') continue;          // le torri si fanno a parte
    if(t.man_made==='tower'&&t['tower:type']==='radar') continue;
    if(aero==='terminal'&&f.area>1500&&tb!=='office'&&tb!=='hangar'||/^terminal/i.test(nome)&&f.area>3000||tb==='terminal'||tb==='airport_terminal') tipo='terminal';
    else if(tb==='roof'||tb==='canopy'||t.amenity==='shelter'||tb==='carport') tipo='tettoia';
    else if(aero==='hangar'||tb==='hangar'||aero==='terminal'&&tb==='hangar') tipo='hangar';
    else if(tb==='parking'||t.amenity==='parking'||t.parking==='multi-storey') tipo='parcheggio';
    else if(tb==='warehouse'||/merci|cargo/i.test(nome)) tipo='merci';
    else if(['house','residential','apartments','detached','semidetached_house','terrace','farm','farm_auxiliary','church','chapel'].includes(tb)) tipo='casa';
    else if(['office','commercial','hotel','public','school','fire_station','government','retail','civic','dormitory','university','hospital','transportation'].includes(tb)||aero==='terminal') tipo='uffici';
    else if(['industrial','service','manufacture','storage_tank','garage','garages','cabin','shed','kiosk','transformer_tower'].includes(tb)) tipo='industriale';
    else tipo=f.area>2500?'industriale':f.area<120?'industriale':'uffici';

    // altezze: height, poi piani, poi valori tipici del tipo
    const liv=num(t['building:levels']),minLiv=num(t['building:min_level']);
    const hPiano=tipo==='terminal'?4.5:tipo==='parcheggio'?3:tipo==='hangar'?6:3.3;
    let h=num(t.height),m=num(t.min_height)||0;
    if(minLiv!=null&&!num(t.min_height))m=minLiv*hPiano;
    if(h==null&&liv!=null)h=liv*hPiano+(tipo==='casa'?2:0.8);   // building:levels conta anche i piani sotto building:min_level
    const fisso=opz.altezze&&opz.altezze[nome];
    if(fisso&&!f.parte)h=fisso;
    if(h==null){
      const lato=Math.sqrt(f.area);
      h=tipo==='terminal'?(f.area>50000?22:16):tipo==='hangar'?Math.min(28,Math.max(9,6+lato*0.2)):tipo==='merci'?Math.min(14,8+lato*0.04):
        tipo==='parcheggio'?12:tipo==='casa'?7.5:tipo==='tettoia'?5:tipo==='industriale'?(f.area<120?3.5:Math.min(12,5+lato*0.05)):9;
    }
    if(tipo==='tettoia'){const lv=num(t.level);if(lv!=null&&lv>0)h=Math.max(h,(lv+1)*4);m=Math.max(m,h-1);}
    if(h<=m+0.5)h=m+3;
    // tetto
    let tetto=t['roof:shape']||'';
    if(!tetto)tetto=tipo==='casa'?'falde':tipo==='hangar'?(f.area>900?(Math.abs(Math.round(f.c[0]*7+f.c[1]*3))%3===0?'volta':'falde'):'falde'):'piano';
    if(tetto==='gabled'||tetto==='hipped'||tetto==='pyramidal')tetto='falde';else if(tetto==='round'||tetto==='gambrel'||tetto==='dome')tetto='volta';else if(tetto!=='falde'&&tetto!=='volta')tetto='piano';
    // le forme non quasi rettangolari hanno il tetto piano
    const R=rettangolo(f.esterno);
    if(tetto!=='piano'&&(f.area<0.85*R.L*R.W||f.buchi.length))tetto='piano';
    const e={t:tipo,h:+h.toFixed(1),p:piatto(f.esterno)};
    if(m>0)e.m=+m.toFixed(1);
    if(f.buchi.length)e.b=f.buchi.map(piatto);
    if(tetto!=='piano')e.r=tetto;
    if(nome&&(tipo==='terminal'||tipo==='hangar'&&f.area>3000||tipo==='parcheggio'))e.n=nome;
    const col=t['building:colour']||t['colour'];if(col&&/^#[0-9a-f]{6}$/i.test(col))e.c=col;
    edifici.push(e);
  }

  /* --- torre di controllo --- */
  let torre=null;
  {
    // se ce n'è più d'una si preferisce quella con l'altezza
    const tw=D.way.filter(w=>w.tag.aeroway==='tower'&&w.punti.length>2&&inZona(...w.punti[0])&&nelSedime(...centro(w.punti.map(P)),300))
      .sort((a,b)=>(num(b.tag.height)||0)-(num(a.tag.height)||0))[0];
    const tn=D.nodi.find(n=>(n.tag.aeroway==='tower'||n.tag['tower:type']==='aircraft_control')&&inZona(n.lat,n.lon)&&nelSedime(...P([n.lat,n.lon]),300));
    let x,y,lato=0,h=null;
    if(tw){const p=tw.punti.map(P);[x,y]=centro(p);lato=Math.sqrt(Math.abs(area(p)));h=num(tw.tag.height);}
    else if(tn){[x,y]=P([tn.lat,tn.lon]);h=num(tn.tag.height);}
    if(x!=null){
      const o=opz.torre||{};
      torre={x:dm(x),y:dm(y),h:o.h||h||(lato>12?60:30),forma:o.forma||'cilindro'};
      if(o.forma==='malpensa')torre.h=h||80;
    }
  }
  /* --- radar --- */
  const radar=[];
  for(const n of D.nodi){
    if(n.tag['tower:type']!=='radar'||!inZona(n.lat,n.lon)) continue;
    const [x,y]=P([n.lat,n.lon]);if(!nelSedime(x,y,300)) continue;
    radar.push({x:dm(x),y:dm(y),f:n.tag['tower:construction']==='dome'?'cupola':'antenna',h:num(n.tag.height)||(n.tag.name==='SMR'?28:20)});
  }
  for(const w of D.way){
    if(w.tag['tower:type']!=='radar'||!w.punti.length||!inZona(...w.punti[0])) continue;
    const [x,y]=centro(w.punti.map(P));if(!nelSedime(x,y,300)) continue;
    radar.push({x:dm(x),y:dm(y),f:'antenna',h:num(w.tag.height)||22});
  }
  /* --- torri faro dei piazzali --- */
  const fari=[];
  for(const n of D.nodi){
    const t=n.tag;if(t.man_made!=='mast'||!inZona(n.lat,n.lon)) continue;
    if(t['tower:type']&&t['tower:type']!=='lighting') continue;
    const [x,y]=P([n.lat,n.lon]);if(!strettamente(x,y)) continue;
    fari.push(dm(x),dm(y));
  }
  /* --- serbatoi --- */
  const serbatoi=[];
  for(const w of D.way){
    if(w.tag.man_made!=='storage_tank'||w.punti.length<4||!inZona(...w.punti[0])) continue;
    const p=w.punti.map(P),[x,y]=centro(p);if(!nelSedime(x,y)) continue;
    const r=Math.sqrt(Math.abs(area(p))/Math.PI);
    serbatoi.push({x:dm(x),y:dm(y),r:+r.toFixed(1),h:+(num(w.tag.height)||Math.min(16,Math.max(4,r*1.1))).toFixed(1)});
  }
  for(const n of D.nodi){
    if(n.tag.man_made!=='storage_tank'||!inZona(n.lat,n.lon)) continue;
    const [x,y]=P([n.lat,n.lon]);if(!strettamente(x,y)) continue;
    if(serbatoi.some(s=>Math.hypot(s.x/10-x,s.y/10-y)<8)) continue;
    serbatoi.push({x:dm(x),y:dm(y),r:5,h:num(n.tag.height)||8});
  }
  /* --- pontili d'imbarco --- */
  const pontili=[];
  for(const w of D.way){
    if(w.tag.aeroway!=='jet_bridge'||w.punti.length<2||!inZona(...w.punti[0])) continue;
    const p=w.punti.map(P);if(!strettamente(...p[0])) continue;
    pontili.push(piatto(p));
  }
  /* --- piazzole: linea di ingresso (o area) con il numero; il muso va verso la fine della linea --- */
  const piazzole=[];
  const vicinoEdificio=(x,y)=>{let d=Infinity;for(const e of edifici){if(e.t==='tettoia'&&!e.n) continue;
    for(let i=0;i<e.p.length;i+=2){const j=(i+2)%e.p.length;d=Math.min(d,distSeg(x,y,[e.p[i]/10,e.p[i+1]/10],[e.p[j]/10,e.p[j+1]/10]));}}return d;};
  for(const w of D.way){
    if(w.tag.aeroway!=='parking_position'||w.punti.length<2||!inZona(...w.punti[0])) continue;
    let p=w.punti.map(P);if(!strettamente(...p[0])) continue;
    const ref=(w.tag.ref||w.tag.name||'').trim().slice(0,6);
    if(chiuso(w.punti)&&p.length>=4){
      const q=semplifica(p,0.3),R=rettangolo(q),[cx,cy]=centro(q);
      // muso verso l'edificio più vicino, lungo uno dei due assi del rettangolo
      let best=null;
      for(let k=0;k<4;k++){const a=R.ang+k*Math.PI/2,d=Math.max(R.L,R.W)*0.5,hx=cx+Math.cos(a)*d,hy=cy+Math.sin(a)*d,dd=vicinoEdificio(hx,hy);if(!best||dd<best.d)best={a,d:dd};}
      piazzole.push({r:ref,a:piatto(q),x:dm(cx),y:dm(cy),d:+(90-best.a*180/Math.PI+360).toFixed(1)%360,s:+Math.min(R.L,R.W).toFixed(1)});
    }else{
      if(vicinoEdificio(...p[0])<vicinoEdificio(...p[p.length-1]))p=p.reverse();
      const a=p[p.length-2],b=p[p.length-1];
      piazzole.push({r:ref,l:piatto(p),x:dm(b[0]),y:dm(b[1]),d:+((Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI+360)%360).toFixed(1)});
    }
  }
  // grandezza delle piazzole a linea: dalla distanza dalle vicine (aperture alari che ci stanno)
  for(const s of piazzole){
    if(s.s) continue;
    let d=Infinity;for(const o of piazzole)if(o!==s)d=Math.min(d,Math.hypot(o.x-s.x,o.y-s.y)/10);
    s.s=+Math.max(10,Math.min(65,d*0.95)).toFixed(1);
  }
  /* --- parcheggi auto all'aperto e strade di servizio --- */
  const parcheggi=[];
  for(const w of D.way){
    const t=w.tag;if(t.amenity!=='parking'||t.building||!chiuso(w.punti)||!inZona(...w.punti[0])) continue;
    if(t.parking&&!['surface','lane'].includes(t.parking)) continue;
    const p=semplifica(w.punti.map(P),0.5),c=centro(p);if(p.length<3||!nelSedime(c[0],c[1])||Math.abs(area(p))<150) continue;
    parcheggi.push(piatto(p));
  }
  const strade=[];
  for(const w of D.way){
    const t=w.tag;if(t.highway!=='service'||w.punti.length<2||!inZona(...w.punti[0])) continue;
    if(t.area==='yes'||t.tunnel||t.layer&&+t.layer<0) continue;
    const p=w.punti.map(P);if(!p.some(q=>nelSedime(q[0],q[1],60))) continue;
    strade.push({w:t.service==='parking_aisle'?5:t.service==='driveway'?4:7,p:piatto(p)});
  }
  /* --- piazzali (per le torri faro generate dove OSM non le ha) --- */
  if(fari.length<4){
    const piazzali=D.way.filter(w=>w.tag.aeroway==='apron'&&w.punti.length>3&&inZona(...w.punti[0])).map(w=>w.punti.map(P)).filter(p=>strettamente(...centro(p)));
    for(const a of piazzali){
      const q=semplifica(a,2);let resto=40;
      for(let i=0;i<q.length;i++){
        const A=q[i],B=q[(i+1)%q.length],L=Math.hypot(B[0]-A[0],B[1]-A[1]);
        for(let d=resto;d<L;d+=140){const x=A[0]+(B[0]-A[0])*d/L,y=A[1]+(B[1]-A[1])*d/L;
          if(vicinoEdificio(x,y)<45)fari.push(dm(x),dm(y));}
        resto=((resto-L)%140+140)%140;
      }
    }
  }
  OUT[cod]={stile:opz.stile,perimetro:per.map(piatto),edifici,torre,radar,fari,serbatoi,pontili,piazzole,parcheggi,strade};
  const c={};for(const e of edifici)c[e.t]=(c[e.t]||0)+1;
  console.log(`${cod}: ${edifici.length} edifici ${JSON.stringify(c)}, torre ${torre?torre.forma+' '+torre.h+' m':'no'}, ${radar.length} radar, `+
    `${fari.length/2} torri faro, ${serbatoi.length} serbatoi, ${pontili.length} pontili, ${piazzole.length} piazzole, ${parcheggi.length} parcheggi, ${strade.length} strade`);
}

const testo=`/* ${LICENZA}Aeroporti in 3D (sagome vere degli edifici e attrezzature), generati da strumenti/genera-aeroporti.js.
   Dati © OpenStreetMap contributors (ODbL). Non modificare a mano: le correzioni vanno nello script (PERSONALIZZA).
   Coordinate in decimetri dal centro dell'aeroporto (x verso est, y verso nord); liste piatte [x0, y0, x1, y1, …].
     perimetro: anelli del sedime        edifici: {t tipo, h altezza m, m base m, p contorno, b buchi, r tetto, n nome, c colore}
     torre: {x, y, h, forma}             radar: {x, y, f forma, h}       fari: torri faro [x, y, …]
     serbatoi: {x, y, r, h}              pontili: linee terminal → aereo  piazzole: {r numero, l linea | a area, x, y muso, d rotta, s grandezza m}
     parcheggi: contorni                 strade: {w larghezza m, p linea} */
window.AEROPORTI3D=${JSON.stringify(OUT)};
`;
fs.writeFileSync(path.join(RADICE,'dati','piemonte-aeroporti.js'),testo);
console.log(`Scritto dati/piemonte-aeroporti.js (${(testo.length/1024).toFixed(0)} kB)`);
