/* =========================================================
   Intelligence Designed To Evolve — interactions
   1. Mobile menu
   2. Hero stat count-up
   3. Letter-reveal helpers (painted by timed animations)
   4. Bowl glow canvas (96×60, stretched by CSS) — scroll-linked
   5. Scene engine: scroll decides WHICH scene is current; each change
      plays one complete, timed hand-off (old text out, new text in)
   ========================================================= */

(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 720;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  /* =======================================================
     1. Mobile menu
     ======================================================= */
  const burger = document.querySelector(".burger");
  const menu = document.getElementById("mobileMenu");
  const overlay = document.getElementById("menuOverlay");

  function setMenu(open) {
    if (!burger || !menu || !overlay) return;
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.hidden = !open;
    overlay.hidden = !open;
    document.body.classList.toggle("menu-open", open);
  }

  const isMenuOpen = () => burger && burger.getAttribute("aria-expanded") === "true";

  if (burger && menu && overlay) {
    burger.addEventListener("click", () => setMenu(!isMenuOpen()));
    overlay.addEventListener("click", () => setMenu(false));
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isMenuOpen()) { setMenu(false); burger.focus(); }
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > MOBILE_BREAKPOINT && isMenuOpen()) setMenu(false);
    });
  }

  /* =======================================================
     2. Hero stat count-up (once, IntersectionObserver)
     ======================================================= */
  const fmt = (v, d) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  function countUp(el, i) {
    const target = parseFloat(el.dataset.target);
    const dec = parseInt(el.dataset.decimals || "0", 10);
    const suffix = el.dataset.suffix || "";
    if (!Number.isFinite(target)) return;
    if (reduceMotion) { el.textContent = fmt(target, dec) + suffix; return; }
    const duration = 1500 + i * 80;
    setTimeout(() => {
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = fmt(target * easeOutCubic(p), dec) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 480 + i * 90);
  }

  const heroValues = Array.from(document.querySelectorAll(".stat-value"));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        countUp(en.target, heroValues.indexOf(en.target));
        obs.unobserve(en.target);
      });
    }, { threshold: 0.25 });
    heroValues.forEach((el) => io.observe(el));

    // pause the hero video while it is off screen
    const video = document.getElementById("heroVideo");
    if (video) {
      new IntersectionObserver(([en]) => {
        if (en.isIntersecting) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
        else video.pause();
      }, { threshold: 0 }).observe(video);
    }
  } else {
    heroValues.forEach(countUp);
  }

  /* =======================================================
     3. Letter reveal
     ======================================================= */
  // Split an element into per-character spans; words stay unbreakable.
  function split(root) {
    const chars = [];
    const walk = (node, flagged) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement("span");
            w.className = "w";
            for (const ch of part) {
              const c = document.createElement("span");
              c.className = "c";
              c.textContent = ch;
              w.appendChild(c);
              chars.push({ el: c, flagged });
            }
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
          walk(child, flagged || child.classList.contains("hl"));
        }
      });
    };
    walk(root, false);
    return chars;
  }

  const HL = hex("#5b7cf0");

  // t: 0 → .35 fade + unblur (ghost), .35 → .7 ghost → accent, .7 → 1 accent → final
  function paint(block, p) {
    if (block.last === p) return;
    block.last = p;
    const { chars, spread, final, accent, ghost } = block;
    const n = chars.length;
    for (let i = 0; i < n; i++) {
      const t = clamp((p * (1 + spread) - i / n) / spread);
      const ch = chars[i];
      const fin = ch.flagged ? HL : final;
      let o, col, blur;
      if (t <= 0.35) {
        o = t / 0.35; col = ghost; blur = lerp(8, 1.5, t / 0.35);
      } else if (t <= 0.7) {
        const k = (t - 0.35) / 0.35; o = 1; col = mix(ghost, accent, k); blur = lerp(1.5, 0, k);
      } else {
        const k = (t - 0.7) / 0.3; o = 1; col = mix(accent, fin, k); blur = 0;
      }
      const s = ch.el.style;
      s.opacity = o.toFixed(3);
      s.color = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      s.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
    }
  }

  // Play a letter reveal from the block's current progress to `to`, over `dur` ms.
  function play(block, to, dur, delay = 0) {
    cancelAnimationFrame(block.raf);
    clearTimeout(block.timer);
    if (reduceMotion) { paint(block, to); return; }
    const from = block.last || 0;
    block.timer = setTimeout(() => {
      const start = performance.now();
      const step = (now) => {
        const t = clamp((now - start) / dur);
        paint(block, lerp(from, to, easeInOut(t)));
        if (t < 1) block.raf = requestAnimationFrame(step);
      };
      block.raf = requestAnimationFrame(step);
    }, delay);
  }

  const NAVY = hex("#0b1d3a");
  const BLUE = hex("#3f7cff");
  const WHITE = hex("#ffffff");

  const stmtEl = document.getElementById("stmt");
  const h2El = document.getElementById("h2");
  const stmt = { chars: split(stmtEl), spread: 0.16, final: NAVY, accent: BLUE, ghost: WHITE };
  const h2 = { chars: split(h2El), spread: 0.35, final: WHITE, accent: hex("#8fe6f4"), ghost: hex("#5c6f92") };

  const facts = Array.from(document.querySelectorAll(".fact")).map((el) => {
    const items = Array.from(el.querySelectorAll("[data-k]"));
    items.forEach((it, k) => it.style.setProperty("--k", k));
    return {
      el,
      head: { chars: split(el.querySelector(".f-h")), spread: 0.35, final: NAVY, accent: BLUE, ghost: WHITE },
      counts: Array.from(el.querySelectorAll("[data-count]")).map((b) => ({ el: b, target: +b.dataset.count })),
    };
  });

  [stmt, h2].forEach((b) => paint(b, 0));
  facts.forEach((f) => paint(f.head, 0));

  /* =======================================================
     4. Bowl glow (stays scroll-linked: it is the atmosphere)
     ======================================================= */
  const canvas = document.getElementById("bg");
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  const img = ctx.createImageData(CW, CH);
  // bowl colours are set per scene by the topic engine (section 6)
  let CORE = hex("#8fd5f1"), RIM = hex("#d2daff");
  const RND = 0.25, NPTS = 48;

  const KEYS = [
    // q, tip, half, soft
    [0, 0.3, 0.34, 0.22], [0.03, 0.45, 0.38, 0.26], [0.08, 0.65, 0.38, 0.22],
    [0.18, 0.8, 0.38, 0.22], [0.4, 0.95, 0.38, 0.19], [0.66, 1.05, 0.46, 0.16],
    [0.87, 1.05, 0.66, 0.13], [1.15, 1.1, 0.9, 0.1], [1.43, 1.3, 1.6, 0.1], [1.8, 2.4, 3.0, 0.1],
  ];

  function keysAt(q) {
    if (q <= KEYS[0][0]) return KEYS[0].slice(1);
    for (let i = 1; i < KEYS.length; i++) {
      if (q <= KEYS[i][0]) {
        const a = KEYS[i - 1], b = KEYS[i], t = (q - a[0]) / (b[0] - a[0]);
        return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
      }
    }
    return KEYS[KEYS.length - 1].slice(1);
  }

  const tgt = { tip: 0.3, half: 0.34, soft: 0.22 };
  const cur = { tip: -0.3, half: 0.3, soft: 0.1 };
  let introDone = reduceMotion;
  const INTRO_DELAY = 250, INTRO_DUR = 1050;
  let t0 = 0;
  const px = new Float32Array(NPTS), py = new Float32Array(NPTS);

  function drawBowl(now) {
    const aspect = window.innerWidth / window.innerHeight;
    let tip = cur.tip, half = cur.half;
    const soft = cur.soft;
    if (!reduceMotion) {
      tip += Math.sin(now * 0.00033 + 1.3) * 0.02;
      half += Math.sin(now * 0.0005) * 0.015;
    }
    const d = img.data;

    if (tip <= 0.01) {
      d.fill(255);
      ctx.putImageData(img, 0, 0);
      return;
    }

    const w = half * aspect;
    for (let k = 0; k < NPTS; k++) {
      const yy = lerp(-0.3, tip, k / (NPTS - 1));
      py[k] = yy;
      px[k] = w * Math.pow(Math.max(0, 1 - yy / tip), 0.72);
    }

    let o = 0;
    for (let j = 0; j < CH; j++) {
      const y = (j + 0.5) / CH;
      const inRow = y < tip ? w * Math.pow(1 - y / tip, 0.72) : -1;
      for (let i = 0; i < CW; i++) {
        const x = Math.abs((i + 0.5) / CW - 0.5) * aspect;
        let best = 1e9;
        for (let k = 0; k < NPTS - 1; k++) {
          const ax = px[k], ay = py[k], bx = px[k + 1], by = py[k + 1];
          const dx = bx - ax, dy = by - ay;
          const tt = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-9));
          const ex = ax + dx * tt - x, ey = ay + dy * tt - y;
          const dd = ex * ex + ey * ey;
          if (dd < best) best = dd;
        }
        let sd = Math.sqrt(best);
        if (x < inRow) sd = -sd;
        sd -= RND;
        const g = 1 - smooth((sd + soft) / (2 * soft));
        const c = g < 0.38 ? mix(WHITE, RIM, smooth(g / 0.38)) : mix(RIM, CORE, smooth((g - 0.38) / 0.62));
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        o += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function frame(now) {
    if (!t0) t0 = now;
    if (!introDone) {
      const k = smooth((now - t0 - INTRO_DELAY) / INTRO_DUR);
      cur.tip = lerp(-0.3, tgt.tip, k);
      cur.half = lerp(0.3, tgt.half, k);
      cur.soft = lerp(0.1, tgt.soft, k);
      if (k >= 1) introDone = true;
    } else {
      cur.tip += (tgt.tip - cur.tip) * 0.12;
      cur.half += (tgt.half - cur.half) * 0.12;
      cur.soft += (tgt.soft - cur.soft) * 0.12;
    }
    drawBowl(now);
    requestAnimationFrame(frame);
  }

  /* =======================================================
     5. Scene engine
     ======================================================= */
  const nav = document.getElementById("nav");
  const navBtn = nav.querySelector(".navcta .btn");
  const heroEl = document.getElementById("top");
  const stmtSec = document.getElementById("statement");
  const splitSec = document.getElementById("contact");
  const row = document.getElementById("row");
  const logo = document.getElementById("ship");
  const BOWL_SHIFT = 0.1; // the bowl's timeline starts as the video hero leaves

  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  /* ---- statement: one timed reveal when the pin engages ---- */
  let stmtShown = false;
  function setStatement(show) {
    if (show === stmtShown) return;
    stmtShown = show;
    stmtEl.classList.toggle("up", show);
    if (show) play(stmt, 1, 1500, 150);
    else play(stmt, 0, 450);
  }

  /* ---- pinned steppers (the problem, the release facts):
          one complete hand-off per change of the current step ---- */
  function countFact(f) {
    f.counts.forEach((c) => {
      if (reduceMotion) { c.el.textContent = c.target.toLocaleString("en-US"); return; }
      c.el.textContent = "0";
      setTimeout(() => {
        const start = performance.now();
        const tick = (now) => {
          const t = clamp((now - start) / 1100);
          c.el.textContent = Math.round(c.target * easeOutCubic(t)).toLocaleString("en-US");
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 750);
    });
  }

  const steppers = Array.from(document.querySelectorAll(".stepper")).map((sec) => ({
    sec,
    steps: facts.filter((f) => f.el.closest(".stepper") === sec),
    rail: Array.from(sec.querySelectorAll(".rail button")),
    counter: sec.querySelector(".counter"),
    current: -1,
  }));

  function setStep(st, next) {
    if (next === st.current) return;
    const back = next < st.current;
    if (st.current >= 0) {
      const prev = st.steps[st.current];
      prev.el.classList.remove("is-in");
      prev.el.classList.add("is-out");
      prev.el.classList.toggle("back", back);
      play(prev.head, 0, 380);
    }
    if (next >= 0) {
      const f = st.steps[next];
      f.el.classList.remove("is-out", "back");
      f.el.classList.add("is-in");
      play(f.head, 1, 1000, 300);
      countFact(f);
    }
    st.current = next;
    const shown = Math.max(0, next);
    const N = st.steps.length;
    st.rail.forEach((b, i) => b.classList.toggle("is-active", i === shown));
    if (st.counter) st.counter.textContent = `${String(shown + 1).padStart(2, "0")} / ${String(N).padStart(2, "0")}`;
  }

  function updateStepper(st, H) {
    const r = st.sec.getBoundingClientRect();
    if (r.top > 0.45 * H) { setStep(st, -1); return; }
    const N = st.steps.length;
    const prog = clamp(-r.top / (st.sec.offsetHeight - H));
    setStep(st, Math.min(N - 1, Math.floor(prog * N)));
  }

  /* ---- content sections: the whole section cascades in once it is reached ---- */
  const sections = Array.from(document.querySelectorAll(".section")).map((sec) => {
    sec.querySelectorAll(".rv").forEach((el, k) => el.style.setProperty("--k", k % 8));
    const h = sec.querySelector("[data-reveal]");
    return { sec, head: h ? { chars: split(h), spread: 0.35, final: NAVY, accent: BLUE, ghost: WHITE } : null, shown: false };
  });
  sections.forEach((s) => s.head && paint(s.head, 0));

  function updateSections(H) {
    sections.forEach((s) => {
      const r = s.sec.getBoundingClientRect();
      const show = r.top < 0.72 * H && r.bottom > 0.2 * H;
      if (show === s.shown) return;
      s.shown = show;
      s.sec.classList.toggle("in", show);
      if (s.head) play(s.head, show ? 1 : 0, show ? 1100 : 350, show ? 200 : 0);
    });
  }

  /* ---- dark split headline ---- */
  let splitShown = false;
  function setSplit(show) {
    if (show === splitShown) return;
    splitShown = show;
    play(h2, show ? 1 : 0, show ? 1300 : 400);
    clearTimeout(row.timer);
    if (show) row.timer = setTimeout(() => row.classList.add("in"), reduceMotion ? 0 : 900);
    else row.classList.remove("in");
  }

  function onScroll() {
    const H = window.innerHeight;
    const y = window.scrollY;

    // bowl (continuous)
    const k = keysAt(Math.max(0, y / H - BOWL_SHIFT));
    tgt.tip = k[0]; tgt.half = k[1]; tgt.soft = k[2];
    if (!introDone && y > 0.05 * H) introDone = true;

    // statement: shown while its pin is the active scene
    const sRect = stmtSec.getBoundingClientRect();
    setStatement(sRect.top < -0.02 * H && sRect.bottom > 0.75 * H);

    // nav "Get a demo" pill: pops in once the video hero has left and stays
    const navOn = heroEl.getBoundingClientRect().bottom < 0.4 * H;
    if (nav.classList.contains("on") !== navOn) {
      nav.classList.toggle("on", navOn);
      navBtn.tabIndex = navOn ? 0 : -1;
    }

    // pinned steppers + content sections
    steppers.forEach((st) => updateStepper(st, H));
    updateSections(H);

    // dark split
    const splitTop = splitSec.getBoundingClientRect().top;
    setSplit(splitTop < 0.55 * H);
    logo.style.transform = `scale(${(1.08 - 0.08 * clamp(1 - splitTop / H)).toFixed(4)})`;

    // hero dims a little as it leaves (soft hand-off)
    heroEl.style.opacity = String(1 - 0.35 * clamp((y / H - 0.55) / 0.45));
  }

  // rails: jump to a step (lands mid-way into its scroll window)
  steppers.forEach((st) => {
    st.rail.forEach((b) => {
      b.addEventListener("click", () => {
        const i = +b.dataset.i;
        const range = st.sec.offsetHeight - window.innerHeight;
        window.scrollTo({ top: docTop(st.sec) + ((i + 0.5) / st.steps.length) * range, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  });

  // contact: the company address is assembled only on request (kept away from harvesting crawlers),
  // the same way as on agentq-company.github.io
  const showEmail = document.getElementById("show-email");
  const emailLink = document.getElementById("email-link");
  if (showEmail && emailLink) {
    showEmail.addEventListener("click", () => {
      const user = ["agent", "q", "com", "pany"].join("");
      const host = ["gm", "ail"].join("") + "." + ["c", "om"].join("");
      const address = user + String.fromCharCode(64) + host;
      emailLink.href = "mai" + "lto:" + address + "?subject=" + encodeURIComponent("Agent Q, information / demonstration");
      emailLink.textContent = address;
      emailLink.hidden = false;
      showEmail.hidden = true;
      emailLink.focus();
    });
  }

  /* =======================================================
     6. Topic engine: per-section palette + morphing motifs
        problem → scattered sheets (chaos) · statement → aligned grid (order)
        modules → microkernel (core + orbiting plug-ins) · facts → vector
        constellation · for-you → audit-trail lines
     ======================================================= */
  const fx = document.getElementById("fx");
  const fctx = fx.getContext("2d");
  const SCENES = [
    // id, bowl core, bowl rim, motif
    ["top", "#8fd5f1", "#d2daff", "chaos"],
    ["problem", "#f3c6a5", "#fde6d6", "chaos"],
    ["statement", "#8fd5f1", "#d2daff", "order"],
    ["agent-q", "#a9bdfb", "#e0e7ff", "kernel"],
    ["facts", "#8fe0e4", "#d6f4f4", "vectors"],
    ["for-you", "#a6e3c6", "#dcf5e9", "ledger"],
    ["contact", "#a6e3c6", "#dcf5e9", "ledger"],
  ].map(([id, core, rim, motif]) => ({ el: document.getElementById(id), core: hex(core), rim: hex(rim), motif }));

  const NP = 40;
  const parts = Array.from({ length: NP }, (_, i) => ({
    x: Math.random(), y: Math.random(), w: 0.05, h: 0.07, r: 0, a: 0, round: 0,
    seed: Math.random() * 1000, i,
  }));
  let motif = "chaos", motifAlpha = 0, scrollVel = 0, lastY = window.scrollY;
  const mouse = { x: 0.5, y: 0.5 };
  window.addEventListener("pointermove", (e) => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; }, { passive: true });

  function sizeFx() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = Math.round(innerWidth * dpr); fx.height = Math.round(innerHeight * dpr);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeFx();
  window.addEventListener("resize", sizeFx);

  // target layout for particle i in motif m (viewport fractions; w/h in fractions of height)
  function target(p, m, t) {
    const i = p.i, rnd = (k) => { const v = Math.sin(p.seed * (k + 1)) * 43758.5453; return v - Math.floor(v); };
    if (m === "chaos") {
      return { x: rnd(1), y: rnd(2), w: 0.07, h: 0.095, r: (rnd(3) - 0.5) * 1.1 + Math.sin(t * 0.0004 + p.seed) * 0.08, round: 0.004, a: 0.55 };
    }
    if (m === "order") {
      const c = i % 8, row = Math.floor(i / 8);
      return { x: 0.06 + c * 0.125, y: 0.1 + row * 0.2, w: 0.05, h: 0.068, r: 0, round: 0.004, a: 0.4 };
    }
    if (m === "kernel") {
      if (i === 0) return { x: 0.78, y: 0.5, w: 0.2, h: 0.2, r: 0, round: 0.02, a: 0.55 };
      const ring = i < 14 ? 0.2 : 0.33, n = i < 14 ? 13 : NP - 14, k = i < 14 ? i - 1 : i - 14;
      const ang = (k / n) * Math.PI * 2 + t * (i < 14 ? 0.00008 : -0.00005);
      const asp = innerHeight / innerWidth;
      return { x: 0.78 + Math.cos(ang) * ring * asp, y: 0.5 + Math.sin(ang) * ring, w: 0.045, h: 0.045, r: ang, round: 0.01, a: 0.5 };
    }
    if (m === "vectors") {
      return { x: 0.45 + rnd(4) * 0.52 + Math.sin(t * 0.0003 + p.seed) * 0.015, y: 0.08 + rnd(5) * 0.84 + Math.cos(t * 0.00025 + p.seed) * 0.02,
        w: 0.011, h: 0.011, r: 0, round: 0.0055, a: 0.6 };
    }
    // ledger: ruled audit-trail lines with a timestamp dot
    const row = i % 20, col = Math.floor(i / 20);
    return { x: 0.52 + col * 0.24, y: 0.12 + row * 0.04, w: 0.17 + rnd(6) * 0.08, h: 0.004, r: 0, round: 0.002, a: 0.5 };
  }

  function updateScenePalette() {
    // blend the palettes of the two sections around the viewport centre
    const mid = innerHeight / 2;
    let best = 0;
    const centres = SCENES.map((sc, k) => {
      const r = sc.el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) best = k;
      return r.top + r.height / 2;
    });
    const cur = SCENES[best];
    const nb = mid > centres[best] ? Math.min(best + 1, SCENES.length - 1) : Math.max(best - 1, 0);
    const r = cur.el.getBoundingClientRect();
    const edge = mid > centres[best] ? r.bottom : r.top;
    const k = nb === best ? 0 : smooth(1 - Math.abs(edge - mid) / (innerHeight * 0.6)) * 0.5;
    CORE = mix(cur.core, SCENES[nb].core, k);
    RIM = mix(cur.rim, SCENES[nb].rim, k);
    motif = cur.motif;
    // motifs fade out over the video hero and under the dark contact panel
    const heroBottom = heroEl.getBoundingClientRect().bottom, contactTop = splitSec.getBoundingClientRect().top;
    motifAlpha = clamp((innerHeight - heroBottom) / (innerHeight * 0.5)) * clamp(contactTop / (innerHeight * 0.6));
  }

  function drawFx(now) {
    const W = innerWidth, H = innerHeight;
    fctx.clearRect(0, 0, W, H);
    updateScenePalette();
    const y = window.scrollY; scrollVel += ((y - lastY) - scrollVel) * 0.15; lastY = y;
    const ease = reduceMotion ? 1 : 0.06;
    const px = (mouse.x - 0.5) * 18, py = (mouse.y - 0.5) * 12;
    const ink = "11, 29, 58";
    parts.forEach((p) => {
      const tg = target(p, motif, reduceMotion ? 0 : now);
      for (const key of ["x", "y", "w", "h", "r", "round", "a"]) p[key] += (tg[key] - p[key]) * ease;
    });
    if (motifAlpha < 0.01) { requestAnimationFrame(drawFx); return; }
    // constellation links
    if (motif === "vectors") {
      fctx.lineWidth = 1;
      for (let a = 0; a < NP; a++) for (let b = a + 1; b < NP; b++) {
        const dx = (parts[a].x - parts[b].x) * W, dy = (parts[a].y - parts[b].y) * H, d = Math.hypot(dx, dy);
        if (d < 170) {
          fctx.strokeStyle = `rgba(${ink}, ${(0.16 * (1 - d / 170) * motifAlpha).toFixed(3)})`;
          fctx.beginPath(); fctx.moveTo(parts[a].x * W + px, parts[a].y * H + py); fctx.lineTo(parts[b].x * W + px, parts[b].y * H + py); fctx.stroke();
        }
      }
    }
    parts.forEach((p) => {
      const w = p.w * H, h = p.h * H, skew = clamp(scrollVel * 0.002, -0.15, 0.15);
      fctx.save();
      fctx.translate(p.x * W + px * (0.5 + (p.i % 3) * 0.4), p.y * H + py * (0.5 + (p.i % 3) * 0.4));
      fctx.rotate(p.r + (reduceMotion ? 0 : skew));
      fctx.globalAlpha = p.a * motifAlpha;
      fctx.beginPath();
      fctx.roundRect(-w / 2, -h / 2, w, h, p.round * H);
      fctx.fillStyle = motif === "vectors" ? `rgba(${ink}, 0.55)` : "rgba(255, 255, 255, 0.55)";
      fctx.fill();
      fctx.lineWidth = 1;
      fctx.strokeStyle = `rgba(${ink}, 0.16)`;
      fctx.stroke();
      // ruled lines on sheets (chaos/order) and a timestamp dot on audit lines
      if ((motif === "chaos" || motif === "order") && h > 20) {
        fctx.strokeStyle = `rgba(${ink}, 0.12)`;
        for (let l = 1; l <= 4; l++) { const ly = -h / 2 + (h * l) / 5.2; fctx.beginPath(); fctx.moveTo(-w / 2 + 7, ly); fctx.lineTo(w / 2 - 7 - (l === 4 ? w * 0.3 : 0), ly); fctx.stroke(); }
      } else if (motif === "ledger") {
        fctx.fillStyle = `rgba(${ink}, 0.45)`;
        fctx.beginPath(); fctx.arc(-w / 2 - 10, 0, 3.5, 0, Math.PI * 2); fctx.fill();
      }
      fctx.restore();
    });
    requestAnimationFrame(drawFx);
  }
  requestAnimationFrame(drawFx);

  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  };
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);

  requestAnimationFrame(() => {
    document.body.classList.add("ready");
    onScroll();
    requestAnimationFrame(frame);
  });
})();
