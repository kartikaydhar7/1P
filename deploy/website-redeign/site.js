/* site.js: page behaviour for sprouts.ai "While you slept".
   Engines (scrub-hero.js, scrollcraft.js, gsap) are loaded before this file and never edited. */
(function () {
  "use strict";

  /* Where the Ask Savant question goes. Swap for the production app's Global Search URL at launch.
     The question is sent as the `q` query parameter. */
  var ASK_URL = "https://sprouts-discover-prototype.vercel.app/";

  var hero = document.querySelector("[data-hero]");
  var mast = document.querySelector("[data-mast]");
  var clockText = document.querySelector("[data-clock-text]");
  var reduceQ = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---- 1. The headline layer follows the film frame, not raw scroll ---------- */
  if (hero && window.gsap && window.ScrubHero) {
    var tl = gsap.timeline({ paused: true });
    /* the film fades the headline in over its first second; on the page it must read at load, so it starts full */
    gsap.set(".fl-h1-night", { opacity: 1, y: 0 });
    tl.to(".fl-h1-night", { opacity: 0, y: -10, duration: 0.45, ease: "power2.in" }, 5.8);
    tl.fromTo(".fl-h1-rest", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 11.1);
    tl.to({}, { duration: 0.01 }, 13.4);
    ScrubHero.onFrame(hero, function (t) { tl.seek(t, false); });
    /* cover-fit the film layer from data-size now, before the film's metadata arrives, so the headline sits on the picture from the first paint */
    ScrubHero.refresh();
  }

  /* ---- 2. The night clock: the page is one night, 23:40 to 08:30 and round again ---- */
  var keys = [];
  function minutes(h, m) { return h * 60 + m; }
  function fmt(mins) {
    mins = ((Math.round(mins) % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function heroTime(p) {
    /* piecewise, matching the film's captions */
    var stops = [[0, minutes(23, 40)], [0.26, minutes(23, 58)], [0.5, minutes(6, 40) + 1440], [0.82, minutes(8, 30) + 1440], [1, minutes(8, 30) + 1440]];
    for (var i = 1; i < stops.length; i++) {
      if (p <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i];
        return lerp(a[1], b[1], (p - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return stops[stops.length - 1][1];
  }
  function build() {
    keys = [];
    var q = function (sel) { return document.querySelector(sel); };
    keys.push({ el: hero, kind: "hero" });
    keys.push({ el: q("#ask"), from: minutes(8, 31), to: minutes(8, 31) });
    keys.push({ el: q("#customers"), from: minutes(8, 40), to: minutes(8, 40) });
    keys.push({ el: q("#work"), kind: "progress", from: minutes(9, 0), to: minutes(17, 30) });
    keys.push({ el: q("#data"), from: minutes(18, 10), to: minutes(18, 10) });
    keys.push({ el: q("#mcp"), from: minutes(18, 40), to: minutes(18, 40) });
    keys.push({ el: q(".act-close"), kind: "progress", from: minutes(18, 40), to: minutes(8, 30) + 1440 });
    keys = keys.filter(function (k) { return k.el; });
  }
  var lastClock = "";
  function clock() {
    if (!clockText || !keys.length) return;
    var mid = innerHeight * 0.5, chosen = null, best = Infinity;
    for (var i = 0; i < keys.length; i++) {
      var r = keys[i].el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { chosen = keys[i]; break; }
      var d = r.top > mid ? r.top - mid : mid - r.bottom;
      if (d < best) { best = d; chosen = keys[i]; }
    }
    if (!chosen) return;
    var t;
    if (chosen.kind === "hero") {
      var s = window.ScrubHero ? ScrubHero.state(hero) : null;
      var p = s && !s.still ? s.progress : 0;
      if (s && s.still) {
        var rr = hero.getBoundingClientRect();
        p = Math.min(1, Math.max(0, -rr.top / Math.max(1, rr.height - innerHeight)));
      }
      t = heroTime(p);
    } else if (chosen.kind === "progress") {
      var rp = chosen.el.getBoundingClientRect();
      var run = Math.max(1, rp.height - innerHeight);
      var pp = Math.min(1, Math.max(0, -rp.top / run));
      t = lerp(chosen.from, chosen.to, pp);
    } else {
      t = chosen.from;
    }
    var text = fmt(t);
    if (text !== lastClock) { lastClock = text; clockText.textContent = text; }
  }

  /* ---- 3. The masthead turns from night to morning with the page ---------------- */
  function mastState() {
    if (!mast || !hero) return;
    var r = hero.getBoundingClientRect();
    var s = window.ScrubHero ? ScrubHero.state(hero) : null;
    var p = s && !s.still ? s.progress : 1;
    var past = r.bottom <= innerHeight * 0.5;
    var light = p > 0.74 || past || (s && s.still);
    mast.classList.toggle("mast--light", light);
    mast.classList.toggle("mast--solid", r.bottom <= innerHeight);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; clock(); mastState(); });
  }
  build();
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  /* the hero smooths its progress over a few frames, so poll briefly after each scroll stops */
  var settle = 0;
  addEventListener("scroll", function () {
    clearTimeout(settle);
    settle = setTimeout(function () { var n = 0; var id = setInterval(function () { clock(); mastState(); if (++n > 20) clearInterval(id); }, 50); }, 60);
  }, { passive: true });

  /* ---- 4. Ask Savant: the one action ------------------------------------------- */
  var form = document.querySelector("[data-ask-form]");
  if (form) {
    form.setAttribute("action", ASK_URL);
    var field = form.querySelector("[data-ask-field]");
    /* The example question types itself as the act scrolls (driven by the act's progress, never a clock). */
    var askAct = document.getElementById("ask");
    var example = field.getAttribute("data-example") || field.placeholder;
    if (askAct && !reduceQ.matches) {
      var typed = -1;
      var typeTick = function () {
        if (document.activeElement === field || field.value) { if (typed !== example.length) { field.placeholder = example; typed = example.length; } return; }
        var pv = parseFloat(getComputedStyle(askAct).getPropertyValue("--sc-p")) || 0;
        var k = Math.min(1, Math.max(0, (pv - 0.04) / 0.5));
        var n = Math.round(k * example.length);
        if (n !== typed) { typed = n; field.placeholder = example.slice(0, n) + (n < example.length && n > 0 ? "|" : ""); }
      };
      addEventListener("scroll", function () { requestAnimationFrame(typeTick); }, { passive: true });
      typeTick();
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var qv = (field.value || "").trim() || field.getAttribute("placeholder") || "";
      var url = ASK_URL + (ASK_URL.indexOf("?") > -1 ? "&" : "?") + "q=" + encodeURIComponent(qv);
      location.href = url;
    });
    document.querySelectorAll("[data-ask-chip]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        field.value = chip.textContent.trim();
        field.focus();
      });
    });
  }

  /* ---- 5. Phone menu ----------------------------------------------------------- */
  var toggle = document.querySelector("[data-menu-toggle]");
  var menu = document.querySelector("[data-menu]");
  if (toggle && menu) {
    var setOpen = function (open) {
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (mast) mast.classList.toggle("mast--menu", open);
    };
    toggle.addEventListener("click", function () { setOpen(menu.hidden); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setOpen(false); toggle.focus(); } });
  }

  /* ---- 6. scroll-craft for the acts below the hero -------------------------------- */
  if (window.ScrollCraft) ScrollCraft.mount(document);
})();
