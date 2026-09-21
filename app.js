/* ═══════════════════════════════════════════════════
   MoneyTaxi WebApp — frontend logic (final, синхр. с v23-ботом)
   ═══════════════════════════════════════════════════ */

const API_URL = 'https://script.google.com/macros/s/AKfycbx_h3-mJ4KXRAa64vJlGy70rpM516QQX_ILf5qoH9A9x-7b5-b6gPrkh4GuTuKL5f5f/exec';

// === Telegram WebApp initData ===
// ВАЖНО: telegram-web-app.js должен быть подключён в <head> ДО этого файла
const tg = window.Telegram && window.Telegram.WebApp;
const initData = tg ? (tg.initData || '') : '';

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

function toast(msg) {
  const el = document.getElementById('save-toast');
  if (!el) return;
  const txt = el.querySelector('.flex-1');
  if (txt) txt.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2500);
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

function showLoading() {
  const el = document.getElementById('loading');
  if (el) el.classList.remove('hidden');
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.classList.add('hidden');
}

// === API-запросы ===
async function apiGet(action, params = {}) {
  try {
    const qs = new URLSearchParams({ action, initData, ...params });
    const res = await fetch(`${API_URL}?${qs.toString()}`);
    return await res.json();
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
    return await res.json();
  } catch (err) {
    return { ok: false, error: 'network', message: err.message };
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
async function loadDashboard() {
  hideError();
  try {
    const data = await apiGet('dashboard');
    if (!data.ok) { showError(data.error || 'dashboard_failed'); return; }

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
    document.getElementById('dash-fuel').textContent     = fmt(w.fuel);
    document.getElementById('dash-km').textContent       = (w.km || 0) + ' км';
    document.getElementById('dash-total').textContent    = 'Всего: ' + (data.totalReports || 0) + ' недель';

    const spark = data.sparkline || [];
    const container = document.getElementById('dash-sparkline');
    if (spark.length === 0) {
      container.innerHTML = '<div class="w-full text-center text-on-surface-variant font-mono text-[10px] py-4">нет данных</div>';
    } else {
      const max = Math.max(...spark.map(s => Number(s.net) || 0), 1);
      container.innerHTML = spark.map(s => {
        const h = Math.max(4, Math.round((Number(s.net) || 0) / max * 70));
        const ttl = esc((s.period || '') + ': ' + fmt(s.net));
        return `<div class="flex-1 bg-primary/60 rounded-t" style="height:${h}px" title="${ttl}"></div>`;
      }).join('');
    }

    const s4 = data.summary4 || {};
    document.getElementById('sum4-card').textContent = fmt(s4.card);
    document.getElementById('sum4-cash').textContent = fmt(s4.cash);
    document.getElementById('sum4-net').textContent  = fmt(s4.net);
    document.getElementById('sum4-fuel').textContent = fmt(s4.netFuel);
    document.getElementById('sum4-full').textContent = fmt(s4.netFull);
  } catch (err) {
    showError('Dashboard: ' + err.message);
  } finally {
    hideLoading();
  }
}

// === Queue ===
async function loadQueue() {
  hideError();
  try {
    const data = await apiGet('queue');
    if (!data.ok) { showError(data.error || 'queue_failed'); return; }
    renderQueue(data.screenshots || []);
  } catch (err) {
    showError('Queue: ' + err.message);
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
          <button onclick="removeScreen(${i})" class="p-2 rounded-lg bg-surface-container-high hover:bg-error/20 text-error shrink-0">
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </div>`;
  }).join('');
}

async function removeScreen(index) {
  hideError();
  const data = await apiPost('removeScreenshot', { index });
  if (!data.ok) return showError(data.error || 'remove_failed');
  loadQueue();
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

// === Upload ===
document.getElementById('file-input').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const status = document.getElementById('upload-status');
  status.classList.remove('hidden');
  status.textContent = `Загрузка ${files.length} файл(ов)...`;

  for (const file of files) {
    try {
      const base64 = await fileToBase64Compressed(file);
      const data = await apiPost('uploadScreenshot', { base64, filename: file.name });
      if (!data.ok) {
        const reason = data.error === 'pending_cash'
          ? 'сначала укажите наличные Uber'
          : (data.error || 'ошибка');
        status.textContent = `❌ ${file.name}: ${reason}`;
      } else {
        status.textContent = `✅ ${file.name}: распознан (${data.parsed.platform})`;
      }
    } catch (err) {
      status.textContent = `❌ ${file.name}: ${err.message}`;
    }
  }
  e.target.value = '';
  setTimeout(() => status.classList.add('hidden'), 3000);
  loadQueue();
});

// Сжатие через Canvas → уменьшаем до 2000px ширины, JPEG 92%
function fileToBase64Compressed(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 2000;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject(new Error('image_load_failed'));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

// === Calculator ===
let calcDefaults = null;
let queueTotals = { gross: 0, net: 0, cash: 0, bonuses: 0 };

async function loadCalcDefaults() {
  hideError();
  try {
    const data = await apiGet('settings');
    if (!data.ok) return showError(data.error || 'settings_failed');
    calcDefaults = data.settings;

    document.getElementById('in-dep-rate').value = calcDefaults.depRate;

    // Автоподстановка сумм из очереди
    try {
      const q = await apiGet('queue');
      if (q.ok && q.screenshots && q.screenshots.length) {
        queueTotals = {
          gross:   q.screenshots.reduce((a, s) => a + (Number(s.gross)   || 0), 0),
          net:     q.screenshots.reduce((a, s) => a + (Number(s.net)     || 0), 0),
          cash:    q.screenshots.reduce((a, s) => a + (Number(s.cash)    || 0), 0),
          bonuses: q.screenshots.reduce((a, s) => a + (Number(s.bonuses) || 0), 0)
        };

        const grossEl = document.getElementById('in-gross');
        const cashEl  = document.getElementById('in-cash');
        if (grossEl) grossEl.value = queueTotals.gross.toFixed(2);
        if (cashEl)  cashEl.value  = queueTotals.cash.toFixed(2);

        const promoEl = document.getElementById('in-promo-base');
        if (promoEl && !Number(promoEl.value)) promoEl.value = queueTotals.bonuses.toFixed(2);
      } else {
        queueTotals = { gross: 0, net: 0, cash: 0, bonuses: 0 };
      }
    } catch (_) {}

    recalc();
  } catch (err) { showError('Settings: ' + err.message); }
}

function recalc() {
  const gross      = parseFloat(document.getElementById('in-gross').value) || 0;
  const km         = parseFloat(document.getElementById('in-km').value)    || 0;
  const fuel       = parseFloat(document.getElementById('in-fuel').value)  || 0;
  const cash       = parseFloat(document.getElementById('in-cash').value)  || 0;
  const promoBase  = parseFloat(document.getElementById('in-promo-base').value) || 0;
  const depRate    = parseFloat(document.getElementById('in-dep-rate').value) || 0;
  const includeZus = document.getElementById('in-zus-toggle').checked;
  const includeFuel = document.getElementById('in-fuel-toggle').checked;

  if (!calcDefaults) return;
  const s = calcDefaults;

  // ─── Синхронизировано с bot.gs (buildLiteReport / buildReportRow) ───
  // net = сумма net со всех скринов (как на бэке)
  const net = queueTotals.net || 0;

  const partnerBaseAmount = s.partnerBase === 'net' ? net : gross;
  const partnerVat = partnerBaseAmount * s.partnerPct;
  const promoTax   = promoBase * s.promoTaxPct;
  const zus        = includeZus ? s.zus : 0;
  const dep        = km * depRate;

  // Формула 1-в-1 как в bot.gs
  const cardPayout = net - cash - partnerVat - promoTax - s.weeklyFee - zus;
  const fuelCost   = includeFuel ? fuel : 0;
  const netCash    = cardPayout + cash;
  const netFuel    = netCash - fuelCost;
  const netFull    = netCash - dep;

  document.getElementById('p-gross').textContent    = fmt(gross);
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

['in-gross','in-km','in-fuel','in-cash','in-promo-base','in-dep-rate','in-zus-toggle','in-fuel-toggle']
  .forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalc);
  });

async function saveReport() {
  hideError();
  try {
    const queueData = await apiGet('queue');
    if (!queueData.ok) return toast('❌ ' + (queueData.error || 'queue_failed'));
    if (!queueData.screenshots || !queueData.screenshots.length) {
      return toast('❌ Загрузите скрины');
    }
    if (queueData.hasPendingCash) {
      return toast('❌ Сначала укажите наличные Uber');
    }

    // НЕ передаём gross/net/cash из формы — бэк сам возьмёт их из screenshots
    const params = {
      screenshots: queueData.screenshots,
      km:    parseFloat(document.getElementById('in-km').value) || 0,
      fuel:  parseFloat(document.getElementById('in-fuel').value) || 0,
      depRate: parseFloat(document.getElementById('in-dep-rate').value) || 0,
      promoBonusBase: parseFloat(document.getElementById('in-promo-base').value) || 0,
      includeZus: document.getElementById('in-zus-toggle').checked,
      includeFuel: document.getElementById('in-fuel-toggle').checked
    };

    const data = await apiPost('saveReport', { params });
    if (!data.ok) return toast('❌ ' + (data.error || 'save_failed'));
    toast('✅ Отчёт сохранён!');
    setTimeout(() => switchTab('dashboard'), 800);
  } catch (err) {
    toast('❌ ' + err.message);
  }
}

// === Settings ===
async function loadSettings() {
  hideError();
  try {
    const data = await apiGet('settings');
    if (!data.ok) return showError(data.error || 'settings_failed');
    const s = data.settings;

    document.getElementById('set-partner-pct').value = (s.partnerPct * 100).toFixed(2);
    document.getElementById('set-promo-tax').value   = (s.promoTaxPct * 100).toFixed(2);
    document.getElementById('set-weekly-fee').value  = s.weeklyFee;
    document.getElementById('set-zus').value         = s.zus;
    document.getElementById('set-dep-rate').value    = s.depRate;

    setActiveMode(s.mode);
    setActiveBase(s.partnerBase);
    calcDefaults = s;
  } catch (err) { showError('Settings: ' + err.message); }
}

async function saveSettings() {
  hideError();
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
  } else {
    toast('❌ ' + (data.error || 'save_failed'));
  }
}

async function resetSettings() {
  const defaults = {
    partnerPct: 0.05, partnerBase: 'gross', promoTaxPct: 0.23,
    weeklyFee: 60, zus: 350, depRate: 0.50, mode: 'lite'
  };
  const data = await apiPost('saveSettings', { settings: defaults });
  if (data.ok) {
    toast('✅ Сброшено');
    calcDefaults = data.settings;
    loadSettings();
  } else {
    toast('❌ ' + (data.error || 'reset_failed'));
  }
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

// === Слушатели кнопок ===
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
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor && tg.setHeaderColor('#10141a');
    tg.setBackgroundColor && tg.setBackgroundColor('#10141a');
  }

  if (!initData) {
    hideLoading();
    showError('Откройте приложение через Telegram-бота');
    return;
  }

  try {
    const auth = await apiGet('verify');
    if (!auth.ok) {
      hideLoading();
      return showError('Авторизация не прошла: ' + (auth.reason || auth.error));
    }
  } catch (err) {
    hideLoading();
    return showError('Не удалось подключиться к API: ' + err.message);
  }

  switchTab('dashboard');
});
