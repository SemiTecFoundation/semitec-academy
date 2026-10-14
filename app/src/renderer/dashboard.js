/* dashboard.js — the main page (app 1.5.0): greeting, numbers, continue learning, this week (Today),
   the next 14 days, my projects, latest certificates and news from the catalog. Read-only: every card
   links to the page where the work happens. */
(function () {
  function U() { return window.UI; }

  function tile(el, num, label, href, cls) {
    return el('a.dash-tile' + (cls || ''), { href: href }, [el('div.dt-num', { text: String(num) }), el('div.dt-label', { text: label })]);
  }
  function card(el, title, link, body) {
    return el('section.dash-card', null, [el('div.dc-head', null, [el('h2', { text: title }), link ? el('a.small', { href: link[0], text: link[1] }) : null]), body]);
  }
  function greet() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

  function page(main) {
    var el = U().el, api = U().api, S = U().S;
    var pg = el('div.ui-page.wide.dash'); main.appendChild(pg);
    pg.appendChild(el('div.ui-head', null, [el('div', null, [el('h1', { text: greet() + ', ' + S.user.displayName.split(' ')[0] }),
      el('p.sub', { text: new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) })]), el('span.grow'),
      el('a.btn', { href: '#/catalog', text: '🛍 Catalog' }), el('a.btn.primary', { href: '#/library', text: '📚 Library' })]));
    var tiles = el('div.dash-tiles'); pg.appendChild(tiles);
    var cols = el('div.dash-cols', null, [el('div.dash-main'), el('div.dash-side')]); pg.appendChild(cols);
    var left = cols.firstChild, right = cols.lastChild;
    var today = S.today || U().localToday();
    Promise.all([api.packs.list(), api.projects.list(), api.certs.list(), api.plan.calendar(today, window.PlanUI.addDays(today, 13)), api.catalog.sources()]).then(function (r) {
      var packs = r[0], projects = r[1], certs = r[2], evs = r[3], sources = r[4];
      var going = packs.filter(function (p) { return !p.progress.finishedAt && ((p.plan && p.plan.enrolled) || p.progress.lastActivity); });
      var finished = packs.filter(function (p) { return p.progress.finishedAt; });
      var itemsDone = packs.reduce(function (a, p) { return a + p.progress.done; }, 0);
      var myProjects = projects.filter(function (p) { return p.enrollment; });
      tiles.append(tile(el, going.length, 'courses in progress', '#/library'), tile(el, finished.length, 'courses finished', '#/library'),
        tile(el, itemsDone, 'items completed', '#/library'), tile(el, myProjects.length, myProjects.length === 1 ? 'project' : 'projects', '#/projects/mine'),
        tile(el, certs.length, certs.length === 1 ? 'certificate' : 'certificates', '#/certificates', '.gold'));

      if (!packs.length) {
        left.appendChild(el('section.dash-card.welcome', null, [el('h2', { text: 'Welcome to SemiTec Academy' }),
          el('ol', null, [el('li', null, ['Get a course package: from the ', el('a', { href: '#/catalog', text: 'Catalog' }), ' or a .stlp file (', el('a', { href: '#/library', text: 'Library' }), ' → Add).']),
            el('li', { text: 'Open the course and press 📅 Enroll — its plan goes into your calendar.' }),
            el('li', { text: 'Come back here every day: this page shows what to do this week.' })])]));
      }
      /* continue learning */
      var cont = going.slice().sort(function (a, b) { return String(b.progress.lastActivity || '').localeCompare(String(a.progress.lastActivity || '')); }).slice(0, 4);
      if (cont.length) {
        left.appendChild(card(el, 'Continue learning', ['#/library', 'All courses →'], el('div.cont-list', null, cont.map(function (p) {
          var li = p.progress.lastItem, href = '#/pack/' + encodeURIComponent(p.id) + (li ? '/' + encodeURIComponent(li.id) : '');
          var cv = el('div.cont-cover'); if (p.cover) cv.appendChild(el('img', { src: 'stl://pack/' + encodeURIComponent(p.id) + '/' + p.cover, alt: '' }));
          return el('a.cont-row', { href: href }, [cv, el('div.grow', null, [el('div.cont-title', { text: p.title }),
            el('div.muted.small', { text: li ? (U().ICON[li.type] + ' ' + li.title + (li.done ? ' · done' : li.percent ? ' · ' + li.percent + '%' : '')) : 'Not started yet' }),
            el('div.progress-line', null, [U().bar(p.progress.percent), el('span', { text: p.progress.percent + '%' })])]), el('span.btn.small.primary', { text: 'Continue' })]);
        }))));
      }
      /* this week = the Today panel */
      var tb = el('div'); left.appendChild(tb); window.PlanUI.todayPanel(tb);
      /* projects */
      if (myProjects.length) {
        left.appendChild(card(el, 'My projects', ['#/projects/mine', 'All projects →'], el('div.cont-list', null, myProjects.map(function (p) {
          return el('a.cont-row', { href: '#/pack/' + encodeURIComponent(p.packId) + '/' + encodeURIComponent(p.itemId) }, [el('div.cont-cover.proj', { text: '🎓' }),
            el('div.grow', null, [el('div.cont-title', { text: p.title }), el('div.muted.small', { text: p.finished ? 'All weeks done' : 'Week ' + Math.max(1, p.weekNow) + ' of ' + p.durationWeeks + ' · ends ' + U().day(p.end) }),
              el('div.progress-line', null, [U().bar(p.percent), el('span', { text: p.percent + '%' })])])]);
        }))));
      }
      /* next 14 days */
      var soon = evs.filter(function (e) { return e.kind !== 'topics' && e.status !== 'done'; }).slice(0, 10);
      right.appendChild(card(el, 'Next 14 days', ['#/calendar', 'Calendar →'], soon.length ? el('div.soon-list', null, soon.map(function (e) {
        return el('a.soon-row.k-' + e.kind + '.s-' + e.status, { href: e.itemId ? '#/pack/' + encodeURIComponent(e.packId) + '/' + encodeURIComponent(e.itemId) : '#/pack/' + encodeURIComponent(e.packId) }, [
          el('div.soon-date', { text: e.start <= today ? 'now' : U().dayShort(e.start) }), el('div.grow', null, [el('div.soon-title', { text: e.title }), el('div.muted.small', { text: e.packTitle + (e.end !== e.start ? ' · until ' + U().dayShort(e.end) : '') })])]);
      })) : el('p.muted', { text: 'Nothing planned. Enroll in a course or a project to get a plan.' })));
      /* certificates */
      if (certs.length) {
        right.appendChild(card(el, 'Latest certificates', ['#/certificates', 'All →'], el('div.soon-list', null, certs.slice(0, 3).map(function (c) {
          return el('a.soon-row', { href: '#/certificates' }, [el('div.soon-date', { text: c.kind === 'package' ? '🏆' : '🏅' }), el('div.grow', null, [el('div.soon-title', { text: c.title }), el('div.muted.small', { text: U().fmtDate(c.date) })])]);
        }))));
      }
      /* catalog news */
      var catBox = el('div'); right.appendChild(catBox);
      if (!sources.length) {
        catBox.appendChild(card(el, 'Catalog', ['#/settings/application', 'Add a source →'], el('p.muted', { text: 'Add a folder or a catalog link (Settings → Application) to see packages you can install.' })));
      } else {
        api.catalog.list(false).then(function (c) {
          var news = c.entries.filter(function (e) { return e.status === 'available' || e.status === 'update'; }).slice(0, 4);
          catBox.appendChild(card(el, 'From the catalog', ['#/catalog', 'Catalog →'], news.length ? el('div.soon-list', null, news.map(function (e) {
            return el('a.soon-row', { href: '#/catalog' }, [e.publisherLogo ? el('img.pub-logo', { src: e.publisherLogo, alt: '' }) : el('span.pub-logo.txt', { text: U().initials(e.publisher) }),
              el('div.grow', null, [el('div.soon-title', { text: e.title }), el('div.muted.small', { text: (e.status === 'update' ? 'Update to ' + e.version : 'New · v' + e.version) + ' · ' + e.publisher })])]);
          })) : el('p.muted', { text: 'You have everything from your catalog sources.' })));
        }).catch(function () {});
      }
    }).catch(function (e) { pg.appendChild(el('p.ui-error', { text: e.message })); });
  }

  window.DashboardUI = { page: page };
})();
