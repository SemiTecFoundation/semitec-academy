/* Minimal Markdown renderer for training content.
   Supports: # ## ### headings, paragraphs, **bold**, *italic*, `code`, [link](url),
   - / * bullet lists, 1. numbered lists, > quotes, line breaks, and $sub$/^sup^-free
   plain text. HTML in the source is escaped (authors use blocks for rich content). */
(function () {
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(s) {
    s = esc(s);
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      var safe = /^(https?:|mailto:|#)/.test(u) ? u : '#';
      var ext = /^https?:/.test(u) ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + safe + '"' + ext + '>' + t + '</a>';
    });
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
    return s;
  }
  function render(src) {
    if (src == null) return '';
    var lines = String(src).replace(/\r/g, '').split('\n');
    var out = [], para = [], list = null;
    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    function flushList() { if (list) { out.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; } }
    lines.forEach(function (line) {
      var m;
      if (/^\s*$/.test(line)) { flushPara(); flushList(); return; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); flushList(); var h = Math.min(6, m[1].length + 2); out.push('<h' + h + '>' + inline(m[2]) + '</h' + h + '>'); return; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); return; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); return; }
      if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); return; }
      if (list) { list.items[list.items.length - 1] += ' ' + line.trim(); return; }
      para.push(line.trim());
    });
    flushPara(); flushList();
    return out.join('\n');
  }
  window.MD = { render: render, inline: inline, esc: esc };
})();
