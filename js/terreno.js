/* =====================================================================
   TERRENO
   Calcola l'altezza del suolo in ogni punto partendo da dati/mappa.js:
   colline procedurali + montagne + laghi + spianate degli aeroporti.
   Coordinate interne (three.js): x = est, z = sud (quindi nord = -z), y = su.
   ---------------------------------------------------------------------
   Volo — simulatore di volo nel browser
   Autore: Massimiliano Petra <massimiliano.petra@gmail.com>
   Copyright (C) 2026 Massimiliano Petra
   Licenza: GNU General Public License versione 3 o successiva
   (GPL-3.0-or-later). Questo programma è software libero: puoi
   ridistribuirlo e/o modificarlo secondo i termini della GNU GPL
   pubblicata dalla Free Software Foundation, versione 3 o (a tua scelta)
   qualunque versione successiva. È distribuito SENZA ALCUNA GARANZIA.
   Testo completo nel file LICENSE.
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const M = window.MAPPA || {};
const D2R = Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};

const TR = Object.assign({seme:1, scala:1100, altezza:1500, livelloMare:0.36}, M.terreno||{});
const SEED = TR.seme|0;

/* ---------- rumore deterministico ---------- */
function hash(x,z){
  let h=(Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(SEED,982451653))|0;
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function vnoise(x,z){
  const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  const a=hash(xi,zi),b=hash(xi+1,zi),c=hash(xi,zi+1),d=hash(xi+1,zi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function rng(seed){ // mulberry32
  let s=seed>>>0;
  return function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}

/* ---------- dati della mappa convertiti in coordinate interne ---------- */
const montagne=(M.montagne||[]).map(m=>({nome:m.nome||'',x:m.x,z:-m.y,r:m.raggio,h:m.altezza}));
// laghi: rotondi (x, y, raggio) oppure con il contorno vero (contorno: [[x,y],...], isole facoltative)
const laghi=(M.laghi||[]).map(l=>{
  const lg={nome:l.nome||'',q:l.quota,auto:l.quota==null||l.quota==='auto'};
  if(l.contorno){
    lg.anelli=[l.contorno,...(l.isole||[])].map(a=>a.map(([x,y])=>[x,-y]));
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    for(const [x,z] of lg.anelli[0]){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
    Object.assign(lg,{x:(x0+x1)/2,z:(z0+z1)/2,box:[x0,x1,z0,z1],r:Math.max(x1-x0,z1-z0)/2});
  }else Object.assign(lg,{x:l.x,z:-l.y,r:l.raggio});
  return lg;
});
function inAnello(a,x,z){
  let dentro=false;
  for(let i=0,j=a.length-1;i<a.length;j=i++){
    const [xi,zi]=a[i],[xj,zj]=a[j];
    if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)dentro=!dentro;
  }
  return dentro;
}
// lago che contiene il punto (o null)
function inLago(x,z,margine=0){
  for(const l of laghi){
    if(l.anelli){
      const b=l.box;
      if(x<b[0]-margine||x>b[1]+margine||z<b[2]-margine||z>b[3]+margine) continue;
      if(inAnello(l.anelli[0],x,z)&&!l.anelli.slice(1).some(a=>inAnello(a,x,z))) return l;
    }else{const dx=x-l.x,dz=z-l.z;if(dx*dx+dz*dz<l.r*l.r)return l;}
  }
  return null;
}

/* ---------- quote reali (window.RILIEVO, generato da strumenti/genera-piemonte.js) ---------- */
const RL=TR.rilievo&&window.RILIEVO?window.RILIEVO:null;
let QR=null;
if(RL){
  const bin=atob(RL.dati),u8=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
  QR=new Int16Array(u8.buffer);
}
function quotaReale(x,z){
  const gx=clamp((x-RL.xMin)/RL.passo,0,RL.larghezza-1.001), gy=clamp((RL.yNord+z)/RL.passo,0,RL.altezza-1.001);
  const i=Math.floor(gx),j=Math.floor(gy),fx=gx-i,fy=gy-j,W=RL.larghezza,o=j*W+i;
  return (QR[o]*(1-fx)+QR[o+1]*fx)*(1-fy)+(QR[o+W]*(1-fx)+QR[o+W+1]*fx)*fy;
}
const citta=(M.citta||[]).map(c=>({nome:c.nome||'',x:c.x,z:-c.y,r:c.raggio||400,n:c.edifici||50}));
const boschi=(M.boschi||[]).map(b=>({x:b.x,z:-b.y,r:b.raggio||500,n:b.alberi||200}));

function base(x,z){
  if(RL){
    // quote vere + un po' di rugosità (più marcata in montagna)
    const h=quotaReale(x,z);
    if(h<=0) return h;
    const amp=(TR.dettaglio==null?1:TR.dettaglio)*(3+32*clamp((h-500)/2000,0,1));
    return h+(vnoise(x/190+7.1,z/190-3.3)-0.5)*amp+(vnoise(x/70-1.7,z/70+5.2)-0.5)*amp*0.45;
  }
  // colline (dettaglio)
  let f=1/TR.scala,amp=1,s=0,n=0;
  for(let i=0;i<5;i++){s+=vnoise(x*f+31.7,z*f-12.3)*amp;n+=amp;amp*=0.5;f*=2.03;}
  s/=n;
  // "continenti": decide dove c'è mare, con coste ampie e regolari
  const c=vnoise(x/9000+11.3,z/9000-4.7)*0.7+vnoise(x/4000+2.1,z/4000+9.9)*0.3+(s-0.5)*0.18;
  const L=TR.livelloMare;
  if(c<L) return (c-L)*600-2;
  const coste=smooth(L,L+0.12,c);
  return (c-L)*220+Math.pow(Math.max(0,s-0.35),1.5)*TR.altezza*1.6*coste-2;
}
// altezza "naturale": colline + montagne + laghi (senza aeroporti)
let usaLaghi=true;
function naturale(x,z){
  let h=base(x,z);
  for(const m of montagne){
    const dx=x-m.x,dz=z-m.z,d2=dx*dx+dz*dz;
    if(d2<m.r*m.r){
      const b=0.5+0.5*Math.cos(Math.PI*Math.sqrt(d2)/m.r);
      h+=m.h*b*b*(0.75+0.5*vnoise(x/260+5.1,z/260-7.3));
    }
  }
  if(usaLaghi) for(const l of laghi){
    if(l.anelli){if(inLago(x,z)===l)h=Math.min(h,l.q-2.5);continue;}
    const d=Math.hypot(x-l.x,z-l.z);
    if(d<l.r) h=l.q-1.5-12*(1-d/l.r);
    else if(d<l.r*1.6) h=lerp(Math.max(h,l.q+1.2),h,smooth(l.r,l.r*1.6,d));
  }
  return h;
}
// livello dei laghi "auto": un po' sotto il terreno medio attorno al centro
usaLaghi=false;
for(const l of laghi){
  if(!l.auto||l.anelli) continue;
  let s=0;for(let i=0;i<8;i++){const a=i*Math.PI/4;s+=naturale(l.x+Math.cos(a)*l.r,l.z+Math.sin(a)*l.r);}
  l.q=Math.max(1,Math.round(s/8-4));
}
usaLaghi=true;

function numeroPista(h){let n=Math.round((((h%360)+360)%360)/10);if(n===0)n=36;return String(n).padStart(2,'0');}

const BLEND=500; // metri di raccordo tra spianata dell'aeroporto e colline
const aeroporti=[], piste=[];
for(const a of (M.aeroporti||[])){
  const ap={codice:a.codice||'????',nome:a.nome||'',x:a.x,z:-a.y,piste:[]};
  ap.quota = (a.quota==null||a.quota==='auto') ? Math.max(5,Math.round(naturale(ap.x,ap.z))) : a.quota;
  for(const p of (a.piste||[])){
    const hdg=p.direzione||0;
    const dir={x:Math.sin(hdg*D2R),z:-Math.cos(hdg*D2R)};
    const L=p.lunghezza||1000,W=p.larghezza||30;
    const pi={ap,hdg,dir,L,W,quota:ap.quota,
      cx:ap.x+(p.spostamentoEst||0), cz:ap.z-(p.spostamentoNord||0),
      nomi:[numeroPista(hdg),numeroPista(hdg+180)],
      fhl:L/2+150, fhw:W/2+210, erba:!!p.erba};
    pi.raggio=Math.hypot(pi.fhl,pi.fhw)+500;
    // le due testate: da dove si parte/atterra e in che direzione
    pi.testate=[
      {nome:pi.nomi[0],hdg:hdg,           x:pi.cx-dir.x*L/2,z:pi.cz-dir.z*L/2,dir:{x:dir.x,z:dir.z},pista:pi},
      {nome:pi.nomi[1],hdg:(hdg+180)%360,x:pi.cx+dir.x*L/2,z:pi.cz+dir.z*L/2,dir:{x:-dir.x,z:-dir.z},pista:pi},
    ];
    ap.piste.push(pi);piste.push(pi);
  }
  // vie di rullaggio vere (dati/piemonte-rullaggio.js): la spianata della pista si allarga fino a comprendere vie e
  // piazzali, ma solo dove il terreno naturale è già quasi in piano (entro 15 m), per non tagliare le colline vicine
  const RU=window.RULLAGGIO&&window.RULLAGGIO[ap.codice];
  if(RU){
    ap.rullaggioVero=true;
    const punti=[];
    for(const v of RU.vie)for(let i=0;i<v.p.length;i+=2)punti.push([ap.x+v.p[i]/10,ap.z-v.p[i+1]/10]);
    for(const a of RU.piazzali)for(let i=0;i<a.length;i+=2)punti.push([ap.x+a[i]/10,ap.z-a[i+1]/10]);
    for(const pi of ap.piste){
      for(const [x,z] of punti){
        if(Math.abs(naturale(x,z)-ap.quota)>15) continue;
        const dx=x-pi.cx,dz=z-pi.cz,u=Math.abs(dx*pi.dir.x+dz*pi.dir.z),v=Math.abs(-dx*pi.dir.z+dz*pi.dir.x);
        if(u>pi.L/2+700||v>pi.W/2+900) continue;
        if(v<pi.W/2+900&&u<pi.L/2+700){pi.fhl=Math.max(pi.fhl,u+40);pi.fhw=Math.max(pi.fhw,v+40);}
      }
      pi.raggio=Math.hypot(pi.fhl,pi.fhw)+500;
    }
  }
  aeroporti.push(ap);
}

// coordinate locali di una pista: u lungo la pista, v verso destra
function locale(p,x,z){
  const dx=x-p.cx,dz=z-p.cz;
  return {u:dx*p.dir.x+dz*p.dir.z, v:-dx*p.dir.z+dz*p.dir.x};
}

/* altezza analitica completa */
function terrainH(x,z){
  let h=naturale(x,z);
  for(const p of piste){
    const dx=x-p.cx,dz=z-p.cz;
    if(dx>p.raggio||dx<-p.raggio||dz>p.raggio||dz<-p.raggio) continue;
    const u=dx*p.dir.x+dz*p.dir.z, v=-dx*p.dir.z+dz*p.dir.x;
    const ou=Math.max(Math.abs(u)-p.fhl,0),ov=Math.max(Math.abs(v)-p.fhw,0);
    if(ou<BLEND&&ov<BLEND){
      const d=Math.hypot(ou,ov);
      if(d<BLEND) h=lerp(p.quota,h,smooth(0,BLEND,d));
    }
  }
  return h;
}

/* ---------- griglia della mesh (la fisica usa la stessa triangolazione) ---------- */
const TS=20000, SEG=320, STEP=TS/SEG;  // lato della griglia visibile (m), numero di celle
function meshH(x,z){
  const gx=Math.floor(x/STEP),gz=Math.floor(z/STEP),fx=x/STEP-gx,fz=z/STEP-gz;
  const x0=gx*STEP,z0=gz*STEP,x1=x0+STEP,z1=z0+STEP;
  const h00=terrainH(x0,z0),h11=terrainH(x1,z1);
  if(fz>fx){const h01=terrainH(x0,z1);return h00+(h11-h01)*fx+(h01-h00)*fz;}
  const h10=terrainH(x1,z0);return h00+(h10-h00)*fx+(h11-h10)*fz;
}

const api={
  seme:SEED, vnoise, hash, rng, terrainH, naturale, meshH, passoMesh:STEP, locale, inLago, reale:!!RL, rilievo:RL,
  aeroporti, piste, montagne, laghi, citta, boschi,
  tipo:'erba',
  /* quota della superficie su cui si appoggia l'aereo; imposta api.tipo
     ('acqua' | 'pista' | 'piazzale' | 'erba') */
  suolo(x,z){
    const h=meshH(x,z);
    if(h<0){api.tipo='acqua';return 0;}
    const l=inLago(x,z);
    if(l&&h<l.q+0.5){api.tipo='acqua';return l.q;}
    for(const p of piste){
      const dx=x-p.cx,dz=z-p.cz;
      if(dx>p.raggio||dx<-p.raggio||dz>p.raggio||dz<-p.raggio) continue;
      const {u,v}=locale(p,x,z);
      if(Math.abs(u)<=p.L/2&&Math.abs(v)<=p.W/2){api.tipo=p.erba?'erba':'pista';return h;}
      if(p===p.ap.piste[0]&&!p.ap.rullaggioVero&&Math.abs(u)<=90&&v>0&&v<145){api.tipo='piazzale';return h;}
    }
    if(SIM.reteRullaggio&&SIM.reteRullaggio.suSuperficie(x,z)){api.tipo='piazzale';return h;}   // vie e piazzali veri (js/rullaggio.js)
    api.tipo='erba';return h;
  },
  /* pista sotto (o vicino a) un punto: {pista, testata, u, v} oppure null */
  pistaVicina(x,z,margine=40){
    for(const p of piste){
      const {u,v}=locale(p,x,z);
      if(Math.abs(u)<=p.L/2+margine&&Math.abs(v)<=p.W/2+margine) return {pista:p,u,v};
    }
    return null;
  },
  // vero se il punto è dentro la zona spianata di un aeroporto (+ margine)
  inAeroporto(x,z,margine=0){
    for(const p of piste){
      const dx=x-p.cx,dz=z-p.cz;
      if(dx>p.raggio+margine||dx<-p.raggio-margine||dz>p.raggio+margine||dz<-p.raggio-margine) continue;
      const {u,v}=locale(p,x,z);
      if(Math.abs(u)<p.fhl+margine&&Math.abs(v)<p.fhw+margine) return true;
    }
    return false;
  },
};

/* ---------- colori del terreno per fasce di quota ----------
   terreno.colori nella mappa: { prato, bosco, roccia, neve } in metri */
const QC=Object.assign({prato:320,bosco:700,roccia:1000,neve:1150},TR.colori||{});
// k = quanto il punto è "campagna coltivata", w = quanto è bosco (0..1)
let C=null; const tc={r:0,g:0,b:0,k:0,w:0};
function colore(h,slope,x,z,dettaglio){
  if(!C){C={sand:new THREE.Color(0xd8c690),grass:new THREE.Color(0x5b8a3e),mown:new THREE.Color(0x6a9a48),
    meadow:new THREE.Color(0x5c7240),rock:new THREE.Color(0x857a66),snow:new THREE.Color(0xf2f5f8),c:new THREE.Color()};}
  const c=C.c, r=hash(x|0,z|0)-.5;
  let acquaVicina=h<4;
  if(!acquaVicina&&laghi.length){const l=inLago(x,z,25);if(l&&h<l.q+2)acquaVicina=true;}
  // fuori dai boschi: prati, poi pascoli, roccia e neve (i boschi li aggiunge lo shader con tc.w)
  if(acquaVicina)c.copy(C.sand);
  else if(dettaglio&&api.inAeroporto(x,z,-60))c.copy(C.mown);
  else if(h<QC.prato)c.copy(C.grass).lerp(C.meadow,clamp(h/QC.prato*0.6+r*.3,0,1));
  else if(h<QC.roccia)c.copy(C.meadow).lerp(C.rock,clamp((h-QC.bosco*0.9)/(QC.roccia-QC.bosco*0.9)+r*.2,0,1));
  else c.copy(C.rock).lerp(C.snow,clamp((h-QC.roccia)/(QC.neve-QC.roccia),0,1));
  if(slope>.55&&!acquaVicina)c.lerp(C.rock,clamp((slope-.55)*2.5,0,.85));
  tc.r=c.r;tc.g=c.g;tc.b=c.b;
  // campi: in basso e in piano, non sull'acqua né negli aeroporti
  tc.k=acquaVicina||(dettaglio&&api.inAeroporto(x,z,-60))?0:
    (1-smooth(QC.prato*0.75,QC.prato*1.05,h))*(1-smooth(0.05,0.13,slope));
  tc.w=acquaVicina?0:bosco(x,z,h,slope,tc.k);
}

/* ---------- boschi ----------
   Nessun dato: macchie di rumore, tante sui pendii e in collina, poche in pianura coltivata;
   limite degli alberi frastagliato attorno a QC.bosco; niente sulle pareti ripide, in paese,
   negli aeroporti e sotto i sentieri di avvicinamento (alberi alti 20 m in corto finale no).
   Lo stesso valore, interpolato sui triangoli, serve al colore (shader) e agli alberi 3D (boschi.js). */
function urbano(x,z){
  const de=SIM.densitaEdifici&&SIM.densitaEdifici();
  if(de&&de.DEN){
    const D=de.DS,i=Math.floor((x-D.x0)/D.passo),j=Math.floor((D.yNord+z)/D.passo);
    return i>=0&&j>=0&&i<D.larghezza&&j<D.altezza&&de.DEN[j*D.larghezza+i]>2;
  }
  for(const c of citta)if(Math.abs(x-c.x)<c.r&&Math.abs(z-c.z)<c.r&&Math.hypot(x-c.x,z-c.z)<c.r*0.9)return true;
  return false;
}
function sentiero(x,z){
  for(const p of piste){
    const m=p.L/2+1800;
    if(Math.abs(x-p.cx)>m||Math.abs(z-p.cz)>m) continue;
    const {u,v}=locale(p,x,z),fu=Math.abs(u)-p.L/2;
    if(fu<1800&&Math.abs(v)<p.W/2+140+Math.max(0,fu)*0.12) return true;
  }
  return false;
}
function bosco(x,z,h,slope,k){
  const n=vnoise(x/900+31.7,z/900-12.3)*0.6+vnoise(x/230+5.1,z/230+7.7)*0.4;
  // in pianura coltivata solo boschetti; sui pendii quasi tutto bosco
  const soglia=0.42+0.3*k-0.16*smooth(0.12,0.45,slope);
  let w=smooth(soglia-0.05,soglia+0.05,n);
  if(w<0.01) return 0;
  w*=1-smooth(-120,60,h-QC.bosco*0.95-(n-0.5)*500);           // limite degli alberi
  w*=1-smooth(0.85,1.2,slope);                                // pareti di roccia
  if(w<0.01||urbano(x,z)||api.inAeroporto(x,z,100)||sentiero(x,z)) return 0;
  return w;
}
api.QC=QC;

/* ---------- campi coltivati ----------
   Nessun dato: un mosaico inventato nello shader, in coordinate del mondo (uguale a ogni
   visita). Il mondo è diviso in "poderi" (celle di Voronoi di ~900 m), ognuno con il suo
   orientamento e la sua misura dei campi; i campi sono file di rettangoli di lunghezza
   varia, con colture diverse, solchi e capezzagne. Da lontano (campi di pochi pixel)
   sfumano nel colore medio per non sfarfallare. Peso per vertice: attributo aCampi (tc.k). */
const GLSL_CAMPI=`
float campiH(vec2 c){return fract(sin(dot(c,vec2(127.1,311.7)))*43758.5453);}
vec3 campi(vec2 p,vec3 base,float k){
  vec2 g=floor(p/900.0),cid=g,cen=g*900.0;float best=1e12;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 c=g+vec2(float(i),float(j));
    vec2 o=(c+vec2(campiH(c),campiH(c+19.7)))*900.0;
    vec2 d=p-o;float dd=dot(d,d);
    if(dd<best){best=dd;cid=c;cen=o;}
  }
  float a=campiH(cid+3.1)*3.1416,ca=cos(a),sa=sin(a);
  vec2 q=vec2(ca*(p.x-cen.x)+sa*(p.y-cen.y),-sa*(p.x-cen.x)+ca*(p.y-cen.y));
  float H=40.0+campiH(cid+7.3)*80.0;                       // larghezza delle file di campi
  float j=floor(q.y/H);
  float Lr=H*(1.2+campiH(vec2(j,cid.x+cid.y*7.0))*2.8);   // lunghezza dei campi della fila
  float off=campiH(vec2(j*1.7,cid.y-cid.x))*Lr;
  float i=floor((q.x+off)/Lr);
  vec2 f=vec2((q.x+off)-i*Lr,q.y-j*H);                     // metri dentro il campo
  float h1=campiH(vec2(i+cid.x*31.0,j+cid.y*17.0)),h2=campiH(vec2(i*3.3+cid.y,j*5.1-cid.x));
  // coltura: il podere ha una tendenza (più prati o più seminativi)
  float t=fract(h1*0.75+campiH(cid+11.0)*0.5);
  vec3 col;
  if(t<0.24)col=vec3(0.36,0.50,0.25);        // prato
  else if(t<0.38)col=vec3(0.42,0.52,0.28);   // coltura giovane
  else if(t<0.52)col=vec3(0.28,0.41,0.21);   // mais
  else if(t<0.62)col=vec3(0.58,0.55,0.36);   // grano maturo
  else if(t<0.72)col=vec3(0.52,0.50,0.37);   // stoppie
  else if(t<0.85)col=vec3(0.44,0.38,0.29);   // arato
  else col=vec3(0.33,0.44,0.34);             // risaia / erba medica
  col*=0.93+h2*0.14;
  vec2 px=dFdx(p),py=dFdy(p);
  float mpp=max(max(length(px),length(py)),0.01);      // metri per pixel (direzione peggiore: per le righe sottili)
  float mppM=max(sqrt(length(px)*length(py)),0.01);   // media (per i campi interi, guardati di sbieco)
  // solchi lungo il campo
  float per=3.0+h2*3.0,sol=0.5+0.5*sin(f.y*6.2832/per);
  col*=1.0-0.07*sol*(1.0-smoothstep(0.25,0.6,mpp/per));
  // capezzagne erbose ai bordi; ogni tanto una siepe scura lungo la fila
  float bordo=min(min(f.x,Lr-f.x),min(f.y,H-f.y));
  float lb=1.0-smoothstep(1.2,1.2+mpp,bordo);
  float siepe=step(0.72,campiH(vec2(j+0.5,cid.x*3.0-cid.y)))*(1.0-smoothstep(4.0,4.0+mpp,f.y));
  float vicino=1.0-smoothstep(1.0,4.0,mpp);
  col=mix(col,vec3(0.33,0.45,0.21),lb*vicino*0.8);
  col=mix(col,vec3(0.16,0.27,0.12),siepe*(1.0-smoothstep(2.0,6.0,mpp)));
  // da lontano: colore medio
  col=mix(col,vec3(0.41,0.47,0.29),smoothstep(0.25,0.7,mppM/H));
  return mix(base,col,k*0.85);
}
// rumore a valori ripetuto ogni per celle (coordinate piccole: sin() resta preciso)
float campiN(vec2 p,float per){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=campiH(mod(i,per)),b=campiH(mod(i+vec2(1.0,0.0),per)),c=campiH(mod(i+vec2(0.0,1.0),per)),d=campiH(mod(i+vec2(1.0,1.0),per));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
// chiome del bosco viste dall'alto: latifoglie in basso, conifere (più scure, verde-blu) in alto
vec3 chiome(vec2 p,float y){
  float mpp=max(length(fwidth(p)),0.01);
  float n1=campiN(p/7.0,512.0),n2=campiN(p/40.0,64.0),n3=campiN(p/300.0,16.0);
  float conif=smoothstep(${(QC.prato).toFixed(1)},${((QC.prato+QC.bosco)/2).toFixed(1)},y+(n3-0.5)*400.0);
  vec3 chioma=mix(vec3(0.23,0.35,0.16),vec3(0.15,0.26,0.16),conif)*(0.85+n2*0.3);
  vec3 ombra=mix(vec3(0.10,0.17,0.08),vec3(0.07,0.13,0.08),conif);
  float c=smoothstep(0.3,0.7,n1);
  c=mix(c,0.62,smoothstep(1.5,5.0,mpp));            // da lontano: tinta media
  return mix(ombra,chioma,c);
}
`;
// aggiunge i campi a un materiale del terreno (dopo le eventuali altre aggiunte allo shader)
function vesteCampi(mat,chiave){
  const prima=mat.onBeforeCompile;
  mat.onBeforeCompile=(sh,r)=>{
    if(prima)prima.call(mat,sh,r);
    const VAR='varying float vCampi,vBosco,vYCampi;\nvarying vec2 vPCampi;\n';
    sh.vertexShader='attribute float aCampi,aBosco;\n'+VAR+sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvCampi=aCampi;vBosco=aBosco;\nvec4 pmCampi=modelMatrix*vec4(transformed,1.0);vPCampi=pmCampi.xz;vYCampi=pmCampi.y;');
    sh.fragmentShader=VAR+GLSL_CAMPI+sh.fragmentShader.replace('#include <color_fragment>',
      // bordo del bosco frastagliato (rumore di 30-90 m sopra il valore dei vertici, a 62,5 m)
      '#include <color_fragment>\nfloat fbCampi=vBosco>0.01?smoothstep(0.44,0.56,vBosco+(campiN(vPCampi/30.0,128.0)*0.6+campiN(vPCampi/90.0,32.0)*0.4-0.5)*0.3):0.0;\n'+
      'if(vCampi>0.01)diffuseColor.rgb=campi(vPCampi,diffuseColor.rgb,vCampi*(1.0-fbCampi));\n'+
      'if(fbCampi>0.0)diffuseColor.rgb=mix(diffuseColor.rgb,chiome(vPCampi,vYCampi),fbCampi);');
  };
  // la stessa funzione involucro ha lo stesso testo per i due materiali: chiave diversa, sennò three li confonde
  mat.customProgramCacheKey=()=>chiave;
}

/* ---------- terreno lontano (solo mappe reali) ----------
   Una griglia grossa (1 km) di tutta la regione, così le montagne si vedono
   da lontano. Dove c'è il terreno vicino, dettagliato, viene "bucata". */
// altezza del terreno lontano in un punto (stessa griglia e stessi triangoli della mesh qui sotto):
// serve per appoggiare gli oggetti visti da lontano (es. i monumenti) senza farli galleggiare
api.hLontano=function(x,z){
  if(!RL) return terrainH(x,z);
  const P=1000,x0=RL.xMin,z0=-RL.yNord;
  const fi=(x-x0)/P,fj=(z-z0)/P,i=Math.floor(fi),j=Math.floor(fj),fx=fi-i,fz=fj-j;
  const h=(a,b)=>naturale(x0+a*P,z0+b*P);
  const h00=h(i,j),h11=h(i+1,j+1);
  if(fz>fx){const h01=h(i,j+1);return h00+(h11-h01)*fx+(h01-h00)*fz-15;}
  const h10=h(i+1,j);return h00+(h10-h00)*fx+(h11-h10)*fz-15;
};
api.creaLontano=function(scene){
  if(!RL) return null;
  const P=1000;
  const x0=RL.xMin, z0=-RL.yNord, Wm=(RL.larghezza-1)*RL.passo, Hm=(RL.altezza-1)*RL.passo;
  const NX=Math.floor(Wm/P)+1, NZ=Math.floor(Hm/P)+1;
  const pos=new Float32Array(NX*NZ*3), col=new Float32Array(NX*NZ*3), cam=new Float32Array(NX*NZ), bos=new Float32Array(NX*NZ), Hh=new Float32Array(NX*NZ);
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const o=j*NX+i;Hh[o]=naturale(x0+i*P,z0+j*P);}
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
    const o=j*NX+i,x=x0+i*P,z=z0+j*P,h=Hh[o];
    const hx=Hh[j*NX+Math.min(i+1,NX-1)]-Hh[j*NX+Math.max(i-1,0)], hz=Hh[Math.min(j+1,NZ-1)*NX+i]-Hh[Math.max(j-1,0)*NX+i];
    pos[o*3]=x;pos[o*3+1]=h-15;pos[o*3+2]=z;
    colore(h,Math.hypot(hx,hz)/(2*P),x,z,false);
    col[o*3]=tc.r;col[o*3+1]=tc.g;col[o*3+2]=tc.b;cam[o]=tc.k;bos[o]=tc.w;
  }
  const idx=new Uint32Array((NX-1)*(NZ-1)*6);let k=0;
  for(let j=0;j<NZ-1;j++)for(let i=0;i<NX-1;i++){
    const a=j*NX+i,b=(j+1)*NX+i,c=(j+1)*NX+i+1,d=j*NX+i+1;
    idx[k++]=a;idx[k++]=b;idx[k++]=c;idx[k++]=a;idx[k++]=c;idx[k++]=d;
  }
  const geo=new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  geo.setAttribute('aCampi',new THREE.BufferAttribute(cam,1));
  geo.setAttribute('aBosco',new THREE.BufferAttribute(bos,1));
  const unif={uCentro:{value:new THREE.Vector2(1e9,1e9)},uMezzo:{value:TS/2-STEP*1.5}};
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,metalness:0});
  mat.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,unif);
    sh.vertexShader='varying vec3 vPosMondo;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPosMondo=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader='varying vec3 vPosMondo;\nuniform vec2 uCentro;\nuniform float uMezzo;\n'+sh.fragmentShader.replace('void main() {',
      'void main() {\nif(abs(vPosMondo.x-uCentro.x)<uMezzo&&abs(vPosMondo.z-uCentro.y)<uMezzo)discard;');
  };
  vesteCampi(mat,'terreno-lontano');
  const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;scene.add(mesh);
  return {mesh,buco(cx,cz){unif.uCentro.value.set(cx,cz);}};
};

/* ---------- mesh del terreno che segue l'aereo ----------
   Due copie della griglia: mentre una è visibile, l'altra viene ricalcolata
   a pezzi (pochi righe per fotogramma) e poi le due si scambiano. */
api.creaMesh=function(scene,renderer){
  const N=SEG+1;
  const idx=new THREE.BufferAttribute(new Uint32Array(SEG*SEG*6),1);
  let k=0;
  for(let j=0;j<SEG;j++)for(let i=0;i<SEG;i++){
    const a=j*N+i,b=(j+1)*N+i,c=(j+1)*N+i+1,d=j*N+i+1; // a=00 b=01 c=11 d=10 (stessa diagonale di meshH)
    idx.array[k++]=a;idx.array[k++]=b;idx.array[k++]=c;idx.array[k++]=a;idx.array[k++]=c;idx.array[k++]=d;
  }
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,metalness:0});
  // strade, fiumi e paesi disegnati sul terreno + edifici (js/paesaggio.js, solo mappe reali)
  const vie=SIM.creaPaesaggio?SIM.creaPaesaggio(scene,renderer,TS):null;
  if(vie)vie.veste(mat);
  vesteCampi(mat,'terreno-vicino');
  const alberi=SIM.creaBoschi?SIM.creaBoschi(scene,api):null;   // alberi 3D nei boschi (js/boschi.js)
  function buffer(){
    const geo=new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*N*3),3));
    geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(N*N*3),3));
    geo.setAttribute('aCampi',new THREE.BufferAttribute(new Float32Array(N*N),1));
    geo.setAttribute('aBosco',new THREE.BufferAttribute(new Float32Array(N*N),1));
    const mesh=new THREE.Mesh(geo,mat);
    mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
    return {geo,mesh,H:new Float32Array(N*N),cx:NaN,cz:NaN};
  }
  const buf=[buffer(),buffer()];
  const lontano=api.creaLontano(scene);
  let attivo=0, lavoro=null;


  function* costruisci(b,cx,cz){
    b.cx=cx;b.cz=cz;
    const pos=b.geo.attributes.position.array,col=b.geo.attributes.color.array,cam=b.geo.attributes.aCampi.array,bos=b.geo.attributes.aBosco.array,H=b.H;
    const x0=cx-TS/2,z0=cz-TS/2;
    for(let j=0;j<N;j++){
      for(let i=0;i<N;i++){
        const x=x0+i*STEP,z=z0+j*STEP,h=terrainH(x,z),o=j*N+i;
        H[o]=h;pos[o*3]=x;pos[o*3+1]=h;pos[o*3+2]=z;
      }
      if(j%24===23) yield;
    }
    for(let j=0;j<N;j++){
      for(let i=0;i<N;i++){
        const o=j*N+i,h=H[o],x=x0+i*STEP,z=z0+j*STEP;
        const hx=H[j*N+Math.min(i+1,SEG)]-H[j*N+Math.max(i-1,0)];
        const hz=H[Math.min(j+1,SEG)*N+i]-H[Math.max(j-1,0)*N+i];
        const slope=Math.hypot(hx,hz)/(2*STEP);
        colore(h,slope,x,z,true);
        col[o*3]=tc.r;col[o*3+1]=tc.g;col[o*3+2]=tc.b;cam[o]=tc.k;bos[o]=tc.w;
      }
      if(j%48===47) yield;
    }
    if(vie) yield* vie.disegna(cx,cz);
    if(alberi) yield* alberi.costruisci({x0,z0,N,STEP,H,W:bos},cx,cz);   // dopo le vie: le evita
    b.geo.attributes.position.needsUpdate=true;b.geo.attributes.color.needsUpdate=true;b.geo.attributes.aCampi.needsUpdate=true;b.geo.attributes.aBosco.needsUpdate=true;
  }
  return {
    // dove c'è il terreno dettagliato (quadrato di centro cx, cz e mezzo lato "mezzo")
    vicino(){const a=buf[attivo];return {cx:a.cx,cz:a.cz,mezzo:TS/2-STEP*1.5};},
    // da chiamare a ogni fotogramma con la posizione dell'aereo
    aggiorna(px,pz,forza){
      const a=buf[attivo];
      const cx=Math.round(px/STEP)*STEP,cz=Math.round(pz/STEP)*STEP;
      if(forza){
        lavoro=null;
        for(const _ of costruisci(a,cx,cz));
        a.mesh.visible=true;buf[1-attivo].mesh.visible=false;
        if(vie){vie.applica();vie.dettaglio(px,pz,true);}
        if(alberi)alberi.applica();
        if(lontano)lontano.buco(a.cx,a.cz);
        return;
      }
      if(!lavoro&&!(Math.abs(px-a.cx)<1500&&Math.abs(pz-a.cz)<1500))
        lavoro=costruisci(buf[1-attivo],cx,cz);
      if(lavoro&&lavoro.next().done){
        lavoro=null;attivo=1-attivo;
        buf[attivo].mesh.visible=true;buf[1-attivo].mesh.visible=false;
        if(vie)vie.applica();
        if(alberi)alberi.applica();
      }else if(vie&&!lavoro)vie.dettaglio(px,pz);   // immagine da vicino: quando la griglia non lavora
      if(lontano)lontano.buco(buf[attivo].cx,buf[attivo].cz);
    },
  };
};

SIM.terreno=api;
})();
