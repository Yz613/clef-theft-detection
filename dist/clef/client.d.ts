import { ClefRequest, ClefResponse } from '../types/index.js';
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
export declare class ClefClient {
    private accountId?;
    private apiToken?;
    private model;
    private forceSimulator;
    constructor(config?: ClefClientConfig);
    getModelName(): string;
    isUsingSimulator(): boolean;
    setCredentials(accountId: string, apiToken: string, model?: string): void;
    /**
     * Run decision inference against Clef model
     */
    run(request: ClefRequest): Promise<ClefResponse>;
}
