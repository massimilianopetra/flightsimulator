/* =====================================================================
   TERRENO
   Calcola l'altezza del suolo in ogni punto partendo da dati/mappa.js:
   colline procedurali + montagne + laghi + spianate degli aeroporti.
   Coordinate interne (three.js): x = est, z = sud (quindi nord = -z), y = su.
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
  seme:SEED, vnoise, hash, rng, terrainH, naturale, meshH, locale, inLago, reale:!!RL, rilievo:RL,
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
      if(p===p.ap.piste[0]&&Math.abs(u)<=90&&v>0&&v<145){api.tipo='piazzale';return h;}
    }
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
let C=null; const tc={r:0,g:0,b:0};
function colore(h,slope,x,z,dettaglio){
  if(!C){C={sand:new THREE.Color(0xd8c690),grass:new THREE.Color(0x5b8a3e),mown:new THREE.Color(0x6a9a48),
    forest:new THREE.Color(0x3d6b35),rock:new THREE.Color(0x857a66),snow:new THREE.Color(0xf2f5f8),c:new THREE.Color()};}
  const c=C.c, r=hash(x|0,z|0)-.5;
  let acquaVicina=h<4;
  if(!acquaVicina&&laghi.length){const l=inLago(x,z,25);if(l&&h<l.q+2)acquaVicina=true;}
  if(acquaVicina)c.copy(C.sand);
  else if(dettaglio&&api.inAeroporto(x,z,-60))c.copy(C.mown);
  else if(h<QC.prato)c.copy(C.grass).lerp(C.forest,clamp(h/QC.prato+r*.35,0,1));
  else if(h<QC.bosco)c.copy(C.forest).lerp(C.rock,clamp((h-QC.prato)/(QC.bosco-QC.prato)+r*.2,0,1));
  else c.copy(C.rock).lerp(C.snow,clamp((h-QC.roccia)/(QC.neve-QC.roccia),0,1));
  if(slope>.55&&!acquaVicina)c.lerp(C.rock,clamp((slope-.55)*2.5,0,.85));
  tc.r=c.r;tc.g=c.g;tc.b=c.b;
}

/* ---------- terreno lontano (solo mappe reali) ----------
   Una griglia grossa (1 km) di tutta la regione, così le montagne si vedono
   da lontano. Dove c'è il terreno vicino, dettagliato, viene "bucata". */
api.creaLontano=function(scene){
  if(!RL) return null;
  const P=1000;
  const x0=RL.xMin, z0=-RL.yNord, Wm=(RL.larghezza-1)*RL.passo, Hm=(RL.altezza-1)*RL.passo;
  const NX=Math.floor(Wm/P)+1, NZ=Math.floor(Hm/P)+1;
  const pos=new Float32Array(NX*NZ*3), col=new Float32Array(NX*NZ*3), Hh=new Float32Array(NX*NZ);
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const o=j*NX+i;Hh[o]=naturale(x0+i*P,z0+j*P);}
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
    const o=j*NX+i,x=x0+i*P,z=z0+j*P,h=Hh[o];
    const hx=Hh[j*NX+Math.min(i+1,NX-1)]-Hh[j*NX+Math.max(i-1,0)], hz=Hh[Math.min(j+1,NZ-1)*NX+i]-Hh[Math.max(j-1,0)*NX+i];
    pos[o*3]=x;pos[o*3+1]=h-15;pos[o*3+2]=z;
    colore(h,Math.hypot(hx,hz)/(2*P),x,z,false);
    col[o*3]=tc.r;col[o*3+1]=tc.g;col[o*3+2]=tc.b;
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
  const unif={uCentro:{value:new THREE.Vector2(1e9,1e9)},uMezzo:{value:TS/2-STEP*1.5}};
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,metalness:0});
  mat.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,unif);
    sh.vertexShader='varying vec3 vPosMondo;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPosMondo=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader='varying vec3 vPosMondo;\nuniform vec2 uCentro;\nuniform float uMezzo;\n'+sh.fragmentShader.replace('void main() {',
      'void main() {\nif(abs(vPosMondo.x-uCentro.x)<uMezzo&&abs(vPosMondo.z-uCentro.y)<uMezzo)discard;');
  };
  const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;scene.add(mesh);
  return {mesh,buco(cx,cz){unif.uCentro.value.set(cx,cz);}};
};

/* ---------- mesh del terreno che segue l'aereo ----------
   Due copie della griglia: mentre una è visibile, l'altra viene ricalcolata
   a pezzi (pochi righe per fotogramma) e poi le due si scambiano. */
api.creaMesh=function(scene){
  const N=SEG+1;
  const idx=new THREE.BufferAttribute(new Uint32Array(SEG*SEG*6),1);
  let k=0;
  for(let j=0;j<SEG;j++)for(let i=0;i<SEG;i++){
    const a=j*N+i,b=(j+1)*N+i,c=(j+1)*N+i+1,d=j*N+i+1; // a=00 b=01 c=11 d=10 (stessa diagonale di meshH)
    idx.array[k++]=a;idx.array[k++]=b;idx.array[k++]=c;idx.array[k++]=a;idx.array[k++]=c;idx.array[k++]=d;
  }
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,metalness:0});
  function buffer(){
    const geo=new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*N*3),3));
    geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(N*N*3),3));
    const mesh=new THREE.Mesh(geo,mat);
    mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
    return {geo,mesh,H:new Float32Array(N*N),cx:NaN,cz:NaN};
  }
  const buf=[buffer(),buffer()];
  const lontano=api.creaLontano(scene);
  let attivo=0, lavoro=null;


  function* costruisci(b,cx,cz){
    b.cx=cx;b.cz=cz;
    const pos=b.geo.attributes.position.array,col=b.geo.attributes.color.array,H=b.H;
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
        col[o*3]=tc.r;col[o*3+1]=tc.g;col[o*3+2]=tc.b;
      }
      if(j%48===47) yield;
    }
    b.geo.attributes.position.needsUpdate=true;b.geo.attributes.color.needsUpdate=true;
  }
  return {
    // da chiamare a ogni fotogramma con la posizione dell'aereo
    aggiorna(px,pz,forza){
      const a=buf[attivo];
      const cx=Math.round(px/STEP)*STEP,cz=Math.round(pz/STEP)*STEP;
      if(forza){
        lavoro=null;
        for(const _ of costruisci(a,cx,cz));
        a.mesh.visible=true;buf[1-attivo].mesh.visible=false;
        if(lontano)lontano.buco(a.cx,a.cz);
        return;
      }
      if(!lavoro&&!(Math.abs(px-a.cx)<1500&&Math.abs(pz-a.cz)<1500))
        lavoro=costruisci(buf[1-attivo],cx,cz);
      if(lavoro&&lavoro.next().done){
        lavoro=null;attivo=1-attivo;
        buf[attivo].mesh.visible=true;buf[1-attivo].mesh.visible=false;
      }
      if(lontano)lontano.buco(buf[attivo].cx,buf[attivo].cz);
    },
  };
};

SIM.terreno=api;
})();
