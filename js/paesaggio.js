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
   PAESAGGIO (solo mappe reali)
   Strade, ferrovie, fiumi e aree urbane vere (OpenStreetMap) disegnate su
   un'immagine grande (fino a 4096 px, ~5 m per pixel) che copre la griglia
   vicina del terreno: il terreno la "indossa" nello shader, quindi tutto
   segue esattamente il rilievo. Attorno all'aereo (4 km) una seconda
   immagine più fine (~1 m per pixel) mostra le vie con bordi, segnaletica,
   guardrail e binari; i tracciati hanno gli angoli smussati. Dentro le aree urbane vengono generati gli
   edifici ("autogen"): case con il tetto in coppi, palazzi più alti vicino
   ai centri delle città grandi, capannoni nelle zone industriali. Sono
   orientati come la strada più vicina e non invadono strade e fiumi.
   Vicino all'aereo sono in 3D; più lontano restano disegnati sull'immagine.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;

// [x0, y0, dx1, dy1, ...] in unità di u metri (y nord) -> coordinate interne (z sud)
// (vie: window.VIE.unita, 1 m; aree urbane: decine di metri)
function decodifica(p,u=10){
  const n=p.length/2,xs=new Float32Array(n),zs=new Float32Array(n);
  let x=0,y=0,x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let i=0;i<n;i++){
    x+=p[2*i];y+=p[2*i+1];xs[i]=x*u;zs[i]=-y*u;
    if(xs[i]<x0)x0=xs[i];if(xs[i]>x1)x1=xs[i];if(zs[i]<z0)z0=zs[i];if(zs[i]>z1)z1=zs[i];
  }
  return {xs,zs,box:[x0,x1,z0,z1]};
}
const fuori=(b,x0,z0,X1,Z1,m)=>b[1]<x0-m||b[0]>X1+m||b[3]<z0-m||b[2]>Z1+m;

const GRANDI_FIUMI=/^(Fiume )?(Ticino|Tanaro|Sesia|Dora Baltea|Toce|Stura di Demonte|Bormida|Stura di Lanzo|Orco)\b/;
function larghezzaFiume(nome){
  if(/^(Fiume )?Po$/.test(nome)) return 120;
  if(GRANDI_FIUMI.test(nome)) return 45;
  if(/^(Torrente|Rio|Riale|Torrent|Ruisseau|Fosso|Ri )/.test(nome)) return 10;
  return 18;
}
/* l'acqua di fiumi e canali si dipinge col colore chiave di js/acqua.js: lo shader del terreno
   la riconosce e ci mette onde, riflessi del cielo e del sole (senza js/acqua.js: tinta fissa) */
const ACQUA=SIM.acqua?SIM.acqua.CHIAVE:'#4c6a70';
/* per ogni tipo, in ordine di disegno, le passate dal bordo verso il centro:
   [larghezza in m (per i fiumi è un fattore della larghezza del fiume), colore] */
const STILE_VIE3D={
  fiumi:[[1.6,'#a39d8f'],[1,ACQUA]],                            // greto di ghiaia, acqua
  canali:[[15,'#7c8668'],[10,ACQUA]],                           // argini erbosi, acqua
  urbane:[[5.5,'#5d5b58']],
  comunali:[[6,'#625f5a']],
  provinciali:[[6.5,'#625f5a']],
  statali:[[10,'#7a776f'],[8,'#525153']],                        // banchina, asfalto
  ferrovie:[[8,'#7b7165'],[2.6,'#3e3833']],                      // massicciata, binari
  superstrade:[[21,'#837f75'],[18,'#4d4d4f'],[2,'#5e6a48']],      // banchina, asfalto, spartitraffico
  autostrade:[[28,'#86827a'],[25,'#4a4a4c'],[3.5,'#5b6845']],
};
/* immagine "da vicino" (circa 4 km attorno all'aereo, ~1 m per pixel): vie con bordi,
   segnaletica e binari. Ogni passata: w larghezza (m; per i fiumi fattore), c colore,
   o spostamenti laterali (linee parallele all'asse), d tratteggio [pieno, vuoto] in m */
const STILE_DET={
  fiumi:[{w:1.6,c:'#a39d8f'},{w:1.15,c:'#6f7f72'},{w:1,c:ACQUA}],                        // greto, riva, acqua
  canali:[{w:15,c:'#7c8668'},{w:10,c:ACQUA}],
  urbane:[{w:7,c:'#8d8a83'},{w:5.4,c:'#5a5957'}],                                        // marciapiedi, asfalto
  comunali:[{w:6.6,c:'#8a8576'},{w:4.8,c:'#646260'}],                                   // bordo in terra, asfalto
  provinciali:[{w:8,c:'#7d7a70'},{w:6.8,c:'#d4d2ca'},{w:6.3,c:'#58575a'},{w:0.18,c:'#d9d7cf',d:[3,6]}],
  statali:[{w:10.5,c:'#7a776f'},{w:8.6,c:'#dedcd4'},{w:8,c:'#525153'},{w:0.2,c:'#e2e0d8',d:[4.5,7.5]}],
  ferrovie:[{w:8,c:'#857a6c'},{w:3.4,c:'#5f554b'},{w:0.32,c:'#2e2b29',o:[-0.75,0.75]}],          // massicciata, traversine, rotaie
  superstrade:[{w:21,c:'#837f75'},{w:18.6,c:'#e4e2da'},{w:18,c:'#4d4d4f'},{w:2.8,c:'#e4e2da'},{w:2.2,c:'#5e6a48'},
    {w:0.2,c:'#d9d7cf',o:[-5.1,5.1],d:[4.5,7.5]}],
  autostrade:[{w:28,c:'#86827a'},{w:25.2,c:'#e8e6df'},{w:24.6,c:'#4a4a4c'},{w:3.9,c:'#e8e6df'},{w:3.3,c:'#5b6845'},
    {w:0.6,c:'#9a9890',o:[-1.25,1.25]},                                                 // guardrail
    {w:0.2,c:'#d9d7cf',o:[-5.5,-9.1,5.5,9.1],d:[4.5,7.5]}],                             // corsie
};
// raggio massimo (m) con cui si arrotondano gli angoli dei tracciati (i dati sono semplificati a spezzate)
const CURVA={autostrade:300,superstrade:220,ferrovie:300,statali:90,provinciali:60,comunali:30,urbane:10,fiumi:150,canali:60};
// tracciato con gli angoli smussati: in ogni vertice un arco (quadratica) che parte a distanza r dal vertice
function traccia(g,xs,zs,R){
  const n=xs.length;
  g.moveTo(xs[0],zs[0]);
  for(let i=1;i<n-1;i++){
    const ax=xs[i]-xs[i-1],az=zs[i]-zs[i-1],bx=xs[i+1]-xs[i],bz=zs[i+1]-zs[i];
    const la=Math.hypot(ax,az)||1,lb=Math.hypot(bx,bz)||1,r=Math.min(R,la/2,lb/2);
    g.lineTo(xs[i]-ax/la*r,zs[i]-az/la*r);
    g.quadraticCurveTo(xs[i],zs[i],xs[i]+bx/lb*r,zs[i]+bz/lb*r);
  }
  g.lineTo(xs[n-1],zs[n-1]);
}
// linea parallela a distanza d (positiva = a destra nel verso del tracciato), angoli a spigolo vivo limitati
function parallela(xs,zs,d){
  const n=xs.length,px=new Float32Array(n),pz=new Float32Array(n);
  for(let i=0;i<n;i++){
    let nx=0,nz=0;
    // normale a destra di (dx, dz) con z verso sud: (-dz, dx)
    if(i>0){const dx=xs[i]-xs[i-1],dz=zs[i]-zs[i-1],l=Math.hypot(dx,dz)||1;nx+=-dz/l;nz+=dx/l;}
    if(i<n-1){const dx=xs[i+1]-xs[i],dz=zs[i+1]-zs[i],l=Math.hypot(dx,dz)||1;nx+=-dz/l;nz+=dx/l;}
    // agli estremi una normale sola; dentro è la somma di due normali unitarie s:
    // lo spigolo sta a s·2d/|s|² (cioè d / cos del mezzo angolo), al massimo 2d
    const s=Math.hypot(nx,nz)||1;
    const k=i>0&&i<n-1?(s>=1?2*d/(s*s):2*d/s):d/s;
    px[i]=xs[i]+nx*k;pz[i]=zs[i]+nz*k;
  }
  return {xs:px,zs:pz};
}
// colori degli edifici e del fondo delle aree urbane
// un solo elenco di colori per i tetti e uno per i muri; i gruppi dicono quali indici usare
const TETTI=['#9c4a32','#a0583f','#8a4a36','#a8664e','#7f4b3d','#94604c',     // 0-5 coppi
  '#74706b','#8a8a86','#9a968e','#7d7b76',                                     // 6-9 tetti piani (guaina, ghiaia)
  '#b8b9b4','#a3a7a8','#c9c8c2','#8e979e','#d6d4cc',                           // 10-14 lamiera dei capannoni
  '#6d6a66','#5f5c58','#7a7672'];                                              // 15-17 lose di pietra (montagna)
const T_COPPI=[0,6],T_PIANI=[6,10],T_LAMIERA=[10,15],T_LOSE=[15,18];
const MURI=[0xf1e7d0,0xe8d5b0,0xf4f1ea,0xd9c7a7,0xe6dccb,0xe3c9a0,0xd8b48c,0xcfc4b6,   // 0-7 intonaci chiari
  0xc8c6bf,0xb9bcbd,0xd5d2ca,0xbfb8aa,                                                // 8-11 capannoni
  0xe0b064,0xd9a55a,0xe8c27a,0xcf9a5e,0xc98f5a,                                       // 12-16 centro storico: giallo, ocra
  0xd8d4cc,0xc9c2b4,0xe2ddd2,0xb7aa96,0xa9a39a,                                       // 17-21 condomini
  0x8f8578,0xa39886,0x7a5a3c,0x6b4e34];                                               // 22-25 pietra e legno (montagna)
const M_CHIARI=[0,8],M_IND=[8,12],M_OCRA=[12,17],M_CONDO=[17,22],M_MONTE=[22,26];
const scegli=(g,h)=>g[0]+Math.min(g[1]-g[0]-1,(h*(g[1]-g[0]))|0);   // indice del gruppo g con h in [0,1)
// forme del tetto e stili di facciata (lo shader dei muri disegna finestre e persiane secondo lo stile)
const FALDE=0,PADIGLIONE=1,PIANO=2;
const CASA=0,PALAZZO=1,CONDOMINIO=2,CAPANNONE=3,TORRE=4,BAITA=5;
const FONDO={residenziale:'#7e7a68',industriale:'#8a8883'};

const MAX3D=100000;  // edifici in 3D al massimo
const RAGGIO3D=4500; // m dal centro della griglia entro cui gli edifici sono in 3D
const CELLA=64;      // griglia per cercare in fretta le vie vicine

SIM.creaPaesaggio=function(scene,renderer,TS){
  const T=SIM.terreno;
  if(!T||!T.reale||!window.VIE) return null;

  /* ---------- dati ---------- */
  const linee=[];
  for(const cat of Object.keys(STILE_VIE3D)){
    for(const l of (window.VIE[cat]||[])){
      const v=decodifica(l.p,window.VIE.unita||10);v.cat=cat;
      v.w=cat==='fiumi'?larghezzaFiume(l.r||''):1;
      // mezza larghezza "ingombrata" (dove non si costruisce)
      v.ing=(cat==='fiumi'?v.w*1.6:STILE_VIE3D[cat][0][0])/2;
      v.strada=cat!=='fiumi'&&cat!=='canali'&&cat!=='ferrovie';
      linee.push(v);
    }
  }
  const ponti=SIM.creaPonti?SIM.creaPonti(scene):null;   // ponti dove le vie incrociano fiumi e canali (js/ponti.js)
  // categoria della via (strade e ferrovie, non fiumi né canali) che passa a meno di r m dal bordo, o null
  // (usata da js/notte.js per le luci di avvicinamento; lenta: solo per pochi punti)
  SIM.viaSu=(x,z,r)=>{
    for(const v of linee){
      if(v.cat==='fiumi'||v.cat==='canali'||fuori(v.box,x,z,x,z,r+v.ing)) continue;
      for(let i=1;i<v.xs.length;i++){
        const ax=v.xs[i-1],az=v.zs[i-1],dx=v.xs[i]-ax,dz=v.zs[i]-az,l2=dx*dx+dz*dz||1;
        const t=clamp(((x-ax)*dx+(z-az)*dz)/l2,0,1);
        if(Math.hypot(ax+t*dx-x,az+t*dz-z)<r+v.ing) return v.cat;
      }
    }
    return null;
  };
  const aree=[];
  const AB=window.ABITATI||{};
  for(const tipo of ['residenziale','industriale']){
    for(const p of (AB[tipo]||[])){
      // un contorno solo, oppure più contorni (multipoligono: buchi con la regola pari/dispari)
      const an=(Array.isArray(p[0])?p:[p]).map(r=>decodifica(r));
      const a={tipo,anelli:an,box:[Math.min(...an.map(r=>r.box[0])),Math.max(...an.map(r=>r.box[1])),
        Math.min(...an.map(r=>r.box[2])),Math.max(...an.map(r=>r.box[3]))]};
      aree.push(a);
    }
  }
  // quanto un punto è "città" (0 = paese, 1 = centro di una città grande)
  function urbanita(x,z){
    let u=0;
    for(const c of T.citta){
      if(c.n<150) continue;
      const grande=c.n>=1000,R=c.r*(grande?1.1:0.8),d=Math.hypot(x-c.x,z-c.z);
      if(d<R){const f=(1-d/R)*(grande?1:c.n>=300?0.55:0.35);if(f>u)u=f;}
    }
    return u;
  }

  /* ---------- immagine stesa sul terreno ---------- */
  const PX=Math.min(4096,renderer.capabilities.maxTextureSize||4096);
  const cv=document.createElement('canvas');cv.width=cv.height=PX;
  const g=cv.getContext('2d');
  const tex=new THREE.CanvasTexture(cv);
  tex.premultiplyAlpha=true;  // così le mipmap non scuriscono i bordi
  tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  // immagine da vicino: DET m di lato attorno all'aereo (~1 m per pixel)
  const PXD=PX,DET=PX>=4096?4096:2048,DET_RIFAI=650;
  const cvd=document.createElement('canvas');cvd.width=cvd.height=PXD;
  const gd=cvd.getContext('2d');
  const texD=new THREE.CanvasTexture(cvd);
  texD.premultiplyAlpha=true;
  texD.anisotropy=tex.anisotropy;
  const unif={uVie:{value:tex},uVieO:{value:new THREE.Vector3(1e9,1e9,TS)},
    uDet:{value:texD},uDetO:{value:new THREE.Vector3(1e9,1e9,DET)}};

  /* ---------- vie vicine: griglia di segmenti ---------- */
  const NG=Math.ceil(TS/CELLA)+2;
  let celle=[],gx0=0,gz0=0;
  let SA=new Float32Array(6*65536),ns=0; // ax, az, bx, bz, ingombro, strada
  function grigliaVie(x0,z0,X1,Z1){
    gx0=x0-CELLA;gz0=z0-CELLA;celle=new Array(NG*NG);ns=0;
    const M=40; // margine: un edificio guarda le vie fino a 40 m oltre la sua cella
    for(const v of linee){
      if(fuori(v.box,x0,z0,X1,Z1,100)) continue;
      for(let i=1;i<v.xs.length;i++){
        const ax=v.xs[i-1],az=v.zs[i-1],bx=v.xs[i],bz=v.zs[i],m=v.ing+M;
        const i0=Math.max(0,Math.floor((Math.min(ax,bx)-m-gx0)/CELLA)),i1=Math.min(NG-1,Math.floor((Math.max(ax,bx)+m-gx0)/CELLA));
        const j0=Math.max(0,Math.floor((Math.min(az,bz)-m-gz0)/CELLA)),j1=Math.min(NG-1,Math.floor((Math.max(az,bz)+m-gz0)/CELLA));
        if(i0>i1||j0>j1) continue;
        if(ns*6+6>SA.length){const n=new Float32Array(SA.length*2);n.set(SA);SA=n;}
        const o=ns*6;SA[o]=ax;SA[o+1]=az;SA[o+2]=bx;SA[o+3]=bz;SA[o+4]=v.ing;SA[o+5]=v.strada?1:0;
        for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){const c=j*NG+k;(celle[c]||(celle[c]=[])).push(ns);}
        ns++;
      }
    }
  }
  // spazio libero dalla via più vicina (qLib, m) e direzione della strada più vicina (qDx, qDz)
  let qLib=0,qDx=0,qDz=0,qDir=false;
  function interroga(x,z){
    qLib=1e9;qDir=false;
    const i=Math.floor((x-gx0)/CELLA),j=Math.floor((z-gz0)/CELLA);
    if(i<0||j<0||i>=NG||j>=NG) return;
    const lst=celle[j*NG+i];if(!lst) return;
    let best=1e9;
    for(const s of lst){
      const o=s*6,ax=SA[o],az=SA[o+1],dx=SA[o+2]-ax,dz=SA[o+3]-az,l2=dx*dx+dz*dz||1;
      const t=clamp(((x-ax)*dx+(z-az)*dz)/l2,0,1),ex=ax+t*dx-x,ez=az+t*dz-z;
      const d=Math.sqrt(ex*ex+ez*ez)-SA[o+4];
      if(d<qLib)qLib=d;
      if(SA[o+5]&&d<best){best=d;qDx=dx;qDz=dz;qDir=true;}
    }
  }

  // spazio libero (m) dalla via più vicina, per js/boschi.js (vale per la griglia preparata da disegna)
  SIM.liberoVie=(x,z)=>{interroga(x,z);return qLib;};

  /* ---------- edifici generati ----------
     ogni edificio: x, z, larghezza (lungo la strada), profondità, altezza, rotazione, colori */
  // x, z, larghezza, profondità, altezza, rotazione, colore tetto, colore muro, forma del tetto, stile
  const ST=10;let E=new Float32Array(ST*65536),ne=0;
  function aggiungi(x,z,w,d,h,rot,tetto,muro,forma,stile){
    if(ne*ST+ST>E.length){const n=new Float32Array(E.length*2);n.set(E);E=n;}
    const o=ne*ST;E[o]=x;E[o+1]=z;E[o+2]=w;E[o+3]=d;E[o+4]=h;E[o+5]=rot;E[o+6]=tetto;E[o+7]=muro;E[o+8]=forma;E[o+9]=stile;ne++;
  }
  /* densità degli edifici veri (ABITATI.densita): frazione coperta in quadrati di 100 m */
  const DS=AB.densita||null;let DEN=null;
  if(DS){
    SIM.densitaEdifici=()=>({DS,DEN});
    const bin=atob(DS.dati);DEN=new Uint8Array(DS.larghezza*DS.altezza);
    for(let i=0,o=0;i<bin.length&&o<DEN.length;i++){
      const v=bin.charCodeAt(i);
      if(v===0){o+=bin.charCodeAt(++i);}else DEN[o++]=v;
    }
  }
  // riempimento a righe di un'area: chiama fn(i) per le colonne i (passo S, origine ox) dentro, alla quota zc
  const xi=[];
  function rigaArea(a,zc,S,ox,fn){
    xi.length=0;
    for(const r of a.anelli){
      const xs=r.xs,zs=r.zs,n=xs.length;
      for(let i=0,j=n-1;i<n;j=i++){
        const zi=zs[i],zj=zs[j];
        if((zi>zc)!==(zj>zc))xi.push(xs[i]+(zc-zi)/(zj-zi)*(xs[j]-xs[i]));
      }
    }
    xi.sort((p,q)=>p-q);
    for(let m=0;m+1<xi.length;m+=2)
      for(let i=Math.ceil((xi[m]-ox)/S-0.5);ox+(i+0.5)*S<=xi[m+1];i++) fn(i);
  }
  // quadrati della densità che cadono nella finestra, e quali sono in zona industriale
  let fin=null;
  function finestraDensita(x0,z0,X1,Z1){
    const P=DS.passo,i0=Math.max(0,Math.floor((x0-DS.x0)/P)),j0=Math.max(0,Math.floor((DS.yNord+z0)/P));
    const i1=Math.min(DS.larghezza-1,Math.floor((X1-DS.x0)/P)),j1=Math.min(DS.altezza-1,Math.floor((DS.yNord+Z1)/P));
    const W=Math.max(0,i1-i0+1),H=Math.max(0,j1-j0+1),ind=new Uint8Array(W*H);
    const ox=DS.x0+i0*P,oz=j0*P-DS.yNord;
    for(const a of aree){
      if(a.tipo!=='industriale'||fuori(a.box,x0,z0,X1,Z1,0)) continue;
      for(let j=Math.max(0,Math.floor((a.box[2]-oz)/P));j<H&&oz+j*P<=a.box[3];j++)
        rigaArea(a,oz+(j+0.5)*P,P,ox,i=>{if(i>=0&&i<W)ind[j*W+i]=1;});
    }
    fin={i0,j0,W,H,ox,oz,ind};
  }
  const lisc=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};
  function* generaEdifici(x0,z0,X1,Z1){
    ne=0;
    if(!DEN) return;
    finestraDensita(x0,z0,X1,Z1);
    const P=DS.passo,H=T.hash,{i0,j0,W,ind}=fin;
    for(let j=0;j<fin.H;j++){
      for(let i=0;i<W;i++){
        const v=DEN[(j0+j)*DS.larghezza+i0+i];
        if(v<5) continue;                         // meno del 2% coperto: campagna
        const c=v/255,gi=i0+i,gj=j0+j,cx0=DS.x0+gi*P,cz0=gj*P-DS.yNord;
        const industria=ind[j*W+i]===1;
        const nl=industria?2:4,L=P/nl;            // lotti per lato: capannoni da 50 m, case da 25 m
        const fitto=lisc(0.08,0.45,c),u=industria?0:urbanita(cx0+P/2,cz0+P/2);
        const t=clamp(0.6*fitto+0.7*u,0,1);       // 0 = paese, 1 = centro città
        const quotaCella=T.naturale(cx0+P/2,cz0+P/2);
        for(let b=0;b<nl;b++)for(let a=0;a<nl;a++){
          const li=gi*nl+a,lk=gj*nl+b;
          const h1=H(li*7+(industria?3:0),lk*13+1),h2=H(li+911,lk-377),h3=H(li-53,lk+71),h4=H(li*3+5,lk*5-9);
          const h5=H(li*11-7,lk*3+19);
          let w,d,h,tetto,muro,forma,stile;
          if(industria){                              // capannone: tetto piano o a falde basse in lamiera
            w=22+h2*28;d=16+h3*20;h=7+h4*5;
            forma=h5<0.6?PIANO:FALDE;stile=CAPANNONE;
            tetto=scegli(T_LAMIERA,h1);muro=scegli(M_IND,h4);
          }else if(quotaCella>700&&t<0.45){           // valli alpine: case basse in pietra e legno, tetto in lose
            w=8+h2*6;d=7+h3*4;h=5.5+h4*3;
            forma=FALDE;stile=BAITA;
            tetto=scegli(T_LOSE,h1);muro=scegli(M_MONTE,h4);
          }else if(t<0.25){                           // paese
            if(fitto<0.15&&h5<0.18){                  // cascina: lunga, bassa, coppi
              w=18+h2*6;d=9+h3*3;h=7+h4*2;forma=FALDE;
            }else{                                    // villetta a due piani
              w=lerp(9,14,fitto)+h2*4;d=lerp(8,11,fitto)+h3*3;h=5.8+h4*1.8;
              forma=h5<0.4?PADIGLIONE:FALDE;
            }
            stile=CASA;tetto=scegli(T_COPPI,h1);muro=scegli(M_CHIARI,h4);
          }else if(u>0.7){                            // centro storico: case a corte di 4-6 piani, gialle e ocra
            w=16+h2*8;d=12+h3*4;h=13+h4*7;
            forma=h5<0.55?FALDE:PADIGLIONE;stile=PALAZZO;
            tetto=scegli(T_COPPI,h1);muro=scegli(M_OCRA,h4);
            if(h5>0.996&&t>0.9){w=20;d=20;h=55+h2*45;forma=PIANO;stile=TORRE;tetto=scegli(T_PIANI,h1);muro=scegli(M_CONDO,h4);}
          }else if(t>0.55&&h5<0.3*(t-0.55)/0.45){     // periferia: condomini di 8-12 piani col tetto piano (più fitti, più numerosi)
            w=20+h2*10;d=12+h3*4;h=24+h4*12;
            forma=PIANO;stile=CONDOMINIO;
            tetto=scegli(T_PIANI,h1);muro=scegli(M_CONDO,h4);
            if(h5<0.004&&t>0.85){w=20;d=20;h=50+h2*35;stile=TORRE;}   // ogni tanto una torre
          }else{                                      // palazzine di 3-5 piani
            w=lerp(12,18,fitto)+h2*4;d=lerp(10,13,fitto)+h3*3;h=9.5+h4*6.5;
            forma=h5<0.6?PADIGLIONE:h5<0.85?FALDE:PIANO;stile=PALAZZO;
            tetto=forma===PIANO?scegli(T_PIANI,h1):scegli(T_COPPI,h1);muro=scegli(h3<0.5?M_CHIARI:M_CONDO,h4);
          }
          // probabilità che il lotto sia costruito: così la superficie coperta è quella vera
          if(H(li+17,lk+29)>c*L*L/(w*d)*1.15) continue;
          const x=cx0+(a+0.5+(h2-0.5)*0.3)*L,z=cz0+(b+0.5+(h3-0.5)*0.3)*L;
          if(x<x0||x>X1||z<z0||z>Z1) continue;
          interroga(x,z);
          if(qLib<d/2+2.5) continue;               // troppo vicino a una via o a un fiume
          if(T.inLago(x,z)||T.inAeroporto(x,z,40)) continue;
          if(SIM.zonaMonumenti&&SIM.zonaMonumenti(x,z)) continue;   // spazio per i monumenti (js/monumenti.js)
          if(SIM.reteRullaggio&&SIM.reteRullaggio.zona(x,z,20)) continue;   // vie di rullaggio vere (js/rullaggio.js)
          if(SIM.zonaAeroporti&&SIM.zonaAeroporti(x,z)) continue;   // grandi aeroporti: edifici veri (js/aeroporti-3d.js)
          if(SIM.zonaCalvert&&SIM.zonaCalvert(x,z)) continue;       // luci di avvicinamento (js/notte.js)
          const rot=qDir?Math.atan2(-qDz,qDx):h4*Math.PI;  // facciata parallela alla strada
          aggiungi(x,z,w,d,h,rot,tetto,muro,forma,stile);
        }
      }
      if(j%12===11) yield;
    }
  }


  /* ---------- edifici in 3D: due copie, come la griglia del terreno ----------
     muri (scatola con le finestre disegnate dallo shader) + tetto di una di tre forme */
  const geoMuro=new THREE.BoxGeometry(1,1,1).translate(0,0.5,0);
  function geoTettoA(r){ // tetto a falde (r = 0.5) o a padiglione (colmo più corto); colmo lungo x
    const A=[-.5,0,-.5],B=[.5,0,-.5],C=[.5,0,.5],D=[-.5,0,.5],R1=[-r,1,0],R2=[r,1,0];
    const tri=[A,R1,R2, A,R2,B, D,C,R2, D,R2,R1, A,D,R1, B,R2,C];
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tri.flat()),3));
    geo.computeVertexNormals();
    return geo;
  }
  const geoTetti=[geoTettoA(0.5),geoTettoA(0.22),new THREE.BoxGeometry(1,1,1).translate(0,0.5,0)];  // FALDE, PADIGLIONE, PIANO
  const MAXT=[MAX3D,MAX3D*0.6|0,MAX3D*0.5|0];   // istanze al massimo per forma
  const matEd=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0,flatShading:true});
  /* facciate: finestre (vetro), persiane ai lati, piani e campate secondo lo stile; da lontano
     (meno di ~5 pixel per campata) sfumano nel colore medio per non sfarfallare; di notte una
     parte delle finestre è accesa */
  const unifEd={uNotte:{value:0}};
  const matMuri=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0,flatShading:true});
  matMuri.onBeforeCompile=sh=>{
    sh.uniforms.uNotte=unifEd.uNotte;
    const VAR='varying vec2 vFac;\nvarying float vLarg,vLato,vAlto,vSeme,vStile;\n';
    sh.vertexShader='attribute float aStile;\n'+VAR+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 scI=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      float hy=position.y*scI.y-4.0;                       // i muri scendono 4 m sotto il suolo
      if(abs(normal.x)>0.5){vFac=vec2((position.z+0.5)*scI.z,hy);vLarg=scI.z;}
      else{vFac=vec2((position.x+0.5)*scI.x,hy);vLarg=scI.x;}
      vLato=abs(normal.y)<0.5?1.0:0.0;
      vAlto=scI.y-4.0;
      vSeme=fract(instanceMatrix[3].x*0.0137+instanceMatrix[3].z*0.0291);
      vStile=aStile;`);
    sh.fragmentShader='uniform float uNotte;\n'+VAR+sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float fin=0.0,pers=0.0,acceso=0.0,lontano=0.0;
      if(vLato>0.5){
        float st=floor(vStile+0.5);
        float baia=3.2,piano=3.0,fw=0.34,fh=0.5,conPers=1.0;      // casa
        if(st==1.0){baia=3.4;piano=3.3;fw=0.3;fh=0.55;}             // palazzo
        else if(st==2.0){baia=3.0;piano=2.9;fw=0.55;fh=0.45;conPers=0.0;}   // condominio
        else if(st==3.0){baia=6.0;piano=3.0;fw=0.7;fh=0.4;conPers=0.0;}     // capannone
        else if(st==4.0){baia=1.6;piano=3.4;fw=0.84;fh=0.8;conPers=0.0;}    // torre a vetri
        else if(st==5.0){baia=3.6;piano=2.8;fw=0.26;fh=0.42;}       // baita
        float nb=max(1.0,floor(vLarg/baia)),off=(vLarg-nb*baia)*0.5;
        float u=(vFac.x-off)/baia,v=vFac.y/piano;
        vec2 cel=floor(vec2(u,v)),q=fract(vec2(u,v))-0.5,dq=fwidth(vec2(u,v));
        float dentro=step(0.0,u)*step(u,nb)*step(0.0,vFac.y)*step((cel.y+0.5+fh*0.5)*piano,vAlto-0.5);
        float fx=1.0-smoothstep(fw*0.5-dq.x,fw*0.5+dq.x,abs(q.x));
        float fy=1.0-smoothstep(fh*0.5-dq.y,fh*0.5+dq.y,abs(q.y));
        fin=fx*fy*dentro;
        if(conPers>0.5)pers=(1.0-smoothstep(fw-dq.x,fw+dq.x,abs(q.x)))*fy*dentro*(1.0-fin);
        if(st==3.0)fin=fx*step(0.0,u)*step(u,nb)*step(vAlto-2.6,vFac.y)*step(vFac.y,vAlto-1.4);   // una fila in alto
        lontano=smoothstep(0.35,0.8,max(dq.x*baia,dq.y*piano));    // metri per pixel
        fin*=1.0-lontano;pers*=1.0-lontano;
        float hh=fract(sin(dot(cel,vec2(12.9898,78.233))+vSeme*437.0)*43758.5453);
        acceso=step(hh,st==3.0?0.15:st==4.0?0.5:0.33)*fin;
        vec3 vetro=st==4.0?vec3(0.30,0.40,0.50):vec3(0.15,0.18,0.21);
        vec3 colPers=st==5.0?vec3(0.36,0.24,0.15):vSeme<0.5?vec3(0.27,0.38,0.26):vec3(0.45,0.30,0.19);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(diffuseColor.rgb,vetro,fw*fh*0.5),lontano);
        diffuseColor.rgb=mix(diffuseColor.rgb,colPers,pers);
        diffuseColor.rgb=mix(diffuseColor.rgb,vetro*(1.0-0.6*uNotte),fin);
      }`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      totalEmissiveRadiance+=vec3(1.0,0.78,0.45)*uNotte*(acceso*0.9+lontano*vLato*0.04);`);
  };
  SIM.edificiOra=o=>{unifEd.uNotte.value=o==='notte'?1:o==='tramonto'?0.45:0;};   // chiamato da js/notte.js
  const cTetti=TETTI.map(c=>new THREE.Color(c)),cMuri=MURI.map(c=>new THREE.Color(c));
  function istanze(geo,mat,max){
    const im=new THREE.InstancedMesh(geo,mat,max);
    im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(max*3),3);
    im.count=0;im.frustumCulled=false;im.visible=false;scene.add(im);
    return im;
  }
  function copia(){
    const gm=geoMuro.clone();
    gm.setAttribute('aStile',new THREE.InstancedBufferAttribute(new Float32Array(MAX3D),1));
    const muri=istanze(gm,matMuri,MAX3D),tetti=geoTetti.map((g,i)=>istanze(g,matEd,MAXT[i]));
    return {muri,tetti,tutte:[muri,...tetti]};
  }
  const copie=[copia(),copia()];
  let visibile=0;
  function matrice(a,o,x,y,z,c,s,sx,sy,sz){
    a[o]=c*sx;a[o+1]=0;a[o+2]=-s*sx;a[o+3]=0;
    a[o+4]=0;a[o+5]=sy;a[o+6]=0;a[o+7]=0;
    a[o+8]=s*sz;a[o+9]=0;a[o+10]=c*sz;a[o+11]=0;
    a[o+12]=x;a[o+13]=y;a[o+14]=z;a[o+15]=1;
  }
  function* costruisci3D(cp,cx,cz){
    const mm=cp.muri.instanceMatrix.array,mc=cp.muri.instanceColor.array,ms=cp.muri.geometry.attributes.aStile.array;
    const nt=[0,0,0];
    // in città gli edifici sono troppi: si accorcia il raggio finché ci stanno (prima i più vicini)
    const conta=new Uint32Array(46);
    for(let e=0;e<ne;e++){const dx=E[e*ST]-cx,dz=E[e*ST+1]-cz,k=Math.floor(Math.sqrt(dx*dx+dz*dz)/100);if(k<45)conta[k]++;}
    let raggio=RAGGIO3D;
    for(let k=0,tot=0;k<45;k++){tot+=conta[k];if(tot>MAX3D){raggio=k*100;break;}}
    const R2=raggio*raggio;let n=0;
    for(let e=0;e<ne&&n<MAX3D;e++){
      const o=e*ST,x=E[o],z=E[o+1],dx=x-cx,dz=z-cz;
      if(dx*dx+dz*dz>R2) continue;
      const w=E[o+2],d=E[o+3],h=E[o+4],r=E[o+5],ti=E[o+6],mi=E[o+7],fo=E[o+8],st=E[o+9];
      if(nt[fo]>=MAXT[fo]) continue;
      const y=T.meshH(x,z),c=Math.cos(r),s=Math.sin(r);
      const var_=0.9+0.2*T.hash(x|0,z|0);
      matrice(mm,n*16,x,y-4,z,c,s,w,h+4,d);ms[n]=st;
      const cm=cMuri[mi];mc[n*3]=cm.r*var_;mc[n*3+1]=cm.g*var_;mc[n*3+2]=cm.b*var_;
      // tetto: sporgenza e altezza secondo forma e stile
      let sx,sy,sz;
      if(fo===PIANO){sx=w+0.3;sy=0.9;sz=d+0.3;}                       // con il parapetto
      else if(st===CAPANNONE){sx=w*1.02;sy=d*0.12;sz=d*1.04;}         // falde basse
      else if(st===BAITA){sx=w*1.12;sy=d*0.42;sz=d*1.2;}              // ripido e sporgente
      else if(fo===PADIGLIONE){sx=w*1.06;sy=Math.min(d*0.3,4);sz=d*1.08;}
      else{sx=w*1.06;sy=Math.min(d*0.32,4.5);sz=d*1.08;}
      const im=cp.tetti[fo],k=nt[fo]++;
      matrice(im.instanceMatrix.array,k*16,x,y+h,z,c,s,sx,sy,sz);
      const ct=cTetti[ti],tc=im.instanceColor.array;tc[k*3]=ct.r*var_;tc[k*3+1]=ct.g*var_;tc[k*3+2]=ct.b*var_;
      n++;
      if(n%4000===0) yield;
    }
    cp.muri.count=n;cp.muri.geometry.attributes.aStile.needsUpdate=true;
    cp.tetti.forEach((im,i)=>im.count=nt[i]);
    for(const im of cp.tutte){im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;}
  }

  /* ---------- disegno delle immagini ---------- */
  // fondo delle aree urbane, macchia della densità e tetti visti dall'alto, nella finestra x0..X1, z0..Z1 (k = pixel per metro)
  function* disegnaFondo(g,x0,z0,X1,Z1,k){
    g.setTransform(k,0,0,k,-x0*k,-z0*k);
    g.globalAlpha=0.85;
    for(const tipo of ['residenziale','industriale']){
      g.fillStyle=FONDO[tipo];
      const tracciato=a=>{for(const r of a.anelli){g.moveTo(r.xs[0],r.zs[0]);for(let i=1;i<r.xs.length;i++)g.lineTo(r.xs[i],r.zs[i]);g.closePath();}};
      g.beginPath(); // aree semplici tutte insieme
      for(const a of aree)if(a.tipo===tipo&&a.anelli.length===1&&!fuori(a.box,x0,z0,X1,Z1,0))tracciato(a);
      g.fill();
      for(const a of aree)if(a.tipo===tipo&&a.anelli.length>1&&!fuori(a.box,x0,z0,X1,Z1,0)){g.beginPath();tracciato(a);g.fill('evenodd');}
      yield;
    }
    g.globalAlpha=1;
    // dove ci sono edifici veri: macchia sfumata (quadrati di 100 m ingranditi con smussatura)
    if(DEN&&fin&&fin.W&&fin.H){
      if(!fin.macchia){
        const pc=document.createElement('canvas');pc.width=fin.W;pc.height=fin.H;
        const pg=pc.getContext('2d'),img=pg.createImageData(fin.W,fin.H),col=new THREE.Color(FONDO.residenziale);
        for(let j=0;j<fin.H;j++)for(let i=0;i<fin.W;i++){
          const v=DEN[(fin.j0+j)*DS.larghezza+fin.i0+i],o=(j*fin.W+i)*4;
          img.data[o]=col.r*255;img.data[o+1]=col.g*255;img.data[o+2]=col.b*255;
          img.data[o+3]=Math.min(215,v*3.2);
        }
        pg.putImageData(img,0,0);
        fin.macchia=pc;
      }
      g.imageSmoothingEnabled=true;
      g.drawImage(fin.macchia,fin.ox,fin.oz,fin.W*DS.passo,fin.H*DS.passo);
    }
    yield;
    // tetti visti dall'alto (servono da lontano, dove gli edifici non sono in 3D)
    let q=0;
    for(let t=0;t<TETTI.length;t++){
      g.fillStyle=TETTI[t];
      for(let e=0;e<ne;e++){
        const o=e*ST;
        if(E[o+6]!==t) continue;
        const x=E[o],z=E[o+1];
        if(x<x0-30||x>X1+30||z<z0-30||z>Z1+30) continue;
        const c=Math.cos(E[o+5])*k,s=Math.sin(E[o+5])*k;
        g.setTransform(c,-s,s,c,(x-x0)*k,(z-z0)*k);
        g.fillRect(-E[o+2]/2,-E[o+3]/2,E[o+2],E[o+3]);
        if(++q%6000===0) yield;
      }
    }
    g.setTransform(k,0,0,k,-x0*k,-z0*k);
  }
  // vie con gli stili dati (STILE_DET: passate {w, c, o, d})
  function* disegnaVie(g,x0,z0,X1,Z1,stili){
    g.lineJoin='round';g.lineCap='round';
    for(const cat of Object.keys(stili)){
      const vis=linee.filter(v=>v.cat===cat&&!fuori(v.box,x0,z0,X1,Z1,50));
      if(!vis.length) continue;
      const R=CURVA[cat]||20;
      for(const p of stili[cat]){
        g.strokeStyle=p.c;g.setLineDash(p.d||[]);
        g.lineCap=p.d?'butt':'round';
        if(cat==='fiumi'){ // larghezza secondo il fiume: un tracciato per fiume
          let q=0;
          for(const v of vis){g.lineWidth=p.w*v.w;g.beginPath();traccia(g,v.xs,v.zs,R);g.stroke();if(++q%15===0)yield;}
          yield;
          continue;
        }
        g.lineWidth=p.w;g.beginPath();   // stessa larghezza: un solo tracciato (a gruppi, per non fermare il fotogramma)
        let q=0;
        for(const v of vis){
          if(!p.o)traccia(g,v.xs,v.zs,R);
          else for(const d of p.o){const l=parallela(v.xs,v.zs,d);traccia(g,l.xs,l.zs,Math.max(2,R-Math.abs(d)));}
          if(++q%300===0){g.stroke();yield;g.beginPath();}
        }
        g.stroke();
      }
      yield;
    }
    g.setLineDash([]);g.lineCap='round';
  }
  // immagine grande (tutta la griglia vicina, ~5 m per pixel)
  const STILE_BASE={};
  for(const cat in STILE_VIE3D)STILE_BASE[cat]=STILE_VIE3D[cat].map(([w,c])=>({w,c}));
  function* disegnaImmagine(x0,z0,X1,Z1,lp){
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,PX,PX);
    yield* disegnaFondo(g,x0,z0,X1,Z1,PX/TS);
    yield* disegnaVie(g,x0,z0,X1,Z1,STILE_BASE);
    acquaSottoPonti(g,lp,x0,z0,X1,Z1,STILE_BASE);
  }
  // sotto i ponti (js/ponti.js) si vede l'acqua, non la strada dipinta: si ridipinge il fiume dentro l'ingombro dell'impalcato
  function acquaSottoPonti(g,lista,x0,z0,X1,Z1,stili){
    g.setLineDash([]);g.lineCap='round';g.lineJoin='round';
    for(const p of lista||[]){
      const m=p.mezza+2,w=p.w/2+3,v=p.fiume;
      if(p.x+m<x0||p.x-m>X1||p.z+m<z0||p.z-m>Z1) continue;
      g.save();g.beginPath();
      for(const [a,b] of [[-m,-w],[m,-w],[m,w],[-m,w]])g.lineTo(p.x+p.ux*a-p.uz*b,p.z+p.uz*a+p.ux*b);
      g.closePath();g.clip();
      for(const s of stili[v.cat]){g.strokeStyle=s.c;g.lineWidth=s.w*(v.cat==='fiumi'?v.w:1);g.beginPath();traccia(g,v.xs,v.zs,CURVA[v.cat]||20);g.stroke();}
      g.restore();
    }
  }

  /* ---------- immagine da vicino ----------
     si ridisegna (a pezzi) quando l'aereo si allontana di DET_RIFAI dal suo centro;
     nello shader prende il posto dell'immagine grande, sfumando verso il bordo */
  function* disegnaDettaglio(cx,cz){
    const x0=cx-DET/2,z0=cz-DET/2,X1=x0+DET,Z1=z0+DET;
    gd.setTransform(1,0,0,1,0,0);gd.clearRect(0,0,PXD,PXD);
    yield;
    yield* disegnaFondo(gd,x0,z0,X1,Z1,PXD/DET);
    yield* disegnaVie(gd,x0,z0,X1,Z1,STILE_DET);
    if(ponti)acquaSottoPonti(gd,ponti.elenco(),x0,z0,X1,Z1,STILE_DET);
    detPronto=[x0,z0];
  }
  let detLavoro=null,detPronto=null,detC=null;
  function dettaglio(px,pz,forza){
    if(!fin) return;   // aspetta la prima immagine grande (serve la finestra della densità)
    const lontano=!detC||Math.max(Math.abs(px-detC[0]),Math.abs(pz-detC[1]))>DET_RIFAI;
    if(forza||(!detLavoro&&lontano)){
      const cx=Math.round(px/50)*50,cz=Math.round(pz/50)*50;
      detC=[cx,cz];detLavoro=disegnaDettaglio(cx,cz);
      if(forza)for(const _ of detLavoro);
    }
    if(detLavoro&&(forza||detLavoro.next().done)){
      detLavoro=null;
      if(detPronto){unif.uDetO.value.set(detPronto[0],detPronto[1],DET);texD.needsUpdate=true;detPronto=null;}
    }
  }

  let pronto=null;
  SIM.debugPaesaggio={copie,stato:()=>({visibile,ne})};
  return {
    // fa "indossare" al materiale del terreno l'immagine
    veste(mat){
      mat.onBeforeCompile=sh=>{
        Object.assign(sh.uniforms,unif);
        sh.vertexShader='varying vec2 vXZ;\n'+sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
        sh.fragmentShader='varying vec2 vXZ;\nuniform sampler2D uVie,uDet;\nuniform vec3 uVieO,uDetO;\n'+sh.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n'+
          'vec2 tuv=(vXZ-uVieO.xy)/uVieO.z; tuv.y=1.0-tuv.y;\n'+
          'vec4 tv=texture2D(uVie,tuv);\n'+
          'tv*=1.0-smoothstep(0.42,0.5,max(abs(tuv.x-0.5),abs(tuv.y-0.5)));\n'+ // sfuma verso il bordo
          'vec2 duv=(vXZ-uDetO.xy)/uDetO.z; duv.y=1.0-duv.y;\n'+               // da vicino: immagine fine
          'vec4 td=texture2D(uDet,duv);\n'+
          'tv=mix(tv,td,1.0-smoothstep(0.38,0.48,max(abs(duv.x-0.5),abs(duv.y-0.5))));\n'+
          (SIM.acqua?   // quanta acqua c'è nel pixel (premoltiplicato: già pesata con la trasparenza e i colori vicini)
            'acquaK=clamp((tv.b-tv.g-0.03)/'+(SIM.acqua.CHIAVE_RGB[2]-SIM.acqua.CHIAVE_RGB[1]-0.03).toFixed(4)+',0.0,1.0);\n'+
            'tv.rgb+=acquaK*(vec3(0.20,0.29,0.29)-vec3('+SIM.acqua.CHIAVE_RGB.map(v=>v.toFixed(4)).join(',')+'));\n':'')+
          'diffuseColor.rgb=diffuseColor.rgb*(1.0-tv.a)+tv.rgb;');
      };
    },
    // prepara tutto attorno a (cx, cz), a pezzi per non bloccare il fotogramma
    *disegna(cx,cz){
      const x0=cx-TS/2,z0=cz-TS/2,X1=x0+TS,Z1=z0+TS;
      pronto=null;
      grigliaVie(x0,z0,X1,Z1);yield;
      const lp=ponti?yield* ponti.trova(linee,x0,z0,X1,Z1):null;
      yield* generaEdifici(x0,z0,X1,Z1);
      yield* disegnaImmagine(x0,z0,X1,Z1,lp);
      yield* costruisci3D(copie[1-visibile],cx,cz);
      if(ponti)yield* ponti.costruisci(lp);
      pronto=[x0,z0];
    },
    // da chiamare a ogni fotogramma con la posizione dell'aereo (forza: subito, tutto in una volta)
    dettaglio,
    // da chiamare quando la griglia nuova diventa visibile
    applica(){
      if(!pronto) return;
      unif.uVieO.value.set(pronto[0],pronto[1],TS);tex.needsUpdate=true;pronto=null;
      visibile=1-visibile;
      for(let i=0;i<2;i++)for(const im of copie[i].tutte)im.visible=i===visibile;
      if(ponti)ponti.applica();
    },
  };
};
})();
