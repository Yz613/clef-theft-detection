import {
  ReviewQueueItem,
  CheckoutEventOutput,
  CheckoutInferenceInput,
  HumanReviewSubmission,
  HumanReviewLabel,
  HumanReviewDecision,
} from '../types/index.js';

export class ReviewStore {
  private queue: Map<string, ReviewQueueItem> = new Map();

  /**
   * Enqueues an analyzed checkout event for review
   */
  public enqueue(event: CheckoutEventOutput, input: CheckoutInferenceInput): ReviewQueueItem {
    const item: ReviewQueueItem = {
      event,
      input,
      status: 'pending',
    };
    this.queue.set(event.event_id, item);
    return item;
  }

  /**
   * Retrieves an item by event ID
   */
  public get(eventId: string): ReviewQueueItem | undefined {
    return this.queue.get(eventId);
  }

  /**
   * Lists items with optional filtering by status or priority
   */
  public list(filter?: { status?: 'pending' | 'reviewed'; minPriority?: string }): ReviewQueueItem[] {
    const all = Array.from(this.queue.values());
    return all.filter((item) => {
      if (filter?.status && item.status !== filter.status) return false;
      return true;
    });
  }

  /**
   * Records human reviewer outcome
   */
  public submitReview(
    eventId: string,
    submission: {
      reviewer_id: string;
      decision: HumanReviewDecision;
      label: HumanReviewLabel;
      notes?: string;
    }
  ): ReviewQueueItem | null {
    const item = this.queue.get(eventId);
    if (!item) return null;

    const fullReview: HumanReviewSubmission = {
      event_id: eventId,
      reviewer_id: submission.reviewer_id,
      decision: submission.decision,
      label: submission.label,
      notes: submission.notes,
      timestamp: new Date().toISOString(),
    };

    item.review = fullReview;
    item.status = 'reviewed';
    this.queue.set(eventId, item);
    return item;
  }

  public clear(): void {
    this.queue.clear();
  }
}
