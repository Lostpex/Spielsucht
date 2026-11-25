(function () {
  'use strict';
  const L = window.Logic;
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const SAVE = 'spielsucht.stand';
  const BEST = 'spielsucht.rekord';
  const MUTE = 'spielsucht.stumm';
  const STEP = 360 / L.WHEEL.length;
  const portrait = matchMedia('(max-aspect-ratio: 1/1)');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = (n) => n.toLocaleString('de-DE');
  const short = (n) => (n >= 1000 ? (n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : String(n));
  const mod = (a, n) => ((a % n) + n) % n;
  const wait = (ms) => new Promise((r) => setTimeout(r, calm.matches ? Math.min(ms, 400) : ms));
  const aim = () => (portrait.matches ? 90 : 0);

  /* ---------- Spielstand ---------- */

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* privater Modus: Stand geht verloren */ } },
  };
  const fresh = () => ({
    phase: 'intro', balance: L.START, bets: {}, log: [], last: {}, history: [],
    visits: 0, chambers: null, fired: 0,
    rounds: 0, peak: L.START, pulls: 0,
  });
  let S = fresh();
  try {
    const saved = JSON.parse(store.get(SAVE));
    if (saved && typeof saved.balance === 'number') S = { ...fresh(), ...saved };
  } catch { /* unlesbarer Stand: neu anfangen */ }
  const save = () => store.set(SAVE, JSON.stringify(S));
  const bullets = () => Math.min(S.visits, L.CHAMBERS - 1);

  /* ---------- Ton ---------- */

  let ac = null;
  let muted = store.get(MUTE) === '1';
  function audio() {
    if (muted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = ac || new AC();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function noise(dur, type, freq, vol, q = 1) {
    const c = audio(); if (!c) return;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.5;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(c.destination); src.start();
  }
  function tone(from, to, dur, vol, type = 'sine', delay = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
  }
  const sfx = {
    chip() { noise(.05, 'bandpass', 3200, .5, 3); tone(1900, 1500, .05, .08, 'triangle'); },
    tick(v = .3) { noise(.03, 'highpass', 4200, v); },
    knock() { noise(.06, 'bandpass', 1500, .7, 4); },
    win() { tone(660, 655, .5, .12, 'triangle'); tone(990, 985, .7, .1, 'triangle', .12); },
    ratchet() { noise(.04, 'bandpass', 2400, .6, 6); },
    cock() { noise(.07, 'bandpass', 900, .9, 4); setTimeout(() => noise(.05, 'bandpass', 2000, .8, 5), 90); },
    dry() { noise(.05, 'bandpass', 2700, 1.2, 5); tone(320, 160, .05, .15, 'square'); },
    heart() { tone(62, 40, .16, .6); tone(56, 36, .2, .45, 'sine', .22); },
    bang() { noise(1.6, 'lowpass', 1100, 1.6); noise(.12, 'highpass', 1800, 1); tone(150, 28, .5, .8); },
  };

  /* ---------- Kessel und Trommel zeichnen ---------- */

  const rad = (deg) => deg * Math.PI / 180;
  const pt = (r, deg) => `${(r * Math.cos(rad(deg))).toFixed(2)} ${(r * Math.sin(rad(deg))).toFixed(2)}`;
  const ring = (r1, r2, a1, a2) =>
    `M${pt(r2, a1)}A${r2} ${r2} 0 0 1 ${pt(r2, a2)}L${pt(r1, a2)}A${r1} ${r1} 0 0 0 ${pt(r1, a1)}Z`;
  const svg = (inner) => `<svg viewBox="-500 -500 1000 1000">${inner}</svg>`;

  const PAINT = { red: ['#b5121f', '#8d0c17'], black: ['#1c1014', '#0f080a'], green: ['#0b6b4a', '#074c34'] };
  function drawWheel() {
    let s = '<circle r="500" fill="#4a1420"/><circle r="472" fill="#6b1f2e"/><circle r="424" fill="#34101a"/>';
    L.WHEEL.forEach((n, i) => {
      const a = i * STEP;
      const [hi, lo] = PAINT[L.color(n)];
      s += `<path d="${ring(336, 418, a - STEP / 2, a + STEP / 2)}" fill="${hi}"/>`
        + `<path d="${ring(246, 336, a - STEP / 2, a + STEP / 2)}" fill="${lo}"/>`
        + `<text transform="rotate(${a}) translate(379 0) rotate(${portrait.matches ? -90 : 90})" font-size="38">${n}</text>`;
    });
    for (let i = 0; i < 37; i++) {
      const a = (i + .5) * STEP;
      s += `<path d="M${pt(246, a)}L${pt(418, a)}" stroke="#c8963c" stroke-width="3"/>`;
    }
    s += '<g fill="none" stroke="#c8963c" stroke-width="3"><circle r="418"/><circle r="336"/></g>'
      + '<circle r="246" fill="#6b1f2e"/><circle r="246" fill="none" stroke="#c8963c" stroke-width="6"/>'
      + '<circle r="150" fill="#4a1420"/>';
    for (let a = 0; a < 360; a += 90) {
      s += `<g transform="rotate(${a})"><path d="M0 -13L128 -7V7L0 13Z" fill="#c8963c"/><circle cx="132" r="20" fill="#c8963c"/></g>`;
    }
    s += '<circle r="52" fill="#c8963c"/><circle r="30" fill="#fff3ea"/>';
    $('wheel').innerHTML = svg(s);

    let d = '';
    for (let a = 22.5; a < 360; a += 45) d += `<path transform="rotate(${a}) translate(448 0)" d="M-17 0L0 -7L17 0L0 7Z" fill="#c8963c"/>`;
    $('deflectors').innerHTML = svg(d);
  }

  // Kammer i steht nach i + 1 Rasten am Zeiger.
  function drawCylinder() {
    let body = `M${pt(470, 8)}`;
    for (let i = 0; i < 6; i++) {
      const a = i * 60;
      body += `A470 470 0 0 1 ${pt(470, a + 20)}Q${pt(372, a + 30)} ${pt(470, a + 40)}`;
      body += `A470 470 0 0 1 ${pt(470, a + 68)}`;
    }
    let s = '<defs><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d747b"/><stop offset=".5" stop-color="#4a5057"/><stop offset="1" stop-color="#2d3237"/></linearGradient></defs>'
      + `<path transform="rotate(${aim()})" d="${body}Z" fill="url(#steel)" stroke="#1b1e22" stroke-width="8"/>`;
    for (let i = 0; i < 6; i++) {
      const a = aim() - (i + 1) * 60;
      s += `<g class="chamber" data-i="${i}" transform="rotate(${a}) translate(296 0)">`
        + '<circle r="112" fill="#24282d"/><circle class="hole" r="102"/>'
        + '<g class="round"><circle r="102" fill="#c8963c"/><circle r="84" fill="#d9ab57"/><circle r="40" fill="#8f6722"/><circle r="32" fill="#b98532"/></g></g>';
    }
    s += '<circle r="104" fill="#24282d"/><circle r="86" fill="#5b6168"/><circle r="34" fill="#14161a"/>';
    $('cylinder').innerHTML = svg(s);
    paintChambers();
  }

  // mode: 'loading' zeigt Kugeln, 'hidden' zeigt nur abgefeuerte Kammern als leer, 'reveal' zeigt alles.
  let cylMode = 'hidden';
  function paintChambers() {
    const shown = S.chambers || Array.from({ length: 6 }, (_, i) => i < bullets());
    document.querySelectorAll('.chamber').forEach((el, i) => {
      const visible = cylMode !== 'hidden';
      el.classList.toggle('bullet', visible && shown[i]);
      el.classList.toggle('open', visible ? !shown[i] : i < S.fired);
    });
  }

  let wheelA = 0;
  let cylA = 0;
  let ballA = 0;
  const setWheel = (a) => { wheelA = a; $('wheel').style.transform = `rotate(${a}deg)`; };
  const setCyl = (a) => { cylA = a; $('cylinder').style.transform = `rotate(${a}deg)`; };
  const setBall = (a, r) => { ballA = a; $('ball').style.setProperty('--a', a + 'deg'); $('ball').style.setProperty('--r', r); };
  function park() {
    const n = S.history.length ? S.history[0] : 0;
    setWheel(aim() - L.WHEEL.indexOf(n) * STEP);
    setBall(aim(), 29);
    setCyl(S.fired * 60);
    $('pointer').style.transform = `rotate(${aim()}deg)`;
    drawWheel(); drawCylinder();
  }

  function animate(ms, frame) {
    return new Promise((done) => {
      const t0 = performance.now();
      const tick = (t) => {
        const u = Math.min(1, Math.max(0, (t - t0) / ms));
        frame(u);
        if (u < 1) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
  }

  function spinWheel(n) {
    const P = aim();
    const pocket = L.WHEEL.indexOf(n) * STEP;
    const w0 = wheelA;
    const wd = 720 + mod(P - pocket - w0, 360);
    const W = (u) => w0 + wd * (1 - (1 - u) ** 3);
    const LOCK = .74; // ab hier liegt die Kugel im Fach und dreht mit
    const bEnd = W(LOCK) + pocket;
    const bd = 7 * 360 + mod(ballA - bEnd, 360);
    let lastTick = Infinity;
    let lastHop = -1;
    return animate(calm.matches ? 700 : 6800, (u) => {
      setWheel(W(u));
      if (u >= LOCK) { setBall(W(u) + pocket, 29); return; }
      const s = u / LOCK;
      const b = bEnd + bd * (1 - s) ** 1.8;
      const x = Math.max(0, (s - .6) / .4);
      const r = s < .08 ? 29 + 15.2 * (s / .08) : x === 0 ? 44.2 : 29 + 15.2 * (1 - x) ** 2 * Math.abs(Math.cos(x * Math.PI * 2.5));
      setBall(b, r);
      if (x === 0) {
        const seg = Math.floor(b / 45);
        if (seg !== lastTick) { lastTick = seg; sfx.tick(.22); }
      } else {
        const hop = Math.floor(x * 2.5 + .5);
        if (hop !== lastHop) { lastHop = hop; sfx.knock(); }
      }
    });
  }

  /* ---------- Tisch ---------- */

  const CHIPS = [
    { v: 10, c: 'var(--bone)', light: true }, { v: 50, c: 'var(--green)' },
    { v: 100, c: 'var(--ink)' }, { v: 500, c: 'var(--red)' }, { v: 'all', c: 'var(--brass)', light: true },
  ];
  let chip = 50;
  let busy = false;
  const cells = new Map();

  function cell(key, label, cls, land, port, name) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell ' + cls;
    b.textContent = label;
    b.dataset.key = key;
    b.dataset.name = name || label;
    const set = (p, [c, r, cs = 1, rs = 1]) => {
      b.style.setProperty(`--${p}c`, c); b.style.setProperty(`--${p}r`, r);
      b.style.setProperty(`--${p}cs`, cs); b.style.setProperty(`--${p}rs`, rs);
    };
    set('l', land); set('p', port);
    $('layout').append(b);
    cells.set(key, b);
  }
  function buildTable() {
    cell('n0', '0', 'green zero', [1, 1, 1, 3], [3, 1, 3, 1]);
    for (let n = 1; n <= 36; n++) {
      const row = (n - 1) % 3; const col = Math.ceil(n / 3);
      cell('n' + n, String(n), L.color(n), [col + 1, 3 - row], [row + 3, col + 1]);
    }
    for (let i = 0; i < 3; i++) cell('c' + (i + 1), '2:1', 'out', [14, 3 - i], [i + 3, 14], `Kolonne ${i + 1}`);
    ['1. Dutzend', '2. Dutzend', '3. Dutzend'].forEach((t, i) => cell('d' + (i + 1), t, 'out', [2 + i * 4, 4, 4], [2, 2 + i * 4, 1, 4], t));
    [['low', '1–18', 'out'], ['even', 'Gerade', 'out'], ['red', 'Rot', 'red out'], ['black', 'Schwarz', 'black out'], ['odd', 'Ungerade', 'out'], ['high', '19–36', 'out']]
      .forEach(([k, t, c], i) => cell(k, t, c, [2 + i * 2, 5, 2], [1, 2 + i * 2, 1, 2]));

    CHIPS.forEach(({ v, c, light }) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (light ? ' light' : '');
      b.style.setProperty('--c', c);
      b.setAttribute('role', 'radio');
      b.dataset.chip = v;
      b.textContent = v === 'all' ? 'Alles' : v;
      $('chips').append(b);
    });
  }

  const say = (t) => { $('message').textContent = t; };

  // shown: Guthaben, das während der Drehung noch angezeigt wird (das Ergebnis steht intern schon fest).
  let shown = null;
  function render() {
    const bal = shown ? shown.balance : S.balance;
    const bets = shown ? shown.bets : S.bets;
    const total = bal + L.stake(bets);
    $('balance').textContent = fmt(bal);

    const poor = Math.min(1, total / L.START);
    const rich = Math.min(1, Math.max(0, Math.log(total / L.START) / Math.log(8)));
    const felt = body.dataset.phase === 'gun' ? '#9ba1a4'
      : rich > 0 ? `color-mix(in oklab, #f0919a, #f26a80 ${(rich * 100).toFixed(0)}%)`
        : `color-mix(in oklab, #9ba1a4, #f0919a ${(poor * 100).toFixed(0)}%)`;
    document.documentElement.style.setProperty('--felt', felt);

    for (const [key, el] of cells) {
      const amt = bets[key];
      let tag = el.querySelector('.bet');
      if (amt) {
        if (!tag) { tag = document.createElement('span'); tag.className = 'bet'; el.append(tag); }
        tag.textContent = short(amt);
      } else if (tag) tag.remove();
      el.setAttribute('aria-label', el.dataset.name + (amt ? `, ${fmt(amt)} Mark gesetzt` : ''));
      el.disabled = busy;
    }
    document.querySelectorAll('.chip').forEach((b) => {
      const v = b.dataset.chip === 'all' ? 'all' : Number(b.dataset.chip);
      b.setAttribute('aria-checked', String(v === chip));
      b.disabled = busy || (v !== 'all' && v > S.balance);
    });
    const has = Object.keys(S.bets).length > 0;
    const lastSum = L.stake(S.last);
    const dis = { undo: !has, clear: !has, spin: !has, rebet: has || !lastSum || lastSum > S.balance, cashout: false };
    for (const [k, v] of Object.entries(dis)) document.querySelector(`[data-act=${k}]`).disabled = busy || v;

    $('history').replaceChildren(...S.history.slice(shown ? 1 : 0).map((n) => {
      const li = document.createElement('li'); li.className = L.color(n); li.textContent = n; return li;
    }));
    $('sound').textContent = muted ? 'Ton an' : 'Ton aus';
  }

  function clearCall() {
    $('layout').classList.remove('called');
    document.querySelectorAll('.hit').forEach((e) => e.classList.remove('hit'));
  }

  function place(key) {
    if (busy) return;
    clearCall();
    let amt = chip === 'all' ? S.balance : chip;
    if (amt > S.balance) amt = 0;
    if (!amt) {
      say(S.balance ? `Dafür reicht es nicht. Du hast noch ${fmt(S.balance)} Mark.` : 'Alles liegt auf dem Tisch. Dreh den Kessel.');
      return;
    }
    S.balance -= amt;
    S.bets[key] = (S.bets[key] || 0) + amt;
    S.log.push([key, amt]);
    sfx.chip();
    say(`${fmt(L.stake(S.bets))} Mark gesetzt.`);
    save(); render();
  }
  function unplace(index) {
    const [[key, amt]] = S.log.splice(index, 1);
    S.balance += amt;
    S.bets[key] -= amt;
    if (!S.bets[key]) delete S.bets[key];
    sfx.chip();
    const sum = L.stake(S.bets);
    say(sum ? `${fmt(sum)} Mark gesetzt.` : 'Bitte das Spiel zu machen.');
    save(); render();
  }
  function removeFrom(key) {
    if (busy) return;
    for (let i = S.log.length - 1; i >= 0; i--) if (S.log[i][0] === key) { unplace(i); return; }
  }
  function clearBets() {
    S.balance += L.stake(S.bets);
    S.bets = {}; S.log = [];
    say('Bitte das Spiel zu machen.');
    save(); render();
  }
  function rebet() {
    clearCall();
    for (const [k, v] of Object.entries(S.last)) { S.balance -= v; S.bets[k] = v; S.log.push([k, v]); }
    sfx.chip();
    say(`${fmt(L.stake(S.bets))} Mark gesetzt.`);
    save(); render();
  }

  async function spin() {
    const bets = S.bets;
    const staked = L.stake(bets);
    if (busy || !staked) return;
    busy = true;
    clearCall();
    shown = { balance: S.balance, bets };

    // Erst verbuchen und speichern, dann zeigen: Neuladen ändert nichts mehr.
    const n = L.rnd(37);
    const won = L.payout(bets, n);
    S.balance += won;
    S.last = bets; S.bets = {}; S.log = [];
    S.history = [n, ...S.history].slice(0, 12);
    S.rounds++;
    S.peak = Math.max(S.peak, S.balance);
    save(); render();

    say('Nichts geht mehr.');
    if (portrait.matches) scrollTo({ top: 0, behavior: calm.matches ? 'auto' : 'smooth' });
    await spinWheel(n);

    const name = { red: 'Rot', black: 'Schwarz', green: 'Grün' }[L.color(n)];
    const net = won - staked;
    $('layout').classList.add('called');
    for (const [key, el] of cells) if (key === 'n' + n || (bets[key] && L.bet(key).hit(n))) el.classList.add('hit');
    const head = n === 0 ? 'Zero' : `${n}, ${name}`;
    say(net > 0 ? `${head}. Du gewinnst ${fmt(net)} Mark.` : net < 0 ? `${head}. Du verlierst ${fmt(-net)} Mark.` : `${head}. Du bekommst deinen Einsatz zurück.`);
    if (net > 0) sfx.win();
    shown = null;
    if (S.balance > 0) { busy = false; render(); return; }
    render();
    await wait(2200);
    say('Du hast nichts mehr.');
    await wait(1800);
    enterGun();
  }

  /* ---------- Revolver ---------- */

  const WORDS = ['Keine Kugel', 'Eine Kugel', 'Zwei Kugeln', 'Drei Kugeln', 'Vier Kugeln', 'Fünf Kugeln'];
  function gunView(title, text, go, leave) {
    $('gunTitle').textContent = title;
    $('gunText').textContent = text;
    $('gunGo').hidden = !go;
    $('gunLeave').hidden = !leave;
    if (go) { $('gunGo').textContent = go[0]; $('gunGo').onclick = go[1]; }
    if (leave) { $('gunLeave').textContent = leave[0]; $('gunLeave').onclick = leave[1]; }
  }
  function setPhase(p) {
    S.phase = p;
    body.dataset.phase = p === 'gun' ? 'gun' : 'table';
    $('gun').hidden = p !== 'gun';
    $('table').inert = p === 'gun';
  }

  function enterGun() {
    S.visits++;
    S.chambers = null; S.fired = 0;
    setPhase('gun');
    save();
    clearCall();
    scrollTo(0, 0);
    park();
    gunScreen();
    render();
    $('gunGo').focus({ preventScroll: true });
  }

  // Zeichnet den aktuellen Zustand neu; auch nach dem Neuladen.
  function gunScreen() {
    busy = false;
    const b = bullets();
    const odds = `${b} von ${L.CHAMBERS - S.fired}`;
    const next = fmt(L.pot(b, S.fired + 1));
    const quit = ['Aufhören und gehen', () => leaveGun('gone')];
    if (!S.chambers) {
      cylMode = 'loading';
      gunView(`${WORDS[b]}, sechs Kammern`,
        S.visits === 1 ? `Das Haus leiht dir nichts mehr. Aber es zahlt ${next} Mark, wenn du einmal abdrückst und sitzen bleibst.`
          : `Schon wieder pleite. Diesmal ${b === 1 ? 'liegt eine Kugel' : `liegen ${b} Kugeln`} in der Trommel, dafür zahlt das Haus ${next} Mark.`,
        ['Trommel drehen', spinCylinder], quit);
    } else if (S.fired === 0) {
      cylMode = 'hidden';
      gunView('Die Trommel steht', `Die Chance auf eine Kugel ist ${odds}.`, [`Abdrücken für ${next} Mark`, pull], quit);
    } else {
      cylMode = 'hidden';
      const won = fmt(L.pot(b, S.fired));
      const home = [`Mit ${won} Mark zurück an den Tisch`, () => leaveGun('table')];
      if (S.fired >= L.CHAMBERS - b) gunView('Klick. Leer.', `Mehr leere Kammern gibt es nicht. Nimm die ${won} Mark.`, home, null);
      else gunView('Klick. Leer.', `${won} Mark gehören dir. Noch ein Schuss macht daraus ${next}. Die Chance auf eine Kugel ist jetzt ${odds}.`,
        [`Nochmal abdrücken für ${next} Mark`, pull], home);
    }
    paintChambers();
  }

  async function spinCylinder() {
    if (busy) return;
    busy = true;
    S.chambers = L.load(bullets());
    S.fired = 0;
    save();
    gunView('Die Trommel dreht', '', null, null);
    $('gunText').textContent = '';
    cylMode = 'hidden'; paintChambers();
    const from = mod(cylA, 360);
    let notch = -1;
    await animate(calm.matches ? 500 : 3200, (u) => {
      const a = from + (2160 - from) * (1 - (1 - u) ** 3);
      setCyl(a);
      const k = Math.floor(a / 60);
      if (k !== notch) { notch = k; sfx.ratchet(); }
    });
    setCyl(0);
    gunScreen();
    $('gunGo').focus({ preventScroll: true });
  }

  async function pull() {
    if (busy) return;
    busy = true;
    const dead = S.chambers[S.fired];
    const n = S.fired + 1;
    // Wie am Tisch: das Ergebnis steht fest und ist gespeichert, bevor man es sieht.
    if (dead) S.phase = 'dead'; else { S.fired = n; S.pulls++; }
    save();

    gunView('', '', null, null);
    body.classList.add('tense');
    const hammer = $('hammer');
    hammer.setAttribute('class', 'cocked');
    sfx.cock();
    const from = (n - 1) * 60;
    await animate(calm.matches ? 200 : 700, (u) => setCyl(from + 60 * u * u * (3 - 2 * u)));
    sfx.ratchet();
    for (let i = 0; i < 2; i++) { sfx.heart(); await wait(850); }
    if (Math.random() < .5) { sfx.heart(); await wait(850); }
    hammer.setAttribute('class', 'strike');
    if (dead) { sfx.bang(); body.classList.remove('tense'); showEnd(true); hammer.setAttribute('class', ''); return; }
    sfx.dry();
    body.classList.remove('tense');
    gunScreen();
    setTimeout(() => hammer.setAttribute('class', ''), 400);
    $('gunGo').focus({ preventScroll: true });
  }

  async function leaveGun(to) {
    if (busy) return;
    busy = true;
    const won = to === 'table' ? L.pot(bullets(), S.fired) : 0;
    const chambers = S.chambers;
    const wasFired = S.fired;
    S.balance = won;
    S.peak = Math.max(S.peak, won);
    S.phase = to;
    save();
    if (chambers) {
      cylMode = 'reveal'; paintChambers();
      const i = chambers.indexOf(true, wasFired) - wasFired + 1;
      gunView(i === 1 ? 'Die nächste wär’s gewesen' : `Schuss ${i} wär’s gewesen`, '', null, null);
      await wait(2600);
    }
    S.chambers = null; S.fired = 0;
    if (to === 'gone') { finish(); return; }
    setPhase('table');
    busy = false;
    save();
    say(`Du hast ${fmt(won)} Mark. Bitte das Spiel zu machen.`);
    render();
  }

  /* ---------- Ende ---------- */

  function finish() {
    S.phase = 'gone';
    const best = Number(store.get(BEST)) || 0;
    if (S.balance > best) store.set(BEST, String(S.balance));
    save();
    showEnd(false);
  }
  function showEnd(flash) {
    const dead = S.phase === 'dead';
    const best = Number(store.get(BEST)) || 0;
    const end = $('end');
    end.dataset.kind = dead ? 'dead' : 'gone';
    end.classList.toggle('flash', !!flash);
    const times = (n, one, many) => (n === 1 ? one : `${fmt(n)} ${many}`);
    const rounds = times(S.rounds, 'eine Runde', 'Runden');
    if (dead) {
      $('endTitle').textContent = 'Nichts geht mehr.';
      $('endText').textContent = `Du hast ${rounds} gespielt und hattest höchstens ${fmt(S.peak)} Mark. `
        + (S.pulls ? `${times(S.pulls, 'Eine leere Kammer', 'leere Kammern')} lang ging es gut.` : 'Es war der erste Schuss.');
    } else if (S.balance > 0) {
      $('endTitle').textContent = `Du gehst mit ${fmt(S.balance)} Mark.`;
      const diff = S.balance - L.START;
      $('endText').textContent = `${S.rounds ? `Nach ${rounds === 'eine Runde' ? 'einer Runde' : rounds}` : 'Ohne eine Runde'} `
        + (diff > 0 ? `sind das ${fmt(diff)} Mark mehr als am Anfang.` : diff < 0 ? `fehlen dir ${fmt(-diff)} Mark.` : 'hast du genau so viel wie am Anfang.')
        + (S.pulls ? ` Dafür hast du ${times(S.pulls, 'einmal', 'Mal')} abgedrückt.` : '');
    } else {
      $('endTitle').textContent = 'Du gehst. Pleite, aber du gehst.';
      $('endText').textContent = 'Nicht abdrücken ist der einzige Zug, bei dem das Haus nie gewinnt.';
    }
    $('endBest').textContent = best ? `Dein bester Abend: ${fmt(best)} Mark.` : '';
    end.hidden = false;
    document.querySelector('main').inert = true;
    $('endTitle').focus({ preventScroll: true });
  }
  function restart() {
    S = fresh();
    S.phase = 'table';
    shown = null; busy = false;
    $('end').hidden = true;
    $('end').classList.remove('flash');
    document.querySelector('main').inert = false;
    setPhase('table');
    clearCall();
    say('Bitte das Spiel zu machen.');
    save(); park(); render();
  }

  /* ---------- Ereignisse ---------- */

  const acts = {
    spin, rebet, restart,
    undo: () => unplace(S.log.length - 1),
    clear: clearBets,
    cashout() { S.balance += L.stake(S.bets); S.bets = {}; S.log = []; finish(); },
    sound() { muted = !muted; store.set(MUTE, muted ? '1' : '0'); render(); if (!muted) sfx.chip(); },
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.key) place(b.dataset.key);
    else if (b.dataset.chip) { chip = b.dataset.chip === 'all' ? 'all' : Number(b.dataset.chip); sfx.tick(); render(); }
    else if (b.dataset.act) acts[b.dataset.act]();
  });
  $('layout').addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.cell');
    if (b) { e.preventDefault(); removeFrom(b.dataset.key); }
  });
  document.addEventListener('keydown', (e) => {
    const key = document.activeElement && document.activeElement.dataset.key;
    if (key && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); removeFrom(key); }
    const c = document.activeElement && document.activeElement.dataset.chip;
    if (c && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const list = [...document.querySelectorAll('.chip:not(:disabled)')];
      const next = list[mod(list.indexOf(document.activeElement) + (e.key === 'ArrowRight' ? 1 : -1), list.length)];
      next.focus(); next.click();
    }
  });
  portrait.addEventListener('change', () => { if (!busy) park(); else $('pointer').style.transform = `rotate(${aim()}deg)`; });

  /* ---------- Start ---------- */

  buildTable();
  $('stage').classList.add('snap');
  setPhase(S.phase);
  park();
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => $('stage').classList.remove('snap')));

  if (S.phase === 'intro') {
    $('intro').addEventListener('close', () => { S.phase = 'table'; save(); audio(); });
    $('intro').showModal();
  } else if (S.phase === 'dead' || S.phase === 'gone') showEnd(false);
  else if (S.phase === 'gun') gunScreen();
  else if (S.balance === 0 && !Object.keys(S.bets).length) enterGun();
})();
