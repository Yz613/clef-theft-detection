import { ClefClient } from '../clef/client.js';
import { ProbabilisticClassifier } from '../pipeline/probabilistic_classifier.js';
import { ReviewStore } from './review_store.js';
import { DEMO_SCENARIOS } from './scenarios.js';
export class ShrinkDetectionService {
    clefClient;
    classifier;
    reviewStore;
    constructor(config) {
        this.clefClient = new ClefClient(config);
        this.classifier = new ProbabilisticClassifier(this.clefClient);
        this.reviewStore = new ReviewStore();
    }
    getClefClient() {
        return this.clefClient;
    }
    getReviewStore() {
        return this.reviewStore;
    }
    /**
     * Evaluates checkout video/visual evidence & transaction data
     * and computes Clef shrink decision probabilities.
     */
    async analyzeEvent(input) {
        const result = await this.classifier.classify(input);
        this.reviewStore.enqueue(result, input);
        return result;
    }
    /**
     * Runs a pre-configured benchmark scenario
     */
    async runScenario(scenarioId) {
        const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
        if (!scenario) {
            throw new Error(`Scenario not found: ${scenarioId}`);
        }
        return this.analyzeEvent(scenario.input);
    }
    /**
     * Gets list of available scenarios
     */
    getScenarios() {
        return DEMO_SCENARIOS;
    }
    /**
     * Submits a human review decision and specific label
     */
    submitReview(eventId, decision, label, reviewerId = 'reviewer_analyst_1', notes) {
        return this.reviewStore.submitReview(eventId, {
            reviewer_id: reviewerId,
            decision,
            label,
            notes,
        });
    }
    /**
     * Retrieves pending or reviewed items
     */
    getReviewQueue(filter) {
        return this.reviewStore.list(filter);
    }
    /**
     * Seed demo data with all scenarios analyzed
     */
    async seedDemoData() {
        for (const scenario of DEMO_SCENARIOS) {
            await this.analyzeEvent(scenario.input);
        }
    }
}
//# sourceMappingURL=shrink_detection_service.js.map