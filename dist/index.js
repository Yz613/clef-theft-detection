import 'dotenv/config';
import { createServer } from './server/api.js';
import { ShrinkDetectionService } from './service/shrink_detection_service.js';
export * from './types/index.js';
export * from './clef/client.js';
export * from './clef/questions.js';
export * from './clef/state_builder.js';
export * from './clef/simulator.js';
export * from './pipeline/tracker.js';
export * from './pipeline/video_pipeline.js';
export * from './pipeline/correlation_engine.js';
export * from './pipeline/probabilistic_classifier.js';
export * from './service/shrink_detection_service.js';
export * from './service/review_store.js';
export * from './service/scenarios.js';
const PORT = parseInt(process.env.PORT || '3000', 10);
async function main() {
    const service = new ShrinkDetectionService();
    // Do NOT seed fake demo events; queue starts empty and only contains user-uploaded videos
    const app = createServer(service);
    app.listen(PORT, () => {
        console.log(`================================================================`);
        console.log(`🚀 Clef Grocery Checkout Shrink Detection Service Active`);
        console.log(`🌐 Server running at: http://localhost:${PORT}`);
        console.log(`🤖 Clef Model: ${service.getClefClient().getModelName()}`);
        console.log(`📡 Clef Engine: ${service.getClefClient().isUsingSimulator() ? 'Local Deterministic Simulator' : 'Cloudflare Workers AI Live'}`);
        console.log(`📊 Review UI: http://localhost:${PORT}`);
        console.log(`================================================================`);
    });
}
// If executed directly, run the server
if (process.argv[1]?.includes('index.ts') || process.argv[1]?.includes('dist/index.js')) {
    main().catch((err) => {
        console.error('Fatal initialization error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map