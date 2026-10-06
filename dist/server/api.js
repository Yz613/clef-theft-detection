import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function createServer(service) {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    // Serve static assets from public/
    const publicDir = path.resolve(__dirname, '../../public');
    app.use(express.static(publicDir));
    // Health and Clef Model status
    app.get('/api/status', (req, res) => {
        const clef = service.getClefClient();
        res.json({
            service: 'Clef Grocery Checkout Shrink Detection',
            model: clef.getModelName(),
            mode: clef.isUsingSimulator() ? 'Local Simulator (Deterministic Calibrated Clef)' : 'Cloudflare Workers AI Live API',
            configured_account: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
            configured_token: Boolean(process.env.CLOUDFLARE_API_TOKEN),
            timestamp: new Date().toISOString(),
        });
    });
    // Run detection on custom inference input
    app.post('/api/detect', async (req, res) => {
        try {
            const input = req.body;
            if (!input || !input.event_id || !input.checkout_type || !input.visual_context) {
                return res.status(400).json({
                    error: 'Invalid input. event_id, checkout_type, and visual_context are required.',
                });
            }
            const output = await service.analyzeEvent(input);
            res.json(output);
        }
        catch (err) {
            console.error('[API /api/detect error]', err);
            res.status(500).json({ error: err.message || 'Internal server error' });
        }
    });
    // List all scenarios
    app.get('/api/scenarios', (req, res) => {
        const scenarios = service.getScenarios().map((s) => ({
            id: s.id,
            name: s.name,
            phase: s.phase,
            checkout_type: s.checkout_type,
            description: s.description,
            expected_loss: s.expected_loss,
            expected_primary_behavior: s.expected_primary_behavior,
        }));
        res.json(scenarios);
    });
    // Run a scenario by ID
    app.post('/api/scenarios/:id/run', async (req, res) => {
        try {
            const { id } = req.params;
            const output = await service.runScenario(id);
            res.json(output);
        }
        catch (err) {
            res.status(404).json({ error: err.message });
        }
    });
    // List events in review queue
    app.get('/api/events', (req, res) => {
        const status = req.query.status;
        const items = service.getReviewQueue(status ? { status } : undefined);
        res.json(items);
    });
    // Get specific event details
    app.get('/api/events/:id', (req, res) => {
        const item = service.getReviewStore().get(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Event not found in review queue' });
        }
        res.json(item);
    });
    // Submit human review decision & label
    app.post('/api/events/:id/review', (req, res) => {
        try {
            const { id } = req.params;
            const { decision, label, reviewer_id, notes } = req.body;
            if (!decision || !label) {
                return res.status(400).json({
                    error: 'decision and label are required for human review submission',
                });
            }
            const updated = service.submitReview(id, decision, label, reviewer_id || 'reviewer_analyst', notes);
            if (!updated) {
                return res.status(404).json({ error: 'Event not found' });
            }
            res.json(updated);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return app;
}
//# sourceMappingURL=api.js.map