/* =====================================================================
   MODELLO ESTERNO E CABINA DELL'IKARUS C42 (usati da creaAereo in js/mondo.js
   quando l'aereo scelto è il C42, dati/c42.js).
   Misure vere: apertura 9,45 m, corda 1,32 m (ala rettangolare in tela),
   lunghezza circa 6,2 m, elica tripala da 1,7 m. La cabina è un "baccello"
   in composito con grandi vetri; dietro, un tubo di alluminio da 16,5 cm
   porta la coda. Ala alta controventata da due montanti a V per lato,
   carrello a balestra e ruotino comandato dai pedali.
   Assi come nel gioco: x destra, y su, z coda (muso verso -z); origine nel
   baricentro, ruote a terra a y = -1,15.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const PI=Math.PI;

SIM.creaModelloC42=function(opz){
  opz=opz||{};
  const reg=opz.registrazione||'I-A742';
  const gr=new THREE.Group(), fus=new THREE.Group();gr.add(fus);
  const mat=(c,r,m,extra)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:r,metalness:m||0,side:THREE.DoubleSide},extra||{}));
  const mB=mat(0xf6f6f2,.35), mTela=mat(0xf2f0e8,.75), mBlu=mat(0x1f4fa8,.45), mVetro=mat(0x2a4256,.05,.6,{transparent:true,opacity:0.55}),
        mTubo=mat(0xdfe2e6,.45,.15), mG=mat(0x1a1a1a,.85), mScuro=mat(0x2a2d31,.6), mElica=mat(0x23262a,.45,.2);
  const add=(geo,m,x,y,z,par)=>{const o=new THREE.Mesh(geo,m);o.position.set(x||0,y||0,z||0);(par||gr).add(o);return o;};
  const geoDa=(pos,idx)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    if(idx)g.setIndex(idx);g.computeVertexNormals();return g;};
  // tubo (o montante) fra due punti; sx, sz = schiacciamento della sezione (montanti a goccia)
  function tubo(a,b,r,m,par,sx,sz){
    const d=new THREE.Vector3().subVectors(b,a),L=d.length();
    const o=add(new THREE.CylinderGeometry(r,r,L,12).scale(sx||1,1,sz||1),m,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,par);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;
  }
  const v3=(x,y,z)=>new THREE.Vector3(x,y,z);

  /* ---------- baccello della cabina: sezioni superellisse lungo z (come in js/c172-3d.js) ---------- */
  //  z      sopra   sotto  mezza larg. esponente
  const ST=[
    [-2.08, 0.14, -0.18, 0.20, 2.2],
    [-1.95, 0.22, -0.32, 0.30, 2.5],
    [-1.70, 0.27, -0.42, 0.34, 2.8],
    [-1.40, 0.31, -0.48, 0.37, 3.0],
    [-1.10, 0.56, -0.58, 0.50, 3.2],
    [-0.75, 0.81, -0.63, 0.60, 3.4],
    [-0.45, 0.93, -0.65, 0.63, 3.5],
    [-0.05, 0.93, -0.64, 0.63, 3.5],
    [ 0.35, 0.90, -0.58, 0.58, 3.3],
    [ 0.70, 0.78, -0.40, 0.42, 3.0],
    [ 0.95, 0.58, -0.22, 0.25, 2.6],
    [ 1.15, 0.36, -0.10, 0.13, 2.3],
    [ 1.30, 0.17, -0.05, 0.085,2.2],
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
  function telo(z0,z1,nz,a0,a1,na,off){
    const pos=[],idx=[];
    for(let i=0;i<=nz;i++){const z=z0+(z1-z0)*i/nz;
      for(let j=0;j<=na;j++){const a=a0+(a1-a0)*j/na,p=punto(z,a);if(off)p.addScaledVector(normale(z,a),off);pos.push(p.x,p.y,p.z);}}
    for(let i=0;i<nz;i++)for(let j=0;j<na;j++){const a=i*(na+1)+j,b=a+na+1;idx.push(a,a+1,b,a+1,b+1,b);}
    return geoDa(pos,idx);
  }
  const ZV0=-1.38, ZV1=0.32, AV=0.12;   // vetri: parabrezza e porte (dalla linea del davanzale in su)
  add(telo(Z0,ZV0,16,0,2*PI,48),mB);                               // cofano del motore (visibile anche dalla cabina)
  add(telo(ZV0,ZV1,30,PI-AV,2*PI+AV,40),mB,0,0,0,fus);             // parte bassa della cabina
  add(telo(ZV0,ZV1,30,AV,PI-AV,40),mVetro,0,0,0,fus);              // vetri
  add(telo(ZV1,Z1,20,0,2*PI,48),mB,0,0,0,fus);                     // dietro la cabina, fino al tubo
  // cornici: montanti del parabrezza e delle porte, davanzale
  for(const [z0,z1] of [[-0.47,-0.42],[ZV1-0.05,ZV1]])for(const [a0,a1] of [[AV,1.1],[PI-1.1,PI-AV]])add(telo(z0,z1,1,a0,a1,8,0.004),mScuro,0,0,0,fus);
  for(const a of [AV,PI-AV])add(telo(ZV0,ZV1,20,a-0.03,a+0.03,1,0.004),mScuro,0,0,0,fus);
  // striscia blu sui fianchi
  for(const [a0,a1] of [[-0.42,-0.28],[PI+0.28,PI+0.42]])add(telo(-1.9,1.2,30,a0,a1,2,0.003),mBlu,0,0,0,fus);
  // marche sui fianchi dietro le porte
  {const cv=document.createElement('canvas');cv.width=512;cv.height=128;const c=cv.getContext('2d');
   c.font='700 92px "B612", Arial, sans-serif';c.fillStyle='#1b2a44';c.textAlign='center';c.textBaseline='middle';c.fillText(reg,256,68);
   const t=new THREE.CanvasTexture(cv),m=new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.FrontSide,depthWrite:false});
   for(const sx of [-1,1]){const p=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.125),m);
     // la lastra segue il restringimento del baccello (da z 0,30 a z 0,92)
     const zc=0.52,ang=Math.atan2(sez(zc-0.05).hw-sez(zc+0.05).hw,0.1);
     p.position.set(sx*(sez(zc).hw+0.02),0.2,zc);p.rotation.y=sx>0?PI/2-ang:-PI/2+ang;fus.add(p);}}

  /* ---------- tubo di coda ---------- */
  const tA=v3(0,0.06,1.1), tB=v3(0,0.14,4.12);
  tubo(tA,tB,0.0825,mTubo,fus);
  add(new THREE.SphereGeometry(0.0825,12,8),mTubo,tB.x,tB.y,tB.z,fus);

  /* ---------- superfici: lastre sottili con bordi arrotondati (tela su tubi) ---------- */
  function lastra(punti,spess,m,par){   // punti nel piano (u,v); la lastra è nel piano u-v, spessa in w
    const sh=new THREE.Shape(punti.map(([u,v])=>new THREE.Vector2(u,v)));
    const g=new THREE.ExtrudeGeometry(sh,{depth:spess,bevelEnabled:true,bevelThickness:spess*0.4,bevelSize:spess*0.4,bevelSegments:2,curveSegments:6});
    g.translate(0,0,-spess/2);return g;
  }
  // stabilizzatore orizzontale: nel piano x-z (u = x, v = -z), sopra il tubo
  const YS=0.20, ZE=3.80;
  for(const sx of [-1,1]){
    const pts=[[0.05,-3.22],[1.25,-3.30],[1.33,-3.42],[1.33,-3.80],[0.05,-3.80]].map(([u,v])=>[sx*u,v]);
    const g=lastra(pts,0.03,mTela).rotateX(PI/2);   // (u,v,w) -> (x, -w, v)... v = -z diventa z dopo la rotazione
    g.scale(1,1,-1);g.computeVertexNormals();add(g,mTela,0,YS,0,fus);
  }
  const elevG=new THREE.Group();elevG.position.set(0,YS,ZE);fus.add(elevG);
  for(const sx of [-1,1]){
    const pts=[[0.06,0.0],[1.33,0.0],[1.33,-0.22],[1.2,-0.30],[0.06,-0.30]].map(([u,v])=>[sx*u,v]);
    {const g=lastra(pts,0.022,mTela).rotateX(PI/2).scale(1,1,-1);g.computeVertexNormals();elevG.add(new THREE.Mesh(g,mTela));}
  }
  const elev=elevG;
  // deriva: nel piano y-z (u = -z, v = y), dritta sopra il tubo
  {const pts=[[-3.05,0.15],[-3.55,1.18],[-3.78,1.20],[-3.82,0.15]];
   const g=lastra(pts,0.035,mTela).rotateY(-PI/2);   // u -> z con segno: (u,v,w) -> (w, v, u)... u = -z
   g.scale(1,1,-1);g.computeVertexNormals();add(g,mTela,0,0,0,fus);}
  // pinna ventrale con il pattino di coda
  {const g=lastra([[-3.45,0.08],[-3.9,-0.25],[-4.02,-0.25],[-4.0,0.1]],0.03,mTela).rotateY(-PI/2);g.scale(1,1,-1);g.computeVertexNormals();add(g,mTela,0,0,0,fus);}
  const timG=new THREE.Group();timG.position.set(0,0,3.82);fus.add(timG);
  {const pts=[[0,0.0],[0,1.20],[-0.18,1.22],[-0.36,1.05],[-0.38,0.05],[-0.2,-0.05]];
   const g=lastra(pts,0.025,mTela).rotateY(-PI/2);g.scale(1,1,-1);g.computeVertexNormals();timG.add(new THREE.Mesh(g,mTela));
   // striscia blu sul timone
   const b=lastra([[-0.05,0.75],[-0.05,0.95],[-0.37,0.95],[-0.37,0.75]],0.028,mBlu).rotateY(-PI/2);b.scale(1,1,-1);b.computeVertexNormals();timG.add(new THREE.Mesh(b,mBlu));}
  const tim=timG;

  /* ---------- ala: profilo curvo, tela; parte fissa fino al 75 % della corda, poi flap e alettoni ---------- */
  const ZLE=-0.45, C=1.32, YA=0.93, DIE=Math.tan(1.5*PI/180);
  function naca(s,t,m,p){
    const yt=5*t*(0.2969*Math.sqrt(s)-0.126*s-0.3516*s*s+0.2843*s*s*s-0.1036*s*s*s*s);
    const yc=s<p?m/(p*p)*(2*p*s-s*s):m/((1-p)*(1-p))*((1-2*p)+2*p*s-s*s);
    return [yc+yt,yc-yt];
  }
  // sezione dell'ala da s0 a s1 (frazioni di corda), come forma nel piano (u = -z, v = y)
  function profilo(s0,s1,yBase,zBase){
    const K=16,su=[],giu=[];
    for(let k=0;k<=K;k++){const s=s0+(s1-s0)*(1-Math.cos(PI*k/K))/2,[a,b]=naca(s,0.13,0.045,0.4);
      su.push([-(ZLE+C*s-zBase),YA+C*a-yBase]);giu.push([-(ZLE+C*s-zBase),YA+C*b-yBase]);}
    return su.concat(giu.reverse());
  }
  // pezzo d'ala estruso lungo x, da x0 a x1
  function pezzo(s0,s1,x0,x1,m,piv){
    piv=piv||[0,0,0];
    const sh=new THREE.Shape(profilo(s0,s1,piv[1],piv[2]).map(([u,v])=>new THREE.Vector2(u,v)));
    const g=new THREE.ExtrudeGeometry(sh,{depth:x1-x0,bevelEnabled:false,curveSegments:4});
    // (u,v,w): u = -z, v = y, w = x
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i),w=p.getZ(i);p.setXYZ(i,x0+w-piv[0],v,-u);}
    g.computeVertexNormals();return g;
  }
  const S0=0.75, XF=0.63, XA=2.55, XT=4.62;   // fine della parte fissa, radice, fine flap/inizio alettone, estremità
  add(pezzo(0,1,-XF,XF,mTela),mTela);                   // tratto centrale sopra la cabina
  const flS=new THREE.Group(),flD=new THREE.Group(),alS=new THREE.Group(),alD=new THREE.Group();
  for(const sx of [-1,1]){
    const semi=new THREE.Group();semi.position.set(sx*XF,0,0);semi.rotation.z=sx*1.5*PI/180;gr.add(semi);   // diedro
    const g=pezzo(0,S0,0,XT-XF,mTela);if(sx<0)g.scale(-1,1,1).computeVertexNormals();   // specchiata: normali da rifare
    const o=new THREE.Mesh(g,mTela);o.position.x=0;semi.add(o);
    // estremità arrotondata (blu)
    const tip=new THREE.Mesh(new THREE.SphereGeometry(1,16,8,0,PI*2,0,PI/2).scale(0.08,0.14,C*0.5),mBlu);
    tip.rotation.z=-sx*PI/2;tip.position.set(sx*(XT-XF),YA+0.06,ZLE+C*0.5);semi.add(tip);
    // flap e alettone: perno sulla cerniera (75 % della corda)
    const zc=ZLE+C*S0,yc=YA+0.035;
    for(const [grp,x0,x1] of [[sx<0?flS:flD,0.02,XA-XF],[sx<0?alS:alD,XA-XF+0.02,XT-XF-0.02]]){
      const h=new THREE.Group();h.position.set(0,yc,zc);semi.add(h);
      const gg=pezzo(S0,1,x0,x1,mTela,[0,yc,zc]);if(sx<0)gg.scale(-1,1,1).computeVertexNormals();
      h.add(new THREE.Mesh(gg,mTela));
      grp.add(h);   // il gruppo esterno serve solo da riferimento: si ruota h
      grp.userData.perno=grp.userData.perno||[];grp.userData.perno.push(h);
    }
  }
  // per mondo.js: rotation.x di flap e alettoni si applica ai perni
  const perno=g=>{const h=g.userData.perno;return new Proxy({},{set(_,k,v){if(k==='x')for(const p of h)p.rotation.x=v;return true;},get(_,k){return h[0].rotation[k];}});};
  const mob=g=>({rotation:perno(g)});

  /* ---------- montanti a V: dal carrello al longherone anteriore e a quello posteriore ---------- */
  for(const sx of [-1,1]){
    const basso=v3(sx*0.58,-0.52,0.16);
    const xs=2.35,yS=YA+DIE*(xs-XF)-0.01;
    tubo(basso,v3(sx*xs,yS,ZLE+0.20),0.03,mTubo,gr,0.6,1.6);
    tubo(basso,v3(sx*xs,yS,ZLE+0.95),0.03,mTubo,gr,0.6,1.6);
  }

  /* ---------- carrello: balestre, ruote con carenature, ruotino ---------- */
  const goccia=(L,R)=>{const pts=[[0,0],[0.5,0.05],[0.85,0.16],[1,0.34],[0.92,0.52],[0.65,0.74],[0.28,0.93],[0,1]].map(([r,y])=>new THREE.Vector2(r*R,y*L));
    return new THREE.LatheGeometry(pts,18).rotateX(PI/2);};
  for(const sx of [-1,1]){
    const a=v3(sx*0.42,-0.58,0.24),b=v3(sx*0.85,-0.95,0.25),d=b.clone().sub(a),L=d.length();
    const m=add(new THREE.BoxGeometry(0.03,L+0.04,0.09),mTubo,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
    add(new THREE.CylinderGeometry(0.2,0.2,0.12,18).rotateZ(PI/2),mG,sx*0.88,-0.95,0.25);
    add(new THREE.CylinderGeometry(0.08,0.08,0.13,12).rotateZ(PI/2),mTubo,sx*0.88,-0.95,0.25);
    add(goccia(0.75,0.19).scale(0.62,1,1),mB,sx*0.88,-0.9,0.25-0.3);
  }
  {const a=v3(0,-0.40,-1.62),b=v3(0,-0.95,-1.45);tubo(a,b,0.035,mTubo);
   for(const sx of [-1,1])tubo(v3(sx*0.05,-0.75,-1.5),v3(sx*0.05,-0.95,-1.45),0.015,mTubo);
   add(new THREE.CylinderGeometry(0.2,0.2,0.1,18).rotateZ(PI/2),mG,0,-0.95,-1.45);
   add(new THREE.CylinderGeometry(0.07,0.07,0.11,12).rotateZ(PI/2),mTubo,0,-0.95,-1.45);}

  /* ---------- elica tripala e ogiva ---------- */
  const elica=new THREE.Group();elica.position.set(0,-0.02,Z0-0.02);gr.add(elica);
  {const pts=[[0.15,0],[0.148,0.06],[0.13,0.14],[0.09,0.22],[0.045,0.27],[0,0.29]].map(([r,y])=>new THREE.Vector2(r,y));
   add(new THREE.LatheGeometry(pts,24).rotateX(-PI/2),mat(0xe8e8e8,.3,.3),0,0,0.02,elica);}
  const pale=new THREE.Group();elica.add(pale);
  {const sh=new THREE.Shape();sh.moveTo(-0.04,0.12);sh.lineTo(0.045,0.12);sh.quadraticCurveTo(0.075,0.35,0.06,0.6);
   sh.quadraticCurveTo(0.05,0.8,0.028,0.85);sh.quadraticCurveTo(0,0.87,-0.022,0.85);sh.quadraticCurveTo(-0.045,0.6,-0.04,0.12);
   for(let k=0;k<3;k++){const g=new THREE.ExtrudeGeometry(sh,{depth:0.012,bevelEnabled:true,bevelThickness:0.005,bevelSize:0.005,bevelSegments:1,curveSegments:6})
     .translate(0,0,-0.006).rotateY(0.38).rotateZ(k*2*PI/3);
     pale.add(new THREE.Mesh(g,mElica));}}
  const disco=new THREE.Mesh(new THREE.CircleGeometry(0.85,40),new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.14,depthWrite:false,side:THREE.DoubleSide}));
  elica.add(disco);disco.visible=false;

  /* ---------- dettagli: antenna della radio sul tetto, tubo di Pitot sotto l'ala ---------- */
  add(new THREE.BoxGeometry(0.01,0.3,0.04).translate(0,0.15,0),mScuro,0,0.6,0.85,fus).rotation.x=-0.3;
  tubo(v3(-3.2,YA+DIE*2.6-0.06,-0.35),v3(-3.2,YA+DIE*2.6-0.06,-0.75),0.008,mTubo);

  // il C42 di serie non ha luci di navigazione né lampeggiatori (si vola solo di giorno)
  const strobo=new THREE.Group();gr.add(strobo);
  const beacon=new THREE.Object3D();gr.add(beacon);
  return {gruppo:gr,fus,elev,tim,alS:mob(alS),alD:mob(alD),flS:mob(flS),flD:mob(flD),pale,disco,strobo,beacon,luciNav:[]};
};

/* =====================================================================
   CABINA DEL C42: due posti affiancati, cloche UNICA al centro (con la leva
   del freno), manetta fra i sedili, leva dei flap sul tetto, pulsante del trim
   elettrico; cruscotto analogico disegnato da strumenti.disegnaAnalogico.
   ===================================================================== */
SIM.creaCabinaC42=function(){
  const gr=new THREE.Group();
  const std=(color,rough=.8,metal=0)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
  const M={pannello:std(0x2b2e33,.7),nero:std(0x141518,.6),tubo:std(0xc9ccd1,.3,.75),grigio:std(0x5a5f66,.8),
    sedile:std(0x3b4048,.9),bianco:std(0xe8e8e8,.6),rosso:std(0xc0201c,.5),tetto:new THREE.MeshStandardMaterial({color:0xdedad0,roughness:.95,emissive:0x3a3832})};
  const box=(w,h,d,mat,x,y,z,par)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);(par||gr).add(m);return m;};
  const cil=(r,l,mat,x,y,z,par,seg=14)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,seg),mat);m.position.set(x,y,z);(par||gr).add(m);return m;};
  function tubo(a,b,r,m){const d=new THREE.Vector3().subVectors(b,a),L=d.length();
    const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,10),m);o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());gr.add(o);return o;}
  const v3=(x,y,z)=>new THREE.Vector3(x,y,z);

  const ZP=-1.0;   // superficie del cruscotto
  /* ---- cruscotto ---- */
  box(1.2,0.52,0.04,M.pannello,0,-0.05,ZP-0.02);
  box(1.24,0.04,0.28,M.nero,0,0.215,ZP-0.12);                       // palpebra
  const cv=document.createElement('canvas');cv.width=1000;cv.height=600;
  const tex=new THREE.CanvasTexture(cv);tex.anisotropy=4;
  const pan=new THREE.Mesh(new THREE.PlaneGeometry(0.75,0.45),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
  pan.position.set(-0.17,-0.05,ZP+0.002);gr.add(pan);
  const pannello={canvas:cv,tex,sup:{g:cv.getContext('2d'),W:cv.width,H:cv.height}};
  // radio COM e transponder (a destra), con le cifre verdi
  for(const [y,t] of [[0.08,'COM 122.500'],[-0.02,'XPDR 7000']]){
    box(0.22,0.06,0.03,M.nero,0.4,y,ZP+0.01);
    const c2=document.createElement('canvas');c2.width=256;c2.height=64;const g=c2.getContext('2d');
    g.fillStyle='#061008';g.fillRect(0,0,256,64);g.fillStyle='#57e389';g.font='700 34px "B612 Mono", monospace';g.textBaseline='middle';g.fillText(t,12,34);
    const p=new THREE.Mesh(new THREE.PlaneGeometry(0.15,0.035),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c2),toneMapped:false}));
    p.position.set(0.38,y,ZP+0.027);gr.add(p);
    for(const sx of [-1,1]){const k=cil(0.012,0.02,M.grigio,0.4+sx*0.09,y,ZP+0.03);k.rotation.x=PI/2;}
  }
  // interruttori (accensione, pompa, master) e pulsante del trim
  for(let i=0;i<5;i++)box(0.012,0.025,0.012,M.bianco,0.3+i*0.04,-0.2,ZP+0.02);
  box(0.02,0.04,0.015,M.nero,0.5,-0.12,ZP+0.02);   // trim elettrico (bilanciere)
  const chiave=cil(0.018,0.025,M.tubo,0.25,-0.12,ZP+0.015);chiave.rotation.x=PI/2;

  /* ---- cloche centrale: perno sul pavimento, si inclina avanti/indietro e di lato ---- */
  const clocheP=new THREE.Group();clocheP.position.set(0,-0.66,-0.52);gr.add(clocheP);
  const clocheR=new THREE.Group();clocheP.add(clocheR);
  {const asta=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.016,0.5,10),M.tubo);asta.position.y=0.25;clocheR.add(asta);
   const imp=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.02,0.13,12),M.nero);imp.position.y=0.55;clocheR.add(imp);
   const leva=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.07,0.012),M.grigio);leva.position.set(0,0.52,-0.035);leva.rotation.x=0.4;clocheR.add(leva);   // leva del freno
   const cuffia=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.04,0.08,12),M.nero);cuffia.position.y=0.03;clocheR.add(cuffia);}
  /* ---- manetta fra i sedili ---- */
  box(0.12,0.12,0.36,M.pannello,0,-0.6,-0.82);
  const manetta=new THREE.Group();gr.add(manetta);
  {const a=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.12,0.012),M.tubo);a.position.y=0.06;manetta.add(a);
   const p=new THREE.Mesh(new THREE.SphereGeometry(0.022,12,8),M.nero);p.position.y=0.12;manetta.add(p);}
  manetta.position.set(0,-0.54,-0.82);
  /* ---- leva dei flap sul tetto, fra i due posti ---- */
  const levaFlap=new THREE.Group();levaFlap.position.set(0,0.86,-0.2);gr.add(levaFlap);
  {const a=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.02,0.32),M.tubo);a.position.z=0.16;levaFlap.add(a);
   const p=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.03,0.06),M.nero);p.position.z=0.33;levaFlap.add(p);}
  /* ---- sedili, pavimento, struttura a tubi, tetto ---- */
  for(const sx of [-1,1]){
    box(0.44,0.08,0.45,M.sedile,sx*0.3,-0.55,-0.05);
    const sch=box(0.44,0.62,0.07,M.sedile,sx*0.3,-0.22,0.22);sch.rotation.x=-0.18;
    box(0.04,0.42,1.2,M.grigio,sx*0.62,-0.42,-0.45);                 // fianchi sotto i vetri
    tubo(v3(sx*0.6,0.0,ZP+0.02),v3(sx*0.45,0.9,-0.45),0.011,M.tetto);  // montanti del parabrezza
    tubo(v3(sx*0.62,0.0,0.3),v3(sx*0.55,0.88,0.3),0.018,M.tetto);     // montanti dietro le porte
    tubo(v3(sx*0.45,0.9,-0.45),v3(sx*0.55,0.88,0.3),0.018,M.tetto);
  }
  box(1.2,0.03,1.4,M.nero,0,-0.66,-0.45);                            // pavimento
  box(1.1,0.03,0.8,M.tetto,0,0.92,-0.08);                            // tetto (sotto l'ala)
  tubo(v3(-0.45,0.9,-0.45),v3(0.45,0.9,-0.45),0.02,M.tetto);         // bordo alto del parabrezza
  // pedali
  for(const sx of [-1,1])for(const dx of [-0.07,0.07])box(0.05,0.1,0.02,M.grigio,sx*0.3+dx,-0.55,-1.12);

  gr.visible=false;
  const o=(window.AEREO&&window.AEREO.occhioPilota)||{x:-0.28,y:0.3,z:-0.3};
  const occhio=new THREE.Vector3(o.x,o.y,o.z);
  const fl=(window.AEREO&&window.AEREO.flap.posizioni)||[0,15,40];
  return {
    gruppo:gr, pannello, occhio,
    aggiorna(s){
      const c=s.comandi;
      clocheP.rotation.x=Math.max(-1,Math.min(1,c.elev))*0.22;   // tirare = verso il pilota
      clocheR.rotation.z=-c.ail*0.25;                            // destra = verso destra
      manetta.rotation.x=-(s.thr-0.5)*0.9;                       // avanti = più motore
      levaFlap.rotation.x=(s.flap/fl[fl.length-1])*0.7;          // tirata giù = più flap
    },
  };
};
})();
