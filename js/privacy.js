/* =====================================================================
   AVVISO PRIVACY: il gioco non usa cookie; tiene solo impostazioni e
   libretto nel localStorage del browser (memoria tecnica, necessaria al
   gioco). L'avviso compare finché non si preme "Ho capito"; la scelta
   resta in localStorage 'volo-privacy'. Dettagli in privacy.html.
   ===================================================================== */
(function(){
'use strict';
var box=document.getElementById('privacy');
if(!box) return;
var visto=false;
try{visto=localStorage.getItem('volo-privacy')==='1';}catch(e){}
if(visto) return;
box.hidden=false;
document.getElementById('privacyOk').addEventListener('click',function(){
  try{localStorage.setItem('volo-privacy','1');}catch(e){}
  box.hidden=true;
});
})();
