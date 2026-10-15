/* =====================================================================
   STRUMENTI: PFD (Primary Flight Display) e minimappa.
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const D2R=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const MONO='"B612 Mono", ui-monospace, monospace';
const Lg=(it,en)=>SIM.L?SIM.L(it,en):it;   // lingua (js/lingua.js)

SIM.creaStrumenti=function(A){
  const T=SIM.terreno, M=window.MAPPA||{};
  const pfd=document.getElementById('pfd');
  let g=pfd.getContext('2d');
  const mappa=document.getElementById('minimap');
  let mg=mappa.getContext('2d');
  let W=0,H=0,dpr=1,MW=0,MH=0,MOX=0,MOY=0;
  // cambiare width/height di un canvas lo cancella, anche se il valore è lo stesso:
  // si tocca solo se la misura cambia davvero (altrimenti il PFD lampeggia)
  function dimensiona(cv,w,h){
    const pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
    if(cv.width!==pw)cv.width=pw;
    if(cv.height!==ph)cv.height=ph;
  }
  function adatta(){
    dpr=Math.min(2,window.devicePixelRatio||1);
    const r=pfd.getBoundingClientRect();W=r.width;H=r.height;
    dimensiona(pfd,W,H);
    const r2=mappa.getBoundingClientRect();MW=r2.width;MH=r2.height;
    dimensiona(mappa,MW,MH);
  }
  window.addEventListener('resize',()=>{adatta();if(ultimaMappa)disegnaMappa(...ultimaMappa);});adatta();
  const V=A.velocita;

  function box(x,y,w,h){g.fillStyle='#000';g.strokeStyle='#e8eef4';g.lineWidth=1.5;g.fillRect(x,y,w,h);g.strokeRect(x,y,w,h);}

  /* d = {pitch°, bank rad, ias kt, alt ft, agl ft, vs ft/min, hdg°, palla -1..1, bug° o null, gs kt} */
  /* sup (facoltativo) = {g,W,H}: disegna su un'altra superficie (es. lo schermo 3D in cabina) */
  function disegnaPFD(d,sup){
    if(sup){const v=[g,W,H,dpr];g=sup.g;W=sup.W;H=sup.H;dpr=1;try{disegnaPFD(d);}finally{[g,W,H,dpr]=v;}return;}
    if(!W) adatta();
    if(!W) return;
    g.setTransform(dpr,0,0,dpr,0,0);
    const HB=Math.round(H*0.15), AH=H-HB, cx=W/2, cy=AH/2, ppd=AH/40;
    g.clearRect(0,0,W,H);

    /* ---- orizzonte artificiale ---- */
    g.save();
    g.beginPath();g.rect(0,0,W,AH);g.clip();
    g.translate(cx,cy);g.rotate(-d.bank);
    g.save();g.translate(0,d.pitch*ppd);
    const big=Math.max(W,H)*3;
    let gr=g.createLinearGradient(0,-AH,0,0);gr.addColorStop(0,'#1b56a0');gr.addColorStop(1,'#5aa0dc');
    g.fillStyle=gr;g.fillRect(-big,-big,big*2,big);
    gr=g.createLinearGradient(0,0,0,AH);gr.addColorStop(0,'#8b5a2b');gr.addColorStop(1,'#5a3818');
    g.fillStyle=gr;g.fillRect(-big,0,big*2,big);
    g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.moveTo(-big,0);g.lineTo(big,0);g.stroke();
    g.lineWidth=1.5;g.fillStyle='#fff';g.font=`700 ${Math.round(AH*0.045)}px ${MONO}`;g.textBaseline='middle';
    for(let p=-90;p<=90;p+=2.5){
      if(!p||Math.abs(p-d.pitch)>18) continue;
      const y=-p*ppd, w=p%10===0?AH*0.16:p%5===0?AH*0.08:AH*0.035;
      g.beginPath();g.moveTo(-w,y);g.lineTo(w,y);g.stroke();
      if(p%10===0){g.textAlign='right';g.fillText(Math.abs(p),-w-4,y);g.textAlign='left';g.fillText(Math.abs(p),w+4,y);}
    }
    g.restore();
    // scala di inclinazione (ruota con l'orizzonte)
    const R=AH*0.38;
    g.strokeStyle='#fff';g.fillStyle='#fff';g.lineWidth=1.5;
    g.beginPath();g.arc(0,0,R,-Math.PI/2-60*D2R,-Math.PI/2+60*D2R);g.stroke();
    for(const a of [-60,-45,-30,-20,-10,10,20,30,45,60]){
      const r=a*D2R,len=Math.abs(a)%30===0?11:6,s=Math.sin(r),c=-Math.cos(r);
      g.beginPath();g.moveTo(s*R,c*R);g.lineTo(s*(R+len),c*(R+len));g.stroke();
    }
    g.beginPath();g.moveTo(0,-R);g.lineTo(-6,-R-10);g.lineTo(6,-R-10);g.closePath();g.fill();
    g.restore();
    // indice fisso + pallina (sbandamento)
    g.fillStyle='#ffb020';
    g.beginPath();g.moveTo(cx,cy-R+1);g.lineTo(cx-7,cy-R+12);g.lineTo(cx+7,cy-R+12);g.closePath();g.fill();
    g.fillRect(cx-8+d.palla*14,cy-R+14,16,4);
    // simbolo dell'aereo
    g.lineCap='round';g.lineJoin='round';
    for(const [col,lw] of [['#000',7],['#ffb020',4]]){
      g.strokeStyle=col;g.lineWidth=lw;g.beginPath();
      g.moveTo(cx-AH*0.26,cy);g.lineTo(cx-AH*0.1,cy);g.lineTo(cx-AH*0.1,cy+AH*0.04);
      g.moveTo(cx+AH*0.26,cy);g.lineTo(cx+AH*0.1,cy);g.lineTo(cx+AH*0.1,cy+AH*0.04);g.stroke();
    }
    g.fillStyle='#ffb020';g.fillRect(cx-3,cy-3,6,6);
    g.lineCap='butt';

    /* ---- nastro velocità ---- */
    const fs=Math.round(AH*0.055);
    const tx=6,tw=Math.round(W*0.13),ty=AH*0.08,th=AH*0.84,pk=th/90;
    g.fillStyle='rgba(8,14,26,.6)';g.fillRect(tx,ty,tw,th);
    g.save();g.beginPath();g.rect(tx,ty,tw,th);g.clip();
    const yk=k=>cy-(k-d.ias)*pk;
    const banda=(a,b,c,x,w)=>{g.fillStyle=c;g.fillRect(x,yk(b),w,yk(a)-yk(b));};
    banda(V.vso,V.vfe,'#f4f6f8',tx+tw-12,4);
    banda(V.vs1,V.vno,'#22c55e',tx+tw-7,7);
    banda(V.vno,V.vne,'#eab308',tx+tw-7,7);
    banda(V.vne,V.vne+60,'#ef4444',tx+tw-7,7);
    g.strokeStyle='#fff';g.fillStyle='#fff';g.lineWidth=1.5;g.font=`700 ${fs}px ${MONO}`;g.textAlign='right';g.textBaseline='middle';
    for(let k=Math.floor((d.ias-50)/5)*5;k<=d.ias+50;k+=5){
      if(k<20) continue;
      const y=yk(k);g.beginPath();g.moveTo(tx+tw-14,y);g.lineTo(tx+tw-(k%10?19:24),y);g.stroke();
      if(k%10===0)g.fillText(k,tx+tw-27,y);
    }
    g.restore();
    box(tx,cy-fs*0.9,tw-10,fs*1.8);
    g.fillStyle='#fff';g.font=`700 ${Math.round(fs*1.25)}px ${MONO}`;g.textAlign='right';
    g.fillText(d.ias<20?'---':Math.round(d.ias),tx+tw-15,cy+1);
    g.font=`700 ${Math.round(fs*0.8)}px ${MONO}`;g.textAlign='left';g.fillStyle='#cbd5e1';
    g.fillText('IAS kt',tx+2,ty-fs*0.7);
    g.fillText('GS '+Math.round(d.gs),tx+2,ty+th+fs*0.7);

    /* ---- nastro quota ---- */
    const vw=Math.round(W*0.055), aw=Math.round(W*0.15), ax=W-6-vw-4-aw, pf=th/700;
    g.fillStyle='rgba(8,14,26,.6)';g.fillRect(ax,ty,aw,th);
    g.save();g.beginPath();g.rect(ax,ty,aw,th);g.clip();
    const ya=f=>cy-(f-d.alt)*pf;
    const suoloFt=d.alt-d.agl, ys=ya(suoloFt);
    if(ys<ty+th){ // terreno sotto: tratteggio marrone
      g.fillStyle='rgba(139,90,43,.75)';g.fillRect(ax,ys,aw,ty+th-ys);
      g.strokeStyle='#f59e0b';g.lineWidth=2;g.beginPath();g.moveTo(ax,ys);g.lineTo(ax+aw,ys);g.stroke();
    }
    g.strokeStyle='#fff';g.fillStyle='#fff';g.lineWidth=1.5;g.textAlign='left';g.font=`700 ${fs}px ${MONO}`;
    for(let f=Math.floor((d.alt-400)/50)*50;f<=d.alt+400;f+=50){
      const y=ya(f);g.beginPath();g.moveTo(ax,y);g.lineTo(ax+(f%100?5:10),y);g.stroke();
      if(f%100===0)g.fillText(f,ax+13,y);
    }
    g.restore();
    box(ax+4,cy-fs*0.9,aw-4,fs*1.8);
    g.fillStyle='#fff';g.font=`700 ${Math.round(fs*1.25)}px ${MONO}`;g.textAlign='right';
    g.fillText(Math.round(d.alt),ax+aw-4,cy+1);
    g.font=`700 ${Math.round(fs*0.8)}px ${MONO}`;g.textAlign='left';g.fillStyle='#cbd5e1';
    if(!d.ap)g.fillText('ALT ft',ax+2,ty-fs*0.7);   // con l'autopilota al suo posto c'è la quota scelta
    g.fillStyle=d.agl<1000?'#fbbf24':'#cbd5e1';
    g.fillText('RA '+(d.agl<2500?Math.max(0,Math.round(d.agl)):'----'),ax+2,ty+th+fs*0.7);

    /* ---- variometro ---- */
    const vx=W-6-vw;
    g.fillStyle='rgba(8,14,26,.6)';g.fillRect(vx,ty,vw,th);
    const pv=(th/2-8)/2000, yv=v=>cy-clamp(v,-2000,2000)*pv;
    g.strokeStyle='#cbd5e1';g.fillStyle='#cbd5e1';g.lineWidth=1.2;g.textAlign='center';g.font=`700 ${Math.round(fs*0.75)}px ${MONO}`;
    for(const v of [-2000,-1500,-1000,-500,0,500,1000,1500,2000]){
      const y=yv(v);g.beginPath();g.moveTo(vx,y);g.lineTo(vx+(v%1000?4:8),y);g.stroke();
      if(v&&v%1000===0)g.fillText(Math.abs(v/1000),vx+vw*0.62,y);
    }
    g.strokeStyle='#22d3ee';g.lineWidth=3;g.beginPath();g.moveTo(vx+vw,cy);g.lineTo(vx+2,yv(d.vs));g.stroke();
    if(Math.abs(d.vs)>=100){
      g.fillStyle='#22d3ee';g.font=`700 ${Math.round(fs*0.75)}px ${MONO}`;
      g.fillText(Math.round(d.vs/10)*10,vx+vw/2,d.vs>0?ty-fs*0.7:ty+th+fs*0.7);
    }

    /* ---- NAV1: CDI (ago di deviazione), TO/FROM, sentiero di discesa ---- */
    if(d.nav) disegnaNav(d.nav,{cx,cy,AH,fs,tx,tw,ty,ax});

    /* ---- autopilota: barra dei modi in alto (come il G1000) e quota scelta sopra il nastro ---- */
    if(d.ap){
      const a=d.ap,fa=Math.round(fs*0.85),yb=Math.max(2,ty-fa*1.55),hb=fa*1.35;
      g.font=`700 ${fa}px ${MONO}`;g.textBaseline='middle';
      const pezzi=[['AP','#000','#4ade80'],[a.lat,'#4ade80'],[a.vert,'#4ade80']];
      for(const x of a.armati)pezzi.push([x,'#fff']);   // modi armati in bianco
      if(a.limite)pezzi.push([a.limite==='BASSA'?Lg('VEL MIN','MIN SPD'):Lg('VEL MAX','MAX SPD'),'#fbbf24']);
      const lw=pezzi.map(p=>g.measureText(p[0]).width+fa*0.9);
      let x=cx-lw.reduce((s,v)=>s+v,0)/2;
      g.fillStyle='rgba(8,14,26,.75)';g.fillRect(x-3,yb,lw.reduce((s,v)=>s+v,0)+6,hb);
      pezzi.forEach((p,i)=>{
        if(p[2]){g.fillStyle=p[2];g.fillRect(x+1,yb+2,lw[i]-2,hb-4);}
        g.fillStyle=p[1];g.textAlign='center';g.fillText(p[0],x+lw[i]/2,yb+hb/2+1);x+=lw[i];
      });
      // quota scelta: in azzurro sopra il nastro della quota, e un segno sul nastro
      g.fillStyle='rgba(8,14,26,.85)';g.fillRect(ax,yb,aw,hb);
      g.fillStyle='#22d3ee';g.textAlign='center';g.fillText(String(a.altSel),ax+aw/2,yb+hb/2+1);
      const ysel=clamp(ya(a.altSel),ty,ty+th);
      g.fillRect(ax,ysel-6,5,12);
    }

    /* ---- bussola (nastro di prua) ---- */
    g.fillStyle='#0b1322';g.fillRect(0,AH,W,HB);
    g.save();g.beginPath();g.rect(0,AH,W,HB);g.clip();
    const pd=W/90;
    g.strokeStyle='#fff';g.fillStyle='#fff';g.lineWidth=1.5;g.textAlign='center';g.textBaseline='middle';g.font=`700 ${fs}px ${MONO}`;
    const card={0:'N',90:'E',180:'S',270:Lg('O','W')};
    for(let h=Math.floor((d.hdg-50)/5)*5;h<=d.hdg+50;h+=5){
      const x=cx+(h-d.hdg)*pd,hh=((h%360)+360)%360;
      g.beginPath();g.moveTo(x,AH);g.lineTo(x,AH+(hh%10?5:10));g.stroke();
      if(hh%10===0){g.fillStyle=card[hh]?'#fbbf24':'#fff';g.fillText(card[hh]||String(hh/10|0).padStart(2,'0'),x,AH+HB*0.62);}
    }
    if(d.virata!=null){ // vettore di tendenza: dove sarà la prua fra 6 s (le tacche bianche = virata standard, 3°/s)
      const v=clamp(d.virata*6,-45,45)*pd;
      g.fillStyle='#ff5ad9';g.fillRect(Math.min(cx,cx+v),AH+1,Math.abs(v),4);
      g.fillStyle='#fff';for(const s of [-1,1])g.fillRect(cx+s*18*pd-1,AH,2,8);
    }
    if(d.bug!=null){ // direzione verso la destinazione
      let rel=((d.bug-d.hdg+540)%360)-180;
      const x=clamp(cx+rel*pd,8,W-8);
      g.fillStyle='#ff5ad9';g.beginPath();g.moveTo(x,AH+1);g.lineTo(x-6,AH+9);g.lineTo(x+6,AH+9);g.closePath();g.fill();
    }
    if(d.ap){ // prua scelta dell'autopilota: segno azzurro a "U" sul bordo della bussola
      const rel=((d.ap.hdgSel-d.hdg+540)%360)-180, x=clamp(cx+rel*pd,8,W-8);
      g.fillStyle='#22d3ee';g.beginPath();g.moveTo(x-8,AH);g.lineTo(x+8,AH);g.lineTo(x+8,AH+8);g.lineTo(x+3,AH+8);g.lineTo(x,AH+4);g.lineTo(x-3,AH+8);g.lineTo(x-8,AH+8);g.closePath();g.fill();
    }
    g.restore();
    box(cx-fs*1.7,AH+2,fs*3.4,HB-4);
    g.fillStyle='#fff';g.font=`700 ${Math.round(fs*1.15)}px ${MONO}`;g.textAlign='center';
    g.fillText(String(Math.round(d.hdg)%360).padStart(3,'0')+'°',cx,AH+HB/2+1);
    g.fillStyle='#ffb020';g.beginPath();g.moveTo(cx,AH-1);g.lineTo(cx-6,AH-9);g.lineTo(cx+6,AH-9);g.closePath();g.fill();
  }

  /* NAV1 sul PFD. n = misura del ricevitore (js/radio.js) + staz */
  const VERDE='#4ade80';
  function disegnaNav(n,L){
    const {cx,cy,AH,fs,tx,tw,ty,ax}=L, s=n.staz, ils=s.tipo==='ILS', gps=s.tipo==='GPS';
    const COL=gps?'#ff5ad9':VERDE;   // GPS in magenta, NAV1 in verde (come sul G1000)
    // riquadro con frequenza, sigla, rotta e distanza
    const fsn=Math.round(fs*0.78), bx=tx+tw+6, by=ty;
    g.font=`700 ${fsn}px ${MONO}`;g.textAlign='left';g.textBaseline='top';
    const righe=gps?[`GPS ${n.scala} ▸ ${s.id}`,`DTK ${String(Math.round(n.crs)%360).padStart(3,'0')}° ${n.dme.toFixed(1)} NM`]:
      [`${ils?'LOC':'VOR'} ${s.id} ${s.freq.toFixed(2)}`,
      n.ricevuto?`CRS ${String(Math.round(n.crs)%360).padStart(3,'0')}°${n.dme!=null?` DME ${n.dme.toFixed(1)}`:''}`:Lg('FUORI PORTATA','OUT OF RANGE')];
    const bw=Math.max(...righe.map(r=>g.measureText(r).width))+8;
    g.fillStyle='rgba(8,14,26,.7)';g.fillRect(bx,by,bw,fsn*2.5);
    g.fillStyle=n.ricevuto?COL:'#fbbf24';righe.forEach((r,i)=>g.fillText(r,bx+4,by+3+i*fsn*1.2));
    // CDI orizzontale: 2 pallini per lato, fondo scala = 10° (VOR) o 2,5° (LOC)
    const yc=AH-fs*1.5, half=AH*0.3;
    g.fillStyle='rgba(8,14,26,.55)';g.fillRect(cx-half-fs*2.2,yc-fs*0.75,2*half+fs*4.4,fs*1.5);
    g.strokeStyle='#fff';g.lineWidth=1.5;
    for(const k of [-1,-0.5,0.5,1]){g.beginPath();g.arc(cx+k*half,yc,fs*0.17,0,Math.PI*2);g.stroke();}
    g.fillStyle='#fff';g.fillRect(cx-1,yc-fs*0.6,2,fs*1.2);
    g.font=`700 ${Math.round(fs*0.7)}px ${MONO}`;g.textBaseline='middle';g.textAlign='right';
    g.fillStyle=COL;g.fillText(gps?'GPS':ils?'LOC':'VOR',cx-half-fs*0.5,yc);
    if(n.ricevuto){
      const xn=cx+n.dev*half;
      g.fillStyle='#000';g.fillRect(xn-3.5,yc-fs*0.65,7,fs*1.3);
      g.fillStyle=COL;g.fillRect(xn-2.5,yc-fs*0.6,5,fs*1.2);
      // TO = triangolo in su, FROM = in giù
      const xt=cx+half+fs*1.2;g.beginPath();
      if(n.daA==='TO'){g.moveTo(xt,yc-fs*0.5);g.lineTo(xt-fs*0.4,yc+fs*0.3);g.lineTo(xt+fs*0.4,yc+fs*0.3);}
      else{g.moveTo(xt,yc+fs*0.5);g.lineTo(xt-fs*0.4,yc-fs*0.3);g.lineTo(xt+fs*0.4,yc-fs*0.3);}
      g.closePath();g.fill();
    }else{
      g.fillStyle='#ef4444';g.textAlign='left';g.fillText('NO',cx+half+fs*0.6,yc);
    }
    // sentiero di discesa: scala verticale a sinistra del nastro della quota
    if(ils){
      const xg=ax-fs*0.9, hg=AH*0.22;
      g.fillStyle='rgba(8,14,26,.55)';g.fillRect(xg-fs*0.55,cy-hg-fs*0.5,fs*1.1,2*hg+fs);
      g.strokeStyle='#fff';g.lineWidth=1.5;
      for(const k of [-1,-0.5,0.5,1]){g.beginPath();g.arc(xg,cy+k*hg,fs*0.17,0,Math.PI*2);g.stroke();}
      g.fillStyle='#fff';g.fillRect(xg-fs*0.45,cy-1,fs*0.9,2);
      if(n.gs!=null){
        const yg=cy-n.gs*hg, r=fs*0.38;
        g.fillStyle=VERDE;g.strokeStyle='#000';g.lineWidth=1;
        g.beginPath();g.moveTo(xg,yg-r);g.lineTo(xg+r,yg);g.lineTo(xg,yg+r);g.lineTo(xg-r,yg);g.closePath();g.fill();g.stroke();
      }else{g.fillStyle='#ef4444';g.font=`700 ${Math.round(fs*0.6)}px ${MONO}`;g.textAlign='center';g.fillText('GS',xg,cy-hg-fs*0.9);}
    }
  }

  /* ---------- virosbandometro ----------
     l'aeroplanino si inclina col rateo di virata: sulle tacche L/R la virata è "standard"
     (3°/s, un giro completo in 2 minuti). La pallina nel tubo mostra se la virata è coordinata:
     se scappa da un lato, "pesta la pallina" col timone da quel lato. */
  function virosbandometro(c,x,y,r,virata,palla){
    c.save();
    c.fillStyle='#0a0a0a';c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
    c.strokeStyle='#8a8f96';c.lineWidth=r*0.08;c.beginPath();c.arc(x,y,r*1.02,0,Math.PI*2);c.stroke();
    const STD=20*D2R, lw=Math.max(1.5,r*0.05);
    c.strokeStyle='#fff';c.lineWidth=lw;
    for(const a of [0,STD])for(const s of [-1,1]){
      c.beginPath();c.moveTo(x+s*Math.cos(a)*r*0.74,y+Math.sin(a)*r*0.74);c.lineTo(x+s*Math.cos(a)*r*0.94,y+Math.sin(a)*r*0.94);c.stroke();
    }
    c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${Math.round(r*0.2)}px ${MONO}`;
    c.fillText('L',x-Math.cos(STD+0.32)*r*0.72,y+Math.sin(STD+0.32)*r*0.72);
    c.fillText('R',x+Math.cos(STD+0.32)*r*0.72,y+Math.sin(STD+0.32)*r*0.72);
    c.font=`700 ${Math.round(r*0.15)}px ${MONO}`;c.fillStyle='#cbd5e1';
    c.fillText('2 MIN',x,y+r*0.8);c.fillText(Lg('VIRATA','TURN'),x,y-r*0.5);
    // tubo con la pallina
    const cy2=y-r*1.6, rt=r*2.15, a0=Math.PI/2;
    c.lineCap='round';c.strokeStyle='#d8d2b0';c.lineWidth=r*0.2;
    c.beginPath();c.arc(x,cy2,rt,a0-0.2,a0+0.2);c.stroke();
    c.lineCap='butt';c.strokeStyle='#333';c.lineWidth=Math.max(1,r*0.025);
    for(const s of [-1,1]){const a=a0+s*0.045;c.beginPath();c.moveTo(x+Math.cos(a)*(rt-r*0.11),cy2+Math.sin(a)*(rt-r*0.11));c.lineTo(x+Math.cos(a)*(rt+r*0.11),cy2+Math.sin(a)*(rt+r*0.11));c.stroke();}
    const ab=a0-clamp(palla,-1,1)*0.17;
    c.fillStyle='#111';c.beginPath();c.arc(x+Math.cos(ab)*rt,cy2+Math.sin(ab)*rt,r*0.075,0,Math.PI*2);c.fill();
    // aeroplanino visto da dietro
    c.translate(x,y-r*0.05);c.rotate(clamp((virata||0)/3,-1.6,1.6)*STD);
    c.strokeStyle='#fff';c.fillStyle='#fff';c.lineWidth=r*0.07;c.lineCap='round';
    c.beginPath();c.moveTo(-r*0.66,0);c.lineTo(r*0.66,0);c.stroke();
    c.lineWidth=r*0.05;c.beginPath();c.moveTo(0,0);c.lineTo(0,-r*0.2);c.stroke();
    c.beginPath();c.arc(0,0,r*0.09,0,Math.PI*2);c.fill();
    c.restore();
  }

  /* ---------- pannello in basso: virosbandometro, trim e carburante ----------
     d = {virata °/s, palla, trim -0.5..0.5, carb gal, flusso gal/h} */
  const aux=document.getElementById('aux');
  function disegnaAux(d){
    if(!aux) return;
    const rc=aux.getBoundingClientRect(),w=rc.width,h=rc.height;
    if(!w||!h) return;
    const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
    if(aux.width!==pw||aux.height!==ph){aux.width=pw;aux.height=ph;}
    const c=aux.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    const R=h/2-3;
    virosbandometro(c,R+3,h/2,R,d.virata,d.palla);
    // trim: in alto picchia, in basso cabra (come la cloche: tirata = in basso)
    const tx=2*R+24, t0=18, t1=h-16, tm=(t0+t1)/2;
    c.font=`700 10px ${MONO}`;c.textBaseline='middle';c.textAlign='left';c.fillStyle='#8ea6bb';
    c.fillText('TRIM',tx-6,7);
    c.fillStyle='#2b3445';c.fillRect(tx,t0,7,t1-t0);
    c.fillStyle='#22c55e';c.fillRect(tx,tm-2,7,(t1-t0)*0.08);   // zona per il decollo
    c.fillStyle='#e8eef4';c.fillRect(tx-3,tm-1,13,2);
    c.fillStyle='#8ea6bb';c.font=`700 9px ${MONO}`;c.fillText(Lg('PIC','DN'),tx+12,t0+3);c.fillText(Lg('CAB','UP'),tx+12,t1-3);
    const yt=tm+clamp(d.trim/0.5,-1,1)*(t1-t0)/2;
    c.fillStyle='#39d7ff';c.beginPath();c.moveTo(tx+8,yt);c.lineTo(tx+15,yt-5);c.lineTo(tx+15,yt+5);c.closePath();c.fill();
    const tr=Math.round(d.trim*200);
    c.font=`700 11px ${MONO}`;c.fillText((tr>0?'+':'')+tr,tx+17,clamp(yt,t0+12,t1-12));
    // carburante
    const fx=tx+50, fw=w-fx-2, cap=A.carburante.capacita, carb=d.carb;
    const col=carb<5?'#ef4444':carb<10?'#fbbf24':'#e8eef4';
    c.fillStyle='#8ea6bb';c.font=`700 10px ${MONO}`;c.fillText(Lg('CARBURANTE','FUEL'),fx,7);
    c.fillStyle=col;c.font=`700 18px ${MONO}`;c.fillText(carb.toFixed(1),fx,27);
    const wn=c.measureText(carb.toFixed(1)).width;
    c.font=`700 10px ${MONO}`;c.fillText('gal',fx+wn+4,29);
    c.fillStyle='#2b3445';c.fillRect(fx,40,fw,6);
    c.fillStyle=carb<5?'#ef4444':'#22c55e';c.fillRect(fx,40,fw*clamp(carb/cap,0,1),6);
    c.fillStyle='#e8eef4';c.font=`700 11px ${MONO}`;
    c.fillText(d.flusso.toFixed(1)+' gal/h',fx,58);
    const aut=d.flusso>0?carb/d.flusso:0;
    c.fillStyle='#8ea6bb';c.font=`700 10px ${MONO}`;c.fillText(Lg('AUTONOMIA','ENDURANCE'),fx,74);
    c.fillStyle=col;c.font=`700 11px ${MONO}`;
    c.fillText(d.flusso>0?Math.floor(aut)+'h '+String(Math.floor((aut%1)*60)).padStart(2,'0')+'m':Lg('MOTORE SPENTO','ENGINE OUT'),fx,88);
  }

  /* ---------- minimappa ---------- */
  const EST=M.dimensione||30000, RES=T.reale?480:320, QMAX=T.reale?3600:1400;
  const sfondo=document.createElement('canvas');sfondo.width=sfondo.height=RES;
  (function prerender(){
    const c=sfondo.getContext('2d'),img=c.createImageData(RES,RES),Hm=new Float32Array(RES*RES),cell=EST/RES;
    for(let j=0;j<RES;j++)for(let i=0;i<RES;i++)Hm[j*RES+i]=T.terrainH(-EST/2+(i+.5)*cell,-EST/2+(j+.5)*cell);
    for(let j=0;j<RES;j++)for(let i=0;i<RES;i++){
      const h=Hm[j*RES+i],x=-EST/2+(i+.5)*cell,z=-EST/2+(j+.5)*cell;
      let r,gg,b,acqua=h<0;
      if(!acqua){const l=T.inLago(x,z);if(l&&h<l.q+0.5)acqua=true;}
      const RL=T.rilievo, fuori=RL&&(x<RL.xMin||x>RL.xMin+(RL.larghezza-1)*RL.passo||-z>RL.yNord||-z<RL.yNord-(RL.altezza-1)*RL.passo);
      if(fuori){r=34;gg=64;b=90;}
      else if(acqua){r=44;gg=106;b=150;}
      else{
        const t=clamp(h/QMAX,0,1);
        if(t<0.25){const k=t/0.25;r=110+k*40;gg=160+k*10;b=90+k*10;}
        else if(t<0.6){const k=(t-0.25)/0.35;r=150+k*30;gg=170-k*40;b=100-k*10;}
        else{const k=(t-0.6)/0.4;r=180+k*60;gg=130+k*110;b=90+k*150;}
        const hx=Hm[j*RES+Math.min(i+1,RES-1)]-Hm[j*RES+Math.max(i-1,0)];
        const hz=Hm[Math.min(j+1,RES-1)*RES+i]-Hm[Math.max(j-1,0)*RES+i];
        const sh=clamp(1+(-hx-hz)/(cell*2)*1.6,0.55,1.35);
        r*=sh;gg*=sh;b*=sh;
      }
      const o=(j*RES+i)*4;img.data[o]=r;img.data[o+1]=gg;img.data[o+2]=b;img.data[o+3]=255;
    }
    c.putImageData(img,0,0);
  })();

  /* ---------- vie di comunicazione (window.VIE, solo mappe reali) ----------
     ordine di disegno, colore, spessore in pixel, scala massima (m) in cui compaiono */
  const STILE_VIE={
    fiumi:{col:'#3d8fd6',w:1.4,max:Infinity},
    canali:{col:'#5aa0e0',w:1,max:100000},
    urbane:{col:'#d8d2c2',w:0.6,max:6000},
    comunali:{col:'#e4dcc4',w:0.8,max:12000},
    provinciali:{col:'#efe6c8',w:1,max:40000},
    statali:{col:'#f4c542',w:1.6,max:200000},
    ferrovie:{col:'#1b1b1b',w:2,max:100000,tratteggio:true},
    superstrade:{col:'#f08a24',w:2.2,max:Infinity,bordo:true},
    autostrade:{col:'#e2382b',w:2.6,max:Infinity,bordo:true},
  };
  const vie={};
  let haVie=false;
  const sfondoVie=document.createElement('canvas');
  if(window.VIE){
    for(const cat of Object.keys(STILE_VIE)){
      vie[cat]=(window.VIE[cat]||[]).map(l=>{
        const n=l.p.length/2,xs=new Float32Array(n),zs=new Float32Array(n);
        let x=0,y=0,x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
        for(let i=0;i<n;i++){
          x+=l.p[2*i];y+=l.p[2*i+1];xs[i]=x*10;zs[i]=-y*10;
          if(xs[i]<x0)x0=xs[i];if(xs[i]>x1)x1=xs[i];if(zs[i]<z0)z0=zs[i];if(zs[i]>z1)z1=zs[i];
        }
        const po=cat==='fiumi'&&/^(Fiume )?Po$/.test(l.r||'');
        return {r:l.r||'',xs,zs,box:[x0,x1,z0,z1],w:po?3:STILE_VIE[cat].w};
      });
      if(vie[cat].length)haVie=true;
    }
    // versione "di tutta la regione", disegnata una volta sola
    const SV=1024;sfondoVie.width=sfondoVie.height=SV;
    const c=sfondoVie.getContext('2d'),sc=SV/EST;
    c.lineJoin='round';c.lineCap='round';
    for(const cat of ['fiumi','statali','superstrade','autostrade']){
      for(const v of vie[cat]){
        c.strokeStyle=STILE_VIE[cat].col;c.lineWidth=cat==='fiumi'?(v.w>2?1.8:0.8):cat==='statali'?0.6:1.3;
        c.beginPath();
        for(let i=0;i<v.xs.length;i++){const px=(v.xs[i]+EST/2)*sc,pz=(v.zs[i]+EST/2)*sc;if(i)c.lineTo(px,pz);else c.moveTo(px,pz);}
        c.stroke();
      }
    }
  }
  function disegnaVie(s,range,P){
    if(!haVie) return;
    const m=range*0.75,X0=s.pos.x-m,X1=s.pos.x+m,Z0=s.pos.z-m,Z1=s.pos.z+m;
    mg.lineJoin='round';mg.lineCap='round';
    const tracciato=v=>{ // salta i punti più vicini di 1,5 pixel: alle scale grandi si disegna molto meno
      mg.beginPath();let lx=-1e9,ly=-1e9;const n=v.xs.length;
      for(let i=0;i<n;i++){
        const [x,y]=P(v.xs[i],v.zs[i]);
        if(i&&i<n-1&&Math.abs(x-lx)+Math.abs(y-ly)<1.5) continue;
        if(i)mg.lineTo(x,y);else mg.moveTo(x,y);
        lx=x;ly=y;
      }
    };
    const visibile=v=>!(v.box[1]<X0||v.box[0]>X1||v.box[3]<Z0||v.box[2]>Z1);
    for(const cat of Object.keys(STILE_VIE)){
      const st=STILE_VIE[cat];
      if(range>st.max) continue;
      for(const v of vie[cat]){
        if(!visibile(v)) continue;
        tracciato(v);
        if(st.bordo){mg.strokeStyle='rgba(20,20,20,.75)';mg.lineWidth=v.w+1.6;mg.stroke();}
        mg.strokeStyle=st.col;mg.lineWidth=v.w;mg.stroke();
        if(st.tratteggio){mg.setLineDash([4,4]);mg.strokeStyle='#f2f2f2';mg.lineWidth=v.w*0.55;mg.stroke();mg.setLineDash([]);}
      }
    }
    // sigle delle autostrade su cartello verde, come in Italia
    if(range>=9000){
      const posti=[];
      mg.font=`700 9px ${MONO}`;mg.textAlign='center';mg.textBaseline='middle';
      for(const v of vie.autostrade){
        if(!v.r||!visibile(v)) continue;
        const i=v.xs.length>>1,[x,y]=P(v.xs[i],v.zs[i]);
        if(x<14||x>MW-14||y<10||y>MH-26) continue;
        if(posti.some(p=>p.r===v.r&&Math.hypot(p.x-x,p.y-y)<90)) continue;
        posti.push({r:v.r,x,y});
        const w=mg.measureText(v.r).width+6;
        mg.fillStyle='#1f7a45';mg.fillRect(x-w/2,y-6,w,12);
        mg.strokeStyle='#fff';mg.lineWidth=1;mg.strokeRect(x-w/2+1,y-5,w-2,10);
        mg.fillStyle='#fff';mg.fillText(v.r,x,y+0.5);
      }
    }
  }
  // scale della mappa: larghezza visibile in miglia nautiche, più "tutta la mappa"
  const SCALE_NM=[0.5,1,2,5,10,20,50,100].filter(nm=>nm*1852<EST*0.9);
  const scale=[...SCALE_NM.map(nm=>nm*1852),EST];
  const nomeScala=i=>i<SCALE_NM.length?SCALE_NM[i]+' NM':(T.reale?Lg('Tutta la regione','Whole region'):Lg('Tutta la mappa','Whole map'));
  let zoom=Math.max(0,SCALE_NM.indexOf(10));
  try{const z=+localStorage.getItem('volo-mappa-zoom2');if(localStorage.getItem('volo-mappa-zoom2')!==null&&z>=0&&z<scale.length)zoom=z;}catch(e){}
  function impostaZoom(z){
    zoom=clamp(z,0,scale.length-1);
    try{localStorage.setItem('volo-mappa-zoom2',String(zoom));}catch(e){}
    if(ultimaMappa)disegnaMappa(...ultimaMappa);
    if(alCambioZoom)alCambioZoom(zoom);
  }
  let alCambioZoom=null;
  // orientamento: 'nord' (nord in alto) oppure 'prua' (la direzione dell'aereo in alto)
  let orient='nord';
  try{if(localStorage.getItem('volo-mappa-orient')==='prua')orient='prua';}catch(e){}

  let ultimaMappa=null;
  // radioaiuti sulla mappa: VOR (esagono) e, per la stazione sintonizzata, la rotta CRS o il fascio ILS
  let radioMappa=null, navMappa=null;
  function disegnaRadioMappa(P,k,range){
    const n=navMappa&&navMappa.staz;
    mg.lineWidth=1.5;mg.font=`700 9px ${MONO}`;mg.textAlign='left';mg.textBaseline='middle';
    if(n){
      mg.strokeStyle='rgba(74,222,128,.9)';mg.fillStyle='rgba(74,222,128,.18)';
      if(n.tipo==='VOR'){
        const c=navMappa.crs*D2R, L=60*1852, [ax,ay]=P(n.x-Math.sin(c)*L,n.z+Math.cos(c)*L), [bx,by]=P(n.x+Math.sin(c)*L,n.z-Math.cos(c)*L);
        mg.lineWidth=4;mg.strokeStyle='rgba(0,0,0,.55)';mg.beginPath();mg.moveTo(ax,ay);mg.lineTo(bx,by);mg.stroke();
        mg.lineWidth=2;mg.strokeStyle='#4ade80';mg.setLineDash([8,5]);mg.beginPath();mg.moveTo(ax,ay);mg.lineTo(bx,by);mg.stroke();mg.setLineDash([]);
        mg.lineWidth=1.5;
      }else{
        const te=n.te, L=10*1852, a=2.5*D2R, dx=-te.dir.x, dz=-te.dir.z;
        const lat=(sg)=>{const c=Math.cos(a),s=Math.sin(a)*sg;return [dx*c-dz*s,dz*c+dx*s];};
        const [l1x,l1z]=lat(1),[l2x,l2z]=lat(-1);
        const p0=P(te.x,te.z),p1=P(te.x+l1x*L,te.z+l1z*L),p2=P(te.x+l2x*L,te.z+l2z*L),pc=P(te.x+dx*L,te.z+dz*L);
        mg.fillStyle='rgba(74,222,128,.3)';mg.beginPath();mg.moveTo(p0[0],p0[1]);mg.lineTo(p1[0],p1[1]);mg.lineTo(p2[0],p2[1]);mg.closePath();mg.fill();mg.stroke();
        mg.beginPath();mg.moveTo(p0[0],p0[1]);mg.lineTo(pc[0],pc[1]);mg.stroke();
      }
    }
    if(range>110*1852) return;
    for(const s of radioMappa.stazioni){
      if(s.tipo!=='VOR') continue;
      const [x,y]=P(s.x,s.z);
      if(x<-20||x>MW+20||y<-20||y>MH+20) continue;
      const on=s===n;
      mg.strokeStyle=on?'#4ade80':'#7dd3fc';mg.fillStyle=mg.strokeStyle;
      mg.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;mg[i?'lineTo':'moveTo'](x+Math.cos(a)*6,y+Math.sin(a)*6);}mg.closePath();mg.stroke();
      mg.beginPath();mg.arc(x,y,1.5,0,Math.PI*2);mg.fill();
      if(s.dme)mg.strokeRect(x-6,y-5.2,12,10.4);
      const t=s.id;mg.fillStyle='rgba(8,14,26,.75)';mg.fillRect(x+8,y+3,mg.measureText(t).width+4,12);
      mg.fillStyle=on?'#4ade80':'#bae6fd';mg.fillText(t,x+10,y+9.5);
    }
  }
  // rotta del piano di volo: {punti:[{x,z,nome}], prossimo} (indice del punto verso cui si va)
  let rottaMappa=null;
  function disegnaMappa(s,hdg,dest,sup){
    if(sup){const v=[mg,MW,MH,dpr,MOX,MOY];mg=sup.g;MW=sup.W;MH=sup.H;dpr=1;MOX=sup.x||0;MOY=sup.y||0;
      try{disegnaMappa(s,hdg,dest);}finally{[mg,MW,MH,dpr,MOX,MOY]=v;}return;}
    if(!sup&&mg===mappa.getContext('2d'))ultimaMappa=[s,hdg,dest];
    if(!MW) adatta();
    if(!MW) return;
    mg.setTransform(dpr,0,0,dpr,MOX*dpr,MOY*dpr);
    mg.save();mg.beginPath();mg.rect(0,0,MW,MH);mg.clip();
    const range=scale[zoom], k=MW/range, cx=MW/2, cy=MH/2;
    const rot=orient==='prua'?hdg*D2R:0, c=Math.cos(rot), sn=Math.sin(rot);
    // da coordinate del mondo a pixel della mappa (ruotata di -rot attorno all'aereo)
    const P=(x,z)=>{const dx=(x-s.pos.x)*k,dz=(z-s.pos.z)*k;return [cx+dx*c+dz*sn,cy-dx*sn+dz*c];};
    mg.fillStyle='#22405a';mg.fillRect(0,0,MW,MH);
    mg.imageSmoothingEnabled=true;
    mg.save();mg.translate(cx,cy);mg.rotate(-rot);
    mg.drawImage(sfondo,(-EST/2-s.pos.x)*k,(-EST/2-s.pos.z)*k,EST*k,EST*k);
    mg.restore();
    mg.fillStyle=haVie?'rgba(60,60,60,.22)':'rgba(60,60,60,.55)';
    for(const ct of T.citta){const [x,y]=P(ct.x,ct.z);mg.beginPath();mg.arc(x,y,Math.max(2,ct.r*k*0.8),0,Math.PI*2);mg.fill();}
    if(zoom===scale.length-1){ // tutta la regione: vie già disegnate
      if(haVie){mg.save();mg.translate(cx,cy);mg.rotate(-rot);
        mg.drawImage(sfondoVie,(-EST/2-s.pos.x)*k,(-EST/2-s.pos.z)*k,EST*k,EST*k);mg.restore();}
    }else disegnaVie(s,range,P);
    if(range>=12000){
      mg.font=`700 9px ${MONO}`;mg.textAlign='center';mg.textBaseline='middle';
      for(const ct of T.citta){
        if(range>40000&&ct.n<300) continue;
        const [x,y]=P(ct.x,ct.z);
        if(x<-40||x>MW+40||y<-10||y>MH+10) continue;
        mg.fillStyle='rgba(255,255,255,.85)';mg.fillText(ct.nome,x,y+Math.max(6,ct.r*k*0.8)+5);
      }
    }
    // monumenti: piccolo simbolo dorato e nome (fino a 20 NM di scala)
    if(SIM.listaMonumenti&&range<=40000){
      mg.font=`700 9px ${MONO}`;mg.textAlign='left';mg.textBaseline='middle';
      for(const m of SIM.listaMonumenti){
        const [x,y]=P(m.x,m.z);
        if(x<-60||x>MW+20||y<-10||y>MH+10) continue;
        mg.fillStyle='#ffd27a';mg.strokeStyle='#3b2a06';mg.lineWidth=1;
        mg.beginPath();mg.moveTo(x,y-6);mg.lineTo(x+5,y+4);mg.lineTo(x-5,y+4);mg.closePath();mg.fill();mg.stroke();
        if(range<=20000){mg.fillStyle='rgba(8,14,26,.7)';const w=mg.measureText(m.nome).width;mg.fillRect(x+7,y-6,w+4,12);
          mg.fillStyle='#ffd27a';mg.fillText(m.nome,x+9,y+0.5);}
      }
    }
    // vie di rullaggio e piazzali veri (fino a ~3 NM di scala)
    if(SIM.reteRullaggio&&range<=6000){
      mg.lineCap='round';mg.lineJoin='round';mg.fillStyle=mg.strokeStyle='#8b9097';
      for(const r of SIM.reteRullaggio.tutte()){
        const [ax,ay]=P(r.ap.x,r.ap.z);if(ax<-600||ax>MW+600||ay<-600||ay>MH+600) continue;
        for(const a of r.piazzali){mg.beginPath();a.forEach((q,i)=>{const [x,y]=P(q.x,q.z);i?mg.lineTo(x,y):mg.moveTo(x,y);});mg.closePath();mg.fill();}
        for(const v of r.vie){mg.lineWidth=Math.max(1.5,v.w*k);mg.beginPath();v.pts.forEach((q,i)=>{const [x,y]=P(q.x,q.z);i?mg.lineTo(x,y):mg.moveTo(x,y);});mg.stroke();}
      }
      mg.lineJoin='miter';
    }
    mg.lineCap='butt';
    for(const p of T.piste){
      const [ax,ay]=P(p.testate[0].x,p.testate[0].z),[bx,by]=P(p.testate[1].x,p.testate[1].z);
      mg.strokeStyle='#1f2937';mg.lineWidth=Math.max(3,p.W*k+2);
      mg.beginPath();mg.moveTo(ax,ay);mg.lineTo(bx,by);mg.stroke();
      mg.strokeStyle='#f8fafc';mg.lineWidth=Math.max(1.5,p.W*k);
      mg.beginPath();mg.moveTo(ax,ay);mg.lineTo(bx,by);mg.stroke();
    }
    mg.font=`700 10px ${MONO}`;mg.textAlign='left';mg.textBaseline='middle';
    for(const ap of T.aeroporti){
      const [px,py]=P(ap.x,ap.z),x=px+8,y=py-10;
      mg.fillStyle='rgba(8,14,26,.75)';mg.fillRect(x-2,y-7,mg.measureText(ap.codice).width+4,14);
      mg.fillStyle=ap===dest?'#ff5ad9':'#e8f1f8';mg.fillText(ap.codice,x,y);
    }
    if(radioMappa) disegnaRadioMappa(P,k,range);
    if(rottaMappa&&rottaMappa.punti.length){
      // rotta pianificata (sottile), poi dall'aereo al prossimo punto (piena)
      const pt=rottaMappa.punti.map(p=>P(p.x,p.z)),i0=rottaMappa.prossimo;
      mg.strokeStyle='rgba(255,90,217,.55)';mg.lineWidth=1.5;mg.setLineDash([4,4]);
      mg.beginPath();pt.forEach(([x,y],i)=>i?mg.lineTo(x,y):mg.moveTo(x,y));mg.stroke();mg.setLineDash([]);
      mg.strokeStyle='#ff5ad9';mg.lineWidth=2.2;
      mg.beginPath();mg.moveTo(cx,cy);for(let i=i0;i<pt.length;i++)mg.lineTo(pt[i][0],pt[i][1]);mg.stroke();
      mg.font=`700 9px ${MONO}`;mg.textAlign='left';mg.textBaseline='middle';
      rottaMappa.punti.forEach((p,i)=>{
        if(!p.nome||i===pt.length-1) return;
        const [x,y]=pt[i];
        mg.fillStyle='#ff5ad9';mg.beginPath();mg.moveTo(x,y-5);mg.lineTo(x+5,y);mg.lineTo(x,y+5);mg.lineTo(x-5,y);mg.closePath();mg.fill();
        mg.fillStyle='rgba(8,14,26,.75)';mg.fillRect(x+7,y-6,mg.measureText(p.nome).width+4,12);
        mg.fillStyle='#ff5ad9';mg.fillText(p.nome,x+9,y);
      });
    }else if(dest){
      const [dx,dy]=P(dest.x,dest.z);
      mg.strokeStyle='#ff5ad9';mg.lineWidth=2;mg.setLineDash([6,4]);
      mg.beginPath();mg.moveTo(cx,cy);mg.lineTo(dx,dy);mg.stroke();mg.setLineDash([]);
    }
    // aereo: in "prua" punta sempre in alto
    mg.save();mg.translate(cx,cy);mg.rotate(hdg*D2R-rot);
    mg.fillStyle='#ffb020';mg.strokeStyle='#000';mg.lineWidth=1.5;
    mg.beginPath();mg.moveTo(0,-9);mg.lineTo(6,7);mg.lineTo(0,4);mg.lineTo(-6,7);mg.closePath();mg.fill();mg.stroke();
    mg.restore();
    // indicatore del nord: sul bordo, nella direzione del nord
    const rN=Math.min(cx,cy)-12, nx=cx-sn*rN, ny=cy-c*rN;
    mg.fillStyle='rgba(8,14,26,.8)';mg.beginPath();mg.arc(nx,ny,9,0,Math.PI*2);mg.fill();
    mg.fillStyle='#fbbf24';mg.textAlign='center';mg.fillText('N',nx,ny+1);
    // etichette: modalità e scala
    const etich=orient==='prua'?Lg('PRUA ↑','HDG ↑'):Lg('NORD ↑','NORTH ↑');
    mg.fillStyle='rgba(8,14,26,.75)';mg.fillRect(4,MH-20,56,16);mg.fillRect(MW-58,MH-20,54,16);
    mg.fillStyle='#e8f1f8';
    mg.fillText(etich,32,MH-12);
    mg.fillText(zoom<SCALE_NM.length?SCALE_NM[zoom]+' NM':'TUTTA',MW-31,MH-12);
    mg.restore();
  }

  /* ---------- MFD (schermo destro del G1000 in cabina) ----------
     sup = {g,W,H}; d = {s, hdg, dest, gs kt, trk°, thr} */
  function disegnaMFD(sup,d){
    const c=sup.g,Wm=sup.W,Hm=sup.H;
    c.setTransform(1,0,0,1,0,0);
    c.fillStyle='#05080d';c.fillRect(0,0,Wm,Hm);
    const barra=Math.round(Hm*0.075), eis=Math.round(Wm*0.21);
    // barra superiore
    c.fillStyle='#0d1522';c.fillRect(0,0,Wm,barra);
    c.font=`700 ${Math.round(barra*0.5)}px ${MONO}`;c.textBaseline='middle';c.textAlign='left';
    const dist=d.dest?Math.hypot(d.dest.x-d.s.pos.x,d.dest.z-d.s.pos.z)/1852:0;
    const dtk=d.dest?((Math.atan2(d.dest.x-d.s.pos.x,-(d.dest.z-d.s.pos.z))/D2R)+360)%360:0;
    const ete=d.gs>20&&d.dest?dist/d.gs*60:null;
    const campi=[['GS',Math.round(d.gs)+'KT'],['DTK',String(Math.round(dtk)%360).padStart(3,'0')+'°'],
      ['TRK',d.gs>5?String(Math.round(d.trk)%360).padStart(3,'0')+'°':'---°'],['DIS',dist.toFixed(1)+'NM'],
      ['ETE',ete!=null?String(Math.floor(ete)).padStart(2,'0')+':'+String(Math.round((ete%1)*60)).padStart(2,'0'):'--:--']];
    const passo=(Wm-eis)/campi.length;
    campi.forEach(([k,v],i)=>{const x=eis+8+i*passo;c.fillStyle='#e8eef4';c.fillText(k,x,barra/2);c.fillStyle='#ff5ad9';c.fillText(v,x+c.measureText(k+' ').width,barra/2);});
    // colonna motore (EIS)
    c.fillStyle='#0b111b';c.fillRect(0,barra,eis,Hm-barra);
    c.strokeStyle='#3a4658';c.lineWidth=2;c.beginPath();c.moveTo(eis,barra);c.lineTo(eis,Hm);c.stroke();
    const fs=Math.round(eis*0.085);
    c.textAlign='center';c.fillStyle='#e8eef4';c.font=`700 ${fs}px ${MONO}`;
    c.fillText('ENGINE',eis/2,barra+fs);
    // contagiri ad arco
    const rx=eis/2, ry=barra+fs*2+eis*0.33, rr=eis*0.32, a0=Math.PI*0.8, a1=Math.PI*2.2;
    const ang=v=>a0+(a1-a0)*clamp(v/3000,0,1);
    const arco=(v0,v1,col,w)=>{c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.arc(rx,ry,rr,ang(v0),ang(v1));c.stroke();};
    arco(0,3000,'#2b3445',6);arco(2100,2700,'#22c55e',6);arco(2700,3000,'#ef4444',6);
    const rpm=d.s.rpm, an=ang(rpm);
    c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.moveTo(rx,ry);c.lineTo(rx+Math.cos(an)*rr*0.95,ry+Math.sin(an)*rr*0.95);c.stroke();
    c.fillStyle='#e8eef4';c.font=`700 ${Math.round(fs*1.3)}px ${MONO}`;c.fillText(Math.round(rpm/10)*10,rx,ry+rr*0.55);
    c.font=`700 ${Math.round(fs*0.8)}px ${MONO}`;c.fillStyle='#9fb0c3';c.fillText('RPM',rx,ry+rr*0.95);
    // barre orizzontali
    let y=ry+rr+fs*1.6;
    const barraStr=(nome,val,testo,verdeDa,verdeA)=>{
      c.textAlign='left';c.fillStyle='#e8eef4';c.font=`700 ${Math.round(fs*0.8)}px ${MONO}`;c.fillText(nome,8,y);
      c.textAlign='right';c.fillText(testo,eis-8,y);
      const bx=8,bw=eis-16,by=y+fs*0.55,bh=fs*0.45;
      c.fillStyle='#2b3445';c.fillRect(bx,by,bw,bh);
      c.fillStyle='#22c55e';c.fillRect(bx+bw*verdeDa,by,bw*(verdeA-verdeDa),bh);
      c.fillStyle='#fff';c.beginPath();const px=bx+bw*clamp(val,0,1);c.moveTo(px,by-2);c.lineTo(px-5,by-9);c.lineTo(px+5,by-9);c.closePath();c.fill();
      y+=fs*2.2;
    };
    const ff=d.s.crashed?0:d.s.flusso, acceso=d.s.carburante>0;
    barraStr('FFLOW GPH',ff/14,ff.toFixed(1),0.1,0.85);
    barraStr('OIL PRES',acceso&&d.s.rpm>500?0.45+d.s.rpm/9000:0,acceso&&d.s.rpm>500?String(Math.round(50+d.s.rpm/90)):'0',0.3,0.8);
    barraStr('OIL TEMP',0.55,'185',0.25,0.85);
    const meta=A.carburante.capacita/2, serb=d.s.carburante/2;   // due serbatoi, selettore su "BOTH"
    barraStr('FUEL L GAL',serb/meta,serb.toFixed(1),0.15,1);
    barraStr('FUEL R GAL',serb/meta,serb.toFixed(1),0.15,1);
    const tr=Math.round(d.s.trim*200);
    barraStr('ELEV TRIM',0.5+d.s.trim,(tr>0?'UP ':tr<0?'DN ':'')+Math.abs(tr),0.47,0.6);
    c.textAlign='left';c.fillStyle='#e8eef4';c.font=`700 ${Math.round(fs*0.8)}px ${MONO}`;
    c.fillText('VOLTS',8,y);c.textAlign='right';c.fillText('28.0',eis-8,y);
    // mappa
    disegnaMappa(d.s,d.hdg,d.dest,{g:c,W:Wm-eis-4,H:Hm-barra-4,x:eis+2,y:barra+2});
  }

  /* ---------- strumenti di riserva (velocità, assetto, altimetro) ---------- */
  function disegnaRiserva(sup,d){
    const c=sup.g,Wr=sup.W,Hr=sup.H,r=Hr*0.44;
    c.setTransform(1,0,0,1,0,0);
    c.fillStyle='#202327';c.fillRect(0,0,Wr,Hr);
    const centri=[Wr*0.125,Wr*0.375,Wr*0.625,Wr*0.875];
    const quadrante=(x)=>{c.fillStyle='#0a0a0a';c.beginPath();c.arc(x,Hr/2,r,0,Math.PI*2);c.fill();
      c.strokeStyle='#8a8f96';c.lineWidth=r*0.08;c.beginPath();c.arc(x,Hr/2,r*1.02,0,Math.PI*2);c.stroke();};
    const tacche=(x,n,dal,al,lung,cb)=>{for(let i=0;i<=n;i++){const a=dal+(al-dal)*i/n;c.strokeStyle='#fff';c.lineWidth=2;
      c.beginPath();c.moveTo(x+Math.cos(a)*r*0.9,Hr/2+Math.sin(a)*r*0.9);c.lineTo(x+Math.cos(a)*r*(0.9-lung),Hr/2+Math.sin(a)*r*(0.9-lung));c.stroke();if(cb)cb(i,a);}};
    const lancetta=(x,a,l,w)=>{c.strokeStyle='#fff';c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x,Hr/2);c.lineTo(x+Math.cos(a)*r*l,Hr/2+Math.sin(a)*r*l);c.stroke();c.lineCap='butt';};
    // anemometro: 0-200 kt su 330°
    let x=centri[0];quadrante(x);
    const aS=-Math.PI/2, kA=v=>aS+clamp(v,0,200)/200*Math.PI*1.83;
    const archetto=(v0,v1,col,rr)=>{c.strokeStyle=col;c.lineWidth=r*0.09;c.beginPath();c.arc(x,Hr/2,r*rr,kA(v0),kA(v1));c.stroke();};
    archetto(V.vso,V.vfe,'#f4f6f8',0.72);archetto(V.vs1,V.vno,'#22c55e',0.84);archetto(V.vno,V.vne,'#eab308',0.84);
    c.font=`700 ${Math.round(r*0.22)}px ${MONO}`;c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';
    tacche(x,20,kA(0),kA(200),0.12,(i,a)=>{if(i%4===0&&i)c.fillText(i*10,x+Math.cos(a)*r*0.55,Hr/2+Math.sin(a)*r*0.55);});
    lancetta(x,kA(d.ias),0.85,3);
    // orizzonte di riserva
    x=centri[1];
    c.save();c.beginPath();c.arc(x,Hr/2,r,0,Math.PI*2);c.clip();
    c.translate(x,Hr/2);c.rotate(-d.bank);c.translate(0,d.pitch*r/30);
    c.fillStyle='#2f78c4';c.fillRect(-r*3,-r*3,r*6,r*3);c.fillStyle='#7a4f26';c.fillRect(-r*3,0,r*6,r*3);
    c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.moveTo(-r*3,0);c.lineTo(r*3,0);c.stroke();
    for(const p of [-20,-10,10,20]){const yy=-p*r/30,w=Math.abs(p)===10?r*0.25:r*0.4;c.beginPath();c.moveTo(-w,yy);c.lineTo(w,yy);c.stroke();}
    c.restore();
    c.strokeStyle='#8a8f96';c.lineWidth=r*0.08;c.beginPath();c.arc(x,Hr/2,r*1.02,0,Math.PI*2);c.stroke();
    c.strokeStyle='#ffb020';c.lineWidth=4;c.beginPath();c.moveTo(x-r*0.55,Hr/2);c.lineTo(x-r*0.18,Hr/2);c.lineTo(x,Hr/2+r*0.12);c.lineTo(x+r*0.18,Hr/2);c.lineTo(x+r*0.55,Hr/2);c.stroke();
    // altimetro: lancetta lunga = centinaia, corta = migliaia
    x=centri[2];quadrante(x);
    c.fillStyle='#fff';
    tacche(x,50,-Math.PI/2,Math.PI*1.5-Math.PI*2/50,0.08,(i,a)=>{if(i%5===0)c.fillText(i/5,x+Math.cos(a)*r*0.62,Hr/2+Math.sin(a)*r*0.62);});
    const alt=Math.max(0,d.alt);
    lancetta(x,-Math.PI/2+(alt%1000)/1000*Math.PI*2,0.85,3);
    lancetta(x,-Math.PI/2+(alt%10000)/10000*Math.PI*2,0.5,5);
    virosbandometro(c,centri[3],Hr/2,r,d.virata,d.palla);
  }

  return {
    disegnaPFD, disegnaMappa, disegnaMFD, disegnaRiserva, disegnaAux, adatta,
    cambiaZoom(){impostaZoom((zoom+1)%scale.length);},
    zoomPiu(){impostaZoom(zoom-1);},     // più dettaglio
    zoomMeno(){impostaZoom(zoom+1);},    // più zona visibile
    impostaZoom, get zoom(){return zoom;},
    scale:()=>scale.map((_,i)=>nomeScala(i)),
    onZoom(fn){alCambioZoom=fn;},
    ridisegnaMappa(){if(ultimaMappa)disegnaMappa(...ultimaMappa);},
    impostaRotta(r){rottaMappa=r;},
    impostaRadio(r){radioMappa=r;},
    impostaNav(n){navMappa=n;if(ultimaMappa)disegnaMappa(...ultimaMappa);},
    cambiaOrientamento(){
      orient=orient==='nord'?'prua':'nord';
      try{localStorage.setItem('volo-mappa-orient',orient);}catch(e){}
      if(ultimaMappa)disegnaMappa(...ultimaMappa);
      return orient;
    },
  };
};
})();
