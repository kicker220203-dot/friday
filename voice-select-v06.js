// Friday v0.6-voice: client-side ElevenLabs voice selection layer.
// Loaded after voice-v06.js. Keeps API keys server-side and stores only public voice IDs locally.

const v06ProjectBackend = 'https://friday-uocw.vercel.app';
const v06OriginalFetchForVoiceSelect = window.fetch.bind(window);
let v06AvailableVoices = [];
let v06VoicesLoaded = false;
let v06VoicesLoading = false;

// Use the known production backend by default so GitHub Pages needs no manual URL entry.
if (!v06VoiceSettings.backendUrl) {
  v06VoiceSettings.backendUrl = v06ProjectBackend;
  v06SaveSettings();
}

function v06VoiceGender(v) {
  const labels = v?.labels || {};
  return String(labels.gender || labels.sex || '').toLowerCase();
}

function v06VoiceLanguageText(v) {
  const parts = [];
  const verified = Array.isArray(v?.verified_languages) ? v.verified_languages : [];
  for (const item of verified) {
    if (typeof item === 'string') parts.push(item);
    else if (item && typeof item === 'object') parts.push(item.language || item.locale || item.name || '');
  }
  const labels = v?.labels || {};
  parts.push(labels.language || labels.locale || labels.accent || '');
  return parts.join(' ').toLowerCase();
}

function v06PickDefaultVoice(kind) {
  if (!v06AvailableVoices.length) return '';
  const wantGender = kind === 'tuesday' ? 'male' : 'female';
  const genderMatches = v06AvailableVoices.filter(v => v06VoiceGender(v).includes(wantGender));
  const russianGender = genderMatches.find(v => /ru|russian|рус/.test(v06VoiceLanguageText(v)));
  if (russianGender) return russianGender.voice_id;
  if (genderMatches[0]) return genderMatches[0].voice_id;
  const russianAny = v06AvailableVoices.find(v => /ru|russian|рус/.test(v06VoiceLanguageText(v)));
  if (russianAny) return russianAny.voice_id;
  if (kind === 'tuesday') return v06AvailableVoices[1]?.voice_id || v06AvailableVoices[0].voice_id;
  return v06AvailableVoices[0].voice_id;
}

function v06EnsureVoiceDefaults() {
  let changed = false;
  if (!v06VoiceSettings.fridayVoiceId) {
    v06VoiceSettings.fridayVoiceId = v06PickDefaultVoice('friday');
    changed = changed || Boolean(v06VoiceSettings.fridayVoiceId);
  }
  if (!v06VoiceSettings.tuesdayVoiceId) {
    v06VoiceSettings.tuesdayVoiceId = v06PickDefaultVoice('tuesday');
    changed = changed || Boolean(v06VoiceSettings.tuesdayVoiceId);
  }
  if (changed) v06SaveSettings();
}

async function v06LoadVoices(showResult = false) {
  if (v06VoicesLoading) return false;
  const backend = v06BackendUrl();
  if (!backend) {
    if (showResult) maybeStatus('Сервер голоса не указан.', true, 2200);
    return false;
  }
  v06VoicesLoading = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const r = await v06OriginalFetchForVoiceSelect(`${backend}/api/voices`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(data.voices)) throw new Error('voices_unavailable');
    v06AvailableVoices = data.voices.filter(v => v && v.voice_id && v.name);
    v06VoicesLoaded = true;
    v06EnsureVoiceDefaults();
    if (showResult) maybeStatus(`Загружено голосов: ${v06AvailableVoices.length}.`, true, 2200);
    return true;
  } catch {
    v06VoicesLoaded = false;
    if (showResult) maybeStatus('Не удалось загрузить голоса ElevenLabs.', true, 2600);
    return false;
  } finally {
    v06VoicesLoading = false;
  }
}

function v06VoiceLabel(v) {
  const labels = v?.labels || {};
  const details = [labels.gender, labels.age, labels.accent].filter(Boolean).join(' • ');
  return details ? `${v.name} — ${details}` : v.name;
}

function v06VoiceOptions(selectedId) {
  if (!v06AvailableVoices.length) return '<option value="">Сначала загрузить голоса</option>';
  return v06AvailableVoices.map(v => `<option value="${escapeHTML(v.voice_id)}" ${v.voice_id === selectedId ? 'selected' : ''}>${escapeHTML(v06VoiceLabel(v))}</option>`).join('');
}

// Inject the locally selected public voice ID into TTS requests.
window.fetch = async function(input, init) {
  try {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/api/tts') && String(init?.method || 'GET').toUpperCase() === 'POST' && init?.body) {
      let body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      if (body && !body.voiceId) {
        const chosen = body.persona === 'tuesday' ? v06VoiceSettings.tuesdayVoiceId : v06VoiceSettings.fridayVoiceId;
        if (chosen) body.voiceId = chosen;
        init = { ...init, body: JSON.stringify(body) };
      }
    }
  } catch {}
  return v06OriginalFetchForVoiceSelect(input, init);
};

const v06RenderSettingsBeforeVoiceSelect = window.renderSettings;
window.renderSettings = function() {
  const sel = n => settings.sessionWindowSec === n ? 'selected' : '';
  const backend = v06BackendUrl();
  const voiceStatus = !v06VoiceSettings.enabled ? 'Выключен' : (v06BackendState === 'online' ? 'Подключён' : v06BackendState === 'not-configured' ? 'Нужен ключ' : v06BackendState === 'offline' ? 'Сервер недоступен' : 'Не проверен');
  const html = `
    <div class="item">
      <div class="item-title">Нейроголос <span class="badge">${voiceStatus}</span></div>
      <div class="small">ElevenLabs через защищённый backend. API-ключ хранится только в Vercel.</div>
      <button data-panel-action="v06-toggle-voice">${v06VoiceSettings.enabled ? 'Нейроголос включён' : 'Нейроголос выключен'}</button>
      <div class="small">Сервер: ${escapeHTML(backend || 'не указан')}</div>
      <div class="row"><button data-panel-action="v06-check-backend">Проверить сервер</button><button data-panel-action="v06-load-voices">Загрузить голоса</button></div>
    </div>
    <div class="item">
      <div class="item-title">Голос Пятницы</div>
      <select id="v06FridayVoice" class="voice-select">${v06VoiceOptions(v06VoiceSettings.fridayVoiceId || '')}</select>
      <button data-panel-action="v06-test-friday">Прослушать Пятницу</button>
    </div>
    <div class="item">
      <div class="item-title">Голос Вторника</div>
      <select id="v06TuesdayVoice" class="voice-select">${v06VoiceOptions(v06VoiceSettings.tuesdayVoiceId || '')}</select>
      <button data-panel-action="v06-test-tuesday">Прослушать Вторника</button>
    </div>
    <div class="item"><div class="item-title">Голосовая сессия</div><div class="small">После ответа Пятница снова слушает без нового двойного тапа.</div><button data-panel-action="toggle-session">${settings.voiceSession?'Включена':'Выключена'}</button></div>
    <div class="item"><div class="item-title">Ожидание продолжения</div><div class="small">Сейчас: ${settings.sessionWindowSec} сек.</div><div class="row"><button class="${sel(5)}" data-panel-action="session-5">5 сек</button><button class="${sel(7)}" data-panel-action="session-7">7 сек</button><button class="${sel(10)}" data-panel-action="session-10">10 сек</button></div></div>
    <div class="item"><div class="item-title">Диагностика</div><div class="small">Показывать распознанный текст и технические статусы.</div><button data-panel-action="toggle-diag">${settings.diagnostics?'Включена':'Выключена'}</button></div>
    <div class="item"><div class="item-title">Данные</div><button data-panel-action="clear-timers">Очистить таймеры</button><button class="danger" data-panel-action="clear-memory">Очистить память</button></div>
    <div class="item"><div class="item-title">Wake word</div><div class="small">Постоянное «Пятница» пока выключено в PWA. Начало разговора — двойной тап.</div></div>
    <div class="item"><div class="item-title">AI</div><div class="small">Пока не подключён. Этот же backend позже используем для AI.</div></div>`;
  openPanel('Настройки', html, false);
  if (!v06VoicesLoaded && v06VoiceSettings.enabled) {
    v06LoadVoices(false).then(ok => { if (ok && panelOpen() && panelTitle.textContent === 'Настройки') window.renderSettings(); });
  }
};

const v06PanelActionBeforeVoiceSelect = window.panelAction;
window.panelAction = function(a) {
  if (a === 'v06-load-voices') {
    return v06LoadVoices(true).then(ok => { if (ok) window.renderSettings(); });
  }
  if (a === 'v06-test-friday') {
    const oldPersona = persona;
    persona = 'friday';
    return window.speak('Слушаю, Макс. Это мой новый голос.').finally(() => { persona = oldPersona; });
  }
  if (a === 'v06-test-tuesday') {
    const oldPersona = persona;
    persona = 'tuesday';
    return window.speak('Вторник на связи. Проверка голоса завершена.').finally(() => { persona = oldPersona; });
  }
  return v06PanelActionBeforeVoiceSelect(a);
};

panelContent.addEventListener('change', e => {
  const el = e.target;
  if (el?.id === 'v06FridayVoice') {
    v06VoiceSettings.fridayVoiceId = el.value || '';
    v06SaveSettings();
    maybeStatus('Голос Пятницы сохранён.', true, 1500);
  }
  if (el?.id === 'v06TuesdayVoice') {
    v06VoiceSettings.tuesdayVoiceId = el.value || '';
    v06SaveSettings();
    maybeStatus('Голос Вторника сохранён.', true, 1500);
  }
});

const v06SelectStyle = document.createElement('style');
v06SelectStyle.textContent = `
  .voice-select{width:100%;margin:9px 0;border:1px solid rgba(126,228,255,.17);border-radius:15px;padding:12px 13px;background:rgba(18,25,36,.98);color:var(--text);font:inherit;outline:none;-webkit-user-select:auto;user-select:auto}
  .voice-select:focus{border-color:rgba(126,228,255,.5)}
`;
document.head.appendChild(v06SelectStyle);

// Quiet background checks after the user has unlocked audio.
setTimeout(() => {
  if (v06VoiceSettings.enabled) {
    v06CheckBackend(false).then(ok => { if (ok) v06LoadVoices(false); });
  }
}, 1200);
