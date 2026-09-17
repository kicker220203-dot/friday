function setCors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://kicker220203-dot.github.io';
  const origin = req.headers.origin || '';
  const value = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  res.setHeader('Access-Control-Allow-Origin', value);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const fridayConfigured = Boolean(process.env.ELEVENLABS_FRIDAY_VOICE_ID);
  const tuesdayConfigured = Boolean(process.env.ELEVENLABS_TUESDAY_VOICE_ID || process.env.ELEVENLABS_FRIDAY_VOICE_ID);
  const keyConfigured = Boolean(process.env.ELEVENLABS_API_KEY);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: keyConfigured && fridayConfigured,
    provider: 'elevenlabs',
    model: process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5',
    apiKeyConfigured: keyConfigured,
    fridayVoiceConfigured: fridayConfigured,
    tuesdayVoiceConfigured: tuesdayConfigured
  });
};
