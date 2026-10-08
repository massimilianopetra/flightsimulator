/* =====================================================================
   CABINA 3D in stile Cessna 172 con avionica Garmin G1000:
   pannello con due schermi (PFD e MFD) disegnati in tempo reale,
   strumenti di riserva, cloche che si muovono, manetta, miscela,
   palpebra, bussola, montanti e pannelli laterali.
   Coordinate corpo dell'aereo: x = destra, y = su, z = coda (muso a z negativo).
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};

SIM.creaCabina=function(){
  const gr=new THREE.Group();
  const std=(color,rough=.8,metal=0)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
  const M={
    pannello:std(0x3a3e44,.7), nero:std(0x141518,.6), bezel:std(0x23262b,.5,.2), plastica:std(0x0e0f11,.5),
    beige:std(0xc9b694,.95), beigeScuro:std(0x9c8a6a,.95), argento:std(0xb8bcc2,.35,.6),
    rosso:std(0xc0201c,.5), bianco:std(0xe8e8e8,.6), tetto:new THREE.MeshStandardMaterial({color:0xd8d2c4,roughness:.95,emissive:0x4a453c}),
  };
  const box=(w,h,d,mat,x,y,z,par)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);(par||gr).add(m);return m;};
  const cil=(r,l,mat,x,y,z,par,seg=16)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,seg).rotateX(Math.PI/2),mat);m.position.set(x,y,z);(par||gr).add(m);return m;};

  const ZP=-1.12;  // superficie del pannello

  /* ---- pannello strumenti ---- */
  box(1.46,0.52,0.05,M.pannello,0,0.04,ZP-0.025);
  for(const sx of [-1,1])box(0.03,0.62,0.12,M.nero,sx*0.715,-0.01,ZP);   // bordi laterali del pannello
  box(1.46,0.16,0.09,M.nero,0,-0.28,ZP+0.01);                 // pannello basso (interruttori, comandi motore)
  // palpebra (glareshield) con bordo arrotondato
  box(1.56,0.035,0.34,M.nero,0,0.315,ZP-0.15);
  const bordo=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,1.56,16).rotateZ(Math.PI/2),M.nero);
  bordo.position.set(0,0.305,ZP+0.005);gr.add(bordo);
  // bussola magnetica sopra la palpebra
  box(0.05,0.045,0.05,M.plastica,0,0.36,ZP-0.12);
  box(0.036,0.022,0.004,M.bianco,0,0.362,ZP-0.094);
  box(0.015,0.04,0.015,M.plastica,0,0.4,ZP-0.135);

  /* ---- schermi G1000 ---- */
  function schermo(cx,cy,nome){
    // cornice con manopole e tasti
    box(0.43,0.29,0.03,M.bezel,cx,cy,ZP+0.012);
    for(const sx of [-1,1])for(let i=0;i<4;i++){
      cil(0.011,0.02,M.plastica,cx+sx*0.188,cy+0.09-i*0.06,ZP+0.035);
      cil(0.007,0.03,M.plastica,cx+sx*0.188,cy+0.09-i*0.06,ZP+0.04);
    }
    for(let i=0;i<12;i++) box(0.022,0.012,0.008,M.plastica,cx-0.14+i*0.0255,cy-0.127,ZP+0.03);
    // superficie luminosa
    const cv=document.createElement('canvas');cv.width=800;cv.height=480;
    const tex=new THREE.CanvasTexture(cv);tex.anisotropy=4;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(0.33,0.198),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
    m.position.set(cx,cy+0.012,ZP+0.029);gr.add(m);
    return {canvas:cv,tex,sup:{g:cv.getContext('2d'),W:cv.width,H:cv.height},nome};
  }
  const pfd=schermo(-0.25,0.15,'PFD');
  const mfd=schermo(0.25,0.15,'MFD');
  // pannello audio al centro, con tasti
  box(0.06,0.29,0.03,M.bezel,0,0.15,ZP+0.012);
  for(let i=0;i<10;i++)for(const sx of [-1,1])box(0.016,0.01,0.008,M.plastica,sx*0.013,0.27-i*0.024,ZP+0.03);
  box(0.03,0.015,0.009,M.rosso,0,0.03,ZP+0.03);   // tasto rosso "display backup"

  /* ---- strumenti di riserva ---- */
  const cvR=document.createElement('canvas');cvR.width=480;cvR.height=160;
  const texR=new THREE.CanvasTexture(cvR);
  const ris=new THREE.Mesh(new THREE.PlaneGeometry(0.255,0.085),new THREE.MeshBasicMaterial({map:texR,toneMapped:false}));
  ris.position.set(0.0,-0.075,ZP+0.003);gr.add(ris);
  const riserva={canvas:cvR,tex:texR,sup:{g:cvR.getContext('2d'),W:cvR.width,H:cvR.height}};

  /* ---- interruttori e comandi del motore (pannello basso) ---- */
  for(let i=0;i<10;i++){
    box(0.014,0.03,0.012,M.bianco,-0.62+i*0.032,-0.265,ZP+0.065);
    box(0.02,0.006,0.002,M.bianco,-0.62+i*0.032,-0.235,ZP+0.056);
  }
  box(0.035,0.05,0.02,M.rosso,-0.67,-0.03,ZP+0.012);       // interruttore master
  box(0.035,0.05,0.02,M.bianco,-0.62,-0.03,ZP+0.012);
  cil(0.018,0.03,M.argento,-0.6,-0.12,ZP+0.02);            // chiave di avviamento
  // manetta (nera) e miscela (rossa): la manetta scorre con il comando
  const manetta=new THREE.Group();gr.add(manetta);
  cil(0.006,0.12,M.argento,0,0,0.0,manetta);
  cil(0.022,0.03,M.plastica,0,0,0.06,manetta,20);
  manetta.position.set(-0.03,-0.25,ZP);
  const miscela=new THREE.Group();gr.add(miscela);
  cil(0.006,0.06,M.argento,0,0,0.0,miscela);
  const knobM=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.025,8).rotateX(Math.PI/2),M.rosso);knobM.position.z=0.035;miscela.add(knobM);
  miscela.position.set(0.04,-0.25,ZP+0.02);
  cil(0.016,0.04,M.argento,0.1,-0.25,ZP+0.035);             // aria carburatore
  // indicatore e leva dei flap a destra
  box(0.04,0.1,0.01,M.plastica,0.55,-0.25,ZP+0.06);
  const levaFlap=box(0.035,0.014,0.03,M.bianco,0.55,-0.21,ZP+0.075);
  // ruota del trim (fra i sedili, visibile solo in basso)
  const trim=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.02,24).rotateZ(Math.PI/2),M.nero);
  trim.position.set(0.0,-0.47,ZP+0.32);gr.add(trim);

  /* ---- cloche a corna (una per pilota) ---- */
  function cloche(x){
    const g=new THREE.Group();
    const albero=cil(0.016,0.3,M.argento,0,0,-0.12,g);
    const volante=new THREE.Group();g.add(volante);
    box(0.1,0.075,0.05,M.plastica,0,0,0,volante);                    // mozzo
    const logo=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.01,20).rotateX(Math.PI/2),M.argento);
    logo.position.set(0,-0.008,0.028);volante.add(logo);
    box(0.27,0.03,0.035,M.plastica,0,-0.01,0,volante);               // traversa
    for(const sx of [-1,1]){
      const corno=box(0.032,0.13,0.04,M.plastica,sx*0.135,0.045,0,volante);corno.rotation.z=-sx*0.18;
      const punta=box(0.04,0.03,0.05,M.plastica,sx*0.15,0.115,0.004,volante);punta.rotation.z=-sx*0.18;
    }
    g.position.set(x,0.0,ZP+0.2);
    gr.add(g);
    return {g,volante,z0:ZP+0.2};
  }
  const cloches=[cloche(-0.28),cloche(0.3)];

  /* ---- struttura della cabina ---- */
  for(const sx of [-1,1]){
    // pannelli laterali beige e cornice delle porte
    box(0.04,1.0,1.4,M.beige,sx*0.72,-0.32,-0.5);
    box(0.04,0.5,0.32,M.beige,sx*0.72,0.08,ZP+0.14);                  // parte anteriore, fino alla palpebra
    box(0.05,0.05,1.4,M.beigeScuro,sx*0.71,0.19,-0.5);
    box(0.05,0.06,0.5,M.beigeScuro,sx*0.7,-0.05,-0.75);              // bracciolo
    // montante del parabrezza (dalla palpebra al tetto)
    const mont=box(0.05,0.6,0.06,M.tetto,sx*0.69,0.55,ZP+0.1);
    mont.rotation.x=0.72;
    // montante della porta
    box(0.05,0.7,0.06,M.tetto,sx*0.72,0.55,-0.25);
  }
  box(1.5,0.03,1.3,M.tetto,0,0.78,-0.5);                              // tetto (sotto l'ala)
  box(1.5,0.06,0.08,M.tetto,0,0.75,ZP+0.05);                          // bordo superiore del parabrezza
  box(1.6,0.03,1.6,M.nero,0,-0.8,-0.5);                               // pavimento

  gr.visible=false;

  const o=(window.AEREO&&window.AEREO.occhioPilota)||{x:-0.1,y:0.6,z:-0.15};
  const occhio=new THREE.Vector3(o.x,o.y,o.z);
  return {
    gruppo:gr, pfd, mfd, riserva, occhio,
    // comandi: s = stato della fisica
    aggiorna(s){
      const c=s.comandi;
      for(const k of cloches){
        k.g.position.z=k.z0+clamp(c.elev,-1,1)*0.07;   // tirare = verso il pilota
        k.volante.rotation.z=-c.ail*0.7;               // destra = senso orario
      }
      manetta.position.z=ZP+(1-s.thr)*0.07;            // spinta in avanti = più motore
      levaFlap.position.y=-0.21-(s.flap/30)*0.075;
      trim.rotation.x=-s.trim*6;
    },
  };
};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
})();
