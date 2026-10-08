/* =====================================================================
   STRUMENTI: PFD (Primary Flight Display) e minimappa.
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};
const D2R=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const MONO='"B612 Mono", ui-monospace, monospace';

SIM.creaStrumenti=function(A){
  const T=SIM.terreno, M=window.MAPPA||{};
  const pfd=document.getElementById('pfd'), g=pfd.getContext('2d');
  const mappa=document.getElementById('minimap'), mg=mappa.getContext('2d');
  let W=0,H=0,dpr=1,MW=0,MH=0;
  function adatta(){
    dpr=Math.min(2,window.devicePixelRatio||1);
    const r=pfd.getBoundingClientRect();W=r.width;H=r.height;
    pfd.width=Math.max(1,Math.round(W*dpr));pfd.height=Math.max(1,Math.round(H*dpr));
    const r2=mappa.getBoundingClientRect();MW=r2.width;MH=r2.height;
    mappa.width=Math.max(1,Math.round(MW*dpr));mappa.height=Math.max(1,Math.round(MH*dpr));
  }
  window.addEventListener('resize',()=>{adatta();if(ultimaMappa)disegnaMappa(...ultimaMappa);});adatta();
  const V=A.velocita;

  function box(x,y,w,h){g.fillStyle='#000';g.strokeStyle='#e8eef4';g.lineWidth=1.5;g.fillRect(x,y,w,h);g.strokeRect(x,y,w,h);}

  /* d = {pitch°, bank rad, ias kt, alt ft, agl ft, vs ft/min, hdg°, palla -1..1, bug° o null, gs kt} */
  function disegnaPFD(d){
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
    g.fillText('ALT ft',ax+2,ty-fs*0.7);
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

    /* ---- bussola (nastro di prua) ---- */
    g.fillStyle='#0b1322';g.fillRect(0,AH,W,HB);
    g.save();g.beginPath();g.rect(0,AH,W,HB);g.clip();
    const pd=W/90;
    g.strokeStyle='#fff';g.fillStyle='#fff';g.lineWidth=1.5;g.textAlign='center';g.textBaseline='middle';g.font=`700 ${fs}px ${MONO}`;
    const card={0:'N',90:'E',180:'S',270:'O'};
    for(let h=Math.floor((d.hdg-50)/5)*5;h<=d.hdg+50;h+=5){
      const x=cx+(h-d.hdg)*pd,hh=((h%360)+360)%360;
      g.beginPath();g.moveTo(x,AH);g.lineTo(x,AH+(hh%10?5:10));g.stroke();
      if(hh%10===0){g.fillStyle=card[hh]?'#fbbf24':'#fff';g.fillText(card[hh]||String(hh/10|0).padStart(2,'0'),x,AH+HB*0.62);}
    }
    if(d.bug!=null){ // direzione verso la destinazione
      let rel=((d.bug-d.hdg+540)%360)-180;
      const x=clamp(cx+rel*pd,8,W-8);
      g.fillStyle='#ff5ad9';g.beginPath();g.moveTo(x,AH+1);g.lineTo(x-6,AH+9);g.lineTo(x+6,AH+9);g.closePath();g.fill();
    }
    g.restore();
    box(cx-fs*1.7,AH+2,fs*3.4,HB-4);
    g.fillStyle='#fff';g.font=`700 ${Math.round(fs*1.15)}px ${MONO}`;g.textAlign='center';
    g.fillText(String(Math.round(d.hdg)%360).padStart(3,'0')+'°',cx,AH+HB/2+1);
    g.fillStyle='#ffb020';g.beginPath();g.moveTo(cx,AH-1);g.lineTo(cx-6,AH-9);g.lineTo(cx+6,AH-9);g.closePath();g.fill();
  }

  /* ---------- minimappa ---------- */
  const EST=M.dimensione||30000, RES=320;
  const sfondo=document.createElement('canvas');sfondo.width=sfondo.height=RES;
  (function prerender(){
    const c=sfondo.getContext('2d'),img=c.createImageData(RES,RES),Hm=new Float32Array(RES*RES),cell=EST/RES;
    for(let j=0;j<RES;j++)for(let i=0;i<RES;i++)Hm[j*RES+i]=T.terrainH(-EST/2+(i+.5)*cell,-EST/2+(j+.5)*cell);
    for(let j=0;j<RES;j++)for(let i=0;i<RES;i++){
      const h=Hm[j*RES+i],x=-EST/2+(i+.5)*cell,z=-EST/2+(j+.5)*cell;
      let r,gg,b,acqua=h<0;
      for(const l of T.laghi)if(Math.hypot(x-l.x,z-l.z)<l.r&&h<l.q)acqua=true;
      if(acqua){r=44;gg=106;b=150;}
      else{
        const t=clamp(h/1400,0,1);
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
  const scale=[5000,12000,EST];
  let zoom=1;

  let ultimaMappa=null;
  function disegnaMappa(s,hdg,dest){
    ultimaMappa=[s,hdg,dest];
    if(!MW) adatta();
    if(!MW) return;
    mg.setTransform(dpr,0,0,dpr,0,0);
    const range=scale[zoom], k=MW/range, ox=MW/2-s.pos.x*k, oz=MH/2-s.pos.z*k;
    const X=x=>ox+x*k, Z=z=>oz+z*k;
    mg.fillStyle='#22405a';mg.fillRect(0,0,MW,MH);
    mg.imageSmoothingEnabled=true;
    mg.drawImage(sfondo,X(-EST/2),Z(-EST/2),EST*k,EST*k);
    mg.fillStyle='rgba(60,60,60,.55)';
    for(const c of T.citta){mg.beginPath();mg.arc(X(c.x),Z(c.z),Math.max(2,c.r*k*0.8),0,Math.PI*2);mg.fill();}
    mg.lineCap='butt';
    for(const p of T.piste){
      const a=p.testate[0],b=p.testate[1];
      mg.strokeStyle='#1f2937';mg.lineWidth=Math.max(3,p.W*k+2);
      mg.beginPath();mg.moveTo(X(a.x),Z(a.z));mg.lineTo(X(b.x),Z(b.z));mg.stroke();
      mg.strokeStyle='#f8fafc';mg.lineWidth=Math.max(1.5,p.W*k);
      mg.beginPath();mg.moveTo(X(a.x),Z(a.z));mg.lineTo(X(b.x),Z(b.z));mg.stroke();
    }
    mg.font=`700 10px ${MONO}`;mg.textAlign='left';mg.textBaseline='middle';
    for(const ap of T.aeroporti){
      const x=X(ap.x)+8,y=Z(ap.z)-10;
      mg.fillStyle='rgba(8,14,26,.75)';mg.fillRect(x-2,y-7,mg.measureText(ap.codice).width+4,14);
      mg.fillStyle=ap===dest?'#ff5ad9':'#e8f1f8';mg.fillText(ap.codice,x,y);
    }
    if(dest){
      mg.strokeStyle='#ff5ad9';mg.lineWidth=2;mg.setLineDash([6,4]);
      mg.beginPath();mg.moveTo(MW/2,MH/2);mg.lineTo(X(dest.x),Z(dest.z));mg.stroke();mg.setLineDash([]);
    }
    mg.save();mg.translate(MW/2,MH/2);mg.rotate(hdg*D2R);
    mg.fillStyle='#ffb020';mg.strokeStyle='#000';mg.lineWidth=1.5;
    mg.beginPath();mg.moveTo(0,-9);mg.lineTo(6,7);mg.lineTo(0,4);mg.lineTo(-6,7);mg.closePath();mg.fill();mg.stroke();
    mg.restore();
    mg.fillStyle='rgba(8,14,26,.75)';mg.fillRect(4,4,18,16);mg.fillRect(MW-58,MH-20,54,16);
    mg.fillStyle='#e8f1f8';mg.textAlign='center';mg.fillText('N',13,12);
    mg.fillText((range/1852).toFixed(range<10000?1:0)+' NM',MW-31,MH-12);
  }

  return {
    disegnaPFD, disegnaMappa, adatta,
    cambiaZoom(){zoom=(zoom+1)%scale.length;},
  };
};
})();
