// Decorative only: no input capture, no game-state changes, no persistent loop.
const frame = document.querySelector('.map-frame');
const hint = document.getElementById('join-hint');
const art = document.querySelector('.identity-art');
const battle = document.getElementById('battle-screen');
const motion = matchMedia('(prefers-reduced-motion: no-preference) and (pointer: fine) and (min-width: 701px)');
if (frame && hint && art) {
  let visible = true, pending = 0, x = 0, y = 0;
  const reset = () => {
    cancelAnimationFrame(pending); pending = 0;
    art.style.removeProperty('--look-x'); art.style.removeProperty('--look-y');
  };
  const canMove = () => motion.matches && visible && !hint.hidden && battle?.hidden && !document.hidden;
  frame.addEventListener('pointermove', event => {
    if (!canMove() || event.pointerType !== 'mouse') return;
    const rect = frame.getBoundingClientRect();
    x = ((event.clientX - rect.left) / rect.width - .5) * 12;
    y = ((event.clientY - rect.top) / rect.height - .5) * 8;
    if (!pending) pending = requestAnimationFrame(() => {
      pending = 0;
      if (!canMove()) return reset();
      art.style.setProperty('--look-x', `${x.toFixed(2)}px`);
      art.style.setProperty('--look-y', `${y.toFixed(2)}px`);
    });
  }, {passive: true});
  frame.addEventListener('pointerleave', reset, {passive: true});
  motion.addEventListener('change', reset);
  document.addEventListener('visibilitychange', reset);
  new MutationObserver(reset).observe(hint, {attributes: true, attributeFilter: ['hidden']});
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible) reset(); }).observe(frame);
}
