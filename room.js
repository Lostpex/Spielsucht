/* Regeln eines gemeinsamen Tisches. Läuft nur beim Gastgeber, ohne DOM und ohne Netz.
   Alle Entscheidungen fallen hier; Mitspieler schicken Wünsche, bekommen Ereignisse. */
(function (root) {
  'use strict';
  const L = root.Logic || require('./logic.js');

  const MAX_PLAYERS = 8;
  const T = { rush: 30000, spin: 10200, broke: 1500, cyl: 3600, pull: 4600, turn: 60000, offlineTurn: 10000, pass: 1100, reveal: 4200, offline: 60000 };
  const KEYS = new Set(['red', 'black', 'even', 'odd', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3']);
  for (let n = 0; n <= 36; n++) KEYS.add('n' + n);

  const cleanName = (s) => String(s == null ? '' : s).replace(/[\p{C}\p{Z}]+/gu, ' ').trim().slice(0, 14) || 'Gast';

  // Prüft fremde Einsätze; null, wenn etwas nicht stimmt.
  function cleanBets(raw, cash) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    for (const key of Object.keys(raw).slice(0, 60)) {
      const v = raw[key];
      if (!KEYS.has(key) || !Number.isSafeInteger(v) || v <= 0 || v % 10) return null;
      out[key] = v;
    }
    return L.stake(out) <= cash ? out : null;
  }

  class Room {
    // emit(event): geht an alle. now(): Uhr in ms.
    constructor({ emit, now = Date.now }) {
      this.emit = emit; this.now = now;
      this.players = []; this.nextId = 1;
      this.phase = 'bet'; this.round = 1; this.history = [];
      this.deadline = null; this.lock = 0; this.gun = null;
    }

    /* ---------- Leute ---------- */

    join(token, name) {
      const known = this.players.find((p) => p.token === token);
      if (known) { this.setOnline(known.id, true); return known; }
      if (this.players.length >= MAX_PLAYERS) return null;
      let nick = cleanName(name);
      for (let i = 2; this.players.some((p) => p.name === nick); i++) nick = `${cleanName(name).slice(0, 12)} ${i}`;
      const p = {
        id: this.nextId++, token, name: nick, online: true, offlineSince: 0,
        status: this.phase === 'bet' ? 'in' : 'wait',
        cash: L.START, bets: {}, ready: false, visits: 0, pulls: 0,
      };
      this.players.push(p);
      this.emit({ t: 'state' });
      return p;
    }
    get(id) { return this.players.find((p) => p.id === id); }
    in() { return this.players.filter((p) => p.status === 'in'); }
    setOnline(id, on) {
      const p = this.get(id);
      if (!p || p.online === on) return;
      p.online = on;
      p.offlineSince = on ? 0 : this.now();
      if (!on && this.phase === 'gun' && this.holder() && this.holder().id === id) this.deadline = Math.min(this.deadline, this.now() + T.offlineTurn);
      this.emit({ t: 'state' });
      if (!on) this.maybeSpin();
    }

    /* ---------- Wünsche der Spieler ---------- */

    handle(id, msg) {
      const p = this.get(id);
      if (!p || !msg || typeof msg !== 'object') return;
      if (this.phase === 'bet' && p.status === 'in') {
        if (msg.t === 'bets' && !p.ready && msg.round === this.round) {
          const bets = cleanBets(msg.bets, p.cash);
          if (bets) p.bets = bets;
          this.emit({ t: 'state' });
        } else if (msg.t === 'ready') this.ready(p, !!msg.on);
        else if (msg.t === 'home') this.goHome(p);
      } else if (this.phase === 'gun') {
        if (this.holder() === p && this.now() >= this.lock) this.gunAction(p, msg.t);
      } else if (this.phase === 'end' && msg.t === 'new' && p === this.players[0]) this.newGame();
    }

    ready(p, on) {
      if (on && !L.stake(p.bets)) return;
      p.ready = on;
      if (!this.in().some((x) => x.ready)) this.deadline = null;
      else if (!this.deadline) this.deadline = this.now() + T.rush;
      this.emit({ t: 'state' });
      this.maybeSpin();
    }
    goHome(p) {
      p.status = 'home'; p.bets = {}; p.ready = false;
      if (!this.in().some((x) => x.ready)) this.deadline = null;
      if (this.checkEnd()) return;
      this.emit({ t: 'state' });
      this.maybeSpin();
    }
    maybeSpin() {
      if (this.phase !== 'bet') return;
      const here = this.in().filter((p) => p.online);
      if (here.some((p) => p.ready) && here.every((p) => p.ready)) this.spin();
    }

    /* ---------- Roulette ---------- */

    spin() {
      const n = L.rnd(37);
      const results = [];
      for (const p of this.in()) {
        const staked = L.stake(p.bets);
        const won = L.payout(p.bets, n);
        results.push({ id: p.id, bets: p.bets, staked, won, before: p.cash - staked });
        p.cash += won - staked;
        p.bets = {}; p.ready = false;
      }
      this.history = [n, ...this.history].slice(0, 12);
      this.phase = 'spin';
      this.deadline = this.now() + T.spin;
      this.emit({ t: 'spin', n, results });
    }
    afterSpin() {
      const broke = this.in().filter((p) => p.cash === 0);
      for (const p of broke) if (!p.online) p.status = 'quit';
      const seats = broke.filter((p) => p.online);
      if (seats.length) this.startGun(seats); else this.toBet();
    }
    toBet() {
      this.gun = null;
      if (this.checkEnd()) return;
      for (const p of this.players) if (p.status === 'wait') p.status = 'in';
      this.phase = 'bet'; this.round++; this.deadline = null;
      this.emit({ t: 'state' });
    }

    /* ---------- Revolver ---------- */

    startGun(list) {
      const order = list.slice();
      for (let i = order.length - 1; i > 0; i--) { const j = L.rnd(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      for (const p of order) p.visits++;
      this.gun = {
        bullets: Math.min(L.CHAMBERS - 1, Math.max(...order.map((p) => p.visits))),
        seats: order.map((p) => ({ id: p.id, pulls: 0 })),
        turn: 0, fired: 0, chambers: null, pulled: false,
      };
      this.phase = 'gun';
      this.lock = this.now() + T.broke;
      this.setTurnClock();
      this.emit({ t: 'gun' });
    }
    seat() { return this.gun && this.gun.seats[this.gun.turn]; }
    holder() { const s = this.seat(); return s ? this.get(s.id) : null; }
    setTurnClock() {
      const h = this.holder();
      this.deadline = Math.max(this.now(), this.lock) + (h && h.online ? T.turn : T.offlineTurn);
    }

    // Was der Spieler mit dem Revolver gerade darf.
    options() {
      const g = this.gun; const s = this.seat();
      if (!s) return [];
      if (!g.chambers) return ['cyl', 'quit'];
      if (g.pulled) return ['pull', g.seats.length > 1 ? 'pass' : 'back'];
      return s.pulls > 0 && g.seats.length === 1 ? ['pull', 'back'] : ['pull', 'quit'];
    }
    gunAction(p, act) {
      if (!this.options().includes(act)) return;
      const g = this.gun; const s = this.seat();
      if (act === 'cyl') {
        g.chambers = L.load(g.bullets);
        this.lock = this.now() + T.cyl;
        this.setTurnClock();
        this.emit({ t: 'cyl' });
      } else if (act === 'pull') this.pull(p, s);
      else if (act === 'pass') {
        g.turn = (g.turn + 1) % g.seats.length;
        g.pulled = false;
        this.lock = this.now() + T.pass;
        this.setTurnClock();
        this.emit({ t: 'pass', from: p.id });
      } else if (act === 'back') this.endGun('back', p);
      else if (act === 'quit') {
        p.status = 'quit';
        g.seats.splice(g.turn, 1);
        if (!g.seats.length) { this.endGun('empty', p); return; }
        g.turn %= g.seats.length;
        g.pulled = false;
        this.lock = this.now() + T.pass;
        this.setTurnClock();
        this.emit({ t: 'pass', from: p.id });
      }
    }
    pull(p, s) {
      const g = this.gun;
      const dead = g.chambers[g.fired];
      g.fired++;
      this.lock = this.now() + T.pull;
      if (dead) {
        p.status = 'dead';
        g.seats.splice(g.turn, 1);
        g.over = 'bang';
      } else {
        s.pulls++; p.pulls++; g.pulled = true;
        if (g.fired >= L.CHAMBERS - g.bullets) g.over = 'spared';
      }
      if (g.over) this.deadline = this.lock; else this.setTurnClock();
      this.emit({ t: 'pull', by: p.id, dead, n: g.fired, beats: 2 + L.rnd(2) });
    }
    // Wer noch sitzt, wird bezahlt: nach eigenen Schüssen, mindestens wie für einen.
    endGun(why, who) {
      const g = this.gun;
      const paid = g.seats.map((s) => {
        const sum = L.pot(g.bullets, Math.max(1, s.pulls));
        this.get(s.id).cash = sum;
        return { id: s.id, sum };
      });
      this.phase = 'reveal';
      this.deadline = this.now() + (g.chambers ? T.reveal : T.broke);
      this.emit({ t: 'reveal', why, who: who && who.id, chambers: g.chambers, fired: g.fired, paid });
    }

    /* ---------- Ende und Uhr ---------- */

    checkEnd() {
      const left = this.in().length;
      const played = this.players.filter((p) => p.status !== 'wait').length;
      if (left > 1 || (left === 1 && played < 2)) return false;
      this.phase = 'end'; this.deadline = null; this.gun = null;
      this.emit({ t: 'state' });
      return true;
    }
    newGame() {
      this.players = this.players.filter((p, i) => i === 0 || p.online);
      for (const p of this.players) Object.assign(p, { status: 'in', cash: L.START, bets: {}, ready: false, visits: 0, pulls: 0 });
      this.phase = 'bet'; this.round++; this.deadline = null; this.gun = null;
      this.emit({ t: 'state' });
    }
    tick() {
      const now = this.now();
      if (this.phase === 'bet') {
        for (const p of this.in()) if (!p.online && now - p.offlineSince > T.offline) { this.goHome(p); if (this.phase !== 'bet') return; }
      }
      if (!this.deadline || now < this.deadline) return;
      if (this.phase === 'bet') {
        if (this.in().some((p) => L.stake(p.bets))) this.spin(); else this.deadline = null;
      } else if (this.phase === 'spin') this.afterSpin();
      else if (this.phase === 'reveal') this.toBet();
      else if (this.phase === 'gun') {
        if (this.gun.over) this.endGun(this.gun.over, null);
        else {
          const can = this.options();
          this.gunAction(this.holder(), ['pass', 'back', 'quit'].find((a) => can.includes(a)));
        }
      }
    }

    // Was alle sehen dürfen. Die Lage der Kugeln gehört nicht dazu.
    view() {
      const g = this.gun;
      return {
        phase: this.phase, round: this.round, history: this.history,
        left: this.deadline ? Math.max(0, this.deadline - this.now()) : null,
        host: this.players.length ? this.players[0].id : null,
        players: this.players.map(({ id, name, status, online, cash, bets, ready, pulls }) => ({ id, name, status, online, cash, bets, ready, pulls })),
        gun: g && { bullets: g.bullets, fired: g.fired, loaded: !!g.chambers, over: g.over || null,
          seats: g.seats.map((s) => ({ ...s })), holder: g.over || !this.seat() ? null : this.seat().id, options: g.over ? [] : this.options() },
      };
    }
  }

  root.Room = Room;
  root.RoomTimes = T;
  if (typeof module !== 'undefined') module.exports = { Room, cleanBets, cleanName, T };
})(globalThis);
