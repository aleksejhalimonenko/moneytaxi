/* ═══════════════════════════════════════════════════
   MoneyTaxi WebApp — frontend logic
   v30.1 — stacked bar chart в dashboard,
           swipe-карусель, двусторонняя синхронизация
   ═══════════════════════════════════════════════════ */

const API_URL = 'https://script.google.com/macros/s/AKfycby2d4bxoQXLz-lBXz5RRmNimhuy64n6Gq-AWvuYlla0VAz6SUoxKcq1eRD2-M1bpGQW/exec';

// === Telegram WebApp initData ===
const tg = window.Telegram && window.Telegram.WebApp;
const initData = tg ? (tg.initData || '') : '';

// === CACHE VERSION — автосброс старого кэша при обновлении ===
const APP_VERSION = 'v30.1';
try {
  const stored = localStorage.getItem('mt:appVersion');
  if (stored !== APP_VERSION) {
    Object.keys(localStorage).forEach(k => {
      if (k.indexOf('mt:') === 0) localStorage.removeItem(k);
    });
    localStorage.setItem('mt:appVersion', APP_VERSION);
  }
} catch (_) {}

// === Helpers ===
function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }) + ' zł';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function pluralWeeksShort(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'недель';
  if (mod10 === 1) return 'неделя';
  if (mod10 >= 2 && mod10 <= 4) return 'недели';
  return 'недель';
}

function toast(msg, type) {
  const el = document.getElementById('save-toast');
  if (!el) return;
  const txt = el.querySelector('.flex-1');
  const icon = document.getElementById('save-toast-icon');

  if (txt) txt.textContent = msg;

  if (icon) {
    if (type === 'error') {
      icon.textContent = 'error';
      icon.className = 'material-symbols-outlined text-error';
    } else if (type === 'info') {
      icon.textContent = 'info';
      icon.className = 'material-symbols-outlined text-secondary';
    } else {
      icon.textContent = 'cloud_done';
      icon.className = 'material-symbols-outlined text-primary';
    }
  }

  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

async function withButtonLoading(btn, fn, loadingText) {
  if (!btn) return await fn();
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('opacity-60', 'cursor-wait');
  btn.innerHTML =
    '<span class="material-symbols-outlined spinner">sync</span> ' +
    (loadingText || 'Сохранение...');
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'cursor-wait');
    btn.innerHTML = original;
  }
}

function showError(msg) {
  const el = document.getElementById('error-box');
  if (!el) return;
  el.classList.remove('hidden');
  document.getElementById('error-msg').textContent = msg;
}

function hideError() {
  const el = document.getElementById('error-box');
  if (el) el.classList.add('hidden');
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.classList.add('hidden');
}

// === TELEGRAM SAFE-AREA INSETS ===
function applyTelegramInsets() {
  if (!tg) return;
  const hasApi = tg.isVersionAtLeast && tg.isVersionAtLeast('8.0');
  if (!hasApi && !tg.safeAreaInset) return;

  const inset = tg.safeAreaInset || {};
  const root = document.documentElement;

  let top      = Math.max(0, Math.round(inset.top    || 0));
  const bottom = Math.max(0, Math.round(inset.bottom || 0));
  const left   = Math.max(0, Math.round(inset.left   || 0));
  const right  = Math.max(0, Math.round(inset.right  || 0));

  if (tg.isFullscreen && top < 56) top = 56;

  root.style.setProperty('--tg-inset-top',    top    + 'px');
  root.style.setProperty('--tg-inset-bottom', bottom + 'px');
  root.style.setProperty('--tg-inset-left',   left   + 'px');
  root.style.setProperty('--tg-inset-right',  right  + 'px');

  if (tg.viewportStableHeight) {
    root.style.setProperty('--tg-vh', tg.viewportStableHeight + 'px');
  }
}

// === SETTINGS DIRTY TRACKING ===
let settingsDirty = false;

function markSettingsDirty() {
  if (settingsDirty) return;
  settingsDirty = true;
  const btn = document.getElementById('btn-save-settings');
  const txt = document.getElementById('btn-save-settings-text');
  if (btn) {
    btn.classList.remove('bg-primary', 'text-on-primary');
    btn.classList.add('bg-tertiary-container', 'text-on-tertiary-container');
  }
  if (txt) txt.textContent = 'Сохранить изменения';
}

function clearSettingsDirty() {
  settingsDirty = false;
  const btn = document.getElementById('btn-save-settings');
  const txt = document.getElementById('btn-save-settings-text');
  if (btn) {
    btn.classList.remove('bg-tertiary-container', 'text-on-tertiary-container');
    btn.classList.add('bg-primary', 'text-on-primary');
  }
  if (txt) txt.textContent = 'Сохранить настройки';
}

function bindSettingsDirtyTracking() {
  ['set-partner-pct', 'set-promo-tax', 'set-weekly-fee', 'set-zus', 'set-dep-rate']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', markSettingsDirty);
    });
}

// === PROGRESS BAR ===
const PROGRESS = {
  el: null,
  value: 0,
  _init() { if (!this.el) this.el = document.getElementById('progress-bar'); },
  show() {
    this._init();
    if (this.el) { this.el.style.opacity = '1'; this.el.style.width = '0%'; }
    this.value = 0;
  },
  set(v) {
    this._init();
    this.value = Math.max(0, Math.min(100, v));
    if (this.el) this.el.style.width = this.value + '%';
  },
  done() {
    this._init();
    this.set(100);
    setTimeout(() => {
      if (this.el) { this.el.style.opacity = '0'; this.el.style.width = '0%'; }
    }, 300);
  }
};

// === SKELETON (не трогает hidden у <section>, только у скелетонов и контент-обёрток) ===
function showSkeleton(name) {
  const sk = document.getElementById('skeleton-' + name);
  if (sk) { sk.classList.remove('hidden'); sk.classList.add('flex'); }
  if (name === 'dashboard') {
    const c = document.getElementById('dash-content');
    if (c) { c.classList.add('hidden'); c.classList.remove('flex'); }
  }
  if (name === 'history') {
    const c = document.getElementById('history-content');
    if (c) { c.classList.add('hidden'); c.classList.remove('flex'); }
  }
  if (name === 'settings') {
    const c = document.getElementById('settings-content');
    if (c) { c.classList.add('hidden'); c.classList.remove('flex'); }
  }
}

function hideSkeleton(name) {
  const sk = document.getElementById('skeleton-' + name);
  if (sk) { sk.classList.add('hidden'); sk.classList.remove('flex'); }
  if (name === 'dashboard') {
    const c = document.getElementById('dash-content');
    if (c) { c.classList.remove('hidden'); c.classList.add('flex'); }
  }
  if (name === 'history') {
    const c = document.getElementById('history-content');
    if (c) { c.classList.remove('hidden'); c.classList.add('flex'); }
  }
  if (name === 'settings') {
    const c = document.getElementById('settings-content');
    if (c) { c.classList.remove('hidden'); c.classList.add('flex'); }
  }
}

// === CACHE (in-memory) ===
const CACHE = {
  data: {},
  TTL: 30000,
  get(key) {
    const e = this.data[key];
    if (!e) return null;
    if (Date.now() - e.ts > this.TTL) { delete this.data[key]; return null; }
    return e.value;
  },
  set(key, value) { this.data[key] = { value, ts: Date.now() }; },
  invalidate(prefix) {
    if (!prefix) { this.data = {}; return; }
    Object.keys(this.data).forEach(k => {
      if (k.indexOf(prefix) === 0) delete this.data[k];
    });
  }
};

// === LOCALSTORAGE CACHE (persistent) ===
const LS = {
  TTL: 10 * 60 * 1000,
  available: (() => {
    try {
      localStorage.setItem('__mt_t', '1');
      localStorage.removeItem('__mt_t');
      return true;
    } catch (_) { return false; }
  })(),
  get(key) {
    if (!this.available) return null;
    try {
      const raw = localStorage.getItem('mt:' + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || Date.now() - obj.ts > this.TTL) {
        localStorage.removeItem('mt:' + key);
        return null;
      }
      return obj.value;
    } catch (_) { return null; }
  },
  set(key, value) {
    if (!this.available) return;
    try {
      localStorage.setItem('mt:' + key, JSON.stringify({ value, ts: Date.now() }));
    } catch (_) {}
  },
  invalidate(prefix) {
    if (!this.available) return;
    try {
      const p = 'mt:' + (prefix || '');
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf(p) === 0) localStorage.removeItem(k);
      });
    } catch (_) {}
  }
};

// === API ===
async function apiGet(action, params = {}, opts = {}) {
  const key = 'GET:' + action + ':' + JSON.stringify(params);
  if (!opts.fresh) {
    const cached = CACHE.get(key);
    if (cached) return cached;
  }
  try {
    const qs = new URLSearchParams({ action, initData, ...params });
    const res = await fetch(`${API_URL}?${qs.toString()}`);
    const data = await res.json();
    if (data.ok) {
      CACHE.set(key, data);
      if (action === 'dashboard') LS.set('dashboard', data);
      if (action === 'history')   LS.set('history', data);
      if (action === 'settings')  LS.set('settings', data);
    }
    return data;
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
}

async function apiPost(action, payload = {}) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, initData, ...payload })
    });
    const data = await res.json();
    if (data.ok) _invalidateAfterPost(action);
    return data;
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
  }
}

function _invalidateAfterPost(action) {
  const a = (action || '').toLowerCase();
  if (a === 'uploadscreenshot' || a === 'removescreenshot' || a === 'updatecash' || a === 'clearqueue') {
    CACHE.invalidate('GET:queue');
    CACHE.invalidate('GET:dashboard');
    LS.invalidate('dashboard');
  }
  if (a === 'savereport') {
    CACHE.invalidate();
    LS.invalidate();
  }
  if (a === 'savesettings') {
    CACHE.invalidate('GET:settings');
    CACHE.invalidate('GET:dashboard');
    LS.invalidate('settings');
    LS.invalidate('dashboard');
  }
}

// ═══════════════════════════════════════════════════
//   SWIPE CAROUSEL + TAB SYNC
// ═══════════════════════════════════════════════════

const TAB_ORDER = ['dashboard', 'screenshots', 'calculator', 'history', 'settings'];
const TAB_COUNT = TAB_ORDER.length;

let currentIndex = 0;

const viewportEl = document.getElementById('swipe-viewport');
const trackEl    = document.getElementById('swipe-track');
const tabBtns    = Array.from(document.querySelectorAll('.tab-btn'));
const brandBar   = document.getElementById('brand-bar');

let isDragging        = false;
let startX            = 0;
let startY            = 0;
let currentDeltaX     = 0;
let isHorizontalGesture = null;
let viewportWidth     = 0;

function measureViewport() {
  if (!viewportEl) return;
  viewportWidth = viewportEl.getBoundingClientRect().width || window.innerWidth || 390;
}

/** Позиционирует пилюлю под активной кнопкой */
function movePill(activeBtn, animated) {
  const pill   = document.getElementById('tab-pill');
  const tabbar = document.getElementById('tabbar-container');
  if (!activeBtn || !pill || !tabbar) return;

  const tRect = activeBtn.getBoundingClientRect();
  const pRect = tabbar.getBoundingClientRect();

  pill.style.transition = animated
    ? 'all 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)'
    : 'none';

  pill.style.left    = `${tRect.left - pRect.left}px`;
  pill.style.width   = `${tRect.width}px`;
  pill.style.opacity = '1';
}

/** Подсветка кнопок таб-бара под индекс */
function setActiveTabVisuals(index) {
  tabBtns.forEach((btn, i) => {
    const active = i === index;
    btn.classList.toggle('text-emerald-400', active);
    btn.classList.toggle('text-slate-400',  !active);
    btn.classList.toggle('font-semibold',    active);

    const icon  = btn.querySelector('.material-symbols-outlined');
    const label = btn.querySelector('span:last-child');

    if (icon) {
      icon.classList.toggle('scale-105',  active);
      icon.classList.toggle('scale-100', !active);
    }
    if (label) {
      label.classList.toggle('font-semibold', active);
      label.classList.toggle('font-medium',  !active);
    }
  });
}

/** Ленивая подгрузка данных при активации вкладки */
function loadTabData(name) {
  if (name === 'dashboard')   loadDashboard();
  if (name === 'screenshots') loadQueue();
  if (name === 'calculator')  loadCalcDefaults();
  if (name === 'history')     loadHistory();
  if (name === 'settings')    loadSettings();
}

/** ЕДИНАЯ ТОЧКА ПРАВДЫ — и свайп, и клик по табу идут сюда */
function goToTab(index, animated = true) {
  if (!trackEl) return;

  index = Math.max(0, Math.min(TAB_COUNT - 1, index));
  const prevIndex = currentIndex;
  currentIndex = index;

  // Сдвиг трека
  if (animated) trackEl.classList.add('carousel-transition');
  else          trackEl.classList.remove('carousel-transition');

  trackEl.style.transform = `translate3d(${-index * 20}%, 0, 0)`;

  // Подсветка кнопок + пилюля
  setActiveTabVisuals(index);
  movePill(tabBtns[index], animated);

  // brand-bar только на «Обзор»
  if (brandBar) brandBar.classList.toggle('hidden', TAB_ORDER[index] !== 'dashboard');

  // Ленивая загрузка только при реальной смене
  if (prevIndex !== index) {
    loadTabData(TAB_ORDER[index]);
  }
}

// Публичный API — обратная совместимость со старыми onclick="switchTab('...')"
window.switchTab = function(name) {
  const i = TAB_ORDER.indexOf(name);
  if (i >= 0) goToTab(i, true);
};
window.__goToTab = goToTab;

// --- ЖЕСТЫ ---
function onSwipeStart(e) {
  if (!viewportEl) return;
  measureViewport();
  isDragging = true;
  isHorizontalGesture = null;
  const t = e.touches ? e.touches[0] : e;
  startX = t.clientX;
  startY = t.clientY;
  currentDeltaX = 0;
  trackEl.classList.remove('carousel-transition');
}

function onSwipeMove(e) {
  if (!isDragging) return;
  const t = e.touches ? e.touches[0] : e;
  const dx = t.clientX - startX;
  const dy = t.clientY - startY;

  if (isHorizontalGesture === null) {
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      isHorizontalGesture = Math.abs(dx) > Math.abs(dy);
    }
  }
  if (!isHorizontalGesture) return;
  if (e.cancelable) e.preventDefault();

  viewportEl.classList.add('dragging-active');
  currentDeltaX = dx;

  let eff = dx;
  if ((currentIndex === 0 && dx > 0) ||
      (currentIndex === TAB_COUNT - 1 && dx < 0)) {
    eff = dx * 0.28;
  }

  const base  = -(currentIndex * 20);
  const shift = (eff / viewportWidth) * 20;
  trackEl.style.transform = `translate3d(${base + shift}%, 0, 0)`;
}

function onSwipeEnd() {
  if (!isDragging) return;
  isDragging = false;
  if (viewportEl) viewportEl.classList.remove('dragging-active');

  if (isHorizontalGesture) {
    const threshold = Math.min(viewportWidth * 0.2, 70);
    if (currentDeltaX < -threshold && currentIndex < TAB_COUNT - 1) {
      goToTab(currentIndex + 1, true);
    } else if (currentDeltaX > threshold && currentIndex > 0) {
      goToTab(currentIndex - 1, true);
    } else {
      goToTab(currentIndex, true);
    }
  }
  isHorizontalGesture = null;
  currentDeltaX = 0;
}

function bindSwipeGestures() {
  if (!viewportEl) return;

  viewportEl.addEventListener('touchstart',  onSwipeStart, { passive: true });
  viewportEl.addEventListener('touchmove',   onSwipeMove,  { passive: false });
  viewportEl.addEventListener('touchend',    onSwipeEnd,   { passive: true });
  viewportEl.addEventListener('touchcancel', onSwipeEnd,   { passive: true });

  // Мышь (десктоп-превью)
  viewportEl.addEventListener('mousedown', (e) => {
    onSwipeStart(e);
    const mm = (ev) => onSwipeMove(ev);
    const mu = () => {
      onSwipeEnd();
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });

  // Клики по кнопкам таб-бара (data-tab-index)
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.tabIndex);
      if (!Number.isNaN(i)) goToTab(i, true);
    });
  });

  window.addEventListener('resize', () => {
    measureViewport();
    movePill(tabBtns[currentIndex], false);
  });
}

// ═══════════════════════════════════════════════════
//   STACKED BAR CHART (dashboard)
// ═══════════════════════════════════════════════════

let _sparkData = [];

/** Обновляет тултип + подсветку активного столбика */
function showChartDetail(index) {
  const s = _sparkData[index];
  if (!s) return;

  const netCash = Math.round(Number(s.netCash) || 0);
  const net     = Math.round(Number(s.net)     || 0);
  const gross   = Math.round(Number(s.gross)   || 0);
  const fuel    = Math.round(Number(s.fuel)    || 0);

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  set('tip-week',    s.period || '—');
  set('tip-netcash', netCash.toLocaleString('ru-RU') + ' zł');
  set('tip-net',     net.toLocaleString('ru-RU')     + ' zł');
  set('tip-gross',   gross.toLocaleString('ru-RU')   + ' zł');
  set('tip-fuel',    (fuel > 0 ? '-' : '') + fuel.toLocaleString('ru-RU') + ' zł');

  document.querySelectorAll('.chart-col').forEach((col, i) => {
    col.classList.toggle('selected', i === index);
  });
}
window.showChartDetail = showChartDetail;

/** Рисует stacked bar chart в #dash-sparkline */
function renderSparkline(spark, isLite) {
  const container = document.getElementById('dash-sparkline');
  if (!container) return;

  _sparkData = Array.isArray(spark) ? spark : [];

  if (!_sparkData.length) {
    container.innerHTML = '<div class="w-full text-center text-on-surface-variant font-mono text-[10px] py-4">нет данных</div>';
    return;
  }

  const MAX_H = 138; // px — максимальная высота столбика

  // Общая нормализация — по (gross + fuel) для Pro, по gross для Lite
  const totals = _sparkData.map(s => {
    const g = Number(s.gross) || 0;
    const f = isLite ? 0 : (Number(s.fuel) || 0);
    return g + f;
  });
  const maxTotal = Math.max(1, ...totals);

  container.innerHTML = _sparkData.map((s, i) => {
    const isLast = i === _sparkData.length - 1;

    const gross   = Number(s.gross)   || 0;
    const net     = Number(s.net)     || 0;
    const netCash = Number(s.netCash) || 0;
    const fuel    = isLite ? 0 : (Number(s.fuel) || 0);

    // Сегменты (защита от отрицательных значений)
    const skyH     = Math.max(0, ((gross - net)   / maxTotal) * MAX_H);
    const emeraldH = Math.max(0, ((net - netCash) / maxTotal) * MAX_H);
    const mintH    = Math.max(0, (netCash        / maxTotal) * MAX_H);
    const roseH    = Math.max(0, (fuel           / maxTotal) * MAX_H);

    const totalH = Math.max(4, skyH + emeraldH + mintH + roseH);

    const label      = Math.round(netCash);
    const weekLabel  = (s.period || '').substring(0, 9);
    const labelClass = isLast
      ? 'text-[#6dffba] font-bold ring-1 ring-primary/40 rounded px-0.5 bg-primary/10'
      : 'text-primary font-bold';
    const wrapperClass = isLast
      ? 'ring-2 ring-primary/50 shadow-[0_0_14px_rgba(109,255,186,0.35)]'
      : '';
    const weekClass = isLast ? 'text-primary font-semibold' : 'text-slate-400';

    return `
      <div class="chart-col flex-1 flex flex-col items-center justify-end h-full cursor-pointer ${isLast ? 'selected' : ''}"
           onclick="showChartDetail(${i})">
        <div class="font-mono text-[9px] ${labelClass} mb-1 leading-none">${label}</div>
        <div class="w-full flex flex-col rounded-t-[5px] overflow-hidden bg-slate-800/40 p-[1px] border border-white/5 ${wrapperClass}"
             style="height: ${totalH}px">
          <div class="w-full bg-sky-500/20 border-b border-sky-400/30" style="height: ${skyH}px"></div>
          <div class="w-full bg-gradient-to-t from-emerald-600 to-emerald-500/90 border-b border-white/10" style="height: ${emeraldH}px"></div>
          <div class="w-full bg-[#6dffba]" style="height: ${mintH}px"></div>
          ${roseH > 0 ? `<div class="w-full bg-gradient-to-t from-rose-600 to-rose-400" style="height: ${roseH}px"></div>` : ''}
        </div>
        <span class="font-mono text-[8px] ${weekClass} mt-1.5 scale-90 origin-top">${esc(weekLabel)}</span>
      </div>`;
  }).join('');

  // Автовыбор последней недели
  showChartDetail(_sparkData.length - 1);
}

// === Dashboard ===
async function fetchDashboard() {
  return await apiGet('dashboard');
}

function renderDashboard(data) {
  if (!data || !data.ok) return;

  const isLite = (data.mode || 'lite') === 'lite';

  document.querySelectorAll('[data-mode="pro-only"]').forEach(el => {
    el.classList.toggle('hidden', isLite);
  });
  document.querySelectorAll('[data-mode="lite-only"]').forEach(el => {
    el.classList.toggle('hidden', !isLite);
  });

  // Lite: скрыть 4-й KPI «Топливо» в тултипе + переключить grid-cols
  const tipFuelEl = document.getElementById('tip-fuel');
  if (tipFuelEl) {
    const block = tipFuelEl.parentElement;
    const grid  = block ? block.parentElement : null;
    if (block) block.style.display = isLite ? 'none' : '';
    if (grid) {
      grid.classList.toggle('grid-cols-4', !isLite);
      grid.classList.toggle('grid-cols-3',  isLite);
    }
  }

  if (data.empty) {
    document.getElementById('dash-last-empty').classList.remove('hidden');
    document.getElementById('dash-last').classList.add('hidden');
    document.getElementById('dash-last').classList.remove('flex');
    document.getElementById('dash-total').textContent = 'Всего: 0 недель';
    return;
  }

  document.getElementById('dash-last-empty').classList.add('hidden');
  document.getElementById('dash-last').classList.remove('hidden');
  document.getElementById('dash-last').classList.add('flex');

  const w = data.lastWeek || {};
  document.getElementById('dash-period').textContent = w.dateRange || '—';
  document.getElementById('dash-platform').textContent = (w.platform || '') + ' • ' + (w.mode || '');
  document.getElementById('dash-net-cash').textContent = fmt(w.netCash);
  document.getElementById('dash-net-full').textContent = fmt(w.netFull);
  document.getElementById('dash-gross').textContent    = fmt(w.gross);
  document.getElementById('dash-card').textContent     = fmt(w.cardPayout);
  document.getElementById('dash-cash').textContent     = fmt(w.cash);
  const heroCash = document.getElementById('dash-hero-cash');
  if (heroCash) heroCash.textContent = fmt(w.cash);
  document.getElementById('dash-net').textContent      = fmt(w.net);
  document.getElementById('dash-fuel').textContent     = fmt(w.fuel);
  document.getElementById('dash-km').textContent       = (w.km || 0) + ' км';
  const totalN = data.totalReports || 0;
  document.getElementById('dash-total').textContent    = 'Всего: ' + totalN + ' ' + pluralWeeksShort(totalN);

  // === STACKED BAR CHART ===
  const spark = data.sparkline || [];
  const sparkTitle = document.getElementById('dash-sparkline-title');

  if (spark.length === 0) {
    if (sparkTitle) sparkTitle.textContent = 'Последние недели';
  } else {
    const sparkN = spark.length;
    if (sparkTitle) {
      sparkTitle.textContent = 'Последние ' + sparkN + ' ' + pluralWeeksShort(sparkN);
    }
  }

  renderSparkline(spark, isLite);

  // === ИТОГО ЗА N НЕДЕЛЬ ===
  const summaryTitle = document.getElementById('sum4-title');
  if (summaryTitle) {
    const s4N = Math.min(4, totalN);
    if (s4N > 0) {
      summaryTitle.textContent = 'Итого за ' + s4N + ' ' + pluralWeeksShort(s4N);
    } else {
      summaryTitle.textContent = 'Итого за 4 недели';
    }
  }

  const s4 = data.summary4 || {};
  document.getElementById('sum4-card').textContent = fmt(s4.card);
  document.getElementById('sum4-cash').textContent = fmt(s4.cash);
  document.getElementById('sum4-net').textContent  = fmt(s4.net);
  document.getElementById('sum4-fuel').textContent = fmt(s4.netFuel);
  document.getElementById('sum4-full').textContent = fmt(s4.netFull);
}

async function loadDashboard(force = false) {
  hideError();

  if (!force) {
    const cached = CACHE.get('GET:dashboard:{}');
    if (cached) {
      renderDashboard(cached);
      hideSkeleton('dashboard');
      fetchDashboard().then(fresh => { if (fresh.ok) renderDashboard(fresh); }).catch(() => {});
      return;
    }
  }

  if (!force) {
    const lsCached = LS.get('dashboard');
    if (lsCached && lsCached.ok) {
      CACHE.set('GET:dashboard:{}', lsCached);
      renderDashboard(lsCached);
      hideSkeleton('dashboard');
      fetchDashboard().then(fresh => {
        if (fresh.ok) renderDashboard(fresh);
      }).catch(() => {});
      return;
    }
  }

  showSkeleton('dashboard');
  try {
    const data = await fetchDashboard();
    if (!data.ok) {
      hideSkeleton('dashboard');
      showError(data.error || 'dashboard_failed');
      return;
    }
    renderDashboard(data);
  } catch (err) {
    showError('Dashboard: ' + err.message);
  } finally {
    hideSkeleton('dashboard');
  }
}

// === Queue ===
async function loadQueue() {
  hideError();

  const container = document.getElementById('queue-list');
  const hasRenderedContent = container && container.children.length > 0;

  const cached = CACHE.get('GET:queue:{}');
  if (cached) {
    renderQueue(cached.screenshots || []);
    updateQueueButtons(cached.screenshots || [], cached.hasPendingCash);
    apiGet('queue', {}, { fresh: true }).then(fresh => {
      if (fresh.ok) {
        renderQueue(fresh.screenshots || []);
        updateQueueButtons(fresh.screenshots || [], fresh.hasPendingCash);
      }
    }).catch(() => {});
    hideSkeleton('queue');
    return;
  }

  if (hasRenderedContent) {
    try {
      const data = await apiGet('queue', {}, { fresh: true });
      if (data.ok) {
        renderQueue(data.screenshots || []);
        updateQueueButtons(data.screenshots || [], data.hasPendingCash);
      }
    } catch (_) {}
    return;
  }

  showSkeleton('queue');
  try {
    const data = await apiGet('queue');
    if (!data.ok) { showError(data.error || 'queue_failed'); return; }
    renderQueue(data.screenshots || []);
    updateQueueButtons(data.screenshots || [], data.hasPendingCash);
  } catch (err) {
    showError('Queue: ' + err.message);
  } finally {
    hideSkeleton('queue');
  }
}

function updateQueueButtons(list, hasPendingCash) {
  const btnCalc   = document.getElementById('btn-go-calc');
  const btnClear  = document.getElementById('btn-clear-queue');
  if (!btnCalc || !btnClear) return;

  const hasShots = list.length > 0;
  const canCalc  = hasShots && !hasPendingCash;

  btnCalc.disabled = !canCalc;
  btnCalc.classList.toggle('opacity-40',         !canCalc);
  btnCalc.classList.toggle('cursor-not-allowed', !canCalc);

  btnClear.disabled = !hasShots;
  btnClear.classList.toggle('opacity-40',         !hasShots);
  btnClear.classList.toggle('cursor-not-allowed', !hasShots);

  const hint = document.getElementById('queue-hint');
  if (hint) {
    if (hasPendingCash) {
      hint.classList.remove('hidden');
      hint.textContent = 'Сначала укажите наличные Uber';
    } else {
      hint.classList.add('hidden');
    }
  }
}

function renderQueue(list) {
  const container = document.getElementById('queue-list');
  const empty = document.getElementById('queue-empty');
  document.getElementById('queue-count').textContent = list.length;

  if (!list.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  container.innerHTML = list.map((s, i) => {
    const cashPending = s.isUberStats && s.cashPending;
    const cardColor = s.platform === 'Bolt' ? 'bg-primary-fixed' : 'bg-secondary-container';

    let cashBlock = '';
    if (s.isUberStats) {
      if (cashPending) {
        cashBlock = `
          <div class="mt-3 bg-surface-container-lowest rounded-lg p-3">
            <div class="font-mono text-[10px] text-tertiary uppercase mb-2">💵 Наличные за период Uber?</div>
            <div class="flex gap-2">
              <input id="cash-${i}" type="number" step="0.01" value="0" inputmode="decimal" class="flex-1 bg-surface-container-high text-on-surface font-mono text-sm px-3 py-2 rounded-lg focus:outline-none">
              <button onclick="setCash(${i})" class="px-4 py-2 rounded-lg bg-primary text-on-primary font-mono text-xs font-semibold">OK</button>
            </div>
          </div>`;
      } else {
        cashBlock = `<div class="mt-2 font-mono text-[10px] text-on-surface-variant">Нал: ${fmt(s.cash)}</div>`;
      }
    }

    return `
      <div class="bg-surface-container rounded-xl p-4 border border-white/5 relative overflow-hidden">
        <div class="absolute left-0 top-0 bottom-0 w-1 ${cardColor}"></div>
        <div class="flex items-start justify-between gap-2 pl-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2 py-0.5 rounded-full bg-surface-container-high font-mono text-[10px] font-bold">${esc(s.platform)}</span>
              <span class="font-mono text-[10px] text-on-surface-variant">${esc(s.dateRange || '—')}</span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
              <div><span class="text-on-surface-variant">Брутто:</span> <span class="font-semibold">${fmt(s.gross)}</span></div>
              <div><span class="text-on-surface-variant">Нетто:</span> <span class="font-semibold text-primary">${fmt(s.net)}</span></div>
              <div><span class="text-on-surface-variant">Нал:</span> <span class="text-tertiary font-semibold">${fmt(s.cash)}</span></div>
              <div><span class="text-on-surface-variant">Бонусы:</span> <span>${fmt(s.bonuses)}</span></div>
            </div>
            ${cashBlock}
          </div>
          <button onclick="removeScreen(${i}, this)" class="p-2 rounded-lg bg-surface-container-high hover:bg-error/20 text-error shrink-0">
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </div>`;
  }).join('');
}

let removingInProgress = false;

async function removeScreen(index, btn) {
  if (removingInProgress) return;
  removingInProgress = true;
  hideError();

  const card = btn ? btn.closest('.bg-surface-container.rounded-xl.p-4') : null;
  if (card) {
    card.style.transition = 'opacity 0.2s';
    card.style.opacity = '0.4';
    card.style.pointerEvents = 'none';
  }

  document.querySelectorAll('#queue-list button[onclick^="removeScreen"]').forEach(b => {
    b.disabled = true;
    b.classList.add('opacity-50', 'cursor-wait');
  });

  try {
    const data = await apiPost('removeScreenshot', { index });
    if (!data.ok) {
      if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
      document.querySelectorAll('#queue-list button[onclick^="removeScreen"]').forEach(b => {
        b.disabled = false;
        b.classList.remove('opacity-50', 'cursor-wait');
      });
      removingInProgress = false;
      return showError(data.error || 'remove_failed');
    }

    if (data.queue) {
      renderQueue(data.queue);
      updateQueueButtons(data.queue, data.hasPendingCash);
    } else {
      loadQueue();
    }
  } catch (err) {
    if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
    showError('Network: ' + err.message);
  } finally {
    removingInProgress = false;
  }
}

async function setCash(index) {
  hideError();
  const el = document.getElementById('cash-' + index);
  const val = el ? (parseFloat(el.value) || 0) : 0;
  if (val < 0) return showError('Наличные не могут быть отрицательными');
  const data = await apiPost('updateCash', { index, cash: val });
  if (!data.ok) return showError(data.error || 'update_failed');
  loadQueue();
}

async function clearQueue() {
  const ok = confirm('Удалить все скрины из очереди?');
  if (!ok) return;

  hideError();
  const data = await apiPost('clearQueue');
  if (!data.ok) return showError(data.error || 'clear_failed');
  toast('🗑 Очередь очищена');
  loadQueue();
}

function goToCalculation() {
  const btnCalc = document.getElementById('btn-go-calc');
  if (btnCalc && btnCalc.disabled) {
    return toast('❌ Сначала загрузите скрины', 'error');
  }
  goToTab(TAB_ORDER.indexOf('calculator'), true);
}
window.goToCalculation = goToCalculation;

// === Upload ===
document.getElementById('file-input').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const status = document.getElementById('upload-status');

  const items = files.map(f => ({
    name: f.name,
    file: f,
    state: 'queued',
    platform: '',
    error: ''
  }));

  function renderUploadStatus() {
    const total = items.length;
    const done = items.filter(i => i.state === 'ok' || i.state === 'error').length;
    const allDone = done === total;
    const okCount = items.filter(i => i.state === 'ok').length;
    const errCount = items.filter(i => i.state === 'error').length;

    let headerText, headerColor;
    if (!allDone) {
      headerText = `📸 Загрузка ${Math.min(done + 1, total)} из ${total}`;
      headerColor = 'text-primary';
    } else if (errCount === 0) {
      headerText = `✅ Готово: ${okCount} ${okCount === 1 ? 'файл' : 'файлов'}`;
      headerColor = 'text-primary';
    } else if (okCount === 0) {
      headerText = `❌ Не удалось: ${errCount}`;
      headerColor = 'text-error';
    } else {
      headerText = `⚠️ Готово: ${okCount} ✓, ${errCount} ✗`;
      headerColor = 'text-tertiary';
    }

    const rows = items.map(it => {
      const shortName = it.name.length > 22 ? it.name.substring(0, 19) + '...' : it.name;
      let icon, label, cls;
      if (it.state === 'queued') {
        icon = '⏸'; label = 'в очереди'; cls = 'text-on-surface-variant';
      } else if (it.state === 'loading') {
        icon = '<span class="spinner inline-block">🔄</span>';
        label = 'распознаю...'; cls = 'text-primary';
      } else if (it.state === 'ok') {
        icon = '✅';
        label = it.platform || 'распознан';
        cls = 'text-primary';
      } else {
        icon = '❌';
        label = it.error || 'ошибка';
        cls = 'text-error';
      }
      return `<div class="flex items-center gap-2 ${cls}">
        <span class="shrink-0 w-5 text-center">${icon}</span>
        <span class="truncate flex-1">${esc(shortName)}</span>
        <span class="shrink-0 text-[10px] opacity-80">${esc(label)}</span>
      </div>`;
    }).join('');

    status.innerHTML = `
      <div class="flex flex-col gap-2">
        <div class="font-mono text-[11px] font-bold uppercase ${headerColor}">${headerText}</div>
        <div class="flex flex-col gap-1 font-mono text-[11px]">${rows}</div>
      </div>`;
  }

  status.classList.remove('hidden');
  renderUploadStatus();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    it.state = 'loading';
    renderUploadStatus();

    try {
      const base64 = await fileToBase64Compressed(it.file);
      const data = await apiPost('uploadScreenshot', { base64, filename: it.file.name });
      if (!data.ok) {
        it.state = 'error';
        it.error = data.error === 'pending_cash'
          ? 'сначала укажите нал Uber'
          : (data.error || 'ошибка');
      } else {
        it.state = 'ok';
        it.platform = data.parsed.platform || 'распознан';
      }
    } catch (err) {
      it.state = 'error';
      it.error = err.message;
    }
    renderUploadStatus();
  }

  e.target.value = '';

  setTimeout(() => {
    status.classList.add('hidden');
    loadQueue();
  }, 4000);
});

function fileToBase64Compressed(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

// === Calculator ===
let calcDefaults = null;
let queueTotals = { gross: 0, net: 0, cash: 0, bonuses: 0 };
let promoManual = false;

function resetCalcInputs() {
  promoManual = false;
  const promoEl = document.getElementById('in-promo-base');
  if (promoEl) promoEl.value = '0.00';
  const zusEl = document.getElementById('in-zus-toggle');
  if (zusEl) zusEl.checked = false;
}

function applyCalcMode(mode) {
  const isLite = (mode || 'lite') === 'lite';
  document.querySelectorAll('[data-calc-pro-only]').forEach(el => {
    el.classList.toggle('hidden', isLite);
  });
}

async function loadCalcDefaults(force = false) {
  hideError();
  try {
    let data = !force ? CACHE.get('GET:settings:{}') : null;
    if (!data && !force) {
      const lsCached = LS.get('settings');
      if (lsCached && lsCached.ok) {
        CACHE.set('GET:settings:{}', lsCached);
        data = lsCached;
      }
    }
    if (!data) {
      data = await apiGet('settings', {}, { fresh: force });
    }
    if (!data.ok) return showError(data.error || 'settings_failed');
    calcDefaults = data.settings;

    applyCalcMode(calcDefaults.mode);

    if (calcDefaults.mode !== 'lite') {
      document.getElementById('in-dep-rate').value = calcDefaults.depRate;
    }

    try {
      const q = await apiGet('queue', {}, { fresh: force });
      if (q.ok && q.screenshots && q.screenshots.length) {
        queueTotals = {
          gross:   q.screenshots.reduce((a, s) => a + (Number(s.gross)   || 0), 0),
          net:     q.screenshots.reduce((a, s) => a + (Number(s.net)     || 0), 0),
          cash:    q.screenshots.reduce((a, s) => a + (Number(s.cash)    || 0), 0),
          bonuses: q.screenshots.reduce((a, s) => a + (Number(s.bonuses) || 0), 0)
        };

        document.getElementById('in-gross').value = queueTotals.gross.toFixed(2);
        document.getElementById('in-net').value   = queueTotals.net.toFixed(2);
        document.getElementById('in-cash').value  = queueTotals.cash.toFixed(2);

        const promoEl = document.getElementById('in-promo-base');
        if (promoEl && !promoManual) promoEl.value = queueTotals.bonuses.toFixed(2);
      } else {
        queueTotals = { gross: 0, net: 0, cash: 0, bonuses: 0 };
        document.getElementById('in-gross').value = '0.00';
        document.getElementById('in-net').value   = '0.00';
        document.getElementById('in-cash').value  = '0.00';
        const promoEl = document.getElementById('in-promo-base');
        if (promoEl && !promoManual) promoEl.value = '0.00';
      }
    } catch (_) {}

    recalc();
  } catch (err) { showError('Settings: ' + err.message); }
}

function recalc() {
  const gross      = parseFloat(document.getElementById('in-gross').value) || 0;
  const net        = parseFloat(document.getElementById('in-net').value)   || 0;
  const cash       = parseFloat(document.getElementById('in-cash').value)  || 0;
  const promoBase  = parseFloat(document.getElementById('in-promo-base').value) || 0;
  const includeZus = document.getElementById('in-zus-toggle').checked;

  if (!calcDefaults) return;
  const s = calcDefaults;
  const isLite = (s.mode || 'lite') === 'lite';

  const km          = isLite ? 0 : (parseFloat(document.getElementById('in-km').value)    || 0);
  const fuel        = isLite ? 0 : (parseFloat(document.getElementById('in-fuel').value)  || 0);
  const depRate     = isLite ? 0 : (parseFloat(document.getElementById('in-dep-rate').value) || 0);
  const includeFuel = isLite ? false : document.getElementById('in-fuel-toggle').checked;

  const partnerBaseAmount = s.partnerBase === 'net' ? net : gross;
  const partnerVat = partnerBaseAmount * s.partnerPct;
  const promoTax   = promoBase * s.promoTaxPct;
  const zus        = includeZus ? s.zus : 0;
  const dep        = km * depRate;

  const cardPayout = net - cash - partnerVat - promoTax - s.weeklyFee - zus;
  const fuelCost   = includeFuel ? fuel : 0;
  const netCash    = cardPayout + cash;
  const netFuel    = netCash - fuelCost;
  const netFull    = netCash - fuelCost - dep;

  document.getElementById('p-gross').textContent     = fmt(gross);
  document.getElementById('p-net-input').textContent = fmt(net);
  document.getElementById('p-vat').textContent       = '-' + fmt(partnerVat);
  document.getElementById('p-bonustax').textContent  = '-' + fmt(promoTax);
  document.getElementById('p-fee').textContent       = '-' + fmt(s.weeklyFee);
  document.getElementById('p-zus').textContent       = '-' + fmt(zus);
  document.getElementById('p-cash').textContent      = '-' + fmt(cash);
  document.getElementById('p-card').textContent      = fmt(cardPayout);
  document.getElementById('p-fuel').textContent      = '-' + fmt(fuelCost);
  document.getElementById('p-dep').textContent       = '-' + fmt(dep);
  document.getElementById('p-net').textContent       = fmt(netFull);
  document.getElementById('calc-hero-net').textContent  = fmt(netFull);
  document.getElementById('calc-hero-card').textContent = fmt(cardPayout);
}

['in-km','in-fuel','in-promo-base','in-dep-rate','in-zus-toggle','in-fuel-toggle']
  .forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalc);
  });

(function () {
  const el = document.getElementById('in-promo-base');
  if (el) el.addEventListener('input', () => { promoManual = true; });
})();

// === Save Report ===
async function saveReport() {
  hideError();
  const btn = document.querySelector('button[onclick="saveReport()"]');
  await withButtonLoading(btn, async () => {
    try {
      const queueData = await apiGet('queue', {}, { fresh: true });
      if (!queueData.ok) return toast('❌ ' + (queueData.error || 'queue_failed'), 'error');
      if (!queueData.screenshots || !queueData.screenshots.length) {
        return toast('❌ Загрузите скрины', 'error');
      }
      if (queueData.hasPendingCash) {
        return toast('❌ Сначала укажите наличные Uber', 'error');
      }

      const isLite = (calcDefaults && calcDefaults.mode === 'lite');
      const params = {
        screenshots: queueData.screenshots,
        km:      isLite ? 0 : (parseFloat(document.getElementById('in-km').value) || 0),
        fuel:    isLite ? 0 : (parseFloat(document.getElementById('in-fuel').value) || 0),
        depRate: isLite ? 0 : (parseFloat(document.getElementById('in-dep-rate').value) || 0),
        promoBonusBase: parseFloat(document.getElementById('in-promo-base').value) || 0,
        includeZus: document.getElementById('in-zus-toggle').checked,
        includeFuel: isLite ? false : document.getElementById('in-fuel-toggle').checked
      };

      const data = await apiPost('saveReport', { params });
      if (!data.ok) return toast('❌ ' + (data.error || 'save_failed'), 'error');

      resetCalcInputs();
      toast('✅ Отчёт сохранён. Очередь очищена.');
      setTimeout(() => goToTab(TAB_ORDER.indexOf('dashboard'), true), 800);
    } catch (err) {
      toast('❌ ' + err.message, 'error');
    }
  }, 'Расчёт...');
}
window.saveReport = saveReport;

// === Settings ===
async function loadSettings() {
  hideError();

  const cached = CACHE.get('GET:settings:{}');
  if (cached && cached.ok) {
    renderSettings(cached.settings);
    hideSkeleton('settings');
    apiGet('settings', {}, { fresh: true }).then(fresh => {
      if (fresh.ok) renderSettings(fresh.settings);
    }).catch(() => {});
    return;
  }

  const lsCached = LS.get('settings');
  if (lsCached && lsCached.ok) {
    CACHE.set('GET:settings:{}', lsCached);
    renderSettings(lsCached.settings);
    hideSkeleton('settings');
    apiGet('settings', {}, { fresh: true }).then(fresh => {
      if (fresh.ok) renderSettings(fresh.settings);
    }).catch(() => {});
    return;
  }

  showSkeleton('settings');
  try {
    const data = await apiGet('settings');
    if (!data.ok) {
      hideSkeleton('settings');
      return showError(data.error || 'settings_failed');
    }
    renderSettings(data.settings);
    hideSkeleton('settings');
  } catch (err) {
    showError('Settings: ' + err.message);
    hideSkeleton('settings');
  } finally {
    hideSkeleton('settings');
  }
}

function renderSettings(s) {
  if (!s || typeof s !== 'object') {
    showError('Настройки не получены');
    return;
  }
  try {
    document.getElementById('set-partner-pct').value = ((Number(s.partnerPct) || 0) * 100).toFixed(2);
    document.getElementById('set-promo-tax').value   = ((Number(s.promoTaxPct) || 0) * 100).toFixed(2);
    document.getElementById('set-weekly-fee').value  = Number(s.weeklyFee) || 0;
    document.getElementById('set-zus').value         = Number(s.zus) || 0;
    document.getElementById('set-dep-rate').value    = Number(s.depRate) || 0;

    setActiveMode(s.mode || 'lite');
    setActiveBase(s.partnerBase || 'gross');
    calcDefaults = s;

    clearSettingsDirty();
  } catch (err) {
    showError('renderSettings: ' + err.message);
  }
}

async function saveSettings() {
  hideError();
  const btn = document.getElementById('btn-save-settings') ||
              document.querySelector('button[onclick="saveSettings()"]');
  await withButtonLoading(btn, async () => {
    const settings = {
      partnerPct:  (parseFloat(document.getElementById('set-partner-pct').value) || 0) / 100,
      promoTaxPct: (parseFloat(document.getElementById('set-promo-tax').value) || 0) / 100,
      weeklyFee:   parseFloat(document.getElementById('set-weekly-fee').value) || 0,
      zus:         parseFloat(document.getElementById('set-zus').value) || 0,
      depRate:     parseFloat(document.getElementById('set-dep-rate').value) || 0,
      partnerBase: currentBase,
      mode:        currentMode
    };
    const data = await apiPost('saveSettings', { settings });
    if (data.ok) {
      toast('✅ Настройки сохранены');
      calcDefaults = data.settings;
      clearSettingsDirty();
    } else {
      toast('❌ ' + (data.error || 'save_failed'), 'error');
    }
  }, 'Сохранение...');
}
window.saveSettings = saveSettings;

async function resetSettings() {
  if (!confirm('Сбросить настройки к дефолтным?')) return;
  hideError();
  const btn = document.querySelector('button[onclick="resetSettings()"]');
  await withButtonLoading(btn, async () => {
    const defaults = {
      partnerPct: 0.05, partnerBase: 'gross', promoTaxPct: 0.23,
      weeklyFee: 60, zus: 350, depRate: 0.50, mode: 'lite'
    };
    const data = await apiPost('saveSettings', { settings: defaults });
    if (data.ok) {
      toast('✅ Сброшено');
      calcDefaults = data.settings;
      clearSettingsDirty();
      loadSettings();
    } else {
      toast('❌ ' + (data.error || 'reset_failed'), 'error');
    }
  }, 'Сброс...');
}
window.resetSettings = resetSettings;

// === History ===
async function loadHistory(force = false) {
  hideError();

  showSkeleton('history');

  try {
    const data = await apiGet('history', { limit: 100 }, { fresh: force });
    if (!data.ok) {
      hideSkeleton('history');
      return showError(data.error || 'history_failed');
    }

    const list = data.history || [];
    renderHistory(list);
  } catch (err) {
    showError('History: ' + err.message);
  } finally {
    hideSkeleton('history');
  }
}

function renderHistory(list) {
  const container = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const summary = document.getElementById('history-summary');
  const count = document.getElementById('history-count');

  count.textContent = list.length + ' ' + pluralWeeksShort(list.length);

  if (!list.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    summary.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  summary.classList.remove('hidden');

  container.innerHTML = list.map((r, i) => {
    const modeLabel = (r.mode || 'lite') === 'lite' ? 'lite' : 'pro';
    const plat = r.platform || '—';
    const period = r.dateRange || '—';
    const isPro = modeLabel === 'pro';
    const isFirst = i === 0;

    let fuelCostPer100 = '—';
    if (r.km > 0 && r.fuel > 0) {
      fuelCostPer100 = ((r.fuel / r.km) * 100).toFixed(2).replace('.', ',') + ' zł / 100 км';
    }

    const totalTaxes = (r.partnerVat || 0) + (r.bonusTax || 0) + (r.partnerFee || 0) + (r.zus || 0);

    let carBlock = '';
    if (isPro) {
      carBlock = `
        <div class="px-4 py-3 border-b border-app-border/40 space-y-2.5 bg-slate-900/20">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
            <span>Расходы на авто</span>
            <span class="text-[11px] text-slate-400 font-normal">${r.km || 0} км пробег</span>
          </div>
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between items-center">
              <div>
                <span class="text-slate-300">Топливо</span>
                <span class="text-[11px] text-sky-400/90 block">${fuelCostPer100}</span>
              </div>
              <span class="font-semibold text-app-danger tabular-nums">-${fmt(r.fuel)}</span>
            </div>
            <div class="flex justify-between items-center pt-0.5">
              <span class="text-slate-300">Амортизация</span>
              <span class="font-semibold text-app-danger tabular-nums">-${fmt(r.depreciation)}</span>
            </div>
          </div>
        </div>`;
    }

    if (isFirst) {
      return `
        <article class="history-card bg-app-card rounded-2xl border border-emerald-500/25 shadow-lg shadow-black/40 overflow-hidden mb-3 cursor-pointer" data-index="${i}">
          <div class="p-4 bg-gradient-to-b from-app-surface/90 to-app-card border-b border-app-border/60 flex items-center justify-between">
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-700/60 text-xs font-semibold text-slate-200">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                ${esc(plat)}
              </div>
              <span class="text-xs text-app-subtext font-medium">${esc(period)}</span>
              <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">${esc(modeLabel)}</span>
            </div>
            <span class="material-symbols-outlined text-slate-400 history-chevron text-xl">expand_less</span>
          </div>

          <div class="p-4 bg-app-card/60 grid grid-cols-2 gap-3 border-b border-app-border/40">
            <div class="bg-app-surface/60 rounded-xl p-3 border border-emerald-500/20 relative overflow-hidden">
              <div class="text-[11px] uppercase tracking-wider font-semibold text-emerald-400/90 mb-1 flex items-center gap-1">
                <span>Профит (чистыми)</span>
              </div>
              <div class="text-xl font-bold tracking-tight text-emerald-400 tabular-nums">
                ${fmt(r.netFull)}
              </div>
              <span class="text-[10px] text-slate-400 block mt-0.5">после всех расходов</span>
            </div>
            <div class="bg-app-surface/60 rounded-xl p-3 border border-app-border/70 relative">
              <div class="text-[11px] uppercase tracking-wider font-semibold text-slate-300 mb-1">
                К выплате
              </div>
              <div class="text-xl font-bold tracking-tight text-white tabular-nums">
                ${fmt(r.netCash)}
              </div>
              <span class="text-[10px] text-app-subtext block mt-0.5">с учётом налички</span>
            </div>
          </div>

          <div class="history-details">
            <div class="px-4 py-3 border-b border-app-border/40 space-y-2.5">
              <div class="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <span>Доход от заказов</span>
                <span class="text-[11px] text-emerald-400 lowercase font-normal">за неделю</span>
              </div>
              <div class="space-y-1.5 text-xs">
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Брутто</span>
                  <span class="font-medium text-slate-200 tabular-nums">${fmt(r.gross)}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Нетто</span>
                  <span class="font-semibold text-white tabular-nums">${fmt(r.net)}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Бонусы парка / сервисов</span>
                  <span class="font-medium text-emerald-400 tabular-nums">+${fmt(r.bonuses)}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Наличные от пассажиров</span>
                  <span class="font-medium text-amber-300/90 tabular-nums">${fmt(r.cash)}</span>
                </div>
              </div>
            </div>

            ${carBlock}

            <div class="px-4 py-3 border-b border-app-border/40 space-y-2.5">
              <div class="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <span>Налоги и комиссии</span>
                <span class="text-[11px] text-rose-400/80 font-normal">-${fmt(totalTaxes)}</span>
              </div>
              <div class="space-y-1.5 text-xs">
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Партнёрка (${(r.partnerPct * 100).toFixed(2)}%)</span>
                  <span class="font-medium text-app-danger tabular-nums">-${fmt(r.partnerVat)}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Налог на бонусы</span>
                  <span class="font-medium text-app-danger tabular-nums">-${fmt(r.bonusTax)}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Комиссия</span>
                  <span class="font-medium text-app-danger tabular-nums">-${fmt(r.partnerFee)}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">ZUS</span>
                  <span class="font-medium text-app-danger tabular-nums">-${fmt(r.zus)}</span>
                </div>
              </div>
            </div>

            <div class="p-3 bg-app-surface/80 m-3 rounded-xl border border-app-border space-y-2">
              <div class="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm text-emerald-400">credit_card</span>
                Распределение выплаты
              </div>
              <div class="flex items-center justify-between text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <div class="flex items-center gap-2">
                  <div class="w-5 h-4 bg-amber-400/20 border border-amber-400/40 rounded flex items-center justify-center text-[9px] text-amber-300 font-bold">💳</div>
                  <span class="text-slate-200 font-medium">Перевод на карту</span>
                </div>
                <span class="font-bold text-white tabular-nums">${fmt(r.cardPayout)}</span>
              </div>
              <div class="flex items-center justify-between text-xs pt-1 px-1">
                <span class="text-slate-400">Наличные на руках:</span>
                <span class="font-medium text-slate-200 tabular-nums">${fmt(r.cash)}</span>
              </div>
              <div class="flex items-center justify-between text-xs pt-0.5 px-1 border-t border-slate-800/80">
                <span class="text-emerald-400 font-semibold">Итого на руки:</span>
                <span class="font-bold text-emerald-400 tabular-nums text-sm">${fmt(r.netCash)}</span>
              </div>
            </div>
          </div>
        </article>
      `;
    }

    return `
      <article class="history-card bg-app-card rounded-xl p-3.5 border border-app-border/80 hover:border-slate-700 transition mb-2.5 cursor-pointer" data-index="${i}">
        <div class="flex items-center justify-between">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-semibold text-slate-300 border border-slate-700">${esc(plat)}</span>
              <span class="text-xs text-app-subtext">${esc(period)}</span>
            </div>
            <div class="flex items-center gap-3 text-xs pt-0.5">
              <span class="text-slate-400">На руки: <strong class="text-emerald-400 tabular-nums font-semibold">${fmt(r.netCash)}</strong></span>
              <span class="text-slate-600">•</span>
              <span class="text-slate-400">Профит: <strong class="text-slate-200 tabular-nums font-medium">${fmt(r.netFull)}</strong></span>
            </div>
          </div>
          <span class="material-symbols-outlined text-slate-400 history-chevron text-xl">expand_more</span>
        </div>

        <div class="history-details hidden mt-3 pt-3 border-t border-app-border/40">
          <div class="space-y-2.5 mb-3">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>Доход от заказов</span>
            </div>
            <div class="space-y-1.5 text-xs">
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Брутто</span>
                <span class="font-medium text-slate-200 tabular-nums">${fmt(r.gross)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Нетто</span>
                <span class="font-semibold text-white tabular-nums">${fmt(r.net)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Бонусы</span>
                <span class="font-medium text-emerald-400 tabular-nums">+${fmt(r.bonuses)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Наличные</span>
                <span class="font-medium text-amber-300/90 tabular-nums">${fmt(r.cash)}</span>
              </div>
            </div>
          </div>

          ${isPro ? carBlock : ''}

          <div class="space-y-2.5 mt-3">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>Налоги и комиссии</span>
              <span class="text-[11px] text-rose-400/80 font-normal">-${fmt(totalTaxes)}</span>
            </div>
            <div class="space-y-1.5 text-xs">
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Партнёрка</span>
                <span class="font-medium text-app-danger tabular-nums">-${fmt(r.partnerVat)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Налог на бонусы</span>
                <span class="font-medium text-app-danger tabular-nums">-${fmt(r.bonusTax)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Комиссия</span>
                <span class="font-medium text-app-danger tabular-nums">-${fmt(r.partnerFee)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">ZUS</span>
                <span class="font-medium text-app-danger tabular-nums">-${fmt(r.zus)}</span>
              </div>
            </div>
          </div>

          <div class="mt-3 p-2.5 bg-app-surface/80 rounded-lg border border-app-border space-y-1.5">
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-400">На карту:</span>
              <span class="font-semibold text-white tabular-nums">${fmt(r.cardPayout)}</span>
            </div>
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-400">Наличные:</span>
              <span class="font-medium text-slate-200 tabular-nums">${fmt(r.cash)}</span>
            </div>
            <div class="flex justify-between items-center text-xs pt-1 border-t border-app-border/60">
              <span class="text-emerald-400 font-semibold">Итого на руки:</span>
              <span class="font-bold text-emerald-400 tabular-nums">${fmt(r.netCash)}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('.history-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;

      const details = card.querySelector('.history-details');
      const chevron = card.querySelector('.history-chevron');
      if (!details || !chevron) return;

      const isOpen = !details.classList.contains('hidden');

      if (isOpen) {
        details.classList.add('hidden');
        chevron.textContent = 'expand_more';
      } else {
        details.classList.remove('hidden');
        chevron.textContent = 'expand_less';
      }
    });
  });

  const recent = list.slice(0, 4);
  const s = { card: 0, cash: 0, net: 0, netFuel: 0, netFull: 0 };
  recent.forEach(r => {
    s.card    += Number(r.cardPayout) || 0;
    s.cash    += Number(r.cash) || 0;
    s.net     += Number(r.netCash) || 0;
    s.netFuel += Number(r.netFuel) || 0;
    s.netFull += Number(r.netFull) || 0;
  });

  document.getElementById('hist-sum-card').textContent = fmt(s.card);
  document.getElementById('hist-sum-cash').textContent = fmt(s.cash);
  document.getElementById('hist-sum-net').textContent  = fmt(s.net);
  document.getElementById('hist-sum-fuel').textContent = fmt(s.netFuel);
  document.getElementById('hist-sum-full').textContent = fmt(s.netFull);

  const summaryN = Math.min(4, list.length);
  document.getElementById('history-summary-title').textContent =
    'Итого за ' + summaryN + ' ' + pluralWeeksShort(summaryN);
}

// === Mode / Base toggle ===
let currentMode = 'lite';
let currentBase = 'gross';

function setActiveMode(mode) {
  currentMode = mode;

  const lite  = document.getElementById('set-lite');
  const pro   = document.getElementById('set-pro');
  const hLite = document.getElementById('hdr-lite');
  const hPro  = document.getElementById('hdr-pro');

  const onSet  = 'flex-1 py-2 rounded-full font-mono text-xs font-bold uppercase transition-all bg-primary text-on-primary';
  const offSet = 'flex-1 py-2 rounded-full font-mono text-xs font-semibold uppercase transition-all text-on-surface-variant';
  const onHdr  = 'px-2 py-1 rounded-full bg-primary text-on-primary font-mono text-[10px] font-bold uppercase transition-all';
  const offHdr = 'px-2 py-1 rounded-full text-on-surface-variant font-mono text-[10px] font-semibold uppercase hover:text-on-surface transition-all';

  if (lite && pro) {
    lite.className = mode === 'lite' ? onSet : offSet;
    pro.className  = mode === 'pro'  ? onSet : offSet;
  }
  if (hLite && hPro) {
    hLite.className = mode === 'lite' ? onHdr : offHdr;
    hPro.className  = mode === 'pro'  ? onHdr : offHdr;
  }

  if (typeof applyCalcMode === 'function') applyCalcMode(mode);
}

function setActiveBase(base) {
  currentBase = base;
  const g = document.getElementById('set-base-gross');
  const n = document.getElementById('set-base-net');
  if (!g || !n) return;

  const on  = 'flex-1 py-2 rounded-full font-mono text-xs font-bold uppercase transition-all bg-primary text-on-primary';
  const off = 'flex-1 py-2 rounded-full font-mono text-xs font-semibold uppercase transition-all text-on-surface-variant';

  g.className = base === 'gross' ? on : off;
  n.className = base === 'net'   ? on : off;
}

// === Слушатели кнопок Settings ===
document.getElementById('set-lite').addEventListener('click', async () => {
  setActiveMode('lite');
  const r = await apiPost('saveSettings', { settings: { mode: 'lite' } });
  if (r.ok) calcDefaults = r.settings;
});
document.getElementById('set-pro').addEventListener('click', async () => {
  setActiveMode('pro');
  const r = await apiPost('saveSettings', { settings: { mode: 'pro' } });
  if (r.ok) calcDefaults = r.settings;
});
document.getElementById('set-base-gross').addEventListener('click', async () => {
  setActiveBase('gross');
  const r = await apiPost('saveSettings', { settings: { partnerBase: 'gross' } });
  if (r.ok) calcDefaults = r.settings;
});
document.getElementById('set-base-net').addEventListener('click', async () => {
  setActiveBase('net');
  const r = await apiPost('saveSettings', { settings: { partnerBase: 'net' } });
  if (r.ok) calcDefaults = r.settings;
});

document.getElementById('hdr-lite').addEventListener('click', async () => {
  setActiveMode('lite');
  const r = await apiPost('saveSettings', { settings: { mode: 'lite' } });
  if (r.ok) calcDefaults = r.settings;
});
document.getElementById('hdr-pro').addEventListener('click', async () => {
  setActiveMode('pro');
  const r = await apiPost('saveSettings', { settings: { mode: 'pro' } });
  if (r.ok) calcDefaults = r.settings;
});

// === Init ===
window.addEventListener('DOMContentLoaded', async () => {
  hideLoading();

  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor && tg.setHeaderColor('#10141a');
    tg.setBackgroundColor && tg.setBackgroundColor('#10141a');

    applyTelegramInsets();

    if (tg.onEvent) {
      tg.onEvent('viewportChanged', applyTelegramInsets);
      tg.onEvent('safeAreaChanged', applyTelegramInsets);
      tg.onEvent('fullscreenChanged', applyTelegramInsets);
    }
  }

  bindSettingsDirtyTracking();
  bindSwipeGestures();

  PROGRESS.show();
  PROGRESS.set(15);

  if (!initData) {
    showError('Откройте приложение через Telegram-бота');
    PROGRESS.done();
    return;
  }

  const cachedDash = LS.get('dashboard');
  if (cachedDash && cachedDash.ok) {
    CACHE.set('GET:dashboard:{}', cachedDash);
    renderDashboard(cachedDash);
    hideSkeleton('dashboard');
    goToTab(0, false);
    PROGRESS.set(60);
  }

  try {
    PROGRESS.set(40);
    const [auth, dash] = await Promise.all([
      apiGet('verify'),
      apiGet('dashboard', {}, { fresh: !!cachedDash })
    ]);
    PROGRESS.set(85);

    if (!auth.ok) {
      showError('Авторизация не прошла: ' + (auth.reason || auth.error));
      PROGRESS.done();
      return;
    }

    if (!cachedDash) {
      goToTab(0, false);
    }

    PROGRESS.set(100);
  } catch (err) {
    showError('Не удалось подключиться к API: ' + err.message);
  } finally {
    PROGRESS.done();

    // Позиционируем пилюлю после полной загрузки
    setTimeout(() => {
      measureViewport();
      movePill(tabBtns[currentIndex], false);
    }, 100);
  }
});
