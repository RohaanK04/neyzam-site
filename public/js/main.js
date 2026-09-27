(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Smooth scroll (Lenis), mouse/trackpad devices only ---------- */
  let lenis = null;
  if (window.Lenis && !reduceMotion && finePointer) {
    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    window.__lenis = lenis;
  }

  /* ---------- Mobile menu ---------- */
  const toggle = $('.nav__toggle');
  const links = $('#nav-links');
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Split headings into words ---------- */
  const splitWords = (el, mask) => {
    const text = el.textContent.trim();
    const words = text.split(/\s+/);
    el.setAttribute('aria-label', text);
    el.textContent = '';
    words.forEach((word, i) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      if (mask) {
        const inner = document.createElement('span');
        inner.className = 'wi';
        inner.style.setProperty('--i', i);
        inner.textContent = word;
        w.appendChild(inner);
      } else {
        w.textContent = word;
      }
      el.appendChild(w);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return $$('.w', el);
  };

  const splitEls = $$('[data-split]');
  splitEls.forEach((el) => splitWords(el, true));
  const scrubs = $$('[data-scrub]').map((el) => ({ el, words: splitWords(el, false), p: -1 }));

  /* ---------- Intro: page becomes ready once the font is in, then everything rises in ---------- */
  const start = () => {
    if (root.classList.contains('is-ready')) return;
    root.classList.add('is-ready');
    // Split headings that are already on screen (the hero title) rise immediately
    splitEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add('is-in');
    });
  };
  if (reduceMotion) {
    start();
  } else {
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
    setTimeout(start, 1500);                                  // never wait on a slow font
  }

  /* ---------- Scroll-driven effects: word brightening + progress rail ---------- */
  const rail = $('#rail');
  const stepsEl = $('#steps');
  let ticking = false;
  const tabLinks = $$('#tabs a');
  const fcards = $$('.fcard');
  let activeTab = '';

  const update = () => {
    ticking = false;
    const vh = window.innerHeight;

    scrubs.forEach((s) => {
      const r = s.el.getBoundingClientRect();
      // 0 while the heading is still below 88% of the screen, 1 once it has reached ~36%
      const p = reduceMotion ? 1 : clamp((vh * 0.88 - r.top) / (vh * 0.52), 0, 1);
      if (Math.abs(p - s.p) < 0.002) return;
      s.p = p;
      const n = s.words.length, spread = 3;
      for (let i = 0; i < n; i++) {
        const t = clamp((p * (n + spread) - i) / spread, 0, 1);
        s.words[i].style.opacity = (0.16 + 0.84 * t).toFixed(3);
      }
    });

    if (rail && stepsEl) {
      const r = stepsEl.getBoundingClientRect();
      const p = clamp((vh * 0.78 - r.top) / (r.height * 0.9 + vh * 0.1), 0, 1);
      rail.style.transform = `scaleX(${p.toFixed(3)})`;
    }

    if (tabLinks.length && fcards.length) {
      let current = fcards[0];
      fcards.forEach((c) => { if (c.getBoundingClientRect().top <= vh * 0.5) current = c; });
      const id = `#${current.id}`;
      if (id !== activeTab) {
        activeTab = id;
        tabLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
      }
    }
  };
  // rAF gives smooth updates; the timer is a safety net for when the browser pauses rAF (background tabs),
  // so the "already scheduled" flag can never get stuck.
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    const run = () => { if (ticking) update(); };
    requestAnimationFrame(run);
    setTimeout(run, 120);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    // Cards in the same row arrive one after another
    $$('.benefits, .steps, .acards, .features__cards, .about__grid').forEach((group) => {
      $$('.reveal', group).forEach((el, i) => el.style.setProperty('--d', `${i * 0.09}s`));
    });
    revealEls.forEach((el) => io.observe(el));
    // Split headings that are further down rise when they come into view
    const splitIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        splitIo.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    splitEls.forEach((el) => { if (!el.classList.contains('is-in')) splitIo.observe(el); });
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
    splitEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Marquees: duplicate the track so the -50% loop is seamless ---------- */
  $$('[data-dup]').forEach((track) => {
    Array.from(track.children).forEach((child) => {
      const clone = child.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
  });

  /* ---------- Pause looping animations that are off-screen ---------- */
  if ('IntersectionObserver' in window) {
    const pauser = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-paused', !e.isIntersecting));
    }, { rootMargin: '160px 0px' });
    $$('.hero, .cta, .marquee').forEach((el) => pauser.observe(el));
  }

  /* ---------- Hero console: the example workflow runs step by step ---------- */
  const flow = $('#flow');
  if (flow) {
    const items = $$('li', flow);
    let index = 0;
    let timer = null;
    const show = (n) => items.forEach((li, k) => {
      li.classList.toggle('is-active', k === n);
      li.classList.toggle('is-done', k < n);
    });
    const play = () => {
      if (timer || reduceMotion) return;
      timer = setInterval(() => { index = (index + 1) % items.length; show(index); }, 2300);
    };
    const stop = () => { clearInterval(timer); timer = null; };
    show(0);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : stop()), { threshold: 0.3 }).observe($('.console'));
    }
  }

  /* ---------- FAQ accordion (one open at a time) ---------- */
  const faqItems = $$('.faq__item');
  faqItems.forEach((item) => {
    const btn = $('button', item);
    btn.addEventListener('click', () => {
      const willOpen = !item.classList.contains('is-open');
      faqItems.forEach((other) => {
        other.classList.remove('is-open');
        $('button', other).setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- Booking form ----------
     Every [data-book] button opens the dialog, but only once the backend says it is configured
     (GET /api/book -> { ready: true }). Until then the buttons keep their normal behaviour (email / scroll),
     so a half-set-up site never shows a form that cannot send. Add ?booking=preview to see the form anyway. */
  const dialog = $('#booking');
  const bform = $('#bform');
  const bBody = $('#booking-body');
  const bDone = $('#booking-done');
  const bError = $('#bform-error');
  const bSubmit = $('#bform-submit');
  const MAIL_FALLBACK = 'business@neyzam.online';
  let bookingReady = new URLSearchParams(location.search).get('booking') === 'preview';
  let openedAt = 0;
  let lastOpener = null;
  let locked = false;

  const setLocked = (on) => {
    locked = on;
    root.classList.toggle('is-locked', on);
    if (lenis) (on ? lenis.stop() : lenis.start());
  };
  // Idempotent: safe to call from every close path (button, backdrop, Escape, the close event)
  const unlock = () => { if (locked) setLocked(false); };
  const fieldError = (name, message) => {
    const input = bform.elements[name];
    const note = $(`[data-err="${name}"]`, bform);
    if (note) note.textContent = message || '';
    if (input) {
      input.closest('.field').classList.toggle('has-error', Boolean(message));
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  };
  const clearErrors = () => {
    ['name', 'email', 'topic', 'preferredDate'].forEach((n) => fieldError(n, ''));
    bError.hidden = true;
    bError.textContent = '';
  };
  const showBanner = (html) => { bError.innerHTML = html; bError.hidden = false; };

  const resetForm = () => {
    bform.reset();
    clearErrors();
    bBody.hidden = false;
    bDone.hidden = true;
    bSubmit.classList.remove('is-loading');
    bSubmit.disabled = false;
    const today = new Date();
    const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    bform.elements.preferredDate.min = iso;
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
    $('#bform-tz').textContent = tz ? `Times are in your timezone: ${tz.replace(/_/g, ' ')}.` : '';
  };

  const openBooking = (opener) => {
    if (!dialog || dialog.open) return;
    lastOpener = opener || document.activeElement;
    resetForm();
    dialog.showModal();
    setLocked(true);
    openedAt = Date.now();
  };
  const restoreFocus = () => { if (lastOpener && lastOpener.focus) lastOpener.focus({ preventScroll: true }); };
  const closeBooking = () => {
    if (dialog && dialog.open) dialog.close();
    unlock();                                   // do not wait for the close event
    restoreFocus();
  };

  if (dialog && bform) {
    dialog.addEventListener('close', () => { unlock(); restoreFocus(); });
    dialog.addEventListener('cancel', unlock);                                        // Escape
    dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') unlock(); }); // Escape, even if events are delayed
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeBooking(); });   // click on the dark backdrop
    $$('[data-book-close]').forEach((el) => el.addEventListener('click', closeBooking));

    // Ask the backend whether booking is set up (not cached, tiny)
    if (!bookingReady) {
      const check = () => fetch('/api/book', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { ready: false }))
        .then((d) => { bookingReady = d && d.ready === true; })
        .catch(() => { bookingReady = false; });
      if ('requestIdleCallback' in window) requestIdleCallback(check, { timeout: 2500 });
      else setTimeout(check, 800);
    }

    // Registered before the in-page link handler, so this wins for booking buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-book]');
      if (!btn || !bookingReady) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      setMenu(false);
      openBooking(btn);
    });

    bform.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const f = bform.elements;
      const errors = {};
      if (f.name.value.trim().length < 2) errors.name = 'Please enter your name.';
      if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(f.email.value.trim())) errors.email = 'Please enter a valid email address.';
      if (!f.topic.value) errors.topic = 'Please choose what you want to automate.';
      const names = Object.keys(errors);
      if (names.length) {
        names.forEach((n) => fieldError(n, errors[n]));
        f[names[0]].focus();
        return;
      }

      const payload = {
        name: f.name.value, email: f.email.value, company: f.company.value, topic: f.topic.value,
        process: f.process.value, preferredDate: f.preferredDate.value, preferredWindow: f.preferredWindow.value,
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (err) { return ''; } })(),
        website: f.website.value,           // hidden field: real people leave it empty
        openedAt,
      };
      bSubmit.classList.add('is-loading');
      bSubmit.disabled = true;
      try {
        const res = await fetch('/api/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        let data = {};
        try { data = await res.json(); } catch (err) { /* not JSON */ }
        if (res.ok && data.ok) {
          const first = payload.name.trim().split(/\s+/)[0];
          $('#booking-done-text').textContent = `Thanks, ${first}. We'll get back to you at ${payload.email.trim()} to set up a call.`;
          bBody.hidden = true;
          bDone.hidden = false;
          bDone.querySelector('button').focus();
        } else if (res.status === 400 && data.fields) {
          Object.keys(data.fields).forEach((n) => fieldError(n, data.fields[n]));
          const first = Object.keys(data.fields)[0];
          if (bform.elements[first]) bform.elements[first].focus();
        } else if (res.status === 429) {
          showBanner('That was very quick. Please check the details and send it again.');
        } else {
          showBanner(`We couldn't send that just now. Please try again, or email us at <a href="mailto:${MAIL_FALLBACK}">${MAIL_FALLBACK}</a>.`);
        }
      } catch (err) {
        showBanner(`We couldn't send that just now. Please try again, or email us at <a href="mailto:${MAIL_FALLBACK}">${MAIL_FALLBACK}</a>.`);
      } finally {
        bSubmit.classList.remove('is-loading');
        bSubmit.disabled = false;
      }
    });
  }

  /* ---------- In-page links open like a new page ----------
     The page jumps straight to the section, then its content fades up in reading order.
     Only opacity and a small transform are animated, so it stays smooth. Cards and panels
     fade as one unit; nothing is faded twice. */
  const FADE_MS = 900;          // length of each element's fade
  const STAGGER_MS = 80;        // gap between one element and the next
  const MAX_STEPS = 8;          // later elements share the last delay so long sections do not drag
  const FADE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  const FADE_SEL = [
    '.eyebrow', '.chip', 'h1', 'h2', 'h3', '.hero__lead', '.lede', '.cta__note', '.hero__cta', '.console',
    '.benefit', '.fcard', '.tabs', '.step', '.acard', '.pcard', '.person', '.pills', '.faq__item', '.tools__list',
    '.why__cta', '.work__cta', '.footer__brand', '.footer__cols nav',
  ].join(', ');
  let activeFades = [];

  const navPad = () => parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;

  // Content that was already revealed by scrolling should not run its own reveal a second time
  const revealInView = () => {
    const vh = window.innerHeight;
    $$('.reveal:not(.is-in), [data-split]:not(.is-in)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        if (el.matches('[data-split]')) {
          el.classList.add('instant', 'is-in');
        } else {
          el.style.transition = 'none';
          el.classList.add('is-in');
          requestAnimationFrame(() => { el.style.transition = ''; });
        }
      }
    });
  };

  const fadeInView = () => {
    activeFades.forEach((anim) => anim.cancel());           // a new click replaces any fade still running
    activeFades = [];
    const vh = window.innerHeight;
    const pad = navPad();
    const rects = new Map();
    const inView = $$(FADE_SEL).filter((el) => {
      const r = el.getBoundingClientRect();
      // Only elements you can actually see below the nav (not slivers hiding behind it or peeking in at the bottom)
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, pad);
      if (r.height <= 0 || visible < Math.min(32, r.height * 0.5)) return false;
      rects.set(el, r);
      return true;
    });
    const set = new Set(inView);
    // Keep only outermost blocks so a card and the text inside it never fade separately
    const blocks = inView.filter((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
    // Reading order: top to bottom, left to right within the same row.
    // A tall card beside the text is ranked by its middle, so the heading still leads.
    const order = (el) => { const r = rects.get(el); return el.matches('.person') ? r.top + r.height * 0.4 : r.top; };
    blocks.sort((x, y) => {
      const a = order(x), b = order(y);
      return Math.abs(a - b) < 24 ? rects.get(x).left - rects.get(y).left : a - b;
    });
    blocks.forEach((el, i) => {
      activeFades.push(el.animate(
        [{ opacity: 0, transform: 'translate3d(0, 14px, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
        { duration: FADE_MS, delay: Math.min(i, MAX_STEPS) * STAGGER_MS, easing: FADE_EASE, fill: 'backwards' }
      ));
    });
  };

  const jumpTo = (y) => {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });   // keep the smooth scroller in sync
    else window.scrollTo(0, y);
  };

  const goTo = (hash, target) => {
    // Push first: the browser saves the current scroll position for the entry we are leaving,
    // so Back has to see the position from BEFORE the jump.
    history.replaceState({ y: Math.round(window.scrollY) }, '');   // where we are now, for the Back button
    history.pushState(null, '', hash === '#top' ? location.pathname + location.search : hash);
    const y = hash === '#top' ? 0 : Math.max(0, target.getBoundingClientRect().top + window.scrollY - navPad());
    jumpTo(y);
    if (hash !== '#top') {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
    revealInView();
    update();
    if (!reduceMotion) fadeInView();                        // created in the same frame as the jump, so nothing flashes
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const hash = a.getAttribute('href');
    if (hash.length < 2) return;
    const target = hash === '#top' ? document.body : document.getElementById(hash.slice(1));
    if (!target) return;
    e.preventDefault();

    const alreadyThere = hash === '#top' ? window.scrollY < 4 : Math.abs(target.getBoundingClientRect().top - navPad()) < 4;
    if (alreadyThere) return;
    goTo(hash, target);
  });

  /* ---------- Back / Forward: restore our own remembered position and keep Lenis in sync ---------- */
  window.addEventListener('popstate', (e) => {
    let y = e.state && typeof e.state.y === 'number' ? e.state.y : null;
    if (y === null) {                                        // forward to a section entry: land on that section
      const h = location.hash;
      const target = h ? document.getElementById(h.slice(1)) : null;
      y = target ? Math.max(0, target.getBoundingClientRect().top + window.scrollY - navPad()) : 0;
    }
    jumpTo(y);
    revealInView();
    update();
    // Some browsers apply their own restoration a moment later; make sure Lenis follows whatever the page ended up at
    setTimeout(() => { if (lenis) lenis.scrollTo(window.scrollY, { immediate: true, force: true }); update(); }, 90);
  });
})();
