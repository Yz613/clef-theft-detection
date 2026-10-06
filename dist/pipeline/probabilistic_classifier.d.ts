import { CheckoutInferenceInput, CheckoutEventOutput } from '../types/index.js';
import { ClefClient } from '../clef/client.js';
export declare class ProbabilisticClassifier {
    private clefClient;
    constructor(clefClient: ClefClient);
    /**
     * Evaluates checkout video keyframes directly through Cloudflare Clef
     * multimodal decision model (@cf/cloudflare/clef).
     */
    classify(input: CheckoutInferenceInput): Promise<CheckoutEventOutput>;
}
