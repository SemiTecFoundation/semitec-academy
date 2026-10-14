/* blocks.js — renderers for every content block type.
   A block is a JSON object { "type": "...", ...fields }. See reference/content-format.md. */
(function () {
  var T = window.T, el = T.el;
  var B = T.blocks = {};

  function mdDiv(md, cls) { return el('div.md' + (cls ? '.' + cls : ''), { html: MD.render(md) }); }
  /* Content can be given as "md" (Markdown) or as nested "blocks". */
  function content(obj, ctx) {
    var box = el('div.content');
    if (obj.md) box.appendChild(mdDiv(obj.md));
    if (obj.blocks) obj.blocks.forEach(function (b) { box.appendChild(T.renderBlock(b, ctx)); });
    return box;
  }
  function figure(inner, caption) {
    return el('figure.fig', null, [inner, caption ? el('figcaption', { html: MD.inline(caption) }) : null]);
  }

  T.renderBlock = function (b, ctx) {
    var fn = B[b.type];
    if (!fn) return el('div.callout.warning', { html: 'Unknown block type: <code>' + MD.esc(b.type) + '</code>' });
    var node = fn(b, ctx || {});
    node.classList.add('block', 'block-' + b.type);
    return node;
  };

  /* ---------------- text & callouts ---------------- */
  B.text = function (b) { return mdDiv(b.md); };
  B.callout = function (b) {
    var kind = b.kind || 'info';
    return el('div.callout.' + kind, null, [
      b.title ? el('div.callout-title', { text: b.title }) : null, mdDiv(b.md)
    ]);
  };

  /* ---------------- image / svg with click-to-zoom ---------------- */
  B.image = function (b) {
    var img = el('img', { src: b.src, alt: b.alt || '', loading: 'lazy', style: b.width ? { maxWidth: b.width } : null });
    var wrap = el('div.media' + (b.zoom === false ? '' : '.zoomable'), { title: b.zoom === false ? null : T.L('zoomIn'), tabindex: b.zoom === false ? null : 0 }, [img]);
    if (b.zoom !== false) {
      wrap.addEventListener('click', function () { T.zoom.open(img.cloneNode(true)); });
      wrap.addEventListener('keydown', function (e) { if (e.key === 'Enter') T.zoom.open(img.cloneNode(true)); });
    }
    return figure(wrap, b.caption);
  };
  B.svg = function (b) {
    var host = el('div.svg-host', { style: b.width ? { maxWidth: b.width } : null });
    var wrap = el('div.media' + (b.zoom === false ? '' : '.zoomable'), { tabindex: 0 }, [host]);
    var bar = null, playing = true;
    if (b.controls) {
      var btn = el('button.btn.small', { type: 'button', text: T.L('pause') });
      btn.addEventListener('click', function (e) {
        e.stopPropagation(); playing = !playing;
        host.classList.toggle('paused', !playing);
        btn.textContent = playing ? T.L('pause') : T.L('play');
      });
      bar = el('div.media-bar', null, [btn]);
    }
    T.inlineSVG(host, b.src);
    if (b.zoom !== false) wrap.addEventListener('click', function () { T.zoom.open(host.firstElementChild ? host.firstElementChild.cloneNode(true) : null); });
    return figure(el('div', null, [wrap, bar]), b.caption);
  };

  /* ---------------- before / after comparison slider ---------------- */
  B.compare = function (b) {
    var after = el('img', { src: b.after, alt: (b.labels || [])[1] || '' });
    var before = el('img', { src: b.before, alt: (b.labels || [])[0] || '' });
    var top = el('div.cmp-top', null, [before]);
    var range = el('input.cmp-range', { type: 'range', min: 0, max: 100, value: 50, 'aria-label': 'compare' });
    var box = el('div.compare', null, [after, top, el('div.cmp-line'), range,
      el('span.cmp-label.l', { text: (b.labels || ['Before'])[0] }), el('span.cmp-label.r', { text: (b.labels || [, 'After'])[1] })]);
    function set(v) { top.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)'; box.style.setProperty('--pos', v + '%'); }
    range.addEventListener('input', function () { set(range.value); });
    set(50);
    return figure(box, b.caption);
  };

  /* ---------------- click to expand ---------------- */
  B.accordion = function (b, ctx) {
    var box = el('div.accordion');
    (b.items || []).forEach(function (it, i) {
      var body = el('div.acc-body', null, [content(it, ctx)]);
      var head = el('button.acc-head', { type: 'button', 'aria-expanded': it.open ? 'true' : 'false' }, [
        el('span.acc-title', { text: it.title }), el('span.chev', { 'aria-hidden': 'true' })]);
      var item = el('div.acc-item' + (it.open ? '.open' : ''), null, [head, body]);
      head.addEventListener('click', function () {
        var open = !item.classList.contains('open');
        if (b.single) box.querySelectorAll('.acc-item.open').forEach(function (o) { o.classList.remove('open'); o.firstChild.setAttribute('aria-expanded', 'false'); });
        item.classList.toggle('open', open); head.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      box.appendChild(item);
    });
    return box;
  };

  /* ---------------- tabs ---------------- */
  B.tabs = function (b, ctx) {
    var bar = el('div.tab-bar', { role: 'tablist' }), panels = el('div.tab-panels');
    (b.tabs || []).forEach(function (t, i) {
      var id = T.uid('tab');
      var btn = el('button.tab', { type: 'button', role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false', 'aria-controls': id, text: t.label });
      var panel = el('div.tab-panel', { id: id, role: 'tabpanel', hidden: i !== 0 }, [content(t, ctx)]);
      btn.addEventListener('click', function () {
        bar.querySelectorAll('.tab').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
        panels.querySelectorAll('.tab-panel').forEach(function (x) { x.hidden = true; });
        btn.setAttribute('aria-selected', 'true'); panel.hidden = false;
      });
      bar.appendChild(btn); panels.appendChild(panel);
    });
    return el('div.tabs', null, [bar, panels]);
  };

  /* ---------------- flip cards ---------------- */
  B.flipcards = function (b) {
    var grid = el('div.flipgrid');
    (b.cards || []).forEach(function (c) {
      var card = el('button.flipcard', { type: 'button', 'aria-pressed': 'false', title: T.L('tapToFlip') }, [
        el('div.flip-inner', null, [el('div.flip-front', { html: MD.render(c.front) }), el('div.flip-back', { html: MD.render(c.back) })])]);
      card.addEventListener('click', function () { var f = card.classList.toggle('flipped'); card.setAttribute('aria-pressed', f); });
      grid.appendChild(card);
    });
    return el('div', null, [b.md ? mdDiv(b.md) : null, grid]);
  };

  /* ---------------- click a picture to reveal explanations (hotspots) ---------------- */
  B.reveal = function (b) {
    var stage = el('div.reveal-stage');
    var pic = /\.svg$|^data:image\/svg/.test(b.src) ? el('div.svg-host') : el('img', { src: b.src, alt: b.alt || '' });
    if (pic.tagName === 'DIV') T.inlineSVG(pic, b.src);
    stage.appendChild(pic);
    var panel = el('div.reveal-panel', { html: '<p class="muted">' + MD.esc(b.hint || T.L('clickSpots')) + '</p>' });
    (b.spots || []).forEach(function (s, i) {
      var spot = el('button.spot' + (/^(tr|bl|br|tl)$/.test(s.badge || '') ? '.badge-' + s.badge : ''), { type: 'button', 'aria-label': s.title, style: { left: s.x + '%', top: s.y + '%', width: s.w + '%', height: s.h + '%' } },
        [el('span.spot-num', { text: s.label || String(i + 1) })]);
      spot.addEventListener('click', function () {
        stage.querySelectorAll('.spot').forEach(function (x) { x.classList.remove('active'); });
        spot.classList.add('active'); spot.classList.add('seen');
        panel.innerHTML = '<h4>' + MD.esc(s.title) + '</h4>' + MD.render(s.md);
      });
      stage.appendChild(spot);
    });
    /* picture full width with the explanation under it; "layout": "side" puts the explanation next to it */
    return figure(el('div.reveal' + (b.layout === 'side' ? '.side' : ''), null, [stage, panel]), b.caption);
  };

  /* ---------------- step machinery shared by scrolly and stepper ----------------
     In the SVG, give elements data-step="n" (visible from step n on) and optionally
     data-until="m" (hidden after step m). The element of the current step gets the
     class "st-current" (highlighted), earlier ones "st-past", later ones "st-hidden". */
  T.setStep = function (root, k) {
    if (!root) return;
    root.querySelectorAll('[data-step]').forEach(function (n) {
      var s = +n.getAttribute('data-step'), u = n.hasAttribute('data-until') ? +n.getAttribute('data-until') : Infinity;
      var hidden = s > k || k > u;
      n.classList.toggle('st-hidden', hidden);
      n.classList.toggle('st-current', !hidden && s === k);
      n.classList.toggle('st-past', !hidden && s < k);
    });
    root.setAttribute('data-active-step', k);
  };

  /* ---------------- scroll and learn (sticky picture + scrolling steps) ---------------- */
  B.scrolly = function (b) {
    var host = el('div.svg-host');
    var sticky = el('div.scrolly-visual', null, [host]);
    var steps = el('div.scrolly-steps');
    var svgReady = T.inlineSVG(host, b.src).then(function () { T.setStep(host, 1); });
    (b.steps || []).forEach(function (s, i) {
      var st = el('div.scrolly-step', { 'data-k': i + 1 }, [
        el('div.step-num', { text: T.L('step') + ' ' + (i + 1) }), s.title ? el('h4', { text: s.title }) : null, mdDiv(s.md)]);
      steps.appendChild(st);
    });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            steps.querySelectorAll('.scrolly-step').forEach(function (x) { x.classList.remove('active'); });
            e.target.classList.add('active');
            svgReady.then(function () { T.setStep(host, +e.target.getAttribute('data-k')); });
          }
        });
      }, { rootMargin: '-45% 0px -45% 0px' });
      setTimeout(function () { steps.querySelectorAll('.scrolly-step').forEach(function (x) { io.observe(x); }); }, 0);
    }
    return el('div.scrolly', null, [sticky, steps]);
  };

  /* ---------------- step-by-step animation with controls ---------------- */
  B.stepper = function (b) {
    var host = el('div.svg-host'), cap = el('div.stepper-caption');
    var n = (b.steps || []).length, k = 1, timer = null;
    var counter = el('span.step-counter');
    var prev = el('button.btn.small', { type: 'button', text: '‹ ' + T.L('stepPrev') });
    var next = el('button.btn.small', { type: 'button', text: T.L('stepNext') + ' ›' });
    var play = el('button.btn.small.primary', { type: 'button', text: '▶ ' + T.L('play') });
    function show() {
      T.setStep(host, k);
      var s = b.steps[k - 1] || {};
      cap.innerHTML = (s.title ? '<strong>' + MD.esc(s.title) + '.</strong> ' : '') + MD.inline(s.md || '');
      counter.textContent = k + ' / ' + n;
      prev.disabled = k <= 1; next.disabled = k >= n;
    }
    function stop() { clearInterval(timer); timer = null; play.textContent = '▶ ' + T.L('play'); }
    prev.addEventListener('click', function () { stop(); if (k > 1) { k--; show(); } });
    next.addEventListener('click', function () { stop(); if (k < n) { k++; show(); } });
    play.addEventListener('click', function () {
      if (timer) return stop();
      if (k >= n) k = 0;
      play.textContent = '❚❚ ' + T.L('pause');
      timer = setInterval(function () { if (k >= n) return stop(); k++; show(); }, b.interval || 1600);
      if (k === 0) { k = 1; show(); }
    });
    T.inlineSVG(host, b.src).then(show);
    /* controls sit directly under the picture, so they never move when the step text gets longer or shorter */
    var media = el('div.media', null, [host]);
    media.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') next.click(); else if (e.key === 'ArrowLeft') prev.click(); });
    media.tabIndex = 0;
    return figure(el('div.stepper', null, [media, el('div.stepper-bar', null, [prev, play, next, counter]), cap]), b.caption);
  };

  /* ---------------- drag & drop helpers (mouse, touch via tap-to-place, keyboard via arrows) ---------------- */
  T.dnd = {};
  /* Sortable list: items are <li> with data-id. Returns getter of current order. */
  T.dnd.sortable = function (list) {
    var dragging = null;
    function addArrows(li) {
      var up = el('button.mini', { type: 'button', 'aria-label': 'up', text: '▲' });
      var dn = el('button.mini', { type: 'button', 'aria-label': 'down', text: '▼' });
      up.addEventListener('click', function () { if (li.previousElementSibling) list.insertBefore(li, li.previousElementSibling); list.dispatchEvent(new Event('change')); });
      dn.addEventListener('click', function () { if (li.nextElementSibling) list.insertBefore(li.nextElementSibling, li); list.dispatchEvent(new Event('change')); });
      li.appendChild(el('span.arrows', null, [up, dn]));
    }
    list.querySelectorAll('li').forEach(function (li) {
      li.draggable = true; addArrows(li);
      li.addEventListener('dragstart', function (e) { dragging = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', li.dataset.id); } catch (x) {} });
      li.addEventListener('dragend', function () { li.classList.remove('dragging'); dragging = null; list.dispatchEvent(new Event('change')); });
    });
    list.addEventListener('dragover', function (e) {
      if (!dragging) return; e.preventDefault();
      var after = null;
      list.querySelectorAll('li:not(.dragging)').forEach(function (c) {
        var r = c.getBoundingClientRect();
        if (after === null && e.clientY < r.top + r.height / 2) after = c;
      });
      if (after) list.insertBefore(dragging, after); else list.appendChild(dragging);
    });
    return function () { return [].map.call(list.querySelectorAll('li'), function (li) { return li.dataset.id; }); };
  };
  /* Buckets: chips (data-id) can be dragged or tap-placed into zones (data-zone). */
  T.dnd.buckets = function (root) {
    var selected = null;
    function select(chip) {
      root.querySelectorAll('.chip.selected').forEach(function (c) { c.classList.remove('selected'); });
      selected = chip; if (chip) chip.classList.add('selected');
    }
    root.querySelectorAll('.chip').forEach(function (chip) {
      chip.draggable = true;
      chip.addEventListener('dragstart', function (e) { select(chip); try { e.dataTransfer.setData('text/plain', chip.dataset.id); } catch (x) {} });
      chip.addEventListener('click', function (e) { e.stopPropagation(); if (root.classList.contains('locked')) return; select(selected === chip ? null : chip); });
    });
    root.querySelectorAll('[data-zone]').forEach(function (zone) {
      var drop = zone.querySelector('.zone-items') || zone;
      zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
      zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('over'); if (selected) { drop.appendChild(selected); select(null); root.dispatchEvent(new Event('change')); } });
      zone.addEventListener('click', function () { if (selected && !root.classList.contains('locked')) { drop.appendChild(selected); select(null); root.dispatchEvent(new Event('change')); } });
    });
    return function () {
      var map = {};
      root.querySelectorAll('[data-zone]').forEach(function (z) {
        z.querySelectorAll('.chip').forEach(function (c) { map[c.dataset.id] = z.getAttribute('data-zone'); });
      });
      return map;
    };
  };

  /* ---------------- learning activity: put in order ---------------- */
  B.sort = function (b) {
    var items = (b.items || []).map(function (t, i) { return { id: String(i), text: t }; });
    var shuffled = T.shuffle(items);
    if (shuffled.every(function (x, i) { return x.id === String(i); }) && items.length > 1) shuffled.reverse();
    var list = el('ol.sortlist', null, shuffled.map(function (it) { return el('li', { 'data-id': it.id }, [el('span.grip', { 'aria-hidden': 'true', text: '⋮⋮' }), el('span.li-text', { html: MD.inline(it.text) })]); }));
    var get = T.dnd.sortable(list);
    var msg = el('div.activity-msg');
    var btn = el('button.btn.primary', { type: 'button', text: T.L('check') });
    btn.addEventListener('click', function () {
      var ok = true;
      get().forEach(function (id, pos) {
        var li = list.querySelector('li[data-id="' + id + '"]'); var good = +id === pos;
        li.classList.toggle('good', good); li.classList.toggle('bad', !good); ok = ok && good;
      });
      msg.className = 'activity-msg ' + (ok ? 'good' : 'bad'); msg.textContent = ok ? T.L('wellDone') : T.L('tryAgain');
    });
    list.addEventListener('change', function () { list.querySelectorAll('li').forEach(function (li) { li.classList.remove('good', 'bad'); }); msg.textContent = ''; });
    return el('div.activity', null, [b.prompt ? mdDiv(b.prompt, 'prompt') : null, el('p.hint', { text: T.L('orderHint') }), list, el('div.activity-bar', null, [btn, msg])]);
  };

  /* ---------------- learning activity: sort into groups ---------------- */
  B.categorize = function (b) {
    var root = el('div.buckets');
    var pool = el('div.pool', { 'data-zone': '' }, [el('div.zone-title', { text: T.L('unplaced') }), el('div.zone-items')]);
    T.shuffle((b.items || []).map(function (it, i) { return { id: String(i), it: it }; })).forEach(function (x) {
      pool.lastChild.appendChild(el('span.chip', { 'data-id': x.id, tabindex: 0, html: MD.inline(x.it.text) }));
    });
    var zones = el('div.zones', null, (b.categories || []).map(function (c) {
      return el('div.zone', { 'data-zone': c.id }, [el('div.zone-title', { text: c.label }), el('div.zone-items')]);
    }));
    root.appendChild(pool); root.appendChild(zones);
    var get = T.dnd.buckets(root);
    var msg = el('div.activity-msg');
    var btn = el('button.btn.primary', { type: 'button', text: T.L('check') });
    btn.addEventListener('click', function () {
      var map = get(), ok = true;
      (b.items || []).forEach(function (it, i) {
        var chip = root.querySelector('.chip[data-id="' + i + '"]'); var good = map[String(i)] === it.category;
        chip.classList.toggle('good', good); chip.classList.toggle('bad', !good); ok = ok && good;
      });
      msg.className = 'activity-msg ' + (ok ? 'good' : 'bad'); msg.textContent = ok ? T.L('wellDone') : T.L('tryAgain');
    });
    root.addEventListener('change', function () { root.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('good', 'bad'); }); msg.textContent = ''; });
    return el('div.activity', null, [b.prompt ? mdDiv(b.prompt, 'prompt') : null, el('p.hint', { text: T.L('matchHint') }), root, el('div.activity-bar', null, [btn, msg])]);
  };

  /* ---------------- code ---------------- */
  B.code = function (b) {
    var pre = el('pre', null, [el('code', { text: b.code || '' })]);
    var copy = el('button.btn.small.copy', { type: 'button', text: T.L('copy') });
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = T.L('copied'); setTimeout(function () { copy.textContent = T.L('copy'); }, 1200); };
      if (navigator.clipboard) navigator.clipboard.writeText(b.code || '').then(done, done); else done();
    });
    return figure(el('div.codebox', null, [el('div.code-head', null, [el('span.lang', { text: b.language || '' }), copy]), pre]), b.caption);
  };

  /* ---------------- table ---------------- */
  B.table = function (b) {
    var t = el('table.tbl', null, [
      el('thead', null, [el('tr', null, (b.columns || []).map(function (c) { return el('th', { html: MD.inline(c) }); }))]),
      el('tbody', null, (b.rows || []).map(function (r) { return el('tr', null, r.map(function (c) { return el('td', { html: MD.inline(String(c)) }); })); }))
    ]);
    return figure(el('div.tbl-wrap', null, [t]), b.caption);
  };

  /* ---------------- video (local file or embeddable URL) ---------------- */
  B.video = function (b) {
    var v = /\.(mp4|webm|ogg)$/i.test(b.src)
      ? el('video', { src: b.src, controls: true, preload: 'metadata' })
      : el('iframe', { src: b.src, title: b.caption || 'video', allowfullscreen: true, loading: 'lazy' });
    return figure(el('div.video-wrap', null, [v]), b.caption);
  };

  /* ---------------- zoom / pan lightbox ---------------- */
  T.zoom = (function () {
    var ov, stage, holder, scale = 1, tx = 0, ty = 0, drag = null;
    function apply() { holder.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
    function set(s) { scale = Math.max(0.5, Math.min(8, s)); apply(); }
    function build() {
      holder = el('div.zoom-holder');
      stage = el('div.zoom-stage', null, [holder]);
      var bar = el('div.zoom-bar', null, [
        el('button.btn.small', { type: 'button', text: '+', title: T.L('zoomIn'), onclick: function () { set(scale * 1.4); } }),
        el('button.btn.small', { type: 'button', text: '−', title: T.L('zoomOut'), onclick: function () { set(scale / 1.4); } }),
        el('button.btn.small', { type: 'button', text: T.L('zoomReset'), onclick: function () { scale = 1; tx = ty = 0; apply(); } }),
        el('button.btn.small', { type: 'button', text: '✕ ' + T.L('close'), onclick: close })]);
      ov = el('div.zoom-overlay', { role: 'dialog', 'aria-modal': 'true' }, [stage, bar]);
      stage.addEventListener('wheel', function (e) { e.preventDefault(); set(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
      stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX - tx, y: e.clientY - ty }; stage.setPointerCapture(e.pointerId); });
      stage.addEventListener('pointermove', function (e) { if (drag) { tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); } });
      stage.addEventListener('pointerup', function () { drag = null; });
      stage.addEventListener('dblclick', function () { set(scale < 2 ? 2.5 : 1); if (scale === 1) { tx = ty = 0; apply(); } });
      document.addEventListener('keydown', function (e) { if (ov.classList.contains('open') && e.key === 'Escape') close(); });
      document.body.appendChild(ov);
    }
    function open(node) {
      if (!node) return;
      if (!ov) build();
      T.clear(holder).appendChild(node);
      scale = 1; tx = ty = 0; apply();
      ov.classList.add('open'); document.body.classList.add('no-scroll');
    }
    function close() { ov.classList.remove('open'); document.body.classList.remove('no-scroll'); }
    return { open: open, close: close };
  })();
})();
