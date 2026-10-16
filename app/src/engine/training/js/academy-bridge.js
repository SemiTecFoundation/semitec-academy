/* academy-bridge.js — injected only into a format-2 custom web training inside Academy.
   It exposes no Electron or filesystem API. Its single purpose is exchanging progress with the
   Academy parent frame, whose origin is fixed to stl://app. */
(function () {
  'use strict';
  var listeners = [], current = null, currentUser = null;

  function message(type, detail) {
    if (window.parent === window) return;
    window.parent.postMessage({ source: 'semitec-training', type: type, detail: detail }, 'stl://app');
  }
  function notify() {
    listeners.slice().forEach(function (fn) { try { fn({ state: current, user: currentUser }); } catch (e) { setTimeout(function () { throw e; }, 0); } });
  }
  function validState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('Academy progress state must be an object');
    return state;
  }
  function save(state, options) {
    options = options || {};
    state = validState(state);
    var percent = Number(options.percent);
    if (!Number.isFinite(percent)) percent = 0;
    percent = Math.max(0, Math.min(100, percent));
    current = state;
    message('progress', { state: state, percent: percent, completed: !!options.completed });
  }

  window.SemiTecAcademy = Object.freeze({
    requestState: function () { message('requestState'); },
    onState: function (fn) {
      if (typeof fn !== 'function') throw new TypeError('onState needs a function');
      listeners.push(fn);
      if (current !== null || currentUser !== null) fn({ state: current, user: currentUser });
      return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
    },
    getState: function () { return current; },
    getUser: function () { return currentUser; },
    save: save,
    complete: function (state) { save(state || {}, { percent: 100, completed: true }); }
  });

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || event.origin !== 'stl://app') return;
    var data = event.data || {};
    if (data.target !== 'semitec-training' || data.type !== 'init') return;
    current = data.state && typeof data.state === 'object' && !Array.isArray(data.state) ? data.state : null;
    currentUser = data.user && typeof data.user === 'object' ? data.user : null;
    notify();
  });

  message('requestState');
}());
