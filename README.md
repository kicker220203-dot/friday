# Пятница v0.6-voice

Веб-сборка Пятницы с нейросетевым голосом через защищённый backend.

## Что нового
- ElevenLabs TTS через serverless backend;
- API-ключ не хранится в клиентском JavaScript;
- отдельный голосовой профиль Пятницы;
- отдельный профиль Вторника;
- автоматический fallback на системный голос iPhone, если backend недоступен;
- проверка состояния backend из настроек;
- адрес backend сохраняется локально на iPhone;
- сохранены все функции v0.5.2: голосовая сессия, таймеры, память, режимы, Вторник Lite.

## Архитектура

GitHub Pages/PWA -> Vercel backend -> ElevenLabs -> MP3 -> iPhone

## Vercel environment variables

Обязательные:
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_FRIDAY_VOICE_ID`

Рекомендуемые:
- `ELEVENLABS_TUESDAY_VOICE_ID`
- `ELEVENLABS_MODEL_ID=eleven_flash_v2_5`
- `ALLOWED_ORIGIN=https://kicker220203-dot.github.io`

Если `ELEVENLABS_TUESDAY_VOICE_ID` не задан, Вторник временно использует голос Пятницы с другим профилем скорости/стабильности.

## Backend endpoints
- `GET /api/health` — проверка конфигурации TTS;
- `POST /api/tts` — защищённый proxy к ElevenLabs.

## Первый запуск
1. Развернуть этот репозиторий в Vercel.
2. Добавить environment variables.
3. Redeploy.
4. На iPhone открыть Пятницу -> Настройки.
5. Вставить адрес вида `https://<project>.vercel.app`.
6. Нажать `Сохранить сервер`, затем `Проверить`.
7. `Тест голоса` должен уже говорить через ElevenLabs.

## Безопасность
Никогда не вставляй ElevenLabs API key в GitHub Pages, `app.js`, `voice-v06.js` или поле настроек Пятницы. Ключ должен находиться только в environment variables Vercel.

## AI
AI пока не подключён. Тот же backend позже будет расширен под AI-запросы, поэтому эта работа не временная.
