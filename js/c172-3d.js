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
   MODELLO ESTERNO DEL CESSNA 172 (usato da creaAereo in js/mondo.js).
   Forme ricavate dalle misure vere: apertura 11 m, lunghezza 8,3 m,
   ala NACA 2412 con parte interna a corda costante e parte esterna
   rastremata, diedro 1,7°, deriva a freccia con pinna dorsale.
   Assi come nel gioco: x destra, y su, z coda (muso verso -z).
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
SIM.creaModelloAereo=function(opz){
  opz=opz||{};
  const reg=opz.registrazione||'I-VOLO';
  const gr=new THREE.Group(), fus=new THREE.Group();gr.add(fus);
  const mat=(c,r,m,extra)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:r,metalness:m||0,side:THREE.DoubleSide},extra||{}));
  const mB=mat(0xf4f3ee,.38), mVetro=mat(0x24384c,.06,.65), mS=mat(0x2b3138,.35,.5), mG=mat(0x1a1a1a,.85),
        mMet=mat(0xb9bdc3,.3,.8), mScuro=mat(0x15181c,.7), mElica=mat(0x30343a,.5,.3);
  const add=(geo,m,x,y,z,par)=>{const o=new THREE.Mesh(geo,m);o.position.set(x||0,y||0,z||0);(par||gr).add(o);return o;};
  const geoDa=(pos,idx)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    if(idx)g.setIndex(idx);g.computeVertexNormals();return g;};

  /* ---------- fusoliera: sezioni "quasi rettangolari" (superellisse) lungo z ---------- */
  //  z      sopra   sotto  mezza larg.  esponente (più alto = più squadrato)
  const ST=[
    [-3.02, 0.20, -0.30, 0.36, 2.2],
    [-2.90, 0.26, -0.38, 0.42, 2.4],
    [-2.60, 0.31, -0.44, 0.48, 2.6],
    [-2.20, 0.36, -0.48, 0.52, 2.8],
    [-1.95, 0.40, -0.50, 0.54, 3.0],
    [-1.60, 0.62, -0.51, 0.56, 3.2],
    [-1.25, 0.79, -0.51, 0.57, 3.4],
    [-0.80, 0.82, -0.50, 0.57, 3.4],
    [-0.20, 0.82, -0.47, 0.56, 3.4],
    [ 0.30, 0.79, -0.42, 0.53, 3.2],
    [ 0.90, 0.64, -0.32, 0.47, 3.0],
    [ 1.60, 0.50, -0.20, 0.38, 2.8],
    [ 2.40, 0.44, -0.04, 0.29, 2.6],
    [ 3.20, 0.41,  0.09, 0.21, 2.5],
    [ 4.00, 0.39,  0.20, 0.13, 2.4],
    [ 4.60, 0.37,  0.28, 0.07, 2.3],
    [ 4.85, 0.355, 0.31, 0.035,2.2],
  ];
  const Z0=ST[0][0],Z1=ST[ST.length-1][0];
  const cr=(a,b,c,d,t)=>0.5*(2*b+(c-a)*t+(2*a-5*b+4*c-d)*t*t+(3*b-a-3*c+d)*t*t*t);
  function sez(z){
    z=Math.max(Z0,Math.min(Z1,z));
    let i=0;while(i<ST.length-2&&z>ST[i+1][0])i++;
    const t=(z-ST[i][0])/(ST[i+1][0]-ST[i][0]),g=k=>ST[Math.max(0,Math.min(ST.length-1,k))];
    const v=j=>cr(g(i-1)[j],g(i)[j],g(i+1)[j],g(i+2)[j],t);
    return {top:v(1),bot:v(2),hw:Math.max(0.005,v(3)),n:v(4)};
  }
  const pw=(c,e)=>Math.sign(c)*Math.pow(Math.abs(c),e);
  function punto(z,a){
    const s=sez(z),e=2/s.n,yc=(s.top+s.bot)/2,hh=(s.top-s.bot)/2;
    return new THREE.Vector3(s.hw*pw(Math.cos(a),e),yc+hh*pw(Math.sin(a),e),z);
  }
  function normale(z,a){
    const da=punto(z,a+0.01).sub(punto(z,a-0.01)),dz=punto(z+0.01,a).sub(punto(z-0.01,a));
    return da.cross(dz).normalize();
  }
  // x della superficie a quota y (fianco), per appoggiare i finestrini
  function fiancoX(z,y){const s=sez(z),yc=(s.top+s.bot)/2,hh=(s.top-s.bot)/2,t=Math.min(0.999,Math.abs((y-yc)/hh));
    return s.hw*Math.pow(1-Math.pow(t,s.n),1/s.n);}
  // telo della fusoliera tra z0 e z1 e tra gli angoli a0 e a1, con coordinate di texture "viste di fianco"
  function telo(z0,z1,nz,a0,a1,na,off,uv){
    const pos=[],uvs=[],idx=[];
    for(let i=0;i<=nz;i++){const z=z0+(z1-z0)*i/nz;
      for(let j=0;j<=na;j++){const a=a0+(a1-a0)*j/na,p=punto(z,a);
        if(off)p.addScaledVector(normale(z,a),off);
        pos.push(p.x,p.y,p.z);if(uv)uvs.push(...uv(p));}}
    for(let i=0;i<nz;i++)for(let j=0;j<na;j++){const a=i*(na+1)+j,b=a+na+1;idx.push(a,a+1,b,a+1,b+1,b);}
    const g=geoDa(pos,idx);if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return g;
  }

  /* ---------- livrea: due canvas (fianco destro e sinistro) in coordinate z/y ---------- */
  const YB=-0.6,YT=0.9,LZ=Z1-Z0+0.2;
  const uvD=p=>[(Z1+0.1-p.z)/LZ,(p.y-YB)/(YT-YB)], uvS=p=>[(p.z-Z0+0.1)/LZ,(p.y-YB)/(YT-YB)];
  function livrea(destro){
    const W=2048,H=Math.round(W*(YT-YB)/LZ*2),cv=document.createElement('canvas');cv.width=W;cv.height=H;
    const g=cv.getContext('2d'),px=z=>destro?(Z1+0.1-z)/LZ*W:(z-Z0+0.1)/LZ*W,py=y=>(YT-y)/(YT-YB)*H;
    g.fillStyle='#f4f3ee';g.fillRect(0,0,W,H);
    // fascia: dritta lungo cofano e cabina, poi sale verso la coda
    const fascia=(d0,d1,col)=>{
      const lin=[[-3.1,-0.10],[0.4,-0.10],[1.6,-0.07],[2.8,0.0],[4.95,0.27]];
      g.beginPath();lin.forEach(([z,y],k)=>g[k?'lineTo':'moveTo'](px(z),py(y+d1)));
      for(let k=lin.length-1;k>=0;k--)g.lineTo(px(lin[k][0]),py(lin[k][1]+d0));
      g.closePath();g.fillStyle=col;g.fill();
    };
    fascia(0,0.10,'#1d3f78');fascia(-0.065,-0.03,'#c4302b');
    // linee di pannelli: cofano, porta
    g.strokeStyle='rgba(60,70,80,.55)';g.lineWidth=2;
    g.beginPath();g.moveTo(px(-1.97),py(0.45));g.lineTo(px(-1.97),py(-0.55));g.stroke();
    g.strokeRect(Math.min(px(-1.55),px(-0.22)),py(0.80),Math.abs(px(-0.22)-px(-1.55)),py(-0.38)-py(0.80));
    g.beginPath();g.moveTo(px(-0.42),py(0.05));g.lineTo(px(-0.30),py(0.05));g.lineWidth=5;g.stroke();   // maniglia
    // marche
    const hT=0.24,yc=0.25;
    g.fillStyle='#1d2b44';g.font='bold '+Math.round(hT/(YT-YB)*H*1.3)+'px Arial, Helvetica, sans-serif';
    g.textAlign='center';g.textBaseline='middle';g.fillText(reg,px(2.0),py(yc));
    const t=new THREE.CanvasTexture(cv);t.anisotropy=8;return t;
  }
  const mFusD=mat(0xffffff,.38,0,{map:livrea(true)}),mFusS=mat(0xffffff,.38,0,{map:livrea(false)});
  const PI=Math.PI,ZC=-1.95;   // davanti a ZC c'è il cofano (visibile anche dalla cabina)
  for(const [za,zb,par,nz] of [[Z0,ZC,gr,24],[ZC,Z1,fus,110]]){
    add(telo(za,zb,nz,-PI/2,PI/2,40,0,uvD),mFusD,0,0,0,par);
    add(telo(za,zb,nz,PI/2,3*PI/2,40,0,uvS),mFusS,0,0,0,par);
  }
  // chiusure davanti (muso) e dietro (coda)
  function tappo(z,m,par){const pos=[],c=punto(z,PI/2).add(punto(z,-PI/2)).multiplyScalar(0.5);
    for(let j=0;j<48;j++){const a=punto(z,j/48*2*PI),b=punto(z,(j+1)/48*2*PI);pos.push(c.x,c.y,c.z,a.x,a.y,a.z,b.x,b.y,b.z);}
    return add(geoDa(pos),m,0,0,0,par);}
  tappo(Z0,mB,gr);tappo(Z1,mB,fus);
  // prese d'aria ai lati dell'ogiva
  for(const sx of [-1,1])add(new THREE.CircleGeometry(0.1,16).scale(1.15,0.7,1).rotateY(PI),mScuro,sx*0.22,-0.03,Z0-0.004);
  // presa sotto il cofano
  add(new THREE.BoxGeometry(0.3,0.06,0.25),mScuro,0,-0.36,-2.85);

  /* ---------- vetri ---------- */
  add(telo(-1.92,-1.29,10,0.62,PI-0.62,24,0.012),mVetro,0,0,0,fus);   // parabrezza
  add(telo(0.30,1.25,10,0.95,PI-0.95,16,0.012),mVetro,0,0,0,fus);     // lunotto
  function finestrino(poli){
    for(const sx of [-1,1]){
      const v2=poli.map(([z,y])=>new THREE.Vector2(z,y)),tri=THREE.ShapeUtils.triangulateShape(v2,[]),pos=[],N=6;
      for(const t of tri){const [A,B,C]=t.map(i=>poli[i]);
        const P=(u,v)=>{const z=A[0]+(B[0]-A[0])*u+(C[0]-A[0])*v,y=A[1]+(B[1]-A[1])*u+(C[1]-A[1])*v;return [sx*(fiancoX(z,y)+0.012),y,z];};
        for(let i=0;i<N;i++)for(let j=0;j<N-i;j++){
          pos.push(...P(i/N,j/N),...P((i+1)/N,j/N),...P(i/N,(j+1)/N));
          if(j<N-i-1)pos.push(...P((i+1)/N,j/N),...P((i+1)/N,(j+1)/N),...P(i/N,(j+1)/N));}}
      add(geoDa(pos),mVetro,0,0,0,fus);
    }
  }
  finestrino([[-1.50,0.30],[-0.30,0.30],[-0.30,0.74],[-1.08,0.74]]);   // porta
  finestrino([[-0.16,0.30],[0.78,0.33],[0.42,0.72],[-0.16,0.74]]);     // posteriore

  /* ---------- superfici portanti con profilo NACA ---------- */
  function naca(s,t,m,p){
    const yt=5*t*(0.2969*Math.sqrt(s)-0.126*s-0.3516*s*s+0.2843*s*s*s-0.1036*s*s*s*s);
    const yc=m?(s<p?m/(p*p)*(2*p*s-s*s):m/((1-p)*(1-p))*((1-2*p)+2*p*s-s*s)):0;
    return [yc+yt,yc-yt];
  }
  // st: {sp (apertura), q (quota della corda o x per le verticali), zLE, c, s0, s1, t}; vert: superficie verticale
  function superficie(stazioni,m,p,vert,piv){
    const K=14,anelli=stazioni.map(st=>{
      const pts=[];
      for(let k=0;k<=K;k++){const s=st.s0+(st.s1-st.s0)*(1-Math.cos(PI*k/K))/2;pts.push([s,naca(s,st.t,m,p)[0]]);}
      for(let k=K;k>=0;k--){const s=st.s0+(st.s1-st.s0)*(1-Math.cos(PI*k/K))/2;pts.push([s,naca(s,st.t,m,p)[1]]);}
      return pts.map(([s,y])=>{const z=st.zLE+st.c*s,o=st.c*y;
        const v=vert?[o,st.sp,z]:[st.sp,st.q+o,z];return [v[0]-piv[0],v[1]-piv[1],v[2]-piv[2]];});
    });
    const pos=[],tri=(a,b,c)=>pos.push(...a,...b,...c),n=anelli[0].length;
    for(let i=1;i<anelli.length;i++)for(let k=0;k<n-1;k++){const a=anelli[i-1],b=anelli[i];tri(a[k],b[k],b[k+1]);tri(a[k],b[k+1],a[k+1]);}
    // tappi alle estremità
    for(const [ri,st] of [[0,stazioni[0]],[anelli.length-1,stazioni[stazioni.length-1]]]){
      const r=[];for(const v of anelli[ri]){const u=r[r.length-1];if(!u||Math.hypot(u[0]-v[0],u[1]-v[1],u[2]-v[2])>1e-5)r.push(v);}
      if(Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1],r[0][2]-r[r.length-1][2])<1e-5)r.pop();
      const c2=r.map(v=>new THREE.Vector2(v[2],vert?v[0]:v[1]));
      for(const t of THREE.ShapeUtils.triangulateShape(c2,[]))tri(r[t[0]],r[t[1]],r[t[2]]);
    }
    return geoDa(pos);
  }
  const DIE=Math.tan(1.7*PI/180),YA=0.87;
  // ala destra: x 0,5 radice, 2,6 fine della parte a corda costante, 5,4 estremità
  function stAla(x,s0,s1,t){
    const zLE=x<=2.6?-1.25:-1.25+0.38*(x-2.6)/2.8,c=0.38-zLE;
    const s=v=>v==='h'?(0-zLE)/c:v;
    return {sp:x,q:YA+DIE*(x-0.5),zLE,c,s0:s(s0),s1:s(s1),t:t||0.12};
  }
  const ali=[];
  for(const sx of [-1,1]){
    const g=superficie([stAla(0.45,0,'h'),stAla(2.6,0,'h'),stAla(5.35,0,'h'),stAla(5.42,0,1),
      Object.assign(stAla(5.5,0,1,0.05),{zLE:-0.80,c:1.10})],0.02,0.4,false,[0,0,0]);
    if(sx<0)g.scale(-1,1,1).computeVertexNormals();
    ali.push(add(g,mB));
  }
  // tratto centrale sopra il tetto: l'ala del 172 è un pezzo unico da un'estremità all'altra
  // (dentro la fusoliera, così sparisce con lei nella vista dalla cabina; serve anche all'ombra)
  for(const sx of [-1,1]){
    const g=superficie([stAla(0,0,1),stAla(0.56,0,1)],0.02,0.4,false,[0,0,0]);
    if(sx<0)g.scale(-1,1,1).computeVertexNormals();
    add(g,mB,0,0,0,fus);
  }
  // superfici mobili: perno sulla cerniera (z = 0 per l'ala)
  function mobile(st,m,p,vert,piv){
    const o=new THREE.Group();o.position.set(...piv);gr.add(o);
    const ms=new THREE.Mesh(superficie(st,m,p,vert,piv),mB);o.add(ms);return {piv:o,ms};
  }
  const pernoAla=(x0,x1)=>[0,YA+DIE*((x0+x1)/2-0.5)+0.02,0];
  const flD=mobile([stAla(0.55,'h',1),stAla(2.95,'h',1)],0.02,0.4,false,pernoAla(0.55,2.95)).piv;
  const alD=mobile([stAla(3.0,'h',1),stAla(5.34,'h',1)],0.02,0.4,false,pernoAla(3.0,5.34)).piv;
  const flS=mobile([stAla(0.55,'h',1),stAla(2.95,'h',1)],0.02,0.4,false,pernoAla(0.55,2.95));flS.ms.geometry.scale(-1,1,1).computeVertexNormals();
  const alS=mobile([stAla(3.0,'h',1),stAla(5.34,'h',1)],0.02,0.4,false,pernoAla(3.0,5.34));alS.ms.geometry.scale(-1,1,1).computeVertexNormals();

  // stabilizzatore orizzontale (profilo simmetrico) e equilibratore
  const YS=0.36,ZH=4.32;
  const stSt=(x,s0,s1,t)=>{const zLE=3.55+0.40*(x-0.1)/1.62,TE=4.85-0.15*(x-0.1)/1.62,c=TE-zLE,s=v=>v==='h'?(ZH-zLE)/c:v;
    return {sp:x,q:YS,zLE,c,s0:s(s0),s1:s(s1),t:t||0.09};};
  for(const sx of [-1,1]){
    const g=superficie([stSt(0.05,0,'h'),stSt(1.66,0,'h'),stSt(1.70,0,1),Object.assign(stSt(1.74,0,1,0.04),{zLE:4.02,c:0.62})],0,0,false,[0,0,0]);
    if(sx<0)g.scale(-1,1,1).computeVertexNormals();add(g,mB);
  }
  const elevG=new THREE.Group();elevG.position.set(0,YS,ZH);gr.add(elevG);
  for(const sx of [-1,1]){const g=superficie([stSt(0.08,'h',1),stSt(1.66,'h',1)],0,0,false,[0,YS,ZH]);if(sx<0)g.scale(-1,1,1).computeVertexNormals();elevG.add(new THREE.Mesh(g,mB));}
  const elev=elevG;

  // deriva a freccia e timone
  const ZT=4.40;
  const stDe=(y,s0,s1,t)=>{const k=(y-0.38)/1.5,zLE=3.15+0.87*k,TE=4.86-0.14*k,c=TE-zLE,s=v=>v==='h'?(ZT-zLE)/c:v;
    return {sp:y,zLE,c,s0:s(s0),s1:s(s1),t:t||0.09};};
  add(superficie([stDe(0.30,0,'h'),stDe(1.86,0,'h'),stDe(1.88,0,1),Object.assign(stDe(1.93,0,1,0.04),{zLE:4.10,c:0.58})],0,0,true,[0,0,0]),mB,0,0,0,fus);
  const timG=new THREE.Group();timG.position.set(0,0,ZT);gr.add(timG);
  timG.add(new THREE.Mesh(superficie([stDe(0.44,'h',1),stDe(1.86,'h',1)],0,0,true,[0,0,ZT]),mB));
  const tim=timG;
  // pinna dorsale
  {const sh=new THREE.Shape([[1.70,0.43],[3.42,0.84],[3.55,0.36],[1.70,0.38]].map(([z,y])=>new THREE.Vector2(z,y)));
   const g=new THREE.ExtrudeGeometry(sh,{depth:0.04,bevelEnabled:true,bevelThickness:0.02,bevelSize:0.015,bevelSegments:2}).rotateY(-PI/2).translate(0.02,0,0);
   add(g,mB,0,0,0,fus);}

  /* ---------- montanti delle ali ---------- */
  for(const sx of [-1,1]){
    const a=new THREE.Vector3(sx*0.50,-0.30,-0.50),b=new THREE.Vector3(sx*2.62,YA+DIE*2.1-0.07,-0.62),d=b.clone().sub(a),L=d.length();
    const g=new THREE.CylinderGeometry(1,1,L,12).scale(0.022,1,0.06);
    const m=add(g,mB,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  }

  /* ---------- carrello: gambe a balestra, ruote, carenature a goccia ---------- */
  const goccia=(L,R)=>{const pts=[[0,0],[0.5,0.05],[0.85,0.16],[1,0.34],[0.92,0.52],[0.65,0.74],[0.28,0.93],[0,1]].map(([r,y])=>new THREE.Vector2(r*R,y*L));
    return new THREE.LatheGeometry(pts,20).rotateX(PI/2);};
  for(const sx of [-1,1]){
    // gamba piatta e curva: due tratti
    const p0=new THREE.Vector3(sx*0.42,-0.45,0.28),p1=new THREE.Vector3(sx*0.95,-0.92,0.30),p2=new THREE.Vector3(sx*1.17,-1.20,0.30);
    for(const [a,b] of [[p0,p1],[p1,p2]]){const d=b.clone().sub(a),L=d.length();
      const m=add(new THREE.BoxGeometry(0.035,L+0.04,0.10),mB,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
    add(new THREE.CylinderGeometry(0.25,0.25,0.15,20).rotateZ(PI/2),mG,sx*1.25,-1.2,0.3);
    add(new THREE.CylinderGeometry(0.11,0.11,0.16,14).rotateZ(PI/2),mMet,sx*1.25,-1.2,0.3);
    add(goccia(0.9,0.235).scale(0.6,1,1),mB,sx*1.25,-1.12,0.3-0.33);
  }
  // ruotino: ammortizzatore, forcella, ruota, carenatura
  {const a=new THREE.Vector3(0,-0.42,-2.10),b=new THREE.Vector3(0,-1.02,-1.74),d=b.clone().sub(a),L=d.length();
   const m=add(new THREE.CylinderGeometry(0.045,0.045,L,10),mMet,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
   m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
   add(new THREE.CylinderGeometry(0.075,0.06,0.22,10),mS,0,-0.5,-2.06);
   add(new THREE.CylinderGeometry(0.22,0.22,0.12,18).rotateZ(PI/2),mG,0,-1.23,-1.7);
   add(new THREE.CylinderGeometry(0.09,0.09,0.13,12).rotateZ(PI/2),mMet,0,-1.23,-1.7);
   add(goccia(0.72,0.2).scale(0.58,1,1),mB,0,-1.15,-1.7-0.26);}
  // scarico
  add(new THREE.CylinderGeometry(0.035,0.035,0.25,8).rotateX(0.5),mMet,0.16,-0.50,-2.25);

  /* ---------- elica e ogiva ---------- */
  const elica=new THREE.Group();elica.position.set(0,-0.05,Z0-0.04);gr.add(elica);
  {const pts=[[0.2,0],[0.195,0.07],[0.17,0.17],[0.12,0.27],[0.06,0.34],[0,0.37]].map(([r,y])=>new THREE.Vector2(r,y));
   add(new THREE.LatheGeometry(pts,24).rotateX(-PI/2),mat(0xc4302b,.3,.2),0,0,0.04,elica);}
  const pale=new THREE.Group();elica.add(pale);
  {const sh=new THREE.Shape();sh.moveTo(-0.045,0.12);sh.lineTo(0.05,0.12);sh.quadraticCurveTo(0.09,0.35,0.07,0.6);
   sh.quadraticCurveTo(0.055,0.86,0.03,0.93);sh.quadraticCurveTo(0,0.95,-0.025,0.93);sh.quadraticCurveTo(-0.05,0.6,-0.045,0.12);
   for(const r of [0,PI]){const g=new THREE.ExtrudeGeometry(sh,{depth:0.012,bevelEnabled:true,bevelThickness:0.006,bevelSize:0.006,bevelSegments:1,curveSegments:6})
     .translate(0,0,-0.006).rotateY(0.42).rotateZ(r);
     pale.add(new THREE.Mesh(g,mElica));
     const punta=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.05,0.03).rotateY(0.42),mat(0xe8e8e8,.4));punta.position.set(0,0.86,0).applyAxisAngle(new THREE.Vector3(0,0,1),r);pale.add(punta);}}
  const disco=new THREE.Mesh(new THREE.CircleGeometry(0.95,40),new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.16,depthWrite:false,side:THREE.DoubleSide}));
  elica.add(disco);disco.visible=false;

  /* ---------- dettagli: antenne, pitot, faro, luci ---------- */
  for(const z of [-0.55,0.05]){const m=add(new THREE.BoxGeometry(0.012,0.24,0.05).translate(0,0.12,0),mS,0,0.82,z,fus);m.rotation.x=-0.35;}
  add(new THREE.CylinderGeometry(0.012,0.012,0.35,6).rotateX(PI/2),mMet,-2.3,YA+DIE*1.8-0.06,-1.2);   // pitot
  add(new THREE.PlaneGeometry(0.22,0.07).rotateY(PI),new THREE.MeshBasicMaterial({color:0xfff6dc}),-2.0,YA+DIE*1.5+0.005,-1.262); // faro nel bordo d'attacco
  const luce=(c,x,y,z,r)=>add(new THREE.SphereGeometry(r||0.05,10,8),new THREE.MeshBasicMaterial({color:c}),x,y,z);
  const yT=YA+DIE*5.0;
  const luciNav=[luce(0xff2020,-5.52,yT,-0.72),luce(0x20ff40,5.52,yT,-0.72),luce(0xffffff,0,0.33,4.88,0.04)];
  const beacon=luce(0xff2a2a,0,1.98,4.30,0.06);
  const strobo=new THREE.Group();gr.add(strobo);
  for(const sx of [-1,1]){const s=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6),new THREE.MeshBasicMaterial({color:0xffffff}));s.position.set(sx*5.52,yT,-0.62);strobo.add(s);}

  luciNav.push(beacon,...strobo.children);   // per js/notte.js (più grandi di notte)
  return {gruppo:gr,fus,elev,tim,alS:alS.piv,alD,flS:flS.piv,flD,pale,disco,strobo,beacon,luciNav};
};
})();
