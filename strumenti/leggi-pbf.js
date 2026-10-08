/* =====================================================================
   LETTORE MINIMO DEI FILE .osm.pbf DI OPENSTREETMAP (senza librerie esterne)
   Estrae le "way" che interessano (strade, ferrovie, fiumi...) con le
   coordinate dei loro nodi, leggendo il file due volte:
     1) le way che passano il filtro e gli id dei nodi che usano;
     2) le coordinate solo di quei nodi.
   Formato: https://wiki.openstreetmap.org/wiki/PBF_Format
   ===================================================================== */
'use strict';
const fs=require('fs'), zlib=require('zlib');

/* ---------- protobuf essenziale ---------- */
class Lettore{
  constructor(buf,ini=0,fine=buf.length){this.b=buf;this.p=ini;this.f=fine;}
  fine(){return this.p>=this.f;}
  varint(){ // fino a 2^53 senza perdere precisione
    let r=0,m=1,c;
    do{c=this.b[this.p++];r+=(c&0x7f)*m;m*=128;}while(c&0x80);
    return r;
  }
  zigzag(){const v=this.varint();return v%2===0?v/2:-(v+1)/2;}
  campo(){const k=this.varint();return {n:Math.floor(k/8),t:k&7};}
  pezzo(){const l=this.varint();const s=this.p;this.p+=l;return [s,this.p];}
  salta(t){if(t===0)this.varint();else if(t===1)this.p+=8;else if(t===2){const l=this.varint();this.p+=l;}else if(t===5)this.p+=4;}
  impaccati(fn){const [s,e]=this.pezzo();const r=new Lettore(this.b,s,e);const out=[];while(!r.fine())out.push(fn(r));return out;}
}

/* blocchi del file: [lunghezza][BlobHeader][Blob] */
function* blocchi(file){
  const fd=fs.openSync(file,'r'),len4=Buffer.alloc(4);
  let pos=0;const tot=fs.fstatSync(fd).size;
  try{
    while(pos<tot){
      fs.readSync(fd,len4,0,4,pos);pos+=4;
      const hl=len4.readUInt32BE(0),hb=Buffer.alloc(hl);fs.readSync(fd,hb,0,hl,pos);pos+=hl;
      let tipo='',dim=0;const h=new Lettore(hb);
      while(!h.fine()){const {n,t}=h.campo();if(n===1){const [s,e]=h.pezzo();tipo=hb.toString('utf8',s,e);}else if(n===3)dim=h.varint();else h.salta(t);}
      const bb=Buffer.alloc(dim);fs.readSync(fd,bb,0,dim,pos);pos+=dim;
      let dati=null;const b=new Lettore(bb);
      while(!b.fine()){const {n,t}=b.campo();
        if(n===1){const [s,e]=b.pezzo();dati=bb.subarray(s,e);}
        else if(n===3){const [s,e]=b.pezzo();dati=zlib.inflateSync(bb.subarray(s,e));}
        else b.salta(t);}
      yield {tipo,dati,avanzamento:pos/tot};
    }
  }finally{fs.closeSync(fd);}
}

/* PrimitiveBlock: tabella delle stringhe + gruppi */
function leggiBlocco(dati,{suWay,suNodi}){
  const r=new Lettore(dati);const stringhe=[];const gruppi=[];
  let gran=100,latOff=0,lonOff=0;
  while(!r.fine()){
    const {n,t}=r.campo();
    if(n===1){const [s,e]=r.pezzo();const st=new Lettore(dati,s,e);
      while(!st.fine()){const c=st.campo();if(c.n===1){const [a,b]=st.pezzo();stringhe.push(dati.toString('utf8',a,b));}else st.salta(c.t);}}
    else if(n===2)gruppi.push(r.pezzo());
    else if(n===17)gran=r.varint();else if(n===19)latOff=r.zigzag();else if(n===20)lonOff=r.zigzag();
    else r.salta(t);
  }
  for(const [s,e] of gruppi){
    const g=new Lettore(dati,s,e);
    while(!g.fine()){
      const {n,t}=g.campo();
      if(n===3&&suWay){ // Way
        const [a,b]=g.pezzo();const w=new Lettore(dati,a,b);
        let id=0,chiavi=[],valori=[],refs=[];
        while(!w.fine()){const c=w.campo();
          if(c.n===1)id=w.varint();
          else if(c.n===2)chiavi=w.impaccati(x=>x.varint());
          else if(c.n===3)valori=w.impaccati(x=>x.varint());
          else if(c.n===8){let acc=0;refs=w.impaccati(x=>(acc+=x.zigzag()));}
          else w.salta(c.t);}
        const tag={};for(let i=0;i<chiavi.length;i++)tag[stringhe[chiavi[i]]]=stringhe[valori[i]];
        suWay(id,tag,refs);
      }else if(n===2&&suNodi){ // DenseNodes
        const [a,b]=g.pezzo();const d=new Lettore(dati,a,b);
        let ids=[],lats=[],lons=[];
        while(!d.fine()){const c=d.campo();
          if(c.n===1){let acc=0;ids=d.impaccati(x=>(acc+=x.zigzag()));}
          else if(c.n===8){let acc=0;lats=d.impaccati(x=>(acc+=x.zigzag()));}
          else if(c.n===9){let acc=0;lons=d.impaccati(x=>(acc+=x.zigzag()));}
          else d.salta(c.t);}
        for(let i=0;i<ids.length;i++)suNodi(ids[i],1e-9*(latOff+gran*lats[i]),1e-9*(lonOff+gran*lons[i]));
      }else g.salta(t);
    }
  }
}

/* filtro(tag) -> categoria (stringa) oppure null.  Ritorna [{cat, tag, punti:[[lat,lon],...]}] */
function estraiWay(file,filtro,log=console.log){
  const way=[];
  let t0=Date.now(),ultimo=0;
  const avanza=(fase,a)=>{if(a-ultimo>0.1||a===1){ultimo=a;log('  '+fase+' '+Math.round(a*100)+'% ('+Math.round((Date.now()-t0)/1000)+' s)');}};
  // 1) way
  for(const {tipo,dati,avanzamento} of blocchi(file)){
    if(tipo==='OSMData')leggiBlocco(dati,{suWay:(id,tag,refs)=>{const cat=filtro(tag);if(cat)way.push({cat,tag,refs});}});
    avanza('lettura delle linee',avanzamento);
  }
  // id dei nodi necessari, ordinati, con coordinate in array paralleli
  const tutti=new Float64Array(way.reduce((n,w)=>n+w.refs.length,0));
  let k=0;for(const w of way)for(const r of w.refs)tutti[k++]=r;
  tutti.sort();
  let u=0;for(let i=0;i<tutti.length;i++)if(i===0||tutti[i]!==tutti[i-1])tutti[u++]=tutti[i];
  const ids=tutti.subarray(0,u),lat=new Float32Array(u),lon=new Float32Array(u);
  const cerca=id=>{let a=0,b=u-1;while(a<=b){const m=(a+b)>>1,v=ids[m];if(v===id)return m;if(v<id)a=m+1;else b=m-1;}return -1;};
  log('  linee trovate: '+way.length+', nodi necessari: '+u);
  // 2) nodi
  ultimo=0;t0=Date.now();
  for(const {tipo,dati,avanzamento} of blocchi(file)){
    if(tipo==='OSMData')leggiBlocco(dati,{suNodi:(id,la,lo)=>{const i=cerca(id);if(i>=0){lat[i]=la;lon[i]=lo;}}});
    avanza('lettura delle coordinate',avanzamento);
  }
  return way.map(w=>({cat:w.cat,tag:w.tag,punti:w.refs.map(r=>{const i=cerca(r);return [lat[i],lon[i]];})}));
}

module.exports={estraiWay};
