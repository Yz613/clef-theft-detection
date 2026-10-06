import { CheckoutInferenceInput } from '../types/index.js';
export interface ScenarioDefinition {
    id: string;
    name: string;
    phase: 'Phase 1A' | 'Phase 1B' | 'Phase 2' | 'Clean Baseline';
    checkout_type: 'cashier' | 'self_checkout';
    description: string;
    expected_loss: boolean;
    expected_primary_behavior: string;
    input: CheckoutInferenceInput;
}
export declare const DEMO_SCENARIOS: ScenarioDefinition[];
