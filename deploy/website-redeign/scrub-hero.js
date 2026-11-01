/* scrub-hero.js: a scroll-scrubbed hero film for plain HTML sites.
   No dependencies. Copy into site/ unchanged with scrub-hero.css; put
   page-specific styling and motion in the site's own files.

   Markup:
   <section class="hero" data-hero style="--span:5">
     <div class="hero-stage">
       <video data-scrub muted playsinline preload="none"
         data-src="assets/hero.mp4" data-poster="assets/hero.webp" data-size="1920x1080"
         data-src-phone="assets/hero-phone.mp4" data-poster-phone="assets/hero-phone.webp"
         data-size-phone="1080x1920"></video>
       <div class="hero-film-layer" data-film-layer aria-hidden="true">
         ... the film's headline block, positioned in film pixels ...
       </div>
       <div class="hero-captions">
         <h1 data-band="0 0.3">Real heading</h1>
         <p data-band="0.38 0.66">Second beat</p>
         <p data-band="0.74 1"><a class="btn" href="#act">One action</a></p>
       </div>
     </div>
   </section>

   Page hooks:
   ScrubHero.onFrame(heroEl, function (t, duration) { headlineTimeline.seek(t); });
   ScrubHero.state(heroEl) -> { progress, time, duration, still }
   CSS reads --p (0..1 smoothed progress) on the hero.
   The film layer is scaled with the same cover-fit as the video, so blocks
   positioned in composition pixels stay on the picture. data-size and
   data-size-phone are the composition sizes (the encode may be smaller). The phone film needs its own
   block: show one per breakpoint with the query below. Add data-film-twin to
   a caption the film layer already shows: it stays readable to screen readers
   and appears normally in the still hero.
   Phone query: (max-width: 767px) and (orientation: portrait)

   Behaviour: one seek in flight at a time; the film downloads whole as a Blob
   so seeks stay local on any static host; the poster shows until the film can
   play; reduced motion, a failed download or a phone with no phone film gets
   the still hero (class is-still) with every caption shown. */
(function () {
  "use strict";
  var reduceQ = matchMedia("(prefers-reduced-motion: reduce)");
  var phoneQ = matchMedia("(max-width: 767px) and (orientation: portrait)");
  var heroes = [];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function bandOpacity(p, a, b, fade) {
    if (p < a) return a <= 0 ? 1 : clamp(1 - (a - p) / fade, 0, 1);
    if (p > b) return b >= 1 ? 1 : clamp(1 - (p - b) / fade, 0, 1);
    return 1;
  }

  function Hero(el) {
    this.el = el;
    this.stage = el.querySelector(".hero-stage") || el;
    this.video = el.querySelector("video[data-scrub]");
    this.layer = el.querySelector("[data-film-layer]");
    this.bands = [].slice.call(el.querySelectorAll("[data-band]")).map(function (n) {
      var r = n.getAttribute("data-band").split(/\s+/).map(Number);
      return { node: n, a: r[0] || 0, b: r[1] === undefined ? 1 : r[1] };
    });
    this.listeners = [];
    this.target = 0; this.shown = 0; this.seeking = false; this.seekAt = 0;
    this.raf = 0; this.last = 0; this.url = null; this.variant = null;
    this.still = false; this.ready = false; this.abort = null;
    var self = this;
    this.tick = function (now) { self.frame(now); };
    this.video.addEventListener("seeked", function () {
      self.seeking = false;
      self.emit(self.video.currentTime);
      self.wake();
    });
    this.video.muted = true;
    this.video.playsInline = true;
    this.primed = false;
    this.video.addEventListener("loadedmetadata", function () { self.primed = false; self.prime(); self.fit(); self.wake(); });
    var retry = function () { if (!self.primed) self.prime(); };
    ["touchstart", "touchend", "pointerdown", "click", "keydown", "scroll"].forEach(function (type) {
      addEventListener(type, retry, { passive: true });
    });
    this.video.addEventListener("loadeddata", function () {
      self.ready = true;
      self.el.classList.add("is-ready");
      self.wake();
    });
    this.video.addEventListener("error", function () { self.setStill(true, "media"); });
    if (this.video.requestVideoFrameCallback) {
      var onFrame = function (_, meta) {
        self.emit(meta.mediaTime);
        self.video.requestVideoFrameCallback(onFrame);
      };
      this.video.requestVideoFrameCallback(onFrame);
    }
    this.load();
  }

  /* iOS will not paint a muted video that has never played: seeks land but the
     picture stays frozen. Play and pause once per source; retry on gestures,
     since Low Power Mode refuses the first attempt and play() can hang. */
  Hero.prototype.prime = function () {
    var v = this.video, self = this;
    if (this.primed || this.priming || !v.currentSrc) return;
    this.priming = true;
    var done = function (ok) {
      if (!self.priming) return;
      self.priming = false;
      if (!v.paused) v.pause();
      if (ok) self.primed = true;
      self.seeking = false;
      self.wake();
    };
    var guard = setTimeout(function () { done(false); }, 1500);
    try {
      var p = v.play();
      if (p && p.then) p.then(function () { clearTimeout(guard); done(true); }, function () { clearTimeout(guard); done(false); });
      else { clearTimeout(guard); done(true); }
    } catch (e) { clearTimeout(guard); done(false); }
  };

  Hero.prototype.pick = function () {
    var phone = phoneQ.matches, v = this.video;
    var src = phone ? v.getAttribute("data-src-phone") : v.getAttribute("data-src");
    var poster = phone ? (v.getAttribute("data-poster-phone") || v.getAttribute("data-poster")) : v.getAttribute("data-poster");
    return { key: phone ? "phone" : "wide", src: src, poster: poster };
  };

  Hero.prototype.load = function () {
    var pick = this.pick(), self = this;
    if (pick.poster) this.stage.style.setProperty("--poster", 'url("' + pick.poster + '")');
    if (reduceQ.matches) return this.setStill(true, "reduced-motion");
    if (!pick.src) return this.setStill(true, "no-source");
    if (pick.key === this.variant && this.url) return this.setStill(false);
    this.variant = pick.key;
    this.ready = false;
    this.el.classList.remove("is-ready");
    if (this.abort) this.abort.abort();
    this.abort = typeof AbortController === "function" ? new AbortController() : null;
    var stall = setTimeout(function () { if (self.abort) self.abort.abort(); }, 30000);
    this.setStill(false);
    fetch(pick.src, { signal: this.abort ? this.abort.signal : undefined, priority: "low" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
      .then(function (blob) {
        clearTimeout(stall);
        if (self.url) URL.revokeObjectURL(self.url);
        self.url = URL.createObjectURL(blob);
        self.video.preload = "auto";
        self.video.src = self.url;
        self.video.load();
        /* Some phones never report loadeddata for an unplayed clip: reveal anyway. */
        setTimeout(function () {
          if (!self.ready && !self.still && self.video.readyState >= 1) {
            self.ready = true;
            self.el.classList.add("is-ready");
            self.wake();
          }
        }, 2500);
      })
      .catch(function (err) {
        clearTimeout(stall);
        if (err && err.name === "AbortError" && self.variant !== pick.key) return;
        self.setStill(true, "media");
      });
  };

  Hero.prototype.setStill = function (on, why) {
    this.still = on;
    this.el.classList.toggle("is-still", on);
    if (on) {
      this.el.setAttribute("data-still", why || "");
      this.bands.forEach(function (b) { b.node.style.opacity = ""; });
    } else {
      this.el.removeAttribute("data-still");
      this.wake();
    }
  };

  Hero.prototype.fit = function () {
    var v = this.video, s = this.stage.getBoundingClientRect();
    var size = (this.pick().key === "phone" ? v.getAttribute("data-size-phone") : v.getAttribute("data-size")) || "";
    var m = size.match(/(\d+)\s*x\s*(\d+)/);
    var fw = m ? +m[1] : (v.videoWidth || 1920);
    var fh = m ? +m[2] : (v.videoHeight || 1080);
    var scale = Math.max(s.width / fw, s.height / fh);
    this.stage.style.setProperty("--fw", fw);
    this.stage.style.setProperty("--fh", fh);
    this.stage.style.setProperty("--cover", scale.toFixed(5));
  };

  Hero.prototype.measure = function () {
    var r = this.el.getBoundingClientRect();
    var run = r.height - innerHeight;
    this.visible = r.bottom > 0 && r.top < innerHeight;
    this.target = run > 0 ? clamp(-r.top / run, 0, 1) : 0;
  };

  Hero.prototype.wake = function () {
    if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.tick); }
  };

  Hero.prototype.frame = function (now) {
    this.raf = 0;
    if (this.still) return;
    this.measure();
    var dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
    this.last = now;
    var gap = this.target - this.shown;
    this.shown = Math.abs(gap) < 0.0004 ? this.target : this.shown + gap * (1 - Math.pow(0.86, dt * 60));
    var p = this.shown;
    this.el.style.setProperty("--p", p.toFixed(4));
    for (var i = 0; i < this.bands.length; i++) {
      var b = this.bands[i];
      b.node.style.opacity = bandOpacity(p, b.a, b.b, 0.05).toFixed(3);
    }
    var v = this.video, d = v.duration;
    if (this.ready && !this.priming && d && isFinite(d)) {
      var t = clamp(p * d, 0, Math.max(0, d - 0.04));
      if (this.seeking && now - this.seekAt > 600) this.seeking = false;
      if (!this.seeking && Math.abs(t - v.currentTime) > 0.008) {
        this.seeking = true; this.seekAt = now;
        v.currentTime = t;
      }
    }
    var settled = this.target === this.shown && !this.seeking;
    if (this.visible && !settled) this.raf = requestAnimationFrame(this.tick);
  };

  Hero.prototype.emit = function (t) {
    var d = this.video.duration || 0;
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](t, d, this.el);
  };

  function find(el) {
    for (var i = 0; i < heroes.length; i++) if (heroes[i].el === el) return heroes[i];
    return null;
  }

  function ensure(el) {
    var h = el && find(el);
    if (!h && el && el.querySelector("video[data-scrub]")) { h = new Hero(el); heroes.push(h); }
    return h;
  }

  function wakeAll() { heroes.forEach(function (h) { h.wake(); }); }
  function refitAll() { heroes.forEach(function (h) { h.fit(); h.wake(); }); }
  function reloadAll() { heroes.forEach(function (h) { h.load(); }); }

  function start() {
    [].forEach.call(document.querySelectorAll("[data-hero]"), ensure);
    wakeAll();
  }

  addEventListener("scroll", wakeAll, { passive: true });
  addEventListener("resize", refitAll);
  if (reduceQ.addEventListener) {
    reduceQ.addEventListener("change", reloadAll);
    phoneQ.addEventListener("change", reloadAll);
  }

  window.ScrubHero = {
    onFrame: function (el, fn) {
      var h = ensure(el);
      if (!h) return;
      h.listeners.push(fn);
      fn(h.video.currentTime || 0, h.video.duration || 0, h.el);
    },
    state: function (el) {
      var h = find(el);
      return h ? { progress: h.shown, time: h.video.currentTime, duration: h.video.duration || 0, still: h.still } : null;
    },
    refresh: refitAll
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
