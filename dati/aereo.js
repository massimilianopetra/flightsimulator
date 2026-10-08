/* =====================================================================
   PARAMETRI DELL'AEREO  —  ispirati a un Cessna 172 Skyhawk
   ---------------------------------------------------------------------
   Unità SI: metri, chilogrammi, secondi, Newton. Angoli in gradi.
   Coordinate "corpo" dell'aereo, con origine nel baricentro:
     x = verso l'ala destra, y = verso l'alto, z = verso la CODA
     (quindi il muso è a z negativo).
   I coefficienti aerodinamici (CL, CD, Cm, ...) sono quelli usati nei
   libri di meccanica del volo: puoi provare a cambiarli e vedere
   come cambia il comportamento dell'aereo.
   ===================================================================== */

window.AEREO = {
  nome: "Cessna 172 Skyhawk",

  massa: 1000,                 // kg (aereo + pilota + carburante)
  inerzia: {                   // kg·m²: più alto = l'aereo ruota più lentamente
    beccheggio: 1825,          // muso su/giù
    imbardata: 2667,           // muso destra/sinistra
    rollio: 1285,              // ali su/giù
  },

  ala: { superficie: 16.2, apertura: 11.0, corda: 1.49 },

  motore: {
    spintaStatica: 2800,       // N di spinta da fermo a tutta manetta
    velocitaMaxElica: 102,     // m/s: velocità alla quale l'elica non spinge più
    diametroElica: 1.9,        // m
    giriMin: 650, giriMax: 2700,
  },

  // velocità di riferimento in NODI (colori del tachimetro e briefing)
  velocita: {
    vso: 40,      // stallo con flap
    vs1: 48,      // stallo senza flap
    vr: 55,       // rotazione (alzare il muso in decollo)
    vy: 74,       // miglior salita
    vfe: 85,      // massima con flap estesi
    vno: 129,     // massima di crociera (fine arco verde)
    vne: 163,     // da non superare mai
    avvicinamento: 65,
  },

  aero: {
    CL0: 0.35,  CLalfa: 4.9,  CLq: 3.9,  CLde: 0.43,   // portanza
    alfaStallo: 16,                                    // gradi
    CD0: 0.027, e: 0.75,                               // resistenza
    CYbeta: -0.6, CYdr: 0.15,                          // forza laterale
    Cm0: 0.04,  Cmalfa: -0.89, Cmq: -12.4, Cmde: 1.28, Cmflap: -0.03,  // beccheggio
    Clbeta: -0.089, Clp: -0.47, Clr: 0.096, Clda: 0.178, Cldr: 0.0147, // rollio
    Cnbeta: 0.065,  Cnp: -0.03, Cnr: -0.099, Cnda: -0.053, Cndr: 0.0657, // imbardata
  },

  // escursione massima delle superfici di comando (gradi)
  comandi: { elevatore: 25, alettoni: 18, timone: 16, ruotino: 25 },

  flap: {
    posizioni: [0, 10, 20, 30],  // gradi
    CL: 0.5,                     // portanza in più a flap 30
    CD: 0.05,                    // resistenza in più a flap 30
    secondiPerTacca: 1.6,
  },

  // ruote: posizione del punto di contatto con il suolo (coordinate corpo)
  carrello: [
    { nome: "anteriore", x:  0,    y: -1.45, z: -1.7, rigidezza: 40000, smorzamento: 3200, sterzante: true },
    { nome: "sinistra",  x: -1.25, y: -1.45, z:  0.3, rigidezza: 60000, smorzamento: 6000, freno: true },
    { nome: "destra",    x:  1.25, y: -1.45, z:  0.3, rigidezza: 60000, smorzamento: 6000, freno: true },
    { nome: "coda",      x:  0,    y: -0.40, z:  4.3, rigidezza: 30000, smorzamento: 2500, pattino: true },
  ],

  // punti che NON devono toccare terra (altrimenti è un incidente)
  puntiUrto: [
    { x:  0,    y: -0.95, z: -3.0, motivo: "L'elica ha toccato terra" },
    { x: -5.5,  y:  0.85, z: -0.5, motivo: "L'ala sinistra ha toccato terra" },
    { x:  5.5,  y:  0.85, z: -0.5, motivo: "L'ala destra ha toccato terra" },
    { x:  0,    y: -0.70, z: -0.6, motivo: "La fusoliera ha toccato terra" },
  ],

  limiti: {
    vsContatto: 3.6,     // m/s: velocità verticale massima all'impatto delle ruote (~700 ft/min)
    gMax: 5.7, gMin: -2.3,
  },

  occhioPilota: { x: -0.1, y: 0.6, z: -0.15 },  // punto di vista in cabina (un po' verso il centro, per vedere tutto il pannello)
};
