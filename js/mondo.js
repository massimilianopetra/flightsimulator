/* =====================================================================
   MONDO 3D: cielo, mare, laghi, piste con segnaletica, PAPI, manica a
   vento, hangar e torre, alberi, paesi, nuvole e il modello dell'aereo.
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const D2R=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

SIM.creaMondo=function(scene,renderer){
  const T=SIM.terreno, M=window.MAPPA||{};
  const met=Object.assign({ventoDa:270,ventoNodi:5,raffiche:0,nuvole:35,baseNuvole:1100},M.meteo||{});
  const rnd=T.rng(T.seme*7919+13);
  const maxAniso=renderer.capabilities.getMaxAnisotropy();

  /* ---------- cielo ---------- */
  const ORIZZ=0xc9dceb, ZENIT=0x3d7cc4;
  scene.background=new THREE.Color(ORIZZ);
  scene.fog=new THREE.Fog(ORIZZ,3000,8500);
  const cielo=new THREE.Mesh(new THREE.SphereGeometry(9000,32,16),new THREE.ShaderMaterial({
    uniforms:{alto:{value:new THREE.Color(ZENIT)},basso:{value:new THREE.Color(ORIZZ)}},
    vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 alto;uniform vec3 basso;varying vec3 vP;void main(){float h=normalize(vP).y;gl_FragColor=vec4(mix(basso,alto,pow(clamp(h,0.0,1.0),0.5)),1.0);}',
    side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false}));
  cielo.renderOrder=-10;cielo.frustumCulled=false;
  scene.add(cielo);

  scene.add(new THREE.HemisphereLight(0xdfeaf5,0x4f5a3c,0.72));
  const sole=new THREE.DirectionalLight(0xfff2dc,0.78);
  sole.position.set(-0.5,1,0.35);scene.add(sole);

  /* ---------- acqua ---------- */
  const matAcqua=new THREE.MeshStandardMaterial({color:0x2c6a96,roughness:.3,metalness:.1});
  const mare=new THREE.Mesh(new THREE.PlaneGeometry(30000,30000).rotateX(-Math.PI/2),matAcqua);
  scene.add(mare);
  for(const l of T.laghi){
    const m=new THREE.Mesh(new THREE.CircleGeometry(l.r,64).rotateX(-Math.PI/2),matAcqua);
    m.position.set(l.x,l.q,l.z);scene.add(m);
  }

  /* ---------- piste ---------- */
  function texturaPista(p){
    const cw=128,ch=4096,cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
    const g=cv.getContext('2d');
    g.fillStyle='#3a3c3f';g.fillRect(0,0,cw,ch);
    for(let i=0;i<7000;i++){const v=48+rnd()*34|0;g.fillStyle=`rgba(${v},${v},${v+3},.4)`;g.fillRect(rnd()*cw,rnd()*ch,1+rnd()*2,1+rnd()*3);}
    const sx=cw/p.W,sy=ch/p.L,BI='#e9ecee';
    g.setTransform(sx,0,0,sy,cw/2,0);
    g.fillStyle=BI;
    g.fillRect(-p.W/2+0.6,0,0.9,p.L);g.fillRect(p.W/2-1.5,0,0.9,p.L);
    const testata=(nome)=>{ // origine al centro della soglia, la pista prosegue verso y negative
      g.fillStyle='rgba(15,15,15,.35)';
      for(let k=0;k<26;k++)g.fillRect(-p.W*0.22+rnd()*p.W*0.44,-(260+rnd()*380),0.35+rnd()*0.4,20+rnd()*70);
      g.fillStyle=BI;
      const n=p.W>=45?12:p.W>=30?8:p.W>=23?6:4,half=n/2,sp=(p.W/2-2.5)/half,sw=sp*0.55;
      for(let i=0;i<half;i++){const x=1.5+i*sp;g.fillRect(x,-36,sw,30);g.fillRect(-x-sw,-36,sw,30);}
      g.save();g.font='700 24px Arial, Helvetica, sans-serif';g.textAlign='center';g.textBaseline='alphabetic';
      const kx=Math.min(1,p.W*0.7/g.measureText(nome).width);
      g.translate(0,-44);g.scale(kx,1);g.fillText(nome,0,0);g.restore();
      const ap=p.L>=1200?300:p.L>=800?250:150, aw=Math.max(3,p.W*0.15);
      g.fillRect(p.W*0.12,-(ap+45),aw,45);g.fillRect(-p.W*0.12-aw,-(ap+45),aw,45);
      if(p.L>=900)for(const s of [150,450]){if(Math.abs(s-ap)<60)continue;
        for(let j=0;j<2;j++){g.fillRect(p.W*0.12+j*2.6,-(s+22),1.8,22);g.fillRect(-p.W*0.12-1.8-j*2.6,-(s+22),1.8,22);}}
      for(let s=70;s<p.L/2-15;s+=50)g.fillRect(-0.45,-(s+30),0.9,30);
      return ap;
    };
    g.setTransform(sx,0,0,sy,cw/2,ch);const ap=testata(p.nomi[0]);
    g.setTransform(-sx,0,0,-sy,cw/2,0);testata(p.nomi[1]);
    const tex=new THREE.CanvasTexture(cv);tex.anisotropy=maxAniso;
    return {tex,ap};
  }
  const matPiazzale=new THREE.MeshStandardMaterial({color:0x5d6064,roughness:.95});
  const matRaccordo=new THREE.MeshStandardMaterial({color:0x46484c,roughness:.95});
  const matHangar=new THREE.MeshStandardMaterial({color:0xb9c0c6,roughness:.7,flatShading:true});
  const matPorta=new THREE.MeshStandardMaterial({color:0x6c7680,roughness:.6});
  const matTorre=new THREE.MeshStandardMaterial({color:0xe4e1d8,roughness:.8});
  const matVetro=new THREE.MeshStandardMaterial({color:0x234452,roughness:.2,metalness:.4,emissive:0x0c1a20});
  const matManica=new THREE.MeshStandardMaterial({color:0xff6a1a,roughness:.7,side:THREE.DoubleSide});
  const matPalo=new THREE.MeshStandardMaterial({color:0xdddddd,roughness:.6});
  const papi=[], maniche=[];
  const torri=[];

  // aggiunge una mesh posizionata in coordinate locali della pista (u lungo, v a destra)
  function suPista(p,mesh,u,v,y){
    mesh.position.set(p.cx+p.dir.x*u-p.dir.z*v,y,p.cz+p.dir.z*u+p.dir.x*v);
    mesh.rotation.y=-p.hdg*D2R;
    scene.add(mesh);return mesh;
  }
  for(const p of T.piste){
    const {tex,ap}=texturaPista(p);
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    suPista(p,new THREE.Mesh(new THREE.PlaneGeometry(p.W,p.L).rotateX(-Math.PI/2),mat),0,0,p.quota+0.06);
    // piazzale, raccordo, hangar e torre sul lato destro della PRIMA pista di ogni aeroporto
    if(p===p.ap.piste[0]){
      suPista(p,new THREE.Mesh(new THREE.PlaneGeometry(160,70).rotateX(-Math.PI/2),matPiazzale),0,105,p.quota+0.04);
      suPista(p,new THREE.Mesh(new THREE.PlaneGeometry(15,70-p.W/2+2).rotateX(-Math.PI/2).rotateY(Math.PI/2),matRaccordo),0,(70+p.W/2)/2,p.quota+0.05);
      // hangar: in coordinate pista x = traverso (profondità 22), z = lungo la pista (30)
      const geoTetto=new THREE.CylinderGeometry(11,11,30,12,1,false,0,Math.PI).rotateX(Math.PI/2).rotateZ(Math.PI/2);
      for(const u of [-50,-15,20]){
        suPista(p,new THREE.Mesh(new THREE.BoxGeometry(22,9,30),matHangar),u,162,p.quota+4.5);
        suPista(p,new THREE.Mesh(new THREE.BoxGeometry(0.3,7,22),matPorta),u,150.9,p.quota+3.5);
        suPista(p,new THREE.Mesh(geoTetto,matHangar),u,162,p.quota+9).scale.set(1,0.3,1);
      }
      suPista(p,new THREE.Mesh(new THREE.CylinderGeometry(2.4,3,15,10),matTorre),70,150,p.quota+7.5);
      suPista(p,new THREE.Mesh(new THREE.BoxGeometry(7,3.6,7),matVetro),70,150,p.quota+16.8);
      suPista(p,new THREE.Mesh(new THREE.BoxGeometry(8,0.6,8),matTorre),70,150,p.quota+18.9);
      const tp=new THREE.Vector3();
      tp.set(p.cx+p.dir.x*70-p.dir.z*150,p.quota+17,p.cz+p.dir.z*70+p.dir.x*150);
      torri.push({pos:tp,ap:p.ap});
    }

    // manica a vento vicino alla prima testata, a sinistra
    const mx=-p.L/2+130, mv=-(p.W/2+28);
    suPista(p,new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.1,6,6),matPalo),mx,mv,p.quota+3);
    const piv=new THREE.Group();
    const cono=new THREE.Mesh(new THREE.ConeGeometry(0.42,3.4,12,1,true).rotateX(Math.PI/2).translate(0,0,1.7),matManica);
    piv.add(cono);
    piv.position.set(p.cx+p.dir.x*mx-p.dir.z*mv,p.quota+5.9,p.cz+p.dir.z*mx+p.dir.x*mv);
    piv.rotation.order='YXZ';
    scene.add(piv);maniche.push(piv);

    // PAPI: 4 luci a sinistra di ogni testata, all'altezza del punto di mira
    for(const te of p.testate){
      const unita=[];
      const lx=-te.dir.z, lz=te.dir.x; // vettore "destra" rispetto alla direzione di atterraggio
      for(let i=0;i<4;i++){
        const off=-(p.W/2+15+i*9);
        const mat=new THREE.MeshBasicMaterial({color:0xffffff,fog:false});
        const m=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.9,0.6),mat);
        m.position.set(te.x+te.dir.x*ap+lx*off,p.quota+0.6,te.z+te.dir.z*ap+lz*off);
        m.rotation.y=-te.hdg*D2R;
        scene.add(m);
        unita.push({m,mat,soglia:[3.5,3.17,2.83,2.5][i]});
      }
      papi.push(unita);
    }
  }

  /* ---------- alberi ---------- */
  function puntoValido(x,z,minH,maxH){
    const h=T.suolo(x,z);
    if(T.tipo!=='erba'||h<minH||h>maxH) return null;
    if(T.inAeroporto(x,z,60)) return null;
    for(const c of T.citta){if(Math.hypot(x-c.x,z-c.z)<c.r*0.9)return null;}
    return h;
  }
  const alberi=[];
  for(const b of T.boschi){
    for(let i=0;i<b.n;i++){
      const a=rnd()*Math.PI*2,r=b.r*Math.sqrt(rnd()),x=b.x+Math.cos(a)*r,z=b.z+Math.sin(a)*r;
      const h=puntoValido(x,z,2,1100);if(h!=null)alberi.push([x,h,z,rnd()<0.6]);
    }
  }
  const half=(M.dimensione||30000)/2;
  for(let i=0,n=M.alberiSparsi||0;i<n;i++){
    const x=(rnd()*2-1)*half,z=(rnd()*2-1)*half;
    const h=puntoValido(x,z,3,800);if(h!=null)alberi.push([x,h,z,rnd()<0.4]);
  }
  const conifere=alberi.filter(a=>a[3]),latifoglie=alberi.filter(a=>!a[3]);
  const dummy=new THREE.Object3D(),col=new THREE.Color();
  function istanze(geo,mat,lista,scala,tinta){
    if(!lista.length) return;
    const im=new THREE.InstancedMesh(geo,mat,lista.length);
    lista.forEach((a,i)=>{
      const s=scala();dummy.position.set(a[0],a[1]-0.6,a[2]);dummy.rotation.set(0,rnd()*6.28,0);dummy.scale.set(s[0],s[1],s[0]);
      dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);
      im.setColorAt(i,tinta(col));
    });
    scene.add(im);
  }
  const matPianta=new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1});
  istanze(new THREE.ConeGeometry(1,1,6).translate(0,0.5,0),matPianta,conifere,
    ()=>{const h=9+rnd()*9;return [h*0.28,h];},c=>c.setHSL(0.30+rnd()*0.05,0.45,0.17+rnd()*0.07));
  istanze(new THREE.IcosahedronGeometry(0.5,0).translate(0,0.55,0),matPianta,latifoglie,
    ()=>{const h=7+rnd()*6;return [h*0.85,h];},c=>c.setHSL(0.22+rnd()*0.08,0.45,0.24+rnd()*0.1));

  /* ---------- paesi ---------- */
  const muri=[],tetti=[];
  for(const c of T.citta){
    for(let i=0,tent=0;i<c.n&&tent<c.n*4;tent++){
      const a=rnd()*Math.PI*2,rr=Math.pow(rnd(),0.8),r=c.r*rr,x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;
      const h=T.suolo(x,z);
      if(T.tipo!=='erba'||T.inAeroporto(x,z,20))continue;
      i++;
      const centro=rr<0.35&&rnd()<0.6;
      const w=centro?12+rnd()*14:8+rnd()*6, d=centro?12+rnd()*12:7+rnd()*5;
      const alt=centro?10+rnd()*16:5+rnd()*3;
      muri.push({x,z,y:h-3,w,d,alt:alt+3,rot:rnd()*Math.PI,centro});
      if(!centro)tetti.push({x,z,y:h+alt,w,d,rot:muri[muri.length-1].rot});
    }
  }
  if(muri.length){
    const im=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1).translate(0,0.5,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85,flatShading:true}),muri.length);
    const tinte=[0xf1e7d0,0xe8d5b0,0xf4f1ea,0xd9c7a7,0xe6dccb,0xcfd4d8];
    muri.forEach((m,i)=>{dummy.position.set(m.x,m.y,m.z);dummy.rotation.set(0,m.rot,0);dummy.scale.set(m.w,m.alt,m.d);dummy.updateMatrix();
      im.setMatrixAt(i,dummy.matrix);im.setColorAt(i,col.setHex(m.centro?0xcfd4d8:tinte[(rnd()*tinte.length)|0]));});
    scene.add(im);
  }
  if(tetti.length){
    const im=new THREE.InstancedMesh(new THREE.ConeGeometry(0.75,1,4).rotateY(Math.PI/4).translate(0,0.5,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8,flatShading:true}),tetti.length);
    tetti.forEach((t,i)=>{dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.rot,0);dummy.scale.set(t.w*0.95,2.6,t.d*0.95);dummy.updateMatrix();
      im.setMatrixAt(i,dummy.matrix);im.setColorAt(i,col.setHSL(0.03+rnd()*0.03,0.55,0.38+rnd()*0.1));});
    scene.add(im);
  }

  /* ---------- nuvole ---------- */
  const geoNuvola=new THREE.IcosahedronGeometry(1,1);
  const matNuvola=new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1,emissive:0x404850});
  const nuvole=[];
  const nNuvole=Math.round(clamp(met.nuvole,0,100)*1.4);
  for(let i=0;i<nNuvole;i++){
    const g=new THREE.Group(),parti=4+(rnd()*4|0);
    for(let j=0;j<parti;j++){
      const m=new THREE.Mesh(geoNuvola,matNuvola),s=40+rnd()*50;
      m.scale.set(s*1.5,s*.5,s);m.position.set((j-parti/2)*s*1.1,rnd()*20,(rnd()-.5)*s*1.2);g.add(m);
    }
    g.position.set((rnd()-.5)*12000,met.baseNuvole+rnd()*250,(rnd()-.5)*12000);
    scene.add(g);nuvole.push(g);
  }

  /* ---------- aereo ---------- */
  const aereo=creaAereo();
  scene.add(aereo.gruppo);

  const vista={};
  return {
    meteo:met, torri, aereo,
    // aggiorna le parti animate. s = stato fisica, cam = posizione camera, vento = vettore
    aggiorna(s,cam,vento,dt,vistaCabina){
      cielo.position.copy(cam);
      mare.position.set(cam.x,0,cam.z);
      for(const g of nuvole){
        const dx=g.position.x-cam.x,dz=g.position.z-cam.z;
        if(dx>6000)g.position.x-=12000;else if(dx<-6000)g.position.x+=12000;
        if(dz>6000)g.position.z-=12000;else if(dz<-6000)g.position.z+=12000;
      }
      // PAPI visti dal pilota
      for(const u of papi)for(const l of u){
        const dx=s.pos.x-l.m.position.x,dz=s.pos.z-l.m.position.z,d=Math.hypot(dx,dz);
        const ang=Math.atan2(s.pos.y-l.m.position.y,d)/D2R;
        l.mat.color.setHex(ang>l.soglia?0xffffff:0xff2a1a);
        const k=Math.max(1,Math.hypot(cam.x-l.m.position.x,cam.z-l.m.position.z)/350);
        l.m.scale.set(k,k,k);
      }
      // manica a vento
      const vk=Math.hypot(vento.x,vento.z)*1.943844;
      const dir=Math.atan2(vento.x,-vento.z); // direzione verso cui va il vento
      for(const mc of maniche){mc.rotation.y=Math.PI-dir;mc.rotation.x=(1-clamp(vk/15,0,1))*1.2;}
      aereo.aggiorna(s,dt,vistaCabina);
    },
  };

  /* modello 3D in stile Cessna: muso verso -z, superfici di comando animate */
  function creaAereo(){
    const gr=new THREE.Group();
    const mB=new THREE.MeshStandardMaterial({color:0xf3f1ea,flatShading:true,roughness:.55});
    const mR=new THREE.MeshStandardMaterial({color:0xc4302b,flatShading:true,roughness:.5});
    const mBl=new THREE.MeshStandardMaterial({color:0x1d3f78,flatShading:true,roughness:.5});
    const mS=new THREE.MeshStandardMaterial({color:0x1d2731,roughness:.3,metalness:.3});
    const mG=new THREE.MeshStandardMaterial({color:0x222222,roughness:.9});
    const mInt=new THREE.MeshStandardMaterial({color:0x2a2f36,roughness:.9});
    const add=(geo,mat,x,y,z,par)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);(par||gr).add(m);return m;};
    const cil=(r1,r2,h,seg)=>new THREE.CylinderGeometry(r1,r2,h,seg||12).rotateX(Math.PI/2); // asse lungo z, r1 verso +z

    const fus=new THREE.Group();gr.add(fus); // parti nascoste nella vista dalla cabina
    add(cil(0.6,0.62,3.0),mB,0,0,-0.5,fus);                  // cabina
    add(cil(0.14,0.6,3.4),mB,0,0.12,2.7,fus);                // cono di coda
    add(cil(0.45,0.36,0.9),mB,0,-0.14,-2.45);                // cofano motore (basso: dalla cabina si vede la pista)
    add(new THREE.ConeGeometry(0.2,0.45,12).rotateX(-Math.PI/2),mR,0,0,-3.1); // ogiva
    add(new THREE.BoxGeometry(1.27,0.08,4.8),mBl,0,-0.15,0.3,fus); // fascia blu
    add(new THREE.BoxGeometry(1.29,0.5,1.7),mS,0,0.32,-0.6,fus); // finestrini
    // ala alta
    add(new THREE.BoxGeometry(11,0.14,1.15),mB,0,0.88,-0.58);
    add(new THREE.BoxGeometry(0.6,0.15,1.16),mR,-5.2,0.88,-0.58);
    add(new THREE.BoxGeometry(0.6,0.15,1.16),mR,5.2,0.88,-0.58);
    for(const sx of [-1,1]){ // montanti: dalla pancia (±0.55,-0.4) all'ala (±2.6,0.85)
      const m=add(new THREE.BoxGeometry(0.06,2.4,0.14),mB,sx*1.58,0.22,-0.45);m.rotation.z=-sx*Math.atan2(2.05,1.25);
    }
    // impennaggi
    add(new THREE.BoxGeometry(3.4,0.07,0.6),mB,0,0.3,4.05);
    add(new THREE.BoxGeometry(0.08,1.5,1.1),mB,0,1.0,3.85);
    add(new THREE.BoxGeometry(0.09,0.4,1.2),mR,0,1.62,3.9);
    const sup=(w,h,d,x,y,z,mat)=>{const piv=new THREE.Group();piv.position.set(x,y,z);
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d).translate(0,0,d/2),mat||mB);piv.add(m);gr.add(piv);return piv;};
    const elev=sup(3.4,0.06,0.45,0,0.3,4.35);
    const tim=sup(0.07,1.45,0.5,0,1.0,4.4,mR);
    const alS=sup(2.4,0.1,0.4,-3.9,0.88,0);
    const alD=sup(2.4,0.1,0.4,3.9,0.88,0);
    const flS=sup(2.5,0.1,0.4,-1.45,0.88,0);
    const flD=sup(2.5,0.1,0.4,1.45,0.88,0);
    // carrello
    for(const sx of [-1,1]){
      const g=add(new THREE.BoxGeometry(0.07,1.0,0.12),mS,sx*0.88,-0.88,0.3);g.rotation.z=sx*0.85;
      add(new THREE.CylinderGeometry(0.25,0.25,0.16,14).rotateZ(Math.PI/2),mG,sx*1.25,-1.2,0.3);
      add(new THREE.SphereGeometry(0.3,10,8).scale(0.5,0.75,1.4),mB,sx*1.25,-1.15,0.3);
    }
    add(new THREE.BoxGeometry(0.08,0.75,0.08),mS,0,-0.85,-1.7);
    add(new THREE.CylinderGeometry(0.22,0.22,0.13,14).rotateZ(Math.PI/2),mG,0,-1.23,-1.7);
    // elica: pale ferme o disco trasparente quando gira veloce
    const elica=new THREE.Group();elica.position.set(0,0,-3.05);gr.add(elica);
    const pale=new THREE.Group();elica.add(pale);
    pale.add(new THREE.Mesh(new THREE.BoxGeometry(0.14,1.9,0.05),mS));
    const disco=new THREE.Mesh(new THREE.CircleGeometry(0.95,32),new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.18,depthWrite:false,side:THREE.DoubleSide}));
    elica.add(disco);
    // luci di navigazione
    const luce=(c,x,y,z)=>add(new THREE.SphereGeometry(0.07,8,6),new THREE.MeshBasicMaterial({color:c}),x,y,z);
    luce(0xff2020,-5.52,0.88,-0.6);luce(0x20ff40,5.52,0.88,-0.6);luce(0xffffff,0,1.85,4.3);
    const strobo=luce(0xffffff,0,1.86,3.4);
    // interno della cabina (js/cabina.js), visibile solo dalla vista in cabina
    const cab=SIM.creaCabina();gr.add(cab.gruppo);
    const cabina=cab.gruppo;

    let tempo=0;
    return {gruppo:gr, cabina:cab,
      aggiorna(s,dt,inCabina){
        tempo+=dt;
        gr.position.copy(s.pos);gr.quaternion.copy(s.q);
        const c=s.comandi;
        elev.rotation.x=-clamp(c.elev+s.trim,-1,1)*0.44;
        tim.rotation.y=c.rud*0.28;
        alS.rotation.x=c.ail*0.31;alD.rotation.x=-c.ail*0.31;
        flS.rotation.x=flD.rotation.x=s.flap*D2R;
        const veloce=s.rpm>900&&!s.crashed;
        if(!s.crashed)pale.rotation.z+=dt*s.rpm/60*Math.PI*2*(veloce?0.02:1);
        pale.visible=!veloce; disco.visible=veloce&&!inCabina;
        strobo.visible=(tempo%1.2)<0.06;
        cabina.visible=inCabina;fus.visible=!inCabina;
        if(inCabina)cab.aggiorna(s);
      }};
  }
};
})();
