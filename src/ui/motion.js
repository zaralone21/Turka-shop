/* Делікатні анімації інтерфейсу: лічильники показників при появі сторінки.
   Після анімації в елементі завжди стоїть точний вихідний текст. */
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } };
const NUM = /\d+(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d+)?/;
const DURATION = 450;

function formatLike(value, sample) {
  const dec = sample.match(/[.,](\d+)$/);
  const sep = (sample.match(/\d([\s  ])\d/) || [])[1] || '';
  const fixed = dec ? value.toFixed(dec[1].length) : String(Math.round(value));
  const [int, frac] = fixed.split('.');
  const grouped = sep ? int.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : int;
  return frac !== undefined ? grouped + sample[sample.length - dec[1].length - 1] + frac : grouped;
}

/** Рахує числа у плитках і картках статистики від нуля до значення. */
export function countUp(scope) {
  if (!scope || reduced() || typeof requestAnimationFrame !== 'function') return;
  const items = [];
  for (const el of scope.querySelectorAll('.stat .v, .tile .v, .kpi .v')) {
    if (el.children.length) continue;
    const text = el.textContent; const m = text.match(NUM); if (!m) continue;
    const target = parseFloat(m[0].replace(/[\s  ]/g, '').replace(',', '.'));
    if (!isFinite(target) || target === 0) continue;
    items.push({ el, text, m, target });
  }
  if (!items.length) return;
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / DURATION); const e = 1 - Math.pow(1 - k, 3);
    for (const it of items) {
      if (!it.el.isConnected) continue;
      it.el.textContent = k >= 1 ? it.text : it.text.slice(0, it.m.index) + formatLike(it.target * e, it.m[0]) + it.text.slice(it.m.index + it.m[0].length);
    }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
