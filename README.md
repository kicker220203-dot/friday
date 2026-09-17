# Пятница v0.7-ai

Веб-сборка Пятницы с нейроголосом ElevenLabs и свободным диалогом через OpenAI.

## Что нового
- открытые вопросы идут в OpenAI через Vercel backend;
- быстрые команды остаются локальными: время, дата, таймеры, память, режимы;
- Пятница получает короткую историю диалога и активные локальные записи памяти;
- Вторник Lite получает отдельный контекст и не получает личную память;
- ответы специально короткие для голосового интерфейса;
- текущая модель по умолчанию: `gpt-5.6-luna`;
- голос Пятницы: Jessica;
- голос Вторника: Charlie;
- ElevenLabs и OpenAI API keys хранятся только в Vercel.

## Архитектура

GitHub Pages/PWA -> Vercel backend -> OpenAI -> текст -> ElevenLabs -> аудио -> iPhone

Локальные команды не идут в AI и продолжают работать даже при недоступном OpenAI.

## Vercel environment variables

Обязательно для голоса:
- `ELEVENLABS_API_KEY`

Обязательно для AI:
- `OPENAI_API_KEY`

Рекомендуемые:
- `ELEVENLABS_MODEL_ID=eleven_flash_v2_5`
- `OPENAI_MODEL=gpt-5.6-luna`
- `ALLOWED_ORIGIN=https://kicker220203-dot.github.io`

## Backend endpoints
- `GET /api/health` — ElevenLabs health;
- `GET /api/voices` — список голосов ElevenLabs;
- `POST /api/tts` — ElevenLabs TTS proxy;
- `GET /api/ai-health` — OpenAI health;
- `POST /api/ai` — OpenAI Responses API proxy.

## AI routing

Примеры локальных команд:
- `Который час?`
- `Какая дата?`
- `Поставь таймер на 10 минут`
- `Запомни купить молоко`
- `Тихий режим`

Примеры AI-запросов:
- `Почему небо синее?`
- `Как лучше организовать мой день?`
- `Придумай три идеи для проекта`
- `Объясни это проще`

## Безопасность
Никогда не вставляй ElevenLabs или OpenAI API key в клиентские JS-файлы или GitHub Pages. Оба ключа должны находиться только в environment variables Vercel.

Текущий backend рассчитан на личный прототип. Перед публичным распространением нужно добавить авторизацию и лимиты, чтобы посторонние не могли расходовать API-квоту.
