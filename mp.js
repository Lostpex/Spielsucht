/* Gemeinsamer Tisch: Verbindung (PeerJS) und Anzeige. Der Gastgeber rechnet mit room.js,
   alle anderen schicken Wünsche und spielen Ereignisse der Reihe nach ab. */
(function () {
  'use strict';
  const PREFIX = 'roulette-tisch-';
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  const COLORS = [['#2457c5', '#fff'], ['#f4c531', '#1c1014'], ['#12a39a', '#1c1014'], ['#7a3fd0', '#fff'],
    ['#ef7d1a', '#1c1014'], ['#8fd14f', '#1c1014'], ['#6b4a2f', '#fff'], ['#69c4f0', '#1c1014']];
  const SILENCE = 16000;
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let G = null;          // window.Game
  let code = '';
  let me = 0;
  let V = null;          // zuletzt gezeigter Stand
  let send = () => {};   // schickt einen Wunsch an den Gastgeber
  let isHost = false;
  let leaving = false;
  let clockEnd = null;

  const store = {
    get(a, k) { try { return a.getItem(k); } catch { return null; } },
    set(a, k, v) { try { a.setItem(k, v); } catch { /* privater Modus */ } },
  };
  const random = (n) => { let s = ''; for (let i = 0; i < n; i++) s += ABC[window.Logic.rnd(ABC.length)]; return s; };
  // Der Schlüssel weist mich nach einem Verbindungsabbruch am selben Tisch wieder aus.
  function token() {
    let t = store.get(sessionStorage, 'spielsucht.schluessel');
    if (!t) { t = random(20); store.set(sessionStorage, 'spielsucht.schluessel', t); }
    return t;
  }
  const fromHash = () => {
    const m = /^#tisch=([a-z0-9]{6})$/i.exec(location.hash);
    return m && CODE.test(m[1].toUpperCase()) ? m[1].toUpperCase() : '';
  };

  /* ---------- Verbindung ---------- */

  let lib = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    lib = lib || new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = ok;
      s.onerror = () => { lib = null; no(new Error('Das Netzwerkmodul konnte nicht geladen werden. Lade die Seite neu.')); };
      document.head.append(s);
    });
    return lib;
  }
  const PROBLEMS = {
    'peer-unavailable': 'Diesen Tisch gibt es nicht. Prüf den Code oder frag, ob der Tisch noch offen ist.',
    'browser-incompatible': 'Dein Browser kann keine Direktverbindung (WebRTC).',
    network: 'Der Vermittlungsdienst ist nicht erreichbar. Prüf deine Internetverbindung.',
    'server-error': 'Der Vermittlungsdienst ist nicht erreichbar. Versuch es gleich nochmal.',
    'socket-error': 'Der Vermittlungsdienst ist nicht erreichbar. Prüf deine Internetverbindung.',
  };
  const problem = (e) => new Error((e && PROBLEMS[e.type]) || (e && e.mp) || 'Die Verbindung klappt nicht. Manche Firmen- und Schulnetze sperren Direktverbindungen.');

  function openPeer(id) {
    return new Promise((ok, no) => {
      const peer = id ? new window.Peer(id) : new window.Peer();
      const timer = setTimeout(() => { peer.destroy(); no(problem({ type: 'network' })); }, 15000);
      peer.once('open', () => { clearTimeout(timer); ok(peer); });
      peer.once('error', (e) => { clearTimeout(timer); peer.destroy(); no(e); });
    });
  }

  async function host(name) {
    await loadPeer();
    let peer = null;
    for (let i = 0; !peer; i++) {
      code = random(6);
      try { peer = await openPeer(PREFIX + code); } catch (e) { if (e.type !== 'unavailable-id' || i > 3) throw e.type ? problem(e) : e; }
    }
    peer.on('error', () => {});
    // Vermittlung weg heißt nur: keine neuen Gäste. Bestehende Verbindungen laufen weiter.
    peer.on('disconnected', () => setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 2000));

    const conns = new Map(); // Spieler-ID → Verbindung
    const room = new window.Room({
      emit(e) {
        const msg = { ...e, view: room.view() };
        for (const c of conns.values()) if (c.open) c.send(msg);
        receive(msg);
      },
    });
    peer.on('connection', (conn) => {
      let id = 0;
      let budget = 40;
      let seen = Date.now();
      const giveUp = setTimeout(() => { if (!id) conn.close(); }, 15000);
      const watch = setInterval(() => {
        budget = Math.min(40, budget + 20);
        if (id && conns.get(id) === conn && Date.now() - seen > SILENCE) gone();
      }, 1000);
      const gone = () => { if (id && conns.get(id) === conn) { conns.delete(id); room.setOnline(id, false); } };
      conn.on('close', () => { clearTimeout(giveUp); clearInterval(watch); gone(); });
      conn.on('error', gone);
      conn.on('data', (m) => {
        if (!m || typeof m !== 'object' || --budget < 0) return;
        seen = Date.now();
        if (m.t === 'ping') {
          conn.send({ t: 'pong' });
          if (id && !conns.has(id)) { conns.set(id, conn); room.setOnline(id, true); }
        } else if (m.t === 'hello' && !id) {
          if (typeof m.token !== 'string' || m.token.length !== 20) { conn.close(); return; }
          const known = room.players.find((p) => p.token === m.token);
          if (known && known.id === room.players[0].id) { conn.close(); return; }
          // Erst eintragen, dann beitreten: der Beitritt löst schon ein Ereignis aus.
          if (known) { const old = conns.get(known.id); conns.set(known.id, conn); id = known.id; if (old && old !== conn) old.close(); }
          const p = room.join(m.token, m.name);
          if (!p) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
          id = p.id; conns.set(id, conn);
          conn.send({ t: 'welcome', you: id, view: room.view() });
        } else if (id) room.handle(id, m);
      });
    });

    isHost = true;
    send = (m) => room.handle(me, m);
    const mine = room.join(token(), name);
    begin(mine.id, room.view());
    setInterval(() => room.tick(), 200);
    addEventListener('pagehide', () => { for (const c of conns.values()) if (c.open) c.send({ t: 'bye' }); });
    addEventListener('beforeunload', (e) => { if (!leaving && room.players.length > 1) e.preventDefault(); });
  }

  async function join(wanted, name) {
    await loadPeer();
    code = wanted;
    let peer;
    try { peer = await openPeer(); } catch (e) { throw e.type ? problem(e) : e; }
    let conn = null;
    let heard = 0;

    const connect = () => new Promise((ok, no) => {
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      let done = false;
      const fail = (e) => { if (done) return; done = true; clearTimeout(timer); peer.off('error', fail); c.close(); no(e.message && !e.type ? e : problem(e)); };
      const timer = setTimeout(() => fail({}), 15000);
      peer.on('error', fail);
      c.on('error', fail);
      c.on('open', () => c.send({ t: 'hello', token: token(), name }));
      c.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        heard = Date.now();
        if (m.t === 'bye') { if (conn === c) { conn = null; if (!leaving) closed(); } } else if (m.t === 'full') fail(new Error('Dieser Tisch ist voll.'));
        else if (m.t === 'welcome' && !done) {
          done = true; clearTimeout(timer); peer.off('error', fail);
          conn = c; ok(m);
        } else if (m.t !== 'pong' && conn === c) receive(m);
      });
      c.on('close', () => { if (!done) fail({}); else if (conn === c) lost(); });
    });

    let mending = false;
    async function lost() {
      if (mending || leaving) return;
      mending = true;
      conn = null;
      G.busy = true; G.render();
      for (let i = 0; i < 6 && !leaving; i++) {
        G.say('Verbindung unterbrochen. Ich versuche es nochmal.');
        try {
          if (peer.destroyed) peer = await openPeer();
          else if (peer.disconnected) peer.reconnect();
          await wait(1500 + i * 1500);
          const w = await connect();
          mending = false;
          me = w.you;
          receive({ t: 'sync', view: w.view });
          return;
        } catch { /* nächster Versuch */ }
      }
      closed();
    }

    addEventListener('pagehide', () => { leaving = true; peer.destroy(); });
    const w = await connect();
    send = (m) => { if (conn && conn.open) conn.send(m); };
    begin(w.you, w.view);
    setInterval(() => {
      if (!conn) return;
      if (conn.open) conn.send({ t: 'ping' });
      if (Date.now() - heard > SILENCE) { const c = conn; lost(); c.close(); }
    }, 4000);
  }

  function leave() {
    leaving = true;
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  }
  function closed() {
    G.gunView('Der Tisch ist zu', 'Der Gastgeber ist weg oder die Verbindung kam nicht zurück.', ['Tisch verlassen', leave], null);
    $('seats').hidden = true;
    G.setPhase('gun');
    G.render();
    $('end').hidden = true;
    document.querySelector('main').inert = false;
    leaving = true;
  }

  /* ---------- Ereignisse der Reihe nach ---------- */

  const queue = [];
  let running = false;
  function receive(m) { queue.push(m); if (!running) drain(); }
  async function drain() {
    if (!V) return;
    running = true;
    while (queue.length && !(leaving && !isHost)) {
      const m = queue.shift();
      // Nach langer Pause im Hintergrund nicht alles nachspielen.
      if (queue.length > 12 && m.t !== 'state') { await show({ t: 'sync', view: m.view }); continue; }
      try { await show(m); } catch (e) { console.error(e); await show({ t: 'sync', view: m.view }); }
    }
    running = false;
  }

  const who = (id, view = V) => view.players.find((p) => p.id === id) || { id, name: 'Jemand', status: 'home', cash: 0, bets: {} };
  const mine = () => who(me);
  const color = (id) => COLORS[(id - 1) % COLORS.length];

  async function show(m) {
    const before = V;
    const S = G.S;
    const view = m.view;
    if (m.t !== 'sync' && m.t !== 'state') setClock(null);

    if (m.t === 'spin') {
      await toTable();
      const r = m.results.find((x) => x.id === me) || { bets: {}, staked: 0, won: 0, before: who(me, view).cash };
      V = { ...view, players: view.players.map((p) => { const x = m.results.find((y) => y.id === p.id); return x ? { ...p, bets: x.bets, cash: x.before + x.staked } : p; }) };
      S.history = view.history; S.bets = {}; S.log = [];
      if (r.staked) S.last = r.bets;
      S.balance = who(me, view).cash;
      G.busy = true;
      G.shown = { balance: r.before, bets: r.bets };
      G.clearCall();
      G.render();
      await G.callSpin(m.n);
      G.callResult(m.n, r.bets, r.staked, r.won);
      G.shown = null;
      V = view;
      G.render();
      setClock(null);
      return;
    }
    if (m.t === 'gun') {
      V = view;
      const names = view.gun.seats.map((s) => who(s.id).name);
      G.say(view.gun.seats.some((s) => s.id === me) ? 'Du hast nichts mehr.' : `${list(names)} ${names.length > 1 ? 'haben' : 'hat'} nichts mehr.`);
      await G.wait(1200);
      toGun();
      screen();
      return;
    }
    if (m.t === 'cyl') {
      V = view; seats(null);
      S.chambers = null; S.fired = 0;
      await G.cylAnim();
      screen();
      return;
    }
    if (m.t === 'pull') {
      seats(m.by);
      const p = who(m.by, view);
      S.fired = m.n - 1;
      const anim = G.pullAnim(m.n, m.beats, m.dead);
      $('gunTitle').textContent = m.by === me ? 'Du drückst ab' : `${p.name} drückt ab`;
      await anim;
      S.fired = m.dead ? m.n - 1 : m.n;
      V = view;
      G.paint('hidden');
      seats(null);
      if (m.dead) {
        const f = document.createElement('div');
        f.className = 'flashbang'; f.addEventListener('animationend', () => f.remove());
        document.body.append(f); setTimeout(() => f.remove(), 2500);
        G.gunView(m.by === me ? 'Nichts geht mehr.' : `${p.name} ist tot.`, m.by === me ? 'Du bist raus und schaust jetzt zu.' : '', null, null);
      } else if (view.gun.over) G.gunView('Klick. Leer.', 'Mehr leere Kammern gibt es nicht. Das Haus zahlt alle aus, die noch sitzen.', null, null);
      else screen();
      return;
    }
    if (m.t === 'pass') {
      V = view;
      const left = who(m.from);
      const next = who(view.gun.holder);
      G.gunView(left.status === 'quit' ? `${left.id === me ? 'Du stehst auf' : `${left.name} steht auf`} und ${left.id === me ? 'gehst' : 'geht'}` : 'Der Revolver geht weiter',
        next.id === me ? 'Er kommt zu dir.' : `Er geht an ${next.name}.`, null, null);
      seats(null);
      const st = $('stage');
      st.classList.add('handed');
      await G.wait(1050);
      st.classList.remove('handed');
      screen();
      return;
    }
    if (m.t === 'reveal') {
      V = view;
      if (m.chambers) { S.chambers = m.chambers; G.paint('reveal'); }
      $('seats').hidden = true;
      const pays = m.paid.map((x) => (x.id === me ? `du bekommst ${G.fmt(x.sum)} Mark` : `${who(x.id).name} bekommt ${G.fmt(x.sum)} Mark`));
      const i = m.chambers ? m.chambers.indexOf(true, m.fired) - m.fired + 1 : 0;
      const title = m.why === 'back' ? (i === 1 ? 'Die nächste wär’s gewesen' : `Schuss ${i} wär’s gewesen`)
        : m.why === 'bang' ? $('gunTitle').textContent : m.why === 'spared' ? 'Alle leben' : 'Niemand drückt ab';
      const t = pays.length ? pays.join(', ') + '.' : '';
      G.gunView(title, t && t[0].toUpperCase() + t.slice(1), null, null);
      await G.wait(m.chambers ? 3600 : 1200);
      return;
    }
    // 'state' und 'sync': ganzer Stand
    V = view;
    setClock(view.left);
    if (view.phase === 'end') {
      // Der Filz hinter der Rangliste zeigt, was mir bleibt.
      S.balance = worth(mine()); S.bets = {}; S.log = [];
      G.busy = true;
      await toTable(); G.render(); ranking();
      return;
    }
    if ($('end').hidden === false) { $('end').hidden = true; document.querySelector('main').inert = false; }
    if (view.phase === 'gun' || view.phase === 'reveal') {
      if (!view.gun) return;
      if (document.body.dataset.phase !== 'gun') toGun();
      S.fired = view.gun.fired;
      if (m.t === 'sync') { S.visits = view.gun.bullets; G.park(); }
      if (view.phase === 'gun') screen();
      return;
    }
    await toTable();
    const p = mine();
    const fresh = m.t === 'sync' || !before || before.round !== view.round || before.phase !== 'bet';
    S.history = view.history;
    if (fresh && view.phase === 'bet') {
      S.bets = { ...p.bets }; S.log = Object.entries(p.bets);
      S.balance = p.cash - window.Logic.stake(p.bets);
      S.chambers = null; S.fired = 0;
      G.clearCall();
      if (m.t === 'sync') G.park();
    }
    if (m.t === 'sync' && view.phase !== 'bet') S.balance = p.cash;
    if (p.status !== 'in') { S.balance = p.status === 'home' || p.status === 'wait' ? p.cash : 0; S.bets = {}; S.log = []; }
    G.busy = view.phase !== 'bet' || p.status !== 'in' || p.ready;
    G.render();
    tableLine(fresh);
  }

  async function toTable() {
    if (document.body.dataset.phase !== 'gun') return;
    G.setPhase('table');
    G.S.chambers = null; G.S.fired = 0;
    G.render();
    await G.wait(900);
  }
  function toGun() {
    G.S.visits = V.gun.bullets; G.S.chambers = null; G.S.fired = V.gun.fired;
    G.busy = true;
    G.clearCall();
    G.setPhase('gun');
    scrollTo(0, 0);
    G.park();
    G.render();
  }

  /* ---------- Tisch ---------- */

  const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`);

  function tableLine(fresh) {
    if (V.phase !== 'bet') return;
    const p = mine();
    const open = V.players.filter((x) => x.status === 'in' && x.online && !x.ready).map((x) => x.name);
    if (p.status === 'wait') G.say('Du bist ab der nächsten Runde dabei.');
    else if (p.status !== 'in') G.say(p.status === 'home' ? 'Du bist zu Hause und schaust zu.' : 'Du bist raus und schaust zu.');
    else if (p.ready) G.say(open.length ? `Warten auf ${list(open)}.` : 'Alle sind bereit.');
    else if (fresh) G.say('Bitte das Spiel zu machen.');
    if (clockEnd && !p.ready && p.status === 'in') {
      G.say(Object.keys(G.S.bets).length ? 'Die Zeit läuft. Dein Einsatz gilt, drück „Bereit“.' : 'Die Zeit läuft. Setz, sonst dreht der Kessel ohne dich.');
    }
  }

  function mark(p) {
    const el = document.createElement('span');
    const [bg, fg] = color(p.id);
    el.className = 'mark';
    el.style.setProperty('--p', bg); el.style.setProperty('--pt', fg);
    el.textContent = [...p.name][0].toUpperCase();
    return el;
  }
  function span(cls, text) { const el = document.createElement('span'); el.className = cls; el.textContent = text; return el; }
  const STATUS = { dead: 'tot', quit: 'aufgestanden', home: 'zu Hause', wait: 'gleich dabei' };

  // Wird bei jedem render() des Tisches gerufen.
  function decorate(cells) {
    const p = mine();
    $('players').replaceChildren(...V.players.map((x) => {
      const li = document.createElement('li');
      li.classList.toggle('ready', x.ready && V.phase === 'bet');
      li.classList.toggle('off', !x.online || ['dead', 'quit', 'home'].includes(x.status));
      const cash = x.status === 'dead' || x.status === 'quit' ? '' : G.fmt(x.cash) + ' Mark';
      const note = STATUS[x.status] || (!x.online ? 'nicht verbunden' : x.ready && V.phase === 'bet' ? 'bereit' : '');
      li.append(mark(x), span('', x.id === me ? `${x.name} (du)` : x.name), span('sum', cash), span('', note));
      return li;
    }));
    for (const [key, el] of cells) {
      const there = V.players.filter((x) => x.id !== me && x.bets[key]);
      let box = el.querySelector('.others');
      if (!there.length) { if (box) box.remove(); continue; }
      if (!box) { box = document.createElement('span'); box.className = 'others'; el.append(box); }
      box.replaceChildren(...there.map(mark));
      el.setAttribute('aria-label', el.getAttribute('aria-label') + '. ' + there.map((x) => `${x.name}: ${G.fmt(x.bets[key])} Mark`).join(', '));
      el.title = there.map((x) => `${x.name}: ${G.fmt(x.bets[key])} Mark`).join('\n');
    }
    for (const [, el] of cells) if (!el.querySelector('.others')) el.removeAttribute('title');
    const betting = V.phase === 'bet' && p.status === 'in';
    const btn = $('spin');
    btn.textContent = p.ready ? 'Doch nicht' : 'Bereit';
    btn.disabled = !betting || (!p.ready && !Object.keys(G.S.bets).length);
    document.querySelector('[data-act=cashout]').disabled = !betting || p.ready;
  }

  /* ---------- Revolver ---------- */

  // Reihenfolge am Revolver; by: wer gerade abdrückt.
  function seats(by) {
    const g = V.gun;
    const el = $('seats');
    el.hidden = !g || !g.seats.length;
    if (!g) return;
    el.replaceChildren(...g.seats.map((s) => {
      const p = who(s.id);
      const li = document.createElement('li');
      li.classList.toggle('holds', s.id === (by || g.holder));
      li.append(mark(p), span('', s.id === me ? `${p.name} (du)` : p.name));
      if (s.pulls) li.append(span('sum', G.fmt(window.Logic.pot(g.bullets, s.pulls)) + ' Mark'));
      return li;
    }));
  }

  function screen() {
    const g = V.gun;
    if (!g || !g.holder) return;
    seats(null);
    setClock(V.left);
    G.paint(g.loaded ? 'hidden' : 'loading');
    const L = window.Logic;
    const s = g.seats.find((x) => x.id === g.holder);
    const p = who(g.holder);
    const at = g.seats.indexOf(s);
    const next = g.seats.length > 1 ? who(g.seats[(at + 1) % g.seats.length].id) : null;
    const odds = `${g.bullets}\u00a0von\u00a0${L.CHAMBERS - g.fired}`;
    const now = G.fmt(L.pot(g.bullets, s.pulls));
    const more = G.fmt(L.pot(g.bullets, s.pulls + 1));
    const act = (t) => () => { send({ t }); $('gunGo').disabled = $('gunLeave').disabled = true; };
    $('gunGo').disabled = $('gunLeave').disabled = false;

    if (g.holder !== me) {
      const t = !g.loaded ? `${G.WORDS[g.bullets]}, sechs Kammern.` : `Die Chance auf eine Kugel ist ${odds}.`;
      const just = g.options.includes('pass') || (g.options.includes('back') && s.pulls);
      G.gunView(just ? 'Klick. Leer.' : `${p.name} hat den Revolver`, just ? `${p.name} steht bei ${now} Mark. ${t}` : t, null, null);
      return;
    }
    if (!g.loaded) {
      G.gunView(`${G.WORDS[g.bullets]}, sechs Kammern`, (next ? `Du hast den Revolver. Nach dir kommt ${next.name}. ` : '') + `Der erste Schuss bringt ${more} Mark, wenn du ihn überlebst.`,
        ['Trommel drehen', act('cyl')], ['Aufhören und gehen', act('quit')]);
    } else {
      const can = g.options;
      const line = `Die Chance auf eine Kugel ist jetzt ${odds}.`;
      const out = can.includes('pass') ? [`Revolver an ${next.name} weitergeben`, act('pass')]
        : can.includes('back') ? [`Mit ${now} Mark zurück an den Tisch`, act('back')] : ['Aufhören und gehen', act('quit')];
      G.gunView(can.includes('quit') ? 'Du hast den Revolver' : 'Klick. Leer.',
        s.pulls ? `${now} Mark gehören dir, wenn du die Runde überlebst. Noch ein Schuss macht daraus ${more}. ${line}` : line,
        [s.pulls ? `Nochmal abdrücken für ${more} Mark` : `Abdrücken für ${more} Mark`, act('pull')], out);
    }
    $('gunGo').focus({ preventScroll: true });
  }

  /* ---------- Ende ---------- */

  function ranking() {
    setClock(null);
    const rank = V.players.filter((p) => p.status !== 'wait').slice()
      .sort((a, b) => worth(b) - worth(a) || (a.status === 'dead') - (b.status === 'dead'));
    const best = rank[0];
    $('end').dataset.kind = 'gone';
    $('end').classList.remove('flash');
    $('endTitle').textContent = !best || !worth(best) ? 'Alle pleite.' : best.id === me ? 'Du gewinnst.' : `${best.name} gewinnt.`;
    $('endText').textContent = ''; $('endBest').textContent = '';
    $('ranking').hidden = false;
    $('ranking').replaceChildren(...rank.map((p) => {
      const li = document.createElement('li');
      li.append(mark(p), span('', p.id === me ? `${p.name} (du)` : p.name), span('sum', G.fmt(worth(p)) + ' Mark'), span('', STATUS[p.status] || ''));
      return li;
    }));
    const b = $('restart');
    b.textContent = V.host === me ? 'Neue Partie' : `${who(V.host).name} startet die nächste Partie`;
    b.disabled = V.host !== me;
    $('endLeave').hidden = false;
    $('end').hidden = false;
    document.querySelector('main').inert = true;
    $('endTitle').focus({ preventScroll: true });
  }
  const worth = (p) => (p.status === 'dead' || p.status === 'quit' ? 0 : p.cash);

  /* ---------- Uhr ---------- */

  function setClock(left) { clockEnd = left == null ? null : Date.now() + left; tickClock(); }
  function tickClock() {
    const s = clockEnd == null ? null : Math.max(0, Math.ceil((clockEnd - Date.now()) / 1000));
    const gun = document.body.dataset.phase === 'gun';
    $('gunClock').hidden = !(gun && V && V.phase === 'gun' && s != null && s <= 30);
    $('gunClock').textContent = `Noch ${s} Sekunden`;
    $('tableClock').textContent = !gun && V && V.phase === 'bet' && s != null ? `Noch ${s} s` : '';
  }

  /* ---------- Beitreten ---------- */

  function begin(id, view) {
    me = id;
    G.enter({
      changed: queueBets, ready, decorate,
      home() { send({ t: 'home' }); },
      again() { send({ t: 'new' }); },
    });
    $('lobby').close();
    $('party').hidden = false;
    $('friendsBtn').hidden = true;
    $('code').textContent = code;
    const clock = span('', ''); clock.id = 'tableClock'; $('code').parentNode.append(clock);
    history.replaceState(null, '', `#tisch=${code}`);
    G.audio();
    V = { ...view, round: -1 };
    receive({ t: 'sync', view });
    setInterval(tickClock, 250);
  }

  let betTimer = 0;
  function sendBets() { clearTimeout(betTimer); betTimer = 0; send({ t: 'bets', round: V.round, bets: G.S.bets }); }
  function queueBets() { if (!betTimer) betTimer = setTimeout(sendBets, 120); }
  function ready() {
    const on = !mine().ready;
    if (on) sendBets();
    G.busy = true;
    send({ t: 'ready', on });
    G.render();
  }

  async function go(way) {
    const name = $('nick').value.trim();
    const wanted = $('joinCode').value.trim().toUpperCase();
    const msg = $('lobbyMsg');
    if (!name) { msg.textContent = 'Gib einen Namen ein.'; $('nick').focus(); return; }
    if (way === 'join' && !CODE.test(wanted)) { msg.textContent = 'Der Code hat sechs Zeichen, zum Beispiel K7RTMX.'; $('joinCode').focus(); return; }
    store.set(localStorage, 'spielsucht.name', name);
    const all = [$('openTable'), $('joinTable'), $('lobbyClose')];
    all.forEach((b) => { b.disabled = true; });
    msg.textContent = 'Verbinde …';
    try {
      if (way === 'open') await host(name); else await join(wanted, name);
    } catch (e) {
      msg.textContent = e.message;
      all.forEach((b) => { b.disabled = false; });
    }
  }

  window.Friends = {
    invited: () => !!fromHash(),
    open() {
      if (V) return;
      $('nick').value = store.get(localStorage, 'spielsucht.name') || '';
      $('joinCode').value = fromHash();
      $('lobbyMsg').textContent = '';
      $('lobby').classList.toggle('invited', !!fromHash());
      $('lobby').showModal();
    },
    start() {
      G = window.Game;
      $('lobbyForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const b = e.submitter;
        const typed = $('joinCode').value.trim();
        // Enter im Formular: mit Code beitreten, sonst eröffnen.
        const viaKey = document.activeElement && document.activeElement.tagName === 'INPUT';
        go(viaKey ? (typed ? 'join' : 'open') : b ? b.value : typed ? 'join' : 'open');
      });
      $('lobbyClose').addEventListener('click', () => { history.replaceState(null, '', location.pathname + location.search); $('lobby').close(); });
      $('copy').addEventListener('click', async () => {
        const link = `${location.origin}${location.pathname}#tisch=${code}`;
        try { await navigator.clipboard.writeText(link); $('copy').textContent = 'Kopiert'; } catch { $('copy').textContent = 'Code weitersagen'; }
        setTimeout(() => { $('copy').textContent = 'Link kopieren'; }, 2000);
      });
      $('leave').addEventListener('click', leave);
      $('endLeave').addEventListener('click', leave);
      $('lobby').addEventListener('cancel', (e) => { if ($('openTable').disabled) e.preventDefault(); });
      addEventListener('hashchange', () => { if (fromHash() && fromHash() !== code) location.reload(); });
      if (fromHash()) window.Friends.open();
    },
  };
})();
