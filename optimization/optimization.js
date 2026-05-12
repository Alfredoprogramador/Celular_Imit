/**
 * optimization.js — Etapa Final: Otimização e Multimídia
 *
 * Módulos:
 *  1. EcoMode         — redução de FPS por instância secundária
 *  2. GraphicsRenderer — detecção de GPU + seleção de API gráfica
 *  3. MediaCapture    — screenshot via canvas e gravação via MediaRecorder
 *  4. GamepadSupport  — detecção plug-and-play de gamepads e mapeamento de botões
 *  5. Toast           — notificações visuais
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Toast ────────────────────────────────────────────────────────── */

const Toast = (() => {
  let timer = null;
  const el = document.getElementById('toast');

  function show(msg, type = 'info') {
    const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
    el.textContent = `${icons[type] ?? ''} ${msg}`;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  return { show };
})();

/* ── 1. EcoMode ───────────────────────────────────────────────────── */

const EcoMode = (() => {
  const STORAGE_KEY      = 'opt_eco';
  const INSTANCES_KEY    = 'nucleus_instances';

  // Default FPS targets: primary=60, secondary=15
  const DEFAULT_FPS_PRIMARY   = 60;
  const DEFAULT_FPS_SECONDARY = 15;

  let cfg = Storage.get(STORAGE_KEY, { globalEnabled: false, instances: {} });

  /** Read instances created in Stage 1 */
  function loadInstances() {
    return Storage.get(INSTANCES_KEY, []);
  }

  function save() { Storage.set(STORAGE_KEY, cfg); }

  function fpsForInstance(id, isActive) {
    if (cfg.instances[id] !== undefined) return cfg.instances[id];
    return isActive ? DEFAULT_FPS_PRIMARY : DEFAULT_FPS_SECONDARY;
  }

  function render() {
    const instances = loadInstances();
    const list = document.getElementById('eco-instance-list');
    list.innerHTML = '';

    if (instances.length === 0) {
      const li = document.createElement('li');
      li.className = 'eco-empty';
      li.textContent = 'Nenhuma instância encontrada. Crie instâncias na Etapa 1.';
      list.appendChild(li);
      return;
    }

    instances.forEach(inst => {
      const fps  = fpsForInstance(inst.id, inst.active);
      const isEco = cfg.globalEnabled && !inst.active;

      const li = document.createElement('li');
      li.className = 'eco-instance-item';
      li.innerHTML = `
        <div class="eco-instance-header">
          <span class="eco-instance-name">
            ${escapeHtml(inst.name)}
            <span style="font-size:.75rem;color:${inst.active ? 'var(--accent2)' : 'var(--muted)'};">
              (${inst.active ? 'Ativa' : 'Secundária'})
            </span>
          </span>
          <label class="toggle" title="Eco para esta instância">
            <input type="checkbox" class="eco-inst-toggle" data-id="${inst.id}"
              ${isEco ? 'checked' : ''}
              ${inst.active ? 'disabled' : ''}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="eco-fps-row">
          <span style="font-size:.78rem;color:var(--muted);min-width:28px;">FPS</span>
          <input type="range" class="eco-fps-slider" data-id="${inst.id}"
            min="1" max="60" step="1" value="${fps}"
            ${inst.active ? 'disabled' : ''} />
          <span class="eco-fps-value" id="eco-fps-val-${inst.id}">${fps} fps</span>
        </div>
      `;
      list.appendChild(li);
    });

    // FPS slider live update
    list.querySelectorAll('.eco-fps-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        const id  = parseInt(slider.dataset.id, 10);
        const val = parseInt(slider.value, 10);
        document.getElementById(`eco-fps-val-${id}`).textContent = `${val} fps`;
        cfg.instances[id] = val;
        save();
      });
    });

    // Per-instance eco toggle
    list.querySelectorAll('.eco-inst-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const id  = parseInt(toggle.dataset.id, 10);
        // checked = eco active → low FPS; unchecked → restore to primary default
        const fps = toggle.checked ? DEFAULT_FPS_SECONDARY : DEFAULT_FPS_PRIMARY;
        cfg.instances[id] = fps;
        save();
        render();
        Toast.show(`Modo Eco ${toggle.checked ? 'ativado' : 'desativado'} para instância ${id}`, toggle.checked ? 'success' : 'info');
      });
    });
  }

  function updateGlobalLabel() {
    const lbl = document.getElementById('eco-global-label');
    lbl.textContent = cfg.globalEnabled ? 'Ativado' : 'Desativado';
    lbl.style.color  = cfg.globalEnabled ? 'var(--accent2)' : 'var(--muted)';
  }

  function init() {
    const globalToggle = document.getElementById('eco-global-toggle');
    globalToggle.checked = cfg.globalEnabled;
    updateGlobalLabel();
    render();

    globalToggle.addEventListener('change', () => {
      cfg.globalEnabled = globalToggle.checked;
      // Apply eco fps to all secondary instances
      const instances = loadInstances();
      instances.forEach(inst => {
        if (!inst.active) cfg.instances[inst.id] = cfg.globalEnabled ? DEFAULT_FPS_SECONDARY : DEFAULT_FPS_PRIMARY;
      });
      save();
      updateGlobalLabel();
      render();
      Toast.show(cfg.globalEnabled ? 'Modo Eco Global ativado — FPS reduzido nas instâncias secundárias' : 'Modo Eco Global desativado', cfg.globalEnabled ? 'success' : 'info');
    });
  }

  return { init };
})();

/* ── 2. GraphicsRenderer ──────────────────────────────────────────── */

const GraphicsRenderer = (() => {
  const STORAGE_KEY = 'opt_graphics';
  const DEFAULTS    = { api: null, quality: 'medium' };
  let cfg = Storage.get(STORAGE_KEY, { ...DEFAULTS });

  function detectGpu() {
    try {
      const canvas  = document.createElement('canvas');
      const gl      = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { vendor: 'Não disponível', renderer: 'WebGL não suportado', recommended: 'opengl' };

      const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor   = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR);
      const renderer = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

      // Heuristic: NVIDIA/AMD on Windows → DirectX (ANGLE); others → OpenGL
      const isAngle  = renderer.toLowerCase().includes('angle');
      const isNvidiaAmd = /nvidia|amd|radeon|geforce|quadro|rtx|gtx/i.test(renderer + vendor);
      const recommended = (isAngle || isNvidiaAmd) ? 'directx' : 'opengl';

      return { vendor, renderer, recommended };
    } catch {
      return { vendor: 'Desconhecido', renderer: 'Erro ao detectar', recommended: 'opengl' };
    }
  }

  function save() { Storage.set(STORAGE_KEY, cfg); }

  function renderApiButtons() {
    $$('.api-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.api === cfg.api);
    });
  }

  function init() {
    const gpu = detectGpu();

    document.getElementById('gpu-vendor').textContent      = gpu.vendor;
    document.getElementById('gpu-renderer').textContent    = gpu.renderer;
    document.getElementById('gpu-recommended').textContent = gpu.recommended === 'directx' ? 'DirectX (ANGLE)' : 'OpenGL';

    // Pre-select recommended API if no preference saved
    if (!cfg.api) cfg.api = gpu.recommended;

    renderApiButtons();
    document.getElementById('render-quality').value = cfg.quality;

    document.getElementById('api-selector').addEventListener('click', e => {
      const btn = e.target.closest('.api-btn');
      if (!btn) return;
      cfg.api = btn.dataset.api;
      save();
      renderApiButtons();
    });

    document.getElementById('render-quality').addEventListener('change', e => {
      cfg.quality = e.target.value;
      save();
    });

    document.getElementById('apply-graphics-btn').addEventListener('click', () => {
      save();
      const apiLabel = cfg.api === 'directx' ? 'DirectX (ANGLE)' : 'OpenGL';
      Toast.show(`API: ${apiLabel} — Qualidade: ${cfg.quality}`, 'success');
    });
  }

  return { init };
})();

/* ── 3. MediaCapture ──────────────────────────────────────────────── */

const MediaCapture = (() => {
  let mediaRecorder  = null;
  let recordedChunks = [];
  let isRecording    = false;
  let stream         = null;
  let currentVideoUrl = null;

  function setStatus(text, recording = false) {
    document.getElementById('capture-status-text').textContent = text;
    document.getElementById('rec-dot').classList.toggle('recording', recording);
  }

  /** Capture a screenshot of the entire page using html2canvas-like approach.
   *  Since html2canvas is not available, we use the Screen Capture API to take
   *  a single frame, falling back to a blank canvas placeholder when the API
   *  is unavailable (e.g. in headless environments). */
  async function takeScreenshot() {
    const btn = document.getElementById('screenshot-btn');
    btn.disabled = true;

    try {
      // Attempt to grab a single frame via getDisplayMedia
      const captureStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = captureStream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();
      captureStream.getTracks().forEach(t => t.stop());

      const canvas = document.createElement('canvas');
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');

      const link  = document.getElementById('screenshot-link');
      const thumb = document.getElementById('preview-thumb');
      link.href = dataUrl;
      link.style.display = '';
      thumb.src = dataUrl;
      thumb.classList.add('visible');

      setStatus('Screenshot capturado com sucesso.');
      Toast.show('Screenshot salvo — clique em Baixar para exportar', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        setStatus('Captura cancelada pelo usuário.');
        Toast.show('Captura cancelada', 'warn');
      } else {
        setStatus(`Erro na captura: ${err.message}`);
        Toast.show('Falha ao capturar tela', 'error');
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

      // Pick a supported MIME type
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find(m => MediaRecorder.isTypeSupported(m)) || '';

      const options = mimeType ? { mimeType } : {};
      mediaRecorder  = new MediaRecorder(stream, options);
      recordedChunks = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob    = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
        // Revoke any previous recording URL to avoid memory leaks
        if (currentVideoUrl) {
          URL.revokeObjectURL(currentVideoUrl);
          currentVideoUrl = null;
        }
        currentVideoUrl = URL.createObjectURL(blob);
        const vidLink = document.getElementById('video-link');
        vidLink.href = currentVideoUrl;
        vidLink.style.display = '';
        setStatus('Gravação finalizada. Clique em Baixar para exportar.');
        Toast.show('Gravação concluída — clique em Baixar para exportar', 'success');
        isRecording = false;
        updateRecordBtn();
      };

      // Stop recording when the user ends screen share from the browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (isRecording) stopRecording();
      });

      mediaRecorder.start(1000); // collect data every second
      isRecording = true;
      updateRecordBtn();
      setStatus('Gravação em andamento…', true);
      Toast.show('Gravação iniciada', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        setStatus('Gravação cancelada pelo usuário.');
        Toast.show('Gravação cancelada', 'warn');
      } else {
        setStatus(`Erro ao iniciar gravação: ${err.message}`);
        Toast.show('Falha ao iniciar gravação', 'error');
      }
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    isRecording = false;
    updateRecordBtn();
    setStatus('Parando gravação…');
  }

  function updateRecordBtn() {
    const btn = document.getElementById('record-btn');
    if (isRecording) {
      btn.textContent = '⏹ Parar Gravação';
      btn.classList.remove('success');
      btn.classList.add('danger');
    } else {
      btn.textContent = '⏺ Iniciar Gravação';
      btn.classList.remove('danger');
      btn.classList.add('success');
    }
  }

  function init() {
    document.getElementById('screenshot-btn').addEventListener('click', takeScreenshot);
    document.getElementById('record-btn').addEventListener('click', () => {
      isRecording ? stopRecording() : startRecording();
    });
    // Revoke any remaining blob URL when the user navigates away
    window.addEventListener('beforeunload', () => {
      if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
        currentVideoUrl = null;
      }
      if (isRecording) stopRecording();
    });
  }

  return { init };
})();

/* ── 4. GamepadSupport ────────────────────────────────────────────── */

const GamepadSupport = (() => {
  // Standard gamepad button labels (based on the Standard Gamepad mapping)
  const BUTTON_LABELS = [
    'A', 'B', 'X', 'Y',
    'LB', 'RB', 'LT', 'RT',
    'Sel', 'Sta',
    'LS', 'RS',
    '↑', '↓', '←', '→',
  ];

  const AXIS_LABELS = ['LX', 'LY', 'RX', 'RY'];

  let rafId = null;
  // Persists previous axis values across frames for throttled DOM updates
  const prevAxes = {};

  function buildGamepadCard(gp) {
    const li = document.createElement('li');
    li.className = 'gamepad-card';
    li.id = `gp-card-${gp.index}`;

    const btnHtml = gp.buttons.map((_, i) => {
      const label = BUTTON_LABELS[i] ?? `B${i}`;
      return `<span class="gp-btn" id="gp-btn-${gp.index}-${i}">${escapeHtml(label)}</span>`;
    }).join('');

    const axesHtml = gp.axes.map((_, i) => {
      const label = AXIS_LABELS[i] ?? `A${i}`;
      return `
        <div class="axis-bar-row">
          <span style="min-width:24px;">${escapeHtml(label)}</span>
          <div class="axis-track">
            <div class="axis-fill" id="gp-axis-${gp.index}-${i}" style="transform:scaleX(0.5);"></div>
          </div>
          <span id="gp-axis-val-${gp.index}-${i}"
                style="min-width:36px;text-align:right;font-size:.74rem;">0.00</span>
        </div>`;
    }).join('');

    li.innerHTML = `
      <div class="gamepad-card-header">
        <span class="gp-icon">🕹️</span>
        <span>${escapeHtml(gp.id.slice(0, 48))}</span>
      </div>
      <div class="button-grid">${btnHtml}</div>
      ${gp.axes.length > 0 ? `<div class="axes-row">${axesHtml}</div>` : ''}
    `;

    return li;
  }

  function updateStatus() {
    const gamepads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const statusEl = document.getElementById('gamepad-status');
    const noMsg    = document.getElementById('no-gamepad-msg');

    if (gamepads.length === 0) {
      statusEl.textContent = 'Aguardando conexão de gamepad. Conecte um controle e pressione qualquer botão.';
      statusEl.style.color = '';
      noMsg.style.display  = '';
    } else {
      statusEl.textContent = `${gamepads.length} controle(s) conectado(s).`;
      statusEl.style.color = 'var(--accent2)';
      noMsg.style.display  = 'none';
    }
  }

  function pollGamepads() {
    const gamepads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];

    gamepads.forEach(gp => {
      // Ensure card exists
      if (!document.getElementById(`gp-card-${gp.index}`)) {
        const list = document.getElementById('gamepad-list');
        list.appendChild(buildGamepadCard(gp));
        updateStatus();
        Toast.show(`Controle conectado: ${gp.id.slice(0, 30)}`, 'success');
      }

      // Update button states
      gp.buttons.forEach((btn, i) => {
        const el = document.getElementById(`gp-btn-${gp.index}-${i}`);
        if (el) el.classList.toggle('pressed', btn.pressed);
      });

      // Update axes
      gp.axes.forEach((val, i) => {
        const fill  = document.getElementById(`gp-axis-${gp.index}-${i}`);
        const valEl = document.getElementById(`gp-axis-val-${gp.index}-${i}`);
        if (fill) {
          // Use CSS transform (scaleX) instead of width to avoid layout recalculations
          const scale = (val + 1) / 2;
          fill.style.transform = `scaleX(${scale})`;
        }
        if (valEl) {
          const key = `${gp.index}-${i}`;
          const prev = prevAxes[key] ?? null;
          // Only update text when value changes by more than 0.01 to reduce DOM thrashing
          if (prev === null || Math.abs(val - prev) > 0.01) {
            valEl.textContent = val.toFixed(2);
            prevAxes[key] = val;
          }
        }
      });
    });

    rafId = requestAnimationFrame(pollGamepads);
  }

  function removeGamepadCard(index) {
    const card = document.getElementById(`gp-card-${index}`);
    if (card) card.remove();
    updateStatus();
  }

  function init() {
    updateStatus();

    window.addEventListener('gamepadconnected', e => {
      if (!document.getElementById(`gp-card-${e.gamepad.index}`)) {
        const list = document.getElementById('gamepad-list');
        list.appendChild(buildGamepadCard(e.gamepad));
        updateStatus();
      }
      Toast.show(`🕹️ Controle conectado: ${e.gamepad.id.slice(0, 30)}`, 'success');
    });

    window.addEventListener('gamepaddisconnected', e => {
      removeGamepadCard(e.gamepad.index);
      Toast.show(`🕹️ Controle desconectado: ${e.gamepad.id.slice(0, 30)}`, 'warn');
    });

    // Start polling loop for button/axis state (required for most browsers)
    rafId = requestAnimationFrame(pollGamepads);

    // Cancel the polling loop when the user navigates away
    window.addEventListener('beforeunload', () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }

  return { init };
})();

/* ── Status Summary ───────────────────────────────────────────────── */

function updateStatusSummary() {
  const instances = Storage.get('nucleus_instances', []);
  const eco       = Storage.get('opt_eco', { globalEnabled: false });
  const parts = [
    `${instances.length} instância(s)`,
    eco.globalEnabled ? 'Eco ON' : 'Eco OFF',
  ];
  document.getElementById('status-summary').textContent = parts.join(' · ');
}

/* ── Boot ─────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  EcoMode.init();
  GraphicsRenderer.init();
  MediaCapture.init();
  GamepadSupport.init();
  updateStatusSummary();
});
