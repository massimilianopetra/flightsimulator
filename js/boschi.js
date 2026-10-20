/* =====================================================================
   BOSCHI 3D
   Alberi veri (InstancedMesh) attorno all'aereo, dove la griglia vicina del
   terreno ha il peso "bosco" (attributo aBosco, calcolato in js/terreno.js):
   così gli alberi stanno esattamente dove lo shader disegna le chiome.
   Nessun dato: posizioni da una griglia di 11 m con spostamenti pseudo-casuali
   fissi (gli stessi alberi a ogni passaggio). Conifere in alto, latifoglie in basso.
   Due copie (come la griglia del terreno): una si prepara a pezzi mentre l'altra è visibile.
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};

const PASSO=11;       // m fra un albero e l'altro nel bosco fitto
const RAGGIO=2600;    // m dal centro della griglia
const MAXA=80000;     // alberi al massimo per specie

SIM.creaBoschi=function(scene,T){
  const QC=T.QC, hash=T.hash;
  const matA=new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1,metalness:0});
  const geoC=new THREE.ConeGeometry(1,1,6,1,true).translate(0,0.5,0);              // conifera
  const geoL=new THREE.IcosahedronGeometry(0.5,0).translate(0,0.62,0);             // latifoglia (chioma)
  function istanze(geo){
    const im=new THREE.InstancedMesh(geo,matA,MAXA);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0,new THREE.Color());
    im.count=0;im.frustumCulled=false;im.visible=false;scene.add(im);
    return im;
  }
  const copie=[{c:istanze(geoC),l:istanze(geoL)},{c:istanze(geoC),l:istanze(geoL)}];
  let visibile=0,pronta=false;

  // zone in cui non si piantano alberi anche se la maschera dice bosco
  const vietato=(x,z)=>(SIM.zonaAeroporti&&SIM.zonaAeroporti(x,z))||
    (SIM.reteRullaggio&&SIM.reteRullaggio.zona(x,z,30))||(SIM.zonaMonumenti&&SIM.zonaMonumenti(x,z));

  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3(),
    asse=new THREE.Vector3(0,1,0),col=new THREE.Color();
  /* g = {x0, z0, N, STEP, H (quote), W (peso bosco)} della griglia appena calcolata */
  function* costruisci(g,cx,cz){
    pronta=false;
    const cp=copie[1-visibile];
    let nc=0,nl=0,k=0;
    const SEG=g.N-1;
    // valore interpolato sul triangolo della griglia (stessa diagonale della mesh)
    let fh=0;
    function peso(x,z){
      const fi=(x-g.x0)/g.STEP,fj=(z-g.z0)/g.STEP,i=Math.floor(fi),j=Math.floor(fj);
      if(i<0||j<0||i>=SEG||j>=SEG) return 0;
      const fx=fi-i,fz=fj-j,N=g.N,o=j*N+i,W=g.W,H=g.H;
      let w;
      if(fz>fx){w=W[o]+(W[o+N+1]-W[o+N])*fx+(W[o+N]-W[o])*fz;fh=H[o]+(H[o+N+1]-H[o+N])*fx+(H[o+N]-H[o])*fz;}
      else{w=W[o]+(W[o+1]-W[o])*fx+(W[o+N+1]-W[o+1])*fz;fh=H[o]+(H[o+1]-H[o])*fx+(H[o+N+1]-H[o+1])*fz;}
      return w;
    }
    const R2=RAGGIO*RAGGIO,i0=Math.floor((cx-RAGGIO)/PASSO),i1=Math.ceil((cx+RAGGIO)/PASSO);
    const j0=Math.floor((cz-RAGGIO)/PASSO),j1=Math.ceil((cz+RAGGIO)/PASSO);
    const conA=QC.prato,conB=(QC.prato+QC.bosco)/2;
    const t0=performance.now(),jc=Math.round(cz/PASSO),nj=j1-j0+1;
    let esam=0;
    // righe dal centro verso fuori (+0, +1, -1, +2, -2...): se si arriva al massimo mancano le più lontane
    for(let t=0;t<nj*2&&(nc<MAXA||nl<MAXA);t++){
      const j=jc+(t&1?(t+1)>>1:-(t>>1));
      if(j<j0||j>j1) continue;
      for(let i=i0;i<=i1;i++){
        if(++esam%25000===0) yield;
        const x=(i+hash(i,j)*0.9-0.45)*PASSO+PASSO/2,z=(j+hash(j+7919,i-104729)*0.9-0.45)*PASSO+PASSO/2;
        const dx=x-cx,dz=z-cz,d2=dx*dx+dz*dz;
        if(d2>R2) continue;
        const w=peso(x,z);
        if(w<0.44) continue;
        const r=hash(i*3+1,j*5-2);
        // al margine del bosco alberi più radi; oltre 1 km meno alberi (lì bastano le chiome dello shader)
        if(r>smooth(0.44,0.62,w)*0.97*(1-0.6*smooth(1000,RAGGIO,Math.sqrt(d2)))) continue;
        if(SIM.liberoVie&&SIM.liberoVie(x,z)<4) continue;  // strade, ferrovie, fiumi
        if(vietato(x,z)) continue;
        const r2=hash(i-31,j+17),con=r2<smooth(conA,conB,fh+(hash(i+5,j+9)-0.5)*300);
        const ht=con?14+r2*14:9+hash(j,i)*10;
        if(con){if(nc>=MAXA)continue;}else if(nl>=MAXA)continue;
        const im=con?cp.c:cp.l,n=con?nc++:nl++;
        p.set(x,fh-0.8,z);q.setFromAxisAngle(asse,r*6.283);
        if(con)s.set(ht*0.24,ht,ht*0.24);else s.set(ht*0.75,ht,ht*0.75);
        m.compose(p,q,s);im.setMatrixAt(n,m);
        if(con)col.setHSL(0.31+r*0.05,0.42,0.13+r2*0.06);else col.setHSL(0.21+r2*0.08,0.45,0.18+r*0.08);
        im.setColorAt(n,col);
        if(++k%4000===0) yield;
      }
    }
    cp.c.count=nc;cp.l.count=nl;tempo=Math.round(performance.now()-t0);
    for(const im of [cp.c,cp.l]){im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;}
    pronta=true;
  }
  let tempo=0;   // ms dell'ultima preparazione (tutta di fila solo quando è forzata)
  SIM.debugBoschi={copie,stato:()=>({visibile,c:copie[visibile].c.count,l:copie[visibile].l.count,tempo})};
  return {
    costruisci,
    // da chiamare quando la griglia nuova diventa visibile
    applica(){
      if(!pronta) return;
      pronta=false;visibile=1-visibile;
      for(let i=0;i<2;i++){copie[i].c.visible=copie[i].l.visible=i===visibile;}
    },
  };
};
})();
