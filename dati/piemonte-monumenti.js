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
   I dati contenuti restano sotto la licenza della loro fonte (vedi sotto).
   ---------------------------------------------------------------------
   MONUMENTI DEL PIEMONTE (solo mondo "Piemonte")
   ---------------------------------------------------------------------
   Posizioni da OpenStreetMap (Nominatim) controllate sulla mappa; le forme
   sono modelli semplificati costruiti in js/monumenti.js (una funzione
   per ogni "tipo").
     lat, lon   posizione (gradi)
     rotta      direzione dell'asse principale dell'edificio (gradi bussola)
     altezza    altezza vera in metri (solo informativa: la usa la mappa)
     mappa      false = non compare sulla mappa (né simbolo né nome)
   Questo file si può modificare a mano: per esempio spostare un monumento
   cambiando lat e lon, o toglierlo cancellando la sua riga.
   Dati © OpenStreetMap contributors (ODbL).
   ===================================================================== */
window.MONUMENTI = [
  { tipo: "mole",       nome: "Mole Antonelliana",                nomeEn: "Mole Antonelliana",              lat: 45.06899, lon: 7.69319, rotta: 28,  altezza: 167 },
  { tipo: "superga",    nome: "Basilica di Superga",              nomeEn: "Superga Basilica",               lat: 45.08073, lon: 7.76723, rotta: 71,  altezza: 75 },
  { tipo: "lingotto",   nome: "Lingotto",                         nomeEn: "Lingotto",                       lat: 45.03210, lon: 7.66520, rotta: 15,  altezza: 27 },
  { tipo: "regione",    nome: "Grattacielo della Regione",        nomeEn: "Piedmont Region Tower",          lat: 45.02462, lon: 7.66317, rotta: 16,  altezza: 209 },
  { tipo: "intesa",     nome: "Grattacielo Intesa Sanpaolo",      nomeEn: "Intesa Sanpaolo Tower",          lat: 45.06963, lon: 7.66286, rotta: 26,  altezza: 166 },
  { tipo: "venaria",    nome: "Reggia di Venaria",                nomeEn: "Palace of Venaria",              lat: 45.13582, lon: 7.62336, rotta: 0,   altezza: 25 },
  { tipo: "stupinigi",  nome: "Palazzina di Stupinigi",           nomeEn: "Stupinigi Hunting Lodge",        lat: 44.99515, lon: 7.60556, rotta: 39,  altezza: 37 },
  { tipo: "sacra",      nome: "Sacra di San Michele",             nomeEn: "Sacra di San Michele Abbey",     lat: 45.09799, lon: 7.34305, rotta: 169, altezza: 40 },
  { tipo: "vicoforte",  nome: "Santuario di Vicoforte",           nomeEn: "Sanctuary of Vicoforte",         lat: 44.36359, lon: 7.86287, rotta: 150, altezza: 75 },
  { tipo: "gaudenzio",  nome: "Basilica di San Gaudenzio",        nomeEn: "Basilica of San Gaudenzio",      lat: 45.44875, lon: 8.61943, rotta: 91,  altezza: 121 },
  { tipo: "oropa",      nome: "Santuario di Oropa",               nomeEn: "Sanctuary of Oropa",             lat: 45.62895, lon: 7.97788, rotta: 133, altezza: 80 },
  { tipo: "campanileSM", nome: "Campanile di San Maurizio",        nomeEn: "San Maurizio bell tower",        lat: 45.21903, lon: 7.63199, rotta: 20,  altezza: 62 },
  { tipo: "chiesaSM",    nome: "Chiesa di San Maurizio Martire",   nomeEn: "Church of San Maurizio",         lat: 45.21921, lon: 7.63198, rotta: 21,  altezza: 17, mappa: false },
  { tipo: "villetta",    nome: "",                                 nomeEn: "",                               lat: 45.21039, lon: 7.63542, rotta: 350, altezza: 9,  mappa: false },
];
