import {
  CheckoutInferenceInput,
  CheckoutEventOutput,
  HumanReviewDecision,
  HumanReviewLabel,
  ReviewQueueItem,
} from '../types/index.js';
import { ClefClient, ClefClientConfig } from '../clef/client.js';
import { ProbabilisticClassifier } from '../pipeline/probabilistic_classifier.js';
import { ReviewStore } from './review_store.js';
import { DEMO_SCENARIOS, ScenarioDefinition } from './scenarios.js';

export class ShrinkDetectionService {
  private clefClient: ClefClient;
  private classifier: ProbabilisticClassifier;
  private reviewStore: ReviewStore;

  constructor(config?: ClefClientConfig) {
    this.clefClient = new ClefClient(config);
    this.classifier = new ProbabilisticClassifier(this.clefClient);
    this.reviewStore = new ReviewStore();
  }

  public getClefClient(): ClefClient {
    return this.clefClient;
  }

  public getReviewStore(): ReviewStore {
    return this.reviewStore;
  }

  /**
   * Evaluates checkout video/visual evidence & transaction data
   * and computes Clef shrink decision probabilities.
   */
  public async analyzeEvent(input: CheckoutInferenceInput): Promise<CheckoutEventOutput> {
    const result = await this.classifier.classify(input);
    this.reviewStore.enqueue(result, input);
    return result;
  }

  /**
   * Runs a pre-configured benchmark scenario
   */
  public async runScenario(scenarioId: string): Promise<CheckoutEventOutput> {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }
    return this.analyzeEvent(scenario.input);
  }

  /**
   * Gets list of available scenarios
   */
  public getScenarios(): ScenarioDefinition[] {
    return DEMO_SCENARIOS;
  }

  /**
   * Submits a human review decision and specific label
   */
  public submitReview(
    eventId: string,
    decision: HumanReviewDecision,
    label: HumanReviewLabel,
    reviewerId: string = 'reviewer_analyst_1',
    notes?: string
  ): ReviewQueueItem | null {
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
  public getReviewQueue(filter?: { status?: 'pending' | 'reviewed' }): ReviewQueueItem[] {
    return this.reviewStore.list(filter);
  }

  /**
   * Seed demo data with all scenarios analyzed
   */
  public async seedDemoData(): Promise<void> {
    for (const scenario of DEMO_SCENARIOS) {
      await this.analyzeEvent(scenario.input);
    }
  }
}
