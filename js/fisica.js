/* =====================================================================
   FISICA DEL VOLO — corpo rigido a 6 gradi di libertà
   Forze: portanza, resistenza, forza laterale, spinta dell'elica, peso,
   carrello (molla + smorzatore + attrito, freni, ruotino sterzante).
   Momenti: coefficienti aerodinamici di stabilità e di comando.
   Assi corpo (three.js): x = destra, y = su, z = coda.
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const D2R=Math.PI/180, G=9.81, KT=1.943844;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const s01=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

SIM.creaFisica=function(A,terra){
  const V3=THREE.Vector3;
  const ae=A.aero, S=A.ala.superficie, b=A.ala.apertura, c=A.ala.corda, m=A.massa;
  const kInd=1/(Math.PI*ae.e*(b*b/S));
  const Ix=A.inerzia.beccheggio, Iy=A.inerzia.imbardata, Iz=A.inerzia.rollio;
  const eMax=A.comandi.elevatore*D2R, aMax=A.comandi.alettoni*D2R, rMax=A.comandi.timone*D2R, nwMax=A.comandi.ruotino*D2R;
  const disco=Math.PI*Math.pow(A.motore.diametroElica/2,2);
  const altRuote=-Math.min(...A.carrello.filter(r=>!r.pattino).map(r=>r.y));
  const ruote=A.carrello.map(r=>Object.assign({},r,{p:new V3(r.x,r.y,r.z),contatto:false,comp:0}));
  const punti=A.puntiUrto.map(p=>({p:new V3(p.x,p.y,p.z),motivo:p.motivo}));

  const st={
    pos:new V3(), vel:new V3(), q:new THREE.Quaternion(), w:new V3(),
    thr:0, rpm:A.motore.giriMin, flap:0, flapSel:0, trim:0, freno:0, sterzo:0,
    comandi:{elev:0,ail:0,rud:0},
    alpha:0, beta:0, ias:0, tas:0, gs:0, vs:0, agl:0, g:1, palla:0,
    stallo:0, avvisoStallo:false, aTerra:false, suolo:'erba',
    crashed:false, motivo:'', tempoAria:0, tempoTerra:0, eventi:[],
  };
  const altRuoteFn=()=>altRuote;

  // vettori di lavoro (riutilizzati per non creare oggetti a ogni passo)
  const invQ=new THREE.Quaternion(), dq=new THREE.Quaternion();
  const air=new V3(), vb=new V3(), vhat=new V3(), ldir=new V3(), Fb=new V3(), Fw=new V3();
  const Tb=new V3(), Tw=new V3(), rw=new V3(), pw=new V3(), vp=new V3(), wW=new V3(), tmp=new V3();
  const fdir=new V3(), sdir=new V3(), fc=new V3(), Iw=new V3(), Xb=new V3(1,0,0), Yw=new V3(0,1,0);

  function crash(motivo){
    if(st.crashed) return;
    st.crashed=true; st.motivo=motivo; st.vel.set(0,0,0); st.w.set(0,0,0);
    st.eventi.push({tipo:'incidente',motivo});
  }

  function reset(p){
    st.q.setFromAxisAngle(Yw,-p.hdg*D2R);
    st.pos.set(p.x,p.y,p.z);
    st.vel.set(0,0,-1).applyQuaternion(st.q).multiplyScalar(p.v||0);
    st.w.set(0,0,0);
    st.thr=p.thr||0; st.rpm=p.v?2300:A.motore.giriMin;
    st.flapSel=0; st.flap=0; st.trim=p.v?0.0:0; st.freno=0; st.sterzo=0;
    st.crashed=false; st.motivo=''; st.eventi.length=0;
    st.tempoAria=p.v?10:0; st.tempoTerra=0;
    for(const r of ruote){r.contatto=!p.v;r.comp=0;}
    const v=p.v||0;
    aggiornaDerivati(v,0.5*1.225*v*v,0,0);
  }

  function aggiornaDerivati(V,qbar,alpha,beta){
    st.tas=V; st.ias=Math.sqrt(2*qbar/1.225); st.alpha=alpha; st.beta=beta;
    st.gs=Math.hypot(st.vel.x,st.vel.z); st.vs=st.vel.y;
    st.agl=st.pos.y-altRuote-terra.suolo(st.pos.x,st.pos.z);
    st.suolo=terra.tipo;
  }

  /* un passo di integrazione. inp = {elev, ail, rud} in [-1,1]; vento = vettore m/s */
  function passo(dt,inp,vento){
    if(st.crashed) return;
    st.comandi.elev=inp.elev; st.comandi.ail=inp.ail; st.comandi.rud=inp.rud;

    // flap: si muovono a velocità finita
    const fT=A.flap.posizioni[st.flapSel], fr=10/A.flap.secondiPerTacca*dt;
    st.flap+=clamp(fT-st.flap,-fr,fr);

    invQ.copy(st.q).invert();
    air.copy(st.vel).sub(vento);
    vb.copy(air).applyQuaternion(invQ);          // vento relativo in assi corpo
    const V=vb.length();
    const rho=1.225*Math.pow(Math.max(0.2,1-2.2558e-5*st.pos.y),4.2559);
    const qbar=0.5*rho*V*V;
    const u=-vb.z;
    const alpha=V>0.5?Math.atan2(-vb.y,u):0;
    const beta=V>0.5?Math.asin(clamp(vb.x/V,-1,1)):0;
    const p=-st.w.z, q=st.w.x, r=-st.w.y;      // rollio, beccheggio, imbardata (convenzione aeronautica)
    const Ve=Math.max(V,10), cb=b/(2*Ve), cc=c/(2*Ve);
    const de=clamp(inp.elev+st.trim,-1,1)*eMax, da=inp.ail*aMax, dr=inp.rud*rMax;
    const fl=st.flap/30;

    /* ---- coefficiente di portanza con stallo ---- */
    const aS=(ae.alfaStallo-1.5*fl)*D2R, aN=-12*D2R, dCLf=A.flap.CL*fl;
    let CL,stallT=0;
    if(alpha>aS){stallT=s01((alpha-aS)/(8*D2R));CL=lerp(ae.CL0+ae.CLalfa*aS+dCLf,Math.sin(2*alpha)*(1+0.3*fl),stallT);}
    else if(alpha<aN){stallT=s01((aN-alpha)/(8*D2R));CL=lerp(ae.CL0+ae.CLalfa*aN+dCLf,Math.sin(2*alpha),stallT);}
    else CL=ae.CL0+ae.CLalfa*alpha+dCLf;
    CL+=ae.CLq*q*cc+ae.CLde*de;

    /* ---- resistenza (con effetto suolo sulla resistenza indotta) ---- */
    const hAla=Math.max(0.3,st.agl+altRuote+0.8)/b, ge=16*hAla*hAla/(1+16*hAla*hAla);
    const sa=Math.sin(alpha), sb=Math.sin(beta);
    const CD=ae.CD0+A.flap.CD*fl+kInd*ge*CL*CL+1.2*sa*sa*stallT+0.5*sb*sb;
    const CY=ae.CYbeta*beta-ae.CYdr*dr;

    /* ---- motore ed elica ---- */
    // giri: da fermo a tutta manetta ~2350, salgono con la velocità (elica a passo fisso)
    const uP=Math.max(0,u);
    const giriT=Math.max(A.motore.giriMin+(A.motore.giriMax-A.motore.giriMin)*Math.pow(st.thr,0.8)*(0.82+0.18*Math.min(1,uP/60)),
                         A.motore.giriMin+uP*12);
    st.rpm+=(giriT-st.rpm)*Math.min(1,dt*2.5);
    const T=(0.03+0.97*st.thr)*A.motore.spintaStatica*Math.max(0,1-Math.max(0,u)/A.motore.velocitaMaxElica)*(rho/1.225);

    /* ---- forze in assi corpo ---- */
    Fb.set(0,0,0);
    if(V>0.5){
      vhat.copy(vb).multiplyScalar(1/V);
      ldir.crossVectors(Xb,vhat);
      const ll=ldir.length(); if(ll>1e-6) ldir.multiplyScalar(1/ll);
      const qS=qbar*S;
      Fb.addScaledVector(ldir,qS*CL).addScaledVector(vhat,-qS*CD);
      Fb.x+=qS*CY;
    }
    Fb.z-=T;
    st.g=Fb.y/(m*G);
    st.palla=clamp(-Fb.x/(m*G)*6,-1,1);

    /* ---- momenti aerodinamici ----
       il flusso dell'elica investe la coda: timone ed elevatore funzionano anche da fermi */
    const qE=qbar+0.15*T/disco, qR=qbar+0.4*T/disco;
    // in stallo l'ala tende a cadere da un lato (verso cui si sta imbardando) e il muso scende
    const asim=stallT*(clamp(r*cb*30,-1,1)*0.02+0.004);
    const Cl=ae.Clbeta*beta+ae.Clp*(1-1.15*stallT)*p*cb+ae.Clr*r*cb+ae.Clda*da+asim;
    const Cm=ae.Cm0+ae.Cmalfa*sa+ae.Cmq*q*cc+ae.Cmflap*fl-0.12*stallT;
    const Cn=ae.Cnbeta*beta+ae.Cnp*p*cb+ae.Cnr*r*cb+ae.Cnda*da;
    const L=qbar*S*b*Cl+qR*S*b*ae.Cldr*dr;
    const Mm=qbar*S*c*Cm+qE*S*c*ae.Cmde*de;
    const N=qbar*S*b*Cn+qR*S*b*ae.Cndr*dr;
    Tb.set(Mm,-N,-L);

    Fw.copy(Fb).applyQuaternion(st.q);
    Fw.y-=m*G;

    /* ---- carrello ---- */
    Tw.set(0,0,0);
    wW.copy(st.w).applyQuaternion(st.q);
    st.sterzo=inp.rud*nwMax*clamp(1-st.gs/35,0.25,1);
    let contatto=false, primoContatto=false;
    for(const w of ruote){
      rw.copy(w.p).applyQuaternion(st.q); pw.copy(st.pos).add(rw);
      const gh=terra.suolo(pw.x,pw.z), tipo=terra.tipo;
      const pen=gh-pw.y;
      if(pen<=0){w.contatto=false;w.comp=0;continue;}
      if(tipo==='acqua'){crash('Ammaraggio: sei finito in acqua');return;}
      vp.crossVectors(wW,rw).add(st.vel);
      if(!w.contatto){
        if(-vp.y>A.limiti.vsContatto){crash(w.pattino?'La coda ha colpito violentemente la pista':'Atterraggio troppo duro: carrello distrutto');return;}
        w.contatto=true; primoContatto=true;
      }
      contatto=true;
      const Nf=Math.max(0,w.rigidezza*pen-w.smorzamento*vp.y);
      if(w.sterzante) fdir.set(Math.sin(st.sterzo),0,-Math.cos(st.sterzo)).applyQuaternion(st.q);
      else fdir.set(0,0,-1).applyQuaternion(st.q);
      fdir.y=0;
      const fl2=fdir.length(); if(fl2<1e-3) continue;
      fdir.multiplyScalar(1/fl2);
      sdir.set(-fdir.z,0,fdir.x);
      const vf=vp.dot(fdir), vs=vp.dot(sdir);
      const mu=w.pattino?0.45:(tipo==='erba'?0.06:0.02)+(w.freno?st.freno*0.6:0);
      const Ff=-clamp(vf*15000,-mu*Nf,mu*Nf);
      const Fs=-clamp(vs*20000,-0.75*Nf,0.75*Nf);
      fc.set(0,Nf,0).addScaledVector(fdir,Ff).addScaledVector(sdir,Fs);
      Fw.add(fc);
      tmp.crossVectors(rw,fc); Tw.add(tmp);
      w.comp=pen;
    }
    Tb.add(Tw.applyQuaternion(invQ));

    /* ---- parti che non devono toccare terra ---- */
    if(st.agl<12){
      for(const pt of punti){
        rw.copy(pt.p).applyQuaternion(st.q); pw.copy(st.pos).add(rw);
        if(pw.y<terra.suolo(pw.x,pw.z)){crash(terra.tipo==='acqua'?'Ammaraggio: sei finito in acqua':pt.motivo);return;}
      }
    }

    /* ---- integrazione ---- */
    st.vel.addScaledVector(Fw,dt/m);
    st.pos.addScaledVector(st.vel,dt);
    Iw.set(Ix*st.w.x,Iy*st.w.y,Iz*st.w.z);
    tmp.crossVectors(st.w,Iw);
    st.w.x+=(Tb.x-tmp.x)/Ix*dt;
    st.w.y+=(Tb.y-tmp.y)/Iy*dt;
    st.w.z+=(Tb.z-tmp.z)/Iz*dt;
    dq.set(st.w.x*dt*0.5,st.w.y*dt*0.5,st.w.z*dt*0.5,1);
    st.q.multiply(dq).normalize();

    aggiornaDerivati(V,qbar,alpha,beta);
    st.stallo=stallT;
    st.avvisoStallo=!contatto&&st.ias>8&&alpha>aS-4*D2R;
    st.aTerra=contatto;

    /* ---- eventi: decollo e atterraggio ---- */
    if(contatto){
      if(primoContatto&&st.tempoAria>5) st.eventi.push({tipo:'atterraggio',vs:st.vel.y,x:st.pos.x,z:st.pos.z,ias:st.ias,suolo:st.suolo});
      st.tempoAria=0; st.tempoTerra+=dt;
    }else{
      if(st.tempoTerra>3&&st.gs>15) st.eventi.push({tipo:'decollo',x:st.pos.x,z:st.pos.z});
      st.tempoTerra=0; st.tempoAria+=dt;
    }

    /* ---- limiti strutturali ---- */
    if(st.ias*KT>A.velocita.vne*1.12) crash('Velocità eccessiva: struttura danneggiata');
    else if(st.g>A.limiti.gMax||st.g<A.limiti.gMin) crash('Sovraccarico strutturale ('+st.g.toFixed(1)+' g)');
  }

  return {st, reset, passo, ruote, altRuote:altRuoteFn};
};
})();
