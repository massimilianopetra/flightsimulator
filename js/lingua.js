/* =====================================================================
   LINGUA: italiano (predefinito) o inglese.
   Si sceglie nel briefing oppure con l'indirizzo: index.html?lang=en
   La scelta viene ricordata. Nel codice i testi si scrivono così:
     SIM.L('testo italiano', 'English text')
   Nella pagina gli elementi hanno la versione inglese negli attributi:
     data-en (contenuto), data-en-title, data-en-aria (aria-label), data-en-href
   ===================================================================== */
(function(){
'use strict';
var SIM=window.SIM=window.SIM||{};
var lingua='it';
var m=/[?&]lang=(it|en)\b/.exec(location.search);
try{
  if(m) localStorage.setItem('volo-lingua',m[1]);
  var s=localStorage.getItem('volo-lingua');
  if(s==='it'||s==='en') lingua=s;
}catch(e){}
if(m) lingua=m[1];
SIM.lingua=lingua;
SIM.L=function(it,en){return lingua==='en'?en:it;};

// cambia lingua: ricarica la pagina mantenendo il mondo scelto
SIM.cambiaLingua=function(l){
  try{localStorage.setItem('volo-lingua',l);}catch(e){}
  var q=location.search.replace(/[?&]lang=(it|en)\b/,'').replace(/^&/,'?');
  location.search=(q&&q!=='?'?q+'&':'?')+'lang='+l;
};

// traduce la pagina già caricata
document.documentElement.lang=lingua;
if(lingua==='en'){
  var dt=document.documentElement.getAttribute('data-en-title');
  if(dt) document.title=dt;
  var tutti=document.querySelectorAll('[data-en],[data-en-title],[data-en-aria],[data-en-href]');
  for(var i=0;i<tutti.length;i++){
    var el=tutti[i];
    if(el.hasAttribute('data-en')) el.innerHTML=el.getAttribute('data-en');
    if(el.hasAttribute('data-en-title')) el.title=el.getAttribute('data-en-title');
    if(el.hasAttribute('data-en-aria')) el.setAttribute('aria-label',el.getAttribute('data-en-aria'));
    if(el.hasAttribute('data-en-href')) el.setAttribute('href',el.getAttribute('data-en-href'));
  }
}
})();
