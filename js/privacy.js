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
