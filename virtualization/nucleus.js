/**
 * nucleus.js — Etapa 1: Núcleo de Virtualização e Sistema
 *
 * Módulos:
 *  1. InstanceManager  — gerenciamento de múltiplas instâncias Android
 *  2. VersionSelector  — seleção de versão/API do Android
 *  3. ResourceManager  — alocação dinâmica de CPU e RAM
 *  4. DeviceSimulator  — simulação de modelo e IMEI do dispositivo
 *  5. RootManager      — alternância de acesso root
 *  6. Toast            — notificações visuais
 */

/* ── Helpers ──────────────────────────────────────────────────────── */

function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

const Storage = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
  },
};

/* ── Toast ────────────────────────────────────────────────────────── */

const Toast = (() => {
  let timer = null;
  const el = document.getElementById('toast');

  function show(msg, type = 'info') {
    const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
    el.textContent = `${icons[type] ?? ''} ${msg}`;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  return { show };
})();

/* ── 1. InstanceManager ───────────────────────────────────────────── */

const InstanceManager = (() => {
  const STORAGE_KEY = 'nucleus_instances';

  // Default starter instances
  const DEFAULT_INSTANCES = [
    { id: 1, name: 'Instância 1', androidVersion: 'Android 12', active: true  },
    { id: 2, name: 'Instância 2', androidVersion: 'Android 9',  active: false },
  ];

  let instances = Storage.get(STORAGE_KEY, DEFAULT_INSTANCES);
  const ids = instances.map(i => i.id);
  let nextId = (ids.length > 0 ? Math.max(...ids) : 0) + 1;

  function save() { Storage.set(STORAGE_KEY, instances); }

  function render() {
    const list = document.getElementById('instance-list');
    list.innerHTML = '';

    instances.forEach(inst => {
      const li = document.createElement('li');
      li.className = `instance-item${inst.active ? ' active' : ''}`;
      li.dataset.id = inst.id;
      li.innerHTML = `
        <span class="status-dot"></span>
        <span class="instance-name">${escapeHtml(inst.name)}</span>
        <span class="instance-meta">${escapeHtml(inst.androidVersion)}</span>
        <button class="btn-icon start-btn"  title="Iniciar"   data-id="${inst.id}">▶</button>
        <button class="btn-icon stop-btn"   title="Parar"    data-id="${inst.id}">⏹</button>
        <button class="btn-icon delete-btn" title="Remover"  data-id="${inst.id}">🗑</button>
      `;
      list.appendChild(li);
    });

    document.getElementById('instance-count').textContent =
      `${instances.filter(i => i.active).length} ativa(s) / ${instances.length} total`;
  }

  function addInstance() {
    const name = `Instância ${nextId}`;
    const selectedVersion = VersionSelector.current();
    instances.push({ id: nextId, name, androidVersion: selectedVersion, active: false });
    nextId++;
    save();
    render();
    Toast.show(`Nova instância criada: ${name}`, 'success');
  }

  function deleteInstance(id) {
    const idx = instances.findIndex(i => i.id === id);
    if (idx === -1) return;
    const name = instances[idx].name;
    instances.splice(idx, 1);
    save();
    render();
    Toast.show(`Instância removida: ${name}`, 'warn');
  }

  function startInstance(id) {
    const inst = instances.find(i => i.id === id);
    if (!inst) return;
    inst.active = true;
    save();
    render();
    Toast.show(`${inst.name} iniciada`, 'success');
  }

  function stopInstance(id) {
    const inst = instances.find(i => i.id === id);
    if (!inst) return;
    inst.active = false;
    save();
    render();
    Toast.show(`${inst.name} parada`, 'info');
  }

  function init() {
    render();

    document.getElementById('add-instance-btn').addEventListener('click', addInstance);

    document.getElementById('instance-list').addEventListener('click', e => {
      const id = parseInt(e.target.dataset.id, 10);
      if (isNaN(id)) return;
      if (e.target.classList.contains('delete-btn')) deleteInstance(id);
      if (e.target.classList.contains('start-btn'))  startInstance(id);
      if (e.target.classList.contains('stop-btn'))   stopInstance(id);
    });
  }

  return { init, render };
})();

/* ── 2. VersionSelector ───────────────────────────────────────────── */

const VersionSelector = (() => {
  const STORAGE_KEY = 'nucleus_android_version';
  const VERSIONS = [
    { name: 'Nougat',    api: 'API 24-25', value: 'Android 7' },
    { name: 'Oreo',      api: 'API 26-27', value: 'Android 8' },
    { name: 'Pie',       api: 'API 28',    value: 'Android 9' },
    { name: 'Android 10',api: 'API 29',    value: 'Android 10' },
    { name: 'Android 11',api: 'API 30',    value: 'Android 11' },
    { name: 'Android 12',api: 'API 31-32', value: 'Android 12' },
    { name: 'Android 13',api: 'API 33',    value: 'Android 13' },
    { name: 'Android 14',api: 'API 34',    value: 'Android 14' },
    { name: 'Android 15',api: 'API 35',    value: 'Android 15' },
  ];

  let selected = Storage.get(STORAGE_KEY, 'Android 12');

  function current() { return selected; }

  function render() {
    const grid = document.getElementById('version-grid');
    grid.innerHTML = '';
    VERSIONS.forEach(v => {
      const btn = document.createElement('button');
      btn.className = `version-btn${v.value === selected ? ' selected' : ''}`;
      btn.dataset.value = v.value;
      btn.innerHTML = `${v.name}<span class="api-label">${v.api}</span>`;
      grid.appendChild(btn);
    });
  }

  function init() {
    render();
    document.getElementById('version-grid').addEventListener('click', e => {
      const btn = e.target.closest('.version-btn');
      if (!btn) return;
      selected = btn.dataset.value;
      Storage.set(STORAGE_KEY, selected);
      render();
      Toast.show(`Versão selecionada: ${selected}`, 'info');
    });
  }

  return { init, current };
})();

/* ── 3. ResourceManager ───────────────────────────────────────────── */

const ResourceManager = (() => {
  const STORAGE_KEY = 'nucleus_resources';
  const DEFAULTS = { cpu: 2, ram: 2048, auto: false };
  let cfg = Storage.get(STORAGE_KEY, { ...DEFAULTS });

  const MAX_CPU = navigator.hardwareConcurrency || 8;
  const MAX_RAM = 16384; // 16 GB ceiling

  function formatRam(mb) {
    return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
  }

  function updateUI() {
    const cpuSlider = document.getElementById('cpu-slider');
    const ramSlider = document.getElementById('ram-slider');
    cpuSlider.disabled = cfg.auto;
    ramSlider.disabled = cfg.auto;
    document.getElementById('cpu-value').textContent = `${cfg.cpu} núcleo(s)`;
    document.getElementById('ram-value').textContent = formatRam(cfg.ram);
    document.getElementById('auto-toggle').checked = cfg.auto;
    cpuSlider.value = cfg.cpu;
    ramSlider.value = cfg.ram;
  }

  // Default fallback: 2 GB in bytes, converted to MB and halved for the emulator share.
  // Note: performance.memory is a non-standard Chromium-only API; Firefox/Safari will
  // always use the DEFAULT_RAM_MB fallback below.
  const DEFAULT_RAM_MB = 2048;
  const BYTES_PER_MB = 1024 * 1024;

  function autoAllocate() {
    cfg.cpu = Math.max(1, Math.floor(MAX_CPU / 2));
    const heapBytes = performance.memory?.jsHeapSizeLimit ?? (DEFAULT_RAM_MB * BYTES_PER_MB * 2);
    cfg.ram = Math.min(MAX_RAM, Math.floor(heapBytes / BYTES_PER_MB / 2));
    if (cfg.ram < 512) cfg.ram = DEFAULT_RAM_MB;
    Storage.set(STORAGE_KEY, cfg);
    updateUI();
    Toast.show(`Recursos auto-alocados: ${cfg.cpu} CPU / ${formatRam(cfg.ram)}`, 'success');
  }

  function init() {
    const cpuSlider = document.getElementById('cpu-slider');
    const ramSlider = document.getElementById('ram-slider');
    cpuSlider.max = MAX_CPU;
    ramSlider.max = MAX_RAM;

    updateUI();

    cpuSlider.addEventListener('input', () => {
      cfg.cpu = parseInt(cpuSlider.value, 10);
      document.getElementById('cpu-value').textContent = `${cfg.cpu} núcleo(s)`;
    });
    cpuSlider.addEventListener('change', () => { Storage.set(STORAGE_KEY, cfg); });

    ramSlider.addEventListener('input', () => {
      cfg.ram = parseInt(ramSlider.value, 10);
      document.getElementById('ram-value').textContent = formatRam(cfg.ram);
    });
    ramSlider.addEventListener('change', () => { Storage.set(STORAGE_KEY, cfg); });

    document.getElementById('auto-toggle').addEventListener('change', e => {
      cfg.auto = e.target.checked;
      Storage.set(STORAGE_KEY, cfg);
      if (cfg.auto) {
        autoAllocate();
      } else {
        updateUI();
        Toast.show('Alocação manual ativada', 'info');
      }
    });

    document.getElementById('apply-resources-btn').addEventListener('click', () => {
      Storage.set(STORAGE_KEY, cfg);
      Toast.show(`Recursos aplicados: ${cfg.cpu} CPU / ${formatRam(cfg.ram)}`, 'success');
    });
  }

  return { init };
})();

/* ── 4. DeviceSimulator ───────────────────────────────────────────── */

const DeviceSimulator = (() => {
  const STORAGE_KEY = 'nucleus_device';
  const DEVICES = [
    { label: 'Samsung Galaxy S22',   model: 'SM-S901B',  brand: 'Samsung'  },
    { label: 'Samsung Galaxy A54',   model: 'SM-A546B',  brand: 'Samsung'  },
    { label: 'Google Pixel 7',       model: 'GVU6C',     brand: 'Google'   },
    { label: 'Google Pixel 6a',      model: 'GX7AS',     brand: 'Google'   },
    { label: 'Xiaomi Redmi Note 12', model: '23021RAAEG', brand: 'Xiaomi'  },
    { label: 'OnePlus 11',           model: 'CPH2449',   brand: 'OnePlus'  },
    { label: 'Motorola Edge 40',     model: 'XT2303-1',  brand: 'Motorola' },
    { label: 'Personalizado',        model: '',          brand: ''         },
  ];

  const DEFAULTS = {
    deviceIndex: 0,
    imei: generateImei(),
    customModel: '',
    customBrand: '',
    enabled: true,
  };

  let cfg = Storage.get(STORAGE_KEY, { ...DEFAULTS });

  /** Luhn-compliant IMEI generator (15 digits) */
  function generateImei() {
    const tac = '35' + Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
    const serial = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
    const partial = tac + serial;
    let sum = 0;
    for (let i = 0; i < partial.length; i++) {
      let d = parseInt(partial[i], 10);
      if (i % 2 !== 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    const check = (10 - (sum % 10)) % 10;
    return partial + check;
  }

  function currentDevice() {
    const d = DEVICES[cfg.deviceIndex] || DEVICES[0];
    return {
      label: d.label,
      model: d.model || cfg.customModel,
      brand: d.brand || cfg.customBrand,
      imei: cfg.imei,
    };
  }

  function populateSelect() {
    const sel = document.getElementById('device-select');
    sel.innerHTML = '';
    DEVICES.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = d.label;
      sel.appendChild(opt);
    });
    sel.value = cfg.deviceIndex;
  }

  function updateCustomFields() {
    const isCustom = cfg.deviceIndex === DEVICES.length - 1;
    document.getElementById('custom-model-row').style.display = isCustom ? '' : 'none';
    document.getElementById('custom-brand-row').style.display = isCustom ? '' : 'none';
  }

  function updateUI() {
    populateSelect();
    updateCustomFields();
    document.getElementById('imei-display').value = cfg.imei;
    document.getElementById('custom-model-input').value = cfg.customModel;
    document.getElementById('custom-brand-input').value = cfg.customBrand;
    document.getElementById('device-sim-toggle').checked = cfg.enabled;
    const info = currentDevice();
    document.getElementById('device-info-text').textContent =
      cfg.enabled ? `${info.brand} ${info.label} • Modelo: ${info.model}` : 'Simulação desativada';
  }

  function init() {
    updateUI();

    document.getElementById('device-select').addEventListener('change', e => {
      cfg.deviceIndex = parseInt(e.target.value, 10);
      Storage.set(STORAGE_KEY, cfg);
      updateCustomFields();
      const d = currentDevice();
      Toast.show(`Dispositivo: ${d.label}`, 'info');
      document.getElementById('device-info-text').textContent =
        cfg.enabled ? `${d.brand} ${d.label} • Modelo: ${d.model}` : 'Simulação desativada';
    });

    document.getElementById('regenerate-imei-btn').addEventListener('click', () => {
      cfg.imei = generateImei();
      Storage.set(STORAGE_KEY, cfg);
      document.getElementById('imei-display').value = cfg.imei;
      Toast.show('Novo IMEI gerado', 'success');
    });

    document.getElementById('custom-model-input').addEventListener('change', e => {
      cfg.customModel = e.target.value;
      Storage.set(STORAGE_KEY, cfg);
    });

    document.getElementById('custom-brand-input').addEventListener('change', e => {
      cfg.customBrand = e.target.value;
      Storage.set(STORAGE_KEY, cfg);
    });

    document.getElementById('device-sim-toggle').addEventListener('change', e => {
      cfg.enabled = e.target.checked;
      Storage.set(STORAGE_KEY, cfg);
      const d = currentDevice();
      document.getElementById('device-info-text').textContent =
        cfg.enabled ? `${d.brand} ${d.label} • Modelo: ${d.model}` : 'Simulação desativada';
      Toast.show(cfg.enabled ? 'Simulação de dispositivo ativa' : 'Simulação de dispositivo desativada',
        cfg.enabled ? 'success' : 'warn');
    });
  }

  return { init };
})();

/* ── 5. RootManager ───────────────────────────────────────────────── */

const RootManager = (() => {
  const STORAGE_KEY = 'nucleus_root';
  let enabled = Storage.get(STORAGE_KEY, false);

  function updateUI() {
    const badge = document.getElementById('root-badge');
    const btn   = document.getElementById('root-toggle-btn');
    const icon  = document.getElementById('root-icon');

    if (enabled) {
      badge.className = 'root-status-badge enabled';
      badge.querySelector('#root-status-text').textContent = 'Root ATIVADO';
      icon.textContent = '🔓';
      btn.className = 'btn danger';
      btn.textContent = '🔒 Desativar Root';
    } else {
      badge.className = 'root-status-badge disabled';
      badge.querySelector('#root-status-text').textContent = 'Root DESATIVADO';
      icon.textContent = '🔒';
      btn.className = 'btn success';
      btn.textContent = '🔓 Ativar Root';
    }

    document.getElementById('root-perms-info').textContent =
      enabled ? 'Acesso total ao sistema de arquivos liberado. Apps com permissão de superusuário poderão modificar /system.' : 'Sistema operando em modo padrão sem permissões elevadas.';
  }

  function toggle() {
    enabled = !enabled;
    Storage.set(STORAGE_KEY, enabled);
    updateUI();
    Toast.show(enabled ? 'Root ativado — superusuário disponível' : 'Root desativado', enabled ? 'warn' : 'info');
  }

  function init() {
    updateUI();
    document.getElementById('root-toggle-btn').addEventListener('click', toggle);
  }

  return { init };
})();

/* ── XSS guard ────────────────────────────────────────────────────── */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Boot ─────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  VersionSelector.init();
  InstanceManager.init();
  ResourceManager.init();
  DeviceSimulator.init();
  RootManager.init();
});
