import { CheckoutInferenceInput, CheckoutEventOutput, HumanReviewDecision, HumanReviewLabel, ReviewQueueItem } from '../types/index.js';
import { ClefClient, ClefClientConfig } from '../clef/client.js';
import { ReviewStore } from './review_store.js';
import { ScenarioDefinition } from './scenarios.js';
export declare class ShrinkDetectionService {
    private clefClient;
    private classifier;
    private reviewStore;
    constructor(config?: ClefClientConfig);
    getClefClient(): ClefClient;
    getReviewStore(): ReviewStore;
    /**
     * Evaluates checkout video/visual evidence & transaction data
     * and computes Clef shrink decision probabilities.
     */
    analyzeEvent(input: CheckoutInferenceInput): Promise<CheckoutEventOutput>;
    /**
     * Runs a pre-configured benchmark scenario
     */
    runScenario(scenarioId: string): Promise<CheckoutEventOutput>;
    /**
     * Gets list of available scenarios
     */
    getScenarios(): ScenarioDefinition[];
    /**
     * Submits a human review decision and specific label
     */
    submitReview(eventId: string, decision: HumanReviewDecision, label: HumanReviewLabel, reviewerId?: string, notes?: string): ReviewQueueItem | null;
    /**
     * Retrieves pending or reviewed items
     */
    getReviewQueue(filter?: {
        status?: 'pending' | 'reviewed';
    }): ReviewQueueItem[];
    /**
     * Seed demo data with all scenarios analyzed
     */
    seedDemoData(): Promise<void>;
}
