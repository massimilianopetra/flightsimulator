/* =====================================================================
   PAESAGGIO (solo mappe reali)
   Strade, ferrovie, fiumi e aree urbane vere (OpenStreetMap) disegnate su
   un'immagine grande (fino a 4096 px, ~5 m per pixel) che copre la griglia
   vicina del terreno: il terreno la "indossa" nello shader, quindi tutto
   segue esattamente il rilievo. Dentro le aree urbane vengono generati gli
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

// [x0, y0, dx1, dy1, ...] in decine di metri (y nord) -> coordinate interne (z sud)
function decodifica(p){
  const n=p.length/2,xs=new Float32Array(n),zs=new Float32Array(n);
  let x=0,y=0,x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let i=0;i<n;i++){
    x+=p[2*i];y+=p[2*i+1];xs[i]=x*10;zs[i]=-y*10;
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
/* per ogni tipo, in ordine di disegno, le passate dal bordo verso il centro:
   [larghezza in m (per i fiumi è un fattore della larghezza del fiume), colore] */
const STILE_VIE3D={
  fiumi:[[1.6,'#a39d8f'],[1,'#4c6a70']],                         // greto di ghiaia, acqua
  canali:[[15,'#7c8668'],[10,'#4f6b6e']],                       // argini erbosi, acqua
  urbane:[[5.5,'#5d5b58']],
  comunali:[[6,'#625f5a']],
  provinciali:[[6.5,'#625f5a']],
  statali:[[10,'#7a776f'],[8,'#525153']],                        // banchina, asfalto
  ferrovie:[[8,'#7b7165'],[2.6,'#3e3833']],                      // massicciata, binari
  superstrade:[[21,'#837f75'],[18,'#4d4d4f'],[2,'#5e6a48']],      // banchina, asfalto, spartitraffico
  autostrade:[[28,'#86827a'],[25,'#4a4a4c'],[3.5,'#5b6845']],
};
// colori degli edifici e del fondo delle aree urbane
const TETTI=['#9c4a32','#a0583f','#8a4a36','#a8664e','#7f4b3d','#94604c','#74706b'];  // coppi; l'ultimo è un tetto piano grigio
const TETTI_IND=['#b8b9b4','#a3a7a8','#c9c8c2','#8e979e','#d6d4cc'];
const MURI=[0xf1e7d0,0xe8d5b0,0xf4f1ea,0xd9c7a7,0xe6dccb,0xe3c9a0,0xd8b48c,0xcfc4b6];
const MURI_IND=[0xc8c6bf,0xb9bcbd,0xd5d2ca,0xbfb8aa];
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
      const v=decodifica(l.p);v.cat=cat;
      v.w=cat==='fiumi'?larghezzaFiume(l.r||''):1;
      // mezza larghezza "ingombrata" (dove non si costruisce)
      v.ing=(cat==='fiumi'?v.w*1.6:STILE_VIE3D[cat][0][0])/2;
      v.strada=cat!=='fiumi'&&cat!=='canali'&&cat!=='ferrovie';
      linee.push(v);
    }
  }
  const aree=[];
  const AB=window.ABITATI||{};
  for(const tipo of ['residenziale','industriale']){
    for(const p of (AB[tipo]||[])){
      // un contorno solo, oppure più contorni (multipoligono: buchi con la regola pari/dispari)
      const an=(Array.isArray(p[0])?p:[p]).map(decodifica);
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
  const unif={uVie:{value:tex},uVieO:{value:new THREE.Vector3(1e9,1e9,TS)}};

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

  /* ---------- edifici generati ----------
     ogni edificio: x, z, larghezza (lungo la strada), profondità, altezza, rotazione, colori */
  const ST=8;let E=new Float32Array(ST*65536),ne=0;
  function aggiungi(x,z,w,d,h,rot,tetto,muro,ind){
    if(ne*ST+ST>E.length){const n=new Float32Array(E.length*2);n.set(E);E=n;}
    const o=ne*ST;E[o]=x;E[o+1]=z;E[o+2]=w;E[o+3]=d;E[o+4]=h;E[o+5]=rot;E[o+6]=tetto+16*muro;E[o+7]=ind;ne++;
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
        for(let b=0;b<nl;b++)for(let a=0;a<nl;a++){
          const li=gi*nl+a,lk=gj*nl+b;
          const h1=H(li*7+(industria?3:0),lk*13+1),h2=H(li+911,lk-377),h3=H(li-53,lk+71),h4=H(li*3+5,lk*5-9);
          let w,d,h,tetto,muro;
          if(industria){
            w=22+h2*28;d=16+h3*20;h=7+h4*5;
            tetto=(h1*97|0)%TETTI_IND.length;muro=(h4*31|0)%MURI_IND.length;
          }else{
            w=lerp(9,20,fitto)+h2*lerp(4,8,fitto);d=lerp(8,15,fitto)+h3*4;
            h=t<0.25?5.5+h4*3.5:lerp(8,24,t)*(0.75+0.5*h4);
            tetto=(h1*97|0)%(TETTI.length-1);
            if(t>0.5&&h3<0.35)tetto=TETTI.length-1; // in città qualche tetto piano
            muro=(h4*53|0)%MURI.length;
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
          const rot=qDir?Math.atan2(-qDz,qDx):h4*Math.PI;  // facciata parallela alla strada
          aggiungi(x,z,w,d,h,rot,tetto,muro,industria?1:0);
        }
      }
      if(j%12===11) yield;
    }
  }


  /* ---------- edifici in 3D: due copie, come la griglia del terreno ---------- */
  const geoMuro=new THREE.BoxGeometry(1,1,1).translate(0,0.5,0);
  const geoTetto=(()=>{ // tetto a due falde, colmo lungo x
    const A=[-.5,0,-.5],B=[.5,0,-.5],C=[.5,0,.5],D=[-.5,0,.5],R1=[-.5,1,0],R2=[.5,1,0];
    const tri=[A,R1,R2, A,R2,B, D,C,R2, D,R2,R1, A,D,R1, B,R2,C];
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tri.flat()),3));
    geo.computeVertexNormals();
    return geo;
  })();
  const matEd=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0,flatShading:true});
  const cTetti=TETTI.map(c=>new THREE.Color(c)),cTettiInd=TETTI_IND.map(c=>new THREE.Color(c));
  const cMuri=MURI.map(c=>new THREE.Color(c)),cMuriInd=MURI_IND.map(c=>new THREE.Color(c));
  function istanze(geo){
    const im=new THREE.InstancedMesh(geo,matEd,MAX3D);
    im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(MAX3D*3),3);
    im.count=0;im.frustumCulled=false;im.visible=false;scene.add(im);
    return im;
  }
  const copie=[{muri:istanze(geoMuro),tetti:istanze(geoTetto)},{muri:istanze(geoMuro),tetti:istanze(geoTetto)}];
  let visibile=0;
  function matrice(a,o,x,y,z,c,s,sx,sy,sz){
    a[o]=c*sx;a[o+1]=0;a[o+2]=-s*sx;a[o+3]=0;
    a[o+4]=0;a[o+5]=sy;a[o+6]=0;a[o+7]=0;
    a[o+8]=s*sz;a[o+9]=0;a[o+10]=c*sz;a[o+11]=0;
    a[o+12]=x;a[o+13]=y;a[o+14]=z;a[o+15]=1;
  }
  function* costruisci3D(cp,cx,cz){
    const mm=cp.muri.instanceMatrix.array,mc=cp.muri.instanceColor.array;
    const tm=cp.tetti.instanceMatrix.array,tc=cp.tetti.instanceColor.array;
    // in città gli edifici sono troppi: si accorcia il raggio finché ci stanno (prima i più vicini)
    const conta=new Uint32Array(46);
    for(let e=0;e<ne;e++){const dx=E[e*ST]-cx,dz=E[e*ST+1]-cz,k=Math.floor(Math.sqrt(dx*dx+dz*dz)/100);if(k<45)conta[k]++;}
    let raggio=RAGGIO3D;
    for(let k=0,tot=0;k<45;k++){tot+=conta[k];if(tot>MAX3D){raggio=k*100;break;}}
    const R2=raggio*raggio;let n=0;
    for(let e=0;e<ne&&n<MAX3D;e++){
      const o=e*ST,x=E[o],z=E[o+1],dx=x-cx,dz=z-cz;
      if(dx*dx+dz*dz>R2) continue;
      const w=E[o+2],d=E[o+3],h=E[o+4],r=E[o+5],ind=E[o+7]>0,ti=E[o+6]%16,mi=(E[o+6]/16)|0;
      const y=T.meshH(x,z),c=Math.cos(r),s=Math.sin(r);
      const var_=0.9+0.2*T.hash(x|0,z|0);
      matrice(mm,n*16,x,y-4,z,c,s,w,h+4,d);
      const cm=(ind?cMuriInd:cMuri)[mi];mc[n*3]=cm.r*var_;mc[n*3+1]=cm.g*var_;mc[n*3+2]=cm.b*var_;
      const piano=ind||ti===TETTI.length-1;
      matrice(tm,n*16,x,y+h,z,c,s,w*(piano?1:1.06),piano?0.7:Math.min(d*0.32,4.5),d*(piano?1:1.08));
      const ct=(ind?cTettiInd:cTetti)[ti];tc[n*3]=ct.r*var_;tc[n*3+1]=ct.g*var_;tc[n*3+2]=ct.b*var_;
      n++;
      if(n%4000===0) yield;
    }
    for(const im of [cp.muri,cp.tetti]){im.count=n;im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;}
  }

  /* ---------- disegno dell'immagine ---------- */
  function* disegnaImmagine(x0,z0,X1,Z1){
    const k=PX/TS;
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,PX,PX);
    g.setTransform(k,0,0,k,-x0*k,-z0*k);
    // fondo delle aree urbane
    g.globalAlpha=0.85;
    for(const tipo of ['residenziale','industriale']){
      g.fillStyle=FONDO[tipo];
      const tracciato=a=>{for(const r of a.anelli){g.moveTo(r.xs[0],r.zs[0]);for(let i=1;i<r.xs.length;i++)g.lineTo(r.xs[i],r.zs[i]);g.closePath();}};
      g.beginPath(); // aree semplici tutte insieme
      for(const a of aree)if(a.tipo===tipo&&a.anelli.length===1&&!fuori(a.box,x0,z0,X1,Z1,0))tracciato(a);
      g.fill();
      for(const a of aree)if(a.tipo===tipo&&a.anelli.length>1&&!fuori(a.box,x0,z0,X1,Z1,0)){g.beginPath();tracciato(a);g.fill('evenodd');}
    }
    g.globalAlpha=1;
    // dove ci sono edifici veri: macchia sfumata (quadrati di 100 m ingranditi con smussatura)
    if(DEN&&fin&&fin.W&&fin.H){
      const pc=document.createElement('canvas');pc.width=fin.W;pc.height=fin.H;
      const pg=pc.getContext('2d'),img=pg.createImageData(fin.W,fin.H),col=new THREE.Color(FONDO.residenziale);
      for(let j=0;j<fin.H;j++)for(let i=0;i<fin.W;i++){
        const v=DEN[(fin.j0+j)*DS.larghezza+fin.i0+i],o=(j*fin.W+i)*4;
        img.data[o]=col.r*255;img.data[o+1]=col.g*255;img.data[o+2]=col.b*255;
        img.data[o+3]=Math.min(215,v*3.2);
      }
      pg.putImageData(img,0,0);
      g.imageSmoothingEnabled=true;
      g.drawImage(pc,fin.ox,fin.oz,fin.W*DS.passo,fin.H*DS.passo);
    }
    yield;
    // tetti visti dall'alto (servono da lontano, dove gli edifici non sono in 3D)
    let q=0;
    for(let ind=0;ind<2;ind++){
      const tinte=ind?TETTI_IND:TETTI;
      for(let t=0;t<tinte.length;t++){
        g.fillStyle=tinte[t];
        for(let e=0;e<ne;e++){
          const o=e*ST;
          if(E[o+7]!==ind||E[o+6]%16!==t) continue;
          const c=Math.cos(E[o+5])*k,s=Math.sin(E[o+5])*k;
          g.setTransform(c,-s,s,c,(E[o]-x0)*k,(E[o+1]-z0)*k);
          g.fillRect(-E[o+2]/2,-E[o+3]/2,E[o+2],E[o+3]);
          if(++q%6000===0) yield;
        }
      }
    }
    g.setTransform(k,0,0,k,-x0*k,-z0*k);
    // vie
    g.lineJoin='round';g.lineCap='round';
    for(const cat of Object.keys(STILE_VIE3D)){
      const vis=linee.filter(v=>v.cat===cat&&!fuori(v.box,x0,z0,X1,Z1,50));
      for(const [w,col] of STILE_VIE3D[cat]){
        g.strokeStyle=col;
        if(cat!=='fiumi'){ // stessa larghezza: un solo tracciato
          g.lineWidth=w;g.beginPath();
          for(const v of vis){g.moveTo(v.xs[0],v.zs[0]);for(let i=1;i<v.xs.length;i++)g.lineTo(v.xs[i],v.zs[i]);}
          g.stroke();
        }else for(const v of vis){
          g.lineWidth=w*v.w;g.beginPath();g.moveTo(v.xs[0],v.zs[0]);
          for(let i=1;i<v.xs.length;i++)g.lineTo(v.xs[i],v.zs[i]);
          g.stroke();
        }
      }
      yield;
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
        sh.fragmentShader='varying vec2 vXZ;\nuniform sampler2D uVie;\nuniform vec3 uVieO;\n'+sh.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n'+
          'vec2 tuv=(vXZ-uVieO.xy)/uVieO.z; tuv.y=1.0-tuv.y;\n'+
          'vec4 tv=texture2D(uVie,tuv);\n'+
          'tv*=1.0-smoothstep(0.42,0.5,max(abs(tuv.x-0.5),abs(tuv.y-0.5)));\n'+ // sfuma verso il bordo
          'diffuseColor.rgb=diffuseColor.rgb*(1.0-tv.a)+tv.rgb;');
      };
    },
    // prepara tutto attorno a (cx, cz), a pezzi per non bloccare il fotogramma
    *disegna(cx,cz){
      const x0=cx-TS/2,z0=cz-TS/2,X1=x0+TS,Z1=z0+TS;
      pronto=null;
      grigliaVie(x0,z0,X1,Z1);yield;
      yield* generaEdifici(x0,z0,X1,Z1);
      yield* disegnaImmagine(x0,z0,X1,Z1);
      yield* costruisci3D(copie[1-visibile],cx,cz);
      pronto=[x0,z0];
    },
    // da chiamare quando la griglia nuova diventa visibile
    applica(){
      if(!pronto) return;
      unif.uVieO.value.set(pronto[0],pronto[1],TS);tex.needsUpdate=true;pronto=null;
      visibile=1-visibile;
      for(let i=0;i<2;i++){copie[i].muri.visible=copie[i].tetti.visible=i===visibile;}
    },
  };
};
})();
