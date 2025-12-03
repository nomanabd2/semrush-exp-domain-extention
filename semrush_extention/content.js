// ============================================================================
// NOX TOOL EXTENSION - Content Script
// ============================================================================

console.log(`📜 [Content] Script Loaded on: ${window.location.href} (Frame: ${window.self === window.top ? 'TOP' : 'IFRAME'})`);

const NOX_EMAIL = "nig.trib.news@gmail.com";
const NOX_PASSWORD = "https://pinecalculator.com/";

// ============================================================================
// HELPERS
// ============================================================================
function getCurrentDomainFromUrl() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('q') || 'unknown';
    } catch (e) { return 'unknown'; }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// COMMUNICATION (Must run immediately at document_start)
// ============================================================================

// 1. Listen for Background messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only process UI actions in top frame
    if (window.self === window.top) {
        if (message.type === 'ACTIVATE_SERVER') {
            console.log(`📨 [Content] Received ACTIVATE_SERVER: ${message.serverNode}`);
            // Use a slight delay to ensure DOM is ready if message comes super fast
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => handleServerActivation(message.serverNode));
            } else {
                handleServerActivation(message.serverNode);
            }
        }
    }
});

// 2. Listen for Interceptor messages (Data Capture)
window.addEventListener('message', (event) => {
    // Accept from any frame, source must be window
    if (event.source !== window || !event.data || event.data.source !== 'NOX_INTERCEPTOR') return;

    if (event.data.type === 'RPC_CAPTURED') {
        // Log sparingly to avoid console spam, but useful for debugging specific missing packets
        if (event.data.payload.url.includes('webapi2')) {
            console.log("📦 [Content] 🚨 WEBAPI2 CAPTURED! Forwarding...");
        }

        chrome.runtime.sendMessage({
            type: 'LOG_RPC_RESPONSE',
            domain: getCurrentDomainFromUrl(),
            data: event.data.payload
        });
    }
});

// ============================================================================
// SERVER SELECTION LOGIC (PORTAL)
// ============================================================================
async function handleServerActivation(serverNode) {
    console.log(`🖱️ [Content] handleServerActivation: Looking for button for Server ${serverNode}...`);

    const buttons = Array.from(document.querySelectorAll('.button'));
    const targetButton = buttons.find(el => el.textContent.includes(`Server ${serverNode}`));

    if (targetButton) {
        console.log(`✅ [Content] Found button for Server ${serverNode}.`);

        const onClickText = targetButton.getAttribute('onclick');
        const urlMatch = onClickText.match(/openURL\(['"]([^'"]+)['"]\)/);

        if (urlMatch && urlMatch[1]) {
            const targetUrl = urlMatch[1];
            console.log(`➡️ [Content] Navigating to: ${targetUrl}`);
            window.location.href = targetUrl;
        } else {
            console.error('❌ [Content] Could not parse URL from button.');
        }
    } else {
        console.error(`❌ [Content] Button 'Server ${serverNode}' not found.`);
        if (serverNode !== 1) {
            console.log("⚠️ [Content] Fallback: Attempting Server 1.");
            handleServerActivation(1);
        }
    }
}

// ============================================================================
// MAIN UI AUTOMATION LOOP (Only Top Frame)
// ============================================================================
function initMain() {
    // If we are in an iframe, we typically don't want to run the login logic
    if (window.self !== window.top) return;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runUiLogic);
    } else {
        runUiLogic();
    }
}

async function runUiLogic() {
    console.log("🚀 [Content] UI Logic starting...");
    await sleep(1000); // Small stability wait
    const currentUrl = window.location.href;

    // CASE 1: LOGIN PAGE
    if (currentUrl.includes("/secure/login") || currentUrl.includes("login.php")) {
        console.log('🔒 [Content] Login Page Detected.');

        const emailInput = document.querySelector('#amember-login') || document.querySelector('input[name="amember_login"]');
        const passInput = document.querySelector('#amember-pass') || document.querySelector('input[name="amember_pass"]');

        if (emailInput && passInput) {
            emailInput.value = NOX_EMAIL;
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(500);
            passInput.value = NOX_PASSWORD;
            passInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(500);

            const submitBtn = document.querySelector('input[type="submit"]') || document.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.click();
            else document.querySelector('form')?.submit();
        }
        return;
    }

    // CASE 2: LOGGED IN
    if (currentUrl.includes("/secure/member") || currentUrl.includes("/dashboard")) {
        const semrushLink = Array.from(document.querySelectorAll('a')).find(el => el.textContent.toLowerCase().includes('semrush'));
        if (semrushLink) {
            semrushLink.click();
        } else {
            chrome.runtime.sendMessage({ type: 'LOGIN_CONFIRMED' });
        }
        return;
    }

    // CASE 3: HOMEPAGE
    if (currentUrl.includes("noxtools.com") && !currentUrl.includes("semrush") && !currentUrl.includes("member") && !currentUrl.includes("login")) {
        const loginLink = document.querySelector('a[href*="/secure/login"]');
        if (loginLink) window.location.href = "https://noxtools.com/secure/login";
    }
}

// Start Main Logic
initMain();