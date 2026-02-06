const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // ----- REQUIRED HEADERS -----
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  const { websites } = req.body || {};

  if (!Array.isArray(websites) || websites.length === 0) {
    return res.status(400).json({
      error: 'Request must include { websites: [] }'
    });
  }

  const results = [];

  for (const url of websites) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'LeadFinderProxy/1.0' }
      });

      clearTimeout(timeoutId);

      results.push({
        url,
        status: response.ok ? 'working' : 'down',
        details: response.ok
          ? 'Website responded successfully'
          : `HTTP error: ${response.status} ${response.statusText}`
      });

    } catch (error) {
      results.push({
        url,
        status: 'down',
        details:
          error.name === 'AbortError'
            ? 'Timeout after 10 seconds'
            : error.message || 'Connection failed'
      });
    }
  }

  return res.status(200).json({ results });
};
