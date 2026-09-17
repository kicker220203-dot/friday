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

  const configured = Boolean(process.env.OPENAI_API_KEY);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: configured,
    provider: 'openai',
    model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
    apiKeyConfigured: configured
  });
};
