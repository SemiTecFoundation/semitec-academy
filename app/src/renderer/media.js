/* media.js — players for "video" and "material" items.
   video state:    { duration, position, watched: [20 buckets 0/1], completed }
   material state: { opened, saved, completed }   (a material counts as done once it was opened, saved or visited) */
(function () {
  var el = T.el, api = window.api;
  var BUCKETS = 20;

  function fmtTime(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

  /* ---------------- video ---------------- */
  function video(o) {
    var it = o.item, host = o.host;
    var st = Object.assign({ duration: 0, position: 0, watched: [], completed: false }, o.state || {});
    var wrap = el('div.media-page');
    host.appendChild(wrap);
    if (!o.url && it.url) return linkCard(wrap, it, st, o, '🎬', 'This video is online', 'Watch in the browser');

    var v = el('video', { src: o.url, controls: true, preload: 'metadata', poster: o.poster || null, playsinline: true });
    var info = el('div.media-info');
    var bar = el('div.watch-bar');
    wrap.appendChild(el('div.video-box', null, [v]));
    wrap.appendChild(el('div.media-meta', null, [el('div', null, [el('h2', { text: it.title }), it.description ? el('p.muted', { text: it.description }) : null]), info]));
    wrap.appendChild(bar);
    var t = null;
    function pct() { return st.completed ? 100 : Math.round(100 * st.watched.filter(Boolean).length / BUCKETS); }
    function draw() {
      info.textContent = (st.completed ? '✓ Watched' : pct() + '% watched') + (st.duration ? ' · ' + fmtTime(st.duration) : '');
      T.clear(bar);
      for (var i = 0; i < BUCKETS; i++) bar.appendChild(el('i' + (st.watched[i] ? '.on' : ''), { title: fmtTime(i * st.duration / BUCKETS) }));
    }
    function persist(now) { clearTimeout(t); t = setTimeout(function () { o.save(st, pct(), st.completed); }, now ? 0 : 1500); }
    v.addEventListener('loadedmetadata', function () {
      st.duration = v.duration || 0;
      if (st.position > 2 && st.position < st.duration - 2) v.currentTime = st.position;   // resume
      draw();
    });
    v.addEventListener('timeupdate', function () {
      if (!st.duration) return;
      st.position = v.currentTime;
      if (!v.paused && !v.seeking) {
        var b = Math.min(BUCKETS - 1, Math.floor(v.currentTime / st.duration * BUCKETS));
        if (!st.watched[b]) { st.watched[b] = 1; if (!st.completed && pct() >= 90) st.completed = true; draw(); }
      }
      persist();
    });
    v.addEventListener('ended', function () { st.completed = true; st.position = 0; draw(); persist(true); });
    v.addEventListener('pause', function () { persist(true); });
    draw();
    return function () { clearTimeout(t); try { v.pause(); } catch (e) {} o.save(st, pct(), st.completed); v.removeAttribute('src'); v.load(); };
  }

  /* ---------------- other materials ---------------- */
  function material(o) {
    var it = o.item, host = o.host;
    var st = Object.assign({ opened: false, saved: false, completed: false }, o.state || {});
    function mark(k) { st[k] = true; st.completed = true; o.save(st, 100, true); }
    var kind = it.kind || 'file';
    if (!o.url && it.url) { var w = el('div.media-page'); host.appendChild(w); return linkCard(w, it, st, o, '🔗', 'Web link', 'Open in the browser'); }
    var saveBtn = el('button.btn.small', { type: 'button', text: '⇩ Save a copy…', onclick: function () {
      api.packs.saveFile(o.packId, it.id).then(function (f) { if (f) { mark('saved'); o.toast('Saved to ' + f); } }).catch(function (e) { o.toast(e.message, true); });
    } });
    var openBtn = el('button.btn.small', { type: 'button', text: '↗ Open with default app', onclick: function () {
      api.packs.openFile(o.packId, it.id).then(function () { mark('opened'); }).catch(function (e) { o.toast(e.message, true); });
    } });

    if (kind === 'pdf') {
      window.PDFView.open(host, o.url, { extraButtons: [saveBtn], onReady: function () { mark('opened'); } });
      return null;
    }
    if (kind === 'video') return video(Object.assign({}, o, { state: null }));
    if (kind === 'markdown') {
      var stop = window.MarkdownView.open({ host: host, url: o.url, title: it.title, state: o.state, finishButton: false, toast: o.toast,
        save: function (s) { s.opened = true; o.save(s, 100, true); } });
      host.querySelector('.pdfv-bar').appendChild(saveBtn);
      return stop;
    }
    var page = el('div.media-page');
    host.appendChild(page);
    var head = el('div.media-meta', null, [el('div', null, [el('h2', { text: it.title }), el('p.muted', { text: [it.description, it.file ? it.file.split('/').pop() : '', it.size ? fmtSize(it.size) : ''].filter(Boolean).join(' · ') })]),
      kind === 'file' ? null : el('div.ui-actions', null, [saveBtn])]);
    page.appendChild(head);
    if (kind === 'image') {
      var img = el('img', { src: o.url, alt: it.title });
      var box = el('div.image-box', { title: 'Click to zoom' }, [img]);
      box.addEventListener('click', function () { T.zoom.open(img.cloneNode(true)); });
      page.appendChild(box);
      mark('opened');
    } else if (kind === 'text') {
      var pre = el('pre.text-view');
      page.appendChild(el('div.text-box', null, [el('div.code-head', null, [el('span.lang', { text: it.file.split('.').pop().toUpperCase() }),
        el('button.btn.small.copy', { type: 'button', text: 'Copy', onclick: function (e) { navigator.clipboard.writeText(pre.textContent).then(function () { e.target.textContent = 'Copied'; }); } })]), pre]));
      fetch(o.url).then(function (r) { return r.text(); }).then(function (txt) {
        if (txt.length > 1048576) txt = txt.slice(0, 1048576) + '\n… (file truncated in the viewer — save a copy to see everything)';
        txt.split('\n').forEach(function (line, i) { pre.appendChild(el('span.ln', { 'data-n': i + 1, text: line + '\n' })); });
        mark('opened');
      });
    } else {
      page.appendChild(el('div.file-card', null, [el('div.big', { text: /\.zip$/i.test(it.file || '') ? '🗜' : '📎' }),
        el('p', { text: 'This file opens in another program. Save a copy to your computer, or open it directly.' }),
        el('div.ui-actions.center', null, [saveBtn, openBtn])]));
    }
    return null;
  }

  function linkCard(wrap, it, st, o, icon, label, btnText) {
    wrap.appendChild(el('div.file-card', null, [el('div.big', { text: icon }), el('h2', { text: it.title }), it.description ? el('p.muted', { text: it.description }) : null,
      el('p', null, [el('span.chip-s', { text: label }), ' ', el('code', { text: it.url })]),
      el('div.ui-actions.center', null, [el('button.btn.primary', { type: 'button', text: '↗ ' + btnText, onclick: function () {
        api.app.openExternal(it.url).then(function () { st.completed = true; st.opened = true; o.save(st, 100, true); });
      } })]),
      el('p.muted.small', { text: 'Needs an internet connection.' })]));
    return null;
  }

  window.MediaView = { video: video, material: material };
})();
