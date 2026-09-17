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

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'voice_backend_not_configured' });

  try {
    const upstream = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false', {
      headers: { 'xi-api-key': apiKey, 'Accept': 'application/json' }
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('ElevenLabs voices error', upstream.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'voices_upstream_error', status: upstream.status });
    }
    const data = await upstream.json();
    const voices = (data.voices || []).map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category || '',
      description: v.description || '',
      labels: v.labels || {},
      preview_url: v.preview_url || null,
      verified_languages: Array.isArray(v.verified_languages) ? v.verified_languages : []
    }));
    res.setHeader('Cache-Control', 'private, max-age=120');
    return res.status(200).json({ voices });
  } catch (error) {
    console.error('Voices proxy error', error?.message || error);
    return res.status(502).json({ error: 'voices_proxy_error' });
  }
};
