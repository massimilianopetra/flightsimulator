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
   PONTI senza dati: dove una strada o una ferrovia (window.VIE) incrocia
   un fiume o un canale c'è un ponte. Gli incroci si cercano mentre il
   gioco gira, nella griglia vicina (js/paesaggio.js li chiede insieme al
   resto del paesaggio, a pezzi, e li mostra allo scambio dei buffer).
   - Lunghezza: larghezza del greto (o dell'argine) divisa per il seno
     dell'angolo d'incrocio, più le spalle.
   - Profilo: da una riva all'altra seguendo il terreno alle estremità,
     con una gobba (più alta nei ponti lunghi) e mai sotto il terreno.
   - Aspetto secondo la via: larghezza, asfalto o massicciata, parapetti,
     linee di bordo, pile in alveo ogni ~32 m.
   Tutti i ponti stanno in una sola geometria (due copie, come gli edifici);
   paesaggio.js ridipinge l'acqua sotto l'impalcato (sennò si vedrebbe la
   strada dipinta sul fiume).
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// per categoria: larghezza dell'impalcato (m), colore del piano, parapetto (altezza), linee di bordo (distanza dal bordo)
const TIPO={
  autostrade: {w:28, piano:0x4a4a4c, par:1.1, linee:[3.2,13.6], centro:true},
  superstrade:{w:21, piano:0x4d4d4f, par:1.1, linee:[3.0,9.9], centro:true},
  statali:    {w:11, piano:0x525153, par:1.0, linee:[1.3]},
  provinciali:{w:8.5,piano:0x58575a, par:1.0, linee:[1.0]},
  comunali:   {w:7,  piano:0x646260, par:0.9},
  urbane:     {w:7.5,piano:0x5a5957, par:1.0},
  ferrovie:   {w:8,  piano:0x6e655a, par:0.6, binari:true},
};
const CEM=new THREE.Color(0x9a978f), CEM_SCURO=new THREE.Color(0x77746d), BIANCO=new THREE.Color(0xd9d7cf),
  FERRO=new THREE.Color(0x3a3634);

SIM.creaPonti=function(scene){
  const T=SIM.terreno;
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9,metalness:0,flatShading:true});
  const mesh=[0,1].map(()=>{const m=new THREE.Mesh(new THREE.BufferGeometry(),mat);m.visible=false;m.frustumCulled=false;scene.add(m);return m;});
  let visibile=0,nuovi=null,pronti=null;
  let elenco=[];   // ponti della griglia visibile (per ridipingere l'acqua nell'immagine da vicino)

  /* ---------- incroci ---------- */
  // segmenti dei fiumi e dei canali in celle di C m, poi ogni tratto di via cerca nelle sue celle
  function* trova(linee,x0,z0,X1,Z1){
    const C=256,NX=Math.ceil((X1-x0)/C)+1,NZ=Math.ceil((Z1-z0)/C)+1,celle=new Map();
    const fuori=(b,m)=>b[1]<x0-m||b[0]>X1+m||b[3]<z0-m||b[2]>Z1+m;
    const acque=linee.filter(v=>(v.cat==='fiumi'||v.cat==='canali')&&!fuori(v.box,200));
    if(!acque.length) return [];
    for(const v of acque)for(let i=1;i<v.xs.length;i++){
      const i0=Math.max(0,Math.floor((Math.min(v.xs[i-1],v.xs[i])-x0)/C)),i1=Math.min(NX-1,Math.floor((Math.max(v.xs[i-1],v.xs[i])-x0)/C));
      const j0=Math.max(0,Math.floor((Math.min(v.zs[i-1],v.zs[i])-z0)/C)),j1=Math.min(NZ-1,Math.floor((Math.max(v.zs[i-1],v.zs[i])-z0)/C));
      for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){const c=j*NX+k;let l=celle.get(c);if(!l)celle.set(c,l=[]);l.push(v,i);}
    }
    yield;
    const out=[];let q=0;
    for(const v of linee){
      if(v.cat==='fiumi'||v.cat==='canali'||!TIPO[v.cat]||fuori(v.box,0)) continue;
      if(++q%1500===0) yield;
      for(let i=1;i<v.xs.length;i++){
        const ax=v.xs[i-1],az=v.zs[i-1],bx=v.xs[i],bz=v.zs[i];
        const i0=Math.floor((Math.min(ax,bx)-x0)/C),i1=Math.floor((Math.max(ax,bx)-x0)/C);
        const j0=Math.floor((Math.min(az,bz)-z0)/C),j1=Math.floor((Math.max(az,bz)-z0)/C);
        if(i1<0||j1<0||i0>=NX||j0>=NZ) continue;
        for(let j=Math.max(0,j0);j<=Math.min(NZ-1,j1);j++)for(let k=Math.max(0,i0);k<=Math.min(NX-1,i1);k++){
          const l=celle.get(j*NX+k);if(!l) continue;
          for(let n=0;n<l.length;n+=2){
            const r=l[n],s=l[n+1],cx=r.xs[s-1],cz=r.zs[s-1],dx=r.xs[s]-cx,dz=r.zs[s]-cz;
            // incrocio di due segmenti: a + t·(b−a) = c + u·d
            const ex=bx-ax,ez=bz-az,den=ex*dz-ez*dx;
            if(Math.abs(den)<1e-6) continue;
            const t=((cx-ax)*dz-(cz-az)*dx)/den,u=((cx-ax)*ez-(cz-az)*ex)/den;
            if(t<0||t>1||u<0||u>1) continue;
            const px=ax+t*ex,pz=az+t*ez;
            if(px<x0||px>X1||pz<z0||pz>Z1) continue;
            if(out.some(p=>p.via===v&&Math.abs(p.x-px)<1&&Math.abs(p.z-pz)<1)) continue;   // stesso incrocio visto da due celle
            out.push(ponte(v,r,px,pz,ex,ez,dx,dz));
          }
        }
      }
    }
    // le carreggiate separate (due vie vicine e parallele sullo stesso fiume) diventano un ponte solo
    out.sort((a,b)=>b.w-a.w);
    const tenuti=[];
    for(const p of out){
      if(tenuti.some(o=>o.fiume===p.fiume&&Math.hypot(o.x-p.x,o.z-p.z)<(o.w+p.w)*0.5+4&&Math.abs(o.ux*p.uz-o.uz*p.ux)<0.35)) continue;
      tenuti.push(p);
    }
    return tenuti;
  }
  // ponte all'incrocio (px, pz) della via v (direzione e) con il fiume r (direzione d)
  function ponte(v,r,px,pz,ex,ez,dx,dz){
    const le=Math.hypot(ex,ez)||1,ld=Math.hypot(dx,dz)||1,ux=ex/le,uz=ez/le;
    const seno=Math.max(0.35,Math.abs(ux*dz/ld-uz*dx/ld));
    const tipo=TIPO[v.cat];
    // mezza luce: ingombro del fiume (greto, argini) sull'asse della via, più il mezzo impalcato di sbieco e le spalle
    const coseno=Math.sqrt(1-seno*seno);
    const mezza=r.ing/seno+tipo.w*0.5*coseno/seno+5;
    return {via:v,fiume:r,cat:v.cat,x:px,z:pz,ux,uz,w:tipo.w,mezza};
  }

  /* ---------- geometria ---------- */
  function* costruisci(lista){
    const A=new SIM.Acc(),c=new THREE.Color();
    let q=0;
    for(const p of lista){
      impalcato(A,p,c);
      if(++q%20===0) yield;
    }
    nuovi=A.geometria();
    pronti=lista;
  }
  function impalcato(A,p,col){
    const tipo=TIPO[p.cat],L=p.mezza*2,N=clamp(Math.ceil(L/14),2,14);
    const ax=p.x-p.ux*p.mezza,az=p.z-p.uz*p.mezza;
    const nx=-p.uz,nz=p.ux;                       // di lato (a destra o a sinistra: non importa)
    const hA=T.meshH(ax,az),hB=T.meshH(p.x+p.ux*p.mezza,p.z+p.uz*p.mezza);
    const gobba=clamp(L*0.035,0.6,4.5),sp=clamp(0.7+L*0.008,0.8,2.2);
    // quota del piano lungo il ponte: dritta fra le rive + gobba, sempre sopra il terreno
    const ys=[],ts=[];
    for(let i=0;i<=N;i++){
      const t=i/N,x=ax+p.ux*L*t,z=az+p.uz*L*t;
      ts.push(t);ys.push(Math.max(hA+(hB-hA)*t+gobba*Math.sin(Math.PI*t)+0.15,T.meshH(x,z)+0.6*Math.sin(Math.PI*t)+0.15));
    }
    const W=tipo.w/2;
    const pt=(i,lato,dy)=>[ax+p.ux*L*ts[i]+nx*lato,ys[i]+dy,az+p.uz*L*ts[i]+nz*lato];
    const su=[0,1,0],u0=[0,0];
    const piano=col.setHex(tipo.piano).clone();
    for(let i=0;i<N;i++){
      // piano stradale e sotto
      A.quad(pt(i,-W,0),pt(i+1,-W,0),pt(i+1,W,0),pt(i,W,0),u0,u0,u0,u0,piano,su);
      A.quad(pt(i,-W,-sp),pt(i+1,-W,-sp),pt(i+1,W,-sp),pt(i,W,-sp),u0,u0,u0,u0,CEM_SCURO,[0,-1,0]);
      // fianchi dell'impalcato
      for(const s of [-1,1]){
        const v=[nx*s,0,nz*s];
        A.quad(pt(i,W*s,0),pt(i+1,W*s,0),pt(i+1,W*s,-sp),pt(i,W*s,-sp),u0,u0,u0,u0,CEM,v);
        // parapetto (muretto o ringhiera piena): lato esterno, interno e cima
        const e=W*s,f=(W-0.3)*s,h=tipo.par;
        A.quad(pt(i,e,0),pt(i+1,e,0),pt(i+1,e,h),pt(i,e,h),u0,u0,u0,u0,CEM,v);
        A.quad(pt(i,f,0),pt(i+1,f,0),pt(i+1,f,h),pt(i,f,h),u0,u0,u0,u0,CEM,[-v[0],0,-v[2]]);
        A.quad(pt(i,e,h),pt(i+1,e,h),pt(i+1,f,h),pt(i,f,h),u0,u0,u0,u0,BIANCO,su);
        // linee di bordo
        for(const d of tipo.linee||[]){const a=(W-d)*s,b=(W-d-0.2)*s;
          A.quad(pt(i,a,0.03),pt(i+1,a,0.03),pt(i+1,b,0.03),pt(i,b,0.03),u0,u0,u0,u0,BIANCO,su);}
        // binari
        if(tipo.binari)for(const d of [0.75,-0.75]){const a=d*s+0.08,b=d*s-0.08;
          A.quad(pt(i,a,0.18),pt(i+1,a,0.18),pt(i+1,b,0.18),pt(i,b,0.18),u0,u0,u0,u0,FERRO,su);}
      }
      // spartitraffico
      if(tipo.centro)A.quad(pt(i,-0.4,0.6),pt(i+1,-0.4,0.6),pt(i+1,0.4,0.6),pt(i,0.4,0.6),u0,u0,u0,u0,CEM,su);
    }
    // testate alle estremità (chiudono il cassone dell'impalcato)
    for(const i of [0,N])A.quad(pt(i,-W,0),pt(i,W,0),pt(i,W,-sp),pt(i,-W,-sp),u0,u0,u0,u0,CEM,[p.ux*(i?1:-1),0,p.uz*(i?1:-1)]);
    // pile in alveo ogni ~32 m (lontane dalle spalle)
    const np=Math.floor(L/32);
    for(let k=1;k<=np;k++){
      const t=k/(np+1),x=ax+p.ux*L*t,z=az+p.uz*L*t,i=Math.min(N-1,Math.floor(t*N));
      const y=ys[i]+(ys[i+1]-ys[i])*(t*N-i)-sp,yb=T.meshH(x,z)-2;
      if(y-yb<1.5) continue;
      const lw=W*0.75,lt=0.9;
      const P=(a,b,yy)=>[x+nx*a+p.ux*b,yy,z+nz*a+p.uz*b];
      for(const [a0,b0,a1,b1,v] of [[-lw,-lt,lw,-lt,[-p.ux,0,-p.uz]],[lw,lt,-lw,lt,[p.ux,0,p.uz]],[-lw,lt,-lw,-lt,[-nx,0,-nz]],[lw,-lt,lw,lt,[nx,0,nz]]])
        A.quad(P(a0,b0,y),P(a1,b1,y),P(a1,b1,yb),P(a0,b0,yb),u0,u0,u0,u0,CEM_SCURO,v);
    }
  }

  const api={
    trova, costruisci,
    // la griglia nuova è visibile: scambia le due copie
    applica(){
      if(!pronti) return;
      const m=mesh[1-visibile];m.geometry.dispose();m.geometry=nuovi;
      visibile=1-visibile;mesh[visibile].visible=true;mesh[1-visibile].visible=false;
      elenco=pronti;pronti=nuovi=null;
    },
    elenco:()=>elenco,
  };
  SIM.debugPonti=api;   // per la console
  return api;
};
})();
