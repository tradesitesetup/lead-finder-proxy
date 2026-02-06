const fetch = require('node-fetch');

module.exports = async (req, res) => {

    // ----- ALWAYS SET HEADERS FIRST -----
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'LeadFinderProxy/1.0' }
        });

        clearTimeout(timeoutId);

        return res.status(200).json({
            status: response.ok ? 'working' : 'down',
            details: response.ok
                ? 'Website responded successfully'
                : `HTTP error: ${response.status} ${response.statusText}`,
            code: response.status
        });

    } catch (error) {

        let details = error.message || 'Connection failed';

        if (error.name === 'AbortError') {
            details = 'Timeout after 10 seconds';
        }

        return res.status(200).json({
            status: 'down',
            details
        });
    }
};
