// Friday v0.7-ai: routes local commands locally and open-ended conversation to OpenAI via Vercel.
// API keys stay server-side. Voice output continues through the existing ElevenLabs layer.

const v07Backend = 'https://friday-uocw.vercel.app';
const v07LocalCommandHandler = window.handleVoiceCommand;
const v07StopVoiceBase = window.stopAllVoice;
const v07RenderSettingsBase = window.renderSettings;
const v07PanelActionBase = window.panelAction;

let v07Settings = (() => {
  try {
    return { enabled: true, ...(JSON.parse(localStorage.getItem('friday_ai_settings_v07') || '{}')) };
  } catch {
    return { enabled: true };
  }
})();

let v07History = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem('friday_ai_history_v07') || '{}');
    return {
      friday: Array.isArray(raw.friday) ? raw.friday.slice(-10) : [],
      tuesday: Array.isArray(raw.tuesday) ? raw.tuesday.slice(-10) : []
    };
  } catch {
    return { friday: [], tuesday: [] };
  }
})();

let v07AiState = 'unknown';
let v07AiBusy = false;
let v07AiAbort = null;

function v07SaveSettings() {
  localStorage.setItem('friday_ai_settings_v07', JSON.stringify(v07Settings));
}

function v07SaveHistory() {
  localStorage.setItem('friday_ai_history_v07', JSON.stringify(v07History));
}

function v07PersonaKey() {
  return persona === 'tuesday' ? 'tuesday' : 'friday';
}

function v07HistoryFor(kind) {
  return (v07History[kind] || []).slice(-10);
}

function v07AddHistory(kind, role, text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  if (!Array.isArray(v07History[kind])) v07History[kind] = [];
  v07History[kind].push({ role, text: clean.slice(0, 700) });
  v07History[kind] = v07History[kind].slice(-10);
  v07SaveHistory();
}

function v07MemorySnapshot() {
  if (persona === 'tuesday') return [];
  return (Array.isArray(memories) ? memories : [])
    .filter(m => !m.status || m.status === 'active')
    .slice(-20)
    .map(m => ({
      category: m.category || 'notes',
      topic: m.topic || '',
      content: m.content || '',
      importance: m.importance || 'medium'
    }));
}

function v07IsLocalCommand(raw) {
  const text = normalize(raw);
  if (!text) return true;
  if (micTestMode) return true;
  try { if (typeof v052PendingVoiceIntent !== 'undefined' && v052PendingVoiceIntent) return true; } catch {}

  const starters = [
    'запомни','сохрани','не забудь','забудь','удали из памяти'
  ];
  if (starters.some(x => text.startsWith(x))) return true;

  const localPhrases = [
    'стоп','замолчи','остановись','хватит','отбой','до связи','закончить',
    'повтори','повтор','спать','усни','засыпай','проснись','вставай',
    'тихий режим','потише','рабочий режим','соберись','обычный режим','нормальный режим',
    'который час','сколько времени','сколько время','время сейчас','текущее время',
    'какое сегодня число','какое число','какая дата','сегодняшняя дата','дата сегодня','какой сегодня день',
    'сколько осталось','сколько там осталось','отмени таймер','убери таймер','сбрось таймер','удали таймер',
    'поставь таймер','поставить таймер','засеки','таймер на','создай таймер','запусти таймер','заведи таймер','отсчитай',
    'что ты умеешь','помощь','команды','режимы','что ты помнишь','что в памяти',
    'открой меню','меню','верни пятницу','пятница обратно'
  ];
  if (localPhrases.some(x => text.includes(x))) return true;
  if (text === 'таймер' || text === 'пятница' || text === 'вторник') return true;
  return false;
}

async function v07CheckAI(showResult=true) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const r = await fetch(`${v07Backend}/api/ai-health`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await r.json().catch(() => ({}));
    const ok = r.ok && data.ok === true;
    v07AiState = ok ? 'online' : 'not-configured';
    if (showResult) maybeStatus(ok ? `AI подключён: ${data.model || 'OpenAI'}.` : 'Backend работает, но OPENAI_API_KEY ещё не настроен.', true, 3000);
    return ok;
  } catch {
    v07AiState = 'offline';
    if (showResult) maybeStatus('AI backend сейчас недоступен.', true, 2400);
    return false;
  }
}

function v07AiStateLabel() {
  if (!v07Settings.enabled) return 'Выключен';
  if (v07AiState === 'online') return 'Подключён';
  if (v07AiState === 'not-configured') return 'Нужен API key';
  if (v07AiState === 'offline') return 'Недоступен';
  return 'Не проверен';
}

async function v07AskAI(raw) {
  const message = String(raw || '').trim();
  if (!message) return;
  if (!v07Settings.enabled) return v07LocalCommandHandler(raw);

  if (v07AiBusy) {
    maybeStatus('Я ещё думаю над предыдущим вопросом.', true, 1800);
    return;
  }

  const kind = v07PersonaKey();
  v07AiBusy = true;
  setState('attentive');
  maybeStatus(kind === 'tuesday' ? 'Вторник думает…' : 'Думаю…', settings.diagnostics, 1400);

  const controller = new AbortController();
  v07AiAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const r = await fetch(`${v07Backend}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        persona: kind,
        mode,
        history: v07HistoryFor(kind),
        memory: v07MemorySnapshot()
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.answer) {
      const detail = data?.detail ? ` ${data.detail}` : '';
      throw new Error(`ai_http_${r.status}${detail}`);
    }

    v07AiState = 'online';
    v07AddHistory(kind, 'user', message);
    v07AddHistory(kind, 'assistant', data.answer);
    await window.speak(String(data.answer).trim(), { continueSession: true });
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (v07AiAbort === controller) maybeStatus('Запрос остановлен.', settings.diagnostics, 1500);
      return;
    }
    v07AiState = String(error?.message || '').includes('503') ? 'not-configured' : 'offline';
    console.warn('Friday AI error', error);
    await window.speak(v07AiState === 'not-configured'
      ? 'Мой AI ещё не подключён. Локальные команды уже работают.'
      : 'Не получилось связаться с AI. Локальные команды работают.', { continueSession: true });
  } finally {
    clearTimeout(timeout);
    if (v07AiAbort === controller) v07AiAbort = null;
    v07AiBusy = false;
    if (!isSleeping && !isListening && !isSpeaking && !menuOpen() && !panelOpen()) setState('idle');
  }
}

window.stopAllVoice = function() {
  try { v07AiAbort?.abort(); } catch {}
  v07AiAbort = null;
  v07AiBusy = false;
  return v07StopVoiceBase();
};

window.handleVoiceCommand = function(raw) {
  const text = normalize(raw);

  // Switch personas locally; after entering Tuesday, open-ended speech goes to Tuesday AI.
  if (text === 'вторник' || text.includes('включи вторника')) return v07LocalCommandHandler(raw);
  if (text.includes('верни пятницу') || text.includes('пятница обратно')) return v07LocalCommandHandler(raw);

  if (v07IsLocalCommand(raw)) return v07LocalCommandHandler(raw);
  return v07AskAI(raw);
};

window.renderSettings = function() {
  v07RenderSettingsBase();
  const aiBlock = document.createElement('div');
  aiBlock.className = 'item v07-ai-settings';
  aiBlock.innerHTML = `
    <div class="item-title">AI <span class="badge">${v07AiStateLabel()}</span></div>
    <div class="small">Открытые вопросы идут в OpenAI через Vercel. Таймеры, память, режимы и другие быстрые команды остаются локальными.</div>
    <button data-panel-action="v07-toggle-ai">${v07Settings.enabled ? 'AI включён' : 'AI выключен'}</button>
    <div class="row"><button data-panel-action="v07-check-ai">Проверить AI</button><button data-panel-action="v07-clear-history">Очистить диалог</button></div>
    <div class="small">Пятница получает активные записи памяти. Вторник Lite личную память не получает.</div>`;
  panelContent.insertBefore(aiBlock, panelContent.firstChild);
};

window.panelAction = function(a) {
  if (a === 'v07-toggle-ai') {
    v07Settings.enabled = !v07Settings.enabled;
    v07SaveSettings();
    return window.renderSettings();
  }
  if (a === 'v07-check-ai') return v07CheckAI(true).then(() => { if (panelOpen()) window.renderSettings(); });
  if (a === 'v07-clear-history') {
    v07History = { friday: [], tuesday: [] };
    v07SaveHistory();
    maybeStatus('Контекст диалога очищен.', true, 1800);
    return;
  }
  return v07PanelActionBase(a);
};

window.renderAbout = function() {
  openPanel('О версии','<div class="item"><div class="item-title">Пятница v0.7-ai</div><div>OpenAI для свободного диалога + локальные быстрые команды + ElevenLabs.</div><div class="item-meta">Пятница: Jessica • Вторник: Charlie • AI через Vercel • память Пятницы • отдельный контекст Вторника Lite</div></div>',false);
};

document.title = 'Пятница v0.7-ai';
document.querySelectorAll('.voice-title,.menu-title').forEach(el => {
  if (el.textContent.includes('Пятница')) el.textContent = 'Пятница v0.7-ai';
});
document.getElementById('stage')?.setAttribute('aria-label','Пятница v0.7-ai');

setTimeout(() => { if (v07Settings.enabled) v07CheckAI(false); }, 1100);
