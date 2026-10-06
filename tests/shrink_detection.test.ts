import { describe, it, expect, beforeEach } from 'vitest';
import { ShrinkDetectionService } from '../src/service/shrink_detection_service.js';
import { DEMO_SCENARIOS } from '../src/service/scenarios.js';
import { CheckoutInferenceInput } from '../src/types/index.js';

describe('Clef Grocery Checkout Shrink Detection', () => {
  let service: ShrinkDetectionService;

  beforeEach(() => {
    service = new ShrinkDetectionService({ useSimulator: true });
  });

  describe('Core Principles & Probability Separation', () => {
    it('does NOT force incidents into boolean theft, but outputs fine-grained probabilities', async () => {
      const scoScenario = DEMO_SCENARIOS.find((s) => s.id === 'sco_skip_scan')!;
      const result = await service.analyzeEvent(scoScenario.input);

      expect(typeof result.overall_shrink_probability).toBe('number');
      expect(result.overall_shrink_probability).toBeGreaterThan(0.7);

      // Separate behavior vs loss vs intent
      expect(result.observable_behavior.primary_behavior).toBe('Skip scan');
      expect(result.observable_behavior.behavior_probabilities.skip_scan).toBeGreaterThan(0.8);
      expect(result.loss_probability.unscanned_merchandise_probability).toBeGreaterThan(0.7);

      // Intent probability is evaluated separately and requires higher evidence
      expect(result.intent_probability.intentional_shrink_probability).toBeDefined();
    });

    it('returns null and evidence_available=false for unsupported categories without inventing evidence', async () => {
      const input: CheckoutInferenceInput = {
        event_id: 'evt_test_nulls',
        checkout_type: 'self_checkout',
        visual_context: {
          event_start: '10:00:00',
          tracked_items: [
            {
              id: 'it_1',
              path: ['CART_MAIN', 'HAND_CUSTOMER', 'SCANNER_ZONE', 'BAGGING_AREA'],
              scanner_interaction: true,
            },
          ],
        },
        transaction_context: null, // No POS data
      };

      const result = await service.analyzeEvent(input);

      // In V1 without POS data, barcode_switch and void_abuse cannot have visual evidence
      expect(result.events.barcode_switch).toEqual({
        probability: null,
        evidence_available: false,
      });

      expect(result.events.void_abuse).toEqual({
        probability: null,
        evidence_available: false,
      });

      expect(result.events.sweethearting).toEqual({
        probability: null,
        evidence_available: false,
      });
    });
  });

  describe('Phase 1A: Cashier-Operated Lane Detections', () => {
    it('detects Cashier Sweethearting with deliberate bypass', async () => {
      const sweetheartScenario = DEMO_SCENARIOS.find((s) => s.id === 'cashier_sweethearting')!;
      const result = await service.analyzeEvent(sweetheartScenario.input);

      expect(result.checkout_type).toBe('cashier');
      expect(result.events.sweethearting.evidence_available).toBe(true);
      expect(result.events.sweethearting.probability).toBeGreaterThan(0.70);
      expect(result.overall_shrink_probability).toBeGreaterThan(0.75);
      expect(result.recommendation.review_recommended).toBe(true);
    });

    it('detects Bottom-of-Basket (BOB) loss on lower cart rack', async () => {
      const bobScenario = DEMO_SCENARIOS.find((s) => s.id === 'bob_loss')!;
      const result = await service.analyzeEvent(bobScenario.input);

      expect(result.events.bottom_of_basket.evidence_available).toBe(true);
      expect(result.events.bottom_of_basket.probability).toBeGreaterThan(0.90);
      expect(result.observable_behavior.primary_behavior).toContain('Bottom-of-basket');
      expect(result.universal_probabilities.bottom_of_basket_probability).toBeGreaterThan(0.90);
    });
  });

  describe('Phase 1B: Self-Checkout Station Detections', () => {
    it('detects Skip Scan: Cart -> Hand -> Bag without scanner', async () => {
      const skipScan = DEMO_SCENARIOS.find((s) => s.id === 'sco_skip_scan')!;
      const result = await service.analyzeEvent(skipScan.input);

      expect(result.checkout_type).toBe('self_checkout');
      expect(result.events.skip_scan.evidence_available).toBe(true);
      expect(result.events.skip_scan.probability).toBeGreaterThan(0.85);
      expect(result.review_priority).toMatch(/high|critical/);
    });

    it('detects Multi-Item Partial Scan / Quantity Mismatch', async () => {
      const multiItem = DEMO_SCENARIOS.find((s) => s.id === 'multi_item_mismatch')!;
      const result = await service.analyzeEvent(multiItem.input);

      expect(result.events.quantity_mismatch.evidence_available).toBe(true);
      expect(result.events.quantity_mismatch.probability).toBeGreaterThan(0.70);
      expect(result.recommendation.flagged_items.length).toBeGreaterThan(0);
    });

    it('detects SCO Walk-off with unpaid merchandise', async () => {
      const walkoff = DEMO_SCENARIOS.find((s) => s.id === 'sco_walkoff')!;
      const result = await service.analyzeEvent(walkoff.input);

      expect(result.events.walkoff.evidence_available).toBe(true);
      expect(result.events.walkoff.probability).toBeGreaterThan(0.80);
      expect(result.overall_shrink_probability).toBeGreaterThan(0.85);
    });
  });

  describe('Phase 2: T-Log / POS Temporal Correlation', () => {
    it('cross-references produce scale item against entered PLU', async () => {
      const pluScenario = DEMO_SCENARIOS.find((s) => s.id === 'phase2_plu_fraud')!;
      const result = await service.analyzeEvent(pluScenario.input);

      expect(result.transaction_context_available).toBe(true);
      expect(result.events.plu_mismatch.evidence_available).toBe(true);
      expect(result.events.plu_mismatch.probability).toBeGreaterThan(0.80);
    });

    it('confirms Clean Legitimate Checkout has very low shrink probability', async () => {
      const clean = DEMO_SCENARIOS.find((s) => s.id === 'clean_legitimate_scan')!;
      const result = await service.analyzeEvent(clean.input);

      expect(result.overall_shrink_probability).toBeLessThan(0.15);
      expect(result.recommendation.review_recommended).toBe(false);
      expect(result.review_priority).toBe('low');
    });
  });

  describe('Human Review Workflow', () => {
    it('records reviewer decision and granular human review label', async () => {
      const skipScan = DEMO_SCENARIOS.find((s) => s.id === 'sco_skip_scan')!;
      const event = await service.analyzeEvent(skipScan.input);

      const reviewItem = service.submitReview(
        event.event_id,
        'confirmed_loss',
        'confirmed_skip_scan',
        'reviewer_jane_doe',
        'Clear skip scan; detergent bypassed scanner directly into bag'
      );

      expect(reviewItem).not.toBeNull();
      expect(reviewItem?.status).toBe('reviewed');
      expect(reviewItem?.review?.decision).toBe('confirmed_loss');
      expect(reviewItem?.review?.label).toBe('confirmed_skip_scan');
      expect(reviewItem?.review?.reviewer_id).toBe('reviewer_jane_doe');
    });
  });
});
