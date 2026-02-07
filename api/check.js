const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // ──────────────────────────────────────────────
  // CORS + preflight handling — MUST BE FIRST
  // ──────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Explicitly handle OPTIONS preflight (this is critical!)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return; // Stop here — do NOT continue to other logic
  }

  // Now set content type for actual responses
  res.setHeader('Content-Type', 'application/json');

  // ──────────────────────────────────────────────
  // Your original checkSingle function (unchanged)
  // ──────────────────────────────────────────────
  async function checkSingle(site) {
    const url = site.startsWith('http') ? site : `https://${site}`;
    const result = { url };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const headRes = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'LeadFinderProxy/1.0' }
      });

      clearTimeout(timeoutId);

      if (!headRes.ok) {
        result.status = 'down';
        result.details = `HTTP ${headRes.status}`;
        return result;
      }

      const getRes = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'LeadFinderProxy/1.0' }
      });

      if (!getRes.ok) {
        result.status = 'down';
        result.details = `Full page fetch failed (HTTP ${getRes.status})`;
        return result;
      }

      const html = await getRes.text();

      const suggestions = [];

      const viewportRegex = /<meta\s+[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i;
      const viewportMatch = html.match(viewportRegex);
      const hasProperViewport = viewportMatch && viewportMatch[1].toLowerCase().includes('width=device-width');

      if (!hasProperViewport) {
        suggestions.push('Missing or improper viewport meta tag (poor mobile support)');
      }

      const strippedText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const words = strippedText.split(' ').filter(w => w.length > 0);
      const wordCount = words.length;

      if (wordCount < 300) {
        suggestions.push(`Very thin content (~${wordCount} words visible)`);
      }

      if (suggestions.length > 0) {
        result.status = 'down';
        result.details = 'Website loads but fails quality checks (mobile or content issues)';
        result.suggestions = suggestions;
      } else {
        result.status = 'working';
        result.details = 'Website responded successfully';
      }

      return result;

    } catch (error) {
      result.status = 'down';
      result.details = error.name === 'AbortError' ? 'Timeout after 10 seconds' : 'Connection failed';
      return result;
    }
  }

  // ──────────────────────────────────────────────
  // GET handler
  // ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const queryUrl = req.query.url;
    if (!queryUrl) {
      return res.status(400).json({ error: 'Please provide a URL as ?url=example.com' });
    }
    const result = await checkSingle(queryUrl);
    return res.status(200).json(result);
  }

  // ──────────────────────────────────────────────
  // POST handler (batch)
  // ──────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  const { websites } = req.body || {};
  if (!Array.isArray(websites) || websites.length === 0) {
    return res.status(400).json({ error: 'Request must include { websites: [] }' });
  }

  const results = [];
  for (const site of websites) {
    const checked = await checkSingle(site);
    results.push(checked);
  }

  return res.status(200).json({ results });
};
