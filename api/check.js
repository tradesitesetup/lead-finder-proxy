export default async function handler(req, res) {
  // ===== CORS HEADERS (CRITICAL) =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
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

    // Limit batch size (protect serverless)
    const MAX_SITES = 50;
    const batch = websites.slice(0, MAX_SITES);

    const results = [];
    const controllerTimeout = 8000;

    for (const url of batch) {
      let status = 'error';
      let httpStatus = null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), controllerTimeout);

        const response = await fetch(url, {
          method: 'GET', // HEAD breaks many sites
          redirect: 'manual',
          signal: controller.signal,
        });

        clearTimeout(timeout);

        httpStatus = response.status;

        if (response.ok) {
          status = 'up';
        } else if (response.status >= 300 && response.status < 500) {
          status = 'reachable';
        } else {
          status = 'down';
        }

      } catch (err) {
        status = 'down';
      }

      results.push({
        url,
        status,
        httpStatus,
      });
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      message: err.message,
    });
  }
}
