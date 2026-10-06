import { ClefNoulQuestion, CheckoutType } from '../types/index.js';
/**
 * Standard Clef question definitions.
 * Follows the prompt's exact question taxonomy and instructions.
 */
export declare const CLEF_QUESTIONS: {
    skip_scan: {
        type: "noul";
        instructions: string;
    };
    fake_scan: {
        type: "noul";
        instructions: string;
    };
    pass_around: {
        type: "noul";
        instructions: string;
    };
    quantity_mismatch: {
        type: "noul";
        instructions: string;
    };
    item_left_in_cart: {
        type: "noul";
        instructions: string;
    };
    bottom_of_basket: {
        type: "noul";
        instructions: string;
    };
    sweethearting: {
        type: "noul";
        instructions: string;
    };
    walkoff: {
        type: "noul";
        instructions: string;
    };
    unscanned_merchandise_event: {
        type: "noul";
        instructions: string;
    };
    sufficient_visual_evidence: {
        type: "noul";
        instructions: string;
    };
    product_stacking: {
        type: "noul";
        instructions: string;
    };
    bagging_without_scan: {
        type: "noul";
        instructions: string;
    };
    unscanned_handoff: {
        type: "noul";
        instructions: string;
    };
    concealed_item: {
        type: "noul";
        instructions: string;
    };
    intentional_shrink: {
        type: "noul";
        instructions: string;
    };
    visible_item_without_scan: {
        type: "noul";
        instructions: string;
    };
    scan_without_visible_item: {
        type: "noul";
        instructions: string;
    };
    visual_pos_quantity_mismatch: {
        type: "noul";
        instructions: string;
    };
    sku_visual_mismatch: {
        type: "noul";
        instructions: string;
    };
    plu_visual_mismatch: {
        type: "noul";
        instructions: string;
    };
    weight_mismatch: {
        type: "noul";
        instructions: string;
    };
    post_scan_void: {
        type: "noul";
        instructions: string;
    };
    post_scan_delete: {
        type: "noul";
        instructions: string;
    };
    cancelled_transaction_loss: {
        type: "noul";
        instructions: string;
    };
    suspended_transaction_loss: {
        type: "noul";
        instructions: string;
    };
    unpaid_walkoff: {
        type: "noul";
        instructions: string;
    };
    override_abuse: {
        type: "noul";
        instructions: string;
    };
};
/**
 * Returns prioritized question subset for V1 based on checkout type and
 * whether transaction context is available.
 */
export declare function getQuestionsForContext(checkoutType: CheckoutType, hasTransactionContext: boolean): Record<string, ClefNoulQuestion>;
