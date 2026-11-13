/* Odyssey shared effects: generated ambient music, sound effects, particles.
   No audio files. Everything is synthesised in the browser with the Web Audio API,
   so it works offline and adds almost nothing to the download.
   Sound is off until the student turns it on. */
(function () {
  "use strict";
  const FX = (window.OdysseyFX = {});
  FX.RM = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches } catch (e) { return false } })();

  /* ------------------------------------------------------------------ music */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // Each theme: chord length (s), pad chords (MIDI), bass roots, melody scale, melody notes per chord,
  // pad brightness (Hz), melody voice.
  const THEMES = {
    hub: { len: 8, bright: 1500, voice: "bell", density: 4, melOct: 0,
      chords: [[50, 57, 61, 64, 66], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [45, 52, 57, 61, 64]],
      scale: [74, 76, 78, 81, 83, 86, 88] },
    bridge: { len: 7, bright: 1700, voice: "marimba", density: 5, melOct: 0,
      chords: [[43, 50, 55, 59, 62], [40, 47, 55, 59, 62], [48, 52, 55, 59, 64], [50, 54, 57, 62, 66]],
      scale: [67, 69, 71, 74, 76, 79, 81] },
    cave: { len: 10, bright: 800, voice: "glass", density: 2, melOct: 0,
      chords: [[45, 52, 55, 59, 60], [41, 48, 52, 57, 60], [38, 45, 53, 57, 60], [40, 47, 55, 59, 62]],
      scale: [69, 72, 74, 76, 79, 81] },
    valley: { len: 8, bright: 1900, voice: "glass", density: 3, melOct: 12,
      chords: [[40, 47, 54, 55, 59], [48, 55, 59, 60, 64], [43, 50, 55, 59, 62], [50, 57, 62, 64, 66]],
      scale: [64, 67, 69, 71, 74, 76] },
  };

  let AC = null, master = null, musicBus = null, sfxBus = null, verb = null;
  let theme = "hub", playing = false, timer = null, chordAt = 0, chordIdx = 0, lastMel = 3;

  function impulse(ctx, seconds) {
    const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return buf;
  }
  function graph(ctx) {
    const g = {};
    g.master = ctx.createGain(); g.master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
    g.master.connect(comp); comp.connect(ctx.destination);
    g.music = ctx.createGain(); g.music.gain.value = 0.5; g.music.connect(g.master);
    g.sfx = ctx.createGain(); g.sfx.gain.value = 0.6; g.sfx.connect(g.master);
    g.verb = ctx.createConvolver(); g.verb.buffer = impulse(ctx, 2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    g.verb.connect(wet); wet.connect(g.master);
    return g;
  }

  function pad(ctx, g, notes, t, len, bright) {
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.4;
    f.frequency.setValueAtTime(bright * 0.6, t);
    f.frequency.linearRampToValueAtTime(bright, t + len * 0.5);
    f.frequency.linearRampToValueAtTime(bright * 0.6, t + len + 2);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.16, t + 2.2);
    env.gain.setValueAtTime(0.16, t + len - 0.5);
    env.gain.linearRampToValueAtTime(0.0001, t + len + 2.5);
    f.connect(env); env.connect(g.music); env.connect(g.verb);
    notes.forEach((m, i) => {
      [-5, 6].forEach(det => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = mtof(m); o.detune.value = det + (i * 2);
        const og = ctx.createGain(); og.gain.value = i === 0 ? 0.5 : 0.22;
        o.connect(og); og.connect(f);
        o.start(t); o.stop(t + len + 2.6);
      });
    });
  }
  function pluck(ctx, g, m, t, voice, vol) {
    const f0 = mtof(m), env = ctx.createGain();
    const dec = voice === "marimba" ? 0.9 : voice === "bell" ? 2.2 : 3.0;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    env.connect(g.music); env.connect(g.verb);
    const parts = voice === "marimba" ? [[1, 1, "sine"], [4, 0.18, "sine"]]
      : voice === "bell" ? [[1, 1, "sine"], [2.0, 0.3, "sine"], [3.01, 0.12, "sine"]]
        : [[1, 1, "sine"], [2.76, 0.16, "sine"], [5.4, 0.05, "sine"]];
    parts.forEach(([mul, amp, type]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f0 * mul;
      const og = ctx.createGain(); og.gain.value = amp;
      o.connect(og); og.connect(env); o.start(t); o.stop(t + dec + 0.1);
    });
  }
  /* Schedule music up to time `until` on any context (live or offline). */
  function schedule(ctx, g, th, state, until, rand) {
    while (state.at < until) {
      const c = th.chords[state.idx % th.chords.length], t = state.at;
      pad(ctx, g, c, t, th.len, th.bright);
      // melody: a gentle random walk on the scale, on a loose 8-step grid
      const slots = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => rand() - 0.5).slice(0, th.density).sort((a, b) => a - b);
      slots.forEach(s => {
        state.mel = Math.max(0, Math.min(th.scale.length - 1, state.mel + Math.round((rand() - 0.5) * 3)));
        const when = t + (s / 8) * th.len + (rand() - 0.5) * 0.06;
        pluck(ctx, g, th.scale[state.mel] + th.melOct, Math.max(when, t), th.voice, 0.10 + rand() * 0.05);
      });
      state.at += th.len; state.idx++;
    }
  }
  FX._render = async function (name, seconds) {        // test hook: offline render, returns {peak, rms}
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, 44100 * seconds, 44100), g = graph(ctx);
    g.master.gain.value = 1;
    schedule(ctx, g, THEMES[name], { at: 0.05, idx: 0, mel: 3 }, seconds, Math.random);
    ["plank", "chime", "soft", "dissolve", "orb", "tap", "connect", "lighthouse"].forEach((s, i) => play(ctx, g, s, 1 + i * 1.5));
    const buf = await ctx.startRendering(), d = buf.getChannelData(0);
    let peak = 0, sum = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  };

  /* -------------------------------------------------------------------- sfx */
  function tone(ctx, out, type, f0, f1, t, dur, vol) {
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); out.forEach(n => e.connect(n)); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(ctx, out, t, dur, f0, f1, vol) {
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(e); out.forEach(x => e.connect(x)); s.start(t);
  }
  function play(ctx, g, name, t) {
    const dry = [g.sfx], both = [g.sfx, g.verb];
    switch (name) {
      case "plank": tone(ctx, both, "sine", 300, 180, t, 0.16, 0.35); noise(ctx, dry, t, 0.06, 2500, 900, 0.12); break;
      case "tap": tone(ctx, both, "triangle", 880, 660, t, 0.08, 0.18); break;
      case "soft": tone(ctx, both, "sine", 196, 165, t, 0.35, 0.22); break;
      case "chime": [76, 81, 88].forEach((m, i) => pluck(ctx, { music: g.sfx, verb: g.verb }, m, t + i * 0.11, "bell", 0.16)); break;
      case "orb": [83, 88, 90, 95].forEach((m, i) => pluck(ctx, { music: g.sfx, verb: g.verb }, m, t + i * 0.07, "glass", 0.10)); break;
      case "dissolve": noise(ctx, both, t, 1.3, 3200, 300, 0.16);
        [69, 76, 81].forEach((m, i) => pluck(ctx, { music: g.sfx, verb: g.verb }, m, t + 0.25 + i * 0.16, "glass", 0.10)); break;
      case "connect": [64, 71, 76, 80, 83].forEach((m, i) => pluck(ctx, { music: g.sfx, verb: g.verb }, m, t + i * 0.06, "bell", 0.11)); break;
      case "lighthouse":
        [50, 57, 62, 66, 69, 74, 78, 81, 86].forEach((m, i) => pluck(ctx, { music: g.sfx, verb: g.verb }, m, t + i * 0.22, "bell", 0.12));
        noise(ctx, [g.verb], t + 1.6, 2.4, 600, 5000, 0.05); break;
    }
  }
  FX.sfx = function (name) { if (!playing || !AC) return; try { play(AC, { sfx: sfxBus, verb: verb }, name, AC.currentTime + 0.01) } catch (e) { } };

  /* ------------------------------------------------------------ live control */
  const state = { at: 0, idx: 0, mel: 3 };
  function pref() { try { return localStorage.getItem("odyssey-sound") === "on" } catch (e) { return false } }
  function start() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    if (!AC) { AC = new Ctor(); const g = graph(AC); master = g.master; musicBus = g.music; sfxBus = g.sfx; verb = g.verb; }
    AC.resume && AC.resume();
    playing = true;
    master.gain.cancelScheduledValues(AC.currentTime);
    master.gain.setTargetAtTime(1, AC.currentTime, 0.6);
    state.at = AC.currentTime + 0.1;
    const g = { music: musicBus, sfx: sfxBus, verb: verb };
    clearInterval(timer);
    const tick = () => { if (playing && AC.state === "running") schedule(AC, g, THEMES[theme] || THEMES.hub, state, AC.currentTime + 1.5, Math.random) };
    tick(); timer = setInterval(tick, 500);
    return true;
  }
  function stop() {
    playing = false; clearInterval(timer);
    if (AC) { master.gain.cancelScheduledValues(AC.currentTime); master.gain.setTargetAtTime(0.0001, AC.currentTime, 0.25);
      const c = AC; setTimeout(() => { if (!playing) c.suspend && c.suspend() }, 1200); }
  }
  FX.isOn = () => playing;
  FX.setSound = function (on) {
    try { localStorage.setItem("odyssey-sound", on ? "on" : "off") } catch (e) { }
    if (on) { if (!start()) on = false } else stop();
    refresh(); return on;
  };
  FX.init = function (opts) {
    theme = (opts && opts.theme) || "hub";
    if (pref()) {                                   // browsers only allow sound after a tap or key press
      const go = () => { removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true); if (pref() && !playing) { start(); refresh() } };
      addEventListener("pointerdown", go, true); addEventListener("keydown", go, true);
    }
    document.addEventListener("visibilitychange", () => {
      if (!AC) return;
      if (document.hidden) AC.suspend && AC.suspend(); else if (playing) { AC.resume && AC.resume(); state.at = Math.max(state.at, AC.currentTime + 0.1) }
    });
    document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-snd]"); if (b) { e.preventDefault(); FX.setSound(!(playing || (pref() && !AC))) } });
    try { new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true }) } catch (e) { }
    refresh();
  };

  /* Sound buttons: any element with data-snd. "icon" shows a speaker, "text" shows a label. */
  const ICON_ON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>';
  function uiLang() { try { return localStorage.getItem("odyssey-lang") || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en") } catch (e) { return "en" } }
  function refresh() {
    const on = playing || (pref() && !AC), lg = uiLang();
    document.querySelectorAll("[data-snd]").forEach(el => {
      const want = String(on);
      if (el.getAttribute("aria-pressed") !== want) el.setAttribute("aria-pressed", want);
      const label = lg === "zh" ? (on ? "音乐：开" : "音乐：关") : lg === "both" ? (on ? "Music on · 音乐开" : "Music off · 音乐关") : (on ? "Music: on" : "Music: off");
      if (el.dataset.snd === "text") { if (el.textContent !== label) el.textContent = label }
      else { const key = on ? "1" : "0"; if (el.dataset.sndState !== key) { el.dataset.sndState = key; el.innerHTML = on ? ICON_ON : ICON_OFF } if (el.getAttribute("aria-label") !== label) { el.setAttribute("aria-label", label); el.title = label } }
    });
  }
  FX.refresh = refresh;


  /* ------------------------------------------------- the traveller, in 2D */
  FX.progress = () => { try { return JSON.parse(localStorage.getItem("odyssey-progress") || "{}") } catch (e) { return {} } };
  FX.heal = () => { const p = FX.progress(); return [1, 2, 3].filter(n => p["c" + n]).length / 3 };
  FX.done = n => !!FX.progress()["c" + n];
  const mixC = (a, b, k) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
  /* Draw the traveller with feet at (x,y), s px tall. o: {heal 0..1, t seconds, walk bool, face 1|-1, glow bool} */
  FX.drawTraveller = function (ctx, x, y, s, o) {
    o = o || {}; const h = Math.max(0, Math.min(1, o.heal || 0)), t = FX.RM ? 0 : (o.t || 0), f = o.face < 0 ? -1 : 1;
    const bob = o.walk ? Math.abs(Math.sin(t * 9)) * s * 0.05 : Math.sin(t * 2) * s * 0.012;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(10,14,30,.22)"; ctx.beginPath(); ctx.ellipse(0, 0, s * .2, s * .045, 0, 0, 6.283); ctx.fill();
    ctx.translate(0, -bob); ctx.rotate(f * (1 - h) * 0.16);
    const cloak = mixC([128, 136, 158], [38, 150, 138], h), scarf = mixC([150, 156, 172], [240, 156, 88], h);
    // cloak
    ctx.fillStyle = cloak; ctx.beginPath(); ctx.moveTo(-s * .2, 0); ctx.quadraticCurveTo(0, s * .04, s * .2, 0);
    ctx.lineTo(s * .07, -s * .56); ctx.lineTo(-s * .07, -s * .56); ctx.closePath(); ctx.fill();
    // lantern arm and lantern
    const lx = f * s * .25, ly = -s * .3;
    ctx.strokeStyle = cloak; ctx.lineWidth = Math.max(1, s * .05); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(f * s * .08, -s * .42); ctx.lineTo(lx, ly - s * .07); ctx.stroke();
    if (o.glow !== false) { const gr = s * (.22 + .4 * h), g = ctx.createRadialGradient(lx, ly, 0, lx, ly, gr);
      g.addColorStop(0, `rgba(255,214,125,${.35 + .45 * h})`); g.addColorStop(1, "rgba(255,214,125,0)"); ctx.fillStyle = g; ctx.fillRect(lx - gr, ly - gr, gr * 2, gr * 2) }
    ctx.fillStyle = "#3a3f52"; ctx.fillRect(lx - s * .05, ly - s * .07, s * .1, s * .02);
    ctx.fillStyle = mixC([150, 150, 160], [255, 220, 130], h); ctx.fillRect(lx - s * .04, ly - s * .05, s * .08, s * .09);
    // scarf
    ctx.fillStyle = scarf; ctx.beginPath(); ctx.ellipse(0, -s * .56, s * .11, s * .04, 0, 0, 6.283); ctx.fill();
    // head and hood
    const hx = f * s * .015 * (1 - h), hy = -s * .7 + (1 - h) * s * .03;
    ctx.fillStyle = cloak; ctx.beginPath(); ctx.moveTo(hx - s * .15, hy + s * .02); ctx.lineTo(hx, hy - s * .26); ctx.lineTo(hx + s * .15, hy + s * .02); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f4e2d2"; ctx.beginPath(); ctx.arc(hx, hy, s * .12, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#1d2333"; const ey = hy + (1 - h) * s * .02;
    ctx.beginPath(); ctx.arc(hx + f * s * .02 - s * .045, ey, s * .016, 0, 6.283); ctx.arc(hx + f * s * .02 + s * .045, ey, s * .016, 0, 6.283); ctx.fill();
    if (h > .5) { ctx.strokeStyle = "#1d2333"; ctx.lineWidth = Math.max(1, s * .012); ctx.beginPath(); ctx.arc(hx + f * s * .02, ey + s * .035, s * .03, .3, Math.PI - .3); ctx.stroke() }
    // the grey cloud, which fades as the traveller heals
    const ca = Math.max(0, 1 - h * 1.15);
    if (ca > .02) {
      const cy = -s * 1.12 + Math.sin(t * 1.5) * s * .02, cs = s * (.6 + .4 * ca);
      ctx.fillStyle = `rgba(132,140,162,${ca})`; ctx.beginPath();
      ctx.arc(-cs * .14, cy, cs * .11, 0, 6.283); ctx.arc(cs * .02, cy - cs * .05, cs * .14, 0, 6.283); ctx.arc(cs * .17, cy, cs * .1, 0, 6.283);
      ctx.rect(-cs * .14, cy, cs * .31, cs * .1); ctx.fill();
      if (h < .34) { ctx.strokeStyle = `rgba(150,175,215,${ca})`; ctx.lineWidth = Math.max(1, s * .015);
        for (let i = 0; i < 4; i++) { const rx = -cs * .12 + i * cs * .09, ph = ((t * 1.6 + i * .27) % 1), ry = cy + cs * .14 + ph * s * .3;
          ctx.globalAlpha = ca * (1 - ph); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - s * .01, ry + s * .06); ctx.stroke() } ctx.globalAlpha = 1 }
    }
    ctx.restore();
  };

  /* -------------------------------------------------------------- particles */
  FX.Particles = function () {
    const ps = [];
    return {
      count: () => ps.length,
      spawn(x, y, n, o) {
        if (FX.RM) return; o = o || {};
        for (let i = 0; i < n; i++) {
          const a = (o.angle != null ? o.angle : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (o.spread != null ? o.spread : Math.PI * 2);
          const sp = (o.speed || 40) * (0.4 + Math.random() * 0.8);
          ps.push({ x: x + (Math.random() - 0.5) * (o.jitter || 0), y: y + (Math.random() - 0.5) * (o.jitter || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0, max: (o.life || 1) * (0.6 + Math.random() * 0.7), size: (o.size || 3) * (0.5 + Math.random()), color: o.color || "255,230,170", g: o.gravity || 0, drag: o.drag == null ? 0.98 : o.drag });
        }
      },
      draw(ctx, dt, ox, oy) {
        ox = ox || 0; oy = oy || 0;
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i]; p.life += dt;
          if (p.life >= p.max) { ps.splice(i, 1); continue }
          p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          const k = 1 - p.life / p.max;
          ctx.fillStyle = "rgba(" + p.color + "," + (k * 0.9).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, p.size * (0.4 + k * 0.6), 0, 6.283); ctx.fill();
        }
      }
    };
  };

  /* Shared CSS: sound button, sheet and page transitions, the orb moment. */
  const css = document.createElement("style");
  css.textContent = `
.snd{background:none;border:1px solid var(--line,currentColor);border-radius:999px;width:34px;height:34px;display:grid;place-items:center;color:var(--dim,inherit);padding:0;flex-shrink:0}
.snd[aria-pressed="true"]{color:var(--ink,var(--mist,inherit));border-color:currentColor}
.sndchip{background:none;border:1px solid var(--line,currentColor);border-radius:999px;padding:8px 14px;font-size:14px;color:inherit;align-self:flex-start;min-height:36px}
.sndchip[aria-pressed="true"]{border-color:currentColor;font-weight:700}
.chiprow{display:flex;gap:8px;flex-wrap:wrap}
.orbwin{width:84px;height:84px;border-radius:50%;margin:4px auto 0;position:relative;background:radial-gradient(circle at 35% 32%,#fffbe8,#f3c04e 60%,#d9962a);box-shadow:0 0 0 10px rgba(243,192,78,.18),0 0 40px rgba(243,192,78,.7)}
.orbwin::after{content:"";position:absolute;inset:-22px;border-radius:50%;border:2px solid rgba(243,192,78,.55)}
@media (prefers-reduced-motion:no-preference){
  @view-transition{navigation:auto}
  .veil:not([hidden]){animation:ofx-fade .25s ease-out}
  .veil:not([hidden]) .sheet{animation:ofx-rise .35s cubic-bezier(.2,.8,.2,1)}
  .orbwin{animation:ofx-pop .7s cubic-bezier(.2,1.4,.4,1) both,ofx-float 4s ease-in-out .7s infinite}
  .orbwin::after{animation:ofx-ring 2.4s ease-out infinite}
}
@keyframes ofx-fade{from{opacity:0}to{opacity:1}}
@keyframes ofx-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes ofx-pop{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ofx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes ofx-ring{from{transform:scale(.7);opacity:.9}to{transform:scale(1.25);opacity:0}}
`;
  document.head.appendChild(css);
})();
