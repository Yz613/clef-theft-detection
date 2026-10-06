import {
  CheckoutInferenceInput,
  CheckoutEventOutput,
  CategoryResult,
  ShrinkProbabilities,
  ReviewPriority,
  TimelineEntry,
} from '../types/index.js';
import { ClefClient } from '../clef/client.js';
import { buildClefState } from '../clef/state_builder.js';
import { getQuestionsForContext } from '../clef/questions.js';
import { ObjectTracker } from './tracker.js';
import { VideoPipeline } from './video_pipeline.js';
import { CorrelationEngine } from './correlation_engine.js';

export class ProbabilisticClassifier {
  private clefClient: ClefClient;

  constructor(clefClient: ClefClient) {
    this.clefClient = clefClient;
  }

  /**
   * Evaluates checkout video & activity through Clef decision model,
   * returning tiered probabilities and review recommendations.
   */
  public async classify(input: CheckoutInferenceInput): Promise<CheckoutEventOutput> {
    const { checkout_type, visual_context, transaction_context, event_id, store_id, lane_id } = input;

    // 1. Process visual pipeline & extract timeline
    const visualResult = VideoPipeline.process(visual_context);

    // 2. Track merchandise trajectories & detect path anomalies
    const items = visual_context.tracked_items || [];
    const trackingResult = ObjectTracker.analyzeTrajectories(items as any);

    // 3. Phase 2 T-Log / POS Temporal Correlation
    const correlationResult = CorrelationEngine.correlate(
      trackingResult.normalizedItems,
      transaction_context
    );

    // 4. Build multimodal state and select Clef questions
    const clefState = buildClefState({
      ...input,
      visual_context: {
        ...visual_context,
        activity_windows: visualResult.segmented_windows,
      },
    });

    const hasTx = transaction_context !== null;
    const questions = getQuestionsForContext(checkout_type, hasTx);

    // 5. Query Clef decision layer (@cf/cloudflare/clef)
    const clefResponse = await this.clefClient.run({
      state: clefState,
      questions,
    });

    const answers = clefResponse.result?.answers || {};

    const getProb = (qKey: string): number | null => {
      const ans = answers[qKey];
      if (!ans || ans.type !== 'noul') return null;
      return ans.noul;
    };

    // Helper for structured events: null when evidence unavailable
    const makeCategory = (qKey: string, supportedCondition = true): CategoryResult => {
      if (!supportedCondition) {
        return { probability: null, evidence_available: false };
      }
      const val = getProb(qKey);
      if (val === null) {
        return { probability: null, evidence_available: false };
      }
      return { probability: val, evidence_available: true };
    };

    // Populate primary events
    const events: Record<string, CategoryResult> = {};

    // Cashier & SCO behavior events
    events.fake_scan = makeCategory('fake_scan');
    events.pass_around = makeCategory('pass_around');
    events.quantity_mismatch = makeCategory('quantity_mismatch');
    events.item_left_in_cart = makeCategory('item_left_in_cart');
    events.bottom_of_basket = makeCategory('bottom_of_basket');
    events.concealed_item = makeCategory('concealed_item');

    if (checkout_type === 'cashier') {
      events.sweethearting = makeCategory('sweethearting');
      events.unscanned_handoff = makeCategory('unscanned_handoff');
      events.skip_scan = { probability: null, evidence_available: false };
      events.product_stacking = { probability: null, evidence_available: false };
      events.bagging_without_scan = { probability: null, evidence_available: false };
      events.walkoff = { probability: null, evidence_available: false };
    } else {
      events.skip_scan = makeCategory('skip_scan');
      events.product_stacking = makeCategory('product_stacking');
      events.bagging_without_scan = makeCategory('bagging_without_scan');
      events.walkoff = makeCategory('walkoff');
      events.sweethearting = { probability: null, evidence_available: false };
      events.unscanned_handoff = { probability: null, evidence_available: false };
    }

    // Product manipulation events (Phase 2/3)
    events.barcode_switch = makeCategory('sku_visual_mismatch', hasTx);
    events.ticket_switch = { probability: null, evidence_available: false };
    events.scan_swap = { probability: null, evidence_available: false };
    events.plu_mismatch = makeCategory('plu_visual_mismatch', hasTx);
    events.weight_manipulation = makeCategory('weight_mismatch', hasTx);

    // Transaction manipulation events (Phase 2)
    events.void_abuse = makeCategory('post_scan_void', hasTx);
    events.item_delete = makeCategory('post_scan_delete', hasTx);
    events.cancelled_transaction_loss = makeCategory('cancelled_transaction_loss', hasTx);
    events.suspended_transaction_loss = makeCategory('suspended_transaction_loss', hasTx);
    events.refund_abuse = { probability: null, evidence_available: false };

    // Employee related
    events.unauthorized_giveaway = checkout_type === 'cashier' ? makeCategory('unscanned_handoff') : { probability: null, evidence_available: false };
    events.attendant_assisted_shrink = makeCategory('override_abuse', hasTx && checkout_type === 'self_checkout');

    // Overall shrink & loss probabilities
    const unscannedProb = getProb('unscanned_merchandise_event') ?? 0.05;
    const evidenceQuality = getProb('sufficient_visual_evidence') ?? visualResult.evidence_quality_score;
    const intentProb = getProb('intentional_shrink');

    // Compute universal typed probabilities (default to 0.0 for strongly unsupported without crashing callers)
    const universal_probabilities: ShrinkProbabilities = {
      overall_shrink_probability: unscannedProb,
      unscanned_merchandise_probability: unscannedProb,
      fake_scan_probability: events.fake_scan.probability ?? 0.0,
      skip_scan_probability: events.skip_scan.probability ?? 0.0,
      pass_around_probability: events.pass_around.probability ?? 0.0,
      quantity_mismatch_probability: events.quantity_mismatch.probability ?? 0.0,
      item_left_in_cart_probability: events.item_left_in_cart.probability ?? 0.0,
      bottom_of_basket_probability: events.bottom_of_basket.probability ?? 0.0,
      concealed_item_probability: events.concealed_item.probability ?? 0.0,
      barcode_switch_probability: events.barcode_switch.probability ?? 0.0,
      ticket_switch_probability: 0.0,
      scan_swap_probability: 0.0,
      plu_mismatch_probability: events.plu_mismatch.probability ?? 0.0,
      weight_manipulation_probability: events.weight_manipulation.probability ?? 0.0,
      void_abuse_probability: events.void_abuse.probability ?? 0.0,
      item_delete_probability: events.item_delete.probability ?? 0.0,
      cancelled_transaction_loss_probability: events.cancelled_transaction_loss.probability ?? 0.0,
      suspended_transaction_loss_probability: events.suspended_transaction_loss.probability ?? 0.0,
      refund_abuse_probability: 0.0,
      sweethearting_probability: events.sweethearting.probability ?? 0.0,
      unauthorized_giveaway_probability: events.unauthorized_giveaway.probability ?? 0.0,
      attendant_assisted_shrink_probability: events.attendant_assisted_shrink.probability ?? 0.0,
      walkoff_probability: events.walkoff.probability ?? 0.0,
      evidence_quality_probability: evidenceQuality,
    };

    // Determine primary observable behavior
    const behaviorCandidates: Array<{ name: string; prob: number }> = [];
    if (events.skip_scan.probability) behaviorCandidates.push({ name: 'Skip scan', prob: events.skip_scan.probability });
    if (events.fake_scan.probability) behaviorCandidates.push({ name: 'Fake scan', prob: events.fake_scan.probability });
    if (events.pass_around.probability) behaviorCandidates.push({ name: 'Pass-around', prob: events.pass_around.probability });
    if (events.quantity_mismatch.probability) behaviorCandidates.push({ name: 'Quantity mismatch', prob: events.quantity_mismatch.probability });
    if (events.bottom_of_basket.probability) behaviorCandidates.push({ name: 'Bottom-of-basket item', prob: events.bottom_of_basket.probability });
    if (events.item_left_in_cart.probability) behaviorCandidates.push({ name: 'Item left in cart', prob: events.item_left_in_cart.probability });
    if (events.sweethearting.probability) behaviorCandidates.push({ name: 'Sweethearting collusion', prob: events.sweethearting.probability });
    if (events.walkoff.probability) behaviorCandidates.push({ name: 'Walk-off without completion', prob: events.walkoff.probability });

    behaviorCandidates.sort((a, b) => b.prob - a.prob);
    const primaryBehavior = behaviorCandidates.length > 0 && behaviorCandidates[0].prob > 0.5
      ? behaviorCandidates[0].name
      : 'Standard checkout interaction';

    // Prioritization
    let review_priority: ReviewPriority = 'low';
    if (unscannedProb >= 0.85 && evidenceQuality >= 0.70) {
      review_priority = 'critical';
    } else if (unscannedProb >= 0.70) {
      review_priority = 'high';
    } else if (unscannedProb >= 0.40) {
      review_priority = 'medium';
    }

    // Merge unified timeline (visual + POS)
    const combinedTimeline: TimelineEntry[] = [
      ...visualResult.visual_timeline,
      ...correlationResult.pos_timeline,
    ];
    combinedTimeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Flagged items
    const flaggedItems: string[] = [];
    trackingResult.anomalies.forEach((a) => {
      if (!flaggedItems.includes(a.item_id)) flaggedItems.push(a.item_id);
    });
    correlationResult.unmatched_physical_items.forEach((item) => {
      if (!flaggedItems.includes(item.id)) flaggedItems.push(item.id);
    });

    const isReviewRecommended = unscannedProb >= 0.50 || trackingResult.anomalies.length > 0;

    // Build human explanation
    let explanation = `Assessed ${checkout_type === 'cashier' ? 'cashier lane' : 'self-checkout'} with Clef decision model. `;
    if (unscannedProb >= 0.70) {
      explanation += `High probability (${Math.round(unscannedProb * 100)}%) of unscanned merchandise loss detected. Primary observed behavior: ${primaryBehavior}. `;
    } else if (unscannedProb >= 0.40) {
      explanation += `Moderate probability (${Math.round(unscannedProb * 100)}%) of potential checkout irregularity. `;
    } else {
      explanation += `Low probability (${Math.round(unscannedProb * 100)}%) of checkout loss. All observed items appear consistent. `;
    }

    if (hasTx) {
      explanation += `T-Log cross-reference: ${correlationResult.total_physical_items} physical items observed vs ${correlationResult.total_pos_units} POS units recorded.`;
    } else {
      explanation += `Evaluated on visual evidence only (Phase 1). POS context not yet connected.`;
    }

    return {
      event_id,
      checkout_type,
      timestamp: visual_context.event_start || new Date().toISOString(),
      store_id,
      lane_id,
      overall_shrink_probability: unscannedProb,
      observable_behavior: {
        primary_behavior: primaryBehavior,
        behavior_probabilities: {
          skip_scan: events.skip_scan.probability,
          fake_scan: events.fake_scan.probability,
          pass_around: events.pass_around.probability,
          quantity_mismatch: events.quantity_mismatch.probability,
          bottom_of_basket: events.bottom_of_basket.probability,
          item_left_in_cart: events.item_left_in_cart.probability,
          sweethearting: events.sweethearting.probability,
          walkoff: events.walkoff.probability,
        },
      },
      loss_probability: {
        unscanned_merchandise_probability: unscannedProb,
      },
      intent_probability: {
        intentional_shrink_probability: intentProb,
        intent_confidence:
          intentProb === null
            ? 'unsupported'
            : intentProb >= 0.70
            ? 'high'
            : intentProb >= 0.50
            ? 'moderate'
            : 'low',
      },
      events,
      universal_probabilities,
      visual_evidence_quality: evidenceQuality,
      review_priority,
      transaction_context_available: hasTx,
      timeline: combinedTimeline,
      explanation,
      recommendation: {
        review_recommended: isReviewRecommended,
        reason: isReviewRecommended
          ? `Visual evidence supports probable checkout loss (${primaryBehavior}).`
          : 'Low suspicion; checkout behavior aligns with normal flow.',
        flagged_items: flaggedItems,
      },
    };
  }
}
