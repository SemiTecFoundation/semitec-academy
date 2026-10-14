/* progress.js — learning progress: one JSON "state" object, saved through an adapter.
   Adapters:  local (browser localStorage) · none (preview, nothing saved) ·
              rest (GET/PUT a URL of your platform) · postMessage (parent page saves it) ·
              custom (your own {load, save} object in window.TRAINING_CONFIG.adapter).
   The state format is documented in INTEGRATION.md ("State format"). */
(function () {
  var T = window.T;
  var P = T.progress = { state: null, adapter: null, cfg: null, tr: null };
  var MAX_ATTEMPTS = 20;

  function now() { return new Date().toISOString(); }
  function blank(tr, user) {
    return {
      schema: 1, trainingId: tr.id, trainingVersion: tr.version || '', user: user || null,
      startedAt: now(), updatedAt: now(), completedAt: null, percent: 0, last: '',
      topics: {}, certificate: null
    };
  }
  /* Accepts older / partial states and returns a valid schema-1 state (or null). */
  function normalize(s, tr, user) {
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = null; } }
    if (!s || typeof s !== 'object') return null;
    if (!s.schema) { /* first template version: { passed: {id: {score, date}}, name } */
      var n = blank(tr, user);
      Object.keys(s.passed || {}).forEach(function (id) {
        var p = s.passed[id];
        n.topics[id] = { visited: [], passed: true, score: p.score, bestScore: p.score, passedAt: p.date, attempts: [] };
      });
      if (s.name) n.certificate = { name: s.name };
      return n;
    }
    s.topics = s.topics || {};
    if (user) s.user = Object.assign({}, s.user || {}, user);
    return s;
  }
  function fill(str, tr, user) {
    return String(str || '').replace(/\{trainingId\}/g, encodeURIComponent(tr.id)).replace(/\{userId\}/g, encodeURIComponent((user && user.id) || 'anonymous'));
  }

  /* ---------------- adapters ---------------- */
  var A = {};
  A.none = { load: function () { return Promise.resolve(null); }, save: function () { return Promise.resolve(); } };
  A.local = {
    key: function () { return 'training:' + P.tr.id + ':progress' + (P.cfg.user && P.cfg.user.id ? ':' + P.cfg.user.id : ''); },
    load: function () {
      try {
        var s = localStorage.getItem(this.key());
        if (!s) s = localStorage.getItem('training:' + P.tr.id); /* template v1 key */
        return Promise.resolve(s ? JSON.parse(s) : null);
      } catch (e) { return Promise.resolve(null); }
    },
    save: function (state) { try { localStorage.setItem(this.key(), JSON.stringify(state)); } catch (e) {} return Promise.resolve(); },
    clear: function () { try { localStorage.removeItem(this.key()); localStorage.removeItem('training:' + P.tr.id); } catch (e) {} }
  };
  A.rest = {
    url: function () { return fill(P.cfg.progressUrl, P.tr, P.cfg.user); },
    headers: function (json) {
      var h = Object.assign({}, P.cfg.headers || {});
      if (P.cfg.token) h.Authorization = 'Bearer ' + P.cfg.token;
      if (json) h['Content-Type'] = 'application/json';
      return h;
    },
    load: function () {
      return fetch(this.url(), { headers: this.headers(false), credentials: P.cfg.credentials || 'same-origin', cache: 'no-store' }).then(function (r) {
        if (r.status === 404 || r.status === 204) return null;
        if (!r.ok) throw new Error('GET progress: HTTP ' + r.status);
        return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
      });
    },
    save: function (state, unloading) {
      return fetch(this.url(), { method: P.cfg.saveMethod || 'PUT', headers: this.headers(true), credentials: P.cfg.credentials || 'same-origin', body: JSON.stringify(state), keepalive: !!unloading })
        .then(function (r) { if (!r.ok) throw new Error('save progress: HTTP ' + r.status); });
    }
  };
  A.postMessage = {
    /* Asks the parent page for the saved state: posts "requestState", waits for {type:"init", state, user}. */
    load: function () {
      return new Promise(function (resolve) {
        var done = false;
        function onMsg(e) {
          var d = e.data || {};
          if (d.target !== 'semitec-training' || d.type !== 'init') return;
          if (P.cfg.parentOrigin && P.cfg.parentOrigin !== '*' && e.origin !== P.cfg.parentOrigin) return;
          done = true; window.removeEventListener('message', onMsg);
          if (d.user) P.cfg.user = d.user;
          if (d.lockName != null) P.cfg.lockName = d.lockName;
          resolve(d.state || null);
        }
        window.addEventListener('message', onMsg);
        T.emit('requestState', { trainingId: P.tr.id });
        setTimeout(function () { if (!done) { window.removeEventListener('message', onMsg); console.warn('training: no "init" message from the parent page, starting empty'); resolve(null); } }, P.cfg.initTimeout || 4000);
      });
    },
    save: function () { return Promise.resolve(); } /* the "progress" event already carries the state to the parent */
  };
  A.custom = {
    load: function () { return Promise.resolve(P.cfg.adapter && P.cfg.adapter.load ? P.cfg.adapter.load(P.tr.id, P.cfg.user) : null); },
    save: function (state) { return Promise.resolve(P.cfg.adapter && P.cfg.adapter.save ? P.cfg.adapter.save(state, P.tr.id, P.cfg.user) : null); }
  };

  /* ---------------- lifecycle ---------------- */
  P.init = function (tr, cfg) {
    P.tr = tr; P.cfg = cfg;
    P.adapter = A[cfg.progress] || A.local;
    return P.adapter.load().catch(function (e) {
      console.error(e); T.emit('error', { where: 'load', message: String(e.message || e) }); P.loadFailed = true; return null;
    }).then(function (s) {
      P.state = normalize(s, tr, cfg.user) || blank(tr, cfg.user);
      if (P.state.user && P.state.user.name && cfg.user && !cfg.user.name) cfg.user.name = P.state.user.name;
      return P.state;
    });
  };
  var timer = null;
  P.commit = function (reason, detail) {
    var s = P.state;
    s.updatedAt = now();
    s.percent = P.percent();
    T.emit('progress', { reason: reason, state: s, detail: detail || null });
    clearTimeout(timer);
    timer = setTimeout(P.flush, 300);
  };
  P.flush = function (unloading) {
    clearTimeout(timer); timer = null;
    return P.adapter.save(P.state, unloading).then(function () { P.saveFailed = false; T.emit('saved', { updatedAt: P.state.updatedAt }); })
      .catch(function (e) { console.error(e); P.saveFailed = true; T.emit('error', { where: 'save', message: String(e.message || e) }); if (P.onSaveError) P.onSaveError(e); });
  };
  window.addEventListener('pagehide', function () { if (timer) P.flush(true); });

  /* ---------------- helpers used by the app ---------------- */
  P.topic = function (id) {
    var t = P.state.topics[id];
    if (!t) t = P.state.topics[id] = { visited: [], passed: false, score: null, bestScore: null, passedAt: null, attempts: [] };
    return t;
  };
  P.isPassed = function (id) { var t = P.state.topics[id]; return !!(t && t.passed); };
  P.visit = function (topicId, subId) {
    var t = P.topic(topicId);
    P.state.last = topicId + '/' + subId;
    if (subId !== 'quiz' && t.visited.indexOf(subId) < 0) { t.visited.push(subId); P.commit('visit', { topicId: topicId, subsectionId: subId }); }
    else P.commit('position', { topicId: topicId, subsectionId: subId });
  };
  P.attempt = function (topicId, r) { /* r: {score, passed, total, correct, wrong:[question ids]} */
    var t = P.topic(topicId);
    t.attempts.push({ date: now(), score: r.score, passed: r.passed, correct: r.correct, total: r.total, wrong: r.wrong });
    if (t.attempts.length > MAX_ATTEMPTS) t.attempts.splice(0, t.attempts.length - MAX_ATTEMPTS);
    t.score = r.score;
    t.bestScore = Math.max(t.bestScore || 0, r.score);
    if (r.passed && !t.passed) { t.passed = true; t.passedAt = now(); }
    P.commit('quiz', { topicId: topicId, score: r.score, passed: r.passed, wrong: r.wrong });
  };
  P.complete = function (topicId) { /* topic without quiz */
    var t = P.topic(topicId);
    if (!t.passed) { t.passed = true; t.passedAt = now(); t.score = t.bestScore = 1; }
    P.commit('complete', { topicId: topicId });
  };
  P.percent = function () {
    var ts = T.app.topics || [];
    return ts.length ? Math.round(100 * ts.filter(function (t) { return P.isPassed(t.id); }).length / ts.length) : 0;
  };
  P.lastAttempt = function (id) { var t = P.state.topics[id]; return t && t.attempts.length ? t.attempts[t.attempts.length - 1] : null; };
  P.reset = function () {
    P.state = blank(P.tr, P.cfg.user);
    if (P.adapter.clear) P.adapter.clear();
    P.commit('reset');
  };
})();
