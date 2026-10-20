/* =====================================================================
   MODELLI 3D RIUSABILI: aerei di linea e da turismo, automobili, mezzi di
   rampa. Costruiti in codice con forme semplici, una volta sola: chi li usa
   (js/aeroporti-3d.js per gli aerei parcheggiati, in futuro il traffico)
   li ripete in istanze (InstancedMesh) o li mette in scena come oggetti.
   Le geometrie hanno i colori nei vertici (attributo "color"): il materiale
   deve avere vertexColors:true; il colore dell'istanza li moltiplica.
   Convenzioni: unità in metri, y = 0 al suolo (sotto le ruote), muso degli
   aerei a z = 0 con la coda verso +z (quindi "avanti" è -z, come l'aereo
   del giocatore); auto e mezzi sono lunghi lungo l'asse x.

   SIM.modelli.aereoLinea()    {corpo, livrea}: geometrie dell'aereo di linea
                               (misure dell'A320); "livrea" = deriva, motori,
                               alette, da colorare con il colore della compagnia
   SIM.modelli.aereoTurismo()  {corpo, livrea}: ad ala alta (misure del C172)
   SIM.modelli.TIPI            tipi di aereo: modello e scala (regionale,
                               medio, lungo raggio, turismo)
   SIM.modelli.aereo(tipo, colore, materiale)   un THREE.Group pronto da muovere
   SIM.modelli.auto()          automobile lunga 4,4 m (carrozzeria + abitacolo)
   SIM.modelli.scatola()       cubo di 1 m con la base a y = 0
   SIM.modelli.MEZZI           mezzi di rampa fatti di scatole
   SIM.modelli.LIVREE, COLORI_AUTO   colori generici (niente marchi veri)
   SIM.Acc, SIM.matrice        attrezzi per costruire geometrie
   Le geometrie restituite sono condivise: se serve cambiarle (per esempio la
   boundingSphere delle istanze) si usa .clone().
   ---------------------------------------------------------------------
   Volo — simulatore di volo nel browser
   Autore: Massimiliano Petra <massimiliano.petra@gmail.com>
   Copyright (C) 2026 Massimiliano Petra
   Licenza: GNU General Public License versione 3 o successiva
   (GPL-3.0-or-later). Questo programma è software libero: puoi
   ridistribuirlo e/o modificarlo secondo i termini della GNU GPL
   pubblicata dalla Free Software Foundation, versione 3 o (a tua scelta)
   qualunque versione successiva. È distribuito SENZA ALCUNA GARANZIA.
   Testo completo nel file LICENSE.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const BIANCO=new THREE.Color(1,1,1);

/* ---------- accumulatore di triangoli per materiale ---------- */
class Acc{
  constructor(){this.p=[];this.n=[];this.u=[];this.c=[];}
  // triangolo orientato secondo la normale "verso" (così non serve pensare all'ordine dei vertici)
  tri(a,b,c,ua,ub,uc,col,verso){
    const e1x=b[0]-a[0],e1y=b[1]-a[1],e1z=b[2]-a[2],e2x=c[0]-a[0],e2y=c[1]-a[1],e2z=c[2]-a[2];
    let nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x;
    const l=Math.hypot(nx,ny,nz);if(l<1e-9) return;
    nx/=l;ny/=l;nz/=l;
    if(verso&&nx*verso[0]+ny*verso[1]+nz*verso[2]<0){[b,c]=[c,b];[ub,uc]=[uc,ub];nx=-nx;ny=-ny;nz=-nz;}
    const P=this.p,N=this.n,U=this.u,C=this.c;
    P.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);N.push(nx,ny,nz,nx,ny,nz,nx,ny,nz);
    U.push(ua[0],ua[1],ub[0],ub[1],uc[0],uc[1]);C.push(col.r,col.g,col.b,col.r,col.g,col.b,col.r,col.g,col.b);
  }
  quad(a,b,c,d,ua,ub,uc,ud,col,verso){this.tri(a,b,c,ua,ub,uc,col,verso);this.tri(a,c,d,ua,uc,ud,col,verso);}
  // geometria di three.js (con trasformazione) aggiunta così com'è
  geo(g,m,col,scalaUV=1){
    const gg=g._ni||(g._ni=g.index?g.toNonIndexed():g);   // la stessa geometria si riusa molte volte
    const P=gg.attributes.position,N=gg.attributes.normal,U=gg.attributes.uv,v=new THREE.Vector3(),nm=new THREE.Matrix3().getNormalMatrix(m);
    for(let i=0;i<P.count;i++){
      v.fromBufferAttribute(P,i).applyMatrix4(m);this.p.push(v.x,v.y,v.z);
      v.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();this.n.push(v.x,v.y,v.z);
      if(U)this.u.push(U.getX(i)*scalaUV,U.getY(i)*scalaUV);else this.u.push(0,0);
      this.c.push(col.r,col.g,col.b);
    }
  }
  // geometria finita (posizione, normale, uv, colore)
  geometria(){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat){
    if(!this.p.length) return null;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g,mat);
  }
}
// matrice di posizione, rotazione (ry attorno a y, poi rx) e scala
const tmpM=new THREE.Matrix4(),tmpQ=new THREE.Quaternion(),tmpE=new THREE.Euler(),tmpV=new THREE.Vector3(),tmpS=new THREE.Vector3();
function matrice(x,y,z,ry=0,sx=1,sy=1,sz=1,rx=0){tmpE.set(rx,ry,0,'YXZ');tmpQ.setFromEuler(tmpE);return tmpM.compose(tmpV.set(x,y,z),tmpQ,tmpS.set(sx,sy,sz)).clone();}

/* ---------- modelli degli aerei parcheggiati ----------
   aereo di linea (misure dell'A320: 37,6 m, apertura 35,8 m), muso a z = 0 e coda verso +z;
   due geometrie: "corpo" (colori fissi) e "livrea" (deriva, motori, alette: colore di ogni istanza) */
function modelloLinea(){
  const corpo=new Acc(),livrea=new Acc();
  const bianco=new THREE.Color(0xf4f5f6),pancia=new THREE.Color(0xd6d9dc),grigio=new THREE.Color(0xb9bec4),scuro=new THREE.Color(0x22272c),nero=new THREE.Color(0x2b2b2b);
  const yc=3.55,R=1.98;
  // fusoliera ad anelli: [z, raggio, sollevamento del centro]
  const anelli=[[0,0.05,-0.35],[0.4,0.75,-0.25],[1.2,1.25,-0.12],[2.4,1.65,-0.04],[4,1.92,0],[6,R,0],[28,R,0],[31,1.75,0.25],[34,1.25,0.7],[36.6,0.6,1.15],[37.6,0.18,1.3]];
  const SEG=18,pt=(k,j)=>{const [z,r,dy]=anelli[k],a=j/SEG*Math.PI*2;return [Math.sin(a)*r,yc+dy+Math.cos(a)*r*1.04,z];};
  for(let k=0;k<anelli.length-1;k++)for(let j=0;j<SEG;j++){
    const a=pt(k,j),b=pt(k,j+1),c=pt(k+1,j+1),d=pt(k+1,j),ym=(a[1]+c[1])/2-yc-anelli[k][2];
    const cx=(a[0]+c[0])/2,cz=(a[2]+c[2])/2,cy=yc+anelli[k][2];
    corpo.quad(a,b,c,d,[0,0],[0,0],[0,0],[0,0],ym<-1.1?pancia:bianco,[cx,(a[1]+c[1])/2-cy,0]);
  }
  // finestrini (striscia scura sui due lati) e vetri della cabina
  for(const s of [-1,1]){
    const x=s*(R*0.985+0.03);
    corpo.quad([x,yc+0.35,5],[x,yc+0.35,30],[x,yc+0.62,30],[x,yc+0.62,5],[0,0],[0,0],[0,0],[0,0],scuro,[s,0,0]);
    corpo.quad([s*0.55,yc+0.95,1.5],[s*1.35,yc+0.75,2.2],[s*1.38,yc+1.05,2.5],[s*0.6,yc+1.32,1.8],[0,0],[0,0],[0,0],[0,0],scuro,[s,1,-1]);
  }
  // ala (bassa, a freccia) e piano orizzontale: superficie sopra e sotto
  const ala=(x0,y0,z0,c0,x1,y1,z1,c1,sp,col,acc)=>{
    for(const s of [-1,1]){
      const A=[s*x0,y0,z0],B=[s*x1,y1,z1],C=[s*x1,y1,z1+c1],Dd=[s*x0,y0,z0+c0];
      const A2=[A[0],A[1]+sp,A[2]+c0*0.3],B2=[B[0],B[1]+sp*0.4,B[2]+c1*0.3];
      acc.quad(A,B,C,Dd,[0,0],[0,0],[0,0],[0,0],col,[0,-1,0]);
      acc.quad(A,B2,C,Dd,[0,0],[0,0],[0,0],[0,0],col,[0,1,0]);acc.quad(A,A2,B2,B,[0,0],[0,0],[0,0],[0,0],col,[0,1,-1]);
    }
  };
  ala(1.5,yc-1.35,12.5,7,17.6,yc-0.25,20.6,1.6,0.55,grigio,corpo);
  ala(0.6,yc+0.9,31.5,4.2,6.3,yc+1.4,35.3,1.5,0.25,grigio,corpo);
  // deriva (livrea)
  const fin=[[0,yc+1.6,29.5],[0,yc+1.9,35.8],[0,yc+7.9,37.6],[0,yc+7.9,35.6]];
  for(const s of [-1,1]){const o=p=>[p[0]+s*0.22,p[1],p[2]];livrea.quad(o(fin[0]),o(fin[1]),o(fin[2]),o(fin[3]),[0,0],[0,0],[0,0],[0,0],BIANCO,[s,0,0]);}
  livrea.quad([0.22,yc+7.9,35.6],[0.22,yc+7.9,37.6],[-0.22,yc+7.9,37.6],[-0.22,yc+7.9,35.6],[0,0],[0,0],[0,0],[0,0],BIANCO,[0,1,0]);
  // motori sotto le ali, alette d'estremità
  const mot=new THREE.CylinderGeometry(0.98,0.85,4.3,14,1,true).rotateX(Math.PI/2);
  for(const s of [-1,1]){
    livrea.geo(mot,matrice(s*5.75,yc-2.05,12.9),BIANCO);
    corpo.geo(new THREE.CircleGeometry(0.9,14),matrice(s*5.75,yc-2.05,10.76,Math.PI),nero);
    corpo.geo(new THREE.BoxGeometry(0.25,0.9,2.6),matrice(s*5.75,yc-1.4,13.6),grigio);   // pilone
    livrea.geo(new THREE.BoxGeometry(0.12,2.2,1.1),matrice(s*17.6,yc+0.7,21.2,0,1,1,1,-0.25),BIANCO);
  }
  // carrello
  for(const s of [-1,1]){corpo.geo(new THREE.BoxGeometry(0.3,yc-1.2,0.3),matrice(s*3.8,(yc-1.2)/2,16.5),grigio);
    corpo.geo(new THREE.CylinderGeometry(0.58,0.58,0.9,10).rotateZ(Math.PI/2),matrice(s*3.8,0.58,16.5),nero);}
  corpo.geo(new THREE.BoxGeometry(0.2,yc-1.6,0.2),matrice(0,(yc-1.6)/2,5.1),grigio);
  corpo.geo(new THREE.CylinderGeometry(0.38,0.38,0.5,10).rotateZ(Math.PI/2),matrice(0,0.38,5.1),nero);
  return {corpo,livrea};
}
/* aereo da turismo ad ala alta (misure del Cessna 172: 8,3 m, apertura 11 m) */
function modelloTurismo(){
  const corpo=new Acc(),livrea=new Acc();
  const bianco=new THREE.Color(0xf2f2f0),scuro=new THREE.Color(0x2a3036),nero=new THREE.Color(0x222222);
  corpo.geo(new THREE.BoxGeometry(1.1,1.3,3.2),matrice(0,1.35,2.2),bianco);
  corpo.geo(new THREE.CylinderGeometry(0.35,0.55,4.3,8).rotateX(Math.PI/2),matrice(0,1.45,5.9),bianco);
  corpo.geo(new THREE.BoxGeometry(1.0,0.9,1.0),matrice(0,1.1,0.5),bianco);
  corpo.geo(new THREE.BoxGeometry(1.12,0.55,1.6),matrice(0,1.75,2.2),scuro);              // vetri
  corpo.geo(new THREE.BoxGeometry(11,0.14,1.5),matrice(0,2.1,2.5),bianco);                 // ala alta
  corpo.geo(new THREE.BoxGeometry(3.4,0.08,0.9),matrice(0,1.55,7.7),bianco);
  livrea.geo(new THREE.BoxGeometry(0.1,1.4,1.1),matrice(0,2.2,7.8,0,1,1,1,-0.3),BIANCO);
  livrea.geo(new THREE.BoxGeometry(1.14,0.12,3.3),matrice(0,1.05,2.6),BIANCO);              // banda sul fianco
  corpo.geo(new THREE.BoxGeometry(0.08,1.6,0.12),matrice(0,1.1,-0.05),nero);                // elica
  for(const s of [-1,1])corpo.geo(new THREE.CylinderGeometry(0.22,0.22,0.15,8).rotateZ(Math.PI/2),matrice(s*1.15,0.22,2.9),nero);
  corpo.geo(new THREE.CylinderGeometry(0.18,0.18,0.12,8).rotateZ(Math.PI/2),matrice(0,0.18,0.6),nero);
  return {corpo,livrea};
}

// livree generiche (solo colori: niente marchi)
const LIVREE=[0x0b3a7a,0x1d5fb4,0xb3122a,0x0f7a4a,0xf0b400,0x153055,0x6b1d63,0xe05a16,0x2aa3c9,0xf4f5f6,0x7d8a96,0x0c0c0c];
const COLORI_AUTO=[0xf2f2f2,0xe8e8e8,0x1c1c1e,0x2b2b2e,0x8c9196,0xb5b9bd,0x6f747a,0x1f3b6b,0x8e1b1b,0x2f4f3a,0x5a3d2b,0xc9c1a8,0x3a5f8a];

/* automobile: carrozzeria bianca (prende il colore dell'istanza) e abitacolo scuro, senza le facce di sotto */
function modelloAuto(){
  const a=new Acc(),vetri=new THREE.Color(0.17,0.2,0.23);
  const sc=(x0,x1,y0,y1,z0,z1,c)=>{const P=(x,y,z)=>[x,y,z],u=[0,0];
    a.quad(P(x0,y1,z0),P(x1,y1,z0),P(x1,y1,z1),P(x0,y1,z1),u,u,u,u,c,[0,1,0]);
    a.quad(P(x0,y0,z0),P(x1,y0,z0),P(x1,y1,z0),P(x0,y1,z0),u,u,u,u,c,[0,0,-1]);a.quad(P(x0,y0,z1),P(x1,y0,z1),P(x1,y1,z1),P(x0,y1,z1),u,u,u,u,c,[0,0,1]);
    a.quad(P(x0,y0,z0),P(x0,y0,z1),P(x0,y1,z1),P(x0,y1,z0),u,u,u,u,c,[-1,0,0]);a.quad(P(x1,y0,z0),P(x1,y0,z1),P(x1,y1,z1),P(x1,y1,z0),u,u,u,u,c,[1,0,0]);};
  sc(-2.2,2.2,0.2,0.95,-0.9,0.9,BIANCO);sc(-1.4,0.9,0.95,1.45,-0.8,0.8,vetri);
  const g=a.geometria();g.deleteAttribute('uv');return g;
}
/* mezzi di rampa: scatole [lunghezza, altezza, larghezza, spostamento lungo x, colore, quota della base, inclinazione attorno a z] */
const MEZZI={
  trattore:[[2.6,1.2,1.6,0,0x3e3f42,0.3],[1.2,1,1.5,-0.5,0xf28c00,1.5]],
  carrello:[[3,0.8,1.6,0,0x6c6f73,0.4],[2.8,0.9,1.5,0,0x9aa3ab,1.2]],
  nastro:[[7,0.4,1.6,0,0xe7e3d9,1.3],[2.4,1.3,1.8,-2,0x3f4043,0.2]],
  cisterna:[[2.2,2.4,2.4,4.2,0xf0f0ee,0.4],[7,2.3,2.4,-1,0xd9dde0,0.6]],
  catering:[[2.2,2,2.4,3.2,0xffffff,0.4],[5.5,2.8,2.4,-0.8,0xf2f2f0,1.6]],
  scala:[[4.2,0.9,2,0.6,0xd9d9d6,0.3],[6.2,0.5,1.5,-0.6,0xf4f4f2,2.0,0.55],[0.12,1.1,1.5,-2.2,0xc8c8c4,3.6,0.55]],
  bus:[[13,2.8,2.5,0,0x2a5fb0,0.3],[12.4,0.9,2.52,0,0x2c3238,1.8]],
};
// tipi di aereo: modello e scala rispetto alle misure di base
const TIPI={
  regionale:{modello:'linea',scala:0.74},   // apertura ~26 m (jet regionali)
  medio:{modello:'linea',scala:1},          // A320 / B737
  lungo:{modello:'linea',scala:1.62},       // bimotore a lungo raggio (~58 m)
  turismo:{modello:'turismo',scala:1},      // Cessna 172
};

// geometrie costruite la prima volta che servono, poi condivise
const cache={};
const una=(k,fn)=>cache[k]||(cache[k]=fn());
const coppia=m=>({corpo:m.corpo.geometria(),livrea:m.livrea.geometria()});
SIM.Acc=Acc;
SIM.matrice=matrice;
SIM.modelli={
  aereoLinea:()=>una('linea',()=>coppia(modelloLinea())),
  aereoTurismo:()=>una('turismo',()=>coppia(modelloTurismo())),
  auto:()=>una('auto',modelloAuto),
  scatola:()=>una('scatola',()=>{const g=new THREE.BoxGeometry(1,1,1).translate(0,0.5,0);
    g.setAttribute('color',new THREE.Float32BufferAttribute(new Array(g.attributes.position.count*3).fill(1),3));return g;}),
  TIPI, MEZZI, LIVREE, COLORI_AUTO,
  /* un aereo singolo da mettere in scena e muovere (per il traffico): gruppo con corpo e livrea colorata */
  aereo(tipo='medio',colore=LIVREE[0],materiale){
    const t=TIPI[tipo]||TIPI.medio,g=t.modello==='turismo'?SIM.modelli.aereoTurismo():SIM.modelli.aereoLinea();
    const m=materiale||new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.1});
    const ml=m.clone();ml.color=new THREE.Color(colore);
    const gr=new THREE.Group();gr.add(new THREE.Mesh(g.corpo,m),new THREE.Mesh(g.livrea,ml));gr.scale.setScalar(t.scala);
    return gr;
  },
};
})();
