/* =====================================================================
   ORA DEL VOLO: giorno, tramonto o notte.
   Cambiano cielo, luce del sole (o della luna), nebbia e nuvole; al tramonto
   e di notte si accendono le luci: bordi pista bianchi, soglie verdi, luci di
   avvicinamento sulle piste lunghe (Calvert con lampi in sequenza dove ci
   sono davvero: Caselle, Malpensa, Linate, Genova, Cuneo), luci delle città (ricavate dalla densità
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

/* luci di avvicinamento "Calvert" (ICAO, 900 m di asse con barre trasversali) dove ci sono davvero:
   prua di atterraggio (gradi veri) e categoria; 2 = CAT II/III (barre rosse ai lati negli ultimi 300 m e
   luci della zona di contatto sulla pista). Ricavato dagli AIP a memoria: da ricontrollare.
   Le altre piste asfaltate lunghe tengono le luci semplici (300 m e una barra). */
const CALVERT={
  LIMF:[{hdg:3,cat:2}],     // Torino Caselle 36
  LIMC:[{hdg:349,cat:2}],   // Malpensa 35L e 35R
  LIML:[{hdg:356,cat:2}],   // Linate 36
  LIMJ:[{hdg:285,cat:1}],   // Genova 29
  LIMZ:[{hdg:32,cat:1}],    // Cuneo Levaldigi 03
};
const calvertDi=te=>{
  const l=CALVERT[te.pista.ap.codice];if(!l) return null;
  return l.find(c=>Math.abs(((te.hdg-c.hdg)%360+540)%360-180)<20)||null;
};
/* fin dove arrivano le luci di avvicinamento (m prima della soglia, al massimo "max", a passi di 30 m):
   si fermano prima della prima strada, ferrovia o zona costruita (come i sistemi accorciati veri),
   così non escono dal sedime sopra le case o in mezzo all'autostrada */
const lunghe=new Map();
function lunghezzaLuci(te,max){
  const ch=te.pista.ap.codice+te.nome+max;
  if(lunghe.has(ch)) return lunghe.get(ch);
  const den=SIM.densitaEdifici?SIM.densitaEdifici():null;
  const costruito=(x,z)=>{
    if(!den||!den.DEN) return false;
    const DS=den.DS,i=Math.floor((x-DS.x0)/DS.passo),j=Math.floor((DS.yNord+z)/DS.passo);
    return i>=0&&j>=0&&i<DS.larghezza&&j<DS.altezza&&den.DEN[j*DS.larghezza+i]>=5;   // da 5 in su js/paesaggio.js mette case
  };
  const libero=(d,v)=>{
    const x=te.x-te.dir.x*d-te.dir.z*v,z=te.z-te.dir.z*d+te.dir.x*v;
    return !(SIM.viaSu&&SIM.viaSu(x,z,4))&&!costruito(x,z);
  };
  let L=0;
  for(let d=30;d<=max;d+=30){
    const mezza=d%150===0&&d<=750?6+0.03*d:d<=270?12:2;   // dove ci sono le barre trasversali o le file rosse, anche le estremità
    if(!libero(d,0)||!libero(d,mezza)||!libero(d,-mezza)) break;
    L=d;
  }
  lunghe.set(ch,L);
  return L;
}
// true se il punto è nella fascia delle Calvert (fin dove arrivano, 45 m per lato): lì niente case generate (js/paesaggio.js)
let zoneCalvert=null;
SIM.zonaCalvert=(x,z)=>{
  if(!zoneCalvert){
    zoneCalvert=[];
    for(const p of SIM.terreno.piste)for(const te of p.testate)if(calvertDi(te))zoneCalvert.push({te,L:lunghezzaLuci(te,900)});
  }
  for(const {te,L} of zoneCalvert){
    const dx=x-te.x,dz=z-te.z,d=-(dx*te.dir.x+dz*te.dir.z),v=Math.abs(-dx*te.dir.z+dz*te.dir.x);
    if(d>-10&&d<L+40&&v<45) return true;
  }
  return false;
};

SIM.creaNotte=function(scene,mondo,T){
  const tex=texturaLuce();
  const L=mondo.luci;

  /* ---- luci delle piste ---- */
  const pp=[],pc=[];
  const metti=(x,y,z,c)=>{pp.push(x,y,z);pc.push(c.r,c.g,c.b);};
  const BIANCO=new THREE.Color(1,0.93,0.78),VERDE=new THREE.Color(0.25,1,0.4),GIALLO=new THREE.Color(1,0.85,0.5);
  const ROSSO=new THREE.Color(1,0.14,0.08);
  const lampi=[];   // luci a lampi in sequenza ("coniglio"): x, y, z, numero nella fila (0 = la più lontana)
  function calvert(p,te,cv,Lc){
    const rx=-te.dir.z,rz=te.dir.x;   // destra di chi atterra
    // punto a d m prima della soglia e v m a destra; sul terreno (sull'acqua: a livello del mare)
    const P=(d,v,c,su=1.2)=>{const x=te.x-te.dir.x*d+rx*v,z=te.z-te.dir.z*d+rz*v;
      metti(x,Math.max(T.terrainH(x,z),0)+su,z,c);};
    for(let d=30;d<=Lc;d+=30){
      for(let k=-2;k<=2;k++)P(d,k*1,BIANCO);          // asse: barrette di 5 luci su 4 m
      if(d>=300){const x=te.x-te.dir.x*d,z=te.z-te.dir.z*d;lampi.push(x,Math.max(T.terrainH(x,z),0)+1.6,z,(Lc-d)/30);}
    }
    // barre trasversali a 150, 300, 450, 600, 750 m: le estremità su due rette che si allargano
    for(let d=150;d<=Math.min(750,Lc);d+=150){
      const mezza=6+0.03*d;
      for(let v=4;v<=mezza;v+=1.5){P(d,v,BIANCO);P(d,-v,BIANCO);}
    }
    if(cv.cat>=2){
      // negli ultimi 270 m: barrette rosse di 3 luci ai due lati dell'asse
      for(let d=30;d<=Math.min(270,Lc);d+=30)for(const s of [-1,1])for(let k=0;k<3;k++)P(d,s*(9+k*1.5),ROSSO);
      // zona di contatto: barrette bianche sulla pista nei primi 900 m
      for(let u=60;u<=900;u+=60)for(const s of [-1,1])for(let k=0;k<3;k++){
        const v=s*(9+k*1.5);metti(te.x+te.dir.x*u+rx*v,p.quota+0.35,te.z+te.dir.z*u+rz*v,BIANCO);
      }
    }
  }
  for(const p of T.piste){
    const rx=-p.dir.z,rz=p.dir.x,y=p.quota+0.5;     // destra rispetto alla pista
    const passo=p.erba?90:60, n=Math.max(2,Math.round(p.L/passo));
    for(let i=0;i<=n;i++){                           // bordi
      const u=-p.L/2+p.L*i/n;
      for(const s of [-1,1])metti(p.cx+p.dir.x*u+rx*s*(p.W/2+1.5),y,p.cz+p.dir.z*u+rz*s*(p.W/2+1.5),BIANCO);
    }
    for(const te of p.testate){                      // soglie verdi
      for(let k=0;k<=8;k++){const v=-p.W/2+p.W*k/8;metti(te.x+(-te.dir.z)*v,y,te.z+te.dir.x*v,VERDE);}
      const cv=calvertDi(te);
      const Lc=cv?lunghezzaLuci(te,900):0;
      if(Lc>=150){calvert(p,te,cv,Lc);continue;}
      if(!p.erba&&p.L>=1000){                        // luci di avvicinamento: 300 m di asse e una barra a 150 m
        const Ls=lunghezzaLuci(te,300);
        for(let d=30;d<=Ls;d+=30)metti(te.x-te.dir.x*d,y+0.5,te.z-te.dir.z*d,BIANCO);
        if(Ls>=150)for(let k=-4;k<=4;k++){const v=k*3.5;metti(te.x-te.dir.x*150+(-te.dir.z)*v,y+0.5,te.z-te.dir.z*150+te.dir.x*v,BIANCO);}
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
  // lampi in sequenza delle Calvert: due volte al secondo corrono dai 900 m verso la soglia
  const nLampi=lampi.length/4,lp=[],ord=new Float32Array(nLampi);
  for(let i=0;i<nLampi;i++){lp.push(lampi[i*4],lampi[i*4+1],lampi[i*4+2]);ord[i]=lampi[i*4+3];}
  const luciLampi=nLampi?punti(lp,new Array(nLampi*3).fill(0),22,tex):null;
  if(luciLampi)scene.add(luciLampi);
  function aggiornaLampi(){
    const t=(performance.now()/500)%1,att=t*25,c=luciLampi.geometry.attributes.color;   // 21 luci in 0,42 s, poi buio
    for(let i=0;i<nLampi;i++){
      const r=att-ord[i],k=r>=0&&r<2.5?0.8*(1-r/2.5):0;   // lampo con una breve scia, né troppo forte né troppo debole
      c.array[i*3]=k*0.85;c.array[i*3+1]=k*0.92;c.array[i*3+2]=k;
    }
    c.needsUpdate=true;
  }

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
    luciPiste.visible=c.luci;if(luciLampi)luciLampi.visible=c.luci;if(luciCitta){luciCitta.visible=c.luci;luciCitta.material.opacity=k==='tramonto'?0.4:1;}stelle.visible=c.stelle;
    faro.intensity=window.AEREO&&window.AEREO.id==='c42'?0:c.faro;   // il C42 di serie non ha il faro di atterraggio
    for(const l of mondo.aereo.luciNav)l.scale.setScalar(c.luci?2.2:1);
    if(SIM.aeroporti3D)SIM.aeroporti3D.ora(k);   // vetrate accese e torri faro (js/aeroporti-3d.js)
    if(SIM.cartelliRullaggio)SIM.cartelliRullaggio.ora(k);
    if(SIM.traffico)SIM.traffico.ora(k);   // luci degli altri aerei (js/traffico.js)   // cartelli delle vie di rullaggio illuminati (js/rullaggio.js)
  }
  return {
    imposta, get ora(){return ora;},
    aggiorna(cam){if(stelle.visible)stelle.position.copy(cam);if(luciLampi&&luciLampi.visible)aggiornaLampi();},
  };
};
})();
