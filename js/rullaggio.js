/* =====================================================================
   VIE DI RULLAGGIO VERE (solo mondo reale, dati da OpenStreetMap in
   dati/piemonte-rullaggio.js; gli aeroporti senza dati usano il piazzale
   generico di js/mondo.js).
   - rete: le vie diventano un grafo (i punti in comune sono gli incroci) e
     si cerca il percorso più breve (Dijkstra) dal parcheggio al punto attesa
     della pista scelta;
   - punto attesa: lungo la via che entra in pista vicino alla testata, a
     ~45 m dal bordo pista; se nessuna via arriva vicino alla testata si entra
     dove si può e si risale la pista (backtrack);
   - disegno: strisce d'asfalto con linea gialla centrale, piazzali, linee del
     punto attesa; zone libere da case e alberi; luci blu di notte (js/notte.js).
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};

SIM.creaReteRullaggio=function(T){
  const R=window.RULLAGGIO;
  if(!R) return null;
  const reti=new Map();
  for(const ap of T.aeroporti){
    const d=R[ap.codice];if(!d||!d.vie.length) continue;
    const p0=ap.piste[0], largh=p0.L>=2000?18:p0.L>=1200?15:10;
    const conv=a=>{const o=[];for(let i=0;i<a.length;i+=2)o.push({x:ap.x+a[i]/10,z:ap.z-a[i+1]/10});return o;};
    const vie=d.vie.map(v=>({ref:/^[A-Z]{1,2}\d?$/.test(v.ref)?v.ref:'',w:v.l>0?Math.min(40,v.l):largh,pts:conv(v.p)}));
    const piazzali=d.piazzali.map(conv);
    // grafo: nodi uniti se coincidono (mezzo metro), archi lungo le vie
    const nodi=[],chiave=new Map();
    const nodo=p=>{const k=Math.round(p.x*2)+','+Math.round(p.z*2);let n=chiave.get(k);
      if(n==null){n=nodi.length;nodi.push({x:p.x,z:p.z,adj:[]});chiave.set(k,n);}return n;};
    const arco=(a,b,ref)=>{if(a===b||nodi[a].adj.some(e=>e.n===b))return;const l=Math.hypot(nodi[a].x-nodi[b].x,nodi[a].z-nodi[b].z);
      nodi[a].adj.push({n:b,l,ref});nodi[b].adj.push({n:a,l,ref});};
    for(const v of vie){let prec=null;for(const p of v.pts){const n=nodo(p);if(prec!=null)arco(prec,n,v.ref);prec=n;}}
    // estremità quasi attaccate a un altro nodo (dati non collegati): si uniscono entro 6 m
    for(let i=0;i<nodi.length;i++){
      if(nodi[i].adj.length!==1) continue;
      let best=-1,bd=6;
      for(let j=0;j<nodi.length;j++){if(j===i)continue;const dd=Math.hypot(nodi[i].x-nodi[j].x,nodi[i].z-nodi[j].z);if(dd<bd){bd=dd;best=j;}}
      if(best>=0)arco(i,best,'');
    }
    // parcheggio: il centro del piazzale più grande (se non è dentro, il suo vertice più vicino al centro)
    let pz=null,area=0;
    for(const a of piazzali){let s=0;for(let i=0,j=a.length-1;i<a.length;j=i++)s+=a[j].x*a[i].z-a[i].x*a[j].z;s=Math.abs(s/2);if(s>area){area=s;pz=a;}}
    let parcheggio=null;
    if(pz){
      let cx=0,cz=0;for(const p of pz){cx+=p.x;cz+=p.z;}cx/=pz.length;cz/=pz.length;
      parcheggio=dentro(pz,cx,cz)?{x:cx,z:cz}:pz.reduce((a,b)=>Math.hypot(a.x-cx,a.z-cz)<Math.hypot(b.x-cx,b.z-cz)?a:b);
    }else parcheggio={x:nodi[0].x,z:nodi[0].z};
    // torre: oltre il parcheggio, dalla parte opposta alla pista
    const v0=-(parcheggio.x-p0.cx)*p0.dir.z+(parcheggio.z-p0.cz)*p0.dir.x, sg=v0>=0?1:-1;
    const torre={x:parcheggio.x+(-p0.dir.z)*sg*90,z:parcheggio.z+p0.dir.x*sg*90};
    reti.set(ap,{ap,vie,piazzali,nodi,parcheggio,torre});
  }
  if(!reti.size) return null;

  function dentro(poli,x,z){
    let c=false;for(let i=0,j=poli.length-1;i<poli.length;j=i++){const a=poli[i],b=poli[j];
      if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)c=!c;}return c;
  }
  const vicino=(r,p)=>{let best=0,bd=Infinity;r.nodi.forEach((n,i)=>{const d=Math.hypot(n.x-p.x,n.z-p.z);if(d<bd){bd=d;best=i;}});return best;};
  // percorso più breve da un nodo a un altro: elenco di nodi e nomi delle vie
  function dijkstra(r,da,a){
    const N=r.nodi.length,dist=new Float64Array(N).fill(Infinity),prec=new Int32Array(N).fill(-1),ref=new Array(N),fatto=new Uint8Array(N);
    dist[da]=0;
    for(;;){
      let u=-1,bu=Infinity;for(let i=0;i<N;i++)if(!fatto[i]&&dist[i]<bu){bu=dist[i];u=i;}
      if(u<0||u===a) break;
      fatto[u]=1;
      for(const e of r.nodi[u].adj){const nd=dist[u]+e.l;if(nd<dist[e.n]){dist[e.n]=nd;prec[e.n]=u;ref[e.n]=e.ref;}}
    }
    if(!isFinite(dist[a])) return null;
    const lista=[],refs=[];for(let n=a;n>=0;n=prec[n]){lista.unshift(n);if(ref[n])refs.unshift(ref[n]);}
    return {lista,refs:refs.filter((x,i)=>x!==refs[i-1])};
  }
  // nodi raggiungibili dal parcheggio (i dati OSM a volte hanno tratti staccati dal resto)
  function raggiungibili(r){
    if(r.ragg) return r.ragg;
    const vis=new Uint8Array(r.nodi.length),coda=[vicino(r,r.parcheggio)];vis[coda[0]]=1;
    while(coda.length){const u=coda.pop();for(const e of r.nodi[u].adj)if(!vis[e.n]){vis[e.n]=1;coda.push(e.n);}}
    return r.ragg=vis;
  }
  // ingresso in pista per una testata: il nodo sulla pista più vicino alla testata, con una via che esce di lato
  // e che si raggiunge dal parcheggio
  function ingresso(r,te){
    const p=te.pista,loc=n=>({u:(n.x-te.x)*te.dir.x+(n.z-te.z)*te.dir.z,v:(n.x-te.x)*(-te.dir.z)+(n.z-te.z)*te.dir.x});
    // un ingresso è un tratto di via che attraversa il bordo della pista (da dentro a fuori): vale anche per le vie
    // che entrano in curva con tanti punti ravvicinati
    const vis=raggiungibili(r),bordo=p.W/2+12,cand=[];
    r.nodi.forEach((n,i)=>{
      const q=loc(n);if(Math.abs(q.v)>bordo||q.u<-60||q.u>p.L+60||!vis[i]) return;
      for(const e of n.adj)if(Math.abs(loc(r.nodi[e.n]).v)>bordo)cand.push({i,fuori:e.n,u:q.u});
    });
    if(!cand.length) return null;
    const best=cand.reduce((a,b)=>b.u<a.u?b:a);
    // si risale la via che esce dalla pista fino alla distanza del punto attesa
    const dist=Math.max(p.W/2+45,65);
    let cur=best.fuori,prec=best.i,attesa=null,lato=null;
    {const a=r.nodi[best.i],b=r.nodi[best.fuori],vb=Math.abs(loc(b).v);
     if(vb>=dist){const va=Math.abs(loc(a).v),t=(dist-va)/Math.max(0.01,vb-va);attesa={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,dir:Math.atan2(a.x-b.x,a.z-b.z)};lato=best.fuori;}}
    for(let k=0;k<30&&!attesa;k++){
      const opz=r.nodi[cur].adj.filter(e=>e.n!==prec).map(e=>({e,v:Math.abs(loc(r.nodi[e.n]).v)})).sort((a,b)=>b.v-a.v);
      if(!opz.length) break;
      const nx=opz[0].e.n,a=r.nodi[cur],b=r.nodi[nx],va=Math.abs(loc(a).v),vb=opz[0].v;
      if(vb>=dist){const t=(dist-va)/Math.max(0.01,vb-va);attesa={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,dir:Math.atan2(a.x-b.x,a.z-b.z)};lato=nx;break;}
      prec=cur;cur=nx;
    }
    if(!attesa){const n=r.nodi[cur];attesa={x:n.x,z:n.z,dir:0};lato=cur;}
    return {nodo:best.i,u:best.u,attesa,lato};
  }

  // griglia per sapere in fretta se un punto è su una via o un piazzale (case, alberi, attrito, avvisi)
  const CELLA=100,griglia=new Map();
  const cella=(x,z)=>Math.floor(x/CELLA)+','+Math.floor(z/CELLA);
  for(const r of reti.values()){
    for(const v of r.vie)for(let i=1;i<v.pts.length;i++){
      const a=v.pts[i-1],b=v.pts[i],s={a,b,hw:v.w/2},m=v.w/2+30;
      for(let gx=Math.floor((Math.min(a.x,b.x)-m)/CELLA);gx<=Math.floor((Math.max(a.x,b.x)+m)/CELLA);gx++)
        for(let gz=Math.floor((Math.min(a.z,b.z)-m)/CELLA);gz<=Math.floor((Math.max(a.z,b.z)+m)/CELLA);gz++){
          const k=gx+','+gz;(griglia.get(k)||griglia.set(k,{s:[],p:[]}).get(k)).s.push(s);}
    }
    for(const a of r.piazzali){
      let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const p of a){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);}
      const o={a,box:[x0,x1,z0,z1]};
      for(let gx=Math.floor((x0-30)/CELLA);gx<=Math.floor((x1+30)/CELLA);gx++)for(let gz=Math.floor((z0-30)/CELLA);gz<=Math.floor((z1+30)/CELLA);gz++){
        const k=gx+','+gz;(griglia.get(k)||griglia.set(k,{s:[],p:[]}).get(k)).p.push(o);}
    }
  }
  const distSeg=(x,z,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2));return Math.hypot(a.x+t*dx-x,a.z+t*dz-z);};
  function zona(x,z,margine=0,soloPiazzali=false){
    const c=griglia.get(cella(x,z));if(!c) return false;
    for(const o of c.p){const b=o.box;if(x<b[0]-margine||x>b[1]+margine||z<b[2]-margine||z>b[3]+margine)continue;if(dentro(o.a,x,z))return true;}
    if(soloPiazzali) return false;
    for(const s of c.s)if(distSeg(x,z,s.a,s.b)<s.hw+margine) return true;
    return false;
  }

  return {
    reti,
    di:ap=>reti.get(ap)||null,
    tutte:()=>[...reti.values()],
    zona, suSuperficie:(x,z)=>zona(x,z,0), suPiazzale:(x,z)=>zona(x,z,0,true),
    /* partenza dal parcheggio verso la testata te: punti del percorso, punto attesa, nomi delle vie, backtrack */
    partenza(ap,te){
      const r=reti.get(ap);if(!r) return null;
      const ing=ingresso(r,te);if(!ing) return null;
      const da=vicino(r,r.parcheggio),cam=dijkstra(r,da,ing.lato);if(!cam) return null;
      const punti=[{x:r.parcheggio.x,z:r.parcheggio.z},...cam.lista.map(i=>({x:r.nodi[i].x,z:r.nodi[i].z}))];
      punti.push({x:ing.attesa.x,z:ing.attesa.z,nome:'ATT'});
      const ni=r.nodi[ing.nodo];punti.push({x:ni.x,z:ni.z});
      const backtrack=ing.u>150;
      const fine=backtrack?15:Math.max(ing.u,0)+40;   // dove allinearsi sulla pista
      punti.push({x:te.x+te.dir.x*fine,z:te.z+te.dir.z*fine,nome:te.nome});
      const p1=punti[1],hdg=((Math.atan2(p1.x-r.parcheggio.x,-(p1.z-r.parcheggio.z))*180/Math.PI)+360)%360;
      return {parcheggio:r.parcheggio,hdg,punti,attesa:{x:ing.attesa.x,z:ing.attesa.z},refs:cam.refs,backtrack};
    },
    /* dopo l'atterraggio: dal punto in cui si è fino al piazzale */
    versoPiazzale(ap,pos){
      const r=reti.get(ap);if(!r) return null;
      const cam=dijkstra(r,vicino(r,pos),vicino(r,r.parcheggio));if(!cam) return null;
      return [{x:pos.x,z:pos.z},...cam.lista.map(i=>({x:r.nodi[i].x,z:r.nodi[i].z})),{x:r.parcheggio.x,z:r.parcheggio.z,nome:'P'}];
    },
    ingresso:(ap,te)=>{const r=reti.get(ap);return r?ingresso(r,te):null;},
  };
};
SIM.reteRullaggio=SIM.terreno?SIM.creaReteRullaggio(SIM.terreno):null;

/* ---------- disegno 3D ---------- */
SIM.disegnaRullaggio=function(scene){
  const rete=SIM.reteRullaggio,T=SIM.terreno;
  if(!rete) return;
  const mat=(c,o)=>new THREE.MeshStandardMaterial({color:c,roughness:.9,polygonOffset:true,polygonOffsetFactor:o,polygonOffsetUnits:o});
  const mAsf=mat(0x5d6064,-1.5),mPz=mat(0x6c6f73,-1),mGiallo=mat(0xf2c200,-3);
  const h=(x,z,su)=>T.meshH(x,z)+su;
  // striscia lungo una spezzata (segmenti lunghi divisi, così segue il terreno), con dischi negli angoli
  function striscia(pos,pts,hw,su,dischi){
    const tri=(a,b,c)=>pos.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],L=Math.hypot(b.x-a.x,b.z-a.z);if(L<0.01) continue;
      const nx=-(b.z-a.z)/L*hw,nz=(b.x-a.x)/L*hw,n=Math.max(1,Math.ceil(L/15));
      for(let k=0;k<n;k++){
        const t0=k/n,t1=(k+1)/n,x0=a.x+(b.x-a.x)*t0,z0=a.z+(b.z-a.z)*t0,x1=a.x+(b.x-a.x)*t1,z1=a.z+(b.z-a.z)*t1;
        const p=(x,z)=>({x,y:h(x,z,su),z});
        const A=p(x0+nx,z0+nz),B=p(x0-nx,z0-nz),C=p(x1-nx,z1-nz),D=p(x1+nx,z1+nz);
        tri(A,C,B);tri(A,D,C);
      }
    }
    if(dischi)for(const c of pts){const y=h(c.x,c.z,su);
      for(let k=0;k<10;k++){const a0=k/10*Math.PI*2,a1=(k+1)/10*Math.PI*2;
        pos.push(c.x,y,c.z, c.x+Math.cos(a1)*hw,y,c.z+Math.sin(a1)*hw, c.x+Math.cos(a0)*hw,y,c.z+Math.sin(a0)*hw);}}
  }
  function mesh(pos,m){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
    const o=new THREE.Mesh(g,m);o.frustumCulled=false;scene.add(o);
  }
  const asf=[],giallo=[],pz=[];
  for(const r of rete.tutte()){
    for(const v of r.vie){striscia(asf,v.pts,v.w/2,0.08,true);striscia(giallo,v.pts,0.15,0.11,false);}
    for(const a of r.piazzali){
      const forma=a.map(p=>new THREE.Vector2(p.x,p.z)),tris=THREE.ShapeUtils.triangulateShape(forma,[]);
      for(const t of tris){
        const [p,q,s]=t.map(i=>a[i]);
        // orientati verso l'alto
        const cr=(q.x-p.x)*(s.z-p.z)-(q.z-p.z)*(s.x-p.x), o=cr<0?[p,q,s]:[p,s,q];
        for(const c of o)pz.push(c.x,h(c.x,c.z,0.06),c.z);
      }
    }
    // linee del punto attesa per ogni testata con un ingresso
    for(const pi of r.ap.piste)for(const te of pi.testate){
      const ing=rete.ingresso(r.ap,te);if(!ing) continue;
      const a=ing.attesa,ux=Math.sin(a.dir),uz=Math.cos(a.dir),w=12;   // u: dalla pista verso fuori
      for(const off of [0.6,1.1,-0.6,-1.1]){
        const cx=a.x+ux*off,cz=a.z+uz*off,px=-uz*w,pz2=ux*w,tratteggio=off<0;   // tratteggiate dal lato della pista
        const pezzi=tratteggio?5:1;
        for(let k=0;k<pezzi;k++){
          const t0=-1+2*k/pezzi,t1=tratteggio?t0+1.2/pezzi:1;
          striscia(giallo,[{x:cx+px*t0,z:cz+pz2*t0},{x:cx+px*t1,z:cz+pz2*t1}],0.15,0.12,false);
        }
      }
    }
  }
  mesh(asf,mAsf);mesh(giallo,mGiallo);mesh(pz,mPz);
};
})();
