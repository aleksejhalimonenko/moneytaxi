/* ═══════════════════════════════════════════════════
   MoneyTaxi WebApp — frontend logic
   v28.5 — + Telegram safeAreaInset fix (iOS/Android fullscreen)
   ═══════════════════════════════════════════════════ */

const API_URL = 'https://script.google.com/macros/s/AKfycby2d4bxoQXLz-lBXz5RRmNimhuy64n6Gq-AWvuYlla0VAz6SUoxKcq1eRD2-M1bpGQW/exec';

// === Telegram WebApp initData ===
const tg = window.Telegram && window.Telegram.WebApp;
const initData = tg ? (tg.initData || '') : '';

// === CACHE VERSION — автосброс старого кэша при обновлении ===
const APP_VERSION = 'v28.5';
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

/**
 * Универсальный toast
 * @param {string} msg — текст
 * @param {string} type — 'success' (по умолчанию) | 'error' | 'info'
 */
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

/**
 * Блокирует кнопку на время выполнения fn().
 * Восстанавливает исходное состояние по завершении (успех или ошибка).
 */
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
/**
 * Применяет реальные insets от Telegram (Bot API 8.0+).
 * Кладёт их в CSS-переменные --tg-inset-*.
 * Если версия Telegram < 8.0 — тихо выходим, остаются env(safe-area-*).
 */
function applyTelegramInsets() {
  if (!tg) return;

  const version = (tg.version || '').toString();
  const hasApi = tg.isVersionAtLeast && tg.isVersionAtLeast('8.0');

  // Резервный путь: если API нет — используем системные env(safe-area-inset-*)
  // через CSS, ничего сюда не пишем.
  if (!hasApi && !tg.safeAreaInset) return;

  const inset = tg.safeAreaInset || {};
  const root = document.documentElement;

  const top    = Math.max(0, Math.round(inset.top    || 0));
  const bottom = Math.max(0, Math.round(inset.bottom || 0));
  const left   = Math.max(0, Math.round(inset.left   || 0));
  const right  = Math.max(0, Math.round(inset.right  || 0));

  root.style.setProperty('--tg-inset-top',    top    + 'px');
  root.style.setProperty('--tg-inset-bottom', bottom + 'px');
  root.style.setProperty('--tg-inset-left',   left   + 'px');
  root.style.setProperty('--tg-inset-right',  right  + 'px');

  // Стабильная высота viewport (не прыгает при открытой клавиатуре)
  if (tg.viewportStableHeight) {
    root.style.setProperty('--tg-vh', tg.viewportStableHeight + 'px');
  }

  if (typeof DEBUG_TG_LAYOUT !== 'undefined' && DEBUG_TG_LAYOUT) {
    console.log('[MoneyTaxi] tg.version:', version,
                '| safeAreaInset:', inset,
                '| viewportStableHeight:', tg.viewportStableHeight,
                '| isFullscreen:', tg.isFullscreen);
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
  // Только числовые поля. Toggle (Lite/Pro, gross/net) сохраняются моментально и не считаются "грязными"
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

// === SKELETON ===
function showSkeleton(name) {
  const sk = document.getElementById('skeleton-' + name);
  if (sk) { sk.classList.remove('hidden'); sk.classList.add('flex'); }
  if (name === 'dashboard') {
    const c = document.getElementById('dash-content');
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

// === Tab Switching ===
function switchTab(name) {
  document.querySelectorAll('#tab-dashboard, #tab-screenshots, #tab-calculator, #tab-settings')
    .forEach(el => { el.classList.add('hidden'); el.classList.remove('flex'); });

  const target = document.getElementById('tab-' + name);
  if (!target) return;
  target.classList.remove('hidden');
  target.classList.add('flex');
  target.classList.add('fade-in');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === name) {
      btn.classList.add('text-primary');
      btn.classList.remove('text-on-surface-variant');
    } else {
      btn.classList.remove('text-primary');
      btn.classList.add('text-on-surface-variant');
    }
  });

  if (name === 'dashboard')   loadDashboard();
  if (name === 'screenshots') loadQueue();
  if (name === 'calculator')  loadCalcDefaults();
  if (name === 'settings')    loadSettings();
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

  // === SPARKLINE ===
  const spark = data.sparkline || [];
  const container = document.getElementById('dash-sparkline');
  const sparkTitle = document.getElementById('dash-sparkline-title');

  if (spark.length === 0) {
    if (sparkTitle) sparkTitle.textContent = 'Последние недели';
    container.innerHTML = '<div class="w-full text-center text-on-surface-variant font-mono text-[10px] py-4">нет данных</div>';
  } else {
    const sparkN = spark.length;
    if (sparkTitle) {
      sparkTitle.textContent = 'Последние ' + sparkN + ' ' + pluralWeeksShort(sparkN);
    }

    const max = Math.max(...spark.map(s => Number(s.net) || 0), 1);
    container.innerHTML = spark.map(s => {
      const netVal = Number(s.net) || 0;
      const h = Math.max(4, Math.round(netVal / max * 70));
      const ttl = esc((s.period || '') + ': ' + fmt(netVal));
      const label = netVal > 0 ? Math.round(netVal) : '';
      return `
        <div class="flex-1 flex flex-col items-center justify-end gap-1 h-full">
          <div class="font-mono text-[9px] text-primary font-bold leading-none">${label}</div>
          <div class="w-full bg-primary/60 rounded-t" style="height:${h}px" title="${ttl}"></div>
        </div>`;
    }).join('');
  }

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

  // Если карточки УЖЕ отрендерены — не показываем скелетон, просто обновим в фоне
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

  // Только при первом заходе (пустой список) — показываем скелетон
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
  btnCalc.classList.toggle('opacity-40',    !canCalc);
  btnCalc.classList.toggle('cursor-not-allowed', !canCalc);

  btnClear.disabled = !hasShots;
  btnClear.classList.toggle('opacity-40',    !hasShots);
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
  if (removingInProgress) return;   // защита от race (см. прошлый баг bad_index)
  removingInProgress = true;
  hideError();

  // Визуально "погасить" карточку сразу — мгновенный отклик
  const card = btn ? btn.closest('.bg-surface-container.rounded-xl.p-4') : null;
  if (card) {
    card.style.transition = 'opacity 0.2s';
    card.style.opacity = '0.4';
    card.style.pointerEvents = 'none';
  }

  // Блокируем все кнопки удаления
  document.querySelectorAll('#queue-list button[onclick^="removeScreen"]').forEach(b => {
    b.disabled = true;
    b.classList.add('opacity-50', 'cursor-wait');
  });

  try {
    const data = await apiPost('removeScreenshot', { index });
    if (!data.ok) {
      // Ошибка — восстанавливаем карточку
      if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
      document.querySelectorAll('#queue-list button[onclick^="removeScreen"]').forEach(b => {
        b.disabled = false;
        b.classList.remove('opacity-50', 'cursor-wait');
      });
      removingInProgress = false;
      return showError(data.error || 'remove_failed');
    }

    // Успех — рендерим очередь прямо из ответа (без второго запроса)
    if (data.queue) {
      renderQueue(data.queue);
      updateQueueButtons(data.queue, data.hasPendingCash);
    } else {
      // fallback если бэк старый
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
  switchTab('calculator');
}

// === Upload ===
document.getElementById('file-input').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const status = document.getElementById('upload-status');

  // Состояние каждого файла
  const items = files.map(f => ({
    name: f.name,
    file: f,
    state: 'queued',   // queued | loading | ok | error
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

  // После завершения — держим ещё 4 сек, потом скрываем и обновляем очередь
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

    const zusToggle = document.getElementById('in-zus-toggle');
    if (zusToggle) zusToggle.checked = false;

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
        if (promoEl && !Number(promoEl.value)) promoEl.value = queueTotals.bonuses.toFixed(2);
      } else {
        queueTotals = { gross: 0, net: 0, cash: 0, bonuses: 0 };
        document.getElementById('in-gross').value = '0.00';
        document.getElementById('in-net').value   = '0.00';
        document.getElementById('in-cash').value  = '0.00';
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
  const netFull    = netCash - dep;

  document.getElementById('p-gross').textContent    = fmt(gross);
  document.getElementById('p-net-input').textContent = fmt(net);
  document.getElementById('p-vat').textContent      = '-' + fmt(partnerVat);
  document.getElementById('p-bonustax').textContent = '-' + fmt(promoTax);
  document.getElementById('p-fee').textContent      = '-' + fmt(s.weeklyFee);
  document.getElementById('p-zus').textContent      = '-' + fmt(zus);
  document.getElementById('p-cash').textContent     = '-' + fmt(cash);
  document.getElementById('p-card').textContent     = fmt(cardPayout);
  document.getElementById('p-fuel').textContent     = '-' + fmt(fuelCost);
  document.getElementById('p-dep').textContent      = '-' + fmt(dep);
  document.getElementById('p-net').textContent      = fmt(netFull);
  document.getElementById('calc-hero-net').textContent  = fmt(netFull);
  document.getElementById('calc-hero-card').textContent = fmt(cardPayout);
}

['in-km','in-fuel','in-promo-base','in-dep-rate','in-zus-toggle','in-fuel-toggle']
  .forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalc);
  });

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

      toast('✅ Отчёт сохранён. Очередь очищена.');
      setTimeout(() => switchTab('dashboard'), 800);
    } catch (err) {
      toast('❌ ' + err.message, 'error');
    }
  }, 'Расчёт...');
}

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

    // Свежие данные с сервера — сбрасываем "грязный" флаг
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

// === Mode / Base toggle ===
let currentMode = 'lite';
let currentBase = 'gross';

function setActiveMode(mode) {
  currentMode = mode;

  const lite = document.getElementById('set-lite');
  const pro  = document.getElementById('set-pro');
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

    // === SAFE-AREA FIX: применяем инсеты от Telegram ===
    applyTelegramInsets();

    // Пересчитываем при изменениях (fullscreen, поворот, клавиатура)
    if (tg.onEvent) {
      tg.onEvent('viewportChanged', applyTelegramInsets);
      tg.onEvent('safeAreaChanged', applyTelegramInsets);
      tg.onEvent('fullscreenChanged', applyTelegramInsets);
    }
  }

  // Привязка отслеживания изменений в настройках
  bindSettingsDirtyTracking();

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
    switchTab('dashboard');
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
      switchTab('dashboard');
    }

    PROGRESS.set(100);
  } catch (err) {
    showError('Не удалось подключиться к API: ' + err.message);
  } finally {
    PROGRESS.done();
  }
});
