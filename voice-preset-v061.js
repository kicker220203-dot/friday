// Friday v0.6.1-voice: production voice preset.
// Pins the production backend and applies Jessica/Charlie once as the default pair.

const v061Backend = 'https://friday-uocw.vercel.app';
const v061PresetKey = 'friday_voice_preset_v061';
const v061PresetValue = 'jessica-charlie-v1';
const v061Jessica = { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' };
const v061Charlie = { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' };

// The app now knows its production backend; no manual URL setup is required.
v06VoiceSettings.backendUrl = v061Backend;
v06BackendUrl = function() { return v061Backend; };

// Apply the chosen pair once on existing installs. Later manual changes still persist.
if (localStorage.getItem(v061PresetKey) !== v061PresetValue) {
  v06VoiceSettings.fridayVoiceId = v061Jessica.id;
  v06VoiceSettings.fridayVoiceName = v061Jessica.name;
  v06VoiceSettings.tuesdayVoiceId = v061Charlie.id;
  v06VoiceSettings.tuesdayVoiceName = v061Charlie.name;
  v06SaveSettings();
  localStorage.setItem(v061PresetKey, v061PresetValue);
}

const v061RenderSettingsBase = window.renderSettings;
window.renderSettings = function() {
  v061RenderSettingsBase();
  const neuralItem = panelContent.querySelector('.item');
  if (neuralItem) {
    const current = document.createElement('div');
    current.className = 'small v061-current-voices';
    current.textContent = `По умолчанию: Пятница — ${v06VoiceSettings.fridayVoiceName || 'Jessica'}; Вторник — ${v06VoiceSettings.tuesdayVoiceName || 'Charlie'}.`;
    const firstButton = neuralItem.querySelector('button');
    neuralItem.insertBefore(current, firstButton || null);
  }
};

const v061RenderAboutBase = window.renderAbout;
window.renderAbout = function() {
  openPanel('О версии','<div class="item"><div class="item-title">Пятница v0.6.1-voice</div><div>Нейроголос ElevenLabs через закреплённый production backend.</div><div class="item-meta">Пятница: Jessica • Вторник: Charlie • автоматический fallback на системный голос</div></div>',false);
};

document.title = 'Пятница v0.6.1-voice';
document.querySelectorAll('.voice-title,.menu-title').forEach(el => {
  if (el.textContent.includes('Пятница')) el.textContent = 'Пятница v0.6.1-voice';
});
document.getElementById('stage')?.setAttribute('aria-label','Пятница v0.6.1-voice');

const v061Style = document.createElement('style');
v061Style.textContent = '.v061-current-voices{margin:8px 0 4px;color:rgba(235,251,255,.82)}';
document.head.appendChild(v061Style);

// Re-check backend after the preset has been applied.
setTimeout(() => { if (v06VoiceSettings.enabled) v06CheckBackend(false); }, 250);
