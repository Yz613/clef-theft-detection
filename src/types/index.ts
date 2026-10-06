/**
 * Core Type Definitions for Clef Grocery Checkout Shrink Detection
 */

export type CheckoutType = 'cashier' | 'self_checkout' | 'auto';

export type RetailerTheftCategory =
  | 'non_scan'
  | 'left_in_cart'
  | 'no_sale'
  | 'price_lookup_abuse'
  | 'suspicious_refund'
  | 'canceled_transaction'
  | 'inventory_loss'
  | 'late_night_food_prep';

export interface RetailerTheftDetection {
  key: RetailerTheftCategory;
  label: string;
  detected: boolean;
  probability: number;
  evidence: string;
}

export interface RetailerTheftSummary {
  theft_count: number;
  detected_thefts: string[];
  categories: Record<RetailerTheftCategory, RetailerTheftDetection>;
}

export type ReviewPriority = 'low' | 'medium' | 'high' | 'critical';

export type ItemLocation =
  | 'CART_MAIN'
  | 'CART_LOWER_RACK'
  | 'CART_CHILD_SEAT'
  | 'HAND_CASHIER'
  | 'HAND_CUSTOMER'
  | 'SCANNER_ZONE'
  | 'BAGGING_AREA'
  | 'CUSTOMER_POSSESSION'
  | 'EXIT_ZONE'
  | 'UNKNOWN';

export interface TrackedItem {
  id: string;
  label?: string;
  category?: string;
  path?: string[];
  locations?: Array<{
    location: ItemLocation | string;
    timestamp: string;
    confidence: number;
  }>;
  first_seen?: string;
  last_seen?: string;
  scanner_interaction_observed?: boolean;
  scanner_distance_cm?: number;
  stacked_with?: string[];
}

export interface ActivityWindow {
  window_id: string;
  phase:
    | 'before_interaction'
    | 'scanner_approach'
    | 'scanner_interaction'
    | 'bagging_interaction'
    | 'cart_state'
    | 'transaction_end'
    | 'customer_departure';
  start_time: string;
  end_time: string;
  motion_intensity: number;
  involved_item_ids: string[];
  scanner_activated: boolean;
  notes?: string;
}

export interface RealCvMetrics {
  pass_around_probability: number;
  skip_scan_probability: number;
  bottom_of_basket_probability: number;
  bypass_motion_ratio: number;
  scanner_dwell_seconds: number;
  motion_intensity: number;
  pass_around_hits: number;
  scanner_hits: number;
  detected_lane_type?: 'cashier' | 'self_checkout';
  lane_confidence?: number;
  lane_evidence?: string;
  retailer_theft_metrics?: {
    non_scan: number;
    left_in_cart: number;
    no_sale: number;
    price_lookup_abuse: number;
    suspicious_refund: number;
    canceled_transaction: number;
    inventory_loss: number;
    late_night_food_prep: number;
  };
}

export interface VisualContext {
  video?: string;
  frames?: string[];
  real_cv_metrics?: RealCvMetrics;
  tracked_items?: Array<{
    id: string;
    path?: string[];
    first_seen?: string;
    last_seen?: string;
    label?: string;
    scanner_interaction?: boolean;
    location_history?: string[];
  }>;
  camera_position?: string;
  event_start?: string;
  event_end?: string;
  activity_windows?: ActivityWindow[];
  cart_inspection?: {
    main_basket_empty: boolean;
    lower_rack_items_detected: number;
    child_seat_items_detected: number;
    concealed_items_detected: number;
  };
  keyframes?: Array<{
    frame_number?: number;
    timestamp_sec: number;
    relative_path: string;
    data_url?: string;
  }>;
}

export interface PosScan {
  sku?: string;
  upc?: string;
  description?: string;
  quantity?: number;
  price?: number;
  timestamp?: string;
}

export interface PosPluEntry {
  plu?: string;
  description?: string;
  weight?: number;
  price?: number;
  timestamp?: string;
}

export interface PosVoid {
  item_id?: string;
  sku?: string;
  description?: string;
  timestamp?: string;
  reason?: string;
}

export interface PosDelete {
  item_id?: string;
  sku?: string;
  timestamp?: string;
}

export interface PosCancel {
  transaction_id?: string;
  timestamp?: string;
  reason?: string;
}

export interface PosSuspend {
  transaction_id?: string;
  timestamp?: string;
}

export interface PosResume {
  transaction_id?: string;
  timestamp?: string;
}

export interface PosOverride {
  type?: string;
  attendant_id?: string;
  timestamp?: string;
  reason?: string;
}

export interface PosTender {
  method?: 'cash' | 'credit' | 'debit' | 'ebt' | 'gift_card' | 'other';
  amount?: number;
  successful?: boolean;
  timestamp?: string;
}

export interface TransactionContext {
  transaction_id?: string;
  transaction_start?: string;
  transaction_end?: string;
  scans?: PosScan[];
  plu_entries?: PosPluEntry[];
  voids?: PosVoid[] | unknown[];
  deletes?: PosDelete[] | unknown[];
  cancels?: PosCancel[] | unknown[];
  suspends?: PosSuspend[] | unknown[];
  resumes?: PosResume[] | unknown[];
  overrides?: PosOverride[] | unknown[];
  tenders?: PosTender[] | unknown[];
  total?: number;
  item_count?: number;
}

/**
 * Exact Transaction Input Model requested
 */
export interface CheckoutInferenceInput {
  event_id: string;
  store_id?: string;
  lane_id?: string;
  checkout_type: CheckoutType;
  visual_context: VisualContext;
  transaction_context: null | TransactionContext;
}

/**
 * Universal Checkout Shrink Events Interface
 */
export interface ShrinkProbabilities {
  overall_shrink_probability: number;
  unscanned_merchandise_probability: number;

  // Physical checkout behaviors
  fake_scan_probability: number;
  skip_scan_probability: number;
  pass_around_probability: number;
  quantity_mismatch_probability: number;
  item_left_in_cart_probability: number;
  bottom_of_basket_probability: number;
  concealed_item_probability: number;

  // Product manipulation
  barcode_switch_probability: number;
  ticket_switch_probability: number;
  scan_swap_probability: number;
  plu_mismatch_probability: number;
  weight_manipulation_probability: number;

  // Transaction manipulation
  void_abuse_probability: number;
  item_delete_probability: number;
  cancelled_transaction_loss_probability: number;
  suspended_transaction_loss_probability: number;
  refund_abuse_probability: number;

  // Employee-related
  sweethearting_probability: number;
  unauthorized_giveaway_probability: number;
  attendant_assisted_shrink_probability: number;

  // Self checkout
  walkoff_probability: number;

  evidence_quality_probability: number;
}

export interface CategoryResult {
  probability: number | null;
  evidence_available: boolean;
}

export interface TimelineEntry {
  timestamp: string;
  source: 'visual' | 'pos' | 'attendant';
  description: string;
  item_id?: string;
  severity?: 'normal' | 'suspicious' | 'alert';
}

/**
 * Complete Event Output returned by detection service
 */
export interface CheckoutEventOutput {
  event_id: string;
  checkout_type: CheckoutType;
  timestamp: string;
  store_id?: string;
  lane_id?: string;

  // Overall and tiered probabilities
  overall_shrink_probability: number;
  observable_behavior: {
    primary_behavior: string;
    behavior_probabilities: Record<string, number | null>;
  };
  loss_probability: {
    unscanned_merchandise_probability: number;
  };
  intent_probability: {
    intentional_shrink_probability: number | null;
    intent_confidence: 'low' | 'moderate' | 'high' | 'unsupported';
  };

  // Structured events category map (strictly null when evidence unavailable)
  events: Record<string, CategoryResult>;

  // Full typed probabilities
  universal_probabilities: ShrinkProbabilities;

  visual_evidence_quality: number;
  review_priority: ReviewPriority;
  transaction_context_available: boolean;

  timeline: TimelineEntry[];
  explanation: string;
  recommendation: {
    review_recommended: boolean;
    reason: string;
    flagged_items: string[];
  };

  // Auto-detected Lane Classification
  detected_checkout_type: 'cashier' | 'self_checkout';
  checkout_type_confidence: number;
  lane_classification_evidence: string;

  // Retailer 8-Category Multi-Theft Detections
  detected_theft_types: string[];
  retailer_theft_summary: RetailerTheftSummary;
}

/**
 * Human review decision actions and specific labels requested
 */
export type HumanReviewDecision =
  | 'confirmed_loss'
  | 'probably_loss'
  | 'operational_error'
  | 'no_loss'
  | 'unclear';

export type HumanReviewLabel =
  | 'non_scan'
  | 'left_in_cart'
  | 'no_sale'
  | 'price_lookup_abuse'
  | 'suspicious_refund'
  | 'canceled_transaction'
  | 'inventory_loss'
  | 'late_night_food_prep'
  | 'confirmed_skip_scan'
  | 'confirmed_fake_scan'
  | 'confirmed_sweethearting'
  | 'confirmed_quantity_error'
  | 'confirmed_bob'
  | 'confirmed_barcode_switch'
  | 'confirmed_plu_fraud'
  | 'confirmed_walkoff'
  | 'confirmed_void_abuse'
  | 'confirmed_other_loss'
  | 'accidental_miss'
  | 'operational_error'
  | 'not_loss'
  | 'insufficient_evidence';

export interface HumanReviewSubmission {
  event_id: string;
  reviewer_id: string;
  decision: HumanReviewDecision;
  label: HumanReviewLabel;
  notes?: string;
  timestamp: string;
}

export interface ReviewQueueItem {
  event: CheckoutEventOutput;
  input: CheckoutInferenceInput;
  review?: HumanReviewSubmission;
  status: 'pending' | 'reviewed';
}

/**
 * Clef API Protocol Types
 */
export interface ClefNoulQuestion {
  type: 'noul';
  instructions: string;
}

export interface ClefChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export interface ClefScoreQuestion {
  type: 'score';
  instructions: string;
}

export type ClefQuestion = ClefNoulQuestion | ClefChoiceQuestion | ClefScoreQuestion;

export interface ClefRequest {
  model?: '@cf/cloudflare/clef' | '@cf/cloudflare/clef-flash' | string;
  state: string | Record<string, any> | any;
  images?: string[];
  questions: Record<string, ClefQuestion>;
}

export interface ClefNoulAnswer {
  type: 'noul';
  noul: number;
}

export interface ClefChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface ClefScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
}

export type ClefAnswer = ClefNoulAnswer | ClefChoiceAnswer | ClefScoreAnswer;

export interface ClefResponse {
  result: {
    model: string;
    answers: Record<string, ClefAnswer>;
  };
  success?: boolean;
  errors?: unknown[];
}
