
// ============================================================================
// NOX TOOL EXTENSION - Background Service Worker
// ============================================================================

console.log("🚀 [Background] Service Worker Initialized");

const WAIT_TIME_FOR_REQUESTS = 30000; // 30 seconds
const NOX_PORTAL_URL = "https://noxtools.com/secure/page/semrush";
const API_SERVER_URL = "http://localhost:3000/api/rpc";

const DOMAINS_TO_SEARCH = [

   'omnicalculator.com'
   
]

// STATE
let currentDomainIndex = 0;
let processingPhase = 'OVERVIEW'; // 'OVERVIEW' or 'BACKLINKS'
let mainTabId = null;
let waitTimer = null;
let hasReceivedRpcData = false;
let currentServerNode = 3; // Start at server 3
let isSessionActive = false; // False = need to go to portal; True = on semrush.pw

// ============================================================================
// HELPERS
// ============================================================================

function getCleanDomain(fullUrl) {
    return fullUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function getServerBaseUrl() {
    return `https://semrush${currentServerNode}.semrush.pw`;
}

// ============================================================================
// NAVIGATION & LOGIC
// ============================================================================

function processNextStep() {
    console.log(`🤔 [Logic] processNextStep called. SessionActive: ${isSessionActive}, Phase: ${processingPhase}, ServerNode: ${currentServerNode}`);

    if (!isSessionActive) {
        console.log(`🔑 [Auth] Session is NOT active. Navigating to Portal to select Server ${currentServerNode}...`);
        chrome.tabs.update(mainTabId, { url: NOX_PORTAL_URL }, () => {
            console.log("🚚 [Nav] Update request sent for Portal URL.");
        });
        return;
    }

    const domain = DOMAINS_TO_SEARCH[currentDomainIndex];
    if (!domain) {
        console.log('🎉 [Complete] All domains processed. Stopping.');
        return;
    }

    const cleanD = getCleanDomain(domain);
    const baseUrl = getServerBaseUrl();

    console.log(`🎯 [Target] Processing domain [${currentDomainIndex + 1}/${DOMAINS_TO_SEARCH.length}]: ${cleanD} on Server ${currentServerNode}`);

    if (processingPhase === 'OVERVIEW') {
        const url = `${baseUrl}/analytics/overview/?searchType=domain&q=${cleanD}`;
        console.log(`🔍 [Analyze] Navigating to OVERVIEW: ${url}`);
        chrome.tabs.update(mainTabId, { url: url });
    } else {
        const url = `${baseUrl}/analytics/backlinks/refdomains/?q=${cleanD}&searchType=domain&ba_as=%5B10%2C100%5D`;
        console.log(`🔗 [Analyze] Navigating to BACKLINKS: ${url}`);
        chrome.tabs.update(mainTabId, { url: url });
    }
}

// ============================================================================
// RECOVERY & SERVER ROTATION
// ============================================================================

function rotateServer() {
    const oldNode = currentServerNode;
    currentServerNode = (currentServerNode % 5) + 1;
    console.log(`🔄 [Server] Rotating Server Node from ${oldNode} to ${currentServerNode}`);

    isSessionActive = false;
    console.log("🔄 [Server] Session flag reset to false. Re-authentication required.");
}

function initiateRecovery() {
    console.log('🚨 [Recovery] Timeout or Error detected triggering recovery sequence.');
    rotateServer();
    processNextStep();
}

// ============================================================================
// TIMEOUTS
// ============================================================================

function startWaitTimer() {
    if (waitTimer) {
        console.log("⏳ [Timer] Clearing existing timer.");
        clearTimeout(waitTimer);
    }
    hasReceivedRpcData = false;

    console.log(`⏳ [Timer] Starting ${WAIT_TIME_FOR_REQUESTS / 1000}s timer for RPC data arrival...`);
    waitTimer = setTimeout(() => {
        console.log("⏳ [Timer] Timer expired!");
        if (!hasReceivedRpcData) {
            console.log("❌ [Timer] No RPC data received. Initiating Recovery.");
            initiateRecovery();
        } else {
            console.log("✅ [Timer] Data was received during wait. Moving to next job.");
            advanceJob();
        }
    }, WAIT_TIME_FOR_REQUESTS);
}

function advanceJob() {
    console.log("➡️ [Job] Advancing job state...");
    if (processingPhase === 'OVERVIEW') {
        processingPhase = 'BACKLINKS';
        console.log("➡️ [Job] Switching phase to BACKLINKS.");
        processNextStep();
    } else {
        currentDomainIndex++;
        processingPhase = 'OVERVIEW';
        console.log(`➡️ [Job] Domain finished. Moving to next domain index: ${currentDomainIndex}. Phase reset to OVERVIEW.`);
        processNextStep();
    }
}

// ============================================================================
// LISTENERS
// ============================================================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId !== mainTabId || changeInfo.status !== 'complete') return;

    const url = tab.url;
    console.log(`🌐 [Tab Update] Page Loaded: ${url}`);

    if (url.includes("/secure/page/semrush")) {
        console.log('🏢 [Portal] NoxTools Portal detected.');
        if (isSessionActive) {
            console.log('⚠️ [Portal] landed on portal but isSessionActive was true. Resetting.');
            isSessionActive = false;
        }

        console.log(`🏢 [Portal] Waiting 2 seconds then requesting click for Server ${currentServerNode}...`);
        setTimeout(() => {
            console.log(`📣 [Message] Sending ACTIVATE_SERVER (Node: ${currentServerNode}) to content script.`);
            chrome.tabs.sendMessage(tabId, {
                type: 'ACTIVATE_SERVER',
                serverNode: currentServerNode
            }).catch(err => console.log("⚠️ [Message] Could not send message (tab might be reloading): ", err));
        }, 2000);
        return;
    }

    if (url.includes("/secure/login")) {
        console.log('🔒 [Auth] Login Page detected. Waiting for content script to auto-fill...');
        return;
    }

    if (url.includes("semrush.pw") || url.includes("semrush.com")) {
        console.log('🌐 [Semrush] Detected Semrush domain.');

        const expectedBase = getServerBaseUrl();
        const expectedHost = expectedBase.replace('https://', '');

        if (!url.includes(expectedHost)) {
            console.log(`⚠️ [Monitor] We are on ${url} but expected ${expectedHost}.`);
        }

        if (!isSessionActive) {
            console.log('✅ [Auth] First time arriving at Semrush after Portal. Session is now ACTIVE.');
            isSessionActive = true;
            setTimeout(() => { processNextStep(); }, 1000);
            return;
        }

        if (url.includes("/analytics/overview/") && processingPhase === 'OVERVIEW') {
            console.log('👀 [Monitor] On Overview Page. Starting Data Timer.');
            startWaitTimer();
        } else if (url.includes("/analytics/backlinks/") && processingPhase === 'BACKLINKS') {
            console.log('👀 [Monitor] On Backlinks Page. Starting Data Timer.');
            startWaitTimer();
        } else {
            console.log('❓ [Monitor] On Semrush but URL does not match current phase target. Waiting for navigation...');
        }
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'LOGIN_CONFIRMED') {
        console.log('✅ [Auth] Content script reported successful login. Redirecting to Portal.');
        chrome.tabs.update(mainTabId, { url: NOX_PORTAL_URL });
    }

    if (message.type === 'LOG_RPC_RESPONSE') {

        const isImportantUrl = message.data && message.data.url && (
            message.data.url.includes('webapi2') ||
            message.data.url.includes('backlinks') ||
            message.data.url.includes('api/rpc')
        );

        // Filter out unknown domains ONLY if the URL is not important
        if (message.domain === 'unknown' && !isImportantUrl) {
            return;
        }

        // If we got here, it's either a known domain OR an important URL
        hasReceivedRpcData = true;
        const payloadSize = JSON.stringify(message.data.responseBody).length;
        console.log(`📦 [Data] RPC Data Captured. Domain: ${message.domain}. URL: ${message.data.url.substring(0, 30)}... Payload: ${payloadSize} bytes.`);

        fetch(API_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domain: message.domain,
                url: message.data.url,
                requestBody: message.data.requestBody,
                responseBody: message.data.responseBody,
                timestamp: new Date().toISOString()
            })
        })
            .then(response => {
                if (response.ok) {
                    console.log(`✅ [API] Sent to server.`);
                } else {
                    console.error(`❌ [API] Error: ${response.status}`);
                }
            })
            .catch(error => {
                console.error(`❌ [API] Network error: ${error.message}`);
            });
    }
});

async function startProcessing() {
    console.log("🚀 [Start] Extension installed/reloaded. Starting sequence...");
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
        mainTabId = tabs[0].id;
        console.log(`🚀 [Start] Using existing tab ID: ${mainTabId}`);
    } else {
        const t = await chrome.tabs.create({});
        mainTabId = t.id;
        console.log(`🚀 [Start] Created new tab ID: ${mainTabId}`);
    }
    isSessionActive = false;
    console.log("🚀 [Start] Resetting session state. calling processNextStep()...");
    processNextStep();
}

chrome.runtime.onInstalled.addListener(() => setTimeout(startProcessing, 3000));
