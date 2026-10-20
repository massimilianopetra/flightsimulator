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
   MONUMENTI 3D (solo mondo reale): Mole Antonelliana, Superga, Lingotto,
   grattacieli di Torino, Venaria, Stupinigi, Sacra di San Michele,
   Vicoforte, San Gaudenzio, Oropa, campanile e chiesa di San Maurizio Canavese.
   Ogni monumento è una lista di "pezzi" semplici (blocchi, cilindri,
   cupole, guglie, tetti) in coordinate locali:
     x = a destra, y = in su, z = indietro (l'asse "rotta" è verso -z),
     y = 0 è il piede dell'edificio.
   I pezzi dello stesso materiale vengono fusi in una sola geometria.
   I dati (posizione e orientamento) sono in dati/piemonte-monumenti.js.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const D2R=Math.PI/180, R2=Math.SQRT2;

/* ---------- colori ---------- */
const COLORI={
  pietra:0xd2c3a2, pietraScura:0x9b8b73, ocra:0xdcc08e, chiaro:0xe8e0cc, bianco:0xf0eee8,
  tegole:0xa0533b, ardesia:0x6b6e72, piombo:0x8e959a, rame:0x6f9c8b, bronzo:0x6b5233,
  vetro:0x86a3bb, vetroChiaro:0xbfd3e0, asfalto:0x4a4b4d, tetto:0x8d8b86,
  mattone:0xa4583a, mattoneScuro:0x7e4129, intonaco:0xece2cc, scuro:0x2b2622,
};

/* ---------- pezzi ----------
   box: w (largo, x), h, d (lungo, z)      cil: r, rz (ellisse), rt (raggio in cima), h, seg
   cono: r, h, seg (4 = piramide)          cupola: r, rz, h (mezza sfera schiacciata)
   tornio: profilo [[r,y],...], seg        tetto: w, d, h (a due falde, colmo lungo z)
   anello: ri, re, a0, a1 (piatto)         sfera: r
   tutti: x, y, z (piede), m (colore), ry (rotazione attorno all'asse verticale, gradi) */
const B=(w,h,d,x,y,z,m,ry)=>({t:'box',w,h,d,x,y,z,m,ry});
const C=(r,h,x,y,z,m,o={})=>Object.assign({t:'cil',r,h,x,y,z,m},o);
const K=(r,h,x,y,z,m,seg=16)=>({t:'cono',r,h,x,y,z,m,seg});
const U=(r,h,x,y,z,m,rz)=>({t:'cupola',r,h,x,y,z,m,rz});
const T=(w,d,h,x,y,z,m,ry)=>({t:'tetto',w,d,h,x,y,z,m,ry});
const S=(r,x,y,z,m)=>({t:'sfera',r,x,y,z,m});
// un corpo di fabbrica con tetto a due falde, lungo L verso la direzione "dir" (gradi, nel sistema locale)
function corpo(x,z,dir,L,W,H,muro,tetto,hTetto=5){
  return [B(W,H+20,L,x,-20,z,muro,-dir),T(W,L,hTetto,x,H,z,tetto,-dir)];
}

/* ---------- i modelli ---------- */
const MODELLI={
  mole(){ // Mole Antonelliana: 167 m
    const a=y=>[[21,45],[20,55],[17.5,65],[13.5,75],[8.5,84],[5.5,88]].map(([r,yy])=>[r*R2,yy]);
    return [
      B(43,48,50,0,-20,0,'pietra'), B(45,2,52,0,28,0,'pietra'), B(39,12,46,0,30,0,'chiaro'), B(41,3,48,0,42,0,'pietra'),
      {t:'tornio',profilo:a(),seg:4,x:0,y:0,z:0,m:'piombo'},
      B(10,11,10,0,88,0,'chiaro'), B(12,1,12,0,99,0,'pietra'), B(8,10,8,0,100,0,'chiaro'),
      K(5.5,8,0,110,0,'piombo',4), K(3,46,0,117,0,'piombo',8), S(1.5,0,163,0,'bronzo'), K(0.4,4,0,164,0,'bronzo',6),
    ];
  },
  superga(){ // Basilica di Superga: facciata verso +z (Torino), convento verso -z
    const p=[
      B(36,37,36,0,-15,0,'chiaro'), C(13,20,0,22,0,'chiaro',{seg:24}), U(13,16,0,42,0,'piombo'),
      C(3,8,0,58,0,'chiaro',{seg:12}), K(3.5,6,0,66,0,'piombo'), S(0.8,0,72.5,0,'bronzo'),
      B(30,35,11,0,-15,23,'chiaro'), T(32,11,7,0,20,23,'piombo'),          // pronao con il frontone
    ];
    for(const sx of [-1,1])p.push(B(7,60,7,sx*20,-15,-12,'chiaro'),U(4,5,sx*20,45,-12,'piombo'),K(0.6,5,sx*20,50,-12,'piombo',6));
    // convento attorno al cortile
    for(const sx of [-1,1])p.push(...corpo(sx*25,-53,0,70,14,18,'ocra','tegole'));
    for(const sz of [-1,1])p.push(...corpo(0,-53+sz*28,90,36,14,18,'ocra','tegole'));
    return p;
  },
  lingotto(){ // fabbrica lunga 500 m con la pista di prova sul tetto
    const p=[];
    for(const sx of [-1,1])p.push(B(24,32,500,sx*28,-5,0,'chiaro'),B(14,0.6,420,sx*28,27,0,'asfalto'));
    for(const z of [-230,-115,0,115,230])p.push(B(32,32,24,0,-5,z,'chiaro'));
    p.push({t:'anello',ri:21,re:35,a0:0,a1:Math.PI,x:0,y:27.1,z:-210,m:'asfalto'},
           {t:'anello',ri:21,re:35,a0:Math.PI,a1:2*Math.PI,x:0,y:27.1,z:210,m:'asfalto'},
           S(9,0,33,-150,'vetroChiaro'), B(18,9,28,0,27,150,'piombo'));    // la Bolla e lo Scrigno
    return p;
  },
  regione(){ // grattacielo della Regione Piemonte: 209 m
    return [B(44,195,44,0,-5,0,'vetro'),B(44,15,44,0,190,0,'vetroChiaro'),B(30,2,30,0,203,0,'bianco'),C(0.6,6,0,203,0,'bianco',{seg:6})];
  },
  intesa(){ // grattacielo Intesa Sanpaolo: 166 m, con la serra in cima e lo scheletro esterno
    const p=[B(40,155,62,0,-5,0,'vetro'),B(38,16,58,0,150,0,'vetroChiaro')];
    for(const sx of [-1,1])for(const sz of [-1,1])p.push(B(3,171,3,sx*20,-5,sz*31,'bianco'));
    for(const y of [50,100,149])for(const sx of [-1,1])p.push(B(1.5,2,62,sx*20.5,y,0,'bianco'));
    return p;
  },
  venaria(){ // Reggia di Venaria: corpo principale, ala verso la corte, scuderie e citroniera (semplificati)
    return [
      ...corpo(30,0,100,240,22,24,'chiaro','ardesia',6),
      ...corpo(150,40,10,110,18,20,'chiaro','ardesia',5),
      ...corpo(115,250,8,300,22,20,'chiaro','tegole',6),
      ...corpo(158,250,8,300,16,16,'chiaro','tegole',5),
    ];
  },
  stupinigi(){ // Palazzina di caccia: salone ovale con il cervo, bracci a croce di Sant'Andrea, ali verso il viale
    const p=[C(16,29,0,-5,0,'ocra',{rz:20,seg:28}),U(16,10,0,24,0,'ardesia',20),C(4,5,0,32,0,'ocra',{seg:12}),
      B(1.4,1.8,4,0,37,0,'bronzo'),B(0.8,2.2,0.8,0,37.8,-2,'bronzo'),K(0.4,2.5,-0.6,40,-2,'bronzo',4),K(0.4,2.5,0.6,40,-2,'bronzo',4)];
    for(const b of [45,135,225,315]){
      const s=Math.sin(b*D2R),c=-Math.cos(b*D2R);
      p.push(...corpo(s*50,c*50,b,72,16,15,'ocra','tegole'));
    }
    for(const sx of [-1,1])p.push(...corpo(sx*62,-128,0,130,14,11,'ocra','tegole'));
    return p;
  },
  sacra(){ // Sacra di San Michele: basamento di pietra sul monte, chiesa e torre della Bell'Alda
    return [B(30,45,60,0,-15,0,'pietraScura'),B(18,14,40,0,30,5,'pietra'),T(18,40,6,0,44,5,'ardesia'),
      C(9,14,0,30,-15,'pietra',{seg:16}),B(9,52,9,0,-15,28,'pietraScura'),B(14,30,18,10,-15,-24,'pietraScura')];
  },
  vicoforte(){ // Santuario di Vicoforte: la cupola ellittica più grande del mondo e 4 torri
    const p=[B(44,40,52,0,-20,0,'chiaro'),C(18,12,0,20,0,'chiaro',{rz:22,seg:32}),U(18,32,0,32,0,'rame',22),
      C(3,6,0,64,0,'chiaro',{seg:12}),K(3.5,5,0,70,0,'rame'),S(0.6,0,75.5,0,'bronzo')];
    for(const sx of [-1,1])for(const sz of [-1,1])p.push(B(8,56,8,sx*22,-20,sz*26,'chiaro'),K(6,8,sx*22,36,sz*26,'rame',4));
    return p;
  },
  gaudenzio(){ // Basilica di San Gaudenzio a Novara: la cupola-guglia di Antonelli, 121 m
    const z=-18;
    return [B(30,33,80,0,-10,0,'pietra'),T(30,80,7,0,23,0,'tegole'),B(54,23,70,0,-10,0,'pietra'),
      B(22,20,22,0,23,z,'chiaro'),C(10,18,0,43,z,'bianco',{seg:20}),C(8.5,6,0,61,z,'bianco',{seg:20}),U(8.5,12,0,67,z,'piombo'),
      C(4,10,0,79,z,'bianco',{seg:12}),C(2.6,10,0,89,z,'bianco',{seg:12}),K(2.6,18,0,99,z,'piombo',12),K(0.5,4,0,117,z,'bronzo',6)];
  },
  campanileSM(){ // campanile di San Maurizio Canavese: 62 m; fusto romanico in mattoni (XI secolo), cima rialzata nel Settecento
    const p=[B(6.4,44,6.4,0,-6,0,'mattone')];
    for(const sx of [-1,1])for(const sz of [-1,1])p.push(B(0.9,44,0.9,sx*3,-6,sz*3,'mattoneScuro'));   // lesene agli spigoli
    for(const y of [10,20,30])p.push(B(6.8,0.5,6.8,0,y,0,'mattoneScuro'));                              // cornici dei piani
    // cella delle campane: pilastri agli angoli, finestroni scuri in mezzo
    p.push(B(7,0.8,7,0,38,0,'intonaco'),B(5.4,8,5.4,0,38.8,0,'scuro'));
    for(const sx of [-1,1])for(const sz of [-1,1])p.push(B(1.6,8,1.6,sx*2.6,38.8,sz*2.6,'intonaco'));
    p.push(B(7.2,1,7.2,0,46.8,0,'intonaco'),
      C(2.8,5,0,47.8,0,'intonaco',{seg:8}),C(3.1,0.6,0,52.8,0,'intonaco',{seg:8}),   // tamburo ottagonale
      U(2.9,3.6,0,53.4,0,'piombo'),C(0.6,2.2,0,56.8,0,'intonaco',{seg:8}),K(0.8,2,0,59,0,'piombo',8),   // cupola e lanterna
      B(0.12,1.6,0.12,0,61,0,'bronzo'),B(0.8,0.12,0.12,0,61.9,0,'bronzo'));            // croce
    return p;
  },
  chiesaSM(){ // chiesa di San Maurizio Martire: navata con facciata a capanna, navatelle e abside
    return [...corpo(0,0,0,30,12,13,'intonaco','tegole',4),
      B(5,7,26,-8.5,-3,0,'intonaco'),T(5,26,2,-8.5,4,0,'tegole'),B(5,7,26,8.5,-3,0,'intonaco'),T(5,26,2,8.5,4,0,'tegole'),
      C(5.5,10,0,-3,-15,'intonaco',{seg:16}),U(5.5,3,0,7,-15,'tegole')];
  },
  villetta(){ // villetta a due piani con pianta a L e tetti a falde
    return [B(15,6.3,10.1,2.3,-0.5,-3.3,'chiaro'),T(11.3,16.2,2.6,2.3,5.8,-3.3,'tegole',90),
      B(14.6,6.3,13.1,-2.3,-0.5,3.3,'chiaro'),T(15.8,14.3,3.2,-2.3,5.8,3.3,'tegole')];
  },
  oropa(){ // Basilica Superiore di Oropa: grande cupola verde
    return [B(45,40,70,0,-20,0,'pietra'),C(22,18,0,20,0,'pietra',{seg:32}),U(22,28,0,38,0,'rame'),
      C(4,8,0,66,0,'pietra',{seg:12}),K(4.5,6,0,74,0,'rame'),B(30,32,12,0,-10,40,'pietra'),T(30,12,6,0,22,40,'rame')];
  },
};

/* ---------- da pezzi a geometrie ---------- */
function geometria(p){
  let g;
  switch(p.t){
    case 'box': g=new THREE.BoxGeometry(p.w,p.h,p.d).translate(0,p.h/2,0);break;
    case 'cil': g=new THREE.CylinderGeometry(p.rt!=null?p.rt:p.r,p.r,p.h,p.seg||16).translate(0,p.h/2,0);
      if(p.rz)g.scale(1,1,p.rz/p.r);break;
    case 'cono': g=new THREE.ConeGeometry(p.r,p.h,p.seg||16).translate(0,p.h/2,0);if(p.seg===4)g.rotateY(Math.PI/4);break;
    case 'cupola': g=new THREE.SphereGeometry(p.r,24,10,0,Math.PI*2,0,Math.PI/2).scale(1,p.h/p.r,(p.rz||p.r)/p.r);break;
    case 'sfera': g=new THREE.SphereGeometry(p.r,14,10).translate(0,p.r,0);break;
    case 'tornio': g=new THREE.LatheGeometry(p.profilo.map(([r,y])=>new THREE.Vector2(r,y)),p.seg||16);if(p.seg===4)g.rotateY(Math.PI/4);break;
    case 'anello': g=new THREE.RingGeometry(p.ri,p.re,24,1,p.a0,p.a1-p.a0).rotateX(-Math.PI/2);break;
    case 'tetto':{ // prisma a due falde, colmo lungo z
      const w=p.w/2,d=p.d/2,h=p.h;
      const v=[[-w,0,-d],[w,0,-d],[w,0,d],[-w,0,d],[0,h,-d],[0,h,d]];
      const tri=[0,3,5, 0,5,4, 1,4,5, 1,5,2, 3,2,5, 0,4,1];   // in senso antiorario visti da fuori
      g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tri.flatMap(i=>v[i])),3));
      break;
    }
  }
  if(p.ry)g.rotateY(p.ry*D2R);
  g.translate(p.x||0,p.y||0,p.z||0);
  if(g.index)g=g.toNonIndexed();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
// unisce più geometrie (solo posizione e normale)
function unisci(lista){
  let n=0;for(const g of lista)n+=g.attributes.position.count;
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3);let o=0;
  for(const g of lista){pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);o+=g.attributes.position.count;g.dispose();}
  const r=new THREE.BufferGeometry();
  r.setAttribute('position',new THREE.BufferAttribute(pos,3));
  r.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  return r;
}

/* ---------- elenco: posizione nel mondo e ingombro a terra ---------- */
function prepara(){
  const R=window.RILIEVO, L=window.MONUMENTI;
  if(!R||!L) return [];
  const KLON=111320*Math.cos(R.lat0*D2R), KLAT=110574;
  return L.filter(m=>MODELLI[m.tipo]).map(m=>{
    const x=(m.lon-R.lon0)*KLON, z=-(m.lat-R.lat0)*KLAT, a=-m.rotta*D2R, c=Math.cos(a), s=Math.sin(a);
    const pezzi=MODELLI[m.tipo]();
    // ingombro: i pezzi che toccano terra, come rettangoli orientati (nel sistema del mondo)
    const ingombro=[];
    for(const p of pezzi){
      if(p.y>1||!(p.t==='box'||p.t==='cil')) continue;
      const hw=(p.t==='box'?p.w/2:p.r)+6, hd=(p.t==='box'?p.d/2:(p.rz||p.r))+6, ra=a+(p.ry||0)*D2R;
      // centro del pezzo nel mondo (rotazione di "a" attorno a y: x' = x cos + z sin, z' = -x sin + z cos)
      ingombro.push({x:x+p.x*c+p.z*s, z:z-p.x*s+p.z*c, c:Math.cos(ra), s:Math.sin(ra), hw, hd});
    }
    let raggio=0;for(const g of ingombro)raggio=Math.max(raggio,Math.hypot(g.x-x,g.z-z)+Math.hypot(g.hw,g.hd));
    return {dati:m, nome:SIM.L?SIM.L(m.nome,m.nomeEn||m.nome):m.nome, x, z, rot:a, pezzi, ingombro, raggio};
  });
}
const ELENCO=prepara();
SIM.listaMonumenti=ELENCO;

// true se il punto è dentro l'ingombro di un monumento (lì non si generano case: js/paesaggio.js)
SIM.zonaMonumenti=function(x,z){
  for(const m of ELENCO){
    if(Math.abs(x-m.x)>m.raggio||Math.abs(z-m.z)>m.raggio) continue;
    for(const g of m.ingombro){
      const dx=x-g.x,dz=z-g.z, u=dx*g.c-dz*g.s, v=dx*g.s+dz*g.c;   // nel sistema del pezzo
      if(Math.abs(u)<=g.hw&&Math.abs(v)<=g.hd) return true;
    }
  }
  return false;
};

/* ---------- costruzione nella scena ---------- */
SIM.creaMonumenti=function(scene){
  const T=SIM.terreno;
  if(!ELENCO.length) return null;
  const mat={};
  for(const k in COLORI)mat[k]=new THREE.MeshStandardMaterial({color:COLORI[k],roughness:k.startsWith('vetro')?0.35:0.85,metalness:0});
  const lista=ELENCO.map(m=>{
    const gr=new THREE.Group();
    const perMat={};
    for(const p of m.pezzi)(perMat[p.m]||(perMat[p.m]=[])).push(geometria(p));
    for(const k in perMat)gr.add(new THREE.Mesh(unisci(perMat[k]),mat[k]));
    gr.position.set(m.x,0,m.z);gr.rotation.y=m.rot;
    scene.add(gr);
    // appoggio sul terreno dettagliato: il punto più basso sotto l'edificio (i basamenti scendono sotto terra)
    let yV=Infinity;
    for(const g of m.ingombro)for(const [u,v] of [[0,0],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const px=g.x+(u*g.hw*g.c+v*g.hd*g.s), pz=g.z+(-u*g.hw*g.s+v*g.hd*g.c);
      yV=Math.min(yV,T.meshH(px,pz));
    }
    if(!isFinite(yV))yV=T.meshH(m.x,m.z);
    return {m,gr,yVicino:yV,yLontano:T.hLontano?T.hLontano(m.x,m.z):yV};
  });
  return {
    lista,   // per le prove dalla console
    // pos = posizione della telecamera; vic = zona del terreno dettagliato (terreno.vicino())
    aggiorna(pos,vic){
      for(const o of lista){
        const d=Math.hypot(o.m.x-pos.x,o.m.z-pos.z);
        o.gr.visible=d<60000;
        if(!o.gr.visible) continue;
        const dentro=vic&&Math.abs(o.m.x-vic.cx)<vic.mezzo&&Math.abs(o.m.z-vic.cz)<vic.mezzo;
        o.gr.position.y=dentro?o.yVicino:o.yLontano;
      }
    },
  };
};
})();
