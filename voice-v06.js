// Friday v0.6-voice: neural TTS layer.
// Keeps v0.5.2 recognition/timers/memory and replaces speech output when backend is configured.

const v06LegacySpeak = window.speak;
const v06LegacyStopAllVoice = window.stopAllVoice;
const v06LegacyPanelAction = window.panelAction;

let v06VoiceSettings = (() => {
  try {
    return {
      enabled: true,
      backendUrl: '',
      fridayVoiceId: '',
      fridayVoiceName: '',
      tuesdayVoiceId: '',
      tuesdayVoiceName: '',
      ...(JSON.parse(localStorage.getItem('friday_voice_settings') || '{}'))
    };
  } catch {
    return {
      enabled: true,
      backendUrl: '',
      fridayVoiceId: '',
      fridayVoiceName: '',
      tuesdayVoiceId: '',
      tuesdayVoiceName: ''
    };
  }
})();

let v06AudioContext = null;
let v06CurrentSource = null;
let v06CurrentGain = null;
let v06AbortController = null;
let v06SpeechToken = 0;
let v06BackendState = 'unknown';
let v06Voices = [];
let v06VoicesLoading = false;

function v06SaveSettings() {
  localStorage.setItem('friday_voice_settings', JSON.stringify(v06VoiceSettings));
}

function v06SanitizeBackend(url='') {
  const value = String(url).trim().replace(/\/+$/, '');
  if (!value) return '';
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}

function v06BackendUrl() {
  const saved = v06SanitizeBackend(v06VoiceSettings.backendUrl);
  if (saved) return saved;
  if (location.hostname.endsWith('.vercel.app')) return location.origin;
  return '';
}

function v06GetAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!v06AudioContext) v06AudioContext = new Ctx();
  return v06AudioContext;
}

async function v06UnlockAudio() {
  const ctx = v06GetAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state !== 'running') await ctx.resume();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

function v06StopNeuralOnly() {
  v06SpeechToken++;
  try { v06AbortController?.abort(); } catch {}
  v06AbortController = null;
  try { v06CurrentSource?.stop(0); } catch {}
  try { v06CurrentSource?.disconnect(); } catch {}
  try { v06CurrentGain?.disconnect(); } catch {}
  v06CurrentSource = null;
  v06CurrentGain = null;
}

window.stopAllVoice = function() {
  v06StopNeuralOnly();
  return v06LegacyStopAllVoice();
};

function v06VoiceIdFor(kind) {
  return kind === 'tuesday' ? (v06VoiceSettings.tuesdayVoiceId || '') : (v06VoiceSettings.fridayVoiceId || '');
}

async function v06FetchAndPlay(text, kind='friday', voiceId='', opts={}) {
  const backend = v06BackendUrl();
  if (!backend) throw new Error('backend_missing');

  const token = ++v06SpeechToken;
  try { window.speechSynthesis?.cancel(); } catch {}
  try { v06CurrentSource?.stop(0); } catch {}
  v06CurrentSource = null;
  v06CurrentGain = null;

  const ctx = v06GetAudioContext();
  if (!ctx) throw new Error('audio_context_unavailable');
  if (ctx.state !== 'running') await ctx.resume();

  isSpeaking = true;
  if (!isSleeping && !menuOpen() && !panelOpen()) setState('attentive');
  maybeStatus('Генерирую голос…', false, 1200);

  const controller = new AbortController();
  v06AbortController = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);

  let response;
  try {
    response = await fetch(`${backend}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, persona: kind, voiceId: voiceId || undefined }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (token !== v06SpeechToken) return false;
  if (!response.ok) throw new Error(`tts_http_${response.status}`);

  const bytes = await response.arrayBuffer();
  if (token !== v06SpeechToken) return false;
  const audioBuffer = await ctx.decodeAudioData(bytes.slice(0));
  if (token !== v06SpeechToken) return false;

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = audioBuffer;
  gain.gain.value = mode === 'quiet' ? 0.50 : 1;
  source.connect(gain);
  gain.connect(ctx.destination);
  v06CurrentSource = source;
  v06CurrentGain = gain;
  v06BackendState = 'online';

  return await new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (v06CurrentSource === source) v06CurrentSource = null;
      if (v06CurrentGain === gain) v06CurrentGain = null;
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      isSpeaking = false;
      if (!isSleeping && !menuOpen() && !panelOpen() && !isListening) setState('idle');
      if (opts.continueSession && sessionActive && settings.voiceSession) armSession();
      resolve(true);
    };
    source.onended = finish;
    if (!isSleeping && !menuOpen() && !panelOpen()) setState('speaking');
    source.start(0);
  });
}

window.speak = async function(text, opts={}) {
  text = String(text || '').trim();
  if (!text) return false;
  lastAnswer = text;

  const backend = v06BackendUrl();
  const kind = persona === 'tuesday' ? 'tuesday' : 'friday';
  const voiceId = v06VoiceIdFor(kind);
  if (!v06VoiceSettings.enabled || !backend) return v06LegacySpeak(text, opts);

  try {
    return await v06FetchAndPlay(text, kind, voiceId, opts);
  } catch (error) {
    isSpeaking = false;
    if (!isSleeping && !menuOpen() && !panelOpen() && !isListening) setState('idle');
    if (String(error?.message || '').startsWith('tts_http_400') && !voiceId) {
      maybeStatus('Выбери голос в настройках.', false, 2200);
    } else {
      v06BackendState = 'offline';
      maybeStatus('Нейроголос недоступен — системный голос.', false, 2200);
    }
    return v06LegacySpeak(text, opts);
  }
};

async function v06CheckBackend(showResult=true) {
  const backend = v06BackendUrl();
  if (!backend) {
    v06BackendState = 'missing';
    if (showResult) maybeStatus('Сервер голоса ещё не указан.', true, 2400);
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const r = await fetch(`${backend}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await r.json().catch(() => ({}));
    const ok = r.ok && data.ok === true;
    v06BackendState = ok ? 'online' : 'not-configured';
    if (showResult) {
      maybeStatus(ok ? 'Сервер голоса подключён.' : 'Сервер найден, но ElevenLabs API key ещё не настроен.', true, 3000);
    }
    return ok;
  } catch {
    v06BackendState = 'offline';
    if (showResult) maybeStatus('Сервер голоса не отвечает.', true, 2400);
    return false;
  }
}

function v06VoiceStateLabel() {
  if (!v06VoiceSettings.enabled) return 'Выключен';
  if (!v06BackendUrl()) return 'Ждёт сервер';
  if (v06BackendState === 'online') return 'Подключён';
  if (v06BackendState === 'not-configured') return 'Нужен API key';
  if (v06BackendState === 'offline') return 'Сервер недоступен';
  return 'Не проверен';
}

function v06VoiceMeta(v) {
  const labels = v?.labels || {};
  const ru = Array.isArray(v?.verified_languages) && v.verified_languages.some(x => String(x?.language || x?.locale || '').toLowerCase().startsWith('ru'));
  return [ru ? 'RU' : '', labels.gender || '', labels.age || '', labels.accent || '', v.category || ''].filter(Boolean).join(' • ');
}

function v06SortedVoices() {
  return v06Voices.slice().sort((a,b) => {
    const aru = Array.isArray(a.verified_languages) && a.verified_languages.some(x => String(x?.language || x?.locale || '').toLowerCase().startsWith('ru'));
    const bru = Array.isArray(b.verified_languages) && b.verified_languages.some(x => String(x?.language || x?.locale || '').toLowerCase().startsWith('ru'));
    if (aru !== bru) return aru ? -1 : 1;
    const af = String(a?.labels?.gender || '').toLowerCase() === 'female';
    const bf = String(b?.labels?.gender || '').toLowerCase() === 'female';
    if (af !== bf) return af ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
  });
}

function v06VoiceOptions(selectedId) {
  const options = ['<option value="">— выбрать голос —</option>'];
  for (const v of v06SortedVoices()) {
    const meta = v06VoiceMeta(v);
    const selected = v.voice_id === selectedId ? ' selected' : '';
    options.push(`<option value="${escapeHTML(v.voice_id)}"${selected}>${escapeHTML(v.name || v.voice_id)}${meta ? ` — ${escapeHTML(meta)}` : ''}</option>`);
  }
  return options.join('');
}

async function v06LoadVoices(showResult=true) {
  const backend = v06BackendUrl();
  if (!backend) {
    if (showResult) maybeStatus('Сначала укажи адрес Vercel.', true, 2200);
    return false;
  }
  if (v06VoicesLoading) return false;
  v06VoicesLoading = true;
  try {
    const r = await fetch(`${backend}/api/voices`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(data.voices)) throw new Error('voices_load_failed');
    v06Voices = data.voices;
    if (showResult) maybeStatus(`Загружено голосов: ${v06Voices.length}.`, true, 2200);
    renderSettings();
    return true;
  } catch {
    if (showResult) maybeStatus('Не удалось загрузить голоса ElevenLabs.', true, 2600);
    return false;
  } finally {
    v06VoicesLoading = false;
  }
}

async function v06PreviewVoice(kind) {
  const id = v06VoiceIdFor(kind);
  if (!id) {
    maybeStatus(kind === 'tuesday' ? 'Сначала выбери голос Вторника.' : 'Сначала выбери голос Пятницы.', true, 2200);
    return;
  }
  const text = kind === 'tuesday'
    ? 'Максим. Вторник на связи. Давай разберём идею без лишнего оптимизма.'
    : 'Привет, Макс. Пятница на связи. Кажется, теперь я звучу немного живее.';
  try {
    await v06FetchAndPlay(text, kind, id, { continueSession: false });
  } catch {
    maybeStatus('Не получилось воспроизвести этот голос.', true, 2400);
  }
}

window.renderSettings = function() {
  const sel = n => settings.sessionWindowSec === n ? 'selected' : '';
  const backend = v06BackendUrl();
  const voiceControls = v06Voices.length ? `
      <div class="voice-picker-block">
        <div class="small voice-label">Пятница</div>
        <select id="v06FridayVoice" class="voice-select">${v06VoiceOptions(v06VoiceSettings.fridayVoiceId)}</select>
        <button data-panel-action="v06-preview-friday">Прослушать Пятницу</button>
      </div>
      <div class="voice-picker-block">
        <div class="small voice-label">Вторник</div>
        <select id="v06TuesdayVoice" class="voice-select">${v06VoiceOptions(v06VoiceSettings.tuesdayVoiceId)}</select>
        <button data-panel-action="v06-preview-tuesday">Прослушать Вторника</button>
      </div>` : `<button data-panel-action="v06-load-voices">${v06VoicesLoading ? 'Загрузка…' : 'Загрузить доступные голоса'}</button>`;

  const html = `
    <div class="item">
      <div class="item-title">Нейроголос <span class="badge">${v06VoiceStateLabel()}</span></div>
      <div class="small">ElevenLabs через защищённый backend. Если он недоступен, Пятница автоматически использует системный голос.</div>
      <button data-panel-action="v06-toggle-voice">${v06VoiceSettings.enabled ? 'Нейроголос включён' : 'Нейроголос выключен'}</button>
      <input id="v06BackendInput" class="voice-url-input" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://имя-проекта.vercel.app" value="${escapeHTML(backend)}">
      <div class="row"><button data-panel-action="v06-save-backend">Сохранить сервер</button><button data-panel-action="v06-check-backend">Проверить</button></div>
      ${voiceControls}
    </div>
    <div class="item"><div class="item-title">Голосовая сессия</div><div class="small">После ответа Пятница снова слушает без нового двойного тапа.</div><button data-panel-action="toggle-session">${settings.voiceSession?'Включена':'Выключена'}</button></div>
    <div class="item"><div class="item-title">Ожидание продолжения</div><div class="small">Сейчас: ${settings.sessionWindowSec} сек.</div><div class="row"><button class="${sel(5)}" data-panel-action="session-5">5 сек</button><button class="${sel(7)}" data-panel-action="session-7">7 сек</button><button class="${sel(10)}" data-panel-action="session-10">10 сек</button></div></div>
    <div class="item"><div class="item-title">Диагностика</div><div class="small">Показывать распознанный текст и технические статусы.</div><button data-panel-action="toggle-diag">${settings.diagnostics?'Включена':'Выключена'}</button></div>
    <div class="item"><div class="item-title">Данные</div><button data-panel-action="clear-timers">Очистить таймеры</button><button class="danger" data-panel-action="clear-memory">Очистить память</button></div>
    <div class="item"><div class="item-title">Wake word</div><div class="small">Постоянное «Пятница» пока выключено в PWA. Начало разговора — двойной тап.</div></div>
    <div class="item"><div class="item-title">AI</div><div class="small">Пока не подключён. Backend для него теперь уже подготовлен архитектурно.</div></div>`;
  openPanel('Настройки', html, false);
};

window.panelAction = function(a) {
  if (a === 'v06-toggle-voice') {
    v06VoiceSettings.enabled = !v06VoiceSettings.enabled;
    v06SaveSettings();
    return renderSettings();
  }
  if (a === 'v06-save-backend') {
    const input = document.getElementById('v06BackendInput');
    const value = v06SanitizeBackend(input?.value || '');
    if (!value) {
      maybeStatus('Нужен HTTPS-адрес Vercel.', true, 2400);
      return;
    }
    v06VoiceSettings.backendUrl = value;
    v06BackendState = 'unknown';
    v06Voices = [];
    v06SaveSettings();
    renderSettings();
    v06CheckBackend(true);
    return;
  }
  if (a === 'v06-check-backend') return v06CheckBackend(true);
  if (a === 'v06-load-voices') return v06LoadVoices(true);
  if (a === 'v06-preview-friday') return v06PreviewVoice('friday');
  if (a === 'v06-preview-tuesday') return v06PreviewVoice('tuesday');
  return v06LegacyPanelAction(a);
};

panelCard.addEventListener('change', e => {
  const el = e.target;
  if (el?.id === 'v06FridayVoice') {
    const voice = v06Voices.find(v => v.voice_id === el.value);
    v06VoiceSettings.fridayVoiceId = el.value || '';
    v06VoiceSettings.fridayVoiceName = voice?.name || '';
    v06SaveSettings();
  }
  if (el?.id === 'v06TuesdayVoice') {
    const voice = v06Voices.find(v => v.voice_id === el.value);
    v06VoiceSettings.tuesdayVoiceId = el.value || '';
    v06VoiceSettings.tuesdayVoiceName = voice?.name || '';
    v06SaveSettings();
  }
});

window.renderAbout = function() {
  openPanel('О версии','<div class="item"><div class="item-title">Пятница v0.6-voice</div><div>Нейросетевой голос ElevenLabs через защищённый backend с автоматическим fallback на системный TTS.</div><div class="item-meta">ElevenLabs • выбор голосов • backend proxy • системный fallback • отдельный профиль Вторника</div></div>',false);
};

// iOS: AudioContext has to be unlocked by an explicit user gesture.
unlockVoiceBtn.addEventListener('click', () => { v06UnlockAudio(); }, { passive: true });
document.addEventListener('pointerdown', () => {
  if (v06AudioContext?.state === 'suspended') v06AudioContext.resume().catch(() => {});
}, { passive: true });

const v06Style = document.createElement('style');
v06Style.textContent = `
  .voice-url-input,.voice-select{width:100%;margin:10px 0 4px;border:1px solid rgba(126,228,255,.17);border-radius:15px;padding:12px 13px;background:rgba(255,255,255,.045);color:var(--text);font:inherit;outline:none;-webkit-user-select:text;user-select:text}
  .voice-url-input:focus,.voice-select:focus{border-color:rgba(126,228,255,.5);box-shadow:0 0 0 1px rgba(65,199,255,.08) inset}
  .voice-select option{color:#111;background:#fff}
  .voice-picker-block{margin-top:12px;padding-top:10px;border-top:1px solid rgba(126,228,255,.10)}
  .voice-label{margin:0 2px 3px}
`;
document.head.appendChild(v06Style);

document.title = 'Пятница v0.6-voice';
document.querySelectorAll('.voice-title,.menu-title').forEach(el => {
  if (el.textContent.includes('Пятница')) el.textContent = 'Пятница v0.6-voice';
});
document.getElementById('stage')?.setAttribute('aria-label','Пятница v0.6-voice');

setTimeout(() => { if (v06BackendUrl()) v06CheckBackend(false); }, 900);
