// =============================================
// EXAMPLE: Your client-side website checking logic
// =============================================

// This is the fallback function that runs in the browser when API fails
async function checkMultipleWebsites(websites) {
  console.log(`Using browser-based checking for ${websites.length} websites`);

  const results = [];
  const CONCURRENCY = 5; // lower than server to avoid browser throttling
  const TIMEOUT_MS = 8000;

  // Process in chunks to avoid overwhelming the browser
  for (let i = 0; i < websites.length; i += CONCURRENCY) {
    const chunk = websites.slice(i, i + CONCURRENCY);
    
    const chunkPromises = chunk.map(async (url) => {
      // === UPGRADE TO HTTPS HERE – this prevents mixed content blocks ===
      let fetchUrl = url.trim();
      
      if (fetchUrl.startsWith('http://')) {
        fetchUrl = fetchUrl.replace(/^http:/, 'https:');
        console.log(`Upgraded to HTTPS: ${fetchUrl}`);
      }

      // Skip obviously invalid URLs
      if (!fetchUrl.startsWith('https://') || fetchUrl.length < 10) {
        return {
          url,
          status: 'invalid',
          httpStatus: null,
          note: 'Non-HTTPS or invalid URL – blocked by browser security'
        };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(fetchUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          mode: 'no-cors',           // Helps in some mixed-content edge cases
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CRM-URL-Checker/1.0)'
          }
        });

        clearTimeout(timeoutId);

        let status = 'down';
        let httpStatus = response.status;

        if (response.ok) {
          status = 'up';
        } else if (response.status >= 300 && response.status < 500) {
          status = 'reachable';
        }

        return {
          url,
          status,
          httpStatus
        };

      } catch (err) {
        clearTimeout(timeoutId); // just in case

        let status = 'down';
        let note = err.name === 'AbortError' ? 'timeout' : err.message;

        // If mixed content still slips through, catch it here
        if (err.message.includes('mixed content') || err.message.includes('insecure')) {
          note = 'Blocked by browser: mixed content (HTTP resource on HTTPS page)';
        }

        return {
          url,
          status,
          httpStatus: null,
          error: note
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    // Small delay to be nice to the browser/network
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return results;
}

// =============================================
// Example: Where you call this fallback
// =============================================
async function processWebsitesFromCSV(websites) {
  try {
    // First try the API
    const apiResponse = await fetch(document.getElementById('apiUrl').value, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websites })
    });

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      console.log('API success:', data);
      return data.results; // or however you handle it
    } else {
      throw new Error('API returned non-200');
    }
  } catch (apiError) {
    console.error('API check failed:', apiError);
    console.warn('Falling back to browser checking');

    // This is where the 244 mixed content errors were coming from
    const browserResults = await checkMultipleWebsites(websites);
    
    // You can display/save/process browserResults here
    console.log('Browser fallback results:', browserResults);
    return browserResults;
  }
}

// Example usage when CSV is processed
// CSVProcessor.processCSV(...) → calls processWebsitesFromCSV( extractedWebsites )
