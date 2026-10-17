/* certs.js — the Certificates page: training certificates (from the trainings) and course certificates
   (every item of a package completed). Rendered with the training engine's certificate renderer, so they
   look like the certificates inside the trainings; saved as PDF through the main process. App 1.4.0. */
(function () {
  function U() { return window.UI; }
  function fetchJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }

  /* -> Promise<HTMLElement> */
  function render(c) {
    if (c.kind === 'package') {
      if (!c.config) return Promise.reject(new Error('This package does not offer a course certificate'));
      if (c.config.kind === 'web') return Promise.resolve(T.renderCertificate(Object.assign({}, c.config, { issuer: c.publisher || '', entry: 'stl://pack/' + encodeURIComponent(c.packId) + '/' + c.config.entry }), { id: c.packId, title: c.title, hours: c.hours }, { name: c.name, score: c.score, date: c.date }));
      var cfg = Object.assign({}, c.config, { issuer: c.config.issuer || c.publisher || 'Course publisher' });
      return Promise.resolve(T.renderCertificate(cfg, { id: c.packId, title: c.title, language: c.language, hours: c.hours, topicTitles: [] }, { name: c.name, score: c.score != null ? c.score : 1, date: c.date }));
    }
    var base = 'stl://pack/' + encodeURIComponent(c.packId) + '/' + c.path + '/';
    return fetchJSON(base + 'training.json').then(function (tr) {
      if (!tr.certificate) throw new Error('This training does not offer a certificate');
      var cfgP = /\.html?$/i.test(tr.certificate) ? Promise.resolve({ kind: 'web', entry: base + tr.certificate, issuer: tr.issuer || c.publisher || '' }) : fetchJSON(base + tr.certificate);
      return cfgP.then(function (cfg) {
        /* The certificate page lives at stl://app, unlike the training. Resolve a local publisher
           logo against the packaged training so format-1 and format-2 certificates render alike. */
        if (cfg.logo && !/^(data:|https?:)/i.test(cfg.logo)) cfg.logo = base + cfg.logo.replace(/^\.\//, '');
        var need = cfg.topicsList ? Promise.all((tr.topics || []).map(function (f) { return fetchJSON(base + 'topics/' + f).then(function (t) { return t.title; }).catch(function () { return ''; }); })) : Promise.resolve([]);
        return need.then(function (titles) {
          tr.topicTitles = titles;
          return T.renderCertificate(cfg, tr, { name: c.name, score: c.score != null ? c.score : 1, date: c.date });
        });
      });
    });
  }

  function view(c) {
    var el = U().el;
    var holder = el('div.cert-view', null, [el('p.muted', { text: 'Loading…' })]);
    var m = U().modal(c.kind === 'package' ? 'Course certificate' : 'Training certificate', [holder], [
      c.kind === 'training' && c.format === 1 ? el('a.btn', { href: '#/pack/' + encodeURIComponent(c.packId) + '/' + encodeURIComponent(c.itemId) + '/certificate', text: 'Open in the training', onclick: function () { m.close(); } }) : null,
      el('button.btn', { type: 'button', text: '⎙ Print', onclick: function () { if (holder.querySelector('iframe')) U().api.certs.document(c, 'print').catch(function (e) { U().toast(e.message, true); }); else printing(holder, function () { window.print(); }); } }),
      el('button.btn.primary', { type: 'button', text: '⇩ Save as PDF', onclick: function () {
        if (holder.querySelector('iframe')) { U().api.certs.document(c, 'pdf').then(function (f) { if (f) U().toast('Saved: ' + f); }).catch(function (e) { U().toast(e.message, true); }); return; }
        printing(holder, function () { return U().api.app.savePdf(c.title + ' — ' + c.name).then(function (f) { if (f) U().toast('Saved: ' + f); }); });
      } }),
      el('button.btn', { type: 'button', text: 'Close', onclick: function () { m.close(); } })]);
    m.box.classList.add('cert-modal');
    render(c).then(function (node) { T.clear(holder).appendChild(node); }).catch(function (e) { T.clear(holder).appendChild(el('p.ui-error', { text: 'Could not show the certificate: ' + e.message })); });
  }
  /* show only the certificate while printing */
  function printing(holder, fn) {
    var cert = holder.querySelector('.certificate'); if (!cert) return;
    var pr = document.getElementById('print-root') || document.body.appendChild(U().el('div#print-root'));
    T.clear(pr).appendChild(cert.cloneNode(true));
    document.body.classList.add('print-cert');
    var done = function () { document.body.classList.remove('print-cert'); T.clear(pr); };
    try { var r = fn(); if (r && r.then) r.then(done, function (e) { done(); U().toast(e.message, true); }); else setTimeout(done, 500); } catch (e) { done(); }
  }

  function page(main) {
    var el = U().el;
    var pg = el('div.ui-page'); main.appendChild(pg);
    pg.appendChild(el('div.ui-head', null, [el('div', null, [el('h1', { text: 'Certificates' }), el('p.sub', { text: 'Training certificates and course certificates offered by their publishers.' })])]));
    U().api.certs.list().then(function (list) {
      if (!list.length) {
        pg.appendChild(el('div.empty', null, [el('div', { style: { fontSize: '3rem' }, text: '🏅' }), el('h2', { text: 'No certificates yet' }),
          el('p', { text: 'Training and course certificates are optional. Complete the required items to earn a certificate when its author offers one. A course certificate is available only when its publisher has included one.' }), el('a.btn', { href: '#/library', text: '← Library' })]));
        return;
      }
      var grid = el('div.grid.cert-grid');
      list.forEach(function (c) {
        grid.appendChild(el('button.cert-card.k-' + c.kind, { type: 'button', onclick: function () { view(c); } }, [
          el('div.cert-mini', null, [el('div.cm-seal', { text: c.kind === 'package' ? '🏆' : '🏅' }), el('div.cm-kind', { text: c.kind === 'package' ? 'Course certificate' : 'Training certificate' })]),
          el('div.pack-body', null, [el('h3', { text: c.title }), el('div.meta', { text: (c.kind === 'training' ? c.packTitle + ' · ' : (c.items ? c.items + ' items · ' : '')) + U().fmtDate(c.date) }),
            el('div.meta', { text: c.name + (c.score != null && c.kind === 'training' ? ' · score ' + Math.round(c.score * 100) + '%' : '') }),
            el('span.btn.small', { text: 'View · Save as PDF' })])]));
      });
      pg.appendChild(grid);
    }).catch(function (e) { pg.appendChild(el('p.ui-error', { text: e.message })); });
  }

  window.CertsUI = { page: page, view: view, render: render };
})();
