/* pdfview.mjs — PDF reader built on pdf.js: lazy page rendering, zoom, page jump, outline,
   and reading tracking (which pages were seen, last page). Exposes window.PDFView.open(). */
import * as pdfjs from '/vendor/pdfjs/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.mjs';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const btn = (text, title, fn) => { const b = el('button', 'btn small', text); b.type = 'button'; b.title = title; b.addEventListener('click', fn); return b; };

/* open(host, url, { startPage, onPage(n, total), onSeen(n), onReady(total), showOutline }) -> controller */
async function open(host, url, opts = {}) {
  host.innerHTML = '';
  const root = el('div', 'pdfv');
  const bar = el('div', 'pdfv-bar');
  const main = el('div', 'pdfv-main');
  const outline = el('nav', 'pdfv-outline'); outline.hidden = true;
  const scroll = el('div', 'pdfv-scroll'); scroll.tabIndex = 0;
  main.append(outline, scroll); root.append(bar, main); host.append(root);
  scroll.append(el('div', 'pdfv-msg', 'Opening document…'));

  let doc;
  try {
    doc = await pdfjs.getDocument({ url, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, wasmUrl: '/vendor/pdfjs/wasm/', isEvalSupported: false }).promise;
  } catch (e) {
    scroll.innerHTML = ''; scroll.append(el('div', 'pdfv-msg', 'Could not open the PDF: ' + e.message));
    return null;
  }
  const total = doc.numPages;
  let scale = 1, fitWidth = true, current = 1, reported = 0, destroyed = false;
  const pages = [];   // { n, box, canvas, rendered, w, h, task }

  /* toolbar */
  const outlineBtn = btn('☰', 'Contents of the document', () => { outline.hidden = !outline.hidden; relayout(); });
  const prev = btn('‹', 'Previous page', () => go(current - 1));
  const next = btn('›', 'Next page', () => go(current + 1));
  const pageIn = el('input', 'page'); pageIn.value = '1'; pageIn.setAttribute('aria-label', 'Page');
  pageIn.addEventListener('change', () => go(parseInt(pageIn.value, 10) || 1));
  const totalLbl = el('span', null, '/ ' + total);
  const zoomV = el('span', 'zoomv', '100%');
  const zOut = btn('−', 'Zoom out', () => setZoom(scale / 1.2));
  const zIn = btn('+', 'Zoom in', () => setZoom(scale * 1.2));
  const fit = btn('↔ Fit width', 'Fit to width', () => { fitWidth = true; relayout(); });
  bar.append(outlineBtn, el('span', 'sep'), prev, pageIn, totalLbl, next, el('span', 'sep'), zOut, zoomV, zIn, fit, el('span', 'grow'));
  if (opts.extraButtons) opts.extraButtons.forEach(b => bar.append(b));

  /* sizes from page 1 (pages are created lazily but sized from their own viewport) */
  const firstPage = await doc.getPage(1);
  const base = firstPage.getViewport({ scale: 1 });
  scroll.innerHTML = '';
  for (let n = 1; n <= total; n++) {
    const box = el('div', 'pdfv-page'); box.dataset.n = n;
    box.append(el('span', 'pno', String(n)));
    scroll.append(box);
    pages.push({ n, box, w: base.width, h: base.height, rendered: 0 });
  }
  function fitScale() { return Math.max(0.3, Math.min(4, (scroll.clientWidth - 40) / base.width)); }
  function relayout(keepPage = current) {
    if (fitWidth) scale = fitScale();
    zoomV.textContent = Math.round(scale * 100) + '%';
    pages.forEach(p => { p.box.style.width = Math.floor(p.w * scale) + 'px'; p.box.style.height = Math.floor(p.h * scale) + 'px'; if (p.rendered && p.rendered !== scale) p.rendered = -1; });
    go(keepPage, true);
    queueVisible();
  }
  function setZoom(s) { fitWidth = false; scale = Math.max(0.3, Math.min(4, s)); relayout(); }

  async function followLink(annotation) {
    if (annotation.url && /^(https?:\/\/|mailto:)/i.test(annotation.url)) {
      await window.UI.api.app.openExternal(annotation.url); return;
    }
    const dest = typeof annotation.dest === 'string' ? await doc.getDestination(annotation.dest) : annotation.dest;
    if (dest && dest.length) go((Number.isInteger(dest[0]) ? dest[0] : await doc.getPageIndex(dest[0])) + 1);
    else if (annotation.action === 'NextPage') go(current + 1);
    else if (annotation.action === 'PrevPage') go(current - 1);
    else if (annotation.action === 'FirstPage') go(1);
    else if (annotation.action === 'LastPage') go(total);
  }
  async function render(p) {
    if (destroyed || p.rendered === scale || p.busy) return;
    p.busy = true; const renderedScale = scale;
    try {
      const page = await doc.getPage(p.n);
      if (destroyed) return;
      const viewport = page.getViewport({ scale: renderedScale });
      const vp1 = page.getViewport({ scale: 1 }); p.w = vp1.width; p.h = vp1.height;
      p.box.style.width = Math.floor(p.w * scale) + 'px'; p.box.style.height = Math.floor(p.h * scale) + 'px';
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const canvas = el('canvas'); canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
      p.task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
      await p.task.promise;
      if (destroyed || renderedScale !== scale) return;
      const text = el('div', 'textLayer'); text.style.setProperty('--total-scale-factor', viewport.scale);
      p.textTask = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      await p.textTask.render();
      const links = el('div', 'pdfv-links');
      for (const annotation of await page.getAnnotations({ intent: 'display' })) {
        if (annotation.subtype !== 'Link' || !(annotation.url || annotation.dest || annotation.action)) continue;
        const rect = viewport.convertToViewportRectangle(annotation.rect);
        const a = el('a'); a.href = '#'; a.setAttribute('aria-label', annotation.url || 'Go to linked page');
        a.style.cssText = `left:${Math.min(rect[0], rect[2])}px;top:${Math.min(rect[1], rect[3])}px;width:${Math.abs(rect[2] - rect[0])}px;height:${Math.abs(rect[3] - rect[1])}px;`;
        a.addEventListener('click', e => { e.preventDefault(); followLink(annotation).catch(e => window.UI.toast(e.message, true)); });
        links.append(a);
      }
      if (destroyed || renderedScale !== scale) return;
      p.box.querySelectorAll('canvas,.textLayer,.pdfv-links,.pdfv-error').forEach(node => node.remove());
      p.box.prepend(canvas); p.box.append(text, links); p.rendered = renderedScale;
    } catch (e) {
      if (!destroyed && e.name !== 'RenderingCancelledException' && e.name !== 'AbortException') {
        p.box.querySelector('.pdfv-error')?.remove(); p.box.append(el('span', 'pdfv-error', 'Page could not be rendered: ' + e.message));
      }
    } finally {
      p.busy = false; p.task = null; p.textTask = null;
      if (!destroyed && renderedScale !== scale && p.visible) render(p);
    }
  }
  /* render pages near the viewport; track the most visible page */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { const p = pages[en.target.dataset.n - 1]; p.visible = en.isIntersecting ? en.intersectionRatio : 0; if (en.isIntersecting) render(p); else if (!p.busy) { p.box.querySelectorAll('canvas,.textLayer,.pdfv-links').forEach(node => node.remove()); p.rendered = 0; } });
    const best = pages.reduce((a, p) => (p.visible || 0) > (a.visible || 0) ? p : a, pages[0]);
    if (best && best.visible) setCurrent(best.n);
  }, { root: scroll, rootMargin: '600px 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
  pages.forEach(p => io.observe(p.box));
  function queueVisible() { pages.filter(p => p.visible).forEach(render); }

  const seenTimers = {};
  function setCurrent(n) {
    if (n === reported) return;
    reported = n; current = n; pageIn.value = String(n);
    prev.disabled = n <= 1; next.disabled = n >= total;
    if (opts.onPage) opts.onPage(n, total);
    /* a page counts as "seen" after it stayed the current page for 1.2 s */
    clearTimeout(seenTimers.t);
    seenTimers.t = setTimeout(() => { if (current === n && opts.onSeen) opts.onSeen(n, total); }, 1200);
  }
  function go(n, instant) {
    n = Math.max(1, Math.min(total, n));
    const p = pages[n - 1];
    scroll.scrollTo({ top: p.box.offsetTop - 12, behavior: instant ? 'instant' : 'smooth' });
    setCurrent(n);
  }
  scroll.addEventListener('keydown', (e) => {
    if (e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
  });
  scroll.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
  /* re-render only when the width changes: a taller/shorter viewer (e.g. a header folding away) needs no new layout */
  let lastW = scroll.clientWidth;
  const ro = new ResizeObserver(() => { const w = scroll.clientWidth; if (w === lastW) return; lastW = w; if (fitWidth) relayout(); });
  ro.observe(scroll);

  /* outline (bookmarks) */
  try {
    const items = await doc.getOutline();
    if (items && items.length) {
      const add = (list, level) => list.forEach(it => {
        const a = el('a', 'l' + Math.min(level, 3), it.title); a.href = '#';
        a.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
            await followLink(it);
          } catch (x) {}
        });
        outline.append(a);
        if (it.items && it.items.length) add(it.items, level + 1);
      });
      add(items, 1);
      if (opts.showOutline !== false && host.clientWidth > 900) outline.hidden = false;
    } else outlineBtn.disabled = true;
  } catch (e) { outlineBtn.disabled = true; }

  relayout(opts.startPage || 1);
  setTimeout(() => go(opts.startPage || 1, true), 50);
  if (opts.onReady) opts.onReady(total);
  return {
    total, go, get page() { return current; },
    destroy() { destroyed = true; io.disconnect(); ro.disconnect(); clearTimeout(seenTimers.t); pages.forEach(p => { p.task?.cancel(); p.textTask?.cancel(); }); doc.destroy(); }
  };
}

window.PDFView = { open };
window.dispatchEvent(new Event('pdfview-ready'));
