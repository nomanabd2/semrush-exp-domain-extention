
// ============================================================================
// NOX TOOL - MAIN WORLD INTERCEPTOR
// This runs inside the page context (not isolated)
// ============================================================================

(function () {
    console.log('🔌 [Interceptor] Injecting into MAIN world...');

    function shouldIntercept(url) {
        // CAPTURE ALL REQUESTS - Filtering will be done on the server side
        return true;
    }

    // ---------------------------------------------------------
    // 1. Intercept XHR (XMLHttpRequest)
    // ---------------------------------------------------------
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;

    XHR.open = function (method, url) {
        this._url = url; // Save URL for later
        return open.apply(this, arguments);
    };

    XHR.send = function (postData) {
        if (shouldIntercept(this._url)) {
            this.addEventListener('load', function () {
                let responseData = null;
                try {
                    // CRITICAL FIX: Check responseType. 
                    // If responseType is 'json', accessing responseText throws InvalidStateError.
                    if (this.responseType === 'json' && this.response) {
                        responseData = this.response;
                    } else if (this.responseText) {
                        try {
                            responseData = JSON.parse(this.responseText);
                        } catch (e) {
                            responseData = this.responseText;
                        }
                    } else {
                        // Fallback for blobs/buffers if needed
                        responseData = this.response;
                    }
                } catch (err) {
                    console.error("❌ [Interceptor] Error parsing XHR response:", err);
                    responseData = "Error-Parsing-Response";
                }

                // Send whatever we got
                window.postMessage({
                    source: 'NOX_INTERCEPTOR',
                    type: 'RPC_CAPTURED',
                    payload: {
                        url: this._url,
                        requestBody: postData,
                        responseBody: responseData
                    }
                }, '*');
            });
        }
        return send.apply(this, arguments);
    };

    // ---------------------------------------------------------
    // 2. Intercept Fetch (Modern API)
    // ---------------------------------------------------------
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
        const [resource, config] = args;
        const url = (typeof resource === 'string') ? resource : resource.url;

        // Perform the actual fetch
        const response = await originalFetch(resource, config);

        if (shouldIntercept(url)) {
            try {
                const clone = response.clone();
                let responseData;

                // Try getting JSON, if fails, get Text
                try {
                    responseData = await clone.json();
                } catch (jsonErr) {
                    try {
                        responseData = await clone.text();
                    } catch (textErr) {
                        responseData = "Error reading body";
                    }
                }

                window.postMessage({
                    source: 'NOX_INTERCEPTOR',
                    type: 'RPC_CAPTURED',
                    payload: {
                        url: url,
                        requestBody: config ? config.body : null,
                        responseBody: responseData
                    }
                }, '*');

            } catch (e) {
                console.error("Interceptor Fetch Error", e);
            }
        }

        return response;
    };

    console.log('🔌 [Interceptor] Network hooks active for ALL requests (Robust Mode).');
})();
