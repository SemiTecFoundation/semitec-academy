(() => {
  const slides = [...document.querySelectorAll('.slide')];
  const next = document.querySelector('.next');
  const previous = document.querySelector('.previous');
  const counter = document.querySelector('.slide-counter b');
  const total = document.querySelector('.slide-counter').lastChild;
  const sectionName = document.querySelector('.section-name');
  const progress = document.querySelector('.progress span');
  const help = document.querySelector('.help');
  const dialog = document.querySelector('.help-dialog');
  const closeDialog = document.querySelector('.close-dialog');
  let index = 0;

  total.textContent = ` / ${String(slides.length).padStart(2, '0')}`;

  function show(nextIndex, updateHash = true) {
    index = Math.max(0, Math.min(nextIndex, slides.length - 1));
    slides.forEach((slide, position) => {
      const isCurrent = position === index;
      slide.hidden = !isCurrent;
      slide.classList.toggle('active', isCurrent);
    });
    const slide = slides[index];
    counter.textContent = String(index + 1).padStart(2, '0');
    sectionName.textContent = slide.dataset.title;
    progress.style.width = `${((index + 1) / slides.length) * 100}%`;
    const isFirst = index === 0;
    const isLast = index === slides.length - 1;
    previous.disabled = isFirst;
    next.disabled = false;
    next.textContent = isLast ? 'Restart presentation ↺' : 'Next →';
    next.setAttribute('aria-label', isLast ? 'Restart presentation from the first slide' : 'Next slide');
    previous.setAttribute('aria-disabled', String(isFirst));
    next.setAttribute('aria-disabled', 'false');
    if (updateHash) history.replaceState(null, '', `#${slide.id}`);
    document.title = `${slide.dataset.title} — Introducing SemiTec Academy`;
  }

  function fromHash() {
    const target = slides.findIndex(slide => `#${slide.id}` === location.hash);
    show(target >= 0 ? target : 0, false);
  }

  next.addEventListener('click', () => show(index === slides.length - 1 ? 0 : index + 1));
  previous.addEventListener('click', () => show(index - 1));
  document.querySelector('.start').addEventListener('click', () => show(1));
  document.querySelector('.brand').addEventListener('click', () => show(0));

  document.addEventListener('keydown', event => {
    if (dialog.open) {
      if (event.key === 'Escape') dialog.close();
      return;
    }
    if (['ArrowRight', ' ', 'PageDown'].includes(event.key)) { event.preventDefault(); show(index + 1); }
    if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); show(index - 1); }
    if (event.key === 'Home') { event.preventDefault(); show(0); }
    if (event.key === 'End') { event.preventDefault(); show(slides.length - 1); }
    if (event.key.toLowerCase() === 'f') {
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    }
  });
  window.addEventListener('hashchange', fromHash);
  help.addEventListener('click', () => dialog.showModal());
  closeDialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  fromHash();
})();
