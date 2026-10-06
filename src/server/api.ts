import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { ShrinkDetectionService } from '../service/shrink_detection_service.js';
import { CheckoutInferenceInput, HumanReviewDecision, HumanReviewLabel } from '../types/index.js';
import { VideoProcessor } from '../pipeline/video_processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for real video uploads
const uploadsDir = path.resolve(__dirname, '../../public/uploads/videos');
const framesDir = path.resolve(__dirname, '../../public/uploads/frames');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(framesDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const unique = `video_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB video limit
});

export function createServer(service: ShrinkDetectionService) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

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

  // Upload and process a REAL checkout video
  app.post('/api/upload-video', upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
      }

      const checkoutType = (req.body.checkout_type as 'cashier' | 'self_checkout') || 'self_checkout';
      const laneId = req.body.lane_id || (checkoutType === 'cashier' ? 'lane_02' : 'sco_03');
      const storeId = req.body.store_id || 'store_104';

      console.log(`[VideoUpload] Processing uploaded video: ${req.file.path} (${checkoutType})`);

      // Run OpenCV CV pipeline
      const cvResult = await VideoProcessor.processVideo(req.file.path, checkoutType, framesDir);

      const eventId = `evt_real_${Date.now().toString(36)}`;
      const videoRelativeUrl = `/uploads/videos/${req.file.filename}`;

      // Assemble inference input
      const inferenceInput: CheckoutInferenceInput = {
        event_id: eventId,
        store_id: storeId,
        lane_id: laneId,
        checkout_type: checkoutType,
        visual_context: {
          ...cvResult.visual_context,
          video: videoRelativeUrl,
        },
        transaction_context: null, // V1 visual-only
      };

      // Run Clef probabilistic classification
      const eventOutput = await service.analyzeEvent(inferenceInput);

      res.json({
        event: eventOutput,
        input: inferenceInput,
        video_url: videoRelativeUrl,
        metadata: cvResult.metadata,
      });
    } catch (err: any) {
      console.error('[VideoUpload error]', err);
      res.status(500).json({ error: err.message || 'Error processing video' });
    }
  });

  // Process a built-in sample real video (real_skip_scan, real_legitimate_scan, real_bob_case)
  app.post('/api/process-sample-video', async (req, res) => {
    try {
      const { sample_id, checkout_type } = req.body as {
        sample_id: string;
        checkout_type?: 'cashier' | 'self_checkout';
      };

      const cType = checkout_type || (sample_id.includes('cashier') ? 'cashier' : 'self_checkout');
      const videoPath = path.resolve(__dirname, `../../public/samples/${sample_id}.mp4`);

      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: `Sample video not found: ${sample_id}.mp4` });
      }

      console.log(`[SampleVideo] Processing sample video: ${videoPath} (${cType})`);
      const cvResult = await VideoProcessor.processVideo(videoPath, cType, framesDir);

      const eventId = `evt_${sample_id}_${Date.now().toString(36)}`;
      const videoRelativeUrl = `/samples/${sample_id}.mp4`;

      const inferenceInput: CheckoutInferenceInput = {
        event_id: eventId,
        store_id: 'store_104',
        lane_id: cType === 'cashier' ? 'cashier_01' : 'sco_02',
        checkout_type: cType,
        visual_context: {
          ...cvResult.visual_context,
          video: videoRelativeUrl,
        },
        transaction_context: null,
      };

      const eventOutput = await service.analyzeEvent(inferenceInput);

      res.json({
        event: eventOutput,
        input: inferenceInput,
        video_url: videoRelativeUrl,
        metadata: cvResult.metadata,
      });
    } catch (err: any) {
      console.error('[SampleVideo error]', err);
      res.status(500).json({ error: err.message || 'Error processing sample video' });
    }
  });

  // Run detection on custom inference input
  app.post('/api/detect', async (req, res) => {
    try {
      const input = req.body as CheckoutInferenceInput;
      if (!input || !input.event_id || !input.checkout_type || !input.visual_context) {
        return res.status(400).json({
          error: 'Invalid input. event_id, checkout_type, and visual_context are required.',
        });
      }
      const output = await service.analyzeEvent(input);
      res.json(output);
    } catch (err: any) {
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
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // List events in review queue
  app.get('/api/events', (req, res) => {
    const status = req.query.status as 'pending' | 'reviewed' | undefined;
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
      const { decision, label, reviewer_id, notes } = req.body as {
        decision: HumanReviewDecision;
        label: HumanReviewLabel;
        reviewer_id?: string;
        notes?: string;
      };

      if (!decision || !label) {
        return res.status(400).json({
          error: 'decision and label are required for human review submission',
        });
      }

      const updated = service.submitReview(
        id,
        decision,
        label,
        reviewer_id || 'reviewer_analyst',
        notes
      );

      if (!updated) {
        return res.status(404).json({ error: 'Event not found' });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
