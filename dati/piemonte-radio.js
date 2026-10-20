/* Volo — simulatore di volo nel browser
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
   Radioaiuti (VOR) generati da strumenti/genera-radio.js.
   Fonte: OurAirports, navaids.csv (pubblico dominio). Frequenze in MHz, posizioni in metri
   (x verso est, y verso nord) dal punto lat 45.25, lon 7.949999999999999.
   Frequenze degli aeroporti da airport-frequencies.csv (pubblico dominio). Non modificare a mano. */
window.RADIO={vor:[
  {"id":"ALB","nome":"Albenga","freq":116.95,"dme":true,"x":13920,"y":-132888,"quota":41},
  {"id":"AZR","nome":"Nice Cote D Azur","freq":109.65,"dme":true,"x":-56864,"y":-175846,"quota":4},
  {"id":"BLA","nome":"Biella Cerrione","freq":116.1,"dme":true,"x":11801,"y":27002,"quota":281,"portata":40},
  {"id":"CGS","nome":"Cagnes Sur Mer","freq":109.2,"dme":true,"x":-63017,"y":-177449,"quota":4},
  {"id":"CNM","nome":"Cannes","freq":111.4,"dme":false,"x":-84567,"y":-186826,"quota":0},
  {"id":"CSL","nome":"Caselle","freq":116.75,"dme":true,"x":-23545,"y":-3350,"quota":307},
  {"id":"FRI","nome":"Fribourg","freq":110.85,"dme":true,"x":-56936,"y":168913,"quota":810},
  {"id":"GEN","nome":"Genova","freq":112.8,"dme":true,"x":88722,"y":-91290,"quota":888},
  {"id":"LIN","nome":"Linate","freq":112.25,"dme":true,"x":103867,"y":23353,"quota":118},
  {"id":"MAL","nome":"Malpensa","freq":111.2,"dme":true,"x":61487,"y":43422,"quota":234},
  {"id":"MOT","nome":"Montana","freq":115.85,"dme":true,"x":-35006,"y":117584,"quota":1358},
  {"id":"NIZ","nome":"Nice","freq":112.4,"dme":true,"x":-54516,"y":-163583,"quota":860},
  {"id":"SES","nome":"Genova Sestri","freq":108.6,"dme":true,"x":68466,"y":-92086,"quota":10},
  {"id":"SIO","nome":"Sion","freq":112.15,"dme":true,"x":-51820,"y":106759,"quota":486,"portata":40},
  {"id":"SPR","nome":"St-Prex","freq":113.9,"dme":true,"x":-117708,"y":134757,"quota":382},
  {"id":"SRN","nome":"Saronno","freq":113.7,"dme":true,"x":84080,"y":43876,"quota":248},
  {"id":"TOP","nome":"Torino","freq":114.5,"dme":true,"x":-6923,"y":-35892,"quota":264},
  {"id":"TZO","nome":"Trezzo","freq":117.25,"dme":true,"x":122038,"y":34200,"quota":152},
  {"id":"VOG","nome":"Voghera","freq":115.5,"dme":true,"x":79960,"y":-31580,"quota":118}
],
// frequenze vere degli aeroporti: TWR torre, GND terra, INFO informazioni (AFIS), RADIO servizio radio
com:[
  {"ap":"LILA","tipo":"RADIO","freq":"126.900","nome":"Alessandria Radio"},
  {"ap":"LILE","tipo":"INFO","freq":"123.050","nome":"Biella Information"},
  {"ap":"LILH","tipo":"RADIO","freq":"123.000","nome":"Voghera Radio"},
  {"ap":"LILI","tipo":"RADIO","freq":"118.855","nome":"Vercelli Radio"},
  {"ap":"LILM","tipo":"RADIO","freq":"118.355","nome":"Casale Radio"},
  {"ap":"LILN","tipo":"INFO","freq":"128.550","nome":"Varese Information"},
  {"ap":"LIMA","tipo":"INFO","freq":"119.800","nome":"Aeritalia Information"},
  {"ap":"LIMB","tipo":"RADIO","freq":"122.005","nome":"Bresso Radio"},
  {"ap":"LIMC","tipo":"GND","freq":"121.900","nome":"Malpensa Ground"},
  {"ap":"LIMC","tipo":"TWR","freq":"119.000","nome":"Malpensa Tower"},
  {"ap":"LIMF","tipo":"GND","freq":"121.705","nome":"Torino Ground"},
  {"ap":"LIMF","tipo":"TWR","freq":"118.500","nome":"Torino Tower"},
  {"ap":"LIMG","tipo":"INFO","freq":"123.850","nome":"Albenga Information"},
  {"ap":"LIMJ","tipo":"TWR","freq":"118.600","nome":"Genova Tower"},
  {"ap":"LIML","tipo":"GND","freq":"121.800","nome":"Linate Ground"},
  {"ap":"LIML","tipo":"TWR","freq":"118.100","nome":"Linate Tower"},
  {"ap":"LIMN","tipo":"GND","freq":"121.700","nome":"Cameri Ground"},
  {"ap":"LIMN","tipo":"TWR","freq":"122.100","nome":"Cameri Tower"},
  {"ap":"LIMW","tipo":"INFO","freq":"119.950","nome":"Aosta Information"},
  {"ap":"LIMZ","tipo":"INFO","freq":"119.550","nome":"Cuneo Information"},
  {"ap":"LIVV","tipo":"RADIO","freq":"118.950","nome":"Vische Radio"},
  {"ap":"LSGB","tipo":"INFO","freq":"122.155","nome":"Bex Information"},
  {"ap":"LSGK","tipo":"INFO","freq":"119.425","nome":"Saanen Information"},
  {"ap":"LSGS","tipo":"GND","freq":"121.700","nome":"Sion Ground"},
  {"ap":"LSGS","tipo":"INFO","freq":"122.350","nome":"Sion Information"},
  {"ap":"LSGS","tipo":"TWR","freq":"118.275","nome":"Sion Tower"},
  {"ap":"LSPM","tipo":"INFO","freq":"118.525","nome":"Ambri Information"},
  {"ap":"LSTS","tipo":"INFO","freq":"119.425","nome":"Sankt Stephan Information"},
  {"ap":"LSTS","tipo":"TWR","freq":"120.050","nome":"Sankt Stephan Tower"},
  {"ap":"LSZA","tipo":"GND","freq":"121.775","nome":"Lugano Ground"},
  {"ap":"LSZA","tipo":"TWR","freq":"120.250","nome":"Lugano Tower"},
  {"ap":"LSZL","tipo":"GND","freq":"121.700","nome":"Locarno Ground"},
  {"ap":"LSZL","tipo":"TWR","freq":"134.825","nome":"Locarno Tower"}
]};
