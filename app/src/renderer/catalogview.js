/* catalogview.js — the Catalog page (app 1.5.0): packages from the catalog sources of this computer
   (folders and catalog links, set in Settings → Application). Search, filter by publisher, status and
   content; install or update with one click (the normal verify + install dialog follows). */
(function () {
  function U() { return window.UI; }
  var STATUS = { available: ['Not installed', ''], update: ['Update available', 'going'], installed: ['Installed', 'done'], older: ['Installed (newer)', 'done'], 'needs-app': ['Needs a newer app', 'late'] };

  function sourceButtons(after) {
    var el = U().el, api = U().api;
    return [el('button.btn', { type: 'button', text: '📁 Add a folder…', onclick: function () { api.catalog.addFolder().then(function (l) { if (l) { U().toast('Folder added'); after(); } }).catch(function (e) { U().toast(e.message, true); }); } }),
      el('button.btn', { type: 'button', text: '🔗 Add a catalog link…', onclick: function () { addUrlDialog(after); } })];
  }
  function addUrlDialog(after) {
    var el = U().el;
    var url = el('input', { type: 'url', placeholder: 'https://…/catalog.json', 'aria-label': 'Catalog link' });
    var name = el('input', { type: 'text', placeholder: 'e.g. SemiTec Foundation', 'aria-label': 'Name' });
    var err = el('div.ui-error');
    var m = U().modal('Add a catalog link', [el('p.muted', { text: 'Publishers (the SemiTec Foundation, partner companies, universities) can publish their packages on a website with a catalog.json file. Paste its link.' }),
      el('label.field', null, [el('span', { text: 'Link to catalog.json' }), url]), el('label.field', null, [el('span', { text: 'Name (optional)' }), name]), err], [
      el('button.btn', { type: 'button', text: 'Cancel', onclick: function () { m.close(); } }),
      el('button.btn.primary', { type: 'button', text: 'Add', onclick: function () { U().api.catalog.addUrl(url.value.trim(), name.value.trim()).then(function () { m.close(); U().toast('Catalog link added'); after(); }).catch(function (e) { err.textContent = e.message; }); } })]);
    setTimeout(function () { url.focus(); }, 30);
  }

  function page(main) {
    var el = U().el, api = U().api;
    var pg = el('div.ui-page'); main.appendChild(pg);
    var refresh = el('button.btn', { type: 'button', text: '⟳ Refresh', onclick: function () { load(true); } });
    pg.appendChild(el('div.ui-head', null, [el('div', null, [el('h1', { text: 'Catalog' }), el('p.sub', { text: 'Course packages you can add — from the folders and catalog links of this computer.' })]), el('span.grow'),
      el('a.btn', { href: '#/settings/application', text: '⚙ Sources' }), refresh]));
    var body = el('div'); pg.appendChild(body);
    var F = { q: '', status: 'all', pub: 'any', type: 'any' };
    function load(force) {
      T.clear(body).appendChild(el('p.muted', { text: 'Looking for packages…' }));
      api.catalog.list(!!force).then(function (c) { render(c); }).catch(function (e) { T.clear(body).appendChild(el('p.ui-error', { text: e.message })); });
    }
    function render(c) {
      T.clear(body);
      if (!c.sources) {
        body.appendChild(el('div.empty', null, [el('div', { style: { fontSize: '3rem' }, text: '🛍' }), el('h2', { text: 'No catalog sources yet' }),
          el('p', { text: 'Add a folder that contains .stlp files (a shared drive, OneDrive, a USB stick) or the link of a publisher’s catalog. Every package in them appears here, ready to install.' }),
          el('div.ui-actions.center', null, sourceButtons(function () { load(true); }))]));
        return;
      }
      if (c.problems.length) body.appendChild(el('details.cat-problems', null, [el('summary', { text: '⚠ ' + c.problems.length + ' problem' + (c.problems.length > 1 ? 's' : '') + ' with the sources' }),
        el('ul', null, c.problems.map(function (p) { return el('li', { text: p.source + ': ' + p.message }); }))]));
      var list = c.entries;
      if (!list.length) { body.appendChild(el('div.empty', null, [el('h2', { text: 'No packages found' }), el('p', { text: 'The sources contain no .stlp packages yet.' })])); return; }
      var pubs = {}; list.forEach(function (e) { pubs[e.publisher || 'Unknown publisher'] = (pubs[e.publisher || 'Unknown publisher'] || 0) + 1; });
      var counts = { all: list.length, available: 0, update: 0, installed: 0 };
      list.forEach(function (e) { var k = e.status === 'older' ? 'installed' : e.status; if (counts[k] != null) counts[k]++; });
      var search = el('input.lib-search', { type: 'search', placeholder: 'Search packages, publishers, topics…', 'aria-label': 'Search the catalog' });
      search.addEventListener('input', function () { F.q = search.value; draw(); });
      var seg = el('div.seg', { role: 'tablist' });
      [['all', 'All'], ['available', 'Not installed'], ['update', 'Updates'], ['installed', 'Installed']].forEach(function (o) {
        seg.appendChild(el('button', { type: 'button', role: 'tab', 'data-k': o[0], 'aria-selected': String(F.status === o[0]), onclick: function () {
          F.status = o[0]; seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-k') === F.status)); }); draw();
        } }, [o[1], el('span.cnt', { text: String(counts[o[0]]) })]));
      });
      var pubSel = el('select', { 'aria-label': 'Publisher' }, [el('option', { value: 'any', text: 'All publishers' })].concat(Object.keys(pubs).sort().map(function (n) { return el('option', { value: n, text: n + ' (' + pubs[n] + ')', selected: F.pub === n }); })));
      pubSel.addEventListener('change', function () { F.pub = pubSel.value; draw(); });
      var typeSel = el('select', { 'aria-label': 'Contains' }, [['any', 'Any content'], ['training', 'With trainings'], ['lab', 'With labs'], ['project', 'With projects'], ['video', 'With videos'], ['schedule', 'With a study plan']].map(function (o) { return el('option', { value: o[0], text: o[1], selected: F.type === o[0] }); }));
      typeSel.addEventListener('change', function () { F.type = typeSel.value; draw(); });
      body.appendChild(el('div.lib-tools', null, [search, seg, pubSel, typeSel]));
      var grid = el('div.grid'); body.appendChild(grid);
      function draw() {
        var words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
        T.clear(grid);
        list.filter(function (e) {
          var st = e.status === 'older' ? 'installed' : e.status;
          if (F.status !== 'all' && st !== F.status) return false;
          if (F.pub !== 'any' && (e.publisher || 'Unknown publisher') !== F.pub) return false;
          if (F.type === 'schedule' ? !e.hasSchedule : F.type !== 'any' && !(e.counts || {})[F.type]) return false;
          var t = (e.text || e.title).toLowerCase();
          return words.every(function (w) { return t.indexOf(w) >= 0; });
        }).forEach(function (e) { grid.appendChild(cardOf(e)); });
        if (!grid.children.length) grid.appendChild(el('div.empty.span-all', null, [el('h2', { text: 'Nothing found' }), el('p', { text: 'No package matches the search and filters.' })]));
      }
      draw();
    }
    function cardOf(e) {
      var cv = el('div.pack-cover'); if (e.cover) cv.appendChild(el('img', { src: e.cover, alt: '' }));
      var st = STATUS[e.status] || [e.status, ''];
      var action = e.status === 'needs-app' ? el('span.muted.small', { text: 'Needs SemiTec Academy ' + e.minAppVersion + ' or newer' })
        : e.status === 'installed' || e.status === 'older' ? el('a.btn.small', { href: '#/pack/' + encodeURIComponent(e.id), text: 'Open' })
        : el('button.btn.small.primary', { type: 'button', text: e.status === 'update' ? '⇧ Update to ' + e.version : '＋ Install', onclick: function (ev) {
          ev.target.disabled = true; ev.target.textContent = e.download ? 'Downloading…' : 'Opening…';
          api.catalog.fetch(e.id).then(function (file) { ev.target.disabled = false; ev.target.textContent = e.status === 'update' ? '⇧ Update' : '＋ Install'; U().importFlow(file); })
            .catch(function (x) { ev.target.disabled = false; ev.target.textContent = 'Try again'; U().toast(x.message, true); });
        } });
      return el('div.pack-card.cat-card', null, [cv, el('div.pack-body', null, [
        el('h3', { text: e.title }),
        U().publisherLine(e.publisher, e.publisherLogo, 'v' + e.version),
        e.description ? el('div.desc', { text: e.description }) : null,
        el('div.counts', null, Object.keys(e.counts || {}).map(function (k) { return el('span.chip-s', { text: (U().ICON[k] || '') + ' ' + e.counts[k] + ' ' + (U().TYPE[k] || k).toLowerCase() + (e.counts[k] > 1 ? 's' : '') }); })),
        el('div.card-status', null, [el('span.status' + (st[1] ? '.' + st[1] : ''), { text: st[0] + (e.status === 'update' ? ' (' + e.installedVersion + ' → ' + e.version + ')' : '') }),
          el('span.muted.small', { text: (e.sourceType === 'url' ? '🔗 ' : '📁 ') + e.sourceName + (e.size ? ' · ' + U().fmtSize(e.size) : '') })]),
        el('div.cat-action', null, [action])])]);
    }
    load(false);
  }

  window.CatalogUI = { page: page, sourceButtons: sourceButtons, addUrlDialog: addUrlDialog };
})();
