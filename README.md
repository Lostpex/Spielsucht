# Spielsucht

Roulette im Browser. Du startest mit 1.000 Mark Spielgeld. Ist alles weg, wird russisches Roulette gespielt.

- **Roulette:** europäischer Kessel (37 Zahlen), Plein, Dutzend, Kolonne und einfache Chancen. Rechtsklick nimmt einen Jeton zurück.
- **Revolver:** Wer überlebt, bekommt Geld und darf zurück an den Tisch oder für das Doppelte nochmal abdrücken. Mit jeder Pleite kommt eine Kugel dazu (höchstens fünf).
- **Aufhören:** geht immer, auch ohne abzudrücken. Es zählt, was man mit nach Hause nimmt.

Der Stand liegt im `localStorage`. Ergebnisse werden vor der Animation gespeichert, Neuladen hilft also nicht.

## Lokal starten

`index.html` im Browser öffnen oder `python3 -m http.server`.

## GitHub Pages

Kein Build nötig. Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.

## Schriften

Gravitas One und Sofia Sans Condensed, beide SIL Open Font License (Lizenzen in `fonts/`). Sie liegen lokal, es werden keine fremden Server geladen.
