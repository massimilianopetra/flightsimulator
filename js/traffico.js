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
   TRAFFICO: altri aerei da turismo nel circuito dell'aeroporto vicino.
   - All'aeroporto più vicino al giocatore (entro 20 km; non a Malpensa e
     Linate, dove l'aviazione leggera non fa circuiti) volano uno o due aerei
     (due dove c'è la torre) che girano nel circuito della pista in uso:
     salita, virata in traverso, sottovento a 1000 ft, base, finale e
     "touch and go" (toccano la pista e ripartono), poi ancora.
   - Il circuito è a sinistra; se da quel lato ci sono montagne è a destra;
     se non c'è spazio da nessuna parte, a quell'aeroporto niente traffico.
   - Volano "su binari" (niente fisica): seguono i lati del circuito con
     virate di 25° al massimo, quota e velocità cambiano piano piano.
   - Danno la precedenza al giocatore: se è in finale o sulla pista
     allungano il sottovento o riattaccano; si scostano se si avvicina.
   - Parlano alla radio (js/atc.js): riporti in sottovento e in finale e
     risposte della torre; si sentono solo con COM1 sulla frequenza giusta.
   - La torre usa queste informazioni con il giocatore: "hold position" se
     c'è traffico in corto finale, "number two" in finale, informazioni di
     traffico quando un altro aereo è vicino.
   SIM.creaTraffico({T, scene, met, atc}) -> {aggiorna(dt, st, ctx), lista(), ora(k),
     inCorto(ap,te), davanti(ap,te,pos), daSegnalare(ap,pos,trk)}
   ===================================================================== */
(function(){
'use strict';
const SIM=window.SIM=window.SIM||{};
const D2R=Math.PI/180, R2D=180/Math.PI, FT=3.28084, KT=1.943844, NM=1852, G=9.81;
const ESCLUSI=['LIMC','LIML'];          // grandi scali: niente circuiti di aerei da turismo
const DIST_ATTIVO=20000, DIST_VIA=30000;
const BANK=25*D2R;
const TIPI=[{d:'Cessna',s:'Cessna'},{d:'Tecnam',s:'Tecnam'}];
const COLORI=[0x1d5fb4,0xb3122a,0x0f7a4a,0x153055,0xe05a16,0x2aa3c9,0x6b1d63];
const NUM=['zero','one','two','three','four','five','six','seven','eight','niner'];
const NATO={A:'Alfa',B:'Bravo',C:'Charlie',D:'Delta',E:'Echo',F:'Foxtrot',G:'Golf',H:'Hotel',I:'India',J:'Juliett',K:'Kilo',L:'Lima',
  M:'Mike',N:'November',O:'Oscar',P:'Papa',Q:'Quebec',R:'Romeo',S:'Sierra',T:'Tango',U:'Uniform',V:'Victor',W:'Whiskey',X:'X-ray',Y:'Yankee',Z:'Zulu'};
const cifre=s=>String(s).split('').filter(c=>/\d/.test(c)).map(c=>NUM[+c]).join(' ');
const lettere=s=>s.replace(/[^A-Z0-9]/gi,'').toUpperCase().split('').map(c=>/\d/.test(c)?NUM[+c]:NATO[c]).join(' ');
const ang=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

SIM.creaTraffico=function({T,scene,met,atc}){
  const L=(it,en)=>SIM.L?SIM.L(it,en):it;
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.1});
  // luci di navigazione (rossa a sinistra, verde a destra, bianca in coda) e lampeggiante: solo dal tramonto
  const texLuce=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');
    const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.35,'rgba(255,255,255,.6)');gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);})();
  const matLuci=new THREE.PointsMaterial({size:7,sizeAttenuation:false,map:texLuce,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  let luciAccese=false;

  const aerei=[];
  let campo=null;   // {ap, te, lato, chiave}
  const usati=new Set([(window.AEREO&&window.AEREO.registrazione||'I-VOLO').toUpperCase()]);
  function nominativo(){
    let r;do{r='I-'+Array.from({length:4},()=>String.fromCharCode(65+Math.floor(Math.random()*26))).join('');}while(usati.has(r));
    usati.add(r);return r;
  }

  /* ---------- circuito ----------
     coordinate della pista: u lungo la pista dalla testata (verso dove si decolla), v di lato (+ = dalla parte del circuito) */
  function circuito(ap,te){
    const p=te.pista,q=p.quota,D=1400;
    const lx=te.dir.z,lz=-te.dir.x;   // sinistra di chi decolla
    // lato del circuito: a sinistra se le colline lo permettono, altrimenti a destra
    let lato=0;
    for(const s of [1,-1]){
      let max=-1e9;
      for(let u=-2400;u<=p.L+1000;u+=200)for(const v of [D*0.5,D,D*1.3]){
        const x=te.x+te.dir.x*u+lx*v*s,z=te.z+te.dir.z*u+lz*v*s;max=Math.max(max,T.terrainH(x,z));}
      if(max<q+150){lato=s;break;}
    }
    if(!lato) return null;
    const W=(u,v)=>({x:te.x+te.dir.x*u+lx*v*lato,z:te.z+te.dir.z*u+lz*v*lato});
    const tocca=Math.min(250,p.L*0.2),stacca=Math.min(tocca+450,p.L*0.75);
    return {ap,te,lato,q,D,L:p.L,W,tocca,stacca,
      loc(x,z){const dx=x-te.x,dz=z-te.z;return {u:dx*te.dir.x+dz*te.dir.z,v:(dx*lx+dz*lz)*lato};},
      chiave:ap.codice+te.nome};
  }
  // pista in uso: quella della partenza o dell'arrivo del giocatore, altrimenti quella col vento di prua
  function pistaInUso(ap,ctx){
    if(ctx&&ctx.part&&ctx.part.ap===ap) return ctx.part.te;
    if(ctx&&ctx.arr&&ctx.arr.ap===ap) return ctx.arr.te;
    if(ctx&&ctx.fin&&ctx.fin.ap===ap) return ctx.fin.te;
    const tt=ap.piste[0].testate;
    return tt.reduce((a,b)=>Math.cos((met.ventoDa-b.hdg)*D2R)>Math.cos((met.ventoDa-a.hdg)*D2R)?b:a);
  }
  const adatto=ap=>!ESCLUSI.includes(ap.codice)&&ap.piste.length&&ap.piste[0].L>=400;

  /* ---------- un aereo ---------- */
  function nuovo(c,i){
    const reg=nominativo(),lett=reg.replace(/[^A-Z]/g,'');
    const tipo=TIPI[Math.floor(Math.random()*TIPI.length)];
    const g=SIM.modelli.aereo('turismo',COLORI[Math.floor(Math.random()*COLORI.length)],mat);
    g.rotation.order='YXZ';
    // luci
    const lg=new THREE.BufferGeometry();
    lg.setAttribute('position',new THREE.Float32BufferAttribute([-5.5,2.15,2.5, 5.5,2.15,2.5, 0,1.8,8.4, 0,2.95,7.6],3));
    lg.setAttribute('color',new THREE.Float32BufferAttribute([1,0.15,0.1, 0.1,1,0.25, 1,1,1, 1,0.2,0.15],3));
    const luci=new THREE.Points(lg,matLuci);luci.visible=luciAccese;luci.frustumCulled=false;g.add(luci);
    scene.add(g);
    const a={reg,cs:{d:reg,s:lettere(reg)},csb:{d:lett[0]+'-'+lett.slice(-2),s:lettere(lett[0]+lett.slice(-2))},tipo,g,luci,
      x:0,y:0,z:0,hdg:0,v:45,vs:0,bank:0,fase:'sottovento',fineSott:-1800,scosta:0,tScosta:0,detto:{},numero:1,tSegnalato:-1e9};
    // posizione di partenza: il primo a metà sottovento, il secondo in traverso (così sono distanziati)
    const p=i===0?c.W(c.L*0.35,c.D):c.W(c.L+700,c.D*0.35);
    a.x=p.x;a.z=p.z;a.y=c.q+1000/FT;a.fase=i===0?'sottovento':'traverso';
    const b=i===0?c.W(-1000,c.D):c.W(c.L+700,c.D);a.hdg=Math.atan2(b.x-a.x,-(b.z-a.z));
    a.v=(i===0?90:80)/KT;
    aerei.push(a);return a;
  }
  function togli(){for(const a of aerei){scene.remove(a.g);usati.delete(a.reg);}aerei.length=0;campo=null;}

  /* ---------- dov'è il giocatore rispetto alla pista ---------- */
  function sullaPista(c,st){
    if(!st.aTerra) return false;
    const p=c.te.pista,dx=st.pos.x-p.cx,dz=st.pos.z-p.cz;
    return Math.abs(dx*p.dir.x+dz*p.dir.z)<p.L/2+30&&Math.abs(-dx*p.dir.z+dz*p.dir.x)<p.W/2+8;
  }
  // in finale: in volo, sul prolungamento della pista entro 6 km, basso e diretto verso la pista
  function inFinale(c,st){
    if(st.aTerra) return false;
    const r=c.loc(st.pos.x,st.pos.z),agl=(st.pos.y-c.q)*FT;
    if(r.u>c.tocca+100||r.u<-6000||agl>1500) return false;
    if(Math.abs(r.v)>250+Math.abs(r.u)*0.12) return false;
    const trk=Math.atan2(st.vel.x,-st.vel.z),dir=Math.atan2(c.te.dir.x,-c.te.dir.z);
    return Math.abs(ang(trk-dir))<45*D2R;
  }

  /* ---------- radio ---------- */
  const staz=()=>atc&&campo?atc.stazioneDi(campo.ap):null;
  const pistaF=te=>({d:'runway '+te.nome,s:'runway '+cifre(te.nome)});
  const ventoF=()=>met.ventoNodi<1?{d:'wind calm',s:'wind calm'}:
    {d:`wind ${String(Math.round(met.ventoDa)%360||360).padStart(3,'0')} degrees ${met.ventoNodi} knots`,
     s:`wind ${cifre(String(Math.round(met.ventoDa)%360||360).padStart(3,'0'))} degrees ${cifre(met.ventoNodi)} knots`};
  const ventoIt=()=>met.ventoNodi<1?'vento calmo':`vento da ${String(Math.round(met.ventoDa)%360||360).padStart(3,'0')}° a ${met.ventoNodi} nodi`;
  function frase(...pz){let d='',s='';for(const p of pz){if(p==null)continue;if(typeof p==='string'){d+=p;s+=p;}else{d+=p.d;s+=p.s;}}
    return {d:d.replace(/\s+/g,' ').trim(),s:s.replace(/\s+/g,' ').trim()};}
  // un riporto dell'aereo e la risposta della stazione (solo se la radio è libera: altrimenti si salta)
  function parla(a,fAereo,itAereo,fTorre,itTorre){
    const s=staz();if(!s||!atc.annuncio) return false;
    return atc.annuncio(s,[{chi:'altro',nome:a.csb.d,f:fAereo,it:itAereo},fTorre?{chi:'atc',f:fTorre,it:itTorre}:null].filter(Boolean));
  }
  function riportoSottovento(a,c){
    const s=staz();if(!s) return;
    const davanti=aerei.find(b=>b!==a&&(b.fase==='base'||b.fase==='finale'||(b.fase==='sottovento'&&c.loc(b.x,b.z).u<c.loc(a.x,a.z).u)));
    a.numero=davanti?2:1;
    const fa=frase(s.parla,', ',a.cs,', downwind ',pistaF(c.te),', touch and go');
    const ia=`${s.nome}, ${a.reg}, sottovento pista ${c.te.nome}, per un touch and go.`;
    let ft,it;
    if(!s.torre){ft=frase(a.csb,', ',pistaF(c.te),' in use, ',ventoF(),davanti?', traffic '+davanti.tipo.d+' ahead':'');
      it=`${a.csb.d}, pista in uso ${c.te.nome}, ${ventoIt()}${davanti?', traffico '+davanti.tipo.d+' davanti':''}.`;}
    else if(davanti){ft=frase(a.csb,', number two, follow the ',davanti.tipo,' on ',davanti.fase==='sottovento'?'downwind':davanti.fase==='base'?'base':'final');
      it=`${a.csb.d}, numero due, seguite il ${davanti.tipo.d} in ${davanti.fase==='sottovento'?'sottovento':davanti.fase==='base'?'base':'finale'}.`;}
    else{ft=frase(a.csb,', number one, report final');it=`${a.csb.d}, numero uno, riportate in finale.`;}
    parla(a,fa,ia,ft,it);
  }
  function riportoFinale(a,c){
    const s=staz();if(!s) return;
    const fa=frase(a.csb,', final ',pistaF(c.te),', touch and go');
    const ia=`${a.csb.d}, in finale pista ${c.te.nome}, touch and go.`;
    const ft=s.torre?frase(a.csb,', ',pistaF(c.te),', ',ventoF(),', cleared touch and go'):frase(a.csb,', ',pistaF(c.te),' free, ',ventoF());
    const it=s.torre?`${a.csb.d}, pista ${c.te.nome}, ${ventoIt()}, autorizzato al touch and go.`:`${a.csb.d}, pista ${c.te.nome} libera, ${ventoIt()}.`;
    parla(a,fa,ia,ft,it);
  }

  /* ---------- volo di un aereo ---------- */
  function vola(a,c,dt,st,ctxSt){
    const r=c.loc(a.x,a.z);
    let A=null,B=null,quota=1000,vel=85,discesa=false;
    const R=a.v*a.v/(G*Math.tan(BANK));   // raggio di virata
    switch(a.fase){
      case 'corsa':{   // sulla pista: tocca, rallenta un po', riparte
        a.y=T.meshH(a.x,a.z);a.vs=0;a.bank=0;
        const dir=Math.atan2(c.te.dir.x,-c.te.dir.z);a.hdg=dir;
        const vt=r.u<c.tocca+180?48/KT:65/KT;a.v+=clamp(vt-a.v,-2*dt,2.5*dt);
        const p=c.W(r.u+a.v*dt,0);a.x=p.x;a.z=p.z;
        if(r.u>=c.stacca&&a.v>55/KT){a.fase='salita';a.vs=2;}
        return;
      }
      case 'salita':A=c.W(c.stacca,0);B=c.W(Math.max(c.L+400,r.u+(a.y-c.q<120?300:0)),0);quota=1000;vel=70;
        if(r.u>c.L+400-R*0.3&&a.y-c.q>120){a.fase='traverso';}break;
      case 'traverso':A=c.W(c.L+700,0);B=c.W(c.L+700,c.D);quota=1000;vel=80;
        if(r.v>c.D-R*0.9){a.fase='sottovento';a.fineSott=-1800;a.detto.sott=false;}break;
      case 'sottovento':{A=c.W(c.L+700,c.D);B=c.W(Math.min(a.fineSott,-600),c.D);quota=1000;vel=90;
        if(!a.detto.sott&&r.u<c.L*0.5){a.detto.sott=true;riportoSottovento(a,c);}
        // base solo se la pista e la finale sono libere (giocatore e altri aerei); altrimenti si allunga il sottovento
        if(r.u<a.fineSott+R*0.9){
          const altro=aerei.find(b=>b!==a&&(b.fase==='base'||(b.fase==='finale'&&c.loc(b.x,b.z).u<-900)));
          const occupato=altro||inFinale(c,st)||(sullaPista(c,st)&&st.gs>0.5)||(ctxSt&&ctxSt.allineato)||apEmergenza===c.ap;
          if(occupato&&a.fineSott>-5000){a.fineSott-=150;
            if(!a.detto.allunga&&(inFinale(c,st)||sullaPista(c,st))){a.detto.allunga=true;const s=staz();
              if(s&&s.torre)parla(a,frase(a.csb,', extending downwind'),`${a.csb.d}, allunghiamo il sottovento.`,null,null);}}
          else{a.fase='base';a.detto.allunga=false;}
        }
        break;}
      case 'base':A=c.W(a.fineSott,c.D);B=c.W(a.fineSott,0);quota=650;vel=75;
        if(r.v<R*0.9){a.fase='finale';a.detto.fin=false;}break;
      case 'finale':{A=c.W(Math.min(a.fineSott,-600),0);B=c.W(c.tocca,0);vel=r.u>-500?62:68;discesa=true;
        if(!a.detto.fin&&r.u>-1500){a.detto.fin=true;riportoFinale(a,c);}
        // riattaccata: pista occupata dal giocatore o da un altro aereo, oppure il giocatore è in finale davanti
        const davantiGioc=inFinale(c,st)&&c.loc(st.pos.x,st.pos.z).u>r.u&&c.loc(st.pos.x,st.pos.z).u-r.u<2500;
        const altroInPista=aerei.some(b=>b!==a&&b.fase==='corsa');
        // con un'emergenza del giocatore su questo campo si lascia libera la pista
        if(r.u>-1300&&(sullaPista(c,st)||davantiGioc||altroInPista||apEmergenza===c.ap)&&a.y-c.q>15){
          a.fase='salita';a.detto={};parla(a,frase(a.csb,', going around'),`${a.csb.d}, riattacchiamo.`,null,null);break;}
        if(a.y<=T.meshH(a.x,a.z)+0.2&&r.u>c.tocca-300){a.fase='corsa';a.y=T.meshH(a.x,a.z);a.v=Math.min(a.v,56/KT);a.fineSott=-1800;return;}
        break;}
    }
    // si segue il lato A→B guardando un punto 300 m più avanti
    const dx=B.x-A.x,dz=B.z-A.z,l=Math.hypot(dx,dz)||1,t=((a.x-A.x)*dx+(a.z-A.z)*dz)/l;
    const s=Math.min(l+400,Math.max(0,t)+300),px=A.x+dx/l*s,pz=A.z+dz/l*s;
    const voluta=Math.atan2(px-a.x,-(pz-a.z)),err=ang(voluta-a.hdg);
    const bt=clamp(err*1.6,-BANK,BANK);a.bank+=clamp(bt-a.bank,-0.35*dt,0.35*dt);
    a.hdg=ang(a.hdg+G*Math.tan(a.bank)/a.v*dt);
    // quota: in finale il sentiero di 4,5° fino al punto di contatto, altrimenti la quota del lato (± lo scostamento)
    let yt;
    if(discesa){yt=c.q+Math.max(0,c.tocca-r.u)*Math.tan(4.5*D2R);if(r.u>c.tocca-60)yt=c.q-2;}
    else yt=c.q+quota/FT+a.scosta;
    const vsMax=discesa?6:3.6;
    const vst=clamp((yt-a.y)*0.25,-vsMax,a.fase==='salita'?3.2:3.6);
    a.vs+=clamp(vst-a.vs,-1.5*dt,1.5*dt);
    a.v+=clamp(vel/KT-a.v,-1.2*dt,1.2*dt);
    a.x+=Math.sin(a.hdg)*a.v*dt;a.z-=Math.cos(a.hdg)*a.v*dt;a.y+=a.vs*dt;
    const suolo=T.meshH(a.x,a.z);
    if((a.fase!=='finale'||r.u<c.tocca-300)&&a.y<suolo+1)a.y=suolo+1;   // in finale scende fino a terra solo sulla pista
  }
  // si scosta in quota se il giocatore gli passa vicino
  function scostati(a,st,dt){
    const d=Math.hypot(st.pos.x-a.x,st.pos.z-a.z),dy=st.pos.y-a.y;
    if(!st.aTerra&&d<600&&Math.abs(dy)<120&&a.fase!=='finale'&&a.fase!=='corsa'){a.scosta=dy>0?-90:90;a.tScosta=30;}
    a.tScosta-=dt;if(a.tScosta<=0)a.scosta=0;
  }

  let tLuci=0,ultimoSt=null;
  let apEmergenza=null;   // aeroporto verso cui va il giocatore in emergenza (js/atc.js): lì gli altri non atterrano
  return {
    emergenza(ap){apEmergenza=ap||null;},
    get aerei(){return aerei;},
    // da chiamare a ogni fotogramma in volo; ctxSt = {allineato: il giocatore è autorizzato e in pista}
    aggiorna(dt,st,ctx){
      if(!st||st.crashed) return;
      ultimoSt=st;
      // aeroporto attivo: il più vicino adatto, entro 20 km
      let best=null,bd=Infinity;
      for(const ap of T.aeroporti){if(!adatto(ap))continue;const d=Math.hypot(ap.x-st.pos.x,ap.z-st.pos.z);if(d<bd){bd=d;best=ap;}}
      if(!best||bd>DIST_VIA){if(aerei.length)togli();return;}
      if(campo&&(campo.ap!==best||campo.chiave!==best.codice+pistaInUso(best,ctx).nome)){
        // si cambia aeroporto (o pista in uso) solo lontano dal vecchio campo
        const dv=Math.hypot(campo.ap.x-st.pos.x,campo.ap.z-st.pos.z);
        if(campo.ap!==best&&dv<DIST_ATTIVO){}else togli();
      }
      if(!campo&&bd<DIST_ATTIVO){
        const c=circuito(best,pistaInUso(best,ctx));
        if(!c){campo={ap:best,chiave:best.codice+pistaInUso(best,ctx).nome,vuoto:true};return;}
        campo=c;
        const s=atc&&atc.stazioneDi(best),n=s&&s.torre?2:1;
        for(let i=0;i<n;i++)nuovo(c,i);
      }
      if(!campo||campo.vuoto) return;
      const ctxSt={allineato:!!(ctx&&ctx.part&&ctx.part.ap===campo.ap&&st.aTerra&&sullaPista(campo,st))};
      for(const a of aerei){
        scostati(a,st,dt);
        vola(a,campo,dt,st,ctxSt);
        a.g.position.set(a.x,a.y,a.z);
        const pitch=a.fase==='corsa'?0:Math.atan2(a.vs,a.v)+(a.fase==='finale'?2*D2R:3*D2R);
        a.g.rotation.set(pitch,-a.hdg,-a.bank);
        a.g.visible=Math.hypot(a.x-st.pos.x,a.z-st.pos.z)<15000;
      }
      // lampeggiante: un lampo al secondo
      tLuci+=dt;
      if(luciAccese)for(const a of aerei){const c=a.luci.geometry.attributes.color,on=(tLuci%1)<0.12;c.setXYZ(3,on?1:0,on?0.2:0,on?0.15:0);c.needsUpdate=true;}
    },
    // per la mappa: posizione, prua e quota
    lista(){return aerei.map(a=>({x:a.x,z:a.z,y:a.y,hdg:a.hdg*R2D,nome:a.csb.d}));},
    ora(k){luciAccese=k==='notte'||k==='tramonto';for(const a of aerei)a.luci.visible=luciAccese;},
    /* per la torre (js/atc.js) */
    // c'è un aereo in corto finale (entro 4 km) o sulla pista te? (se il giocatore è già sulla pista sono gli altri a riattaccare)
    inCorto(ap,te){
      if(!campo||campo.vuoto||campo.ap!==ap||campo.te!==te||(ultimoSt&&sullaPista(campo,ultimoSt))) return null;
      return aerei.find(a=>a.fase==='corsa'||(a.fase==='finale'&&campo.loc(a.x,a.z).u>-4000))||null;
    },
    // un aereo che atterra prima del giocatore (sulla pista o in finale più vicino alla soglia)
    davanti(ap,te,pos){
      if(!campo||campo.vuoto||campo.ap!==ap||campo.te!==te) return null;
      const ug=campo.loc(pos.x,pos.z).u;
      return aerei.find(a=>a.fase==='corsa'||(a.fase==='finale'&&campo.loc(a.x,a.z).u>ug))||null;
    },
    // traffico da segnalare al giocatore in volo: entro 1,5 NM e 1000 ft, non segnalato da 2 minuti
    daSegnalare(ap,pos,trk){
      if(!campo||campo.vuoto||campo.ap!==ap) return null;
      const ora=performance.now();
      for(const a of aerei){
        const dx=a.x-pos.x,dz=a.z-pos.z,d=Math.hypot(dx,dz),dy=(a.y-pos.y)*FT;
        if(d>1.5*NM||Math.abs(dy)>1000||a.fase==='corsa'||ora-a.tSegnalato<120000) continue;
        a.tSegnalato=ora;
        const ril=Math.atan2(dx,-dz)*R2D,ore=((Math.round(((ril-trk)%360+360)%360/30)+11)%12)+1;
        const nm=Math.max(1,Math.round(d/NM));
        const fase={sottovento:['downwind','sottovento'],base:['base','base'],finale:['final','finale'],traverso:['crosswind','traverso'],salita:['upwind','salita']}[a.fase];
        const q=Math.abs(dy)<300?['same altitude','stessa quota']:dy>0?[`${Math.round(dy/100)*100} feet above`,`${Math.round(dy/100)*100} piedi sopra`]:[`${Math.round(-dy/100)*100} feet below`,`${Math.round(-dy/100)*100} piedi sotto`];
        return {tipo:a.tipo,ore,nm,fase,q};
      }
      return null;
    },
  };
};
})();
