import { CheckoutInferenceInput, CheckoutEventOutput } from '../types/index.js';
import { ClefClient } from '../clef/client.js';
export declare class ProbabilisticClassifier {
    private clefClient;
    constructor(clefClient: ClefClient);
    /**
     * Evaluates checkout video & activity through Clef decision model,
     * returning tiered probabilities and review recommendations.
     */
    classify(input: CheckoutInferenceInput): Promise<CheckoutEventOutput>;
}
