import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { ClefSimulator } from './simulator.js';
/**
 * Reads Cloudflare OAuth credentials dynamically from ~/.wrangler/config/default.toml
 */
function readWranglerToken() {
    try {
        const wranglerConfigPath = path.join(os.homedir(), '.wrangler/config/default.toml');
        if (fs.existsSync(wranglerConfigPath)) {
            const content = fs.readFileSync(wranglerConfigPath, 'utf8');
            const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
            if (match && match[1]) {
                return match[1];
            }
        }
    }
    catch (e) {
        // ignore
    }
    return null;
}
/**
 * Refreshes wrangler OAuth token automatically via wrangler CLI
 */
function refreshWranglerToken() {
    try {
        console.log('[ClefClient] Refreshing Cloudflare OAuth token via wrangler CLI...');
        execSync('npx --yes wrangler whoami', { stdio: 'ignore', timeout: 15000 });
        return readWranglerToken();
    }
    catch (err) {
        console.warn('[ClefClient] Auto-refresh of wrangler token failed:', err);
        return null;
    }
}
/**
 * Client for interacting with Cloudflare Clef (@cf/cloudflare/clef)
 * multimodal decision model. Supports live Workers AI REST API,
 * dynamic OAuth token refresh, and multimodal keyframe image evaluation.
 */
export class ClefClient {
    accountId;
    apiToken;
    model;
    forceSimulator;
    constructor(config = {}) {
        this.accountId = config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '8ca47af58f9e7de88c884c2903fc9f26';
        this.apiToken = config.apiToken || process.env.CLOUDFLARE_API_TOKEN || readWranglerToken() || '';
        this.model = config.model || process.env.CLEF_MODEL || '@cf/cloudflare/clef';
        this.forceSimulator = config.useSimulator ?? (process.env.USE_CLEF_SIMULATOR === 'true');
    }
    getModelName() {
        return this.model;
    }
    getAccountId() {
        return this.accountId;
    }
    isUsingSimulator() {
        return this.forceSimulator || !this.accountId || (!this.apiToken && !readWranglerToken());
    }
    setCredentials(accountId, apiToken, model) {
        this.accountId = accountId;
        this.apiToken = apiToken;
        if (model)
            this.model = model;
        this.forceSimulator = !accountId || !apiToken;
    }
    /**
     * Run decision inference against Cloudflare Clef multimodal decision model
     */
    async run(request) {
        const payload = {
            model: request.model || this.model,
            state: request.state,
            images: request.images,
            questions: request.questions,
        };
        if (this.forceSimulator) {
            return ClefSimulator.evaluate(payload);
        }
        // Ensure we have the freshest token
        if (!this.apiToken) {
            this.apiToken = readWranglerToken() || '';
        }
        if (!this.apiToken || !this.accountId) {
            console.warn('[ClefClient] No Cloudflare credentials found. Using fallback simulator.');
            return ClefSimulator.evaluate(payload);
        }
        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
        const makeBody = () => {
            const body = {
                state: typeof payload.state === 'string' ? payload.state : JSON.stringify(payload.state),
                questions: payload.questions,
            };
            if (payload.images && payload.images.length > 0) {
                // Cloudflare Workers AI supports up to 4 images per decision inference call
                body.images = payload.images.slice(0, 4);
            }
            return body;
        };
        const callApi = async (token) => {
            return fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(makeBody()),
            });
        };
        try {
            let res = await callApi(this.apiToken);
            // Handle token expiration: auto-refresh and retry
            if (res.status === 401 || res.status === 403) {
                console.warn(`[ClefClient] Cloudflare returned ${res.status}. Refreshing OAuth token...`);
                const newToken = refreshWranglerToken();
                if (newToken) {
                    this.apiToken = newToken;
                    res = await callApi(this.apiToken);
                }
            }
            if (!res.ok) {
                const errorText = await res.text();
                console.warn(`[ClefClient] Workers AI API error ${res.status}: ${errorText}. Falling back to simulator.`);
                return ClefSimulator.evaluate(payload);
            }
            const json = (await res.json());
            if (json.success && json.result) {
                return json;
            }
            console.warn('[ClefClient] Response did not indicate success:', json);
            return ClefSimulator.evaluate(payload);
        }
        catch (err) {
            console.warn(`[ClefClient] Network error querying Workers AI (@cf/cloudflare/clef): ${err}. Falling back to simulator.`);
            return ClefSimulator.evaluate(payload);
        }
    }
}
//# sourceMappingURL=client.js.map