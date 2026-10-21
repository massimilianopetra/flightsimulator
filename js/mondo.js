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
   MONDO 3D: cielo, mare, laghi, piste con segnaletica, PAPI, manica a
   vento, hangar e torre, alberi, paesi e il modello dell'aereo (le nuvole
   sono in js/meteo.js).
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
  // visibilità (km) dalla mappa: le mappe reali vedono lontano grazie al terreno lontano
  const visib=(met.visibilita||8.5)*1000;
  scene.fog=new THREE.Fog(ORIZZ,visib>20000?visib*0.3:Math.min(3000,visib*0.35),visib);
  const cielo=new THREE.Mesh(new THREE.SphereGeometry(9000,32,16),new THREE.ShaderMaterial({
    uniforms:{alto:{value:new THREE.Color(ZENIT)},basso:{value:new THREE.Color(ORIZZ)}},
    vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 alto;uniform vec3 basso;varying vec3 vP;void main(){float h=normalize(vP).y;gl_FragColor=vec4(mix(basso,alto,pow(clamp(h,0.0,1.0),0.5)),1.0);}',
    side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false}));
  cielo.renderOrder=-10;cielo.frustumCulled=false;
  scene.add(cielo);

  const emi=new THREE.HemisphereLight(0xdfeaf5,0x4f5a3c,0.72);scene.add(emi);
  const sole=new THREE.DirectionalLight(0xfff2dc,0.78);
  sole.position.set(-0.5,1,0.35);scene.add(sole);

  /* ---------- acqua ---------- */
  const matAcqua=new THREE.MeshStandardMaterial({color:0x2c6a96,roughness:.3,metalness:.1});
  const mare=new THREE.Mesh(new THREE.PlaneGeometry(30000,30000).rotateX(-Math.PI/2),matAcqua);
  scene.add(mare);
  for(const l of T.laghi){
    let geo;
    if(l.anelli){ // contorno vero, con le isole come buchi
      const forma=new THREE.Shape(l.anelli[0].map(([x,z])=>new THREE.Vector2(x,-z)));
      for(const isola of l.anelli.slice(1))forma.holes.push(new THREE.Path(isola.map(([x,z])=>new THREE.Vector2(x,-z))));
      geo=new THREE.ShapeGeometry(forma).rotateX(-Math.PI/2);
      const m=new THREE.Mesh(geo,matAcqua);m.position.y=l.q+0.3;scene.add(m);
    }else{
      const m=new THREE.Mesh(new THREE.CircleGeometry(l.r,64).rotateX(-Math.PI/2),matAcqua);
      m.position.set(l.x,l.q,l.z);scene.add(m);
    }
  }

  /* ---------- piste ---------- */
  function texturaPista(p){
    // altezza della texture proporzionata alla lunghezza (risparmia memoria video)
    let ch=512;while(ch<p.L*1.1&&ch<4096)ch*=2;
    const cw=p.W>=30?128:64,cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
    const g=cv.getContext('2d');
    if(p.erba){ // pista in erba: strisce di taglio e paletti bianchi ai bordi
      g.fillStyle='#557a38';g.fillRect(0,0,cw,ch);
      for(let y=0;y<ch;y+=ch/40){g.fillStyle=(y/(ch/40))%2?'rgba(255,255,255,.05)':'rgba(0,0,0,.06)';g.fillRect(0,y,cw,ch/40);}
      const sy=ch/p.L;g.fillStyle='#f2f2f2';
      for(let u=0;u<=p.L;u+=60){g.fillRect(1,u*sy,3,Math.max(3,2*sy));g.fillRect(cw-4,u*sy,3,Math.max(3,2*sy));}
      const tex=new THREE.CanvasTexture(cv);tex.anisotropy=maxAniso;
      return {tex,ap:Math.min(150,p.L*0.2)};
    }
    g.fillStyle='#3a3c3f';g.fillRect(0,0,cw,ch);
    for(let i=0,n=ch*cw/75;i<n;i++){const v=48+rnd()*34|0;g.fillStyle=`rgba(${v},${v},${v+3},.4)`;g.fillRect(rnd()*cw,rnd()*ch,1+rnd()*2,1+rnd()*3);}
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
  // segnaletica gialla di rullaggio (sopra piazzale e raccordo)
  const matGiallo=new THREE.MeshStandardMaterial({color:0xf2c200,roughness:.8,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
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
    // aeroporti con le vie di rullaggio vere (js/rullaggio.js): torre e hangar accanto al piazzale vero
    const rv=p===p.ap.piste[0]&&p.ap.rullaggioVero&&SIM.reteRullaggio?SIM.reteRullaggio.di(p.ap):null;
    // grandi aeroporti disegnati con gli edifici veri (js/aeroporti-3d.js): solo la posizione della torre vera, per la vista dalla torre
    const tv=p===p.ap.piste[0]&&SIM.torreVera?SIM.torreVera(p.ap):null;
    if(tv)torri.push({pos:new THREE.Vector3(tv.x,T.meshH(tv.x,tv.z)+tv.y,tv.z),ap:p.ap});
    else if(rv){
      const t=rv.torre,y0=Math.max(p.quota,T.meshH(t.x,t.z));
      const metti=(geo,m,x,y,z,ry)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.rotation.y=ry;scene.add(o);return o;};
      metti(new THREE.CylinderGeometry(2.4,3,15,10),matTorre,t.x,y0+7.5,t.z,0);
      metti(new THREE.BoxGeometry(7,3.6,7),matVetro,t.x,y0+16.8,t.z,-p.hdg*D2R);
      metti(new THREE.BoxGeometry(8,0.6,8),matTorre,t.x,y0+18.9,t.z,-p.hdg*D2R);
      torri.push({pos:new THREE.Vector3(t.x,y0+17,t.z),ap:p.ap});
      for(const s of [-1,1]){const hx=t.x+p.dir.x*s*55,hz=t.z+p.dir.z*s*55,hy=Math.max(p.quota,T.meshH(hx,hz));
        metti(new THREE.BoxGeometry(22,9,30),matHangar,hx,hy+4.5,hz,-p.hdg*D2R);}
    }
    if(p===p.ap.piste[0]&&!rv&&!tv){
      // piazzale: 160 m lungo la pista (x locale = traverso, z = lungo la pista) e 70 di profondità, da v 70 a 140
      suPista(p,new THREE.Mesh(new THREE.PlaneGeometry(70,160).rotateX(-Math.PI/2),matPiazzale),0,105,p.quota+0.04);
      suPista(p,new THREE.Mesh(new THREE.PlaneGeometry(15,70-p.W/2+2).rotateX(-Math.PI/2).rotateY(Math.PI/2),matRaccordo),0,(70+p.W/2)/2,p.quota+0.05);
      // linee gialle: guida dal parcheggio (u -45, v 115) al raccordo, centro del raccordo, punto attesa, stop al parcheggio
      // (stessa geometria del rullaggio in js/main.js)
      const lineaU=(u0,u1,v,w=0.3)=>suPista(p,new THREE.Mesh(new THREE.PlaneGeometry(w,Math.abs(u1-u0)).rotateX(-Math.PI/2),matGiallo),(u0+u1)/2,v,p.quota+0.08);
      const lineaV=(u,v0,v1,w=0.3)=>suPista(p,new THREE.Mesh(new THREE.PlaneGeometry(w,Math.abs(v1-v0)).rotateX(-Math.PI/2).rotateY(Math.PI/2),matGiallo),u,(v0+v1)/2,p.quota+0.08);
      lineaV(-45,100,115);lineaU(-45,0,100);lineaV(0,70,100);lineaV(0,p.W/2+2,70);
      lineaU(-3,3,113,0.5);                                              // stop al parcheggio (sotto la ruota anteriore)
      const va=p.W/2+30;                                                 // punto attesa: due linee piene e due tratteggiate (lato pista)
      lineaU(-7,7,va+0.4,0.25);lineaU(-7,7,va+0.9,0.25);
      for(let k=0;k<5;k++){const u0=-7+k*3;lineaU(u0,u0+1.6,va-0.4,0.25);lineaU(u0,u0+1.6,va-0.9,0.25);}
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
    if(SIM.reteRullaggio&&SIM.reteRullaggio.zona(x,z,30)) return null;   // vie di rullaggio vere
    if(SIM.zonaAeroporti&&SIM.zonaAeroporti(x,z)) return null;          // sedime dei grandi aeroporti (js/aeroporti-3d.js)
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
  // mappe grandi: gruppi di alberi attorno agli aeroporti (dove si vola più bassi)
  const limiteBosco=((M.terreno||{}).colori||{}).bosco||1100;
  for(const ap of T.aeroporti){
    for(let i=0,n=M.alberiVicinoAeroporti||0;i<n;i++){
      const a=rnd()*Math.PI*2,r=900+rnd()*5500,x=ap.x+Math.cos(a)*r,z=ap.z+Math.sin(a)*r;
      const h=puntoValido(x,z,3,limiteBosco);if(h!=null)alberi.push([x,h,z,h>900||rnd()<0.35]);
    }
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
  // sulle mappe reali con le aree urbane vere gli edifici li genera js/paesaggio.js
  const muri=[],tetti=[];
  if(!(T.reale&&window.ABITATI)) for(const c of T.citta){
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

  /* le nuvole sono in js/meteo.js */

  /* ---------- aereo ---------- */
  const aereo=creaAereo();
  scene.add(aereo.gruppo);

  const vista={};
  return {
    meteo:met, torri, aereo,
    // per js/notte.js: cielo, luci e materiali che cambiano con l'ora del giorno
    luci:{cielo,emi,sole,matVetro,ORIZZ,ZENIT},
    // aggiorna le parti animate. s = stato fisica, cam = posizione camera, vento = vettore
    aggiorna(s,cam,vento,dt,vistaCabina){
      cielo.position.copy(cam);
      mare.position.set(cam.x,0,cam.z);
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

  /* modello 3D del Cessna (js/c172-3d.js): muso verso -z, superfici di comando animate */
  function creaAereo(){
    // modello e cabina dell'aereo scelto: Cessna 172 (js/c172-3d.js, js/c172-cabina.js) o Ikarus C42 (js/c42-3d.js)
    const c42=window.AEREO&&window.AEREO.id==='c42';
    const m=(c42?SIM.creaModelloC42:SIM.creaModelloAereo)({registrazione:(window.AEREO&&window.AEREO.registrazione)||'I-VOLO'});
    const gr=m.gruppo,fus=m.fus,{elev,tim,alS,alD,flS,flD,pale,disco,strobo,beacon,luciNav}=m;
    // interno della cabina (js/c172-cabina.js), visibile solo dalla vista in cabina
    const cab=(c42?SIM.creaCabinaC42:SIM.creaCabina)();gr.add(cab.gruppo);
    const cabina=cab.gruppo;
    const ombra=creaOmbra(gr,[cabina,m.pale,disco,m.strobo]);

    let tempo=0;
    return {gruppo:gr, cabina:cab, luciNav,
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
        strobo.visible=(tempo%1.2)<0.06;beacon.visible=(tempo%1.0)<0.15;
        cabina.visible=inCabina;fus.visible=!inCabina;
        if(inCabina)cab.aggiorna(s);
        ombra(s);
      }};
  }

  /* Ombra dell'aereo: la sagoma del modello schiacciata sul suolo lungo la direzione
     del sole (matrice di proiezione su un piano). Il piano passa sotto l'aereo e segue
     la pendenza del terreno. Si vede solo vicino al suolo (decollo, atterraggio, rullaggio)
     e sfuma salendo. Lo stencil evita che i pezzi sovrapposti facciano macchie più scure. */
  function creaOmbra(gr,esclusi){
    // tutti i triangoli del modello (senza cabina, pale, disco dell'elica e luci) in coordinate dell'aereo
    gr.updateMatrixWorld(true);
    const pos=[],v=new THREE.Vector3();
    gr.traverse(o=>{
      if(!o.isMesh)return;
      for(let p=o;p;p=p.parent)if(esclusi.includes(p))return;
      const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry,a=g.attributes.position;
      for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);pos.push(v.x,v.y,v.z);}
    });
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    const mat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.4,depthWrite:false,side:THREE.DoubleSide,
      stencilWrite:true,stencilRef:0,stencilFunc:THREE.EqualStencilFunc,stencilZPass:THREE.IncrementStencilOp});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;mesh.renderOrder=1;mesh.visible=false;
    scene.add(mesh);
    const L=new THREE.Vector3(),n=new THREE.Vector3(),P=new THREE.Matrix4();
    return function(s){
      const h=T.suolo(s.pos.x,s.pos.z),alt=s.pos.y-h;
      const k=clamp(1-alt/150,0,1)*clamp(sole.intensity/0.78,0,1);
      L.copy(sole.position).normalize();
      mesh.visible=k>0.02&&L.y>0.05;
      if(!mesh.visible)return;
      mat.opacity=0.5*k;
      // piano del suolo: normale dalla pendenza della mesh, 20 cm sopra (piste e linee stanno a +6/+8 cm)
      const e=4,x=s.pos.x,z=s.pos.z;
      n.set(T.meshH(x-e,z)-T.meshH(x+e,z),2*e,T.meshH(x,z-e)-T.meshH(x,z+e)).normalize();
      const d=-(n.x*x+n.y*(h+0.2)+n.z*z);
      // matrice d'ombra classica M = (n·L) I − L ⊗ piano, divisa per n·L (così w resta 1)
      const dot=n.dot(L),pl=[n.x,n.y,n.z,d],l=[L.x,L.y,L.z,0],me=P.elements;
      for(let c=0;c<4;c++)for(let r=0;r<4;r++)me[c*4+r]=(r===c?1:0)-l[r]*pl[c]/dot;
      gr.updateMatrix();
      mesh.matrix.multiplyMatrices(P,gr.matrix);
    };
  }
};
})();
