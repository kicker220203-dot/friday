# Пятница v0.6-voice

Веб-сборка Пятницы с нейросетевым голосом через защищённый backend.

## Что нового
- ElevenLabs TTS через serverless backend;
- API-ключ не хранится в клиентском JavaScript;
- выбор голоса Пятницы прямо из настроек;
- отдельный выбор голоса Вторника;
- предпрослушивание обоих голосов;
- автоматический fallback на системный голос iPhone, если backend недоступен;
- проверка состояния backend из настроек;
- адрес backend и выбранные голоса сохраняются локально на iPhone;
- сохранены все функции v0.5.2: голосовая сессия, таймеры, память, режимы, Вторник Lite.

## Архитектура

GitHub Pages/PWA -> Vercel backend -> ElevenLabs -> MP3 -> iPhone

## Vercel environment variables

Обязательно:
- `ELEVENLABS_API_KEY`

Рекомендуемые:
- `ELEVENLABS_MODEL_ID=eleven_flash_v2_5`
- `ALLOWED_ORIGIN=https://kicker220203-dot.github.io`

Необязательные fallback-голоса:
- `ELEVENLABS_FRIDAY_VOICE_ID`
- `ELEVENLABS_TUESDAY_VOICE_ID`

Voice ID теперь можно вообще не хранить в Vercel: Пятница получает список доступных голосов через backend и сохраняет выбранные ID локально на iPhone.

## Backend endpoints
- `GET /api/health` — проверка конфигурации TTS;
- `GET /api/voices` — список доступных голосов ElevenLabs;
- `POST /api/tts` — proxy к ElevenLabs TTS.

## Первый запуск
1. Развернуть этот репозиторий в Vercel.
2. Добавить `ELEVENLABS_API_KEY` и рекомендуемые environment variables.
3. Redeploy.
4. На iPhone открыть Пятницу -> Настройки.
5. Вставить адрес вида `https://<project>.vercel.app`.
6. Нажать `Сохранить сервер`, затем `Проверить`.
7. Нажать `Загрузить доступные голоса`.
8. Выбрать голос Пятницы и Вторника и прослушать их.
9. После выбора обычный `Тест голоса` и все ответы Пятницы идут через ElevenLabs.

## Безопасность
Никогда не вставляй ElevenLabs API key в GitHub Pages, `app.js`, `voice-v06.js` или поле настроек Пятницы. Ключ должен находиться только в environment variables Vercel.

Текущий backend рассчитан на личный прототип. Перед публичным распространением нужно добавить более строгую защиту от чужих запросов и расходования ElevenLabs-квоты.

## AI
AI пока не подключён. Тот же backend позже будет расширен под AI-запросы, поэтому эта работа не временная.
