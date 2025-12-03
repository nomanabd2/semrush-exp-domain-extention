
// ============================================================================
// SEMRUSH RPC DATA SERVER - STRICT FILTERING EDITION
// ============================================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'rpc_data.json');

// ============================================================================
// 1. STRATEGY & CONFIGURATION
// ============================================================================

// Gate A: URL WHITELIST
// If the URL contains ANY of these strings, we accept the request immediately.
const VALID_URL_MARKERS = [
    '/backlinks/webapi2/overview/init',
    '/backlinks/webapi2/overview/counters',
    'type=backlinks_refdomains', // Captures the report URL you specified
    'action=report'              // strict report action
];

// Gate B: RPC METHOD WHITELIST
// If the URL didn't match, we check the Request Body. 
// We ONLY keep sub-requests that match these method names.
const VALID_RPC_METHODS = [
    'backlinks.Summary',
    'organic.CompetitorsOverview',
    'backlinks.Overview',
    'organic.OverviewTrend'
];

// ============================================================================
// 2. PROCESSING LOGIC (The Brain)
// ============================================================================

/**
 * Helper: Parse JSON safely
 */
function safeParse(data) {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try { return JSON.parse(data); } catch (e) { return null; }
}

/**
 * Helper: Clean Organic Trend Data (Remove 0 traffic months)
 */
function cleanTrendResponse(resBody) {
    if (!resBody || !resBody.result || !Array.isArray(resBody.result)) return resBody;

    // Filter out months where traffic is 0
    const cleanResult = resBody.result.filter(item => {
        const t = Number(item.traffic);
        return !isNaN(t) && t !== 0;
    });

    return { ...resBody, result: cleanResult };
}

/**
 * CORE FILTER FUNCTION
 * Returns { req: Object/Array, res: Object/Array, match: String } OR null if invalid
 */
function filterAndCleanEntry(url, reqBody, resBody) {
    const parsedReq = safeParse(reqBody);
    const parsedRes = safeParse(resBody);

    // --- GATE A: CHECK URL ---
    // Useful for WebAPI calls that don't have standard RPC bodies
    if (url) {
        for (const marker of VALID_URL_MARKERS) {
            if (url.includes(marker)) {
                return {
                    req: parsedReq,
                    res: parsedRes,
                    match: `URL: ${marker}`
                };
            }
        }
    }

    // If no body, and didn't pass URL gate -> REJECT (Handles generic GETs like invite-button)
    if (!parsedReq) return null;

    // --- GATE B: CHECK RPC BODY ---

    // Scenario 1: Batch Request (Array)
    if (Array.isArray(parsedReq)) {
        const validReqs = [];
        const validRess = [];
        const validIds = new Set();

        // 1. Filter Requests
        parsedReq.forEach(reqItem => {
            if (reqItem.method && VALID_RPC_METHODS.includes(reqItem.method)) {
                validReqs.push(reqItem);
                if (reqItem.id) validIds.add(reqItem.id);
            }
        });

        // If batch contains NO valid methods -> REJECT
        if (validReqs.length === 0) return null;

        // 2. Filter Responses (Sync with valid requests)
        if (Array.isArray(parsedRes)) {
            parsedRes.forEach(resItem => {
                if (resItem.id && validIds.has(resItem.id)) {
                    // Apply Trend Cleaning
                    const originalReq = validReqs.find(r => r.id === resItem.id);
                    if (originalReq && originalReq.method === 'organic.OverviewTrend') {
                        resItem = cleanTrendResponse(resItem);
                    }
                    validRess.push(resItem);
                }
            });
        }

        return {
            req: validReqs,
            res: validRess,
            match: 'RPC_BATCH'
        };
    }

    // Scenario 2: Single Request (Object)
    else if (typeof parsedReq === 'object') {
        if (parsedReq.method && VALID_RPC_METHODS.includes(parsedReq.method)) {
            let cleanRes = parsedRes;
            if (parsedReq.method === 'organic.OverviewTrend') {
                cleanRes = cleanTrendResponse(parsedRes);
            }
            return {
                req: parsedReq,
                res: cleanRes,
                match: `RPC: ${parsedReq.method}`
            };
        }
    }

    // Fallthrough -> REJECT (e.g. currency.Rates single request)
    return null;
}

/**
 * Domain Extraction Helper
 */
function extractDomain(reqObj, url) {
    // 1. Try URL parameters
    if (url) {
        try {
            const matchTarget = url.match(/[?&]target=([^&]+)/);
            if (matchTarget && matchTarget[1]) return decodeURIComponent(matchTarget[1]);

            const urlObj = new URL(url.startsWith('http') ? url : `http://dummy.com${url}`);
            const q = urlObj.searchParams.get('q');
            if (q && q.includes('.')) return q;
        } catch (e) { }
    }

    // 2. Try RPC Body parameters
    // Handle Batch (try first item)
    if (Array.isArray(reqObj)) {
        for (const item of reqObj) {
            const d = extractDomain(item, null);
            if (d) return d;
        }
    }
    // Handle Single
    else if (reqObj && typeof reqObj === 'object') {
        if (reqObj.params?.args?.searchItem) return reqObj.params.args.searchItem;
        if (reqObj.params?.searchItem) return reqObj.params.searchItem;
    }
    return null;
}

// ============================================================================
// 3. SERVER SETUP & CLEANUP
// ============================================================================

app.use(cors());
app.use(express.json({ limit: '200mb' }));

let rpcData = {};

function loadAndCleanData() {
    console.log('🧹 [Startup] Loading and cleaning data file...');
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            let keptCount = 0;
            let removedCount = 0;

            Object.keys(raw).forEach(domain => {
                const entries = raw[domain];
                const cleanEntries = [];

                entries.forEach(entry => {
                    // RUN THE FILTER ON EXISTING DATA
                    const result = filterAndCleanEntry(entry.url, entry.requestBody, entry.responseBody);
                    if (result) {
                        cleanEntries.push({
                            ...entry,
                            requestBody: result.req,
                            responseBody: result.res,
                            match: result.match // update match info
                        });
                    } else {
                        removedCount++;
                    }
                });

                if (cleanEntries.length > 0) {
                    rpcData[domain] = cleanEntries;
                    keptCount += cleanEntries.length;
                }
            });

            console.log(`✨ [Startup] Clean complete.`);
            console.log(`   - Kept Entries: ${keptCount}`);
            console.log(`   - Removed Garbage: ${removedCount}`);

            // Save immediately if we cleaned anything
            if (removedCount > 0) saveData();
        }
    } catch (err) {
        console.error('❌ Error loading data:', err.message);
        rpcData = {};
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(rpcData, null, 2), 'utf8');
}

// ============================================================================
// 4. API ROUTES
// ============================================================================

app.post('/api/rpc', (req, res) => {
    try {
        const { domain, url, requestBody, responseBody, timestamp } = req.body;

        // 1. RUN STRICT FILTER
        const result = filterAndCleanEntry(url, requestBody, responseBody);

        if (!result) {
            // console.log(`🛑 [REJECTED] ${url.substring(0, 50)}...`);
            return res.json({ success: false, skipped: true, reason: 'Did not match whitelist' });
        }

        // 2. DETERMINE DOMAIN
        let finalDomain = domain;
        if (!finalDomain || finalDomain === 'unknown') {
            finalDomain = extractDomain(result.req, url) || 'unknown_filtered';
        }

        // 3. SAVE
        if (!rpcData[finalDomain]) rpcData[finalDomain] = [];

        rpcData[finalDomain].push({
            id: Date.now() + Math.random().toString(36).substr(2),
            match: result.match,
            url: url,
            requestBody: result.req,
            responseBody: result.res,
            timestamp: timestamp || new Date().toISOString()
        });

        saveData();

        console.log(`✅ [ACCEPTED] ${finalDomain} | ${result.match}`);
        res.json({ success: true, domain: finalDomain });

    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/rpc', (req, res) => res.json(rpcData));

app.get('/api/clear', (req, res) => {
    rpcData = {};
    saveData();
    console.log('🗑️ DATA CLEARED');
    res.send('Data Cleared');
});

// START
loadAndCleanData();
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🛡️  Strict Filtering Active.`);
});
