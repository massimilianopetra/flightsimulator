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
   PONTI, VIADOTTI, CAVALCAVIA E GALLERIE.
   - Ponti: i tratti su ponte di OpenStreetMap (window.VIE.ponti, livello l)
     diventano impalcati 3D che seguono il tracciato. Se i dati non li hanno
     (versione vecchia di piemonte-vie.js) si cercano gli incroci fra vie e
     fiumi mentre il gioco gira.
   - Profilo: dritto fra le quote del terreno alle estremità (così i viadotti
     restano alti sopra le valli) + una gobba; sopra un'altra strada o una
     ferrovia (cavalcavia) l'impalcato sale al franco giusto (5,5 m sopra una
     strada, 7 m sopra una ferrovia, +6 m per ogni livello in più) e, se non
     basta la gobba, si aggiungono le rampe in rilevato prima e dopo.
   - Aspetto secondo la via: larghezza, asfalto o massicciata, parapetti,
     binari, spartitraffico; pile ogni 32–80 m (più rade nei viadotti alti).
   - Gallerie (window.VIE.gallerie): le vie in galleria non sono dipinte sul
     terreno; agli imbocchi c'è un portale di cemento con la bocca scura.
   Tutto sta in una sola geometria (due copie, scambiate insieme alla
   griglia vicina da js/paesaggio.js). paesaggio.js, sotto ogni impalcato,
   cancella la via dipinta e ridipinge quello che passa sotto (fiume, strada).
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// per categoria: larghezza dell'impalcato (m), colore del piano, parapetto (altezza), larghezza della
// galleria (una canna)
const TIPO={
  autostrade: {w:28, piano:0x4a4a4c, par:1.1, centro:true, g:12},
  superstrade:{w:21, piano:0x4d4d4f, par:1.1, centro:true, g:11},
  statali:    {w:11, piano:0x525153, par:1.0, g:10},
  provinciali:{w:8.5,piano:0x58575a, par:1.0, g:9},
  comunali:   {w:7,  piano:0x646260, par:0.9, g:8},
  urbane:     {w:7.5,piano:0x5a5957, par:1.0, g:8},
  ferrovie:   {w:8,  piano:0x6e655a, par:0.6, binari:true, g:9.5},
};
// le carreggiate separate delle strade a due corsie per senso sono ognuna una via in OSM: sui ponti di
// autostrade e superstrade l'impalcato è largo una carreggiata (la via dipinta copre già le due)
const W_PONTE={autostrade:14, superstrade:11};
const CEM=new THREE.Color(0x9a978f), CEM_SCURO=new THREE.Color(0x77746d), BIANCO=new THREE.Color(0xd9d7cf),
  FERRO=new THREE.Color(0x3a3634), BUIO=new THREE.Color(0x0b0b0c), PRATO=new THREE.Color(0x6f7d4a);
const FRANCO={strada:5.5, ferrovie:7, fiumi:2.5, canali:2.5};

SIM.creaPonti=function(scene,decodifica){
  const T=SIM.terreno,V=window.VIE||{},U=V.unita||10;
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9,metalness:0,flatShading:true});
  const mesh=[0,1].map(()=>{const m=new THREE.Mesh(new THREE.BufferGeometry(),mat);m.visible=false;m.frustumCulled=false;scene.add(m);return m;});
  let visibile=0,nuovi=null,pronti=null,imbPronti=null,imbocchi=[];
  let elenco=[];   // ponti della griglia visibile (paesaggio.js ci ridipinge sotto nell'immagine da vicino)

  // dati: tratti su ponte e in galleria
  const leggi=gruppo=>{const out=[];for(const cat in gruppo||{}){if(!TIPO[cat])continue;
    for(const l of gruppo[cat]){const v=decodifica(l.p,U);v.cat=cat;v.l=l.l||1;out.push(v);}}return out;};
  const datiPonti=V.ponti?leggi(V.ponti):null, datiGallerie=leggi(V.gallerie);
  const fuori=(b,x0,z0,X1,Z1,m)=>b[1]<x0-m||b[0]>X1+m||b[3]<z0-m||b[2]>Z1+m;

  /* ---------- ricerca ---------- */
  // tutti i segmenti delle vie della zona in celle di C m (per gli incroci)
  function* celleVie(linee,x0,z0,X1,Z1){
    const C=128,NX=Math.ceil((X1-x0)/C)+1,NZ=Math.ceil((Z1-z0)/C)+1,celle=new Map();let q=0;
    for(const v of linee){
      if(fuori(v.box,x0,z0,X1,Z1,50)) continue;
      if(++q%3000===0) yield;
      for(let i=1;i<v.xs.length;i++){
        const i0=Math.max(0,Math.floor((Math.min(v.xs[i-1],v.xs[i])-x0)/C)),i1=Math.min(NX-1,Math.floor((Math.max(v.xs[i-1],v.xs[i])-x0)/C));
        const j0=Math.max(0,Math.floor((Math.min(v.zs[i-1],v.zs[i])-z0)/C)),j1=Math.min(NZ-1,Math.floor((Math.max(v.zs[i-1],v.zs[i])-z0)/C));
        for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){const c=j*NX+k;let l=celle.get(c);if(!l)celle.set(c,l=[]);l.push(v,i);}
      }
    }
    return {
      // incroci del segmento a-b con le altre vie: chiama f(via, t sul segmento, u sulla via, seno dell'angolo)
      incroci(ax,az,bx,bz,f){
        const visti=new Set();
        const i0=Math.max(0,Math.floor((Math.min(ax,bx)-x0)/C)),i1=Math.min(NX-1,Math.floor((Math.max(ax,bx)-x0)/C));
        const j0=Math.max(0,Math.floor((Math.min(az,bz)-z0)/C)),j1=Math.min(NZ-1,Math.floor((Math.max(az,bz)-z0)/C));
        const ex=bx-ax,ez=bz-az,le=Math.hypot(ex,ez)||1;
        for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){
          const l=celle.get(j*NX+k);if(!l) continue;
          for(let n=0;n<l.length;n+=2){
            const r=l[n],s=l[n+1],cx=r.xs[s-1],cz=r.zs[s-1],dx=r.xs[s]-cx,dz=r.zs[s]-cz;
            const den=ex*dz-ez*dx;if(Math.abs(den)<1e-6) continue;
            const t=((cx-ax)*dz-(cz-az)*dx)/den,u=((cx-ax)*ez-(cz-az)*ex)/den;
            if(t<0||t>1||u<0||u>1) continue;
            const id=r.xs.length*7919+s;if(visti.has(r)&&visti.has(id)) continue;visti.add(r);visti.add(id);
            f(r,t,u,Math.abs(den)/(le*(Math.hypot(dx,dz)||1)));
          }
        }
      }};
  }
  function* trova(linee,x0,z0,X1,Z1){
    const cv=yield* celleVie(linee,x0,z0,X1,Z1);
    yield;
    let lista=[];
    if(datiPonti){
      let q=0;
      for(const v of datiPonti){
        if(fuori(v.box,x0,z0,X1,Z1,0)) continue;
        lista.push(prepara(v.cat,v.xs,v.zs,v.l,cv));
        if(++q%40===0) yield;
      }
    }else lista=yield* incrociFiumi(linee,x0,z0,X1,Z1);
    const imbocchi=[];
    for(const v of datiGallerie){
      if(fuori(v.box,x0,z0,X1,Z1,0)) continue;
      const n=v.xs.length;
      for(const m of [{cat:v.cat,x:v.xs[0],z:v.zs[0],dx:v.xs[1]-v.xs[0],dz:v.zs[1]-v.zs[0]},
                      {cat:v.cat,x:v.xs[n-1],z:v.zs[n-1],dx:v.xs[n-2]-v.xs[n-1],dz:v.zs[n-2]-v.zs[n-1]}])
        if(inMontagna(m))imbocchi.push(m);
    }
    return {ponti:lista,imbocchi};
  }
  // il portale si fa solo se il terreno sale sopra la galleria (in pianura un sottopasso non ha una
  // collina sopra: un portale lì sembrerebbe un garage in mezzo al prato)
  function inMontagna(m){
    const l=Math.hypot(m.dx,m.dz)||1,h=T.meshH(m.x,m.z);
    return Math.max(T.meshH(m.x+m.dx/l*25,m.z+m.dz/l*25),T.meshH(m.x+m.dx/l*50,m.z+m.dz/l*50))-h>5;
  }
  // senza dati: ponte dove una via incrocia un fiume o un canale (lunghezza dalla larghezza del greto)
  function* incrociFiumi(linee,x0,z0,X1,Z1){
    const acque=linee.filter(v=>(v.cat==='fiumi'||v.cat==='canali')&&!fuori(v.box,x0,z0,X1,Z1,200));
    if(!acque.length) return [];
    const cv=yield* celleVie(acque,x0,z0,X1,Z1);
    const out=[];let q=0;
    for(const v of linee){
      if(!TIPO[v.cat]||fuori(v.box,x0,z0,X1,Z1,0)) continue;
      if(++q%1500===0) yield;
      for(let i=1;i<v.xs.length;i++){
        const ax=v.xs[i-1],az=v.zs[i-1],bx=v.xs[i],bz=v.zs[i],ex=bx-ax,ez=bz-az,le=Math.hypot(ex,ez)||1,ux=ex/le,uz=ez/le;
        cv.incroci(ax,az,bx,bz,(r,t,u,seno)=>{
          const px=ax+t*ex,pz=az+t*ez;
          if(px<x0||px>X1||pz<z0||pz>Z1) return;
          seno=Math.max(0.35,seno);
          const mezza=r.ing/seno+wPonte(v.cat)*0.5*Math.sqrt(1-seno*seno)/seno+5;
          if(out.some(o=>Math.hypot(o.x-px,o.z-pz)<wPonte(v.cat)+4)) return;   // carreggiate vicine: un ponte solo
          out.push({x:px,z:pz,xs:[px-ux*mezza,px+ux*mezza],zs:[pz-uz*mezza,pz+uz*mezza],cat:v.cat});
        });
      }
    }
    const lista=[];
    for(const o of out){lista.push(prepara(o.cat,o.xs,o.zs,1,cv,linee));if(lista.length%40===0)yield;}
    return lista;
  }
  const wPonte=cat=>W_PONTE[cat]||TIPO[cat].w;

  /* ---------- un ponte: tracciato ricampionato, cosa passa sotto, profilo ---------- */
  function prepara(cat,X,Z,livello,cv){
    // punti ogni ≤ 25 m (il profilo è dolce; le curve hanno già i loro punti)
    const xs=[X[0]],zs=[Z[0]];
    for(let i=1;i<X.length;i++){
      const dx=X[i]-X[i-1],dz=Z[i]-Z[i-1],n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/25));
      for(let k=1;k<=n;k++){xs.push(X[i-1]+dx*k/n);zs.push(Z[i-1]+dz*k/n);}
    }
    const N=xs.length,s=[0];
    for(let i=1;i<N;i++)s.push(s[i-1]+Math.hypot(xs[i]-xs[i-1],zs[i]-zs[i-1]));
    const L=s[N-1]||1;
    // cosa passa sotto (vie quasi parallele e incroci alle estremità no: sono la via stessa o i suoi raccordi)
    const sotto=new Set(),req=[];
    for(let i=1;i<X.length;i++){
      let s0=0;for(let k=1;k<i;k++)s0+=Math.hypot(X[k]-X[k-1],Z[k]-Z[k-1]);
      const ls=Math.hypot(X[i]-X[i-1],Z[i]-Z[i-1]);
      cv.incroci(X[i-1],Z[i-1],X[i],Z[i],(r,t,u,seno)=>{
        const sc=s0+t*ls;
        if(seno<0.25||sc<4||sc>L-4) return;
        sotto.add(r);
        const f=r.cat==='fiumi'||r.cat==='canali'?FRANCO[r.cat]:r.cat==='ferrovie'?FRANCO.ferrovie:FRANCO.strada;
        req.push([sc,f+(livello-1)*6,X[i-1]+t*(X[i]-X[i-1]),Z[i-1]+t*(Z[i]-Z[i-1])]);
      });
    }
    // profilo: dritto fra le estremità + gobba; E = rilevato (rampe) se la gobba non basta per il franco
    const hA=T.meshH(xs[0],zs[0]),hB=T.meshH(xs[N-1],zs[N-1]),retta=sc=>hA+(hB-hA)*sc/L;
    const gobba=req.length?clamp(L*0.035,0.6,4.5):clamp(L*0.02,0.3,1.5);
    let E=0;
    for(const [sc,f,x,z] of req)E=Math.max(E,T.meshH(x,z)+f-retta(sc)-gobba*Math.sin(Math.PI*sc/L));
    E=Math.min(E,(livello>1?14:9));
    const ys=s.map((sc,i)=>{
      const y=retta(sc)+E+gobba*Math.sin(Math.PI*sc/L);
      return Math.max(y,T.meshH(xs[i],zs[i])+0.6*Math.sin(Math.PI*sc/L))+0.15;
    });
    return {cat,xs,zs,s,ys,L,E,w:wPonte(cat),sotto:[...sotto],x:xs[N>>1],z:zs[N>>1]};
  }

  /* ---------- geometria ---------- */
  function* costruisci(r){
    const A=new SIM.Acc(),c=new THREE.Color();
    let q=0;
    // a pezzi di ~5000 triangoli, per non fermare il fotogramma
    const passo=()=>{if(A.p.length-q>45000){q=A.p.length;return true;}return false;};
    for(const p of r.ponti){impalcato(A,p,c);if(passo())yield;}
    for(const m of r.imbocchi){imbocco(A,m);if(passo())yield;}
    nuovi=A.geometria();
    pronti=r.ponti;imbPronti=r.imbocchi;
  }
  const u0=[0,0],SU=[0,1,0];
  function impalcato(A,p,col){
    const tipo=TIPO[p.cat],N=p.xs.length,W=p.w/2,sp=clamp(0.7+p.L*0.008,0.8,2.2);
    // direzione e lato in ogni punto
    const tx=[],tz=[];
    for(let i=0;i<N;i++){
      const a=Math.max(0,i-1),b=Math.min(N-1,i+1),dx=p.xs[b]-p.xs[a],dz=p.zs[b]-p.zs[a],l=Math.hypot(dx,dz)||1;
      tx.push(dx/l);tz.push(dz/l);
    }
    const pt=(i,lato,dy)=>[p.xs[i]-tz[i]*lato,p.ys[i]+dy,p.zs[i]+tx[i]*lato];
    const piano=col.setHex(tipo.piano).clone();
    for(let i=0;i<N-1;i++){
      A.quad(pt(i,-W,0),pt(i+1,-W,0),pt(i+1,W,0),pt(i,W,0),u0,u0,u0,u0,piano,SU);
      A.quad(pt(i,-W,-sp),pt(i+1,-W,-sp),pt(i+1,W,-sp),pt(i,W,-sp),u0,u0,u0,u0,CEM_SCURO,[0,-1,0]);
      for(const s of [-1,1]){
        // fianco dell'impalcato e parapetto in un pezzo solo (il lato interno del parapetto non si vede dall'aereo)
        const v=[-tz[i]*s,0,tx[i]*s],e=W*s,f=(W-0.35)*s,h=tipo.par;
        A.quad(pt(i,e,-sp),pt(i+1,e,-sp),pt(i+1,e,h),pt(i,e,h),u0,u0,u0,u0,CEM,v);
        A.quad(pt(i,e,h),pt(i+1,e,h),pt(i+1,f,h),pt(i,f,h),u0,u0,u0,u0,BIANCO,SU);
        if(tipo.binari)for(const d of [0.75,-0.75]){const a=d*s+0.08,b=d*s-0.08;
          A.quad(pt(i,a,0.18),pt(i+1,a,0.18),pt(i+1,b,0.18),pt(i,b,0.18),u0,u0,u0,u0,FERRO,SU);}
      }
      if(tipo.centro&&!W_PONTE[p.cat])A.quad(pt(i,-0.4,0.6),pt(i+1,-0.4,0.6),pt(i+1,0.4,0.6),pt(i,0.4,0.6),u0,u0,u0,u0,CEM,SU);
    }
    // testate
    for(const i of [0,N-1]){const k=i?1:-1;
      A.quad(pt(i,-W,0),pt(i,W,0),pt(i,W,-sp),pt(i,-W,-sp),u0,u0,u0,u0,CEM,[tx[i]*k,0,tz[i]*k]);}
    // pile ogni ~32 m, più rade e più grosse nei viadotti alti, fino a 2 m sotto il terreno
    let alto=0;for(let i=0;i<N;i++)alto=Math.max(alto,p.ys[i]-T.meshH(p.xs[i],p.zs[i]));
    const np=Math.floor(p.L/clamp(32+alto*0.7,32,80));
    for(let k=1;k<=np;k++){
      const sc=p.L*k/(np+1);let i=0;while(i<N-2&&p.s[i+1]<sc)i++;
      const f=(sc-p.s[i])/((p.s[i+1]-p.s[i])||1);
      const x=p.xs[i]+(p.xs[i+1]-p.xs[i])*f,z=p.zs[i]+(p.zs[i+1]-p.zs[i])*f;
      const y=p.ys[i]+(p.ys[i+1]-p.ys[i])*f-sp,yb=T.meshH(x,z)-2;
      if(y-yb<3.5) continue;
      pila(A,x,z,tx[i],tz[i],W*0.7,0.9+(y-yb)*0.025,y,yb,CEM_SCURO);
    }
    // rampe in rilevato prima e dopo i cavalcavia
    if(p.E>0.4)for(const [i,k] of [[0,-1],[N-1,1]]){
      const lr=Math.min(170,p.E/0.055),n=Math.max(2,Math.ceil(lr/15));
      const dx=tx[i]*k,dz=tz[i]*k,lx=-tz[i],lz=tx[i];
      // quote calcolate una volta per sezione (vicino agli aeroporti meshH è lento): asse, piedi delle scarpate
      const cima=[],piede=[[],[]],fuoriL=jj=>W+p.E*(1-jj/n)*1.5;   // scarpata a 1:1,5
      for(let jj=0;jj<=n;jj++){
        const d=lr*jj/n,x=p.xs[i]+dx*d,z=p.zs[i]+dz*d;
        cima.push(p.ys[i]+(T.meshH(x,z)-p.ys[i])*jj/n);
        for(const s of [0,1])piede[s].push(T.meshH(x+lx*fuoriL(jj)*(s?1:-1),z+lz*fuoriL(jj)*(s?1:-1))-0.3);
      }
      const P=(jj,lato,y)=>{const d=lr*jj/n;return [p.xs[i]+dx*d+lx*lato,y,p.zs[i]+dz*d+lz*lato];};
      for(let j=0;j<n;j++){
        A.quad(P(j,-W,cima[j]),P(j+1,-W,cima[j+1]),P(j+1,W,cima[j+1]),P(j,W,cima[j]),u0,u0,u0,u0,piano,SU);
        for(const s of [-1,1]){const k=s>0?1:0;
          A.quad(P(j,W*s,cima[j]),P(j+1,W*s,cima[j+1]),P(j+1,fuoriL(j+1)*s,piede[k][j+1]),P(j,fuoriL(j)*s,piede[k][j]),u0,u0,u0,u0,PRATO,[lx*s,1,lz*s]);}
      }
    }
  }
  function pila(A,x,z,tx,tz,lw,lt,y,yb,col){
    const P=(a,b,yy)=>[x-tz*a+tx*b,yy,z+tx*a+tz*b];
    for(const [a0,b0,a1,b1,v] of [[-lw,-lt,lw,-lt,[-tx,0,-tz]],[lw,lt,-lw,lt,[tx,0,tz]],[-lw,lt,-lw,-lt,[tz,0,-tx]],[lw,-lt,lw,lt,[-tz,0,tx]]])
      A.quad(P(a0,b0,y),P(a1,b1,y),P(a1,b1,yb),P(a0,b0,yb),u0,u0,u0,u0,col,v);
  }
  // imbocco di una galleria: portale di cemento verso fuori, bocca scura, un pezzo di canna buia dentro
  function imbocco(A,m){
    const tipo=TIPO[m.cat],l=Math.hypot(m.dx,m.dz)||1,dx=m.dx/l,dz=m.dz/l,lx=-dz,lz=dx;   // d = verso dentro
    const W=tipo.g/2,H=m.cat==='ferrovie'?7.5:6.5,F=W+2.5,HF=H+2.5;
    const y0=T.meshH(m.x,m.z)-0.3;
    const P=(lato,y,av)=>[m.x+lx*lato+dx*av,y0+y,m.z+lz*lato+dz*av];
    const fuori=[-dx,0,-dz];
    // facciata (cornice attorno alla bocca) e il suo spessore
    A.quad(P(-F,0,0),P(-W,0,0),P(-W,HF,0),P(-F,HF,0),u0,u0,u0,u0,CEM,fuori);
    A.quad(P(W,0,0),P(F,0,0),P(F,HF,0),P(W,HF,0),u0,u0,u0,u0,CEM,fuori);
    A.quad(P(-W,H,0),P(W,H,0),P(W,HF,0),P(-W,HF,0),u0,u0,u0,u0,CEM,fuori);
    // canna: pareti, volta e fondo scuri per qualche metro (dall'alto la copre il tetto del portale)
    const LC=6;
    A.quad(P(-F,HF,0),P(F,HF,0),P(F,HF,LC),P(-F,HF,LC),u0,u0,u0,u0,CEM,SU);
    for(const s of [-1,1])A.quad(P(F*s,0,0),P(F*s,HF,0),P(F*s,HF,LC),P(F*s,0,LC),u0,u0,u0,u0,CEM_SCURO,[lx*s,0,lz*s]);
    for(const s of [-1,1])A.quad(P(W*s,0,0),P(W*s,H,0),P(W*s,H,LC),P(W*s,0,LC),u0,u0,u0,u0,BUIO,[-lx*s,0,-lz*s]);
    A.quad(P(-W,H,0),P(W,H,0),P(W,H,LC),P(-W,H,LC),u0,u0,u0,u0,BUIO,[0,-1,0]);
    A.quad(P(-W,0,LC),P(W,0,LC),P(W,H,LC),P(-W,H,LC),u0,u0,u0,u0,BUIO,fuori);
    // muri d'ala ai lati della strada, che si abbassano verso fuori
    for(const s of [-1,1])A.quad(P(F*s,0,0),P(F*s,HF,0),P((F+1)*s,0.5,-12),P((F+1)*s,0,-12),u0,u0,u0,u0,CEM,[lx*s,0,lz*s]);
  }

  const api={
    trova, costruisci,
    // la griglia nuova è visibile: scambia le due copie
    applica(){
      if(!pronti) return;
      const m=mesh[1-visibile];m.geometry.dispose();m.geometry=nuovi;
      visibile=1-visibile;mesh[visibile].visible=true;mesh[1-visibile].visible=false;
      elenco=pronti;imbocchi=imbPronti;pronti=nuovi=imbPronti=null;
    },
    elenco:()=>elenco,
    imbocchi:()=>imbocchi,
  };
  SIM.debugPonti=api;   // per la console
  return api;
};
})();
