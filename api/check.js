export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  try {
    const { websites } = req.body;

    if (!Array.isArray(websites) || websites.length === 0) {
      return res.status(400).json({ error: 'websites must be a non-empty array' });
    }

    // 🔥 CHANGE #1: allow up to 500
    const MAX_SITES = 500;
    const sites = websites.slice(0, MAX_SITES);

    const TIMEOUT_MS = 8000;
    const CONCURRENCY = 10; // 🔥 critical for stability

    const results = [];

    // ===== helper to check a single site =====
    async function checkSite(url) {
      let status = 'down';
      let httpStatus = null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
        });

        clearTimeout(timeout);

        httpStatus = response.status;

        if (response.ok) status = 'up';
        else if (response.status >= 300 && response.status < 500) status = 'reachable';
        else status = 'down';

      } catch (err) {
        status = 'down';
      }

      return { url, status, httpStatus };
    }

    // ===== CHANGE #2: process in chunks =====
    for (let i = 0; i < sites.length; i += CONCURRENCY) {
      const chunk = sites.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(checkSite));
      results.push(...chunkResults);
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      message: err.message,
    });
  }
}
