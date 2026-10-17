/* App-owned custom-web progress bridge. Do not place in the template-synced JSON engine. */
(function () {
  'use strict';
  var listeners = [], current = null, currentUser = null;
  function message(type, detail) {
    if (window.parent !== window) window.parent.postMessage({ source: 'semitec-training', type: type, detail: detail }, 'stl://app');
  }
  function save(state, options) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('Academy progress state must be an object');
    options = options || {}; var percent = Number(options.percent);
    current = state;
    message('progress', { state: state, percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0, completed: options.completed === true });
  }
  window.SemiTecAcademy = Object.freeze({
    requestState: function () { message('requestState'); },
    onState: function (fn) {
      if (typeof fn !== 'function') throw new TypeError('onState needs a function');
      listeners.push(fn); if (current !== null || currentUser !== null) fn({ state: current, user: currentUser });
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    getState: function () { return current; }, getUser: function () { return currentUser; },
    save: save, complete: function (state) { save(state || {}, { percent: 100, completed: true }); }
  });
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || event.origin !== 'stl://app') return;
    var data = event.data || {}; if (data.target !== 'semitec-training' || data.type !== 'init') return;
    current = data.state && typeof data.state === 'object' && !Array.isArray(data.state) ? data.state : null;
    currentUser = data.user && typeof data.user === 'object' ? data.user : null;
    listeners.slice().forEach(function (fn) { fn({ state: current, user: currentUser }); });
  });
  message('requestState');
}());
