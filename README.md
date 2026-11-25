# Spielsucht

Roulette im Browser. Du startest mit 1.000 Mark Spielgeld. Ist alles weg, wird russisches Roulette gespielt.

- **Roulette:** europäischer Kessel (37 Zahlen), Plein, Dutzend, Kolonne und einfache Chancen. Rechtsklick nimmt einen Jeton zurück.
- **Revolver:** Wer überlebt, bekommt Geld und darf zurück an den Tisch oder für das Doppelte nochmal abdrücken. Mit jeder Pleite kommt eine Kugel dazu (höchstens fünf).
- **Aufhören:** geht immer, auch ohne abzudrücken. Es zählt, was man mit nach Hause nimmt.

Der Stand liegt im `localStorage`. Ergebnisse werden vor der Animation gespeichert, Neuladen hilft also nicht.

## Mit Freunden

Einer eröffnet einen Tisch und schickt den Link, bis zu acht Leute spielen mit. Alle setzen am selben Kessel; gedreht wird, wenn alle bereit sind, sonst 30 Sekunden nach dem Ersten. Wer pleite ist, sitzt am Revolver: abdrücken, dann weitergeben oder für das Doppelte nochmal. Das geht reihum, bis es knallt. Wer überlebt, wird bezahlt. Die Partie endet, wenn nur noch einer am Tisch sitzt; das meiste Geld gewinnt.

Die Browser verbinden sich direkt (WebRTC). Der Browser des Gastgebers rechnet; schließt er die Seite, ist der Tisch zu. Den Kontakt vermittelt der öffentliche Dienst von [PeerJS](https://peerjs.com), erst wenn man einen Tisch eröffnet oder beitritt. Regeln stehen in `room.js`, Verbindung und Anzeige in `mp.js`.

## Lokal starten

`index.html` im Browser öffnen oder `python3 -m http.server`.

## GitHub Pages

Kein Build nötig. Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.

## Schriften

Gravitas One und Sofia Sans Condensed, beide SIL Open Font License (Lizenzen in `fonts/`). Sie liegen lokal. PeerJS in `vendor/` steht unter MIT-Lizenz.
