# Simulatore di Volo

Un piccolo simulatore di volo nel browser, con fisica realistica ispirata a un **Cessna 172**:
si decolla da una pista vera, si vola con strumenti da glass cockpit e si atterra
seguendo le luci PAPI.

**Gioca online: https://massimilianopetra.github.io/flightsimulator/**

Codice: https://github.com/massimilianopetra/flightsimulator

## Come si avvia

Apri `index.html` con un doppio clic (Chrome, Edge o Firefox).
Serve la connessione a Internet, perché la libreria 3D (three.js) e i font
vengono scaricati da Internet.

Per lavorarci con VS Code va bene anche l'estensione *Live Server*.

## Pubblicare su GitHub Pages

Il sito è pubblicato all'indirizzo **https://massimilianopetra.github.io/flightsimulator/**
e viene servito dal ramo `gh-pages` del repository.

**Solo la prima volta** (o su un computer nuovo, dopo il `git clone`):

```
npm install
```

**Ogni volta che vuoi aggiornare il sito**, dalla cartella del progetto:

```
git add -A
git commit -m "descrivi cosa hai cambiato"
git push
npm run deploy
```

- `git push` salva il codice nel ramo `main` su GitHub.
- `npm run deploy` copia i file del gioco (`index.html`, `css/`, `js/`, `dati/`)
  nel ramo `gh-pages`, e GitHub Pages li pubblica.
- Dopo circa un minuto il sito è aggiornato. Se vedi ancora la versione vecchia,
  ricarica con **Ctrl+F5**.

Il sito non ha bisogno di compilazione: sono file statici.

## I file

| File | Cosa contiene | Da modificare? |
|---|---|---|
| `dati/mappa.js` | **il mondo**: colline, montagne, laghi, aeroporti e piste, paesi, boschi, meteo, punto di partenza | **sì, è fatto apposta** |
| `dati/aereo.js` | i dati dell'aereo: peso, motore, ala, coefficienti aerodinamici, carrello | sì, per sperimentare |
| `js/terreno.js` | calcola l'altezza del terreno e costruisce la mesh che segue l'aereo | |
| `js/fisica.js` | la fisica del volo (forze, momenti, carrello, stallo, effetto suolo) | |
| `js/cabina.js` | la cabina 3D in stile G1000: schermi PFD e MFD, strumenti di riserva, cloche, manetta | |
| `js/mondo.js` | grafica 3D: cielo, piste con segnaletica, PAPI, hangar, alberi, case, aereo | |
| `js/strumenti.js` | il PFD (orizzonte, velocità, quota, variometro, bussola) e la minimappa | |
| `js/audio.js` | suoni sintetizzati: motore, vento, avvisatore di stallo | |
| `js/main.js` | collega tutto: comandi, telecamere, messaggi, ciclo principale | |
| `css/stile.css` | l'aspetto dei pannelli | |

## Modificare la mappa

Tutto si fa in `dati/mappa.js`. Le regole:

- le coordinate sono in **metri**: `x` verso **est**, `y` verso **nord**, e `(0, 0)` è il centro;
- le direzioni sono **gradi di bussola** (0 = nord, 90 = est, 180 = sud, 270 = ovest);
- le quote sono in metri sul livello del mare; per aeroporti e laghi puoi scrivere `quota: "auto"`.

Dopo ogni modifica salva e ricarica la pagina (F5). Se la pagina resta vuota,
premi F12 e guarda la console: di solito manca una virgola.

### Esempi

Aggiungere un aeroporto con due piste incrociate:

```js
{
  codice: "LINU", nome: "Nuovo Campo",
  x: 5000, y: -4000, quota: "auto",
  piste: [
    { direzione: 90,  lunghezza: 1200, larghezza: 30 },
    { direzione: 180, lunghezza: 800,  larghezza: 23, spostamentoEst: 500 },
  ],
},
```

I numeri delle testate si calcolano da soli: la direzione 90 dà le piste "09" e "27".
Accanto alla prima pista compaiono in automatico piazzale, hangar, torre,
manica a vento e luci PAPI.

Aggiungere una montagna (oppure una valle, con `altezza` negativa):

```js
{ nome: "Pizzo Nero", x: -3000, y: 8000, raggio: 2000, altezza: 1200 },
```

Cambiare il meteo (per esempio un vento al traverso, per esercitarsi):

```js
meteo: { ventoDa: 0, ventoNodi: 12, raffiche: 6, nuvole: 60, baseNuvole: 900 },
```

Partire da un'altra pista, oppure direttamente in volo:

```js
partenza: { aeroporto: "LIPM", pista: "09" },
partenza: { x: 0, y: -3000, quota: 800, direzione: 0, velocitaNodi: 100 },
```

Con `terreno.seme` si ottiene un paesaggio completamente diverso: in quel caso
conviene ricontrollare che gli aeroporti non finiscano in mare.

## Comandi

| Tasto | Azione |
|---|---|
| W / S (o frecce) | picchia / cabra: la cloche si sposta finché tieni premuto e poi resta lì |
| K | riporta la cloche al centro |
| A / D | rollio |
| Q / E | timone (a terra sterza il ruotino anteriore) |
| + / − | manetta; i tasti 1…9 la mettono al 10…90%, 0 al 100% |
| F / G | flap giù / su (0°, 10°, 20°, 30°) |
| Z / X | trim cabra / picchia |
| B o Spazio | freni (tieni premuto) |
| C | vista: esterna, cabina, torre |
| rotellina del mouse | zoom in cabina (per leggere gli schermi) |
| N | prossima destinazione |
| M | zoom della mappa |
| O (o clic sulla mappa) | mappa con il nord in alto oppure con la prua in alto |
| P / R | pausa / ricomincia |
| H | apre o chiude il pannello dei comandi |

Col mouse si può trascinare sullo schermo come se fosse una cloche. Sia con i tasti sia col mouse la cloche **resta nell'ultima posizione** (il pallino nel pannello mostra dov'è); K la riporta al centro. Il timone invece torna al centro da solo, come i pedali veri. Funziona anche un gamepad:
stick sinistro per cloche, stick destro per timone e manetta, grilletti per la manetta,
dorsali per i flap, A per i freni e Y per la vista.

## Come si vola (in breve)

**Decollo**: flap 10° (F), manetta al 100% (0), resta sulla linea centrale con Q/E;
a **55 nodi** tira dolcemente (S) fino a circa 8° di assetto, poi sali a **74 nodi**.
Sopra i 500 ft retrai i flap (G).

**Atterraggio**: allineati alla pista da qualche km di distanza, flap 30°, circa **65 nodi**.
Le 4 luci PAPI a sinistra della pista dicono se sei sulla pendenza giusta:
2 bianche e 2 rosse = giusto, tutte bianche = troppo alto, tutte rosse = troppo basso.
Poco sopra la pista togli motore e alza leggermente il muso (richiamata).
Sotto 600–700 ft/min di discesa al contatto il carrello resiste.

Il pulsante **Prova l'atterraggio** del briefing ti mette già in finale.

## Cosa c'è di "vero" nella fisica

- Portanza, resistenza (anche quella indotta, che diminuisce vicino al suolo) e
  forza laterale calcolate con i coefficienti aerodinamici del C172.
- Momenti di stabilità e di comando: l'aereo è stabile da solo, ha la fugoide
  (oscilla lentamente su e giù se lo lasci), vira coordinato, ha l'imbardata inversa.
- Stallo attorno ai 48 nodi (40 con i flap): il muso cade e un'ala può abbassarsi.
- Spinta dell'elica che cala con la velocità e con la quota (aria più rarefatta).
- Carrello a molle e smorzatori, attrito diverso tra pista ed erba, freni, ruotino sterzante.
- Vento con raffiche, che al suolo è più debole.
- Limiti strutturali: troppa velocità o troppi g rompono l'aereo.

## Idee per i prossimi passi

- Più aerei (un aliante? un jet?): basta un altro file come `dati/aereo.js`.
- Strade, fiumi e ferrovie nella mappa.
- Notte, con le luci di pista.
- Strumenti di radionavigazione (VOR, ILS).
- Missioni: atterrare in un aeroporto entro un tempo, lanciare rifornimenti, ecc.
