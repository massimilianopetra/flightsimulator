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
   - Aspetto: il piano ha lo stesso disegno della via dipinta (una piccola tela
     con una colonna per categoria) ed è largo quanto lei; le estremità si
     agganciano alla via dipinta; le carreggiate separate diventano un
     impalcato solo; parapetti; pile ogni 32–80 m (più rade nei viadotti alti);
     le rampe dei cavalcavia seguono la via anche in curva.
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

// per categoria: larghezza dell'impalcato (m, se manca lo stile della via), parapetto (altezza), larghezza
// della galleria (una canna)
const TIPO={
  autostrade: {w:28, par:1.1, g:12},
  superstrade:{w:21, par:1.1, g:11},
  statali:    {w:11, par:1.0, g:10},
  provinciali:{w:8.5,par:1.0, g:9},
  comunali:   {w:7,  par:0.9, g:8},
  urbane:     {w:7.5,par:1.0, g:8},
  ferrovie:   {w:8,  par:0.6, g:9.5},
};
// piano dell'impalcato: una tela con una colonna per categoria, dipinta con le stesse passate della strada
// vista da vicino (STILE_DET di paesaggio.js), così il ponte continua la strada; l'ultima colonna è bianca
// (per le parti senza disegno). PER = metri di strada per tutta l'altezza della tela (multiplo dei tratteggi)
const COLONNE=['autostrade','superstrade','statali','provinciali','comunali','urbane','ferrovie'];
const AT=512,CW=64,PER=36,BIANCA=[(7.5*CW)/AT,0.5];
const CEM=new THREE.Color(0x9a978f), CEM_SCURO=new THREE.Color(0x77746d), BIANCO=new THREE.Color(0xd9d7cf),
  BUIO=new THREE.Color(0x0b0b0c), PRATO=new THREE.Color(0x6f7d4a);
const FRANCO={strada:5.5, ferrovie:7, fiumi:2.5, canali:2.5};

SIM.creaPonti=function(scene,decodifica,stili){
  const T=SIM.terreno,V=window.VIE||{},U=V.unita||10;
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9,metalness:0,flatShading:true,map:atlante()});
  function atlante(){
    const cv=document.createElement('canvas');cv.width=cv.height=AT;
    const g=cv.getContext('2d');
    g.fillStyle='#ffffff';g.fillRect(0,0,AT,AT);
    COLONNE.forEach((cat,k)=>{
      const st=stili&&stili[cat];if(!st) return;
      const sx=CW/st[0].w,sy=AT/PER,x0=k*CW+CW/2;
      for(const p of st)for(const o of p.o||[0]){
        const w=Math.max(p.w*sx,0.8),cx=x0+o*sx;
        g.fillStyle=p.c;
        if(p.d)for(let y=0;y<AT;y+=(p.d[0]+p.d[1])*sy)g.fillRect(cx-w/2,y,w,p.d[0]*sy);
        else g.fillRect(cx-w/2,0,w,AT);
      }
    });
    const t=new THREE.CanvasTexture(cv);t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;
    return t;
  }
  // coordinate della tela sul piano: u attraverso la via (dentro la colonna della categoria), v lungo (m/PER)
  const colU=cat=>{const k=Math.max(0,COLONNE.indexOf(cat));return [(k*CW+1)/AT,((k+1)*CW-1)/AT];};
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
      // punto più vicino (entro R) di una via della categoria cat: {r, i segmento, x, z, d}
      vicina(x,z,cat,R){
        const ci=Math.floor((x-x0)/C),cj=Math.floor((z-z0)/C);let best=null;
        for(let j=cj-1;j<=cj+1;j++)for(let k=ci-1;k<=ci+1;k++){
          if(j<0||k<0||j>=NZ||k>=NX) continue;
          const l=celle.get(j*NX+k);if(!l) continue;
          for(let n=0;n<l.length;n+=2){
            const r=l[n];if(r.cat!==cat) continue;
            const s=l[n+1],ax=r.xs[s-1],az=r.zs[s-1],dx=r.xs[s]-ax,dz=r.zs[s]-az,l2=dx*dx+dz*dz||1;
            const t=clamp(((x-ax)*dx+(z-az)*dz)/l2,0,1),px=ax+t*dx,pz=az+t*dz,d=Math.hypot(px-x,pz-z);
            if(d<R&&(!best||d<best.d))best={r,i:s,x:px,z:pz,d};
          }
        }
        return best;
      },
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
      for(const u of carreggiate(datiPonti.filter(v=>!fuori(v.box,x0,z0,X1,Z1,0)))){
        lista.push(prepara(u.v.cat,u.xs,u.zs,u.v.l,cv,u.w,u.unito));
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
  // le carreggiate separate (autostrade, superstrade, statali a quattro corsie) sono vie diverse in OSM e
  // ognuna ha il suo ponte, ma dipinte si sovrappongono: due ponti paralleli della stessa categoria a meno
  // di una larghezza diventano un impalcato solo, spostato in mezzo e largo quanto le due vie dipinte
  function carreggiate(vv){
    const lung=v=>{let s=0;for(let i=1;i<v.xs.length;i++)s+=Math.hypot(v.xs[i]-v.xs[i-1],v.zs[i]-v.zs[i-1]);return s;};
    const ord=vv.map(v=>({v,L:lung(v),d:[0]})).sort((a,b)=>b.L-a.L),tenuti=[];
    for(const o of ord){
      const v=o.v,n=v.xs.length,mx=(v.xs[0]+v.xs[n-1])/2,mz=(v.zs[0]+v.zs[n-1])/2;
      const vx=v.xs[n-1]-v.xs[0],vz=v.zs[n-1]-v.zs[0],vl=Math.hypot(vx,vz)||1;
      let unito=false;
      for(const k of tenuti){
        if(k.v.cat!==v.cat||mx<k.v.box[0]-60||mx>k.v.box[1]+60||mz<k.v.box[2]-60||mz>k.v.box[3]+60) continue;
        const X=k.v.xs,Z=k.v.zs;let best=1e9,d=0,par=0;
        for(let i=1;i<X.length;i++){
          const ax=X[i-1],az=Z[i-1],dx=X[i]-ax,dz=Z[i]-az,l=Math.hypot(dx,dz)||1,t=((mx-ax)*dx+(mz-az)*dz)/(l*l);
          if(t<0||t>1) continue;
          const px=ax+t*dx,pz=az+t*dz,e=Math.hypot(mx-px,mz-pz);
          if(e<best){best=e;d=((mx-px)*-dz+(mz-pz)*dx)/l;par=Math.abs((dx*vz-dz*vx)/(l*vl));}
        }
        if(best<wPonte(v.cat)*1.1&&par<0.3){k.d.push(d);unito=true;break;}
      }
      if(!unito)tenuti.push(o);
    }
    return tenuti.map(k=>{
      const dmin=Math.min(...k.d),dmax=Math.max(...k.d),sp=(dmin+dmax)/2,X=k.v.xs,Z=k.v.zs,N=X.length;
      if(k.d.length===1) return {v:k.v,xs:X,zs:Z,w:wPonte(k.v.cat),unito:false};
      const xs=[],zs=[];
      for(let i=0;i<N;i++){
        const a=Math.max(0,i-1),b=Math.min(N-1,i+1),dx=X[b]-X[a],dz=Z[b]-Z[a],l=Math.hypot(dx,dz)||1;
        xs.push(X[i]-dz/l*sp);zs.push(Z[i]+dx/l*sp);
      }
      return {v:k.v,xs,zs,w:wPonte(k.v.cat)+(dmax-dmin),unito:true};
    });
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
    for(const o of out){lista.push(prepara(o.cat,o.xs,o.zs,1,cv));if(lista.length%40===0)yield;}
    return lista;
  }
  const wPonte=cat=>stili&&stili[cat]?stili[cat][0].w:TIPO[cat].w;   // larga quanto la via dipinta
  // metri della via r che stanno a meno di R dal tracciato X, Z (campioni ogni 5 m, solo vicino al ponte)
  function lungoIlPonte(r,X,Z,R){
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    for(let i=0;i<X.length;i++){x0=Math.min(x0,X[i]);x1=Math.max(x1,X[i]);z0=Math.min(z0,Z[i]);z1=Math.max(z1,Z[i]);}
    const vicino=(x,z)=>{
      for(let i=1;i<X.length;i++){
        const ax=X[i-1],az=Z[i-1],dx=X[i]-ax,dz=Z[i]-az,l2=dx*dx+dz*dz||1,t=clamp(((x-ax)*dx+(z-az)*dz)/l2,0,1);
        if(Math.hypot(ax+t*dx-x,az+t*dz-z)<R) return true;
      }
      return false;
    };
    let m=0;
    for(let i=1;i<r.xs.length;i++){
      const ax=r.xs[i-1],az=r.zs[i-1],dx=r.xs[i]-ax,dz=r.zs[i]-az;
      if(Math.max(ax,ax+dx)<x0-R||Math.min(ax,ax+dx)>x1+R||Math.max(az,az+dz)<z0-R||Math.min(az,az+dz)>z1+R) continue;
      const l=Math.hypot(dx,dz),n=Math.max(1,Math.ceil(l/5));
      for(let k=0;k<n;k++)if(vicino(ax+dx*(k+0.5)/n,az+dz*(k+0.5)/n))m+=l/n;
    }
    return m;
  }

  /* ---------- un ponte: tracciato ricampionato, cosa passa sotto, profilo ---------- */
  function prepara(cat,X,Z,livello,cv,w,unito){
    w=w||wPonte(cat);
    // punti ogni ≤ 25 m (il profilo è dolce; le curve hanno già i loro punti)
    const xs=[X[0]],zs=[Z[0]];
    for(let i=1;i<X.length;i++){
      const dx=X[i]-X[i-1],dz=Z[i]-Z[i-1],n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/25));
      for(let k=1;k<=n;k++){xs.push(X[i-1]+dx*k/n);zs.push(Z[i-1]+dz*k/n);}
    }
    const N=xs.length,s=[0];
    // estremità agganciate alla via dipinta (le due semplificazioni dello stesso tracciato differiscono di
    // qualche metro): si sposta l'estremità sul punto più vicino e il resto si raccorda in 40 m
    const aggancio=[null,null];
    for(const e of [0,1]){
      const i=e?N-1:0,a=cv.vicina(xs[i],zs[i],cat,10);
      if(!a) continue;
      aggancio[e]=a;
      if(unito) continue;   // impalcato già spostato in mezzo alle carreggiate
      const dx=a.x-xs[i],dz=a.z-zs[i];
      let d=0;
      for(let k=0;k<N;k++){
        const j=e?N-1-k:k;
        if(k)d+=Math.hypot(xs[j]-xs[e?j+1:j-1],zs[j]-zs[e?j+1:j-1]);
        const f=1-d/40;if(f<=0) break;
        xs[j]+=dx*f;zs[j]+=dz*f;
      }
    }
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
        req.push([sc,f+(livello-1)*6,X[i-1]+t*(X[i]-X[i-1]),Z[i-1]+t*(Z[i]-Z[i-1]),r]);
      });
    }
    // la via stessa (o l'altra carreggiata) si incrocia col ponte nelle curve, perché linea dipinta e
    // tracciato del ponte sono semplificati in modo diverso: se una via della stessa categoria corre
    // lungo il ponte per più di 60 m non passa sotto, è il ponte (sennò si ridipingerebbe sotto il viadotto)
    for(const r of [...sotto])if(r.cat===cat&&lungoIlPonte(r,X,Z,w/2+10)>60)sotto.delete(r);
    for(let k=req.length-1;k>=0;k--)if(!sotto.has(req[k][4]))req.splice(k,1);
    // profilo: dritto fra le estremità + gobba; E = rilevato (rampe) se la gobba non basta per il franco
    const hA=T.meshH(xs[0],zs[0]),hB=T.meshH(xs[N-1],zs[N-1]),retta=sc=>hA+(hB-hA)*sc/L;
    const gobba=req.length?clamp(L*0.035,0.6,4.5):clamp(L*0.02,0.3,1.5);
    // alzata locale attorno a ogni incrocio: piena per 15 m, poi scende al 5% (nei viadotti lunghi resta una
    // gobba sopra la via scavalcata); se all'estremità rimane qualcosa, lì si fa la rampa in rilevato (Ea, Eb)
    const base=sc=>retta(sc)+gobba*Math.sin(Math.PI*sc/L)**2;   // al quadrato: parte in piano dalle estremità
    const alz=req.map(([sc,f,x,z])=>[sc,Math.min(livello>1?14:9,T.meshH(x,z)+f-base(sc))]).filter(a=>a[1]>0);
    const alzata=sc=>{let m=0;for(const [c,h] of alz)m=Math.max(m,h-0.05*Math.max(0,Math.abs(sc-c)-15));return m;};
    const ys=s.map((sc,i)=>Math.max(base(sc)+alzata(sc),T.meshH(xs[i],zs[i])+0.6*Math.sin(Math.PI*sc/L))+0.15);
    return {cat,xs,zs,s,ys,L,Ea:alzata(0),Eb:alzata(L),w,aggancio,sotto:[...sotto],x:xs[N>>1],z:zs[N>>1]};
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
  const u0=BIANCA,SU=[0,1,0];
  function impalcato(A,p,col){
    const tipo=TIPO[p.cat],N=p.xs.length,W=p.w/2,sp=clamp(0.7+p.L*0.008,0.8,2.2);
    // direzione e lato in ogni punto
    const tx=[],tz=[];
    for(let i=0;i<N;i++){
      const a=Math.max(0,i-1),b=Math.min(N-1,i+1),dx=p.xs[b]-p.xs[a],dz=p.zs[b]-p.zs[a],l=Math.hypot(dx,dz)||1;
      tx.push(dx/l);tz.push(dz/l);
    }
    const pt=(i,lato,dy)=>[p.xs[i]-tz[i]*lato,p.ys[i]+dy,p.zs[i]+tx[i]*lato];
    // piano: bianco nei vertici, il disegno della via viene dalla tela (u attraverso, v lungo)
    const [ua,ub]=colU(p.cat),v=i=>p.s[i]/PER,BI=col.setRGB(1,1,1).clone();
    for(let i=0;i<N-1;i++){
      A.quad(pt(i,-W,0),pt(i+1,-W,0),pt(i+1,W,0),pt(i,W,0),[ua,v(i)],[ua,v(i+1)],[ub,v(i+1)],[ub,v(i)],BI,SU);
      A.quad(pt(i,-W,-sp),pt(i+1,-W,-sp),pt(i+1,W,-sp),pt(i,W,-sp),u0,u0,u0,u0,CEM_SCURO,[0,-1,0]);
      for(const s of [-1,1]){
        // fianco dell'impalcato e parapetto in un pezzo solo (il lato interno del parapetto non si vede dall'aereo)
        const vs=[-tz[i]*s,0,tx[i]*s],e=W*s,f=(W-0.35)*s,h=tipo.par;
        A.quad(pt(i,e,-sp),pt(i+1,e,-sp),pt(i+1,e,h),pt(i,e,h),u0,u0,u0,u0,CEM,vs);
        A.quad(pt(i,e,h),pt(i+1,e,h),pt(i+1,f,h),pt(i,f,h),u0,u0,u0,u0,BIANCO,SU);
      }
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
    // rampe in rilevato prima e dopo i cavalcavia: seguono la via dipinta (anche in curva), scendono dritte
    // se la via non c'è; piano col disegno della via, scarpate erbose a 1:1,5
    for(const [e,i,E] of [[0,0,p.Ea],[1,N-1,p.Eb]]){
      if(E<0.4) continue;
      const lr=Math.min(170,E/0.055),ox=-tx[i]*(e?-1:1),oz=-tz[i]*(e?-1:1);   // verso fuori dal ponte
      const via=cammina(p.aggancio[e],p.xs[i],p.zs[i],ox,oz,lr,15);
      const n=via.length,cima=[],piede=[[],[]],fuoriL=j=>W+E*(1-via[j].d/lr)*1.5;
      const rx=[],rz=[];
      for(let j=0;j<n;j++){
        const a=Math.max(0,j-1),b=Math.min(n-1,j+1),dx=via[b].x-via[a].x,dz=via[b].z-via[a].z,l=Math.hypot(dx,dz)||1;
        rx.push(-dz/l);rz.push(dx/l);
        cima.push(p.ys[i]+(T.meshH(via[j].x,via[j].z)+0.15-p.ys[i])*via[j].d/lr);
        for(const s of [0,1]){const L=fuoriL(j)*(s?1:-1);piede[s].push(Math.min(cima[j]-0.2,T.meshH(via[j].x+rx[j]*L,via[j].z+rz[j]*L)-0.3));}
      }
      const P=(j,lato,y)=>[via[j].x+rx[j]*lato,y,via[j].z+rz[j]*lato];
      // il lato "sinistro" della rampa deve stare sullo stesso lato del ponte (stesso verso della tela)
      const sg=(rx[0]*-tz[i]+rz[0]*tx[i])>0?1:-1,vr=j=>-via[j].d/PER*(e?-1:1)+p.s[i]/PER;
      // spalla: il muro di cemento che chiude il rilevato dove comincia il ponte
      A.quad(P(0,-fuoriL(0),piede[0][0]),P(0,-W,cima[0]),P(0,W,cima[0]),P(0,fuoriL(0),piede[1][0]),u0,u0,u0,u0,CEM,[-ox,0,-oz]);
      for(let j=0;j<n-1;j++){
        A.quad(P(j,-W*sg,cima[j]),P(j+1,-W*sg,cima[j+1]),P(j+1,W*sg,cima[j+1]),P(j,W*sg,cima[j]),[ua,vr(j)],[ua,vr(j+1)],[ub,vr(j+1)],[ub,vr(j)],BI,SU);
        for(const s of [-1,1]){const k=s>0?1:0;
          A.quad(P(j,W*s,cima[j]),P(j+1,W*s,cima[j+1]),P(j+1,fuoriL(j+1)*s,piede[k][j+1]),P(j,fuoriL(j)*s,piede[k][j]),u0,u0,u0,u0,PRATO,[rx[j]*s,1,rz[j]*s]);}
      }
    }
  }
  // punti (ogni passo m, fino a lung m) lungo la via agganciata, partendo da (x, z) verso (ox, oz);
  // senza via agganciata: dritto. Ogni punto: {x, z, d distanza percorsa}
  function cammina(ag,x,z,ox,oz,lung,passo){
    const out=[{x,z,d:0}];
    if(!ag){for(let d=passo;d<lung+passo-0.01;d+=passo){const dd=Math.min(d,lung);out.push({x:x+ox*dd,z:z+oz*dd,d:dd});}return out;}
    const r=ag.r,dx=r.xs[ag.i]-r.xs[ag.i-1],dz=r.zs[ag.i]-r.zs[ag.i-1];
    const avanti=dx*ox+dz*oz>=0;              // si cammina verso i punti successivi o precedenti della via
    let k=avanti?ag.i:ag.i-1,px=ag.x,pz=ag.z,fatto=0,prossimo=passo;
    while(fatto<lung&&k>=0&&k<r.xs.length){
      const qx=r.xs[k],qz=r.zs[k],l=Math.hypot(qx-px,qz-pz);
      if(l>0.5&&((qx-px)*ox+(qz-pz)*oz)/l<0.77) break;   // la via svolta (incrocio): la rampa prosegue dritta
      while(fatto+l>=prossimo&&prossimo<=lung){const f=(prossimo-fatto)/(l||1);out.push({x:px+(qx-px)*f,z:pz+(qz-pz)*f,d:prossimo});prossimo+=passo;}
      fatto+=l;px=qx;pz=qz;k+=avanti?1:-1;
    }
    if(out[out.length-1].d<lung){   // la via finisce prima: si prosegue dritti
      const a=out[out.length-1],b=out.length>1?out[out.length-2]:{x:x-ox,z:z-oz},l=Math.hypot(a.x-b.x,a.z-b.z)||1;
      for(let d=a.d+passo;d<lung+passo-0.01;d+=passo){const dd=Math.min(d,lung)-a.d;out.push({x:a.x+(a.x-b.x)/l*dd,z:a.z+(a.z-b.z)/l*dd,d:a.d+dd});}
    }
    return out;
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
