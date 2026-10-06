import { ReviewQueueItem, CheckoutEventOutput, CheckoutInferenceInput, HumanReviewLabel, HumanReviewDecision } from '../types/index.js';
export declare class ReviewStore {
    private queue;
    /**
     * Enqueues an analyzed checkout event for review
     */
    enqueue(event: CheckoutEventOutput, input: CheckoutInferenceInput): ReviewQueueItem;
    /**
     * Retrieves an item by event ID
     */
    get(eventId: string): ReviewQueueItem | undefined;
    /**
     * Lists items with optional filtering by status or priority
     */
    list(filter?: {
        status?: 'pending' | 'reviewed';
        minPriority?: string;
    }): ReviewQueueItem[];
    /**
     * Records human reviewer outcome
     */
    submitReview(eventId: string, submission: {
        reviewer_id: string;
        decision: HumanReviewDecision;
        label: HumanReviewLabel;
        notes?: string;
    }): ReviewQueueItem | null;
    clear(): void;
}
