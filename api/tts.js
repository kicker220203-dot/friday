const { Readable } = require('node:stream');

function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://kicker220203-dot.github.io';
  const origin = req.headers.origin || '';
  const value = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  res.setHeader('Access-Control-Allow-Origin', value);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const fridayVoice = process.env.ELEVENLABS_FRIDAY_VOICE_ID;
  const tuesdayVoice = process.env.ELEVENLABS_TUESDAY_VOICE_ID || fridayVoice;
  if (!apiKey || !fridayVoice) {
    return res.status(503).json({ error: 'voice_backend_not_configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const text = String(body.text || '').trim();
  const persona = body.persona === 'tuesday' ? 'tuesday' : 'friday';
  if (!text) return res.status(400).json({ error: 'text_required' });
  if (text.length > 1200) return res.status(413).json({ error: 'text_too_long' });

  const voiceId = persona === 'tuesday' ? tuesdayVoice : fridayVoice;
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
  const voiceSettings = persona === 'tuesday'
    ? { stability: 0.58, similarity_boost: 0.78, style: 0.05, use_speaker_boost: true, speed: 0.96 }
    : { stability: 0.42, similarity_boost: 0.76, style: 0.12, use_speaker_boost: true, speed: 1.06 };

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings })
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('ElevenLabs TTS error', upstream.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'tts_upstream_error', status: upstream.status });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    const requestId = upstream.headers.get('request-id');
    if (requestId) res.setHeader('X-TTS-Request-Id', requestId);

    if (upstream.body && typeof Readable.fromWeb === 'function') {
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.end(audio);
  } catch (error) {
    console.error('TTS proxy error', error?.message || error);
    if (!res.headersSent) return res.status(502).json({ error: 'tts_proxy_error' });
    res.end();
  }
};
