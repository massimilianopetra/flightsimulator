/* =====================================================================
   AUDIO sintetizzato (Web Audio): motore, vento, rotolamento,
   avvisatore di stallo e colpo all'atterraggio. Niente file esterni.
   ===================================================================== */
(function(){
'use strict';
const SIM = window.SIM = window.SIM || {};

SIM.creaAudio=function(){
  let ctx=null, n=null, attivo=true;
  try{attivo=localStorage.getItem('volo-audio')!=='0';}catch(e){}

  function avvia(){
    if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    ctx=new AC();
    const master=ctx.createGain();master.gain.value=attivo?0.6:0;master.connect(ctx.destination);
    const osc=(tipo,f)=>{const o=ctx.createOscillator();o.type=tipo;o.frequency.value=f;o.start();return o;};
    const gain=(v,dest)=>{const g=ctx.createGain();g.gain.value=v;g.connect(dest);return g;};
    // motore: dente di sega + sottarmonica, filtrati
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=300;lp.Q.value=2;
    const gMot=gain(0,master);lp.connect(gMot);
    const o1=osc('sawtooth',40),o2=osc('square',20);
    const g2=gain(0.35,lp);o1.connect(lp);o2.connect(g2);
    // rumore bianco per vento e ruote
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const rum=ctx.createBufferSource();rum.buffer=buf;rum.loop=true;rum.start();
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=700;bp.Q.value=0.5;
    const gVento=gain(0,master);rum.connect(bp);bp.connect(gVento);
    const lp2=ctx.createBiquadFilter();lp2.type='lowpass';lp2.frequency.value=160;
    const gRuote=gain(0,master);rum.connect(lp2);lp2.connect(gRuote);
    // avvisatore di stallo
    const corno=osc('square',520),gCorno=gain(0,master);
    const lp3=ctx.createBiquadFilter();lp3.type='lowpass';lp3.frequency.value=1400;corno.connect(lp3);lp3.connect(gCorno);
    n={master,lp,gMot,o1,o2,gVento,gRuote,gCorno,bp,rum,buf};
  }

  function aggiorna(s,pausa){
    if(!ctx||!n) return;
    const t=ctx.currentTime, on=!s.crashed&&!pausa;
    const f=s.rpm/60*2; // scoppi al secondo di un 4 cilindri
    n.o1.frequency.setTargetAtTime(f,t,0.05);
    n.o2.frequency.setTargetAtTime(f/2,t,0.05);
    n.lp.frequency.setTargetAtTime(180+s.rpm*0.35,t,0.1);
    n.gMot.gain.setTargetAtTime(on?0.10+0.16*(s.rpm/2700):0,t,0.08);
    const v=s.ias/60;
    n.gVento.gain.setTargetAtTime(on?Math.min(0.22,v*v*0.12):0,t,0.2);
    n.bp.frequency.setTargetAtTime(500+s.ias*12,t,0.2);
    n.gRuote.gain.setTargetAtTime(on&&s.aTerra?Math.min(0.5,s.gs/25*0.5):0,t,0.08);
    n.gCorno.gain.setTargetAtTime(on&&s.avvisoStallo?0.07:0,t,0.03);
  }

  function colpo(forza){
    if(!ctx||!n) return;
    const t=ctx.currentTime;
    const src=ctx.createBufferSource();src.buffer=n.buf;
    const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=250;
    const g=ctx.createGain();g.gain.setValueAtTime(Math.min(1,0.25+forza),t);g.gain.exponentialRampToValueAtTime(0.001,t+0.35);
    src.connect(f);f.connect(g);g.connect(n.master);src.start(t,Math.random());src.stop(t+0.4);
  }

  return {
    avvia, aggiorna, colpo,
    get attivo(){return attivo;},
    alterna(){
      attivo=!attivo;
      try{localStorage.setItem('volo-audio',attivo?'1':'0');}catch(e){}
      if(n) n.master.gain.setTargetAtTime(attivo?0.6:0,ctx.currentTime,0.05);
      return attivo;
    },
  };
};
})();
