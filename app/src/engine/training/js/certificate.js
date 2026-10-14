/* certificate.js — completion certificate, fully described by certificate.json.
   Placeholders in texts: {name} {training} {date} {score} {id} {issuer} {hours}. */
(function () {
  var T = window.T, el = T.el;

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).toUpperCase(); }
  function fill(s, v) { return String(s || '').replace(/\{(\w+)\}/g, function (_, k) { return v[k] != null ? v[k] : '{' + k + '}'; }); }

  T.renderCertificate = function (cfg, training, info) {
    var st = cfg.style || {};
    var v = {
      name: info.name, training: training.title, issuer: cfg.issuer || '',
      date: new Date(info.date).toLocaleDateString(training.language || 'en', { year: 'numeric', month: 'long', day: 'numeric' }),
      score: Math.round(info.score * 100) + '%', hours: training.hours || ''
    };
    v.id = (cfg.idPrefix || 'CERT-') + hash(info.name + '|' + training.id + '|' + info.date.slice(0, 10));
    var cert = el('div.certificate.design-' + (st.design || 'classic') + '.font-' + (st.font || 'serif') + '.' + (st.orientation || 'landscape'));
    ['accent', 'accent2', 'paper', 'ink'].forEach(function (k) { if (st[k]) cert.style.setProperty('--cert-' + k, st[k]); });

    var logo = cfg.logo ? el('img.cert-logo', { src: cfg.logo, alt: '' }) : (cfg.logoText ? el('div.cert-logotext', { text: cfg.logoText }) : null);
    cert.appendChild(el('div.cert-frame', null, [
      el('div.cert-top', null, [logo, cfg.issuer ? el('div.cert-issuer', { text: v.issuer }) : null]),
      el('div.cert-title', { text: cfg.title || 'Certificate of Completion' }),
      cfg.subtitle ? el('div.cert-subtitle', { html: MD.inline(fill(cfg.subtitle, v)) }) : null,
      el('div.cert-presented', { text: fill(cfg.presented || 'This certificate is presented to', v) }),
      el('div.cert-name', { text: v.name }),
      el('div.cert-body', { html: MD.inline(fill(cfg.body || 'for successfully completing **{training}** on {date}.', v)) }),
      cfg.topicsList ? el('div.cert-topics', { html: training.topicTitles.map(MD.esc).join(' · ') }) : null,
      el('div.cert-signs', null, (cfg.signatures || []).map(function (s) {
        return el('div.cert-sign', null, [el('div.sign-line'), el('div.sign-name', { text: s.name }), el('div.sign-role', { text: s.role || '' })]);
      })),
      el('div.cert-foot', null, [el('span', { text: v.date }), el('span', { text: 'ID: ' + v.id })]),
      st.seal !== false ? el('div.cert-seal', { 'aria-hidden': 'true' }, [el('span', { text: cfg.sealText || '✓' })]) : null
    ]));
    cert.setAttribute('data-cert-id', v.id);
    return cert;
  };
})();
