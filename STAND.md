# Stand der Arbeit

Stand: 25. November 2026, Commit `bccaece`. Die Live-Seite hat diesen Stand (Dateien verglichen).

- Live: https://lostpex.github.io/Spielsucht/
- Repo: https://github.com/Lostpex/Spielsucht, Branch `main`, Pages liefert aus dem Wurzelordner
- Kurzbeschreibung für Besucher: `README.md`. Diese Datei ist fürs Weiterarbeiten.

## Auftrag

1. Roulette als Webseite auf GitHub Pages. Wer kein Geld mehr hat, spielt russisches Roulette.
2. Multiplayer: Leute treten bei und setzen zusammen. Wer kein Geld hat, gibt den Revolver weiter. Kein Blackjack, nichts darüber hinaus.
3. In Chrome testen.

Alle drei Punkte sind erledigt.

## Fertig

### Einzelspiel
- Europäischer Kessel (37 Zahlen): Plein, Dutzend, Kolonne, einfache Chancen. Start mit 1.000 Mark.
- Revolver bei Pleite: 6 Kammern, jede Pleite eine Kugel mehr, höchstens 5.
- Auszahlung: 500 × Kugeln, verdoppelt sich mit jedem weiteren überlebten Schuss.
- Aufhören geht immer, auch ohne abzudrücken.
- Ergebnis wird vor der Animation in `localStorage` gespeichert, Neuladen hilft nicht.
- Der Filz verliert mit dem Geld seine Farbe, rosa bis grau.
- Ton aus WebAudio, Hoch- und Querformat, Tastaturbedienung, reduzierte Bewegung.

### Multiplayer
- Tisch eröffnen, Link `#tisch=CODE` verschicken (6 Zeichen), bis zu 8 Spieler.
- Alle setzen am selben Kessel und sehen die Jetons der anderen.
- Gedreht wird, wenn alle bereit sind, sonst 30 s nach dem Ersten.
- Alle Pleite-Spieler teilen sich eine Trommel. Sie hat so viele Kugeln, wie der am häufigsten Pleite gegangene Spieler Pleiten hat, höchstens 5.
- Jeder drückt mindestens einmal ab, dann weitergeben oder nochmal, reihum bis es knallt. Statt abzudrücken darf man zu Beginn jedes Zugs aufstehen und scheidet ohne Geld aus. Wer als Letzter sitzt und schon geschossen hat, kann stattdessen mit seinem Geld zurück an den Tisch.
- Wer überlebt, wird nach eigenen Schüssen bezahlt, mindestens wie für einen.
- Sind nur noch Kugeln übrig, wird keinem mehr ein Schuss zugemutet.
- 60 s Bedenkzeit am Revolver, 10 s wenn jemand nicht verbunden ist.
- Ende, wenn höchstens einer am Tisch sitzt. Das meiste Geld gewinnt. Der Gastgeber startet die neue Partie.
- Wer neu lädt, bekommt seinen Platz zurück (Schlüssel im `sessionStorage`). Späteinsteiger warten bis zur nächsten Runde.

## Aufbau

Kein Build, normale Skripte in dieser Reihenfolge: `logic.js`, `room.js`, `mp.js`, `game.js`.

| Datei | Aufgabe |
|---|---|
| `logic.js` | Regeln für Roulette und Revolver, ohne DOM |
| `room.js` | Regeln des gemeinsamen Tisches, läuft nur beim Gastgeber, ohne DOM und Netz |
| `mp.js` | Verbindung und Anzeige im Multiplayer (`window.Friends`) |
| `game.js` | Einzelspiel und Oberfläche, gibt `mp.js` über `window.Game` Zugriff |
| `style.css`, `index.html` | Aussehen und Seite |
| `vendor/` | PeerJS 1.5.5 mit Lizenz, wird erst beim Eröffnen oder Beitreten geladen |
| `fonts/` | Gravitas One und Sofia Sans Condensed, lokal, mit Lizenzen |

Gut zu wissen:
- Phasen in `room.js`: `bet` → `spin` → (`gun` → `reveal`) → `bet`, am Ende `end`. Alle Zeiten stehen oben in `T`. Sie müssen zu den Animationen in `game.js` und `mp.js` passen.
- Der Gastgeber entscheidet alles. Gäste schicken Wünsche und bekommen Ereignisse mit dem ganzen Stand (`room.view()`). Kugeln und Schlüssel stehen dort nie drin.
- `mp.js` spielt Ereignisse der Reihe nach ab (`receive`, `drain`, `show`).
- Solange `mp` in `game.js` gesetzt ist, bleibt der Solo-Stand unberührt.
- Verbindung: Ping alle 4 s, nach 16 s Stille gilt sie als weg. Der Gast versucht es 6-mal neu. Geht der Gastgeber, schickt er `bye`.

## Getestet

- **Chrome, Live-Seite, zwei Tabs:** beitreten, setzen, drehen, Revolver, weitergeben, Knall, Rangliste, neue Partie, Neuladen, Hintergrund-Tab, Gastgeber geht. Keine Fehler in der Konsole. Für die Revolver-Runde war der Zufall nur im Test-Tab festgelegt.
- **Regeltests:** 12 von 12 bestehen.
- **Im Chrome-Test gefunden und behoben** (in `bccaece`):
  - falscher Hinweis trotz gesetztem Einsatz
  - grauer Siegerbildschirm
  - rosa statt graues „Der Tisch ist zu“
  - Umbruch mitten in „1 von 5“
  - der Ring für „bereit“ berührte den Namen
- Diese Korrekturen wurden lokal nachgeprüft, „Der Tisch ist zu“ in Chrome ohne Fenster. Nach dem Hochladen wurde nicht noch einmal live gespielt.

Die Regeltests liegen bewusst nicht im Repo. Sie decken ab:
1. Einsätze werden geprüft.
2. Gedreht wird, wenn alle bereit sind, sonst nach der Frist.
3. Ohne Einsatz kein Bereit, Offline-Spieler halten niemanden auf.
4. Weitergeben, bis es knallt, Überlebende werden bezahlt.
5. Nur wer den Revolver hat, darf handeln, Sperre während der Animation.
6. Allein am Revolver: nach einem Schuss zurück an den Tisch.
7. Die letzte Kammer wird niemandem zugemutet.
8. Die Partie endet mit dem vorletzten, neue Partie nur vom Gastgeber.
9. Zeit läuft ab: wer nichts tut, steht auf.
10. Wiederkommen mit gleichem Schlüssel, voller Tisch, Späteinsteiger warten.
11. Kugeln und Schlüssel bleiben geheim.
12. Zufallspartien hängen nie, Geld bleibt plausibel.

## Offen

- [ ] Zwei Geräte in verschiedenen Netzen testen, zum Beispiel Handy im Mobilfunk und Rechner im WLAN.
- [ ] Ton anhören.
- [ ] Mit echten Handys spielen.

## Bekannte Grenzen

- Schließt der Gastgeber die Seite, ist der Tisch zu. Die Partie wird nicht übernommen.
- Der Gastgeber könnte schummeln, weil sein Browser rechnet.
- Im Einzelspiel steht die Lage der Kugeln im `localStorage` und lässt sich dort nachsehen.
- Den Kontakt vermittelt der öffentliche Dienst von PeerJS. Fällt er aus, kommt kein neuer Gast an den Tisch.
- Manche Firmen- und Schulnetze sperren Direktverbindungen.

## Weitermachen

1. `python3 -m http.server` im Projektordner, dann http://localhost:8000 öffnen.
2. Für den Multiplayer zwei Tabs öffnen: im ersten den Tisch eröffnen, im zweiten den Link aufrufen.
3. Nach Änderungen auf `main` pushen, GitHub Pages aktualisiert sich von selbst.
