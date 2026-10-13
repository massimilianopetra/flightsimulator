/* =====================================================================
   ORA DEL VOLO: giorno, tramonto o notte.
   Cambiano cielo, luce del sole (o della luna), nebbia e nuvole; al tramonto
   e di notte si accendono le luci: bordi pista bianchi, soglie verdi, luci di
   avvicinamento sulle piste lunghe, luci delle città (ricavate dalla densità
   degli edifici veri, js/paesaggio.js), stelle e faro di atterraggio.
   Le luci sono "punti" della stessa grandezza a qualsiasi distanza, come le
   luci vere viste di notte; quelle delle città sbiadiscono nella foschia lontana.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};

// macchia di luce morbida (texture comune a tutti i punti)
function texturaLuce(){
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.25,'rgba(255,255,255,.85)');
  gr.addColorStop(0.6,'rgba(255,255,255,.18)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
function punti(pos,col,dim,tex,nebbia=false){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
  geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(col),3));
  const mat=new THREE.PointsMaterial({size:dim,sizeAttenuation:false,map:tex,vertexColors:true,transparent:true,
    depthWrite:false,blending:THREE.AdditiveBlending,fog:nebbia});
  const p=new THREE.Points(geo,mat);p.frustumCulled=false;p.visible=false;
  return p;
}

/* colori e intensità per ogni ora */
const ORE={
  giorno:  {zenit:0x3d7cc4,orizz:0xc9dceb,emiCielo:0xdfeaf5,emiTerra:0x4f5a3c,emi:0.72,sole:0xfff2dc,soleI:0.78,solePos:[-0.5,1,0.35],
            nuvola:0xffffff,nuvolaE:0x404850,vetroE:0x0c1a20,luci:false,stelle:false,faro:0},
  tramonto:{zenit:0x2b3f6e,orizz:0xeea672,emiCielo:0xffc9a0,emiTerra:0x3a3530,emi:0.46,sole:0xffa25e,soleI:0.62,solePos:[-1,0.16,0.15],
            nuvola:0xffc4a2,nuvolaE:0x40261c,vetroE:0x6a5a30,luci:true,stelle:false,faro:1.6},
  notte:   {zenit:0x02040a,orizz:0x0e1828,emiCielo:0x3a4a6a,emiTerra:0x0a0c10,emi:0.16,sole:0x8ea4c8,soleI:0.14,solePos:[0.4,0.8,-0.3],
            nuvola:0x2a3242,nuvolaE:0x05070a,vetroE:0xa08a50,luci:true,stelle:true,faro:3.2},
};

SIM.creaNotte=function(scene,mondo,T){
  const tex=texturaLuce();
  const L=mondo.luci;

  /* ---- luci delle piste ---- */
  const pp=[],pc=[];
  const metti=(x,y,z,c)=>{pp.push(x,y,z);pc.push(c.r,c.g,c.b);};
  const BIANCO=new THREE.Color(1,0.93,0.78),VERDE=new THREE.Color(0.25,1,0.4),GIALLO=new THREE.Color(1,0.85,0.5);
  for(const p of T.piste){
    const rx=-p.dir.z,rz=p.dir.x,y=p.quota+0.5;     // destra rispetto alla pista
    const passo=p.erba?90:60, n=Math.max(2,Math.round(p.L/passo));
    for(let i=0;i<=n;i++){                           // bordi
      const u=-p.L/2+p.L*i/n;
      for(const s of [-1,1])metti(p.cx+p.dir.x*u+rx*s*(p.W/2+1.5),y,p.cz+p.dir.z*u+rz*s*(p.W/2+1.5),BIANCO);
    }
    for(const te of p.testate){                      // soglie verdi
      for(let k=0;k<=8;k++){const v=-p.W/2+p.W*k/8;metti(te.x+(-te.dir.z)*v,y,te.z+te.dir.x*v,VERDE);}
      if(!p.erba&&p.L>=1000){                        // luci di avvicinamento: 300 m di asse e una barra a 150 m
        for(let d=30;d<=300;d+=30)metti(te.x-te.dir.x*d,y+0.5,te.z-te.dir.z*d,BIANCO);
        for(let k=-4;k<=4;k++){const v=k*3.5;metti(te.x-te.dir.x*150+(-te.dir.z)*v,y+0.5,te.z-te.dir.z*150+te.dir.x*v,BIANCO);}
      }
    }
  }
  // luci blu ai bordi del raccordo e del piazzale (pista principale di ogni aeroporto, come in js/mondo.js)
  const BLU=new THREE.Color(0.25,0.45,1);
  for(const p of T.piste){
    if(p!==p.ap.piste[0]||p.ap.rullaggioVero) continue;
    const rx=-p.dir.z,rz=p.dir.x,y=p.quota+0.4,P=(u,v)=>metti(p.cx+p.dir.x*u+rx*v,y,p.cz+p.dir.z*u+rz*v,BLU);
    for(let v=p.W/2+6;v<=70;v+=12){P(-8,v);P(8,v);}
    for(let u=-80;u<=80;u+=20){P(u,140);if(Math.abs(u)>12)P(u,70);}
    for(let v=90;v<140;v+=20){P(-80,v);P(80,v);}
  }
  // vie di rullaggio vere: luci blu sui due bordi, ogni 35 m circa
  if(SIM.reteRullaggio)for(const r of SIM.reteRullaggio.tutte())for(const v of r.vie){
    let resto=0;
    for(let i=1;i<v.pts.length;i++){
      const a=v.pts[i-1],b=v.pts[i],L=Math.hypot(b.x-a.x,b.z-a.z);if(L<0.01) continue;
      const nx=-(b.z-a.z)/L*(v.w/2+1.5),nz=(b.x-a.x)/L*(v.w/2+1.5);
      for(let d=resto;d<L;d+=35){const t=d/L,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=T.meshH(x,z)+0.4;
        metti(x+nx,y,z+nz,BLU);metti(x-nx,y,z-nz,BLU);}
      resto=(resto-L)%35;if(resto<0)resto+=35;
    }
  }
  const luciPiste=punti(pp,pc,7,tex);scene.add(luciPiste);

  /* ---- luci delle città: calcolate solo la prima volta che servono (tramonto o notte), così di giorno
     il caricamento resta veloce (sono qualche centinaio di migliaia di punti) ---- */
  let luciCitta=null,cittaFatte=false;
  function costruisciCitta(){
    cittaFatte=true;
    const cp=[],cc=[],caldo=new THREE.Color(1,0.78,0.45),freddo=new THREE.Color(1,0.95,0.82),col=new THREE.Color();
    const rnd=T.rng(4242);
    const den=SIM.densitaEdifici?SIM.densitaEdifici():null;
    if(den&&den.DEN){
      const {DS,DEN}=den,P=DS.passo;
      for(let j=0;j<DS.altezza;j++)for(let i=0;i<DS.larghezza;i++){
        const v=DEN[j*DS.larghezza+i];if(v<5) continue;
        const c=v/255, n=(rnd()<Math.min(1,c*5)?1:0)+(c>0.2&&rnd()<0.8?1:0);
        for(let k=0;k<n;k++){
          const x=DS.x0+(i+rnd())*P, z=j*P-DS.yNord+rnd()*P;
          col.copy(caldo).lerp(freddo,rnd());cp.push(x,T.naturale(x,z)+6,z);cc.push(col.r,col.g,col.b);
        }
      }
    }else{ // mondo inventato: luci attorno ai centri dei paesi
      for(const c of T.citta)for(let k=0;k<(c.n||40)*1.5;k++){
        const a=rnd()*Math.PI*2,r=c.r*Math.sqrt(rnd()),x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;
        col.copy(caldo).lerp(freddo,rnd());cp.push(x,T.terrainH(x,z)+5,z);cc.push(col.r,col.g,col.b);
      }
    }
    // le luci delle città si spengono con la distanza (verso il nero): con la nebbia normale prenderebbero il suo colore e,
    // sommate a migliaia all'orizzonte, farebbero una striscia chiara
    luciCitta=cp.length?punti(cp,cc,2.4,tex,false):null;
    if(luciCitta)luciCitta.material.onBeforeCompile=sh=>{   // e si spengono del tutto oltre ~28 km
      sh.vertexShader='varying float vVicino;\n'+sh.vertexShader.replace('#include <fog_vertex>','#include <fog_vertex>\nvVicino=1.0-smoothstep(6000.0,28000.0,-mvPosition.z);');
      sh.fragmentShader='varying float vVicino;\n'+sh.fragmentShader.replace('#include <fog_fragment>','gl_FragColor.rgb*=vVicino;\n#include <fog_fragment>');
    };
    if(luciCitta)scene.add(luciCitta);
  }

  /* ---- stelle (seguono la telecamera, come il cielo) ---- */
  const rnd=T.rng(4243);
  const sp=[],sc=[];
  for(let i=0;i<1600;i++){
    const u=rnd(),a=rnd()*Math.PI*2,el=Math.asin(0.1+0.9*u), r=7000;   // distribuite sulla volta, non troppo basse
    // vicino all'orizzonte si affollano (prospettiva) e la foschia le spegne: sfumano sotto i 25°
    const k=(0.45+rnd()*0.55)*Math.min(1,Math.max(0,(el-0.1)/0.33));
    sp.push(Math.cos(a)*Math.cos(el)*r,Math.sin(el)*r,Math.sin(a)*Math.cos(el)*r);sc.push(k,k,k*1.05);
  }
  const stelle=punti(sp,sc,2,tex);stelle.renderOrder=-5;scene.add(stelle);

  /* ---- faro di atterraggio (sull'aereo, verso avanti e un po' in basso) ---- */
  const faro=new THREE.SpotLight(0xfff1dc,0,900,0.32,0.55,1);
  faro.position.set(0,-0.4,-2.2);faro.target.position.set(0,-70,-400);
  mondo.aereo.gruppo.add(faro);mondo.aereo.gruppo.add(faro.target);

  let ora='giorno';
  function imposta(o){
    const k=ORE[o]?o:'giorno', c=ORE[k];ora=k;
    L.cielo.material.uniforms.alto.value.setHex(c.zenit);
    L.cielo.material.uniforms.basso.value.setHex(c.orizz);
    scene.background.setHex(c.orizz);scene.fog.color.setHex(c.orizz);
    L.emi.color.setHex(c.emiCielo);L.emi.groundColor.setHex(c.emiTerra);L.emi.intensity=c.emi;
    L.sole.color.setHex(c.sole);L.sole.intensity=c.soleI;L.sole.position.set(...c.solePos);
    L.matNuvola.color.setHex(c.nuvola);L.matNuvola.emissive.setHex(c.nuvolaE);
    L.matVetro.emissive.setHex(c.vetroE);
    if(c.luci&&!cittaFatte)costruisciCitta();
    luciPiste.visible=c.luci;if(luciCitta){luciCitta.visible=c.luci;luciCitta.material.opacity=k==='tramonto'?0.4:1;}stelle.visible=c.stelle;
    faro.intensity=c.faro;
    for(const l of mondo.aereo.luciNav)l.scale.setScalar(c.luci?2.2:1);
  }
  return {
    imposta, get ora(){return ora;},
    aggiorna(cam){if(stelle.visible)stelle.position.copy(cam);},
  };
};
})();
