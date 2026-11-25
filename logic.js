/* Spielregeln ohne DOM. Läuft im Browser (window.Logic) und in Node (Tests). */
(function (root) {
  'use strict';

  const START = 1000;
  const CHAMBERS = 6;
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

  const color = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

  // Gleichverteilte Ganzzahl in [0, n), ohne Modulo-Verzerrung.
  function rnd(n) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do { root.crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // Trifft die Wette? odds = Gewinn pro Einsatz (Einsatz kommt zusätzlich zurück).
  const OUTSIDE = {
    red: { odds: 1, hit: (n) => color(n) === 'red' },
    black: { odds: 1, hit: (n) => color(n) === 'black' },
    even: { odds: 1, hit: (n) => n !== 0 && n % 2 === 0 },
    odd: { odds: 1, hit: (n) => n % 2 === 1 },
    low: { odds: 1, hit: (n) => n >= 1 && n <= 18 },
    high: { odds: 1, hit: (n) => n >= 19 },
    d1: { odds: 2, hit: (n) => n >= 1 && n <= 12 },
    d2: { odds: 2, hit: (n) => n >= 13 && n <= 24 },
    d3: { odds: 2, hit: (n) => n >= 25 },
    c1: { odds: 2, hit: (n) => n !== 0 && n % 3 === 1 },
    c2: { odds: 2, hit: (n) => n !== 0 && n % 3 === 2 },
    c3: { odds: 2, hit: (n) => n !== 0 && n % 3 === 0 },
  };
  function bet(key) {
    if (OUTSIDE[key]) return OUTSIDE[key];
    const num = Number(key.slice(1));
    return { odds: 35, hit: (n) => n === num };
  }

  const stake = (bets) => Object.values(bets).reduce((a, b) => a + b, 0);

  // Gesamte Auszahlung inklusive zurückgegebener Einsätze.
  function payout(bets, n) {
    let sum = 0;
    for (const [key, amount] of Object.entries(bets)) {
      const b = bet(key);
      if (b.hit(n)) sum += amount * (b.odds + 1);
    }
    return sum;
  }

  // Trommel mit zufällig verteilten Kugeln; Index = Reihenfolge, in der gefeuert wird.
  function load(bullets) {
    const c = Array(CHAMBERS).fill(false);
    let left = bullets;
    while (left > 0) {
      const i = rnd(CHAMBERS);
      if (!c[i]) { c[i] = true; left--; }
    }
    return c;
  }

  // Was das Haus zahlt, nachdem man `fired` leere Kammern überlebt hat.
  const pot = (bullets, fired) => (fired === 0 ? 0 : 500 * bullets * 2 ** (fired - 1));

  const api = { START, CHAMBERS, WHEEL, color, rnd, bet, stake, payout, load, pot };
  root.Logic = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
