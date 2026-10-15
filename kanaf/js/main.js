/* =============================================================
   كنف — سلوك الموقع
   ============================================================= */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');
  document.documentElement.classList.add('js');

  var body = document.body;
  var header = document.getElementById('siteHeader');

  /* ---------- الهيدر عند التمرير ---------- */
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- قائمة الجوال ---------- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  function setNav(open) {
    body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  }

  toggle.addEventListener('click', function () {
    setNav(!body.classList.contains('nav-open'));
  });

  nav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { setNav(false); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('nav-open')) setNav(false);
  });

  /* ---------- حركات الظهور ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- تمييز رابط القسم الحالي ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var navLinks = Array.prototype.slice.call(nav.querySelectorAll('.nav__link'));

  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- الروابط الاختيارية (تظهر فقط عند تعبئتها) ---------- */
  document.querySelectorAll('[data-optional]').forEach(function (a) {
    var href = (a.getAttribute('href') || '').trim();
    if (!href || href === '#') a.hidden = true;
  });

  document.querySelectorAll('[data-optional-group]').forEach(function (group) {
    var visible = Array.prototype.some.call(group.querySelectorAll('a'), function (a) { return !a.hidden; });
    if (!visible) group.hidden = true;
  });

  /* ---------- روابط واتساب ---------- */
  var number = (body.getAttribute('data-whatsapp') || '').replace(/\D/g, '');

  function waLink(text) {
    return 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
  }

  document.querySelectorAll('[data-wa]').forEach(function (a) {
    a.href = waLink(a.getAttribute('data-wa') || 'السلام عليكم، أرغب بالاستفسار عن حجز شاليه كنف.');
  });

  /* ---------- نموذج الحجز ---------- */
  var form = document.getElementById('bookingForm');
  if (form) {
    var nameEl = form.querySelector('[name="name"]');
    var inEl = form.querySelector('[name="checkin"]');
    var outEl = form.querySelector('[name="checkout"]');
    var guestsEl = form.querySelector('[name="guests"]');
    var notesEl = form.querySelector('[name="notes"]');
    var errorEl = document.getElementById('formError');

    var today = new Date();
    var isoToday = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    inEl.min = isoToday;
    outEl.min = isoToday;

    inEl.addEventListener('change', function () {
      outEl.min = inEl.value || isoToday;
      if (outEl.value && outEl.value <= inEl.value) outEl.value = '';
    });

    function formatDate(value) {
      if (!value) return '';
      var d = new Date(value + 'T00:00:00');
      try {
        return d.toLocaleDateString('ar-SA-u-ca-gregory', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
      } catch (err) {
        return value;
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var fields = [nameEl, inEl, outEl];
      var valid = true;
      fields.forEach(function (el) {
        var ok = !!el.value.trim();
        el.classList.toggle('is-invalid', !ok);
        if (!ok) valid = false;
      });

      if (valid && outEl.value <= inEl.value) {
        outEl.classList.add('is-invalid');
        valid = false;
      }

      errorEl.hidden = valid;
      if (!valid) return;

      var lines = [
        'السلام عليكم، أرغب بحجز شاليه كنف 🌿',
        'الاسم: ' + nameEl.value.trim(),
        'تاريخ الوصول: ' + formatDate(inEl.value),
        'تاريخ المغادرة: ' + formatDate(outEl.value),
        'عدد الضيوف: ' + guestsEl.value
      ];
      var notes = notesEl.value.trim();
      if (notes) lines.push('ملاحظات: ' + notes);

      window.open(waLink(lines.join('\n')), '_blank', 'noopener');
    });

    [nameEl, inEl, outEl].forEach(function (el) {
      el.addEventListener('input', function () { el.classList.remove('is-invalid'); });
    });
  }

  /* ---------- عارض الصور ---------- */
  var items = Array.prototype.slice.call(document.querySelectorAll('.gallery__item'));
  var lightbox = document.getElementById('lightbox');

  if (items.length && lightbox) {
    var lbImg = document.getElementById('lbImg');
    var lbCaption = document.getElementById('lbCaption');
    var lbCount = document.getElementById('lbCount');
    var lbClose = document.getElementById('lbClose');
    var lbPrev = document.getElementById('lbPrev');
    var lbNext = document.getElementById('lbNext');
    var current = 0;
    var lastFocus = null;

    function show(i) {
      current = (i + items.length) % items.length;
      var img = items[current].querySelector('img');
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCaption.textContent = img.alt;
      lbCount.textContent = (current + 1) + ' / ' + items.length;
    }

    function open(i) {
      lastFocus = document.activeElement;
      show(i);
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      body.style.overflow = 'hidden';
      lbClose.focus();
    }

    function close() {
      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    items.forEach(function (btn, i) {
      btn.addEventListener('click', function () { open(i); });
    });

    lbClose.addEventListener('click', close);
    lbPrev.addEventListener('click', function () { show(current - 1); });
    lbNext.addEventListener('click', function () { show(current + 1); });

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) close();
    });

    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(current + 1);
      else if (e.key === 'ArrowRight') show(current - 1);
    });

    var startX = 0;
    lightbox.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
    }, { passive: true });

    lightbox.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(dx < 0 ? current + 1 : current - 1);
    });
  }

  /* ---------- السنة في الفوتر ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
