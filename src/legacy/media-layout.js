'use strict';
window.addEventListener('trono:ready', () => {
  const stage = document.querySelector('.mn-media-stage'),
    grid = document.getElementById('screenShareGrid');
  let pending = false;
  function fit() {
    pending = false;
    const count = [...grid.children].filter((el) =>
        el.classList.contains('screen-share-tile'),
      ).length,
      columns = count <= 1 ? 1 : count > 2 || stage.clientWidth >= 600 ? 2 : 1,
      rows = Math.max(1, Math.ceil(count / columns));
    for (const [key, value] of [
      ['--stream-columns', columns],
      ['--stream-rows', rows],
    ])
      if (grid.style.getPropertyValue(key) !== String(value))
        grid.style.setProperty(key, String(value));
  }
  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(fit);
    }
  }
  new ResizeObserver(schedule).observe(stage);
  new MutationObserver(schedule).observe(grid, { childList: true });
  schedule();
  if (window.TronoDesktop) {
    const hand = document.getElementById('humanHand');
    let queued = false;
    const fitCards = () => {
      queued = false;
      const count = hand.querySelectorAll('.hand-card').length;
      if (!count || !hand.clientWidth || !hand.clientHeight) return;
      const style = getComputedStyle(hand),
        x = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0),
        y = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0),
        gap = parseFloat(style.columnGap) || 0,
        available = hand.clientWidth - x,
        width = (available - gap * (count - 1)) / count;
      const room = Math.max(24, hand.clientHeight - y),
        height = Math.min(room, 126, Math.max(70, width * 1.4)),
        overlap =
          count > 1
            ? Math.min(0, (available - (count * height) / 1.4 - gap * (count - 1)) / (count - 1))
            : 0;
      for (const [key, value] of [
        ['--hand-card-height', height.toFixed(2) + 'px'],
        ['--hand-overlap', overlap.toFixed(2) + 'px'],
      ])
        if (hand.style.getPropertyValue(key) !== value) hand.style.setProperty(key, value);
    };
    const scheduleCards = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(fitCards);
      }
    };
    new ResizeObserver(scheduleCards).observe(hand);
    new MutationObserver(scheduleCards).observe(hand, { childList: true });
    scheduleCards();
  }
});
