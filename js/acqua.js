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
   ACQUA: laghi, mare e fiumi con lo stesso aspetto, tutto nello shader
   (nessun dato, nessuna immagine in più).
   - Onde: sei treni di onde che corrono col vento (lunghezze 0,7–31 m,
     velocità dell'acqua profonda) + due strati di rumore che derivano;
     calma piatta = quasi uno specchio, vento forte = acqua increspata.
   - Riflesso del cielo con la formula di Fresnel (Schlick): guardata
     dall'alto l'acqua è scura, di taglio prende il colore del cielo.
     Niente riflessi veri (raddoppierebbero il disegno della scena).
   - Luccichio del sole: lo fa il materiale standard di three.js con la
     normale delle onde; le onde troppo piccole per lo schermo sfumano e
     diventano ruvidità (così da lontano il riflesso si allarga e non
     sfarfalla).
   - Pioggia: increspature fitte e acqua più opaca.
   Laghi e mare usano SIM.acqua.materiale(); il terreno (fiumi e canali
   dipinti da js/paesaggio.js, mare del terreno lontano) usa
   SIM.acqua.veste(mat) e dice nello shader quanto c'è d'acqua (acquaK).
   I fiumi sono dipinti con il colore chiave CHIAVE: lo shader lo
   riconosce e lo sostituisce con l'acqua vera.
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// colore chiave dei fiumi sulla tela del paesaggio (blu saturo che il resto della tela non usa)
const CHIAVE=[16,80,240];
const KB=CHIAVE[2]/255,KG=CHIAVE[1]/255;

// valori condivisi da tutti i materiali d'acqua
const unif={
  uTempoA:{value:0},
  uOndeA:{value:new THREE.Vector4(1,0,0.2,0)},   // xy = verso cui va il vento, z = forza 0..1, w = pioggia 0..1
  uOrigA:{value:new THREE.Vector2(0,0)},         // origine locale delle onde (coordinate piccole: sin() preciso)
  uAltoA:{value:new THREE.Color(0x3d7cc4)},      // colori del cielo: mondo.js li sostituisce con quelli del cielo vero
  uBassoA:{value:new THREE.Color(0xc9dceb)},
};

const GLSL=`
uniform float uTempoA;
uniform vec4 uOndeA;
uniform vec2 uOrigA;
uniform vec3 uAltoA,uBassoA;
varying vec3 vAcquaP;
float acquaH(vec2 c){return fract(sin(dot(c,vec2(127.1,311.7)))*43758.5453);}
// rumore a valori con la sua pendenza (x valore, yz gradiente)
vec3 acquaRum(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f),du=6.0*f*(1.0-f);
  float a=acquaH(i),b=acquaH(i+vec2(1.0,0.0)),c=acquaH(i+vec2(0.0,1.0)),d=acquaH(i+vec2(1.0,1.0));
  return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y,du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx));
}
// un treno d'onde: lunghezza L (m), pendenza s, angolo dal vento a; somma la pendenza in g
// e in perso quella che lo schermo non riesce a mostrare (diventa ruvidità)
void acquaOnda(vec2 p,float L,float s,float a,float mpp,inout vec2 g,inout float perso){
  float ca=cos(a),sa=sin(a);
  vec2 d=vec2(uOndeA.x*ca-uOndeA.y*sa,uOndeA.x*sa+uOndeA.y*ca);
  float k=6.2832/L,w=sqrt(9.81*k);
  float vis=1.0-smoothstep(0.25,0.9,mpp*2.0/L);
  g+=d*(s*vis*cos(dot(d,p)*k-w*uTempoA));
  perso+=s*s*(1.0-vis)*0.5;
}
// normale dell'acqua (spazio mondo) e ruvidità
vec4 acquaNormale(vec2 p,float mpp){
  float f=uOndeA.z,r=uOndeA.w;
  vec2 der=uOndeA.xy*uTempoA*(0.4+1.6*f);
  // "zampate" del vento: chiazze di 150-250 m più increspate o più lisce che corrono sull'acqua
  float zam=0.45+1.1*(acquaRum((p-der*4.0)/230.0).x*0.7+acquaRum((p-der*5.0)/90.0+31.0).x*0.3);
  float S=(0.012+0.11*f)*zam;             // pendenza delle onde: calma piatta ... vento forte
  vec2 g=vec2(0.0);float perso=0.0;
  acquaOnda(p,31.0,S*0.22, 0.00,mpp,g,perso);
  acquaOnda(p,13.0,S*0.22, 0.45,mpp,g,perso);
  acquaOnda(p,6.1, S*0.22,-0.55,mpp,g,perso);
  acquaOnda(p,2.9, S*0.22, 0.85,mpp,g,perso);
  acquaOnda(p,1.3, S*0.20,-0.30,mpp,g,perso);
  acquaOnda(p,0.7, S*0.18, 1.10,mpp,g,perso);
  // rumore che deriva col vento: rompe la regolarità delle onde
  vec3 n1=acquaRum((p-der)/4.0),n2=acquaRum((p-der*1.7)/1.3+17.0),n0=acquaRum((p-der*0.6)/14.0+5.0);
  g+=n0.yz/14.0*S*1.6*(1.0-smoothstep(0.5,2.0,mpp/14.0));
  float v1=1.0-smoothstep(0.5,2.0,mpp/4.0),v2=1.0-smoothstep(0.5,2.0,mpp/1.3);
  g+=n1.yz/4.0*S*1.2*v1+n2.yz/1.3*S*0.5*v2;
  perso+=S*S*(0.3*(1.0-v1)+0.06*(1.0-v2));
  // pioggia: increspature fitte (solo da vicino) e superficie opaca
  if(r>0.0){
    vec3 n3=acquaRum(p/0.35+uTempoA*vec2(3.1,-2.3));
    float v3=1.0-smoothstep(0.3,1.0,mpp/0.35);
    g+=n3.yz/0.35*0.05*r*v3;perso+=0.002*r*(1.0-v3)+0.004*r;
  }
  // ruvidità: increspature sotto il pixel (più col vento) + onde sfumate; three.js la usa al quadrato
  float alfa=0.008+0.09*f*zam+sqrt(perso)*2.5;
  return vec4(normalize(vec3(-g.x,1.0,-g.y)),sqrt(clamp(alfa,0.008,0.35)));
}
// Fresnel (Schlick, acqua n=1,33) e colore del cielo riflesso
float acquaFresnel(vec3 n,vec3 v){return 0.02+0.98*pow(1.0-clamp(dot(n,v),0.0,1.0),5.0);}
vec3 acquaCielo(vec3 n,vec3 v){
  vec3 r=reflect(-v,n);r.y=abs(r.y);
  return mix(uBassoA,uAltoA,pow(clamp(r.y,0.0,1.0),0.5));
}
`;

// aggiunge l'acqua a un materiale standard; opz.tutto = tutta la superficie è acqua (laghi, mare),
// opz.daColore = acqua dove il colore dei vertici è CHIAVE (mare del terreno lontano);
// altrimenti lo shader del materiale deve scrivere acquaK (0..1) dopo color_fragment (js/paesaggio.js)
function veste(mat,opz){
  opz=opz||{};
  const prima=mat.onBeforeCompile;
  mat.onBeforeCompile=(sh,r)=>{
    if(prima)prima.call(mat,sh,r);
    Object.assign(sh.uniforms,unif);
    sh.vertexShader='varying vec3 vAcquaP;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvAcquaP=(modelMatrix*vec4(transformed,1.0)).xyz;');
    // metri per pixel calcolati fuori dagli if (le derivate non valgono dentro un ramo)
    let fs=GLSL+sh.fragmentShader.replace('void main() {','void main() {\nfloat acquaK='+(opz.tutto?'1.0':'0.0')+';\n'+
      'vec4 acquaN=vec4(0.0,1.0,0.0,1.0);\nvec2 acquaXZ=vAcquaP.xz-uOrigA;\nfloat acquaMpp=max(length(fwidth(acquaXZ)),0.002);');
    if(opz.daColore)fs=fs.replace('#include <color_fragment>','#include <color_fragment>\n'+
      `acquaK=clamp((vColor.b-vColor.g-0.03)/${(KB-KG-0.03).toFixed(4)},0.0,1.0);\n`+
      `diffuseColor.rgb=mix(diffuseColor.rgb,vec3(${opz.colore||'0.110,0.275,0.376'}),acquaK);`);
    fs=fs.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+
      'if(acquaK>0.0){\n'+
      '  acquaN=acquaNormale(acquaXZ,acquaMpp);\n'+
      '  normal=normalize(mix(normal,(viewMatrix*vec4(acquaN.xyz,0.0)).xyz,acquaK));\n'+
      '  roughnessFactor=mix(roughnessFactor,acquaN.w,acquaK);\n'+
      '}');
    fs=fs.replace('#include <tonemapping_fragment>',
      'if(acquaK>0.0){\n'+
      '  vec3 acquaV=normalize(cameraPosition-vAcquaP);\n'+
      '  float acquaF=acquaFresnel(acquaN.xyz,acquaV)*(1.0-uOndeA.w*0.3);\n'+
      '  gl_FragColor.rgb=mix(gl_FragColor.rgb,acquaCielo(acquaN.xyz,acquaV),acquaF*acquaK);\n'+
      '}\n#include <tonemapping_fragment>');
    sh.fragmentShader=fs;
  };
}

SIM.acqua={
  CHIAVE:'#'+CHIAVE.map(v=>v.toString(16).padStart(2,'0')).join(''),
  CHIAVE_RGB:CHIAVE.map(v=>v/255),
  unif,
  veste,
  // materiale per laghi e mare (colore = acqua vista dall'alto, senza riflessi)
  materiale(colore,chiave){
    const m=new THREE.MeshStandardMaterial({color:colore,roughness:0.05,metalness:0});
    veste(m,{tutto:true});
    m.customProgramCacheKey=()=>'acqua-'+(chiave||'');
    return m;
  },
  // i colori del cielo diventano gli stessi oggetti del cielo (js/notte.js e js/meteo.js li cambiano sul posto)
  cielo(alto,basso){unif.uAltoA.value=alto;unif.uBassoA.value=basso;},
  // ogni fotogramma: tempo, vento al suolo (nodi, gradi da cui viene), pioggia 0..1, camera
  aggiorna(dt,ventoDa,ventoNodi,pioggia,cam){
    const u=unif;
    u.uTempoA.value=(u.uTempoA.value+dt)%3600;
    // il vento va verso ventoDa+180: (sin, -cos) in x, z
    const a=(ventoDa+180)*Math.PI/180,o=u.uOndeA.value,k=1-Math.exp(-dt/3);   // cambi lenti (raffiche)
    o.x+=(Math.sin(a)-o.x)*k;o.y+=(-Math.cos(a)-o.y)*k;
    const l=Math.hypot(o.x,o.y)||1;o.x/=l;o.y/=l;
    o.z+=(clamp(ventoNodi/25,0,1)-o.z)*k;
    o.w+=(clamp(pioggia,0,1)-o.w)*k;
    // origine a passi di 8 km: le onde saltano solo quando la si sposta (una volta ogni 8 km)
    const P=8192;u.uOrigA.value.set(Math.round(cam.x/P)*P,Math.round(cam.z/P)*P);
  },
};
})();
