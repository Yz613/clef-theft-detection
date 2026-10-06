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
 * dynamic OAuth token refresh, and multimodal keyframe image evaluation.
 */
export declare class ClefClient {
    private accountId;
    private apiToken;
    private model;
    private forceSimulator;
    constructor(config?: ClefClientConfig);
    getModelName(): string;
    getAccountId(): string;
    isUsingSimulator(): boolean;
    setCredentials(accountId: string, apiToken: string, model?: string): void;
    /**
     * Run decision inference against Cloudflare Clef multimodal decision model
     */
    run(request: ClefRequest): Promise<ClefResponse>;
}
