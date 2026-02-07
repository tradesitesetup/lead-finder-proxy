const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // ---- HEADERS ----
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'application/json');

  // Preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Helper: check a single site
  async function checkSingle(site) {
    const url = site.startsWith('http') ? site : `https://${site}`;
    const result = { url };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Original HEAD check
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

      // Site appears working from HEAD → fetch full HTML for extra checks
      const getRes = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'LeadFinderProxy/1.0' }
      });

      // If full GET fails, still count as working (HEAD was OK)
      if (!getRes.ok) {
        result.status = 'working';
        result.details = 'HEAD OK but full page fetch failed';
        return result;
      }

      const html = await getRes.text();

      // Set original success response
      result.status = 'working';
      result.details = 'Website responded successfully';

      // ------------------- Added: Suggestions for mobile formatting & word count -------------------
      const suggestions = [];

      // 1. Mobile formatting check (viewport meta tag)
      const viewportRegex = /<meta\s+[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i;
      const viewportMatch = html.match(viewportRegex);
      const hasProperViewport = viewportMatch && 
        viewportMatch[1].toLowerCase().includes('width=device-width');
      
      if (!hasProperViewport) {
        suggestions.push('Likely poor mobile formatting (missing or improper viewport meta tag)');
      }

      // 2. Rough visible word count
      const strippedText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')   // remove scripts
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')     // remove styles
        .replace(/<[^>]+>/g, ' ')                           // strip all HTML tags
        .replace(/\s+/g, ' ')                               // collapse multiple spaces
        .trim();
      
      const words = strippedText.split(' ').filter(w => w.length > 0);
      const wordCount = words.length;

      if (wordCount < 300) {
        suggestions.push(`Thin content (only ~${wordCount} words visible)`);
      }

      // Attach suggestions only if we found any issues
      if (suggestions.length > 0) {
        result.suggestions = suggestions;
      }

      return result;

    } catch (error) {
      result.status = 'down';
      result.details =
        error.name === 'AbortError'
          ? 'Timeout after 10 seconds'
          : 'Connection failed';
      return result;
    }
  }

  // ----- GET: single URL via query -----
  if (req.method === 'GET') {
    const queryUrl = req.query.url;
    if (!queryUrl) {
      return res.status(400).json({
        error: 'Please provide a URL to check as ?url=example.com'
      });
    }
    const result = await checkSingle(queryUrl);
    return res.status(200).json(result);
  }

  // ----- POST: batch check multiple websites -----
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
  for (const site of websites) {
    const checked = await checkSingle(site);
    results.push(checked);
  }

  return res.status(200).json({ results });
};
