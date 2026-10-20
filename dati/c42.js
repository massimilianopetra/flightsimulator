/* =====================================================================
   PARAMETRI DELL'AEREO  —  Comco Ikarus C42 (ultraleggero, VDS)
   ---------------------------------------------------------------------
   Dati dal manuale di volo del C42 (Owner's Manual, Rotax 912 da 80 CV,
   peso massimo 450 kg): velocità, flap, carburante, prestazioni.
   Stesse unità e stessi assi di dati/c172.js (x destra, y su, z coda).
   Dotazioni come la versione di serie: strumenti analogici, radio COM e
   transponder; NIENTE autopilota, NIENTE ricevitore VOR/ILS, niente
   orizzonte artificiale (gli ultraleggeri volano solo a vista e di giorno).
   ---------------------------------------------------------------------
   Volo — simulatore di volo nel browser
   Autore: Massimiliano Petra <massimiliano.petra@gmail.com>
   Copyright (C) 2026 Massimiliano Petra
   Licenza: GNU General Public License versione 3 o successiva
   (GPL-3.0-or-later). Questo programma è software libero: puoi
   ridistribuirlo e/o modificarlo secondo i termini della GNU GPL
   pubblicata dalla Free Software Foundation, versione 3 o (a tua scelta)
   qualunque versione successiva. È distribuito SENZA ALCUNA GARANZIA.
   Testo completo nel file LICENSE.
   ===================================================================== */

window.AEREO = {
  id: "c42",
  nome: "Ikarus C42",
  soggetto: ["L'Ikarus C42", "The Ikarus C42"],   // per le frasi: «L'Ikarus C42 non ha…»
  tipoRadio: { d: "Ikarus C42", s: "Ikarus Charlie four two" },  // come si presenta alla radio
  registrazione: "I-A742",     // marche VDS italiane: I- e quattro caratteri

  // cosa c'è a bordo (il gioco nasconde il resto)
  dotazioni: {
    g1000: false,              // cruscotto analogico
    autopilota: false,
    nav: false,                // nessun ricevitore VOR/ILS: solo radio COM
    notte: false,              // VDS: si vola solo di giorno
  },

  massa: 450,                  // kg: peso massimo al decollo (2 persone e carburante)
  inerzia: {                   // kg·m²: molto più piccole del Cessna (aereo leggero e corto)
    beccheggio: 480,
    imbardata: 800,
    rollio: 420,
  },

  ala: { superficie: 12.5, apertura: 9.45, corda: 1.32 },   // ala rettangolare in tela

  motore: {                    // Rotax 912 UL, 80 CV, riduttore 2,27:1; i giri sono quelli del MOTORE
    spintaStatica: 1750,       // N da fermo a tutta manetta (elica tripala da 1,7 m)
    velocitaMaxElica: 100,     // m/s
    diametroElica: 1.7,
    giriMin: 1600,             // minimo (manuale: non oltre 1750)
    giriMax: 5800,             // 5500 massimo continuo, 5800 per 5 minuti
    giriVolo: 4500,            // crociera tipica
    rosso: 5800, giallo: 5500, // tacche del contagiri
  },

  carburante: {                // LITRI di benzina auto (serbatoio dietro i sedili)
    unita: "l",
    capacita: 65,              // utilizzabili (serbatoio da 65 l)
    consumoMin: 2.5,           // l/h al minimo
    consumoMax: 24,            // l/h a 5800 giri al livello del mare (Rotax 912 UL); a 4500 giri circa 12,5 (manuale: 12,7)
    scelte: [                  // nel briefing: [litri, testo, testo inglese]
      [65, "Pieno: 65 l (circa 5 ore)", "Full: 65 l (about 5 hours)"],
      [32.5, "Metà: 32,5 l (circa 2 ore e mezza)", "Half: 32.5 l (about 2½ hours)"],
      [10, "Riserva: 10 l (circa 45 minuti)", "Reserve: 10 l (about 45 minutes)"],
      [3, "Quasi vuoto: 3 l (circa 15 minuti)", "Almost empty: 3 l (about 15 minutes)"],
    ],
  },

  // velocità di riferimento in NODI (manuale di volo, sezioni 1, 4 e 9)
  velocita: {
    vso: 32,      // stallo con flap tutti giù (40°)
    vs1: 41,      // stallo senza flap
    vr: 35,       // il ruotino si alza a 26 kt, l'aereo si stacca a circa 38
    vx: 48,       // miglior angolo di salita (flap 15°)
    vy: 60,       // miglior rateo di salita (flap 15°)
    vfe: 63,      // massima con i flap
    vno: 82,      // fine dell'arco verde (VA): oltre, solo in aria calma
    vne: 121,     // da non superare mai
    avvicinamento: 55,
    minAvvicinamento: 52, // triangolino giallo sull'anemometro
    contatto: [32, 50],   // missione di precisione: velocità buona al contatto
  },

  // per il piano di volo e le missioni (nodi, ft/min)
  prestazioni: { salita: 60, rateoSalita: 600, crociera: 83, discesa: 85, rateoDiscesa: 500, finale: 58 },

  aero: {
    CL0: 0.35,  CLalfa: 4.6,  CLq: 3.9,  CLde: 0.40,   // portanza
    alfaStallo: 11,                                    // gradi (ala in tela: stallo dolce a 41 kt)
    CD0: 0.029, e: 0.62,                               // resistenza (montanti, carrello scoperto)
    CYbeta: -0.5, CYdr: 0.15,                          // forza laterale
    Cm0: 0.04,  Cmalfa: -0.85, Cmq: -11, Cmde: 1.2, Cmflap: -0.04,     // beccheggio
    Clbeta: -0.09, Clp: -0.47, Clr: 0.096, Clda: 0.17, Cldr: 0.0147,  // rollio
    Cnbeta: 0.065, Cnp: -0.03, Cnr: -0.099, Cnda: -0.01, Cndr: 0.0657, // imbardata (alettoni differenziali: poca imbardata inversa)
  },

  comandi: { elevatore: 25, alettoni: 20, timone: 25, ruotino: 25 },

  flap: {
    posizioni: [0, 15, 40],    // leva sul tetto: su, primo scatto, tutti giù
    CL: 0.9,                   // portanza in più a flap 40
    CD: 0.07,                  // resistenza in più a flap 40
    secondiPerTacca: 1.0,      // leva a mano: si muovono in fretta
    retraiSopraFt: 200,        // dopo il decollo: flap su fra 150 e 200 ft
  },

  // ruote (coordinate corpo): carreggiata 1,7 m, ruotino 1,45 m davanti al baricentro
  carrello: [
    { nome: "anteriore", x:  0,    y: -1.15, z: -1.45, rigidezza: 18000, smorzamento: 1500, sterzante: true },
    { nome: "sinistra",  x: -0.85, y: -1.15, z:  0.25, rigidezza: 26000, smorzamento: 2600, freno: true },
    { nome: "destra",    x:  0.85, y: -1.15, z:  0.25, rigidezza: 26000, smorzamento: 2600, freno: true },
    { nome: "coda",      x:  0,    y: -0.25, z:  3.85, rigidezza: 12000, smorzamento: 1000, pattino: true },
  ],

  puntiUrto: [
    { x:  0,    y: -0.85, z: -2.0,  motivo: "L'elica ha toccato terra", motivoEn: "The propeller hit the ground" },
    { x: -4.72, y:  0.92, z:  0.2,  motivo: "L'ala sinistra ha toccato terra", motivoEn: "The left wing hit the ground" },
    { x:  4.72, y:  0.92, z:  0.2,  motivo: "L'ala destra ha toccato terra", motivoEn: "The right wing hit the ground" },
    { x:  0,    y: -0.75, z: -0.6,  motivo: "La fusoliera ha toccato terra", motivoEn: "The fuselage hit the ground" },
  ],

  limiti: {
    vsContatto: 3.0,     // m/s (~600 ft/min): carrello più leggero del Cessna
    gMax: 6.0, gMin: -3.0,   // manuale: +4 / -2 g di carico limite; si rompe a 1,5 volte (come per il Cessna)
  },

  occhioPilota: { x: -0.28, y: 0.30, z: -0.30 },  // posto di sinistra, sotto l'ala
};
