/* quiz.js — end-of-topic quiz: single / multiple choice, order, match (drag to groups), hotspot.
   Each question may list "review": [subsection ids] to send the student back to on a wrong answer. */
(function () {
  var T = window.T, el = T.el;

  function opts(q) { return (q.options || []).map(function (o, i) { return { i: i, text: typeof o === 'string' ? o : o.text }; }); }
  function sameSet(a, b) { a = a.map(String).sort(); b = b.map(String).sort(); return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

  /* Each builder returns { node, get(), lock(), correct() } */
  var Q = {};
  Q.single = Q.truefalse = function (q, name) { return choice(q, name, false); };
  Q.multiple = function (q, name) { return choice(q, name, true); };
  function choice(q, name, multi) {
    var list = el('div.q-options');
    var o = q.shuffle === false ? opts(q) : T.shuffle(opts(q));
    o.forEach(function (op) {
      var input = el('input', { type: multi ? 'checkbox' : 'radio', name: name, value: op.i });
      list.appendChild(el('label.q-option', null, [input, el('span', { html: MD.inline(op.text) })]));
    });
    return {
      node: el('div', null, [el('p.hint', { text: multi ? T.L('selectMany') : T.L('selectOne') }), list]),
      get: function () { return [].filter.call(list.querySelectorAll('input'), function (x) { return x.checked; }).map(function (x) { return +x.value; }); },
      check: function (v) { return sameSet(v, q.correct || []); },
      lock: function () { list.querySelectorAll('input').forEach(function (x) { x.disabled = true; }); },
      showCorrect: function () { list.querySelectorAll('input').forEach(function (x) { if ((q.correct || []).indexOf(+x.value) >= 0) x.parentNode.classList.add('is-correct'); }); }
    };
  }
  Q.order = function (q) {
    var items = (q.items || []).map(function (t, i) { return { id: String(i), text: t }; });
    var s = T.shuffle(items); if (s.every(function (x, i) { return x.id === String(i); }) && s.length > 1) s.reverse();
    var list = el('ol.sortlist', null, s.map(function (it) { return el('li', { 'data-id': it.id }, [el('span.grip', { text: '⋮⋮' }), el('span.li-text', { html: MD.inline(it.text) })]); }));
    var get = T.dnd.sortable(list);
    return {
      node: el('div', null, [el('p.hint', { text: T.L('orderHint') }), list]),
      get: get,
      check: function (v) { return v.every(function (id, i) { return +id === i; }); },
      lock: function () { list.classList.add('locked'); list.querySelectorAll('li').forEach(function (li) { li.draggable = false; }); list.querySelectorAll('button').forEach(function (b) { b.disabled = true; }); },
      showCorrect: function () {}
    };
  };
  Q.match = function (q) {
    var root = el('div.buckets');
    var pool = el('div.pool', { 'data-zone': '' }, [el('div.zone-title', { text: T.L('unplaced') }), el('div.zone-items')]);
    T.shuffle((q.items || []).map(function (it, i) { return { id: String(i), it: it }; })).forEach(function (x) {
      pool.lastChild.appendChild(el('span.chip', { 'data-id': x.id, tabindex: 0, html: MD.inline(x.it.text) }));
    });
    root.appendChild(pool);
    root.appendChild(el('div.zones', null, (q.categories || []).map(function (c) {
      return el('div.zone', { 'data-zone': c.id }, [el('div.zone-title', { text: c.label }), el('div.zone-items')]);
    })));
    var get = T.dnd.buckets(root);
    return {
      node: el('div', null, [el('p.hint', { text: T.L('matchHint') }), root]),
      get: get,
      check: function (map) { return (q.items || []).every(function (it, i) { return map[String(i)] === it.category; }); },
      lock: function () { root.classList.add('locked'); root.querySelectorAll('.chip').forEach(function (c) { c.draggable = false; }); },
      showCorrect: function () {}
    };
  };
  Q.hotspot = function (q) {
    var stage = el('div.reveal-stage.hotspot-q');
    var pic = /\.svg$|^data:image\/svg/.test(q.src) ? el('div.svg-host') : el('img', { src: q.src, alt: '' });
    if (pic.tagName === 'DIV') T.inlineSVG(pic, q.src);
    stage.appendChild(pic);
    var chosen = {};
    (q.spots || []).forEach(function (s) {
      var b = el('button.spot.pick', { type: 'button', 'aria-pressed': 'false', 'aria-label': s.label || s.id, style: { left: s.x + '%', top: s.y + '%', width: s.w + '%', height: s.h + '%' } }, [s.label ? el('span.spot-num', { text: s.label }) : null]);
      b.addEventListener('click', function () {
        if (stage.classList.contains('locked')) return;
        chosen[s.id] = !chosen[s.id]; b.classList.toggle('chosen', chosen[s.id]); b.setAttribute('aria-pressed', chosen[s.id]);
      });
      b.dataset.id = s.id; stage.appendChild(b);
    });
    return {
      node: el('div', null, [el('p.hint', { text: T.L('hotspotHint') }), stage]),
      get: function () { return Object.keys(chosen).filter(function (k) { return chosen[k]; }); },
      check: function (v) { return sameSet(v, q.correct || []); },
      lock: function () { stage.classList.add('locked'); },
      showCorrect: function () { stage.querySelectorAll('.spot').forEach(function (b) { if ((q.correct || []).indexOf(b.dataset.id) >= 0) b.classList.add('is-correct'); }); }
    };
  };

  /* ---------------- quiz card ----------------
     opts: { topic, threshold, showCorrect: 'never'|'afterPass'|'always', passedBefore, onResult(result), onPass(score, bar), onReview(subId), subTitle(subId) } */
  T.renderQuiz = function (quiz, o) {
    var card = el('section.quiz', { id: 'quiz-' + o.topic.id });
    var thr = quiz.passThreshold != null ? quiz.passThreshold : o.threshold;
    function build(fromRetry) {
      T.clear(card);
      card.appendChild(el('div.quiz-head', null, [el('span.quiz-badge', { text: T.L('quiz') }), el('h3', { text: quiz.title || o.topic.title })]));
      card.appendChild(el('p.muted', { text: T.L('quizIntro', { threshold: Math.round(thr * 100) + '%' }) }));
      if (o.passedBefore && !fromRetry) {
        card.appendChild(el('div.quiz-result.pass', null, [el('strong', { text: T.L('passed') + ' — ' + T.L('score') + ': ' + Math.round(o.passedBefore.score * 100) + '%' })]));
      }
      var qs = (quiz.questions || []).map(function (q, i) {
        var w = (Q[q.type] || Q.single)(q, T.uid('q'));
        var box = el('div.question', { 'data-type': q.type }, [
          el('div.q-text', null, [el('span.q-num', { text: (i + 1) + '.' }), el('span', { html: MD.inline(q.text) })]),
          q.image ? el('img.q-img', { src: q.image, alt: '' }) : null,
          w.node, el('div.q-feedback')]);
        card.appendChild(box);
        return { q: q, w: w, box: box };
      });
      var result = el('div.quiz-result');
      var submit = el('button.btn.primary', { type: 'button', text: T.L('submit') });
      card.appendChild(el('div.quiz-bar', null, [submit]));
      card.appendChild(result);
      submit.addEventListener('click', function () {
        var good = 0, review = [];
        qs.forEach(function (x) {
          var ok = x.w.check(x.w.get());
          if (ok) good++; else (x.q.review || []).forEach(function (r) { if (review.indexOf(r) < 0) review.push(r); });
          x.box.classList.add(ok ? 'q-good' : 'q-bad');
          x.w.lock();
          var fb = x.box.querySelector('.q-feedback');
          fb.innerHTML = '<strong>' + (ok ? '✓ ' + T.L('correct') : '✗ ' + T.L('incorrect')) + '</strong>' + (ok && x.q.explain ? ' — ' + MD.inline(x.q.explain) : '');
          x.ok = ok;
        });
        var score = qs.length ? good / qs.length : 1, pass = score >= thr - 1e-9;
        if (o.onResult) o.onResult({ score: score, passed: pass, correct: good, total: qs.length, threshold: thr,
          wrong: qs.filter(function (x) { return !x.ok; }).map(function (x, k) { return x.q.id || ('q' + (qs.indexOf(x) + 1)); }) });
        submit.remove();
        result.className = 'quiz-result ' + (pass ? 'pass' : 'fail');
        result.appendChild(el('div.result-line', null, [el('strong', { text: (pass ? '✓ ' + T.L('passed') : '✗ ' + T.L('failed')) }), el('span', { text: '  ' + T.L('score') + ': ' + good + ' / ' + qs.length + ' (' + Math.round(score * 100) + '%)' })]));
        var show = o.showCorrect === 'always' || (o.showCorrect !== 'never' && pass);
        if (show) qs.forEach(function (x) {
          if (!x.ok) { x.w.showCorrect(); if (x.q.explain) x.box.querySelector('.q-feedback').innerHTML += ' — ' + MD.inline(x.q.explain); }
        });
        if (!pass && review.length) {
          result.appendChild(el('p', { text: T.L('review') }));
          result.appendChild(el('ul.review-list', null, review.map(function (r) {
            return el('li', null, [el('a', { href: '#', text: o.subTitle(r), onclick: function (e) { e.preventDefault(); o.onReview(r); } })]);
          })));
        }
        var bar = el('div.quiz-bar');
        if (!pass) bar.appendChild(el('button.btn.primary', { type: 'button', text: '↻ ' + T.L('retry'), onclick: function () { build(true); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
        result.appendChild(bar);
        if (pass) o.onPass(score, bar);
      });
    }
    build(false);
    return card;
  };
})();
