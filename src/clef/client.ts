import { ClefRequest, ClefResponse } from '../types/index.js';
import { ClefSimulator } from './simulator.js';

export interface ClefClientConfig {
  accountId?: string;
  apiToken?: string;
  model?: '@cf/cloudflare/clef' | '@cf/cloudflare/clef-flash' | string;
  useSimulator?: boolean;
}

/**
 * Client for interacting with Cloudflare Clef (@cf/cloudflare/clef)
 * multimodal decision model. Supports live Workers AI REST API,
 * Workers AI env binding, and local deterministic simulation.
 */
export class ClefClient {
  private accountId?: string;
  private apiToken?: string;
  private model: string;
  private forceSimulator: boolean;

  constructor(config: ClefClientConfig = {}) {
    this.accountId = config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = config.apiToken || process.env.CLOUDFLARE_API_TOKEN;
    this.model = config.model || '@cf/cloudflare/clef';
    this.forceSimulator = config.useSimulator ?? (process.env.USE_CLEF_SIMULATOR === 'true' || (!this.accountId || !this.apiToken));
  }

  public getModelName(): string {
    return this.model;
  }

  public isUsingSimulator(): boolean {
    return this.forceSimulator || !this.accountId || !this.apiToken;
  }

  public setCredentials(accountId: string, apiToken: string, model?: string): void {
    this.accountId = accountId;
    this.apiToken = apiToken;
    if (model) this.model = model;
    this.forceSimulator = !accountId || !apiToken;
  }

  /**
   * Run decision inference against Clef model
   */
  public async run(request: ClefRequest): Promise<ClefResponse> {
    const payload: ClefRequest = {
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

      const json = (await res.json()) as ClefResponse;
      return json;
    } catch (err) {
      console.warn(`[ClefClient] Network error communicating with Workers AI endpoint: ${err}. Falling back to simulator.`);
      return ClefSimulator.evaluate(payload);
    }
  }
}
