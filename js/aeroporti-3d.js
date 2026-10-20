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
   AEROPORTI IN 3D (solo mondo reale): Torino Caselle, Milano Malpensa,
   Milano Linate, Genova, Cuneo Levaldigi.
   I dati vengono da OpenStreetMap (dati/piemonte-aeroporti.js, generato da
   strumenti/genera-aeroporti.js): sagome vere degli edifici, altezze e
   piani, torre di controllo, radar, torri faro, serbatoi, pontili
   d'imbarco, piazzole numerate, parcheggi e strade di servizio.
   Qui si costruisce tutto in 3D:
     - facciate con immagini disegnate al volo (canvas): vetrate dei terminal
       nello stile di ogni aeroporto (ispirate alle foto, non copiate),
       uffici a nastro, lamiera e portoni degli hangar, pannelli dei
       capannoni, piani aperti dei parcheggi multipiano, case;
     - tetti piani con parapetto e impianti, a due falde, a volta;
     - torri di controllo (Caselle e Genova a fusto tondo, Linate quadrata
       con il radome, Malpensa con il "piattino" e la cabina a più piani,
       Cuneo a traliccio), radar che girano;
     - pontili d'imbarco, aerei di linea e da turismo parcheggiati, mezzi di
       rampa, segnaletica delle piazzole con i numeri;
     - parcheggi con le strisce e le auto, recinzione col filo spinato;
     - insegne col nome in lettere sul tetto dei terminal (lato pista e lato
       strada); a Caselle la vetrata verso la pista si piega in fuori;
     - di notte vetrate, finestre e insegne accese e luce delle torri faro.
   Gli edifici sono fusi per materiale: pochi oggetti da disegnare.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const DATI=window.AEROPORTI3D, T=SIM.terreno;
if(!DATI||!T||!T.reale) return;
const D2R=Math.PI/180;
const MARGINE=150;   // come in strumenti/genera-aeroporti.js: lì niente case generate (js/paesaggio.js) né alberi

/* ---------- dati nel sistema del mondo (x est, z sud) ---------- */
function anello(ap,a){const o=[];for(let i=0;i<a.length;i+=2)o.push({x:ap.x+a[i]/10,z:ap.z-a[i+1]/10});return o;}
const dentro=(poli,x,z)=>{let c=false;for(let i=0,j=poli.length-1;i<poli.length;j=i++){const a=poli[i],b=poli[j];
  if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)c=!c;}return c;};
const distSeg=(x,z,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2));return Math.hypot(a.x+t*dx-x,a.z+t*dz-z);};

const ELENCO=[];
for(const ap of T.aeroporti){
  const d=DATI[ap.codice];if(!d) continue;
  const per=d.perimetro.map(a=>anello(ap,a));
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(const r of per)for(const p of r){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);}
  x0-=MARGINE;x1+=MARGINE;z0-=MARGINE;z1+=MARGINE;
  // maschera a celle di 25 m: dentro il sedime o a meno di MARGINE dal bordo
  const C=25,W=Math.ceil((x1-x0)/C),H=Math.ceil((z1-z0)/C),mask=new Uint8Array(W*H);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    const x=x0+(i+0.5)*C,z=z0+(j+0.5)*C;
    let s=per.some(r=>dentro(r,x,z));
    if(!s)for(const r of per){for(let k=0,l=r.length-1;k<r.length;l=k++)if(distSeg(x,z,r[l],r[k])<MARGINE){s=true;break;}if(s)break;}
    mask[j*W+i]=s?1:0;
  }
  ELENCO.push({ap,d,per,box:[x0,x1,z0,z1],mask,C,W,H});
}
if(!ELENCO.length) return;

/* piazzole pavimentate: in OSM i piazzali di Caselle e Malpensa sono più stretti di quelli veri (resta l'erba tra
   via di rullaggio e piazzale, e sotto alcune piazzole remote). Ogni piazzola diventa un pezzo di piazzale:
   l'ingombro dell'aereo (apertura alare x lunghezza) e, sotto la linea d'ingresso, una striscia larga come la piazzola.
   Si aggiungono alla rete di js/rullaggio.js, che li disegna con lo stesso cemento e li conta per la fisica. */
if(SIM.reteRullaggio)for(const e of ELENCO){
  const {ap,d}=e,rete=SIM.reteRullaggio;if(!rete.di(ap)) continue;
  const P=(x,y)=>({x:ap.x+x/10,z:ap.z-y/10});
  const rett=(a,b,hw)=>{const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1,nx=-dz/L*hw,nz=dx/L*hw;
    return [{x:a.x+nx,z:a.z+nz},{x:b.x+nx,z:b.z+nz},{x:b.x-nx,z:b.z-nz},{x:a.x-nx,z:a.z-nz}];};
  for(const s of d.piazzole){
    const h=s.d*D2R,fx=Math.sin(h),fz=-Math.cos(h);
    let nose=P(s.x,s.y),linea;
    if(s.l)linea=anello(ap,s.l);
    else{const c=P(s.x,s.y);nose={x:c.x+fx*s.s*0.4,z:c.z+fz*s.s*0.4};linea=[{x:c.x-fx*s.s*0.6,z:c.z-fz*s.s*0.6},nose];}
    const lung=Math.max(12,s.s*1.05);
    rete.aggiungiPiazzale(ap,rett({x:nose.x+fx*5,z:nose.z+fz*5},{x:nose.x-fx*lung,z:nose.z-fz*lung},s.s/2+3));
    for(let i=1;i<linea.length;i++)rete.aggiungiPiazzale(ap,rett(linea[i-1],linea[i],Math.max(8,s.s/2+2)));   // larga come la piazzola: le vicine si toccano
  }
}

/* true se il punto è nel sedime di un aeroporto disegnato (+150 m): lì gli edifici sono quelli veri */
SIM.zonaAeroporti=function(x,z){
  for(const e of ELENCO){
    const b=e.box;if(x<b[0]||x>b[1]||z<b[2]||z>b[3]) continue;
    const i=Math.floor((x-b[0])/e.C),j=Math.floor((z-b[2])/e.C);
    if(i>=0&&j>=0&&i<e.W&&j<e.H&&e.mask[j*e.W+i]) return true;
  }
  return false;
};
/* torre di controllo vera: {x, z, y (altezza della cabina dal suolo)} oppure null (js/mondo.js: vista dalla torre) */
const CABINA={cilindro:0.86,quadrata:0.78,malpensa:0.82,traliccio:0.85};
SIM.torreVera=function(ap){
  const e=ELENCO.find(e=>e.ap===ap);if(!e||!e.d.torre) return null;
  const t=e.d.torre;
  return {x:ap.x+t.x/10,z:ap.z-t.y/10,y:t.h*(CABINA[t.forma]||0.85)};
};

/* ---------- utilità ---------- */
function rng(s){let a=s>>>0||1;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// rettangolo minimo orientato di un contorno {x,z}: centro, versori u (lato lungo) e v, lunghezze
function rettangolo(p){
  let best=null;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],ang=Math.atan2(b.z-a.z,b.x-a.x),c=Math.cos(ang),s=Math.sin(ang);
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(const q of p){const u=q.x*c+q.z*s,v=-q.x*s+q.z*c;u0=Math.min(u0,u);u1=Math.max(u1,u);v0=Math.min(v0,v);v1=Math.max(v1,v);}
    const ar=(u1-u0)*(v1-v0);
    if(!best||ar<best.ar){const uc=(u0+u1)/2,vc=(v0+v1)/2;best={ar,c,s,L:u1-u0,W:v1-v0,x:uc*c-vc*s,z:uc*s+vc*c};}
  }
  let u={x:best.c,z:best.s},v={x:-best.s,z:best.c},L=best.L,W=best.W;
  if(W>L){const t=u;u=v;v={x:-t.x,z:-t.z};L=best.W;W=best.L;}
  return {x:best.x,z:best.z,u,v,L,W};
}
const areaPoli=p=>{let s=0;for(let i=0,j=p.length-1;i<p.length;j=i++)s+=p[j].x*p[i].z-p[i].x*p[j].z;return s/2;};

/* ---------- immagini delle facciate (canvas) ---------- */
let ANISO=4;
function tela(w,h,disegna,ripeti=true){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  disegna(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);
  if(ripeti)t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=ANISO;
  return t;
}
const r8=rng(77);
const sfuma=(g,x,y,w,h,c1,c2)=>{const gr=g.createLinearGradient(x,y,x,y+h);gr.addColorStop(0,c1);gr.addColorStop(1,c2);g.fillStyle=gr;g.fillRect(x,y,w,h);};
function rumore(g,w,h,n,a,chiaro=false){
  for(let i=0;i<n;i++){const v=chiaro?200+r8()*55|0:r8()*60|0;g.fillStyle=`rgba(${v},${v},${v},${a*r8()})`;g.fillRect(r8()*w,r8()*h,1+r8()*2,1+r8()*2);}
}
/* vetrata: px = pixel per metro; pannelli pw x ph metri; opzioni di stile.
   Ogni facciata ha due immagini: colore di giorno ed "emissiva" (luci accese di notte). */
function vetrata(o){
  const tw=o.tw,th=o.th,px=o.px||32,W=Math.round(tw*px),H=Math.round(th*px);
  const lit=[];
  const giorno=tela(W,H,(g)=>{
    g.fillStyle=o.telaio;g.fillRect(0,0,W,H);
    for(let y=0;y<th-0.01;y+=o.ph)for(let x=0;x<tw-0.01;x+=o.pw){
      if(o.pilastro&&x<o.pilastro) continue;
      const k=r8(),y0=y,isF=o.fascia&&(y+o.ph>th-o.fascia-0.01);
      if(isF){g.fillStyle=o.coloreFascia;g.fillRect(x*px,y0*px,o.pw*px,o.ph*px);continue;}
      sfuma(g,x*px+1,y0*px+1,o.pw*px-2,o.ph*px-2,o.vetro[0],o.vetro[1]);
      g.fillStyle=`rgba(255,255,255,${0.04+k*0.12})`;      // riflessi diversi per ogni lastra
      g.beginPath();g.moveTo(x*px,y0*px+o.ph*px*0.9);g.lineTo(x*px+o.pw*px*0.7,y0*px);g.lineTo(x*px+o.pw*px,y0*px);g.lineTo(x*px+o.pw*px,y0*px+o.ph*px*0.2);g.lineTo(x*px+o.pw*px*0.3,y0*px+o.ph*px);g.lineTo(x*px,y0*px+o.ph*px);g.fill();
      if(r8()<0.15){g.fillStyle='rgba(0,0,0,.12)';g.fillRect(x*px+1,y0*px+1,o.pw*px-2,o.ph*px-2);}
      lit.push([x,y0,o.pw,o.ph,r8()]);
    }
    if(o.pilastro){g.fillStyle=o.colorePilastro;g.fillRect(0,0,o.pilastro*px,H);g.fillStyle='rgba(0,0,0,.12)';g.fillRect(o.pilastro*px-2,0,2,H);}
    if(o.diagonali){ // controventi a X di ogni campata (Caselle)
      g.strokeStyle=o.diagonali;g.lineWidth=Math.max(2,px*0.08);
      for(let x=0;x<tw;x+=o.campata)for(let y=0;y<th;y+=o.campata){g.beginPath();g.moveTo(x*px,y*px);g.lineTo((x+o.campata)*px,(y+o.campata)*px);g.moveTo((x+o.campata)*px,y*px);g.lineTo(x*px,(y+o.campata)*px);g.stroke();}
    }
    if(o.solaio){g.fillStyle=o.solaio;for(let y=0;y<th;y+=o.piano)g.fillRect(0,(y+o.piano)*px-px*0.35,W,px*0.35);}
  });
  const notte=tela(W,H,(g)=>{
    g.fillStyle='#000';g.fillRect(0,0,W,H);
    // i grandi saloni sono illuminati in modo quasi uniforme: poche lastre più scure
    for(const [x,y,w,h,k] of lit){
      const v=k<0.06?0.25:0.62+k*0.16;
      g.fillStyle=`rgba(255,${212+k*20|0},${150+k*40|0},${v})`;g.fillRect(x*px+1,y*px+1,w*px-2,h*px-2);
    }
    if(o.diagonali){g.strokeStyle='#000';g.lineWidth=Math.max(2,px*0.08);
      for(let x=0;x<tw;x+=o.campata)for(let y=0;y<th;y+=o.campata){g.beginPath();g.moveTo(x*px,y*px);g.lineTo((x+o.campata)*px,(y+o.campata)*px);g.moveTo((x+o.campata)*px,y*px);g.lineTo(x*px,(y+o.campata)*px);g.stroke();}}
    if(o.solaio){g.fillStyle='#000';for(let y=0;y<th;y+=o.piano)g.fillRect(0,(y+o.piano)*px-px*0.35,W,px*0.35);}
  });
  return {map:giorno,emi:notte,tw,th};
}
/* muro con finestre: tw x th metri (un modulo di un piano), finestre definite da f [x, y, w, h] in metri */
function muro(o){
  const px=o.px||32,W=Math.round(o.tw*px),H=Math.round(o.th*px),fin=[];
  const giorno=tela(W,H,(g)=>{
    g.fillStyle=o.fondo;g.fillRect(0,0,W,H);rumore(g,W,H,W*H/60,0.08);
    if(o.disegna)o.disegna(g,px,W,H);
    for(const f of o.f||[]){
      const [x,y,w,h]=f;
      if(o.cornice){g.fillStyle=o.cornice;g.fillRect((x-0.08)*px,(y-0.08)*px,(w+0.16)*px,(h+0.16)*px);}
      sfuma(g,x*px,y*px,w*px,h*px,o.vetro[0],o.vetro[1]);
      if(o.montanti){g.fillStyle=o.montanti;for(let m=o.passoMontanti;m<w-0.05;m+=o.passoMontanti)g.fillRect((x+m)*px-1,y*px,2,h*px);}
      if(o.persiane){g.fillStyle=o.persiane;g.fillRect((x-w*0.5-0.05)*px,y*px,w*0.48*px,h*px);g.fillRect((x+w+0.05)*px,y*px,w*0.48*px,h*px);
        g.fillStyle='rgba(0,0,0,.25)';for(let yy=y;yy<y+h;yy+=0.12){g.fillRect((x-w*0.5-0.05)*px,yy*px,w*0.48*px,1);g.fillRect((x+w+0.05)*px,yy*px,w*0.48*px,1);}}
      fin.push(f);
    }
  });
  const notte=tela(W,H,(g)=>{
    g.fillStyle='#000';g.fillRect(0,0,W,H);
    for(const [x,y,w,h] of fin){
      // a strisce verticali: ogni pezzo acceso o spento a caso, così la ripetizione si nota meno
      for(let m=0;m<w-0.01;m+=Math.min(w,1.4)){const k=r8();if(k<(o.spente||0.45))continue;
        g.fillStyle=`rgba(255,${205+k*40|0},${140+k*60|0},${0.5+k*0.5})`;g.fillRect((x+m)*px+1,y*px+1,Math.min(1.4,w-m)*px-2,h*px-2);}
    }
  });
  return {map:giorno,emi:notte,tw:o.tw,th:o.th};
}
function semplice(tw,th,px,disegna){return {map:tela(Math.round(tw*px),Math.round(th*px),(g,W,H)=>disegna(g,W,H,px)),tw,th};}

let TEX=null;
function texture(){
  if(TEX) return TEX;
  TEX={
    // terminal: una vetrata per aeroporto
    caselle:vetrata({tw:6,th:6,pw:1.5,ph:1.5,px:40,telaio:'#e4ebea',vetro:['#b5ddd6','#7fb7ae'],diagonali:'rgba(96,110,112,.8)',campata:6,solaio:'rgba(225,232,232,.9)',piano:6}),
    malpensa:vetrata({tw:6,th:4.5,pw:1.5,ph:1.5,px:36,telaio:'#4a5866',vetro:['#6d93b8','#3e5f82'],solaio:'#2a3440',piano:4.5}),
    linate:vetrata({tw:8,th:4.5,pw:1.35,ph:1.5,px:32,telaio:'#d8d6cc',vetro:['#79c58a','#3f9c58'],pilastro:1.25,colorePilastro:'#d9d4c4',solaio:'#c9c6ba',piano:4.5}),
    genova:vetrata({tw:6,th:4,pw:1.5,ph:2,px:32,telaio:'#e8ecef',vetro:['#9cc2de','#6493b8'],solaio:'#e3e7ea',piano:4}),
    cuneo:vetrata({tw:6,th:3.6,pw:2,ph:1.8,px:32,telaio:'#dfe1e1',vetro:['#8aa7b8','#5f7e92'],fascia:1.2,coloreFascia:'#e9e6df',piano:3.6}),
    // piano terra dei terminal: vetri scuri, porte e pilastri
    vetroBasso:muro({tw:6,th:5,fondo:'#9aa0a3',vetro:['#33434b','#1f2a30'],f:[[0.5,0,5,4.2]],montanti:'#7b858a',passoMontanti:1.25,spente:0.1,
      disegna:(g,px)=>{g.fillStyle='#b9bec0';g.fillRect(0,4.2*px,6*px,0.8*px);}}),
    uffici:muro({tw:4,th:3.4,fondo:'#f2f0ea',vetro:['#526a7c','#33475a'],f:[[0,0.95,4,1.45]],montanti:'#b8bec3',passoMontanti:1.333,
      disegna:(g,px)=>{g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,0.88*px,4*px,2);}}),
    casa:muro({tw:4.5,th:3,fondo:'#f3ead8',vetro:['#3d3a36','#2a2826'],f:[[1.7,0.75,1.1,1.45]],persiane:'#5b7a52',cornice:'#e0d6c2',spente:0.6}),
    pannelli:semplice(5,6,24,(g,W,H,px)=>{
      g.fillStyle='#e6e3db';g.fillRect(0,0,W,H);rumore(g,W,H,W*H/40,0.1);
      g.fillStyle='rgba(0,0,0,.22)';for(let x=0;x<5;x+=2.5)g.fillRect(x*px,0,2,H);g.fillRect(0,4.2*px,W,2);
      sfuma(g,0,4.3*px,W,0.8*px,'#4b5a66','#36434d');g.fillStyle='#d5d2ca';g.fillRect(0,5.1*px,W,0.9*px);
      g.fillStyle='rgba(120,110,95,.18)';for(let x=0;x<W;x+=3)g.fillRect(x,4.2*px,1,1.8*px*r8());   // colature
    }),
    lamiera:semplice(4,4,24,(g,W,H,px)=>{
      g.fillStyle='#e9ecee';g.fillRect(0,0,W,H);
      for(let x=0;x<W;x+=px*0.2){g.fillStyle='rgba(0,0,0,.13)';g.fillRect(x,0,2,H);g.fillStyle='rgba(255,255,255,.35)';g.fillRect(x+2,0,1,H);}
      rumore(g,W,H,W*H/50,0.06);
    }),
    portone:semplice(6,1,64,(g,W,H,px)=>{ // si stira su tutta l'altezza della porta
      sfuma(g,0,0,W,H,'#9fb0bd','#7f909c');
      g.fillStyle='rgba(0,0,0,.25)';for(let k=1;k<16;k++)g.fillRect(0,k*H/16,W,1);
      g.fillRect(0,0,3,H);g.fillRect(W-3,0,3,H);
      sfuma(g,4,H*0.12,W-8,H*0.06,'#2d3a44','#3e4e5a');                // finestrella a nastro
      g.fillStyle='rgba(255,210,0,.9)';for(let x=0;x<W;x+=16){g.fillRect(x,H-6,8,6);}  // fascia gialla e nera in basso
      g.fillStyle='rgba(20,20,20,.9)';for(let x=8;x<W;x+=16){g.fillRect(x,H-6,8,6);}
    }),
    parcheggio:(()=>{const px=32,tw=6,th=3;
      const giorno=tela(tw*px,th*px,(g,W,H)=>{
        g.fillStyle='#2d2f31';g.fillRect(0,0,W,H);
        g.fillStyle='#4a4c4e';for(let x=0;x<W;x+=8)g.fillRect(x,1.2*px,4,0.5*px);           // auto dentro (sagome)
        g.fillStyle='#bdbcb6';g.fillRect(0,1.9*px,W,1.1*px);g.fillRect(0,0,W,0.3*px);       // parapetto e bordo del solaio
        g.fillStyle='#a7a6a0';g.fillRect(2.9*px,0,0.4*px,H);
        rumore(g,W,H,W*H/50,0.1);
      });
      const notte=tela(tw*px,th*px,(g,W,H)=>{g.fillStyle='#000';g.fillRect(0,0,W,H);g.fillStyle='rgba(235,240,225,.3)';g.fillRect(0,0.3*px,W,1.6*px);});
      return {map:giorno,emi:notte,tw,th};})(),
    tettoPiano:semplice(16,16,16,(g,W,H,px)=>{
      g.fillStyle='#a3a4a1';g.fillRect(0,0,W,H);rumore(g,W,H,W*H/6,0.18);rumore(g,W,H,W*H/30,0.1,true);
      g.fillStyle='rgba(0,0,0,.12)';for(let x=0;x<W;x+=px*2)g.fillRect(x,0,1,H);
    }),
    tettoLamiera:semplice(4,4,24,(g,W,H,px)=>{
      g.fillStyle='#c4c9cc';g.fillRect(0,0,W,H);
      for(let x=0;x<W;x+=px*0.5){g.fillStyle='rgba(0,0,0,.16)';g.fillRect(x,0,2,H);g.fillStyle='rgba(255,255,255,.3)';g.fillRect(x+2,0,1,H);}
    }),
    coppi:semplice(4,4,24,(g,W,H,px)=>{
      g.fillStyle='#a2553c';g.fillRect(0,0,W,H);
      for(let y=0;y<H;y+=px*0.45){g.fillStyle='rgba(0,0,0,.2)';g.fillRect(0,y,W,2);}
      for(let x=0;x<W;x+=px*0.25){g.fillStyle='rgba(255,220,200,.12)';g.fillRect(x,0,px*0.1,H);}
      rumore(g,W,H,W*H/20,0.15);
    }),
    asfalto:semplice(8,8,16,(g,W,H)=>{g.fillStyle='#46484b';g.fillRect(0,0,W,H);rumore(g,W,H,W*H/3,0.25);rumore(g,W,H,W*H/12,0.08,true);}),
    cemento:semplice(4,4,16,(g,W,H)=>{g.fillStyle='#d7d6d1';g.fillRect(0,0,W,H);rumore(g,W,H,W*H/8,0.08);}),
    // palo delle torri faro: bianco e rosso a fasce
    strisce:semplice(1,6,16,(g,W,H)=>{g.fillStyle='#f4f4f2';g.fillRect(0,0,W,H);g.fillStyle='#d23a2e';g.fillRect(0,0,W,H/2);}),
    // recinzione a maglie e filo spinato (con trasparenza)
    rete:semplice(3.6,1.2,48,(g,W,H)=>{   // maglie e un paletto ogni 3,6 m
      g.clearRect(0,0,W,H);g.strokeStyle='rgba(150,155,150,1)';g.lineWidth=2;
      for(let k=-H;k<W+H;k+=H/4){g.beginPath();g.moveTo(k,0);g.lineTo(k+H,H);g.stroke();g.beginPath();g.moveTo(k,H);g.lineTo(k+H,0);g.stroke();}
      g.fillStyle='rgba(120,126,130,1)';g.fillRect(0,0,5,H);
    }),
    spinato:semplice(1,0.6,64,(g,W,H)=>{
      g.clearRect(0,0,W,H);g.strokeStyle='rgba(185,190,190,1)';g.lineWidth=2;
      g.beginPath();g.ellipse(W/2,H/2,W*0.55,H*0.45,0,0,Math.PI*2);g.stroke();
    }),
  };
  return TEX;
}

/* ---------- attrezzi e modelli comuni (js/modelli.js) ---------- */
const Acc=SIM.Acc, matrice=SIM.matrice, MOD=SIM.modelli, LIVREE=MOD.LIVREE;
const BIANCO=new THREE.Color(1,1,1),giallo=new THREE.Color(0xf2c200),rosso=new THREE.Color(0xc8322a),biancoS=new THREE.Color(0xeeeeee);
/* traffico di ogni aeroporto: quante piazzole occupate e, sulle piazzole grandi, quanti aerei di linea
   (gli altri sono da turismo); Cuneo ha pochi voli di linea, Malpensa anche aerei a lungo raggio */
const TRAFFICO={LIMC:{pieno:0.72,linea:1},LIMF:{pieno:0.65,linea:0.95},LIML:{pieno:0.75,linea:1},LIMJ:{pieno:0.6,linea:0.9},LIMZ:{pieno:0.55,linea:0.12}};
/* insegne dei terminal: nome dell'edificio in OSM (o '*' = il terminal più grande) -> scritta */
const INSEGNE={LIMF:{'*':'TORINO CASELLE'},LIMC:{'Terminal 1':'MILANO MALPENSA  TERMINAL 1','Terminal 2':'MALPENSA  TERMINAL 2'},
  LIML:{'*':'MILANO LINATE'},LIMJ:{'*':'GENOVA'},LIMZ:{'*':'CUNEO'}};
/* vetrata del terminal lato pista piegata in fuori: in cima sporge "sporge" metri, "curva" > 1 = più piegata verso l'alto */
const VETRATA_PIEGATA={LIMF:{sporge:3.2,curva:1.7}};

/* ---------- costruzione ---------- */
SIM.creaAeroporti3D=function(scene,renderer){
  if(renderer)ANISO=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const X=texture();
  const rete=SIM.reteRullaggio;
  /* materiali condivisi */
  const std=(o)=>new THREE.MeshStandardMaterial(Object.assign({vertexColors:true,roughness:.85,metalness:0},o));
  const facciata=(t,o={})=>std(Object.assign({map:t.map,emissiveMap:t.emi||null,emissive:new THREE.Color(0,0,0)},o));
  const M={
    caselle:facciata(X.caselle,{roughness:.35}),malpensa:facciata(X.malpensa,{roughness:.35}),
    linate:facciata(X.linate,{roughness:.4}),genova:facciata(X.genova,{roughness:.35}),cuneo:facciata(X.cuneo,{roughness:.5}),
    vetroBasso:facciata(X.vetroBasso,{roughness:.4}),uffici:facciata(X.uffici),casa:facciata(X.casa),parcheggio:facciata(X.parcheggio),
    pannelli:facciata(X.pannelli),lamiera:facciata(X.lamiera,{roughness:.6,metalness:.15}),portone:facciata(X.portone,{roughness:.6}),
    tettoPiano:facciata(X.tettoPiano,{roughness:.95}),tettoLamiera:facciata(X.tettoLamiera,{roughness:.55,metalness:.2}),coppi:facciata(X.coppi),
    cemento:facciata(X.cemento),liscio:std({}),metallo:std({roughness:.45,metalness:.35}),strisce:facciata(X.strisce),
    vetroTorre:std({color:0x9fd0d8,roughness:.15,metalness:.5,emissive:new THREE.Color(0,0,0)}),
    asfalto:facciata(X.asfalto,{roughness:.95,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
    strada:facciata(X.asfalto,{roughness:.95,polygonOffset:true,polygonOffsetFactor:-1.3,polygonOffsetUnits:-1.3}),
    segni:std({roughness:.8,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),
    rete:new THREE.MeshStandardMaterial({map:X.rete.map,alphaTest:0.5,side:THREE.DoubleSide,roughness:.7,metalness:.3}),
    spinato:new THREE.MeshStandardMaterial({map:X.spinato.map,alphaTest:0.5,side:THREE.DoubleSide,roughness:.6,metalness:.4}),
  };
  const conNotte=[M.caselle,M.malpensa,M.linate,M.genova,M.cuneo,M.vetroBasso,M.uffici,M.casa,M.parcheggio];   // solo quelli con l'immagine notturna
  // aerei e mezzi: istanze
  const matIst=std({roughness:.5,metalness:.1});
  const geoUnita=MOD.scatola(),geoAuto=MOD.auto();
  const texLuce=tela(64,64,(g)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.3,'rgba(255,255,255,.7)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);},false);

  const elenco=ELENCO.map(e=>costruisci(e));
  const tuttiRadar=elenco.flatMap(a=>a.radar);

  function costruisci(E){
    const {ap,d}=E, rnd=rng(ap.codice.charCodeAt(3)*977+13);
    const gr=new THREE.Group();gr.name='aeroporto '+ap.codice;
    const acc={};const A=k=>acc[k]||(acc[k]=new Acc());
    const P=(x,y)=>({x:ap.x+x/10,z:ap.z-y/10});
    // quota della mesh del terreno come T.meshH (stessi triangoli), ma con le quote dei nodi in memoria: è molto più veloce
    const nodi=new Map(),S=T.passoMesh;
    const hN=(i,j)=>{const k=i*100003+j;let v=nodi.get(k);if(v===undefined){v=T.terrainH(i*S,j*S);nodi.set(k,v);}return v;};
    const H=(x,z)=>{
      if(!S) return T.meshH(x,z);
      const gx=Math.floor(x/S),gz=Math.floor(z/S),fx=x/S-gx,fz=z/S-gz,h00=hN(gx,gz),h11=hN(gx+1,gz+1);
      if(fz>fx){const h01=hN(gx,gz+1);return h00+(h11-h01)*fx+(h01-h00)*fz;}
      const h10=hN(gx+1,gz);return h00+(h10-h00)*fx+(h11-h10)*fz;
    };
    const col=new THREE.Color();
    const terminali=[],auto=[];   // auto: posti occupati nei parcheggi (anche sui tetti dei multipiano)
    const stileTerm=d.stile in M?d.stile:'genova';
    const insegne=INSEGNE[ap.codice]||{};
    let piuGrande=null;for(const e of d.edifici)if(e.t==='terminal'){const a=Math.abs(areaPoli(anello(ap,e.p)));if(!piuGrande||a>piuGrande.a)piuGrande={e,a};}
    // lato verso la pista: davanti al lato (25 o 50 m) c'è un piazzale o una via di rullaggio
    const latoPista=(a,b,n)=>{const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      return !!rete&&[25,50].some(k=>rete.zona(mx+n.x*k,mz+n.z*k,0));};

    /* ===== edifici ===== */
    for(const e of d.edifici){
      let est=anello(ap,e.p);
      const buchi=(e.b||[]).map(b=>anello(ap,b));
      if(est.length<3) continue;
      let yb=Infinity;for(const p of est)yb=Math.min(yb,H(p.x,p.z));
      const top=yb+e.h, base=e.m?yb+e.m:yb-2.5;
      const ar=Math.abs(areaPoli(est));
      // colore (tinta) dell'edificio
      const tinte={uffici:[0xffffff,0xf3eee2,0xe9edf0,0xf0e6d2,0xdfe5ea],industriale:[0xffffff,0xece6d8,0xdde3e6,0xe8e2d0,0xd2d8dc],
        merci:[0xffffff,0xdfe6ec,0xe9e3d3],hangar:[0xffffff,0xe3ebf2,0xdfe4e0,0xf2efe6],casa:[0xffffff,0xf6e3c0,0xf0d6b4,0xeee8dc,0xf3dcc8],parcheggio:[0xffffff,0xe9e9e4]};
      const tl=tinte[e.t]||[0xffffff];
      col.setHex(e.c?parseInt(e.c.slice(1),16):tl[(rnd()*tl.length)|0]);
      const tinta=col.clone();
      if(e.t==='tettoia'){tettoia(est,buchi,top,yb,tinta);continue;}
      if(e.t==='terminal')terminali.push({est,top,yb});
      // facciata e fasce verticali
      let fasce,piega=null;
      if(e.t==='terminal'){
        const gf=Math.min(5,e.h*0.3);
        fasce=[[base,yb+gf,'vetroBasso',X.vetroBasso.th,yb],[yb+gf,top-1.3,stileTerm,X[stileTerm].th,yb+gf],[top-1.3,top+0.9,'liscio',4,yb]];
        const vp=VETRATA_PIEGATA[ap.codice];
        if(vp&&!buchi.length)piega=piegaVetrata(est,vp,yb+gf,top-1.3);
        const testo=insegne[e.n]||(piuGrande&&piuGrande.e===e?insegne['*']:null);
        if(testo)insegna(est,testo,top+0.9,e.h);
      }else if(e.t==='uffici')fasce=[[base,top,'uffici',X.uffici.th,yb],[top,top+0.7,'liscio',4,yb]];
      else if(e.t==='casa')fasce=[[base,top,'casa',X.casa.th,yb]];
      else if(e.t==='parcheggio')fasce=[[base,top,'parcheggio',X.parcheggio.th,yb],[top,top+1.1,'cemento',4,yb]];
      else if(e.t==='hangar')fasce=[[base,top,'lamiera',X.lamiera.th,yb]];
      else if(e.t==='merci')fasce=[[base,top,'pannelli',X.pannelli.th,top-X.pannelli.th]];
      else fasce=ar<150?[[base,top,'cemento',4,yb]]:[[base,top,'pannelli',X.pannelli.th,top-X.pannelli.th]];
      const piano=!e.r;
      if(!piano&&e.t==='uffici')fasce=[[base,top,'uffici',X.uffici.th,yb]];
      // hangar: portone sul lato verso il piazzale
      let porta=null;
      const R=rettangolo(est);
      if(e.t==='hangar'&&rete){
        let best=null;
        // per ogni lato: normale verso fuori, distanza dal centro, lunghezza del lato
        for(const [n,half,lung] of [[R.u,R.L/2,R.W],[{x:-R.u.x,z:-R.u.z},R.L/2,R.W],[R.v,R.W/2,R.L],[{x:-R.v.x,z:-R.v.z},R.W/2,R.L]]){
          // il lato più vicino a un piazzale o a una via; a parità di distanza quello lungo (i grandi hangar si aprono sul lato lungo)
          for(let k=8;k<=80;k+=8){const x=R.x+n.x*(half+k),z=R.z+n.z*(half+k);if(rete.zona(x,z,0)){const v=k-lung*0.1;if(!best||v<best.v)best={n,k,half,v};break;}}
        }
        if(best)porta={n:best.n,c:{x:R.x+best.n.x*best.half,z:R.z+best.n.z*best.half},h:Math.min(e.h-1.5,Math.max(5,e.h*0.78))};
      }
      for(const r of [est,...buchi])pareti(r,r!==est,fasce,tinta,porta,r===est?piega:null);
      // tetto
      if(piano){
        const mt=e.t==='parcheggio'?'asfalto':'tettoPiano';
        coperchio(piega?est.map((p,i)=>({x:p.x+piega.off[i].x,z:p.z+piega.off[i].z})):est,buchi,top,mt,tinta.clone().lerp(BIANCO,0.6));
        if(e.t!=='casa'&&e.t!=='parcheggio'&&ar>300)impianti(est,top,ar,e.t==='terminal');
        if(e.t==='parcheggio')autoSuPoligono(est,top);
      }else tettoForma(R,top,e.r,e.t,tinta);
    }

    /* vetrata piegata: per ogni vertice lo spostamento in cima (verso fuori, perpendicolare ai lati lato pista);
       sotto y0 la parete è dritta, fra y0 e y1 si piega (spostamento * t^curva), sopra resta tutto spostato */
    function piegaVetrata(r,vp,y0,y1){
      const s=areaPoli(r)>0?1:-1,N=r.length,nl=[];
      for(let i=0;i<N;i++){const a=r[i],b=r[(i+1)%N],L=Math.hypot(b.x-a.x,b.z-a.z)||1,n={x:(b.z-a.z)/L*s,z:-(b.x-a.x)/L*s};
        nl.push(L>0.3&&latoPista(a,b,n)?n:null);}
      if(!nl.some(Boolean)) return null;
      const off=[];
      for(let i=0;i<N;i++){
        const n1=nl[(i-1+N)%N],n2=nl[i];
        if(!n1&&!n2){off.push({x:0,z:0});continue;}
        if(!n1||!n2){const n=n1||n2;off.push({x:n.x*vp.sporge,z:n.z*vp.sporge});continue;}
        // fra due lati piegati: spigolo "a mitra" (limitato negli angoli stretti)
        let mx=n1.x+n2.x,mz=n1.z+n2.z;const ml=Math.hypot(mx,mz)||1;mx/=ml;mz/=ml;
        const k=vp.sporge/Math.max(0.5,mx*n2.x+mz*n2.z);off.push({x:mx*k,z:mz*k});
      }
      return {off,y0,y1,curva:vp.curva,lati:nl};
    }
    // insegna col nome: lettere in piedi sul tetto, appena dentro il bordo, sul lato verso la pista più lungo e su quello verso la strada
    function insegna(r,testo,y0,h){
      const s=areaPoli(r)>0?1:-1,N=r.length,tratti=[];
      // tratti di lati consecutivi quasi allineati (le facciate curve sono fatte di tanti lati corti)
      let cur=null;
      for(let i=0;i<N;i++){
        const a=r[i],b=r[(i+1)%N],L=Math.hypot(b.x-a.x,b.z-a.z);if(L<0.05) continue;
        const ang=Math.atan2(b.z-a.z,b.x-a.x);
        if(cur&&Math.abs(Math.atan2(Math.sin(ang-cur.ang0),Math.cos(ang-cur.ang0)))<0.35){cur.j=i;cur.L+=L;}
        else{cur={i0:i,j:i,ang0:ang,L};tratti.push(cur);}
      }
      // verso la pista se lo è la maggior parte dei lati del tratto (sulle facciate curve la corda può passare dentro l'edificio)
      const latoDi=t=>{const a=r[t.i0],b=r[(t.j+1)%N],L=Math.hypot(b.x-a.x,b.z-a.z)||1,n={x:(b.z-a.z)/L*s,z:-(b.x-a.x)/L*s};
        let si=0,tot=0;for(let i=t.i0;i<=t.j;i++){const p=r[i],q=r[(i+1)%N],l=Math.hypot(q.x-p.x,q.z-p.z)||1;
          tot+=l;if(latoPista(p,q,{x:(q.z-p.z)/l*s,z:-(q.x-p.x)/l*s}))si+=l;}
        return {a,b,L,n,pista:si>tot*0.4};};
      const lati=tratti.map(t=>Object.assign(t,latoDi(t))).filter(t=>t.L>20);
      const scelti=[];
      for(const pista of [true,false]){const l=lati.filter(t=>t.pista===pista).sort((p,q)=>q.L-p.L)[0];if(l)scelti.push(l);}
      if(!scelti.length) return;
      const hl=Math.max(2.2,Math.min(3.4,h*0.17));
      const t=scritta(testo);
      for(const l of scelti){
        // il punto del tratto più rientrato (facciata curva): le lettere stanno 1,5 m più dentro, sopra il tetto
        let dentroMin=0;for(let i=l.i0;i<=l.j+1;i++){const p=r[i%N];dentroMin=Math.min(dentroMin,(p.x-l.a.x)*l.n.x+(p.z-l.a.z)*l.n.z);}
        const larga=Math.min(l.L*0.75,hl*t.rapporto),alta=larga/t.rapporto,d=dentroMin-1.5;
        // ux, uz: la destra di chi guarda l'edificio da fuori (guarda verso -n)
        const ux=l.n.z,uz=-l.n.x,cx=(l.a.x+l.b.x)/2+l.n.x*d,cz=(l.a.z+l.b.z)/2+l.n.z*d,yc=y0+0.3+alta/2;
        const P=(u,v)=>[cx+ux*u,yc+v,cz+uz*u];
        A(t.k).quad(P(-larga/2,-alta/2),P(larga/2,-alta/2),P(larga/2,alta/2),P(-larga/2,alta/2),[0,0],[1,0],[1,1],[0,1],BIANCO,[l.n.x,0,l.n.z]);
        // dietro le lettere: due travi del sostegno
        for(const k of [-0.3,0.3])A('metallo').geo(new THREE.BoxGeometry(0.15,alta*0.8+0.3,0.15),matrice(cx+ux*larga*k-l.n.x*0.3,y0+(alta*0.8+0.3)/2,cz+uz*larga*k-l.n.z*0.3),col.setHex(0x8a9096));
      }
    }
    // immagine della scritta (lettere blu su trasparente; di notte accese): un materiale per scritta
    function scritta(testo){
      const k='insegna:'+testo;
      if(M[k]) return M[k].info;
      const c=document.createElement('canvas'),g=c.getContext('2d'),F='bold 120px Arial, Helvetica, sans-serif';
      g.font=F;const w=Math.ceil(g.measureText(testo).width)+40;c.width=Math.min(4096,w);c.height=150;
      g.font=F;g.textBaseline='middle';g.textAlign='center';g.fillStyle='#1d3f86';g.fillText(testo,c.width/2,80,c.width-20);
      const tex=new THREE.CanvasTexture(c);tex.anisotropy=ANISO;
      M[k]=new THREE.MeshStandardMaterial({map:tex,transparent:true,alphaTest:0.3,roughness:.5,emissive:new THREE.Color(0,0,0),emissiveMap:tex,
        polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
      M[k].info={k,rapporto:c.width/c.height};conNotte.push(M[k]);
      return M[k].info;
    }

    /* pareti di un contorno: fasce = [[y0, y1, materiale, altezza del modulo, y di riferimento della texture]];
       piega (facoltativa): vetrata piegata in fuori (piegaVetrata) */
    function pareti(r,buco,fasce,tinta,porta,piega){
      const s=areaPoli(r)>0?1:-1;   // verso del giro: per le normali verso fuori
      let cum=0;
      for(let i=0;i<r.length;i++){
        const a=r[i],b=r[(i+1)%r.length],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);if(L<0.05) continue;
        let nx=dz/L*s,nz=-dx/L*s;if(buco){nx=-nx;nz=-nz;}   // giro antiorario (area > 0): fuori = (dz, -dx)
        // porta dell'hangar: lato parallelo al lato del rettangolo scelto e vicino ad esso
        const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
        const suPorta=porta&&nx*porta.n.x+nz*porta.n.z>0.9&&Math.abs((mx-porta.c.x)*porta.n.x+(mz-porta.c.z)*porta.n.z)<10;   // anche se la parete è un po' rientrata
        const oa=piega&&piega.off[i],ob=piega&&piega.off[(i+1)%r.length];
        if(piega&&(oa.x||oa.z||ob.x||ob.z)){
          // parete piegata: fasce divise in strisce orizzontali, ognuna spostata secondo la sua quota
          const f=y=>y<=piega.y0?0:y>=piega.y1?1:Math.pow((y-piega.y0)/(piega.y1-piega.y0),piega.curva);
          for(const [y0,y1,m,th,yr] of fasce){
            const tw=(X[m]&&X[m].tw)||4,u0=cum/tw,u1=(cum+L)/tw,n=y1>piega.y0&&y0<piega.y1?6:1;
            for(let k=0;k<n;k++){
              const za=y0+(y1-y0)*k/n,zb=y0+(y1-y0)*(k+1)/n,fa=f(za),fb=f(zb);
              A(m).quad([a.x+oa.x*fa,za,a.z+oa.z*fa],[b.x+ob.x*fa,za,b.z+ob.z*fa],[b.x+ob.x*fb,zb,b.z+ob.z*fb],[a.x+oa.x*fb,zb,a.z+oa.z*fb],
                [u0,(za-yr)/th],[u1,(za-yr)/th],[u1,(zb-yr)/th],[u0,(zb-yr)/th],tinta,[nx,0,nz]);
            }
          }
          const ult=fasce[fasce.length-1];   // parapetto, faccia interna
          A(ult[2]).quad([a.x+oa.x,ult[0],a.z+oa.z],[b.x+ob.x,ult[0],b.z+ob.z],[b.x+ob.x,ult[1],b.z+ob.z],[a.x+oa.x,ult[1],a.z+oa.z],[0,0],[1,0],[1,1],[0,1],tinta,[-nx,0,-nz]);
          cum+=L;continue;
        }
        for(const [y0,y1,m,th,yr] of fasce){
          const tw=(X[m]&&X[m].tw)||4;
          const segmenti=suPorta&&m==='lamiera'?[[y0,porta.h+y0+2.5,'portone'],[porta.h+y0+2.5,y1,m]]:[[y0,y1,m]];
          for(const [z0,z1,mm] of segmenti){
            if(z1<=z0+0.01) continue;
            const u0=cum/((X[mm]&&X[mm].tw)||tw),u1=(cum+L)/((X[mm]&&X[mm].tw)||tw);
            let v0,v1;
            if(mm==='portone'){v0=(z0-(y0+2.5))/porta.h;v1=1;v0=Math.max(v0,0);}   // il portone si stira su tutta l'altezza
            else{v0=(z0-yr)/th;v1=(z1-yr)/th;}
            A(mm).quad([a.x,z0,a.z],[b.x,z0,b.z],[b.x,z1,b.z],[a.x,z1,a.z],[u0,v0],[u1,v0],[u1,v1],[u0,v1],tinta,[nx,0,nz]);
          }
        }
        // parapetto (faccia interna) sui tetti piani
        const ult=fasce[fasce.length-1];
        if(ult[2]==='liscio'||ult[2]==='cemento')A(ult[2]).quad([a.x,ult[0],a.z],[b.x,ult[0],b.z],[b.x,ult[1],b.z],[a.x,ult[1],a.z],[0,0],[1,0],[1,1],[0,1],tinta,[-nx,0,-nz]);
        cum+=L;
      }
    }
    // poligono orizzontale (tetti, tettoie): coordinate di texture dal mondo
    function coperchio(est,buchi,y,m,tinta,giu=false){
      const v2=r=>r.map(p=>new THREE.Vector2(p.x,p.z));
      let tris;try{tris=THREE.ShapeUtils.triangulateShape(v2(est),buchi.map(v2));}catch(err){return;}
      const tutti=est.concat(...buchi),tw=(X[m]&&X[m].tw)||8;
      for(const [i,j,k] of tris){
        const a=tutti[i],b=tutti[j],c=tutti[k];
        A(m).tri([a.x,y,a.z],[b.x,y,b.z],[c.x,y,c.z],[a.x/tw,a.z/tw],[b.x/tw,b.z/tw],[c.x/tw,c.z/tw],tinta,[0,giu?-1:1,0]);
      }
    }
    // impianti sui tetti piani (macchine del condizionamento, lucernari)
    function impianti(est,y,ar,terminal){
      const n=Math.min(40,Math.max(2,Math.round(ar/700)));
      let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const p of est){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);}
      const R=rettangolo(est),ry=-Math.atan2(R.u.z,R.u.x);
      for(let k=0,t=0;k<n&&t<n*8;t++){
        const x=x0+rnd()*(x1-x0),z=z0+rnd()*(z1-z0);if(!dentro(est,x,z)) continue;
        const w=2+rnd()*5,dd=2+rnd()*4,h=1+rnd()*1.8;
        if(!dentro(est,x+R.u.x*w,z+R.u.z*w)||!dentro(est,x-R.u.x*w,z-R.u.z*w)) continue;
        k++;
        if(terminal&&rnd()<0.35)A('vetroTorre').geo(new THREE.BoxGeometry(w*2,0.6,dd),matrice(x,y+0.3,z,ry),BIANCO);   // lucernario
        else A('liscio').geo(new THREE.BoxGeometry(w,h,dd),matrice(x,y+h/2,z,ry),col.setHex(rnd()<0.5?0xc8cbcc:0xb3b6b8));
      }
    }
    // tetti a falde e a volta sopra il rettangolo dell'edificio
    function tettoForma(R,y,forma,tipo,tinta){
      const casa=tipo==='casa',o=casa?0.45:0.3,hl=R.L/2+o,hw=R.W/2+o;
      const Pt=(u,v,h)=>[R.x+R.u.x*u+R.v.x*v,h,R.z+R.u.z*u+R.v.z*v];
      const mt=casa?'coppi':'tettoLamiera',mw=casa?'casa':'lamiera',tw=4;
      const ct=casa?BIANCO:tinta.clone().lerp(BIANCO,0.4);
      if(forma==='volta'){
        const rise=R.W*0.2,N=12,prof=[];
        for(let i=0;i<=N;i++){const v=-hw+2*hw*i/N,t=v/hw;prof.push([v,y+rise*(1-t*t)]);}
        for(let i=0;i<N;i++){
          const [v0,y0]=prof[i],[v1,y1]=prof[i+1];
          A(mt).quad(Pt(-hl,v0,y0),Pt(hl,v0,y0),Pt(hl,v1,y1),Pt(-hl,v1,y1),[0,v0/tw],[R.L/tw,v0/tw],[R.L/tw,v1/tw],[0,v1/tw],ct,[0,1,0]);
          for(const s of [-1,1]){   // testate (a ventaglio)
            const u=s*R.L/2;
            A(mw).tri(Pt(u,v0*R.W/2/hw,y0),Pt(u,v1*R.W/2/hw,y1),Pt(u,0,y),[v0/tw,(y0-y)/tw],[v1/tw,(y1-y)/tw],[0,0],tinta,[R.u.x*s,0,R.u.z*s]);
          }
        }
      }else{
        const rh=Math.min(casa?R.W*0.5*0.55:R.W*0.5*0.2,casa?4:8);
        for(const s of [-1,1]){
          A(mt).quad(Pt(-hl,s*hw,y),Pt(hl,s*hw,y),Pt(hl,0,y+rh),Pt(-hl,0,y+rh),[0,0],[R.L/tw,0],[R.L/tw,hw/tw],[0,hw/tw],ct,[R.v.x*s,1,R.v.z*s]);
          A(mt).quad(Pt(-hl,s*hw,y-0.15),Pt(hl,s*hw,y-0.15),Pt(hl,s*hw,y),Pt(-hl,s*hw,y),[0,0],[1,0],[1,0.05],[0,0.05],ct,[R.v.x*s,0,R.v.z*s]);
          const u=s*R.L/2;
          A(mw).tri(Pt(u,-R.W/2,y),Pt(u,R.W/2,y),Pt(u,0,y+rh*(R.W/2)/hw),[0,0],[R.W/tw,0],[R.W/2/tw,rh/tw],tinta,[R.u.x*s,0,R.u.z*s]);
        }
      }
    }
    // tettoie (pensiline, coperture): lastra su colonne
    function tettoia(est,buchi,top,yb,tinta){
      const sp=0.7;
      coperchio(est,buchi,top,'cemento',tinta);coperchio(est,buchi,top-sp,'cemento',tinta.clone().multiplyScalar(0.8),true);
      const s=areaPoli(est)>0?1:-1;
      let resto=2;
      for(let i=0;i<est.length;i++){
        const a=est[i],b=est[(i+1)%est.length],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);if(L<0.05) continue;
        const nx=dz/L*s,nz=-dx/L*s;
        A('cemento').quad([a.x,top-sp,a.z],[b.x,top-sp,b.z],[b.x,top,b.z],[a.x,top,a.z],[0,0],[L/4,0],[L/4,sp/4],[0,sp/4],tinta,[nx,0,nz]);
        for(let t=resto;t<L;t+=14){const x=a.x+dx*t/L-nx*1.2,z=a.z+dz*t/L-nz*1.2,h0=H(x,z)-0.5,hh=top-sp-h0;
          if(hh>0.5&&dentro(est,x,z))A('metallo').geo(new THREE.CylinderGeometry(0.22,0.22,hh,8),matrice(x,h0+hh/2,z),col.setHex(0xd8dcdf));}
        resto=((resto-L)%14+14)%14;
      }
    }

    /* ===== torre di controllo ===== */
    if(d.torre){
      const t=d.torre,{x,z}=P(t.x,t.y),y=H(x,z),h=t.h;
      const bianco=new THREE.Color(0xf1f1ee),grigio=new THREE.Color(0xc9ccce),blu=new THREE.Color(0x2c5aa0);
      const vetro=(g,m)=>A('vetroTorre').geo(g,m,BIANCO);
      if(t.forma==='malpensa'){   // fusto bianco con striscia blu, "piattino", blocco tecnico, cabina a due piani, radome
        A('liscio').geo(new THREE.CylinderGeometry(3.3,3.5,h*0.78,20),matrice(x,y+h*0.39,z),bianco);
        A('liscio').geo(new THREE.BoxGeometry(1.4,h*0.78,1.4),matrice(x+3.1,y+h*0.39,z),blu);
        A('liscio').geo(new THREE.CylinderGeometry(9.5,6,1.4,24),matrice(x,y+h*0.38,z),bianco);
        vetro(new THREE.CylinderGeometry(9.2,9.5,1.4,24,1,true),matrice(x,y+h*0.38+1.4,z));
        A('liscio').geo(new THREE.CylinderGeometry(9.6,9.2,0.6,24),matrice(x,y+h*0.38+2.4,z),bianco);
        A('uffici').geo(new THREE.BoxGeometry(12,h*0.17,9),matrice(x-1,y+h*0.6,z),new THREE.Color(0xeee6d6),0.3);
        A('liscio').geo(new THREE.CylinderGeometry(4.6,6.5,2.5,20),matrice(x,y+h*0.76,z),bianco);
        for(const [r,dy] of [[7.6,0.79],[7.9,0.86]]){
          vetro(new THREE.CylinderGeometry(r,r-0.6,h*0.05,24,1,true),matrice(x,y+h*dy+h*0.025,z));
          A('liscio').geo(new THREE.CylinderGeometry(r+0.4,r,0.9,24),matrice(x,y+h*(dy+0.05)+0.45,z),bianco);
        }
        A('liscio').geo(new THREE.CylinderGeometry(1.2,1.6,2.4,10),matrice(x,y+h*0.92+1.2,z),grigio);
        A('liscio').geo(new THREE.SphereGeometry(4,18,12),matrice(x,y+h*0.95+2.4,z),new THREE.Color(0xf0eee6));
        for(let k=0;k<6;k++){const a=k*Math.PI/3;A('metallo').geo(new THREE.CylinderGeometry(0.06,0.06,5,4),matrice(x+Math.cos(a)*7,y+h*0.91+2.5,z+Math.sin(a)*7),grigio);}
      }else if(t.forma==='quadrata'){   // Linate: torre bianca squadrata, cabina vetrata e radome
        A('uffici').geo(new THREE.BoxGeometry(7,h-8,7),matrice(x,y+(h-8)/2,z),bianco,0.4);
        A('liscio').geo(new THREE.BoxGeometry(9.5,0.8,9.5),matrice(x,y+h-8,z),bianco);
        vetro(new THREE.BoxGeometry(9,3.4,9),matrice(x,y+h-7.6+1.7,z));
        A('liscio').geo(new THREE.BoxGeometry(10,0.8,10),matrice(x,y+h-3.8,z),bianco);
        A('liscio').geo(new THREE.CylinderGeometry(1.2,1.4,2.2,10),matrice(x,y+h-3.4+1.1,z),grigio);
        A('liscio').geo(new THREE.SphereGeometry(3.4,18,12),matrice(x,y+h-1.2+2.2,z),new THREE.Color(0xf4f2ec));
        A('cemento').geo(new THREE.BoxGeometry(22,6,12),matrice(x+10,y+3,z+4),bianco);
      }else if(t.forma==='traliccio'){   // Cuneo: torretta a traliccio con la cabina
        for(const sx of [-1,1])for(const sz of [-1,1])A('metallo').geo(new THREE.BoxGeometry(0.25,h-3,0.25),matrice(x+sx*1.6,y+(h-3)/2,z+sz*1.6),grigio);
        for(let k=2;k<h-3;k+=2.5)A('metallo').geo(new THREE.BoxGeometry(3.4,0.15,3.4),matrice(x,y+k,z),grigio);
        A('liscio').geo(new THREE.BoxGeometry(4.6,0.4,4.6),matrice(x,y+h-3,z),bianco);
        vetro(new THREE.BoxGeometry(4.2,2.4,4.2),matrice(x,y+h-1.6,z));
        A('liscio').geo(new THREE.BoxGeometry(4.8,0.4,4.8),matrice(x,y+h-0.2,z),bianco);
      }else{   // fusto tondo e cabina ottagonale (Caselle, Genova)
        A('cemento').geo(new THREE.BoxGeometry(16,7,10),matrice(x,y+3.5,z+6),bianco);
        A('cemento').geo(new THREE.CylinderGeometry(2.8,3.2,h-6,16),matrice(x,y+(h-6)/2,z),bianco,0.5);
        A('liscio').geo(new THREE.CylinderGeometry(4.6,3,1.6,8),matrice(x,y+h-6.6,z),bianco);
        vetro(new THREE.CylinderGeometry(5,4.4,3.6,8,1,true),matrice(x,y+h-5.8+1.8,z));
        A('liscio').geo(new THREE.CylinderGeometry(5.6,5,0.7,8),matrice(x,y+h-2.2+0.35,z),bianco);
        A('liscio').geo(new THREE.CylinderGeometry(2,2,1.4,8),matrice(x,y+h-1.5+0.7,z),grigio);
        for(const a of [0.4,2.5,4.3])A('metallo').geo(new THREE.CylinderGeometry(0.05,0.05,4,4),matrice(x+Math.cos(a)*1.4,y+h+1.6,z+Math.sin(a)*1.4),grigio);
      }
    }

    /* ===== radar ===== */
    const radar=[];
    for(const r of d.radar){
      const {x,z}=P(r.x,r.y),y=H(x,z),grigio=new THREE.Color(0xb4b8bb);
      if(r.f==='cupola'){A('cemento').geo(new THREE.CylinderGeometry(2.5,3,r.h-4,10),matrice(x,y+(r.h-4)/2,z),BIANCO);
        A('liscio').geo(new THREE.SphereGeometry(4,16,10),matrice(x,y+r.h-1,z),new THREE.Color(0xf2f1ec));continue;}
      for(const sx of [-1,1])for(const sz of [-1,1])A('metallo').geo(new THREE.BoxGeometry(0.3,r.h,0.3),matrice(x+sx*1.8,y+r.h/2,z+sz*1.8),grigio);
      for(let k=3;k<r.h;k+=3)A('metallo').geo(new THREE.BoxGeometry(3.9,0.18,3.9),matrice(x,y+k,z),grigio);
      A('liscio').geo(new THREE.BoxGeometry(4.4,0.5,4.4),matrice(x,y+r.h,z),grigio);
      // antenna che gira: oggetto a parte
      const ant=new THREE.Group();ant.position.set(x,y+r.h+1.2,z);
      const pa=new THREE.Mesh(new THREE.BoxGeometry(7.5,1.8,0.5),M.liscio.clone());pa.material.vertexColors=false;pa.material.color.setHex(0xe8e8e4);pa.position.z=0.6;ant.add(pa);
      const pe=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1.2,8),pa.material);pe.position.y=-0.6;ant.add(pe);
      gr.add(ant);radar.push(ant);
    }

    /* ===== serbatoi ===== */
    for(const s of d.serbatoi){
      const {x,z}=P(s.x,s.y),y=H(x,z);
      A('cemento').geo(new THREE.CylinderGeometry(s.r,s.r,s.h+1,Math.max(12,Math.min(28,s.r*3|0))),matrice(x,y+s.h/2-0.5,z),col.setHex(rnd()<0.6?0xf2f2ee:0xd9e0d2),0.5);
      A('liscio').geo(new THREE.ConeGeometry(s.r,s.r*0.18,24),matrice(x,y+s.h+s.r*0.09,z),new THREE.Color(0xc6c9c9));
    }

    /* ===== torri faro ===== */
    const luciFari=[],pozze=[];
    for(let i=0;i<d.fari.length;i+=2){
      const {x,z}=P(d.fari[i],d.fari[i+1]),y=H(x,z),h=24+((i*7)%5);
      A('strisce').geo(new THREE.CylinderGeometry(0.28,0.42,h,8,1,true),matrice(x,y+h/2,z),BIANCO);
      A('metallo').geo(new THREE.BoxGeometry(3.2,0.25,3.2),matrice(x,y+h,z),new THREE.Color(0x5d6266));
      for(let k=0;k<4;k++){const a=k*Math.PI/2+0.4,lx=x+Math.cos(a)*1.2,lz=z+Math.sin(a)*1.2;
        A('metallo').geo(new THREE.BoxGeometry(0.9,0.6,0.5),matrice(lx,y+h+0.5,lz,-a),new THREE.Color(0x4a4f53));
        luciFari.push(lx,y+h+0.3,lz);}
      pozze.push(x,z);
    }

    /* ===== pontili d'imbarco ===== */
    const pontiliFatti=[];
    const distTerminal=(x,z)=>{let best=Infinity;for(const t of terminali)for(let i=0;i<t.est.length;i++)best=Math.min(best,distSeg(x,z,t.est[i],t.est[(i+1)%t.est.length]));return best;};
    for(const p of d.pontili){
      let a=P(p[0],p[1]),b=P(p[p.length-2],p[p.length-1]);
      if(distTerminal(b.x,b.z)<distTerminal(a.x,a.z))[a,b]=[b,a];
      pontile(a,b);pontiliFatti.push(b);
    }
    function pontile(a,b){
      const y0=H(a.x,a.z),dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);if(L<4) return;
      const ux=dx/L,uz=dz/L,ry=Math.atan2(-dz,dx),grigio=new THREE.Color(0xd3d7da),scuro=new THREE.Color(0x9da3a8);
      // rotonda vicino al terminal, tunnel in due pezzi telescopici in leggera discesa, cabina, gamba con le ruote
      A('metallo').geo(new THREE.CylinderGeometry(2.1,2.1,3.4,12),matrice(a.x+ux*2,y0+4.4+1.7,a.z+uz*2),grigio);
      A('metallo').geo(new THREE.CylinderGeometry(0.6,0.6,4.4,8),matrice(a.x+ux*2,y0+2.2,a.z+uz*2),scuro);
      const tunnel=(s0,s1,w,h,yA,yB,c)=>{
        const xm=a.x+ux*(s0+s1)/2,zm=a.z+uz*(s0+s1)/2,len=s1-s0,pend=Math.atan2(yA-yB,len);
        A('metallo').geo(new THREE.BoxGeometry(len,h,w),matrice(xm,y0+(yA+yB)/2+h/2,zm,ry,1,1,1,0).multiply(new THREE.Matrix4().makeRotationZ(-pend)),c);
      };
      const f=Math.max(6,L-3);
      tunnel(4,4+(f-4)*0.58,2.9,3.1,4.6,4.25,grigio);
      tunnel(4+(f-4)*0.5,f,2.6,2.8,4.3,3.95,grigio);
      A('metallo').geo(new THREE.BoxGeometry(3.6,3.3,3.8),matrice(a.x+ux*(f+1.5),y0+3.85+1.65,a.z+uz*(f+1.5),ry),scuro);
      const s=4+(f-4)*0.72,gx=a.x+ux*s,gz=a.z+uz*s;
      for(const k of [-1,1])A('metallo').geo(new THREE.BoxGeometry(0.35,4,0.35),matrice(gx-uz*k*0.9,y0+2.1,gz+ux*k*0.9),scuro);
      A('metallo').geo(new THREE.BoxGeometry(1.2,0.9,2.8),matrice(gx,y0+0.45,gz,ry+Math.PI/2),new THREE.Color(0x3a3d40));
    }

    /* ===== piazzole: segnaletica, numeri, aerei e mezzi ===== */
    const etichette=[],aerei=[],mezzi=[],libere=[];
    const partenza=rete&&rete.di(ap)?rete.di(ap).parcheggio:null;
    let nEt=0;
    const canvasEt=document.createElement('canvas');canvasEt.width=1024;canvasEt.height=1024;
    const ge=canvasEt.getContext('2d');
    const linea=(pts,w,c,y=0.13)=>{
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1],b=pts[i],L=Math.hypot(b.x-a.x,b.z-a.z);if(L<0.05) continue;
        const nx=-(b.z-a.z)/L*w/2,nz=(b.x-a.x)/L*w/2,n=Math.max(1,Math.ceil(L/12));
        for(let k=0;k<n;k++){
          const t0=k/n,t1=(k+1)/n,x0=a.x+(b.x-a.x)*t0,z0=a.z+(b.z-a.z)*t0,x1=a.x+(b.x-a.x)*t1,z1=a.z+(b.z-a.z)*t1;
          const p=(x,z)=>[x,H(x,z)+y,z];
          A('segni').quad(p(x0+nx,z0+nz),p(x0-nx,z0-nz),p(x1-nx,z1-nz),p(x1+nx,z1+nz),[0,0],[0,0],[0,0],[0,0],c,[0,1,0]);
        }
      }
    };
    for(const s of d.piazzole){
      const nose=P(s.x,s.y),h=s.d*D2R,fx=Math.sin(h),fz=-Math.cos(h);   // avanti (verso il muso)
      let ingresso,lin;   // lin: la linea gialla dall'ingresso al punto di arresto
      if(s.l){const pts=anello(ap,s.l);linea(pts,0.3,giallo);ingresso=pts[0];lin=pts;}
      else{
        const pts=anello(ap,s.a);linea(pts.concat([pts[0]]),0.25,rosso);
        const c=P(s.x,s.y);ingresso={x:c.x-fx*s.s*0.6,z:c.z-fz*s.s*0.6};
        nose.x=c.x+fx*s.s*0.4;nose.z=c.z+fz*s.s*0.4;
        linea([ingresso,nose],0.3,giallo);lin=[ingresso,{x:nose.x,z:nose.z}];
      }
      // barra di arresto
      linea([{x:nose.x-fz*2,z:nose.z+fx*2},{x:nose.x+fz*2,z:nose.z-fx*2}],0.5,giallo);
      // numero della piazzola (giallo su nero) all'ingresso
      if(s.r&&nEt<128){
        const cx=(nEt%8)*128,cy=Math.floor(nEt/8)*64;nEt++;
        ge.fillStyle='#161616';ge.fillRect(cx+2,cy+2,124,60);
        ge.fillStyle='#f2c200';ge.font='bold 46px Arial, Helvetica, sans-serif';ge.textAlign='center';ge.textBaseline='middle';
        const k=Math.min(1,112/ge.measureText(s.r).width);ge.save();ge.translate(cx+64,cy+34);ge.scale(k,1);ge.fillText(s.r,0,0);ge.restore();
        let ix=ingresso.x,iz=ingresso.z,dx=nose.x-ix,dz=nose.z-iz,dl=Math.hypot(dx,dz)||1;
        dx/=dl;dz/=dl;ix+=dx*Math.min(8,dl*0.3);iz+=dz*Math.min(8,dl*0.3);
        etichette.push({x:ix,z:iz,dx,dz,u0:cx/1024,v0:1-(cy+64)/1024,u1:(cx+128)/1024,v1:1-cy/1024});
      }
      // aereo parcheggiato (non sulla piazzola dove parte il giocatore)
      const tr=TRAFFICO[ap.codice]||{pieno:0.6,linea:0.8};
      if(s.s<9||(partenza&&Math.hypot(nose.x-partenza.x,nose.z-partenza.z)<70)||rnd()>tr.pieno){
        if(s.s>=9&&s.r)libere.push({ref:s.r,ingresso,linea:lin,s:s.s});   // piazzola libera: ci si può parcheggiare
        continue;
      }
      let tipo=s.s<17?'turismo':s.s<27?'regionale':(s.s>=44&&ap.codice==='LIMC')?'lungo':'medio';
      if(tipo!=='turismo'&&rnd()>tr.linea)tipo='turismo';
      const sc=MOD.TIPI[tipo].scala;
      aerei.push({x:nose.x,z:nose.z,y:H(nose.x,nose.z),h,sc,tipo,liv:LIVREE[(rnd()*LIVREE.length)|0]});
      if(tipo!=='turismo')mezziAttorno(nose,fx,fz,sc,pontiliFatti.some(p=>Math.hypot(p.x-nose.x,p.z-nose.z)<30));
    }
    // pontili generati dove OSM non li ha (Linate, Genova): piazzole col muso a meno di 32 m dal terminal
    if(!d.pontili.length&&terminali.length)for(const a of aerei){
      if(a.tipo==='turismo') continue;
      const t=distTerminal(a.x,a.z);if(t>32) continue;
      const fx=Math.sin(a.h),fz=-Math.cos(a.h),porta={x:a.x-fx*6*a.sc-fz*2.3*a.sc,z:a.z-fz*6*a.sc+fx*2.3*a.sc};
      // punto sul terminal: verso il muso
      let best=null;for(const tt of terminali)for(let i=0;i<tt.est.length;i++){const p=tt.est[i],q=tt.est[(i+1)%tt.est.length];
        const dx=q.x-p.x,dz=q.z-p.z,l2=dx*dx+dz*dz||1,u=Math.max(0,Math.min(1,((porta.x-p.x)*dx+(porta.z-p.z)*dz)/l2)),x=p.x+u*dx,z=p.z+u*dz,dd=Math.hypot(x-porta.x,z-porta.z);
        if(!best||dd<best.d)best={x,z,d:dd};}
      if(best&&best.d>8&&best.d<45)pontile({x:best.x,z:best.z},porta);
    }
    function mezziAttorno(n,fx,fz,sc,conPontile){
      // destra dell'aereo (verso il muso): (-fz, fx)
      const rx=-fz,rz=fx,at=(av,dx,o)=>({x:n.x-fx*av*sc+rx*dx*sc,z:n.z-fz*av*sc+rz*dx*sc,ry:Math.atan2(-fz,fx)+(o||0)});
      const p=[];
      p.push(['trattore',at(30,7)],['carrello',at(33,7.5)],['carrello',at(36,8)]);
      p.push(['nastro',at(9,2.8,0.35)]);
      if(rnd()<0.5)p.push(['cisterna',at(15,11)]);
      if(rnd()<0.5)p.push(['catering',at(7,4.8,Math.PI/2)]);
      if(!conPontile){p.push(['scala',at(6,-3.4,-Math.PI/2)],['scala',at(30,-3.2,-Math.PI/2)]);if(rnd()<0.35)p.push(['bus',at(-8,-16,0.3)]);}
      for(const [t,q] of p)if(!rete||rete.zona(q.x,q.z,2))mezzi.push({t,x:q.x,z:q.z,ry:q.ry});   // solo su piazzali e vie, non sull'erba
    }
    // numeri delle piazzole: quadretti con la texture comune
    if(etichette.length){
      const tex=new THREE.CanvasTexture(canvasEt);tex.anisotropy=ANISO;
      const m=new THREE.MeshStandardMaterial({map:tex,roughness:.8,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
      const ac=new Acc();
      for(const e of etichette){
        const w=2.2,l=4.4,ux=e.dx,uz=e.dz,rx=-uz,rz=ux;   // il testo si legge arrivando lungo la linea
        const p=(a,b)=>{const x=e.x+rx*a+ux*b,z=e.z+rz*a+uz*b;return [x,H(x,z)+0.15,z];};
        ac.quad(p(-l/2,-w/2),p(l/2,-w/2),p(l/2,w/2),p(-l/2,w/2),[e.u0,e.v0],[e.u1,e.v0],[e.u1,e.v1],[e.u0,e.v1],BIANCO,[0,1,0]);
      }
      const o=ac.mesh(m);o.material.vertexColors=true;gr.add(o);
    }

    /* ===== parcheggi auto, strade di servizio ===== */
    for(const pk of d.parcheggi){
      const r=anello(ap,pk);
      suolo(r,'asfalto',0.07);
      autoSuPoligono(r,null);
    }
    for(const s of d.strade){
      const pts=anello(ap,s.p),hw=s.w/2;
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1],b=pts[i],L=Math.hypot(b.x-a.x,b.z-a.z);if(L<0.05) continue;
        const nx=-(b.z-a.z)/L*hw,nz=(b.x-a.x)/L*hw,n=Math.max(1,Math.ceil(L/15));
        for(let k=0;k<n;k++){
          const t0=k/n,t1=(k+1)/n,x0=a.x+(b.x-a.x)*t0,z0=a.z+(b.z-a.z)*t0,x1=a.x+(b.x-a.x)*t1,z1=a.z+(b.z-a.z)*t1;
          const p=(x,z)=>[x,H(x,z)+0.09,z];
          A('strada').quad(p(x0+nx,z0+nz),p(x0-nx,z0-nz),p(x1-nx,z1-nz),p(x1+nx,z1+nz),[x0/8,z0/8],[x0/8+0.5,z0/8],[x1/8+0.5,z1/8],[x1/8,z1/8],BIANCO,[0,1,0]);
        }
        // dischi agli angoli (niente buchi nelle curve)
        const y=H(b.x,b.z)+0.09;
        for(let k=0;k<8;k++){const a0=k/8*Math.PI*2,a1=(k+1)/8*Math.PI*2;
          A('strada').tri([b.x,y,b.z],[b.x+Math.cos(a0)*hw,y,b.z+Math.sin(a0)*hw],[b.x+Math.cos(a1)*hw,y,b.z+Math.sin(a1)*hw],[0,0],[0,0],[0,0],BIANCO,[0,1,0]);}
      }
    }
    // poligono sul terreno (triangoli divisi finché sono piccoli, così seguono il rilievo)
    function suolo(r,m,dy){
      let tris;try{tris=THREE.ShapeUtils.triangulateShape(r.map(p=>new THREE.Vector2(p.x,p.z)),[]);}catch(err){return;}
      const tw=X[m].tw;
      const dividi=(a,b,c,liv)=>{
        const l=Math.max(Math.hypot(a.x-b.x,a.z-b.z),Math.hypot(b.x-c.x,b.z-c.z),Math.hypot(c.x-a.x,c.z-a.z));
        if(l>25&&liv<6){const m1={x:(a.x+b.x)/2,z:(a.z+b.z)/2},m2={x:(b.x+c.x)/2,z:(b.z+c.z)/2},m3={x:(c.x+a.x)/2,z:(c.z+a.z)/2};
          dividi(a,m1,m3,liv+1);dividi(m1,b,m2,liv+1);dividi(m3,m2,c,liv+1);dividi(m1,m2,m3,liv+1);return;}
        const p=q=>[q.x,H(q.x,q.z)+dy,q.z];
        A(m).tri(p(a),p(b),p(c),[a.x/tw,a.z/tw],[b.x/tw,b.z/tw],[c.x/tw,c.z/tw],BIANCO,[0,1,0]);
      };
      for(const [i,j,k] of tris)dividi(r[i],r[j],r[k],0);
    }
    // posti auto a file (5 m di profondità, corsie da 6 m) lungo il lato lungo del parcheggio; y = quota fissa (tetti) o terreno
    function autoSuPoligono(r,yFisso){
      const R=rettangolo(r);if(R.W<9||R.L<8) return;
      const strisce=[];
      for(let v=-R.W/2+0.5,fila=0;v+5<=R.W/2;fila++){
        const vc=v+2.5;
        for(let u=-R.L/2+1;u+2.5<=R.L/2-1;u+=2.5){
          const c={x:R.x+R.u.x*(u+1.25)+R.v.x*vc,z:R.z+R.u.z*(u+1.25)+R.v.z*vc};
          const ok=[[-1.25,-2.5],[1.25,-2.5],[1.25,2.5],[-1.25,2.5]].every(([a,b])=>dentro(r,c.x+R.u.x*a+R.v.x*b,c.z+R.u.z*a+R.v.z*b));
          if(!ok) continue;
          strisce.push({x:R.x+R.u.x*u+R.v.x*vc,z:R.z+R.u.z*u+R.v.z*vc});
          if(rnd()<0.72)auto.push({x:c.x,z:c.z,y:yFisso,ry:Math.atan2(-R.v.z,R.v.x)+(fila%2?Math.PI:0)});
        }
        v+=fila%2?11:5;   // due file schiena contro schiena, poi una corsia
      }
      for(const s of strisce){
        const a={x:s.x-R.v.x*2.4,z:s.z-R.v.z*2.4},b={x:s.x+R.v.x*2.4,z:s.z+R.v.z*2.4},nx=R.u.x*0.06,nz=R.u.z*0.06;
        const p=(x,z)=>[x,(yFisso!=null?yFisso:H(x,z))+0.12,z];
        A('segni').quad(p(a.x+nx,a.z+nz),p(a.x-nx,a.z-nz),p(b.x-nx,b.z-nz),p(b.x+nx,b.z+nz),[0,0],[0,0],[0,0],[0,0],biancoS,[0,1,0]);
      }
    }

    /* ===== recinzione del sedime (rete con filo spinato in cima e paletti) ===== */
    for(const r of E.per){
      let cum=0;
      for(let i=0;i<r.length;i++){
        const a=r[i],b=r[(i+1)%r.length],L=Math.hypot(b.x-a.x,b.z-a.z);if(L<0.5) continue;
        const n=Math.max(1,Math.ceil(L/20));
        for(let k=0;k<n;k++){
          const t0=k/n,t1=(k+1)/n,x0=a.x+(b.x-a.x)*t0,z0=a.z+(b.z-a.z)*t0,x1=a.x+(b.x-a.x)*t1,z1=a.z+(b.z-a.z)*t1;
          const y0=H(x0,z0),y1=H(x1,z1),u0=cum/3.6,u1=(cum+L/n)/3.6;
          A('rete').quad([x0,y0,z0],[x1,y1,z1],[x1,y1+2.4,z1],[x0,y0+2.4,z0],[u0,0],[u1,0],[u1,2],[u0,2],BIANCO,[-(z1-z0),0,x1-x0]);
          A('spinato').quad([x0,y0+2.4,z0],[x1,y1+2.4,z1],[x1,y1+3,z1],[x0,y0+3,z0],[cum/0.7,0],[(cum+L/n)/0.7,0],[(cum+L/n)/0.7,1],[cum/0.7,1],BIANCO,[-(z1-z0),0,x1-x0]);
          cum+=L/n;
        }
      }
    }

    /* ===== mesh fuse per materiale ===== */
    const solidi=new THREE.Group();gr.add(solidi);
    const terra=new THREE.Group();gr.add(terra);
    for(const k in acc){
      const m=acc[k].mesh(M[k]);if(!m) continue;
      m.frustumCulled=true;
      (['asfalto','strada','segni'].includes(k)?terra:solidi).add(m);
    }

    /* ===== aerei e mezzi in istanze ===== */
    const istanze=new THREE.Group();gr.add(istanze);
    const dummy=new THREE.Object3D();
    for(const tipo of Object.keys(MOD.TIPI)){
      const lista=aerei.filter(a=>a.tipo===tipo);if(!lista.length) continue;
      const mod=MOD.TIPI[tipo].modello==='turismo'?MOD.aereoTurismo():MOD.aereoLinea();   // copie: ogni aeroporto ha la sua sfera
      const corpo=new THREE.InstancedMesh(mod.corpo.clone(),matIst,lista.length);
      const liv=new THREE.InstancedMesh(mod.livrea.clone(),matIst,lista.length);
      sfera(corpo.geometry,lista,40);sfera(liv.geometry,lista,40);
      lista.forEach((a,i)=>{
        dummy.position.set(a.x,a.y,a.z);dummy.rotation.set(0,-a.h,0);dummy.scale.setScalar(a.sc);dummy.updateMatrix();
        corpo.setMatrixAt(i,dummy.matrix);liv.setMatrixAt(i,dummy.matrix);
        corpo.setColorAt(i,BIANCO);liv.setColorAt(i,col.setHex(a.liv));
      });
      istanze.add(corpo,liv);
    }
    // mezzi di rampa (scatole colorate) e auto: modelli di js/modelli.js
    const FORME=MOD.MEZZI,COLAUTO=MOD.COLORI_AUTO;
    const scatole=[];
    for(const v of mezzi){
      const f=FORME[v.t],c=Math.cos(v.ry),s=Math.sin(v.ry),y=H(v.x,v.z);
      for(const [l,h,w,off,colore,y0,rz] of f)scatole.push({x:v.x+c*off,z:v.z-s*off,y:y+y0,l,h,w,ry:v.ry,rz:rz||0,c:colore});
    }
    const macchine=auto.map(a=>({x:a.x,z:a.z,y:a.y!=null?a.y:H(a.x,a.z),l:(3.9+rnd()*0.9)/4.4,h:1,w:1,ry:a.ry,c:COLAUTO[(rnd()*COLAUTO.length)|0],auto:true}));
    // a blocchi di 600 m: ognuno si vede solo da vicino (le auto sono tante e da lontano non si distinguono)
    const blocchi=new Map();
    for(const b of scatole.concat(macchine)){const k=(b.auto?'a':'m')+Math.floor(b.x/600)+','+Math.floor(b.z/600);(blocchi.get(k)||blocchi.set(k,[]).get(k)).push(b);}
    const pezzi=[];
    dummy.rotation.order='YZX';   // prima l'inclinazione (scalette), poi la rotta
    for(const lista of blocchi.values()){
      const sonoAuto=!!lista[0].auto,g=(sonoAuto?geoAuto:geoUnita).clone();sfera(g,lista,8);
      const im=new THREE.InstancedMesh(g,matIst,lista.length);
      lista.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.rotation.set(0,b.ry,b.rz||0);dummy.scale.set(b.l,b.h,b.w);dummy.updateMatrix();
        im.setMatrixAt(i,dummy.matrix);im.setColorAt(i,col.setHex(b.c));});
      gr.add(im);pezzi.push({im,x:g.boundingSphere.center.x,z:g.boundingSphere.center.z,r:g.boundingSphere.radius,max:sonoAuto?1800:4000});
    }
    dummy.rotation.order='XYZ';
    /* sfera che contiene tutte le istanze (in r128 three.js scarta le istanze guardando solo la geometria di base) */
    function sfera(g,lista,marg){
      let x=0,y=0,z=0;for(const a of lista){x+=a.x;y+=a.y||0;z+=a.z;}x/=lista.length;y/=lista.length;z/=lista.length;
      let r=0;for(const a of lista)r=Math.max(r,Math.hypot(a.x-x,(a.y||y)-y,a.z-z));
      g.boundingSphere=new THREE.Sphere(new THREE.Vector3(x,y,z),r+marg);
    }

    /* ===== luci di notte: lampade delle torri faro e chiazze di luce sul piazzale ===== */
    const notte=new THREE.Group();notte.visible=false;gr.add(notte);
    if(luciFari.length){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(luciFari,3));
      const p=new THREE.Points(g,new THREE.PointsMaterial({size:9,sizeAttenuation:false,map:texLuce,color:0xfff0d0,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      p.frustumCulled=false;notte.add(p);
      const ac=new Acc(),cl=new THREE.Color(0.2,0.18,0.14);
      for(let i=0;i<pozze.length;i+=2){const x=pozze[i],z=pozze[i+1],r=55;
        const p2=(a,b)=>[x+a,H(x+a,z+b)+0.3,z+b];
        ac.quad(p2(-r,-r),p2(r,-r),p2(r,r),p2(-r,r),[0,0],[1,0],[1,1],[0,1],cl,[0,1,0]);}
      const mp=ac.mesh(new THREE.MeshBasicMaterial({map:texLuce,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5}));
      notte.add(mp);
    }

    scene.add(gr);
    // quota del terreno lontano (griglia da 1 km) rispetto a quello dettagliato, al centro dell'aeroporto
    const dyLontano=(T.hLontano?T.hLontano(ap.x,ap.z):T.meshH(ap.x,ap.z))-T.meshH(ap.x,ap.z);
    return {ap,gr,radar,terra,istanze,pezzi,notte,dyLontano,libere,nEdifici:d.edifici.length,nAerei:aerei.length,nAuto:auto.length};
  }

  let ora='giorno';
  return {
    lista:elenco,
    /* piazzola libera dove parcheggiare dopo l'atterraggio (js/main.js): la più piccola adatta a un aereo da turismo
       (aperture fino a ~20 m), a parità la più vicina a "pos"; null se l'aeroporto non è disegnato */
    piazzola(ap,pos){
      const a=elenco.find(e=>e.ap===ap);if(!a||!a.libere.length) return null;
      const voto=p=>(p.s<=20?0:p.s)*50+Math.hypot(p.ingresso.x-pos.x,p.ingresso.z-pos.z);
      return a.libere.reduce((m,p)=>voto(p)<voto(m)?p:m);
    },
    // ora del volo (js/notte.js): finestre accese e luci delle torri faro
    ora(o){
      ora=o;const k=o==='notte'?1:o==='tramonto'?0.35:0;
      for(const m of conNotte)m.emissive.setScalar(k*0.85);
      M.vetroTorre.emissive.setScalar(k*0.25);
      for(const a of elenco)a.notte.visible=k>0;
    },
    aggiorna(pos,vic,dt){
      for(const a of elenco){
        const d=Math.hypot(a.ap.x-pos.x,a.ap.z-pos.z);
        a.gr.visible=d<30000;if(!a.gr.visible) continue;
        a.istanze.visible=d<14000;a.terra.visible=d<16000;
        for(const p of a.pezzi)p.im.visible=Math.hypot(p.x-pos.x,p.z-pos.z)-p.r<p.max&&pos.y-a.ap.piste[0].quota<2500;
        const dentroV=vic&&Math.abs(a.ap.x-vic.cx)<vic.mezzo&&Math.abs(a.ap.z-vic.cz)<vic.mezzo;
        a.gr.position.y=dentroV?0:a.dyLontano;
        for(const r of a.radar)r.rotation.y+=dt*2*Math.PI/4.8;   // un giro ogni 4,8 s
      }
    },
  };
};
})();
