/**
 * Bulk URL Status Checker API
 * Vercel Serverless Function
 */

const MAX_URLS = 500;
const TIMEOUT_MS = 8000;
const CONCURRENCY_LIMIT = 10;

// UPDATED: Added your GitHub Pages domain
const ALLOWED_ORIGINS = [
  'https://tradesitesetup.github.io',
  'https://crm-app-git-main-tradesitesetups-projects.vercel.app'
];

export default async function handler(req, res) {
  // CORS headers - restricted to your sites
  const origin = req.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify origin for actual requests
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CORS policy: Origin not allowed'
    });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST requests are accepted'
    });
  }

  // Parse and validate request body
  let websites;
  try {
    const body = req.body;
    websites = body?.websites;

    if (!websites) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing "websites" field in request body'
      });
    }

    if (!Array.isArray(websites)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"websites" must be an array of URLs'
      });
    }

    if (websites.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"websites" array cannot be empty'
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON body'
    });
  }

  // Limit to MAX_URLS
  const urlsToCheck = websites.slice(0, MAX_URLS);

  // Process URLs with concurrency control
  try {
    const results = await checkUrlsWithConcurrency(urlsToCheck);
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Error processing URLs:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while checking URLs'
    });
  }
}

/**
 * Check URLs with controlled concurrency
 */
async function checkUrlsWithConcurrency(urls) {
  const results = [];
  
  for (let i = 0; i < urls.length; i += CONCURRENCY_LIMIT) {
    const chunk = urls.slice(i, i + CONCURRENCY_LIMIT);
    const chunkResults = await Promise.all(
      chunk.map(url => checkUrl(url))
    );
    results.push(...chunkResults);
  }
  
  return results;
}

/**
 * Check a single URL
 */
async function checkUrl(url) {
  const result = {
    url: url,
    status: 'down',
    httpStatus: null
  };

  try {
    // Validate URL format
    new URL(url);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Vercel-URL-Status-Checker/1.0'
        }
      });

      clearTimeout(timeoutId);
      result.httpStatus = response.status;

      // Classify status
      if (response.status >= 200 && response.status <= 299) {
        result.status = 'up';
      } else if (response.status >= 300 && response.status <= 499) {
        result.status = 'reachable';
      } else {
        // 500+ or other
        result.status = 'down';
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // Check if it's a timeout/abort error
      if (fetchError.name === 'AbortError') {
        result.status = 'down';
      } else if (
        fetchError.message.includes('ECONNREFUSED') ||
        fetchError.message.includes('ENOTFOUND') ||
        fetchError.message.includes('ETIMEDOUT') ||
        fetchError.message.includes('EAI_AGAIN')
      ) {
        result.status = 'down';
      } else {
        // Other fetch errors
        result.status = 'down';
      }
    }
  } catch (error) {
    // Invalid URL or other errors
    result.status = 'down';
  }

  return result;
}
