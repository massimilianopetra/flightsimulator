/* =====================================================================
   RADIONAVIGAZIONE: VOR (con DME) e ILS, ricevitore NAV1.
   ---------------------------------------------------------------------
   VOR: dice su quale "radiale" (direzione vista dalla stazione) si trova
   l'aereo. Scelta una rotta (OBS/CRS) l'ago del CDI mostra da che parte
   è la rotta: fondo scala = 10°. TO/FROM = la rotta porta verso la
   stazione o se ne allontana.
   ILS: il localizzatore allinea alla pista (fondo scala 2,5°), il sentiero
   di discesa (glide slope) guida su una discesa di 3° (fondo scala 0,7°).
   I VOR vengono dai dati del mondo (window.RADIO.vor o MAPPA.vor);
   gli ILS li crea il simulatore sulle piste asfaltate di almeno 1000 m,
   con frequenze assegnate da lui (non quelle reali).
   Angoli in gradi veri (il simulatore non usa la declinazione magnetica).
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const D2R=Math.PI/180, R2D=180/Math.PI, NM=1852, FT=3.28084;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const norm=a=>((a%360)+360)%360;
const diff=a=>((a%360)+540)%360-180;          // differenza fra due angoli in [-180,180)

SIM.creaRadio=function(T){
  const M=window.MAPPA||{};
  const stazioni=[];
  /* ---- VOR ---- */
  for(const v of ((window.RADIO&&window.RADIO.vor)||M.vor||[])){
    const x=v.x, z=-v.y;
    const quota=v.quota!=null?v.quota:Math.max(0,T.terrainH(x,z));
    stazioni.push({tipo:'VOR',id:v.id,nome:v.nome||v.id,freq:v.freq,dme:v.dme!==false,x,z,quota,portata:v.portata||100});
  }
  /* ---- ILS: canali sulle decine dispari di MHz fra 108,10 e 111,95 (come quelli veri) ---- */
  const canali=[];
  for(let f=108.1;f<112;f+=0.2){canali.push(Math.round(f*100)/100,Math.round((f+0.05)*100)/100);}
  const piste=T.piste.filter(p=>!p.erba&&p.L>=1000).sort((a,b)=>(a.ap.codice+a.nomi[0]).localeCompare(b.ap.codice+b.nomi[0]));
  let n=0;
  const usate=new Set();
  const sigla=b=>{let id=b,k=2;while(usate.has(id))id=b+'-'+(k++);usate.add(id);return id;};   // piste parallele
  /* un ILS vero esiste solo se il sentiero di 3° è libero dal terreno: negli ultimi 10 NM il rilievo deve
     restare almeno 250 ft sotto il sentiero (vicino alla pista, almeno a metà della sua altezza) */
  function sentieroLibero(p,te){
    const t3=Math.tan(3*D2R);
    for(let d=600;d<=10*NM;d+=150){
      const x=te.x+te.dir.x*(300-d), z=te.z+te.dir.z*(300-d), h=d*t3;
      if(T.terrainH(x,z)-p.quota>h-Math.min(76,h*0.5)) return false;
    }
    return true;
  }
  for(const p of piste)for(const te of p.testate){
    if(!sentieroLibero(p,te)) continue;
    const loc={x:te.x+te.dir.x*(p.L+300),z:te.z+te.dir.z*(p.L+300)};   // antenna oltre la fine della pista
    const gs={x:te.x+te.dir.x*300,z:te.z+te.dir.z*300};                // antenna del sentiero, 300 m dopo la soglia
    stazioni.push({tipo:'ILS',id:sigla('I'+p.ap.codice.slice(2)+te.nome),nome:p.ap.codice+(SIM.L?SIM.L(' pista ',' runway '):' pista ')+te.nome,ap:p.ap,te,
      freq:canali[n++%canali.length],dme:true,x:loc.x,z:loc.z,gs,quota:p.quota,crs:te.hdg,portata:18});
  }
  stazioni.sort((a,b)=>a.tipo===b.tipo?a.id.localeCompare(b.id):a.tipo==='VOR'?-1:1);

  // portata radio: linea di vista (la Terra è curva) e potenza della stazione
  function portata(s,pos){
    const h=Math.max(0,(pos.y-s.quota)*FT);
    return Math.min(s.portata,1.23*(Math.sqrt(h)+Math.sqrt(30)));
  }

  /* misura: s = stazione, pos = posizione aereo, obs = rotta scelta (VOR).
     ritorna {ricevuto, dev (-1..1, + = rotta a destra), daA ('TO'|'FROM'), radiale, dme NM, gs (-1..1, + = sali) o null} */
  function misura(s,pos,obs){
    const dx=pos.x-s.x, dz=pos.z-s.z, dOriz=Math.hypot(dx,dz);
    const dme=Math.hypot(dOriz,pos.y-s.quota)/NM;
    const out={ricevuto:false,dev:0,daA:null,radiale:null,dme:s.dme?dme:null,gs:null,crs:obs};
    if(dOriz/NM>portata(s,pos)) return out;
    if(s.tipo==='VOR'){
      const radiale=norm(Math.atan2(dx,-dz)*R2D);
      out.radiale=radiale;out.ricevuto=true;
      const d=diff(radiale-obs);
      if(Math.abs(d)<=90){out.daA='FROM';out.dev=clamp(-d/10,-1,1);}
      else{out.daA='TO';out.dev=clamp(diff(radiale-obs-180)/10,-1,1);}
      return out;
    }
    // ILS: localizzatore
    const dir=s.te.dir, avanti=-(dx*dir.x+dz*dir.z), lato=dx*(-dir.z)+dz*dir.x;   // lato > 0: a destra dell'asse
    const ang=Math.atan2(lato,avanti)*R2D;
    if(avanti<=0||Math.abs(ang)>35) return out;
    out.ricevuto=true;out.crs=s.crs;out.daA='TO';
    out.dev=clamp(-ang/2.5,-1,1);
    // sentiero di discesa: entro 10 NM e ±8° dall'asse
    const gx=pos.x-s.gs.x, gz=pos.z-s.gs.z, dg=Math.hypot(gx,gz);
    if(dg<10*NM&&Math.abs(ang)<8&&(gx*dir.x+gz*dir.z)<0){
      const el=Math.atan2(pos.y-s.quota,dg)*R2D;
      out.gs=clamp((3-el)/0.7,-1,1);
    }
    return out;
  }

  // ILS della pista indicata (per il piano di volo)
  const ilsDi=te=>stazioni.find(s=>s.tipo==='ILS'&&s.te===te)||null;

  return {stazioni, misura, ilsDi, portata};
};
})();
