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
   METEO: si sceglie nel briefing (localStorage volo-meteo). "Nessuno" è il
   tempo calmo della mappa (come prima); gli scenari sono bel tempo con
   termiche, vento forte, coperto con nubi basse, pioggia, temporali,
   nebbia in pianura, neve, oppure uno a caso. Niente dati: tutto nasce qui.
   - Nuvole: cumuli fatti di "batuffoli" (quadrati rivolti alla telecamera,
     un solo disegno, ordinati dal più lontano), trascinati dal vento e
     ripetuti in un riquadro attorno alla telecamera; cumulonembi alti 9 km
     con la colonna di pioggia sotto; strati (coperto, nebbia) come due
     lastre con rumore nello shader, sopra e sotto. Dentro una nuvola la
     nebbia si chiude a poche decine di metri.
   - Sotto il coperto cielo e luci si incupiscono; sopra torna il sole.
   - Pioggia (righe) e neve (punti) attorno alla telecamera; fulmini e tuoni.
   - Vento: gira e rinforza con la quota, raffiche, turbolenza (più forte
     col vento sui rilievi), correnti di pendio (sale sopravvento, scende
     sottovento), termiche sotto i cumuli, discendenze e raffiche dei temporali.
   - Fisica: temperatura (densità dell'aria) e pista bagnata o innevata
     (SIM.atmosfera, letta da js/fisica.js). METAR per briefing e radio.
   SIM.creaMeteo({scene,mondo,T,camera}) -> {imposta(tipo), vento(t,st,out),
     aggiorna(st,cam,dt), ora(k,c), metar(ap), descrizione(ap), vmc(ap), inizio(pos), ...}
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const L=(it,en)=>SIM.L?SIM.L(it,en):it;
const D2R=Math.PI/180, KT=1.943844, FT=3.28084;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

// gli scenari del briefing, nell'ordine del menu
const TIPI=['no','casuale','bello','ventoso','coperto','pioggia','temporali','nebbia','neve'];
const NOMI={
  no:['Nessuno (tempo calmo)','None (calm weather)'],casuale:['A caso','Random'],
  bello:['Bel tempo con termiche','Fair weather with thermals'],ventoso:['Vento forte e raffiche','Strong gusty wind'],
  coperto:['Coperto con nubi basse','Overcast, low cloud'],pioggia:['Pioggia','Rain'],
  temporali:['Temporali','Thunderstorms'],nebbia:['Nebbia in pianura','Fog in the plain'],neve:['Neve','Snow'],
};
// "a caso": quanto spesso esce ogni scenario
const PESI={bello:30,ventoso:15,coperto:15,pioggia:12,temporali:10,nebbia:10,neve:8};

/* parametri di ogni scenario. ref = quota "della pianura" (mediana degli aeroporti), r(a,b) = numero a caso */
function scenario(tipo,r,ref){
  const dir=Math.round(r(0,36))*10||360;
  const base={ventoDa:dir,veer:r(15,35),aumento:0.5,turbolenza:0.3,termiche:0,nuvole:0,baseNuvole:ref+1500,spessore:600,
    strato:null,nebbia:null,pioggia:0,neve:false,temporali:0,aderenza:1};
  const t=(o,temp,spread,q)=>Object.assign(base,o,{temperatura:Math.round(temp),rugiada:Math.round(temp-spread),qnh:Math.round(q)});
  switch(tipo){
    case 'bello':{const v=Math.round(r(4,10));
      return t({ventoNodi:v,raffiche:Math.round(r(2,5)),termiche:1,nuvole:Math.round(r(25,45)),baseNuvole:ref+r(1300,1700),spessore:r(500,900),
        turbolenza:0.4,visibilita:Math.round(r(40,70))},r(22,28),r(9,13),r(1016,1026));}
    case 'ventoso':{const v=Math.round(r(18,26));
      return t({ventoNodi:v,raffiche:Math.round(r(10,15)),veer:r(10,25),aumento:0.4,turbolenza:1.6,termiche:0.2,nuvole:Math.round(r(12,25)),
        baseNuvole:ref+r(1400,1900),spessore:r(250,450),visibilita:Math.round(r(50,70))},r(12,18),r(7,10),r(998,1010));}
    case 'coperto':{const b=ref+r(300,450);
      return t({ventoNodi:Math.round(r(6,12)),raffiche:Math.round(r(2,5)),turbolenza:0.5,strato:{base:b,cima:b+r(500,800),cop:1},
        pioggia:0.12,visibilita:Math.round(r(6,9)),aderenza:0.85},r(8,13),r(1,2.5),r(1004,1013));}
    case 'pioggia':{const b=ref+r(480,700);
      return t({ventoNodi:Math.round(r(10,16)),raffiche:Math.round(r(6,11)),turbolenza:0.9,strato:{base:b,cima:b+r(1400,2000),cop:0.95},
        pioggia:0.7,visibilita:Math.round(r(3,5)),aderenza:0.7},r(8,12),r(0.5,1.5),r(996,1006));}
    case 'temporali':
      return t({ventoNodi:Math.round(r(5,10)),raffiche:Math.round(r(4,7)),turbolenza:0.6,termiche:0.6,nuvole:Math.round(r(35,55)),
        baseNuvole:ref+r(1100,1400),spessore:r(900,1500),temporali:Math.round(r(6,9)),visibilita:Math.round(r(22,35))},r(25,30),r(6,9),r(1008,1014));
    case 'nebbia':
      return t({ventoNodi:Math.round(r(0,3)),raffiche:0,turbolenza:0,nebbia:{cima:ref+r(180,280),vis:Math.round(r(4,9))*100},
        visibilita:Math.round(r(35,55)),aderenza:0.85},r(2,6),r(0,0.6),r(1022,1032));
    case 'neve':{const b=ref+r(450,650);
      return t({ventoNodi:Math.round(r(5,10)),raffiche:Math.round(r(3,6)),turbolenza:0.5,strato:{base:b,cima:b+r(1500,2200),cop:1},
        pioggia:0.6,neve:true,visibilita:Math.round(r(2,4)),aderenza:0.45},r(-4,-1),r(0.5,1.5),r(1000,1010));}
  }
  return null;
}

/* texture dei batuffoli: 4 varianti in una tela 2x2, rosso = chiaroscuro interno, alfa = forma morbida */
function texturaBatuffoli(){
  const N=256,h=N/2,c=document.createElement('canvas');c.width=c.height=N;
  const g=c.getContext('2d');let s=12345;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647;};
  for(let v=0;v<4;v++){
    const ox=(v%2)*h,oy=(v>>1)*h;
    g.save();g.beginPath();g.rect(ox,oy,h,h);g.clip();
    const blob=(x,y,r,a,l)=>{const gr=g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,`rgba(${l},${l},${l},${a})`);gr.addColorStop(0.55,`rgba(${l},${l},${l},${a*0.55})`);gr.addColorStop(1,`rgba(${l},${l},${l},0)`);
      g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r);};
    blob(ox+h/2,oy+h/2,h*0.46,0.8,200);
    for(let k=0;k<14;k++){const a=rnd()*Math.PI*2,d=rnd()*h*0.24,x=ox+h/2+Math.cos(a)*d,y=oy+h/2+Math.sin(a)*d*0.85;
      blob(x,y,h*(0.12+rnd()*0.16),0.5,y<oy+h/2?255:150);}
    g.restore();
  }
  const tex=new THREE.CanvasTexture(c);tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;
  return tex;
}

const GLSL_RUMORE=`
float hsh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=vn(p)*a;p=p*2.03+vec2(17.3,-9.1);a*=0.5;}return s;}
`;

SIM.creaMeteo=function({scene,mondo,T,camera}){
  const met=mondo.meteo;
  const mappa=Object.assign({},met);   // il tempo della mappa, per "Nessuno"
  const Lu=mondo.luci;
  const quote=T.aeroporti.map(a=>a.quota).sort((a,b)=>a-b);
  const REF=quote.length?quote[quote.length>>1]:200;
  let tipo='no',scelto='no',attivo=false;
  const atm=SIM.atmosfera=SIM.atmosfera||{dT:0,aderenza:1};
  const unif=()=>THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);

  /* ---------- cumuli e cumulonembi: batuffoli in un solo disegno ---------- */
  const texB=texturaBatuffoli();
  const VS_B=`
attribute vec4 aG; attribute vec4 aO; attribute vec4 aI;
uniform vec3 uCam; uniform vec2 uDeriva;
varying vec2 vUv; varying float vH; varying float vA; varying float vScuro; varying float vY;
#include <fog_pars_vertex>
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){
  float H=aG.z; vec2 c=aG.xy+uDeriva;
  c=uCam.xz+mod(c-uCam.xz+H,2.0*H)-H;
  vec3 p=vec3(c.x,aG.w,c.y)+aO.xyz;
  vec4 mvPosition=viewMatrix*vec4(p,1.0);
  float d=length(mvPosition.xyz);
  float r=aI.z; vec2 q=mat2(cos(r),sin(r),-sin(r),cos(r))*position.xy;
  mvPosition.xy+=q*aO.w*vec2(1.25,1.0);   // un po' più larghi che alti
  vec2 dc=abs(c-uCam.xz);
  vA=smoothstep(aO.w*0.5,aO.w*1.6,d)*(1.0-smoothstep(H*0.8,H*0.97,max(dc.x,dc.y)));
  float v=aI.w; vUv=vec2(mod(v,2.0),floor(v/2.0))*0.5+(position.xy*0.5+0.5)*0.5;
  vH=aI.x; vScuro=aI.y; vY=position.y*0.5+0.5;
  gl_Position=projectionMatrix*mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
  const FS_B=`
uniform sampler2D uTex; uniform vec3 uLuce; uniform vec3 uOmbra; uniform float uLampo;
varying vec2 vUv; varying float vH; varying float vA; varying float vScuro; varying float vY;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  vec4 t=texture2D(uTex,vUv);
  float a=t.a*vA; if(a<0.01) discard;
  float sh=clamp(vH*0.55+vY*0.35+(t.r-0.6)*0.6,0.0,1.0);
  vec3 col=mix(uOmbra,uLuce,sh)*(1.0-vScuro*(1.0-vH)*0.65)+uLampo*vec3(0.55,0.6,0.75);
  gl_FragColor=vec4(col,a);
  #include <fog_fragment>
}`;
  function matBatuffoli(){
    return new THREE.ShaderMaterial({uniforms:Object.assign(unif(),{uTex:{value:texB},uCam:{value:new THREE.Vector3()},uDeriva:{value:new THREE.Vector2()},
      uLuce:{value:new THREE.Color(1,1,1)},uOmbra:{value:new THREE.Color(0.6,0.63,0.68)},uLampo:{value:0}}),
      vertexShader:VS_B,fragmentShader:FS_B,transparent:true,depthWrite:false,fog:true});
  }
  /* una nuvola = {x,z,y (base),H (mezzo lato del riquadro), R (raggio), alta, pezzi:[{x,y,z,s,h,v,r}]} */
  function cumulo(rnd,x,z,y,H,R,alta){
    const n=Math.round(clamp(R/28,9,26)),pezzi=[];
    for(let i=0;i<n;i++){
      const a=rnd()*Math.PI*2,d=Math.sqrt(rnd())*R*0.62,h=Math.pow(rnd(),1.2);
      const s=R*(0.42+rnd()*0.2)*(1-h*0.3);
      pezzi.push({x:Math.cos(a)*d,y:s*0.35+h*alta*(1-0.5*(d/R)*(d/R)),z:Math.sin(a)*d*0.8,s,h:clamp(h+0.15,0,1),v:rnd()*4|0,r:rnd()*6.28});
    }
    return {x,z,y,H,R,alta,pezzi,scuro:0};
  }
  function cumulonembo(rnd,x,z,y,H){
    const R=r2(rnd,2200,3200),top=r2(rnd,8000,9500)-y,pezzi=[];
    for(let k=0;k<70;k++){
      const h=Math.pow(rnd(),0.9),hy=h*top;
      const larg=R*(0.55+0.25*Math.sin(h*2.6)+(h>0.82?(h-0.82)*6:0));   // si allarga in cima: l'incudine
      const a=rnd()*Math.PI*2,d=Math.sqrt(rnd())*larg*0.7,s=larg*(0.32+rnd()*0.2);
      pezzi.push({x:Math.cos(a)*d,y:hy+s*0.3,z:Math.sin(a)*d,s,h:clamp(h*1.2,0,1),v:rnd()*4|0,r:rnd()*6.28});
    }
    return {x,z,y,H,R,alta:top,pezzi,scuro:0.85,cb:true};
  }
  const r2=(rnd,a,b)=>a+rnd()*(b-a);
  // geometria comune: un quadrato da -1 a 1, ripetuto con gli attributi di ogni batuffolo
  function geoBatuffoli(nuvole){
    const n=nuvole.reduce((s,c)=>s+c.pezzi.length,0);
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3));
    g.setIndex([0,1,2,0,2,3]);
    const src={G:new Float32Array(n*4),O:new Float32Array(n*4),I:new Float32Array(n*4)};
    let i=0;
    for(const c of nuvole)for(const p of c.pezzi){
      src.G.set([c.x,c.z,c.H,c.y],i*4);src.O.set([p.x,p.y,p.z,p.s],i*4);src.I.set([p.h,c.scuro,p.r,p.v],i*4);i++;
    }
    for(const k of ['G','O','I'])g.setAttribute('a'+k,new THREE.InstancedBufferAttribute(src[k].slice(),4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount=n;
    return {g,src,n,ord:new Uint32Array(n).map((_,k)=>k),dist:new Float32Array(n)};
  }
  // riordina dal più lontano al più vicino (le trasparenze vanno disegnate così)
  function ordina(b,cam,dx,dz){
    const {src,n,ord,dist}=b;
    for(let i=0;i<n;i++){
      const H=src.G[i*4+2];
      let x=src.G[i*4]+dx-cam.x,z=src.G[i*4+1]+dz-cam.z;
      x=((x+H)%(2*H)+2*H)%(2*H)-H;z=((z+H)%(2*H)+2*H)%(2*H)-H;
      x+=src.O[i*4];z+=src.O[i*4+2];const y=src.G[i*4+3]+src.O[i*4+1]-cam.y;
      dist[i]=x*x+y*y+z*z;
    }
    ord.sort((a,b)=>dist[b]-dist[a]);
    for(const k of ['G','O','I']){
      const at=b.g.attributes['a'+k],dst=at.array,s=src[k];
      for(let j=0;j<n;j++){const o=ord[j]*4;dst[j*4]=s[o];dst[j*4+1]=s[o+1];dst[j*4+2]=s[o+2];dst[j*4+3]=s[o+3];}
      at.needsUpdate=true;
    }
  }
  const matCu=matBatuffoli(),matCb=matBatuffoli();
  const meshCu=new THREE.Mesh(new THREE.BufferGeometry(),matCu),meshCb=new THREE.Mesh(new THREE.BufferGeometry(),matCb);
  for(const m of [meshCu,meshCb]){m.frustumCulled=false;m.renderOrder=3;scene.add(m);}
  let cumuli=[],celle=[],bCu=null,bCb=null;

  /* ---------- colonne di pioggia sotto i temporali ---------- */
  const matColonna=new THREE.ShaderMaterial({uniforms:Object.assign(unif(),{uCol:{value:new THREE.Color(0.45,0.48,0.52)},uT:{value:0}}),
    vertexShader:`varying vec2 vUv;
#include <fog_pars_vertex>
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`,
    fragmentShader:`uniform vec3 uCol;uniform float uT;varying vec2 vUv;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${GLSL_RUMORE}
void main(){
#include <logdepthbuf_fragment>
  float s=fbm(vec2(vUv.x*40.0,vUv.y*3.0+uT*0.6));
  float a=(0.25+0.4*s)*smoothstep(0.0,0.25,vUv.y)*(1.0-smoothstep(0.9,1.0,vUv.y));
  gl_FragColor=vec4(uCol,a);
#include <fog_fragment>
}`,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true});
  const colonne=[];

  /* ---------- fulmini ---------- */
  const matFulmine=new THREE.LineBasicMaterial({color:0xf0f4ff,fog:false,transparent:true});
  const fulmine=new THREE.Line(new THREE.BufferGeometry(),matFulmine);fulmine.visible=false;fulmine.frustumCulled=false;scene.add(fulmine);
  let lampo=0,prossimoLampo=6,tuoni=[];

  /* ---------- strati: lastra di sotto (base) e di sopra (cima) ---------- */
  function matStrato(sopra){
    return new THREE.ShaderMaterial({uniforms:Object.assign(unif(),{uCol:{value:new THREE.Color()},uCop:{value:1},uSopra:{value:sopra?1:0},uDeriva:{value:new THREE.Vector2()}}),
      vertexShader:`varying vec2 vW;
#include <fog_pars_vertex>
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xz;vec4 mvPosition=viewMatrix*w;gl_Position=projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`,
      fragmentShader:`uniform vec3 uCol;uniform float uCop;uniform float uSopra;uniform vec2 uDeriva;varying vec2 vW;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${GLSL_RUMORE}
void main(){
#include <logdepthbuf_fragment>
  vec2 p=(vW-uDeriva)/2600.0;
  float n=fbm(p),f=fbm(p*7.0+3.1);
  float a=uCop>=0.99?0.93+0.07*n:smoothstep(1.0-uCop-0.08,1.0-uCop+0.1,n*0.85+f*0.25);
  if(a<0.03) discard;
  float l=uSopra>0.5?0.82+0.25*f+0.1*n:0.78+0.3*(1.0-n)-0.12*f;
  gl_FragColor=vec4(uCol*l,a);
#include <fog_fragment>
}`,transparent:true,depthWrite:true,side:THREE.DoubleSide,fog:true});
  }
  const LATO=160000;
  const geoLastra=new THREE.PlaneGeometry(LATO,LATO,1,1).rotateX(-Math.PI/2);
  const lastraBase=new THREE.Mesh(geoLastra,matStrato(false)),lastraCima=new THREE.Mesh(geoLastra,matStrato(true));
  for(const m of [lastraBase,lastraCima]){m.frustumCulled=false;m.visible=false;m.renderOrder=2;scene.add(m);}

  /* ---------- pioggia (righe) e neve (punti) attorno alla telecamera ---------- */
  const NP=7000,BOX=48;
  const geoP=new THREE.BufferGeometry();
  {const pos=new Float32Array(NP*6),e=new Float32Array(NP*2);let s=777;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647;};
   for(let i=0;i<NP;i++){const x=rnd(),y=rnd(),z=rnd();pos.set([x,y,z,x,y,z],i*6);e[i*2+1]=1;}
   geoP.setAttribute('position',new THREE.BufferAttribute(pos,3));geoP.setAttribute('aE',new THREE.BufferAttribute(e,1));}
  const uniP={uCam:{value:new THREE.Vector3()},uB:{value:BOX},uT:{value:0},uV:{value:new THREE.Vector3(0,-9,0)},uRel:{value:new THREE.Vector3()},
    uCol:{value:new THREE.Color(0.75,0.78,0.82)},uA:{value:0.32}};
  const matPioggia=new THREE.ShaderMaterial({uniforms:uniP,vertexShader:`attribute float aE;uniform vec3 uCam;uniform float uB;uniform float uT;uniform vec3 uV;uniform vec3 uRel;varying float vD;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){vec3 P=position*uB+uV*uT;P=uCam+mod(P-uCam+0.5*uB,uB)-0.5*uB;P-=uRel*aE;
vec4 mv=viewMatrix*vec4(P,1.0);vD=length(mv.xyz);gl_Position=projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`,fragmentShader:`uniform vec3 uCol;uniform float uA;uniform float uB;varying float vD;
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
gl_FragColor=vec4(uCol,uA*smoothstep(2.5,6.0,vD)*(1.0-smoothstep(uB*0.3,uB*0.5,vD)));}`,transparent:true,depthWrite:false});
  const pioggia=new THREE.LineSegments(geoP,matPioggia);pioggia.frustumCulled=false;pioggia.visible=false;pioggia.renderOrder=5;scene.add(pioggia);
  const geoN=new THREE.BufferGeometry();geoN.setAttribute('position',geoP.attributes.position);
  const uniN=Object.assign({},uniP,{uV:{value:new THREE.Vector3(0,-1.4,0)},uCol:{value:new THREE.Color(0.95,0.96,1)},uA:{value:0.85},uB:{value:40}});
  const matNeve=new THREE.ShaderMaterial({uniforms:uniN,vertexShader:`uniform vec3 uCam;uniform float uB;uniform float uT;uniform vec3 uV;varying float vD;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){vec3 P=position*uB+uV*uT;P.x+=sin(uT*1.3+position.y*50.0)*0.8;P.z+=cos(uT*1.1+position.x*40.0)*0.8;
P=uCam+mod(P-uCam+0.5*uB,uB)-0.5*uB;vec4 mv=viewMatrix*vec4(P,1.0);vD=length(mv.xyz);
gl_PointSize=clamp(90.0/vD,1.0,7.0);gl_Position=projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`,fragmentShader:`uniform vec3 uCol;uniform float uA;uniform float uB;varying float vD;
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
vec2 c=gl_PointCoord-0.5;float a=uA*(1.0-smoothstep(0.2,0.5,length(c)))*smoothstep(1.5,4.0,vD)*(1.0-smoothstep(uB*0.3,uB*0.5,vD));
if(a<0.02)discard;gl_FragColor=vec4(uCol,a);}`,transparent:true,depthWrite:false});
  const neve=new THREE.Points(geoN,matNeve);neve.frustumCulled=false;neve.visible=false;neve.renderOrder=5;scene.add(neve);

  /* ---------- costruzione dello scenario ---------- */
  function costruisci(){
    const rnd=T.rng(Math.floor(Math.random()*1e9));
    cumuli=[];celle=[];
    // cumuli in un riquadro di 60 km attorno alla telecamera (ripetuto): tanti quanti dice "nuvole"
    const H=30000,nc=Math.round(clamp(met.nuvole,0,100)*(attivo?16:14));
    for(let i=0;i<nc;i++){
      const R=r2(rnd,220,attivo?650:500)*(attivo&&tipo==='ventoso'?1.3:1);
      cumuli.push(cumulo(rnd,(rnd()-0.5)*2*H,(rnd()-0.5)*2*H,met.baseNuvole+(rnd()-0.5)*120,H,R,(met.spessore||400)*(0.4+rnd()*0.8)));
    }
    if(met.temporali){const HC=45000;
      for(let i=0;i<met.temporali;i++)celle.push(cumulonembo(rnd,(rnd()-0.5)*2*HC,(rnd()-0.5)*2*HC,met.baseNuvole-150,HC));}
    if(bCu)bCu.g.dispose();if(bCb)bCb.g.dispose();
    bCu=cumuli.length?geoBatuffoli(cumuli):null;bCb=celle.length?geoBatuffoli(celle):null;
    meshCu.geometry=bCu?bCu.g:new THREE.BufferGeometry();meshCu.visible=!!bCu;
    meshCb.geometry=bCb?bCb.g:new THREE.BufferGeometry();meshCb.visible=!!bCb;
    for(const c of colonne){scene.remove(c);c.geometry.dispose();}
    colonne.length=0;
    for(const c of celle){
      const h=c.y+300,m=new THREE.Mesh(new THREE.CylinderGeometry(c.R*0.75,c.R*0.95,h,28,1,true).translate(0,h/2-300,0),matColonna);
      m.frustumCulled=false;m.renderOrder=2;scene.add(m);colonne.push(m);
    }
    const s=met.strato||null,nb=met.nebbia||null;
    lastraBase.visible=!!s;lastraCima.visible=!!(s||nb);
    if(s){lastraBase.position.y=s.base;lastraCima.position.y=s.cima;lastraBase.material.uniforms.uCop.value=lastraCima.material.uniforms.uCop.value=s.cop;}
    else if(nb){lastraCima.position.y=nb.cima;lastraCima.material.uniforms.uCop.value=1;}
    ordinato=-1;
  }

  /* imposta lo scenario scelto ('no', 'casuale', 'bello', ...): riscrive mondo.meteo (lo leggono radio, piano, piste in uso) */
  function imposta(t){
    scelto=TIPI.includes(t)?t:'no';
    tipo=scelto;
    if(tipo==='casuale'){let x=Math.random()*Object.values(PESI).reduce((a,b)=>a+b,0);for(const k in PESI){x-=PESI[k];if(x<=0){tipo=k;break;}}}
    attivo=tipo!=='no';
    for(const k of Object.keys(met))delete met[k];
    Object.assign(met,mappa);
    if(attivo){const r=(a,b)=>a+Math.random()*(b-a);Object.assign(met,scenario(tipo,r,REF));}
    else Object.assign(met,{veer:0,aumento:0,turbolenza:0,termiche:0,strato:null,nebbia:null,pioggia:0,neve:false,temporali:0,aderenza:1,spessore:250,
      visibilita:met.visibilita||8.5,temperatura:15,rugiada:8,qnh:met.qnh||1016});
    met.attivo=attivo;met.tipo=tipo;
    atm.dT=attivo?met.temperatura-(15-0.0065*REF):0;atm.aderenza=met.aderenza;
    costruisci();
    // la telecamera deve vedere fin dove arriva la foschia più larga (sopra il coperto il cielo è limpido)
    camera.far=Math.max(15000,visMassima()*1.15);camera.updateProjectionMatrix();
    tempo=0;
  }
  const visMassima=()=>met.visibilita*1000*(met.strato||met.nebbia?Math.max(1,40/met.visibilita):1);
  // all'inizio del volo nessun temporale proprio sopra il punto di partenza
  function inizio(p){
    if(!celle.length) return;
    for(const c of celle){const w=avvolgi(c,p);const d=Math.hypot(w.x-p.x,w.z-p.z);
      if(d<9000){const k=(9000-d)/Math.max(1,d);c.x+=(w.x-p.x)*k||9000;c.z+=(w.z-p.z)*k;}}
    if(bCb)bCb.g.dispose();bCb=geoBatuffoli(celle);meshCb.geometry=bCb.g;ordinato=-1;
  }

  /* ---------- posizioni (con la deriva del vento e il riquadro che si ripete) ---------- */
  let tempo=0;const der={x:0,z:0},wv={x:0,z:0};
  const avvolgi=(c,cam)=>{const H=c.H,w=x=>((x+H)%(2*H)+2*H)%(2*H)-H;
    return {x:cam.x+w(c.x+der.x-cam.x),z:cam.z+w(c.z+der.z-cam.z)};};

  /* ---------- luci e colori: base da js/notte.js, poi il meteo li modifica a ogni fotogramma ---------- */
  const B={zen:new THREE.Color(),orz:new THREE.Color(),emi:0.72,sole:0.78,nuv:new THREE.Color(1,1,1),nuvE:new THREE.Color(0.25,0.28,0.31),ora:'giorno'};
  const col=new THREE.Color(),col2=new THREE.Color(),grigio=new THREE.Color();
  function ora(k,c){
    B.ora=k;B.zen.setHex(c.zenit);B.orz.setHex(c.orizz);B.emi=c.emi;B.sole=c.soleI;B.nuv.setHex(c.nuvola);B.nuvE.setHex(c.nuvolaE);
  }
  const lum=c=>0.3*c.r+0.59*c.g+0.11*c.b;

  /* ---------- quanto si è "dentro" una nuvola, e il temporale più vicino ---------- */
  function dentroCumuli(p){
    let k=0;
    for(const c of cumuli){
      if(p.y<c.y-80||p.y>c.y+c.alta+c.R*0.6) continue;
      const w=avvolgi(c,p),dx=p.x-w.x,dz=p.z-w.z;if(Math.abs(dx)>c.R||Math.abs(dz)>c.R) continue;
      const d=Math.hypot(dx/(c.R*0.8),dz/(c.R*0.7),(p.y-(c.y+c.alta*0.5))/(c.alta*0.5+c.R*0.3));
      k=Math.max(k,1-smooth(0.7,1.05,d));
    }
    return k;
  }
  function cellaVicina(p){
    let best=null,bd=Infinity;
    for(const c of celle){const w=avvolgi(c,p),d=Math.hypot(p.x-w.x,p.z-w.z);if(d<bd){bd=d;best={c,x:w.x,z:w.z,d};}}
    return best;
  }
  function dentroStrato(y){
    const s=met.strato;if(s) return s.cop*smooth(s.base-25,s.base+25,y)*(1-smooth(s.cima-25,s.cima+25,y));
    return 0;
  }
  const inNebbia=y=>met.nebbia?1-smooth(met.nebbia.cima-35,met.nebbia.cima+5,y):0;

  let ordinato=-1,nf=0;const camPrima=new THREE.Vector3(),velCam=new THREE.Vector3();let primo=true;
  let pioggiaK=0,scuroK=0,dentroK=0;
  function aggiorna(st,cam,dt,inCabina){
    nf++;
    if(dt>0){tempo+=dt;der.x+=wv.x*dt;der.z+=wv.z*dt;}
    if(!primo&&dt>0)velCam.copy(cam).sub(camPrima).multiplyScalar(1/dt);else velCam.set(0,0,0);
    camPrima.copy(cam);primo=false;
    const tReale=performance.now()/1000;
    // nuvole: deriva, ordine di disegno ogni 20 fotogrammi (o quando ci si sposta molto)
    for(const m of [matCu,matCb]){m.uniforms.uCam.value.copy(cam);m.uniforms.uDeriva.value.set(der.x,der.z);}
    if(nf-ordinato>=20||ordinato<0){ordinato=nf;if(bCu)ordina(bCu,cam,der.x,der.z);if(bCb)ordina(bCb,cam,der.x,der.z);}
    lastraBase.position.x=lastraCima.position.x=cam.x;lastraBase.position.z=lastraCima.position.z=cam.z;
    for(const m of [lastraBase,lastraCima])m.material.uniforms.uDeriva.value.set(der.x,der.z);
    // temporali: colonne di pioggia sotto le celle
    const cv=cellaVicina(cam);
    celle.forEach((c,i)=>{const w=avvolgi(c,cam);colonne[i].position.set(w.x,0,w.z);});
    matColonna.uniforms.uT.value=tReale;

    // quanto si è dentro le nubi, sotto il coperto, sotto la pioggia
    const s=met.strato,nb=met.nebbia;
    const inStrato=dentroStrato(cam.y),inFog=inNebbia(cam.y),inCu=dentroCumuli(cam);
    let inCb=0,sottoCb=0;
    if(cv){const c=cv.c,r=cv.d/c.R;
      if(cam.y>c.y)inCb=(1-smooth(0.55,0.85,r))*(cam.y<c.y+c.alta?1:0);
      sottoCb=1-smooth(0.6,1.1,r);}
    const dentro=Math.max(inStrato,inCu,inCb);
    dentroK=dentro;
    const sotto=s&&cam.y<s.base?s.cop:0;
    scuroK=clamp(sotto*(met.pioggia>0.3?0.68:0.55)+inFog*0.25+sottoCb*0.45*(cam.y<(cv?cv.c.y:0)?1:0.3)+inStrato*0.3,0,0.85);
    const sottoNubi=cam.y<(s?s.cima:met.baseNuvole+100);
    pioggiaK=attivo?Math.max(sottoNubi?met.pioggia:0,cv&&cam.y<cv.c.y+200?0.95*sottoCb:0):0;

    // fulmini nei temporali: lampo, saetta, tuono in ritardo (340 m/s)
    if(celle.length&&dt>=0){
      prossimoLampo-=Math.max(dt,1/60);
      if(prossimoLampo<=0){
        prossimoLampo=3+Math.random()*12;
        const c=celle[Math.random()*celle.length|0],w=avvolgi(c,cam),d=Math.hypot(w.x-cam.x,w.z-cam.z);
        if(d<45000){
          lampo=clamp(1.3-d/30000,0.15,1.1);
          const pts=[];let x=w.x+(Math.random()-0.5)*c.R,z=w.z+(Math.random()-0.5)*c.R;
          const yb=c.y,yt=Math.max(0,T.naturale(x,z));
          for(let k=0;k<=14;k++){const y=yb-(yb-yt)*k/14;pts.push(new THREE.Vector3(x,y,z));x+=(Math.random()-0.5)*160;z+=(Math.random()-0.5)*160;}
          fulmine.geometry.dispose();fulmine.geometry=new THREE.BufferGeometry().setFromPoints(pts);
          fulmine.visible=true;fulmine.userData.t=0;
          tuoni.push({t:tReale+d/340,f:clamp(1-d/25000,0.08,1)});
        }
      }
    }
    if(fulmine.visible){fulmine.userData.t+=Math.max(dt,1/60);const t=fulmine.userData.t;matFulmine.opacity=t<0.07||(t>0.12&&t<0.18)?1:0;if(t>0.22)fulmine.visible=false;}
    lampo=Math.max(0,lampo-Math.max(dt,1/60)*5);
    for(let i=tuoni.length-1;i>=0;i--)if(tReale>=tuoni[i].t){if(SIM.audioMeteo)SIM.audioMeteo.tuono(tuoni[i].f);tuoni.splice(i,1);}

    /* colori del cielo e della nebbia, luci */
    grigio.copy(B.orz);const l=lum(B.orz);grigio.setRGB(l*0.82,l*0.84,l*0.88);
    col.copy(B.orz).lerp(grigio,scuroK/0.85);col2.copy(B.zen).lerp(grigio,Math.min(1,scuroK*1.25));
    // dentro le nubi e nella nebbia: grigio chiaro, illuminato come le nuvole
    const nub=new THREE.Color().copy(B.nuv).multiplyScalar(0.82*(1-scuroK*0.5));
    const kd=Math.max(dentro,inFog);
    col.lerp(nub,kd);col2.lerp(nub,kd);
    if(lampo>0){col.r+=lampo*0.5;col.g+=lampo*0.52;col.b+=lampo*0.6;col2.r+=lampo*0.4;col2.g+=lampo*0.42;col2.b+=lampo*0.5;}
    Lu.cielo.material.uniforms.alto.value.copy(col2);Lu.cielo.material.uniforms.basso.value.copy(col);
    scene.background.copy(col);scene.fog.color.copy(col);
    Lu.emi.intensity=B.emi*(1-0.4*scuroK)+lampo*1.2;
    Lu.sole.intensity=B.sole*(1-scuroK*1.05>0?1-scuroK*1.05:0.05);
    // nuvole: illuminate dal sole, più scure sotto il coperto
    const lu=new THREE.Color().copy(B.nuv).multiplyScalar(1-scuroK*0.45);
    const om=new THREE.Color().copy(B.nuv).multiplyScalar(0.58*(1-scuroK*0.4)).add(B.nuvE);
    for(const m of [matCu,matCb]){m.uniforms.uLuce.value.copy(lu);m.uniforms.uOmbra.value.copy(om);m.uniforms.uLampo.value=lampo;}
    lastraCima.material.uniforms.uCol.value.copy(B.nuv).multiplyScalar(0.98);
    lastraBase.material.uniforms.uCol.value.copy(grigio).multiplyScalar(0.92);
    matColonna.uniforms.uCol.value.copy(grigio).multiplyScalar(0.72);

    /* nebbia (foschia): visibilità dello scenario, ridotta in pioggia, nebbia e nuvole */
    let vis=met.visibilita*1000;
    if(s&&cam.y>s.cima)vis=Math.max(vis,40000);        // sopra il coperto: aria limpida
    if(nb&&cam.y>nb.cima)vis=met.visibilita*1000;
    if(cv&&sottoCb>0)vis=mix(vis,1800,sottoCb*(cam.y<cv.c.y?1:0.5));
    let vicino=vis>20000?vis*0.3:Math.min(3000,vis*0.35),lontano=vis;
    if(inFog>0){const v=met.nebbia.vis*1.3;vicino=mix(vicino,0,inFog);lontano=Math.exp(mix(Math.log(lontano),Math.log(v),inFog));}
    if(dentro>0){vicino=mix(vicino,0,dentro);lontano=Math.exp(mix(Math.log(lontano),Math.log(90),dentro));}
    scene.fog.near=Math.min(vicino,lontano*0.35);scene.fog.far=lontano;   // al bordo delle nubi near resta sotto far

    /* pioggia e neve */
    const prec=pioggiaK>0.02&&!(dentro>0.9);
    const n=met.neve;
    pioggia.visible=prec&&!n;neve.visible=prec&&n;
    if(prec){
      const u=n?uniN:uniP;
      u.uCam.value.copy(cam);u.uT.value=tReale;
      const wx=wv.x,wz=wv.z;
      if(n){u.uV.value.set(wx*0.8,-1.4,wz*0.8);const ln=0.2+0.8*lum(B.nuv);uniN.uCol.value.setRGB(0.95*ln,0.96*ln,ln);   // di notte fiocchi scuri
        geoN.setDrawRange(0,Math.round(NP*0.8*pioggiaK));}
      else{u.uV.value.set(wx,-9,wz);uniP.uRel.value.set(wx-velCam.x,-9-velCam.y,wz-velCam.z).multiplyScalar(0.045);
        geoP.setDrawRange(0,Math.round(NP*pioggiaK)*2);uniP.uA.value=0.22+0.16*pioggiaK;
        uniP.uCol.value.copy(B.nuv).multiplyScalar(0.8);}
    }
    if(SIM.audioMeteo)SIM.audioMeteo.pioggia(prec?pioggiaK*(n?0.15:1)*(inCabina?1:0.6):0);
  }

  /* ---------- vento sull'aereo (m/s, vettore "verso dove va l'aria") ---------- */
  let cacheRil={t:-1,gx:0,gz:0,rug:0};
  function vento(t,st,out){
    const agl=Math.max(0,st.agl),v0=met.ventoNodi/KT;
    if(!attivo){ // come prima del meteo: vento della mappa con raffiche leggere
      const raff=met.raffiche/KT*(T.vnoise(t*0.25,3.7)*2-1);
      const quota=clamp(0.55+agl/600,0.55,1);
      const k=v0>0?Math.max(0,(v0+raff)/v0)*quota:0;
      out.set(-Math.sin(met.ventoDa*D2R)*v0*k,0,Math.cos(met.ventoDa*D2R)*v0*k);
      out.y=met.raffiche/KT*0.3*(T.vnoise(t*0.6,9.1)*2-1)*quota;
      wv.x=out.x;wv.z=out.z;
      return out;
    }
    const p=st.pos,f=clamp(agl/1500,0,1);
    // in quota il vento gira a destra (attrito col suolo che diminuisce) e rinforza
    const da=(met.ventoDa+met.veer*f)*D2R;
    const raff=met.raffiche/KT*((T.vnoise(t*0.3,3.7)*2-1+0.45)/1.45)*(1-0.5*f);
    let v=v0*clamp(0.55+agl/600,0.55,1)*(1+met.aumento*f)+Math.max(0,p.y-1500)*0.002;
    v=Math.max(0,v+raff);
    out.set(-Math.sin(da)*v,0,Math.cos(da)*v);
    // i cumuli si muovono col vento della loro quota
    const vq=v0*(1+met.aumento)+Math.max(0,met.baseNuvole-1500)*0.002,dq=(met.ventoDa+met.veer)*D2R;
    wv.x=-Math.sin(dq)*vq;wv.z=Math.cos(dq)*vq;
    // rilievo (ogni 0,3 s): pendenza e "rugosità" attorno all'aereo
    if(Math.abs(t-cacheRil.t)>0.3){
      const N=T.naturale,e=300,h0=N(p.x,p.z);
      cacheRil.gx=(N(p.x+e,p.z)-N(p.x-e,p.z))/(2*e);cacheRil.gz=(N(p.x,p.z+e)-N(p.x,p.z-e))/(2*e);
      const hs=[h0,N(p.x+1500,p.z),N(p.x-1500,p.z),N(p.x,p.z+1500),N(p.x,p.z-1500)];
      cacheRil.rug=clamp((Math.max(...hs)-Math.min(...hs))/700,0,1);cacheRil.t=t;
    }
    // corrente di pendio: l'aria che sale lungo il versante sopravvento, scende sottovento
    const oro=clamp((out.x*cacheRil.gx+out.z*cacheRil.gz)*0.8*Math.exp(-agl/650),-6,6);
    let w=oro;
    // termiche sotto i cumuli (solo di giorno): si sale sotto la nuvola, si scende un po' attorno
    if(met.termiche>0&&B.ora==='giorno'&&agl>20){
      let su=-0.35*met.termiche;
      for(const c of cumuli){
        if(p.y>c.y+50) continue;
        const ww=avvolgi(c,p),d=Math.hypot(p.x-ww.x,p.z-ww.z);if(d>c.R*1.6) continue;
        su=Math.max(su,met.termiche*(2.8*(1-smooth(0,c.R*0.75,d))-0.6*smooth(c.R*0.7,c.R*1.4,d)));
      }
      w+=su*smooth(20,250,agl)*(1-smooth(met.baseNuvole-350,met.baseNuvole,p.y));
    }
    // turbolenza: di base, col vento sui rilievi, dentro le nubi e vicino ai temporali
    let A=met.turbolenza*(0.5+0.5*clamp(v0/12,0,1.5))+v*0.14*cacheRil.rug*Math.exp(-agl/1100);
    A+=dentroCumuli(p)*0.9;
    const cv=cellaVicina(p);
    if(cv){const c=cv.c,r=cv.d/c.R;
      const vicino=1-smooth(0.5,1.4,r);A+=vicino*3.5;
      if(p.y<c.y){ // sotto il temporale: discendenza al centro, raffiche che escono verso fuori vicino al suolo
        w-=6*(1-smooth(0,0.8,r));
        const fuori=8*(1-smooth(0.3,1.5,r))*(1-smooth(100,700,agl)),dx=(p.x-cv.x)/Math.max(1,cv.d),dz=(p.z-cv.z)/Math.max(1,cv.d);
        out.x+=dx*fuori;out.z+=dz*fuori;
      }else if(p.y<c.y+c.alta)w+=9*(1-smooth(0.2,0.8,r));   // dentro la torre: ascendenza violenta
    }
    const sx=p.x/45+t*0.35,sz=p.z/45-t*0.27,fx=p.x/13,fz=p.z/13;
    const tb=i=>(T.vnoise(sx+i*17.3,sz-i*9.7)*2-1)+0.5*(T.vnoise(fx+i*5.1+t,fz-i*3.3)*2-1);
    const quotaT=clamp(0.3+agl/120,0.3,1);
    out.x+=tb(0)*A*quotaT;out.z+=tb(1)*A*quotaT;
    out.y=w+tb(2)*A*0.75*quotaT;
    return out;
  }

  /* ---------- METAR e descrizioni ---------- */
  const pad=(n,k)=>String(Math.round(n)).padStart(k,'0');
  const tm=t=>(t<0?'M':'')+pad(Math.abs(t),2);
  // il tempo visto da un aeroporto: vento, visibilità (m), fenomeni, nubi (dal basso), temperatura
  function osserva(ap){
    const q=ap?ap.quota:REF,o={ventoDa:met.ventoDa,vento:met.ventoNodi,raffica:met.raffiche>=10?met.ventoNodi+met.raffiche:0,
      vis:met.visibilita*1000,fen:[],nubi:[],vv:0,cb:false,ts:false};
    o.temp=Math.round(met.temperatura-0.0065*(q-REF));o.rug=Math.min(o.temp,Math.round(met.rugiada-0.002*(q-REF)));
    const s=met.strato,nb=met.nebbia;
    if(nb&&q<nb.cima-15){o.vis=nb.vis;o.fen.push('FG');o.vv=Math.max(100,Math.round((nb.cima-q)*FT/100)*100);}
    if(s){
      if(q>=s.cima){}                                   // campo sopra il coperto: sereno
      else if(q>=s.base-20){o.vis=Math.min(o.vis,250);o.fen.push('FG');o.vv=100;}   // campo dentro le nubi
      else o.nubi.push({c:s.cop>=0.97?'OVC':s.cop>=0.7?'BKN':'SCT',ft:(s.base-q)*FT});
    }
    if(met.nuvole>0&&met.baseNuvole>q)o.nubi.push({c:met.nuvole<20?'FEW':met.nuvole<45?'SCT':met.nuvole<75?'BKN':'OVC',ft:(met.baseNuvole-q)*FT});
    if(ap&&celle.length){
      let dm=Infinity;for(const c of celle){const w=avvolgi(c,ap);dm=Math.min(dm,Math.hypot(w.x-ap.x,w.z-ap.z));}
      if(dm<16000){o.cb=true;if(!o.nubi.length)o.nubi.push({c:'FEW',ft:(met.baseNuvole-q)*FT});o.nubi[o.nubi.length-1].cb=true;}
      if(dm<4000){o.ts=true;o.vis=Math.min(o.vis,3000);}else if(dm<9000)o.fen.push('VCTS');
    }
    if(met.pioggia>0&&!o.fen.includes('FG')&&!(s&&q>=s.cima)||o.ts){
      const p=o.ts?0.9:met.pioggia;
      o.fen.unshift(o.ts?'TSRA':met.neve?(p<0.4?'-SN':'SN'):p<0.2?'-DZ':p<0.4?'-RA':p<0.8?'RA':'+RA');
    }else if(o.vis<5000&&!o.fen.length)o.fen.push('BR');
    for(const n of o.nubi)n.ft=Math.max(100,Math.round(n.ft/100)*100);
    o.vis=o.vis>=10000?9999:Math.round(o.vis/100)*100;
    return o;
  }
  function metar(ap){
    const o=osserva(ap),d=new Date(),ora=pad(d.getUTCDate(),2)+pad(d.getUTCHours(),2)+(d.getUTCMinutes()<30?'20':'50')+'Z';
    const v=o.vento<1?'00000KT':pad(o.ventoDa||360,3)+pad(o.vento,2)+(o.raffica?'G'+pad(o.raffica,2):'')+'KT';
    const cavok=o.vis>=9999&&!o.fen.length&&!o.cb&&o.nubi.every(n=>n.ft>=5000);
    const nubi=o.vv?'VV'+pad(o.vv/100,3):o.nubi.length?o.nubi.map(n=>n.c+pad(n.ft/100,3)+(n.cb?'CB':'')).join(' '):'NSC';
    return [(ap&&ap.codice)||'',ora,v,cavok?'CAVOK':[pad(o.vis,4),...o.fen,nubi].join(' '),tm(o.temp)+'/'+tm(o.rug),'Q'+met.qnh].join(' ').replace(/\s+/g,' ').trim();
  }
  const FEN={FG:['nebbia','fog'],BR:['foschia','mist'],VCTS:['temporali nelle vicinanze','thunderstorm in the vicinity'],TSRA:['temporale con pioggia','thunderstorm with rain'],
    '-DZ':['pioviggine','light drizzle'],'-RA':['pioggia debole','light rain'],RA:['pioggia','rain'],'+RA':['pioggia forte','heavy rain'],'-SN':['neve debole','light snow'],SN:['neve','snow']};
  const NUBI={FEW:['poche nubi','few'],SCT:['nubi sparse','scattered'],BKN:['molto nuvoloso','broken'],OVC:['coperto','overcast']};
  // frase per la radio: {d: scritto, s: pronunciato, it: italiano}
  function bollettino(ap,cifre){
    const o=osserva(ap),q=met.qnh,num=n=>({d:String(n),s:cifre(String(Math.abs(n)))});
    const pz=[],it=[];
    if(o.vento<1){pz.push({d:'wind calm',s:'wind calm'});it.push('vento calmo');}
    else{pz.push({d:`wind ${pad(o.ventoDa||360,3)} degrees ${o.vento} knots`+(o.raffica?` gusting ${o.raffica}`:''),s:`wind ${cifre(pad(o.ventoDa||360,3))} degrees ${cifre(String(o.vento))} knots`+(o.raffica?` gusting ${cifre(String(o.raffica))}`:'')});
      it.push(`vento ${pad(o.ventoDa||360,3)}° ${o.vento} nodi`+(o.raffica?` raffiche ${o.raffica}`:''));}
    const vk=o.vis>=9999?null:o.vis>=5000?Math.round(o.vis/1000):null;
    if(o.vis>=9999){pz.push({d:'visibility 10 kilometres or more',s:'visibility one zero kilometres or more'});it.push('visibilità 10 km o più');}
    else if(vk){pz.push({d:`visibility ${vk} kilometres`,s:`visibility ${cifre(String(vk))} kilometres`});it.push(`visibilità ${vk} km`);}
    else{pz.push({d:`visibility ${o.vis} metres`,s:`visibility ${cifre(String(o.vis))} metres`});it.push(`visibilità ${o.vis} m`);}
    for(const f of o.fen){pz.push({d:FEN[f][1],s:FEN[f][1]});it.push(FEN[f][0]);}
    if(o.vv){pz.push({d:`vertical visibility ${o.vv} feet`,s:`vertical visibility ${o.vv} feet`});it.push(`visibilità verticale ${o.vv} ft`);}
    else if(!o.nubi.length){pz.push({d:'no significant cloud',s:'no significant cloud'});it.push('nessuna nube significativa');}
    for(const n of o.nubi){const ft=n.ft;pz.push({d:`${NUBI[n.c][1]} ${ft} feet`+(n.cb?' cumulonimbus':''),s:`${NUBI[n.c][1]} ${ft} feet`+(n.cb?' cumulonimbus':'')});
      it.push(`${NUBI[n.c][0]} a ${ft} ft`+(n.cb?' con cumulonembi':''));}
    pz.push({d:`temperature ${o.temp<0?'minus ':''}${Math.abs(o.temp)}, dew point ${o.rug<0?'minus ':''}${Math.abs(o.rug)}`,
      s:`temperature ${o.temp<0?'minus ':''}${num(o.temp).s}, dew point ${o.rug<0?'minus ':''}${num(o.rug).s}`});
    it.push(`temperatura ${o.temp}°, punto di rugiada ${o.rug}°`);
    pz.push({d:`QNH ${q}`,s:`Q N H ${cifre(String(q))}`});it.push(`QNH ${q}`);
    return {d:pz.map(p=>p.d).join(', '),s:pz.map(p=>p.s).join(', '),it:it.join(', ')};
  }
  // VFR possibile all'aeroporto? (almeno 5 km e base delle nubi da 1500 ft in su, niente temporale sul campo)
  function vmc(ap){
    if(!attivo) return true;
    const o=osserva(ap);
    const tetto=o.vv?0:Math.min(Infinity,...o.nubi.filter(n=>n.c==='BKN'||n.c==='OVC').map(n=>n.ft));
    return o.vis>=5000&&tetto>=1500&&!o.ts;
  }
  // testo per il briefing
  function descrizione(ap){
    if(!attivo) return '';
    const o=osserva(ap),n=NOMI[tipo];
    let t=L(`<b>Meteo: ${n[0]}</b>`,`<b>Weather: ${n[1]}</b>`)+(scelto==='casuale'?L(' (a caso)',' (random)'):'')+'. ';
    t+=`<code class="metar">METAR ${metar(ap)}</code> `;
    const b=bollettino(ap,s=>s);
    t+=L(b.it.charAt(0).toUpperCase()+b.it.slice(1)+'. ','');
    if(SIM.lingua==='en')t+=b.d.charAt(0).toUpperCase()+b.d.slice(1)+'. ';
    if(!vmc(ap))t+=L('<b class="rosso">Sotto i minimi VFR</b> (meno di 5 km o nubi sotto 1500 ft): si vola guardando gli strumenti, l\'ILS aiuta a ritrovare la pista. ',
      '<b class="rosso">Below VFR minima</b> (under 5 km or cloud below 1500 ft): fly by the instruments, the ILS helps you find the runway. ');
    if(met.temporali)t+=L('Stai lontano dai cumulonembi: sotto c\'è pioggia forte, discendenze e raffiche. ','Keep away from the cumulonimbus: heavy rain, downdrafts and gusts underneath. ');
    if(met.termiche&&B.ora==='giorno')t+=L('Sotto i cumuli si trovano termiche (si sale). ','Under the cumulus you find thermals (lift). ');
    if(met.aderenza<0.8)t+=L('Pista '+(met.neve?'innevata':'bagnata')+': i freni tengono meno. ','Runway '+(met.neve?'covered in snow':'wet')+': the brakes grip less. ');
    if(met.temperatura>=24)t+=L('Fa caldo: l\'aria è più leggera, il decollo è più lungo e si sale più piano. ','It is hot: the air is thinner, the take-off run is longer and the climb slower. ');
    return t;
  }

  return {imposta,vento,aggiorna,ora,metar,bollettino,descrizione,vmc,inizio,osserva,
    get tipo(){return tipo;},get scelto(){return scelto;},get attivo(){return attivo;},get coperto(){return !!(met.strato||met.nebbia)&&attivo;},
    get dentro(){return dentroK;},get pioggia(){return pioggiaK;},TIPI,NOMI,met};
};
})();
