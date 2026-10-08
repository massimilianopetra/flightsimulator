/* =====================================================================
   MAPPA DEL MONDO  —  modifica liberamente questo file!
   ---------------------------------------------------------------------
   UNITÀ
     • Distanze e coordinate in METRI.
     • x = verso EST (negativo = ovest), y = verso NORD (negativo = sud).
       Il punto (0, 0) è il centro del mondo.
     • Direzioni in GRADI DI BUSSOLA: 0 = nord, 90 = est, 180 = sud, 270 = ovest.
     • Quote (altitudini) in metri sul livello del mare.
       Per aeroporti e laghi puoi scrivere  quota: "auto"  e verrà presa
       l'altezza del terreno in quel punto.

   Dopo ogni modifica salva il file e ricarica la pagina (F5).
   Se la pagina resta vuota, apri la console (F12): di solito manca
   una virgola o una parentesi.
   ===================================================================== */

window.MAPPA = {
  nome: "Valle Azzurra",

  // lato del quadrato rappresentato nella minimappa (il terreno continua oltre)
  dimensione: 34000,

  /* ---------- COLLINE GENERATE AUTOMATICAMENTE ---------- */
  terreno: {
    seme: 4,            // cambia il numero per ottenere colline e coste completamente diverse
    scala: 1100,        // larghezza tipica di una collina (m): più grande = colline più ampie
    altezza: 700,       // quanto possono salire le colline generate
    livelloMare: 0.36,  // da 0 a 1: più alto = più mare
  },

  /* ---------- MONTAGNE AGGIUNTE A MANO ----------
     Si sommano alle colline. raggio = quanto è larga la base. */
  montagne: [
    { nome: "Monte Alto",       x: -11000, y:  11000, raggio: 4500, altezza: 1700 },
    { nome: "Cresta del Lupo",  x:   5000, y:  13500, raggio: 3000, altezza:  900 },
    { nome: "Altopiano",        x:   9000, y:   7000, raggio: 4500, altezza:  420 },
  ],

  /* ---------- LAGHI ----------
     quota = livello dell'acqua (metri), oppure "auto". */
  laghi: [
    { nome: "Lago Verde",       x:  -6500, y:  -3500, raggio: 1200, quota: "auto" },
  ],

  /* ---------- AEROPORTI ----------
     Ogni pista ha una direzione: i numeri delle due testate vengono calcolati
     da soli (direzione 90 → testate "09" e "27").
     spostamentoEst / spostamentoNord (facoltativi) spostano la pista rispetto
     al centro dell'aeroporto: servono per aggiungere una seconda pista. */
  aeroporti: [
    {
      codice: "LIVA", nome: "Valle Azzurra",
      x: 600, y: 2200, quota: "auto",
      piste: [ { direzione: 90, lunghezza: 1400, larghezza: 30 } ],
    },
    {
      codice: "LIMB", nome: "Montebello",
      x: 9000, y: 7000, quota: "auto",
      piste: [ { direzione: 150, lunghezza: 900, larghezza: 23 } ],
    },
    {
      codice: "LIPM", nome: "Porto Marina",
      x: -5300, y: -7200, quota: "auto",
      piste: [ { direzione: 90, lunghezza: 1800, larghezza: 45 } ],
    },
  ],

  /* ---------- PAESI E CITTÀ ---------- */
  citta: [
    { nome: "Borgo Azzurro",    x:   2800, y:   4600, raggio: 650, edifici: 110 },
    { nome: "Montebello",       x:   6900, y:   5400, raggio: 380, edifici:  45 },
    { nome: "Porto Marina",     x:  -5200, y: -10300, raggio: 550, edifici:  80 },
  ],

  /* ---------- BOSCHI ---------- */
  boschi: [
    { x:  -3000, y:   6000, raggio: 1500, alberi: 500 },
    { x:   5000, y:  -1500, raggio: 1100, alberi: 350 },
    { x:  -9000, y:  -1000, raggio: 1600, alberi: 500 },
    { x:   3000, y:  10500, raggio: 1600, alberi: 450 },
    { x:   2500, y:  -7000, raggio: 1200, alberi: 350 },
  ],
  alberiSparsi: 2500,   // alberi isolati sparsi per la campagna

  /* ---------- METEO ---------- */
  meteo: {
    ventoDa: 270,     // da dove soffia il vento (gradi). 270 = da ovest
    ventoNodi: 6,     // intensità media del vento (nodi)
    raffiche: 3,      // variazione delle raffiche (nodi). 0 = vento costante
    nuvole: 35,       // quantità di nuvole (0 = sereno, 100 = molto nuvoloso)
    baseNuvole: 1300, // altezza della base delle nuvole (m)
  },

  /* ---------- DOVE SI PARTE ----------
     Sulla pista:   { aeroporto: "LIVA", pista: "27" }
     In volo:       { x: 0, y: -3000, quota: 600, direzione: 0, velocitaNodi: 100 } */
  partenza: { aeroporto: "LIVA", pista: "27" },
};
