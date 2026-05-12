function $(sel, ctx = document) { return ctx.querySelector(sel); }

const Storage = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
  },
};

const Toast = (() => {
  const el = $('#toast');
  let timer = null;
  function show(message) {
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  return { show };
})();

const Controller = (() => {
  const STORAGE_KEY = 'interface_stage2_state';
  const SYNC_STORAGE_KEY = 'interface_stage2_sync_event';
  const WINDOW_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('interface_stage2_channel') : null;

  const baseInstances = Storage.get('nucleus_instances', [{ id: 1, name: 'Instância 1', active: true }]);
  const active = baseInstances.filter(i => i.active);
  const source = active.length > 0 ? active : baseInstances;

  const saved = Storage.get(STORAGE_KEY, {});
  const instances = source.map((inst, index) => ({
    id: inst.id,
    name: inst.name,
    orientation: saved[inst.id]?.orientation ?? 'portrait',
    actionLog: saved[inst.id]?.actionLog ?? [],
    selected: index === 0,
  }));

  let isSyncEnabled = Storage.get('interface_sync_enabled', true);
  let recording = false;
  let macroSteps = [];
  let lastStepAt = 0;
  let isPlaying = false;

  const joystick = { up: false, down: false, left: false, right: false };
  const dragState = new Map();

  function persist() {
    const pack = {};
    instances.forEach(inst => {
      pack[inst.id] = { orientation: inst.orientation, actionLog: inst.actionLog.slice(0, 8) };
    });
    Storage.set(STORAGE_KEY, pack);
    Storage.set('interface_sync_enabled', isSyncEnabled);
  }

  function selectedInstance() {
    return instances.find(i => i.selected) || instances[0];
  }

  function targetInstances(scope, preferredId) {
    if (scope === 'all') return instances;
    const target = instances.find(i => i.id === preferredId) || selectedInstance();
    return target ? [target] : [];
  }

  function addLog(instance, text) {
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    instance.actionLog.unshift(`${stamp} • ${text}`);
    instance.actionLog = instance.actionLog.slice(0, 8);
  }

  function toLabel(command) {
    if (command.type === 'tap') return 'Tap';
    if (command.type === 'longPress') return 'Long Press';
    if (command.type === 'swipe') return `Swipe ${command.payload.direction}`;
    if (command.type === 'joystick') return `Joystick x:${command.payload.x} y:${command.payload.y}`;
    if (command.type === 'orientation') return `Orientação ${command.payload.mode === 'portrait' ? 'Retrato' : 'Paisagem'}`;
    return command.type;
  }

  function render() {
    const grid = $('#instance-grid');
    grid.innerHTML = '';

    $('#active-instances').textContent = `${instances.length} instância(s) carregada(s)`;
    $('#sync-toggle').checked = isSyncEnabled;

    instances.forEach(inst => {
      const card = document.createElement('article');
      card.className = `instance-card${inst.selected ? ' selected' : ''}`;
      card.dataset.id = inst.id;
      card.innerHTML = `
        <div class="instance-head">
          <strong>${escapeHtml(inst.name)}</strong>
          <span class="orientation-badge">${inst.orientation === 'portrait' ? 'Retrato' : 'Paisagem'}</span>
        </div>
        <div class="device-screen ${inst.orientation}" data-instance-id="${inst.id}">Visor Emulado</div>
        <ul class="action-log">
          ${inst.actionLog.map(entry => `<li>${escapeHtml(entry)}</li>`).join('') || '<li>Sem ações registradas.</li>'}
        </ul>
      `;
      grid.appendChild(card);
    });

    updateMacroButtons();
    persist();
  }

  function updateMacroButtons() {
    $('#record-macro-btn').disabled = recording || isPlaying;
    $('#stop-macro-btn').disabled = !recording;
    $('#play-macro-btn').disabled = macroSteps.length === 0 || recording || isPlaying;
    $('#clear-macro-btn').disabled = macroSteps.length === 0 || recording || isPlaying;

    const list = $('#macro-list');
    list.innerHTML = macroSteps.map((step, idx) => {
      if (step.type === 'wait') return `<li>${idx + 1}. Espera ${step.ms}ms</li>`;
      return `<li>${idx + 1}. ${escapeHtml(toLabel(step.command))}</li>`;
    }).join('') || '<li>Nenhuma macro gravada.</li>';
  }

  function recordStep(command) {
    if (!recording || isPlaying) return;
    const now = Date.now();
    const wait = now - lastStepAt;
    if (wait > 80) macroSteps.push({ type: 'wait', ms: wait });
    macroSteps.push({ type: 'command', command: sanitizeCommand(command) });
    lastStepAt = now;
    updateMacroButtons();
  }

  function sanitizeCommand(command) {
    return {
      type: command.type,
      scope: command.scope,
      targetId: command.targetId,
      payload: JSON.parse(JSON.stringify(command.payload || {})),
    };
  }

  function applyCommand(command, options = {}) {
    const { shouldBroadcast = true, shouldRecord = true } = options;
    const targets = targetInstances(command.scope, command.targetId);
    const label = toLabel(command);

    targets.forEach(inst => {
      if (command.type === 'orientation') inst.orientation = command.payload.mode;
      addLog(inst, label);
    });

    render();

    if (shouldRecord) recordStep(command);
    if (shouldBroadcast && isSyncEnabled) broadcast(command);
  }

  function broadcast(command) {
    const envelope = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      source: WINDOW_ID,
      command,
      sentAt: Date.now(),
    };
    if (channel) channel.postMessage(envelope);
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(envelope));
  }

  function handleEnvelope(envelope) {
    if (!envelope || envelope.source === WINDOW_ID || !envelope.command) return;
    applyCommand(envelope.command, { shouldBroadcast: false, shouldRecord: false });
    Toast.show('Comando sincronizado de outra janela');
  }

  function handlePointerDown(event, screen) {
    if (event.button === 2) return;
    event.preventDefault();

    const instanceId = parseInt(screen.dataset.instanceId, 10);
    const state = {
      x: event.clientX,
      y: event.clientY,
      ts: Date.now(),
      moved: false,
    };

    dragState.set(instanceId, state);
  }

  function handlePointerMove(event, screen) {
    const instanceId = parseInt(screen.dataset.instanceId, 10);
    const state = dragState.get(instanceId);
    if (!state) return;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (Math.hypot(dx, dy) > 14) state.moved = true;
  }

  function handlePointerUp(event, screen) {
    const instanceId = parseInt(screen.dataset.instanceId, 10);
    const state = dragState.get(instanceId);
    dragState.delete(instanceId);
    if (!state) return;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const duration = Date.now() - state.ts;

    if (state.moved && Math.hypot(dx, dy) > 24) {
      const direction = Math.abs(dx) >= Math.abs(dy)
        ? (dx >= 0 ? 'direita' : 'esquerda')
        : (dy >= 0 ? 'baixo' : 'cima');
      issueLocalCommand({
        type: 'swipe',
        scope: isSyncEnabled ? 'all' : 'single',
        targetId: instanceId,
        payload: { direction, dx: Math.round(dx), dy: Math.round(dy), duration },
      });
      return;
    }

    issueLocalCommand({
      type: duration > 450 ? 'longPress' : 'tap',
      scope: isSyncEnabled ? 'all' : 'single',
      targetId: instanceId,
      payload: { x: Math.round(state.x), y: Math.round(state.y), duration },
    });
  }

  function handleContextMenu(event, screen) {
    event.preventDefault();
    const instanceId = parseInt(screen.dataset.instanceId, 10);
    issueLocalCommand({
      type: 'longPress',
      scope: isSyncEnabled ? 'all' : 'single',
      targetId: instanceId,
      payload: { x: Math.round(event.clientX), y: Math.round(event.clientY), duration: 650 },
    });
  }

  function joystickVector() {
    const x = (joystick.right ? 1 : 0) + (joystick.left ? -1 : 0);
    const y = (joystick.down ? 1 : 0) + (joystick.up ? -1 : 0);
    return { x, y };
  }

  function sendJoystick() {
    const vec = joystickVector();
    issueLocalCommand({
      type: 'joystick',
      scope: isSyncEnabled ? 'all' : 'single',
      payload: vec,
    });
  }

  function issueLocalCommand(command) {
    applyCommand(command, { shouldBroadcast: true, shouldRecord: true });
  }

  function setOrientation(mode) {
    issueLocalCommand({
      type: 'orientation',
      scope: isSyncEnabled ? 'all' : 'single',
      targetId: selectedInstance()?.id,
      payload: { mode },
    });
  }

  async function playMacro() {
    if (macroSteps.length === 0 || isPlaying) return;
    isPlaying = true;
    updateMacroButtons();

    for (const step of macroSteps) {
      if (step.type === 'wait') {
        await new Promise(resolve => setTimeout(resolve, step.ms));
      } else if (step.type === 'command') {
        applyCommand(step.command, { shouldBroadcast: true, shouldRecord: false });
      }
    }

    isPlaying = false;
    updateMacroButtons();
    Toast.show('Macro finalizada');
  }

  function bindEvents() {
    $('#instance-grid').addEventListener('click', event => {
      const card = event.target.closest('.instance-card');
      if (!card) return;
      const id = parseInt(card.dataset.id, 10);
      instances.forEach(inst => { inst.selected = inst.id === id; });
      render();
    });

    $('#instance-grid').addEventListener('mousedown', event => {
      const screen = event.target.closest('.device-screen');
      if (!screen || event.button !== 0) return;
      handlePointerDown(event, screen);
    });

    $('#instance-grid').addEventListener('mousemove', event => {
      const screen = event.target.closest('.device-screen');
      if (!screen) return;
      handlePointerMove(event, screen);
    });

    $('#instance-grid').addEventListener('mouseup', event => {
      const screen = event.target.closest('.device-screen');
      if (!screen || event.button !== 0) return;
      handlePointerUp(event, screen);
    });

    $('#instance-grid').addEventListener('contextmenu', event => {
      const screen = event.target.closest('.device-screen');
      if (!screen) return;
      handleContextMenu(event, screen);
    });

    $('#sync-toggle').addEventListener('change', event => {
      isSyncEnabled = event.target.checked;
      persist();
      Toast.show(isSyncEnabled ? 'Sincronização ativada' : 'Sincronização desativada');
    });

    $('#portrait-btn').addEventListener('click', () => setOrientation('portrait'));
    $('#landscape-btn').addEventListener('click', () => setOrientation('landscape'));

    $('#record-macro-btn').addEventListener('click', () => {
      recording = true;
      macroSteps = [];
      lastStepAt = Date.now();
      updateMacroButtons();
      Toast.show('Gravação de macro iniciada');
    });

    $('#stop-macro-btn').addEventListener('click', () => {
      recording = false;
      updateMacroButtons();
      Toast.show('Gravação de macro encerrada');
    });

    $('#play-macro-btn').addEventListener('click', playMacro);

    $('#clear-macro-btn').addEventListener('click', () => {
      macroSteps = [];
      updateMacroButtons();
      Toast.show('Macro limpa');
    });

    document.addEventListener('keydown', event => {
      const tag = (event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (event.key === ' ' && !event.repeat) {
        event.preventDefault();
        issueLocalCommand({ type: 'tap', scope: isSyncEnabled ? 'all' : 'single', targetId: selectedInstance()?.id, payload: { x: 'center', y: 'center' } });
      }

      if (event.key === 'Enter' && !event.repeat) {
        issueLocalCommand({ type: 'longPress', scope: isSyncEnabled ? 'all' : 'single', targetId: selectedInstance()?.id, payload: { x: 'center', y: 'center', duration: 700 } });
      }

      if ((event.key === 'q' || event.key === 'Q') && !event.repeat) {
        issueLocalCommand({ type: 'swipe', scope: isSyncEnabled ? 'all' : 'single', targetId: selectedInstance()?.id, payload: { direction: 'esquerda', dx: -80, dy: 0, duration: 180 } });
      }

      if ((event.key === 'e' || event.key === 'E') && !event.repeat) {
        issueLocalCommand({ type: 'swipe', scope: isSyncEnabled ? 'all' : 'single', targetId: selectedInstance()?.id, payload: { direction: 'direita', dx: 80, dy: 0, duration: 180 } });
      }

      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') { joystick.up = true; sendJoystick(); }
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') { joystick.down = true; sendJoystick(); }
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') { joystick.left = true; sendJoystick(); }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') { joystick.right = true; sendJoystick(); }
    });

    document.addEventListener('keyup', event => {
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') joystick.up = false;
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') joystick.down = false;
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') joystick.left = false;
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') joystick.right = false;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D'].includes(event.key)) {
        sendJoystick();
      }
    });

    if (channel) channel.addEventListener('message', event => handleEnvelope(event.data));

    window.addEventListener('storage', event => {
      if (event.key !== SYNC_STORAGE_KEY || !event.newValue) return;
      try { handleEnvelope(JSON.parse(event.newValue)); } catch { /* noop */ }
    });
  }

  function init() {
    if (instances.length === 0) {
      $('#instance-grid').innerHTML = '<p class="helper">Nenhuma instância disponível. Crie uma instância na Etapa 1.</p>';
      return;
    }
    bindEvents();
    render();
  }

  return { init };
})();

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  Controller.init();
});
