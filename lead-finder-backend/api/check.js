// api/check.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'LeadFinderProxy/1.0[](https://github.com)' }
        });

        clearTimeout(timeoutId);

        res.json({
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

        res.json({
            status: 'down',
            details
        });
    }
};