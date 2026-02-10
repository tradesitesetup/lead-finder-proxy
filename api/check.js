/**
 * Bulk URL Status Checker API
 * Vercel Serverless Function
 */

const MAX_URLS = 500;
const TIMEOUT_MS = 8000;
const CONCURRENCY_LIMIT = 10;

// Allow requests from your GitHub Pages site
const ALLOWED_ORIGINS = [
  'https://tradesitesetup.github.io',
  'http://localhost:3000', // for local testing
];

export default async function handler(req, res) {
  console.log('=== REQUEST DEBUG ===');
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  console.log('Headers:', JSON.stringify(req.headers));
  
  const origin = req.headers.origin;
  
  // ALWAYS set CORS headers first
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // For testing, allow any origin (remove this in production)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle OPTIONS preflight - MUST return 200
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight');
    return res.status(200).end();
  }

  // Handle GET for testing
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'API is working! Use POST method to check websites.',
      usage: 'POST { "websites": ["https://example.com"] }',
      allowedOrigins: ALLOWED_ORIGINS
    });
  }

  // Only allow POST for actual checking
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST requests are accepted for website checking'
    });
  }

  // Verify origin (but don't block if missing for now)
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.warn('Warning: Request from non-allowed origin:', origin);
  }

  // Parse and validate request body
  let websites;
  try {
    const body = req.body;
    console.log('Request body:', JSON.stringify(body));
    
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
    console.error('Error parsing request:', error);
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON body'
    });
  }

  // Limit to MAX_URLS
  const urlsToCheck = websites.slice(0, MAX_URLS);
  console.log(`Processing ${urlsToCheck.length} URLs`);

  // Process URLs with concurrency control
  try {
    const results = await checkUrlsWithConcurrency(urlsToCheck);
    console.log(`Successfully checked ${results.length} URLs`);
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
          'User-Agent': 'Mozilla/5.0 (compatible; URLStatusChecker/1.0)'
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
