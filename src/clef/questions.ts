import { ClefNoulQuestion, CheckoutType } from '../types/index.js';

/**
 * Standard Clef question definitions.
 * Follows the prompt's exact question taxonomy and instructions.
 */
export const CLEF_QUESTIONS = {
  // 1. Skip Scan (SCO primary)
  skip_scan: {
    type: 'noul',
    instructions: `
Did merchandise appear to move from the shopping area into the
customer's possession or bagging area without an observable legitimate
scan?

Do not count ambiguous or occluded movement as evidence.

Return a higher probability only when the item's path strongly supports
a skipped scan.
`,
  } satisfies ClefNoulQuestion,

  // 2. Fake Scan (Cashier & SCO)
  fake_scan: {
    type: 'noul',
    instructions: `
Did the cashier or customer appear to perform a scanning motion while
deliberately or apparently failing to present the merchandise properly
to the scanner?

Distinguish an unsuccessful scan attempt followed by a retry from an
item that ultimately bypasses scanning.
`,
  } satisfies ClefNoulQuestion,

  // 3. Pass-Around (Cashier & SCO)
  pass_around: {
    type: 'noul',
    instructions: `
Did merchandise appear to be intentionally routed around the scanner
rather than through the expected scanning region before entering the
bagging area or customer's possession?
`,
  } satisfies ClefNoulQuestion,

  // 4. Quantity Mismatch (Multi-item partial scan)
  quantity_mismatch: {
    type: 'noul',
    instructions: `
Is there visual evidence that multiple merchandise units were moved
through checkout while fewer corresponding scanning interactions
occurred?

Do not assume that identical units each require separate scanner
interactions because POS quantity entry may be used.
`,
  } satisfies ClefNoulQuestion,

  // 5. Item Left in Cart
  item_left_in_cart: {
    type: 'noul',
    instructions: `
At the conclusion of checkout, is merchandise visibly remaining in the
cart, basket, lower rack or child-seat region without an observed
checkout interaction?
`,
  } satisfies ClefNoulQuestion,

  // 6. Bottom-of-Basket (BOB Loss)
  bottom_of_basket: {
    type: 'noul',
    instructions: `
Is merchandise visible on the lower rack or bottom region of the cart
that appears to leave the checkout without being processed?
`,
  } satisfies ClefNoulQuestion,

  // 7. Sweethearting (Cashier collusion)
  sweethearting: {
    type: 'noul',
    instructions: `
Does the available evidence support intentional cashier assistance in
allowing merchandise through checkout without proper processing?

Require stronger evidence than an ordinary missed scan.

Do not infer collusion from conversation, familiarity, friendliness,
appearance or demographics.
`,
  } satisfies ClefNoulQuestion,

  // 8. Walk-off (Self-checkout nonpayment)
  walkoff: {
    type: 'noul',
    instructions: `
Does the shopper appear to leave the self-checkout area with merchandise
without completing the expected checkout flow?

Without POS payment data, treat this as a visual behavioral estimate
rather than confirmed nonpayment.
`,
  } satisfies ClefNoulQuestion,

  // 9. Overall Unscanned Merchandise Event
  unscanned_merchandise_event: {
    type: 'noul',
    instructions: `
Considering all available evidence, is it likely that at least one
merchandise unit left checkout without being properly processed?
`,
  } satisfies ClefNoulQuestion,

  // 10. Sufficient Visual Evidence (Evidence Quality)
  sufficient_visual_evidence: {
    type: 'noul',
    instructions: `
Is the visual evidence sufficiently clear to reliably evaluate the
relevant checkout behavior?
`,
  } satisfies ClefNoulQuestion,

  // 11. Product Stacking (SCO)
  product_stacking: {
    type: 'noul',
    instructions: `
Were two or more products physically held or stacked together while only
one appeared to encounter the scanner before entering the bagging area?
`,
  } satisfies ClefNoulQuestion,

  // 12. Bagging Without Scan / Direct-to-Bag (SCO)
  bagging_without_scan: {
    type: 'noul',
    instructions: `
Did the customer place merchandise directly into a shopping bag,
reusable bag, or completed-purchase area without any observed scanner
interaction or scale placement?
`,
  } satisfies ClefNoulQuestion,

  // 13. Unscanned Item Hand-off (Cashier)
  unscanned_handoff: {
    type: 'noul',
    instructions: `
Did the cashier transfer merchandise directly to the customer or into
the customer's cart or bag without an apparent scan or checkout
interaction?
`,
  } satisfies ClefNoulQuestion,

  // 14. Concealed Item in Cart
  concealed_item: {
    type: 'noul',
    instructions: `
Does merchandise appear obscured or hidden beneath bags, boxes,
personal belongings or other items in the cart or basket, departing
checkout unprocessed?

Do not classify ordinary visual occlusion as concealment without
meaningful evidence.
`,
  } satisfies ClefNoulQuestion,

  // 15. Intentional Shrink (Separate intent probability layer)
  intentional_shrink: {
    type: 'noul',
    instructions: `
Does the observed behavior strongly indicate deliberate intent to bypass
payment or deceive, as opposed to an accidental slip, cashier fatigue,
or scanner technical glitch?

Require substantial behavioral evidence of deception or evasion.
`,
  } satisfies ClefNoulQuestion,

  // PHASE 2 - T-LOG / POS CORRELATION QUESTIONS

  // 16. Visible Item Without Scan
  visible_item_without_scan: {
    type: 'noul',
    instructions: `
Comparing physical item movements to transaction records, did an item
cross into customer possession without any matching scan or PLU entry
in the corresponding time window?
`,
  } satisfies ClefNoulQuestion,

  // 17. Scan Without Visible Item
  scan_without_visible_item: {
    type: 'noul',
    instructions: `
Did the transaction log record a scan or item entry during a period when
no physical merchandise interaction was observed at checkout?
`,
  } satisfies ClefNoulQuestion,

  // 18. Visual vs POS Quantity Mismatch
  visual_pos_quantity_mismatch: {
    type: 'noul',
    instructions: `
Does the total count of physically transferred items exceed the total
quantity recorded in the POS transaction?
`,
  } satisfies ClefNoulQuestion,

  // 19. SKU Visual Mismatch (Item substitution)
  sku_visual_mismatch: {
    type: 'noul',
    instructions: `
Does the visually observed merchandise differ significantly from the
product description or SKU recorded at the time of the scan?
`,
  } satisfies ClefNoulQuestion,

  // 20. PLU Visual Mismatch (Produce misclassification)
  plu_visual_mismatch: {
    type: 'noul',
    instructions: `
Was a visible produce or bulk item processed under a PLU code representing
a different, lower-cost, or conventional alternative?
`,
  } satisfies ClefNoulQuestion,

  // 21. Weight Mismatch / Manipulation
  weight_mismatch: {
    type: 'noul',
    instructions: `
Is there evidence of scale manipulation, lifting an item during weighing,
or weight mismatch between physical item and POS scale reading?
`,
  } satisfies ClefNoulQuestion,

  // 22. Post-Scan Void Abuse
  post_scan_void: {
    type: 'noul',
    instructions: `
Was an item voided or removed in the POS while the physical merchandise
remained with the customer or in the bagging area?
`,
  } satisfies ClefNoulQuestion,

  // 23. Post-Scan Item Delete Abuse
  post_scan_delete: {
    type: 'noul',
    instructions: `
Was an item deleted from the active transaction record while the shopper
departed with the merchandise?
`,
  } satisfies ClefNoulQuestion,

  // 24. Cancelled Transaction Loss
  cancelled_transaction_loss: {
    type: 'noul',
    instructions: `
Was the entire transaction cancelled while merchandise appeared to leave
with the customer?
`,
  } satisfies ClefNoulQuestion,

  // 25. Suspended Transaction Loss
  suspended_transaction_loss: {
    type: 'noul',
    instructions: `
Was the transaction suspended while customer left with merchandise
without resumption or completed payment?
`,
  } satisfies ClefNoulQuestion,

  // 26. Unpaid Walk-Off (Confirmed with POS tender)
  unpaid_walkoff: {
    type: 'noul',
    instructions: `
Did the customer exit the checkout area with merchandise while the POS
transaction remained open, incomplete, or untendered?
`,
  } satisfies ClefNoulQuestion,

  // 27. Override Abuse
  override_abuse: {
    type: 'noul',
    instructions: `
Did an attendant override or intervention facilitate merchandise
leaving checkout without verified scanning or payment?
`,
  } satisfies ClefNoulQuestion,
};

/**
 * Returns prioritized question subset for V1 based on checkout type and
 * whether transaction context is available.
 */
export function getQuestionsForContext(
  checkoutType: CheckoutType,
  hasTransactionContext: boolean
): Record<string, ClefNoulQuestion> {
  const questions: Record<string, ClefNoulQuestion> = {};

  // Core universal questions
  questions.unscanned_merchandise_event = CLEF_QUESTIONS.unscanned_merchandise_event;
  questions.sufficient_visual_evidence = CLEF_QUESTIONS.sufficient_visual_evidence;
  questions.intentional_shrink = CLEF_QUESTIONS.intentional_shrink;
  questions.item_left_in_cart = CLEF_QUESTIONS.item_left_in_cart;
  questions.bottom_of_basket = CLEF_QUESTIONS.bottom_of_basket;
  questions.quantity_mismatch = CLEF_QUESTIONS.quantity_mismatch;
  questions.fake_scan = CLEF_QUESTIONS.fake_scan;
  questions.pass_around = CLEF_QUESTIONS.pass_around;

  if (checkoutType === 'cashier') {
    // Phase 1A - Cashier priorities
    questions.sweethearting = CLEF_QUESTIONS.sweethearting;
    questions.unscanned_handoff = CLEF_QUESTIONS.unscanned_handoff;
    questions.concealed_item = CLEF_QUESTIONS.concealed_item;
  } else {
    // Phase 1B - Self-Checkout priorities
    questions.skip_scan = CLEF_QUESTIONS.skip_scan;
    questions.product_stacking = CLEF_QUESTIONS.product_stacking;
    questions.bagging_without_scan = CLEF_QUESTIONS.bagging_without_scan;
    questions.walkoff = CLEF_QUESTIONS.walkoff;
    questions.concealed_item = CLEF_QUESTIONS.concealed_item;
  }

  // Phase 2 - Add T-Log / POS questions if transaction context is provided
  if (hasTransactionContext) {
    questions.visible_item_without_scan = CLEF_QUESTIONS.visible_item_without_scan;
    questions.scan_without_visible_item = CLEF_QUESTIONS.scan_without_visible_item;
    questions.visual_pos_quantity_mismatch = CLEF_QUESTIONS.visual_pos_quantity_mismatch;
    questions.sku_visual_mismatch = CLEF_QUESTIONS.sku_visual_mismatch;
    questions.plu_visual_mismatch = CLEF_QUESTIONS.plu_visual_mismatch;
    questions.weight_mismatch = CLEF_QUESTIONS.weight_mismatch;
    questions.post_scan_void = CLEF_QUESTIONS.post_scan_void;
    questions.post_scan_delete = CLEF_QUESTIONS.post_scan_delete;
    questions.cancelled_transaction_loss = CLEF_QUESTIONS.cancelled_transaction_loss;
    questions.suspended_transaction_loss = CLEF_QUESTIONS.suspended_transaction_loss;
    questions.unpaid_walkoff = CLEF_QUESTIONS.unpaid_walkoff;
    questions.override_abuse = CLEF_QUESTIONS.override_abuse;
  }

  return questions;
}
