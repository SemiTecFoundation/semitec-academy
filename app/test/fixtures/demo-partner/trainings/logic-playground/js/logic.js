(function () {
  'use strict';
  var state = { a: 0, b: 0, interactions: 0 };
  function render() {
    document.getElementById('input-a').textContent = 'A = ' + state.a;
    document.getElementById('input-b').textContent = 'B = ' + state.b;
    document.getElementById('output').textContent = state.a && state.b ? '1' : '0';
  }
  function save(percent, completed) {
    window.SemiTecAcademy.save(state, { percent: percent, completed: !!completed });
  }
  window.toggleInput = function (name) {
    state[name] = state[name] ? 0 : 1;
    state.interactions += 1;
    render();
    save(Math.min(90, state.interactions * 30), false);
  };
  window.finishTraining = function () { window.SemiTecAcademy.complete(state); };
  window.SemiTecAcademy.onState(function (saved) {
    if (saved.state && typeof saved.state === 'object') state = Object.assign(state, saved.state);
    document.getElementById('academy-state').textContent = saved.user ? 'Connected as ' + saved.user.name : 'Connected to Academy';
    render();
  });
  render();
}());
