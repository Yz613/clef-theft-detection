import { ClefSimulator } from './simulator.js';
/**
 * Client for interacting with Cloudflare Clef (@cf/cloudflare/clef)
 * multimodal decision model. Supports live Workers AI REST API,
 * Workers AI env binding, and local deterministic simulation.
 */
export class ClefClient {
    accountId;
    apiToken;
    model;
    forceSimulator;
    constructor(config = {}) {
        this.accountId = config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
        this.apiToken = config.apiToken || process.env.CLOUDFLARE_API_TOKEN;
        this.model = config.model || '@cf/cloudflare/clef';
        this.forceSimulator = config.useSimulator ?? (process.env.USE_CLEF_SIMULATOR === 'true' || (!this.accountId || !this.apiToken));
    }
    getModelName() {
        return this.model;
    }
    isUsingSimulator() {
        return this.forceSimulator || !this.accountId || !this.apiToken;
    }
    setCredentials(accountId, apiToken, model) {
        this.accountId = accountId;
        this.apiToken = apiToken;
        if (model)
            this.model = model;
        this.forceSimulator = !accountId || !apiToken;
    }
    /**
     * Run decision inference against Clef model
     */
    async run(request) {
        const payload = {
            model: request.model || this.model,
            state: request.state,
            questions: request.questions,
        };
        if (this.isUsingSimulator()) {
            return ClefSimulator.evaluate(payload);
        }
        // Call live Cloudflare Workers AI REST API
        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    state: typeof payload.state === 'string' ? payload.state : JSON.stringify(payload.state),
                    questions: payload.questions,
                }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                console.warn(`[ClefClient] Workers AI API returned ${res.status}: ${errorText}. Falling back to simulator.`);
                return ClefSimulator.evaluate(payload);
            }
            const json = (await res.json());
            return json;
        }
        catch (err) {
            console.warn(`[ClefClient] Network error communicating with Workers AI endpoint: ${err}. Falling back to simulator.`);
            return ClefSimulator.evaluate(payload);
        }
    }
}
//# sourceMappingURL=client.js.map