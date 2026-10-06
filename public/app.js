// Clef Grocery Checkout Shrink Detection Frontend Controller

let currentEvent = null;
let currentInput = null;
let currentDecision = null;
let animationTimer = null;
let selectedFile = null;
let mediaRecorder = null;
let recordedChunks = [];
let webcamStream = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupRealVideoHandlers();
  await checkClefStatus();
  await loadScenarios();
  await loadQueue();
});

async function checkClefStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const badgeText = document.getElementById('clefStatusText');
    const badgeDot = document.getElementById('clefStatusDot');
    if (badgeText && badgeDot) {
      if (data.is_using_live_clef) {
        badgeText.textContent = 'Cloudflare Live (@cf/cloudflare/clef)';
        badgeDot.style.background = '#10b981';
      } else {
        badgeText.textContent = 'Local CV Engine';
        badgeDot.style.background = '#eab308';
      }
    }
  } catch (err) {
    console.warn('Failed to fetch Clef status:', err);
  }
}

function setupEventListeners() {
  // Clear Queue button
  const clearBtn = document.getElementById('clearQueueBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear all items from the review queue?')) return;
      try {
        const res = await fetch('/api/queue/clear', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to clear queue');
        currentEvent = null;
        currentInput = null;
        await loadQueue();
      } catch (err) {
        alert('Error clearing queue: ' + err.message);
      }
    });
  }

  // Cloudflare Configuration Modal
  const configModal = document.getElementById('configDialog');
  const openConfigBtn = document.getElementById('configClefBtn');
  const statusBadge = document.getElementById('clefStatusBadge');
  const closeConfigBtn = document.getElementById('closeConfigBtn');
  const cancelConfigBtn = document.getElementById('cancelConfigBtn');
  const saveConfigBtn = document.getElementById('saveConfigBtn');

  if (openConfigBtn) openConfigBtn.addEventListener('click', () => configModal.showModal());
  if (statusBadge) statusBadge.addEventListener('click', () => configModal.showModal());
  if (closeConfigBtn) closeConfigBtn.addEventListener('click', () => configModal.close());
  if (cancelConfigBtn) cancelConfigBtn.addEventListener('click', () => configModal.close());

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
      const accountId = document.getElementById('cfAccountIdInput').value.trim();
      const apiToken = document.getElementById('cfApiTokenInput').value.trim();
      const model = document.getElementById('cfModelInput').value.trim() || '@cf/cloudflare/clef';
      const statusMsg = document.getElementById('cfConfigStatusMsg');

      if (!accountId || !apiToken) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'rgba(239, 68, 68, 0.2)';
        statusMsg.style.color = '#fca5a5';
        statusMsg.textContent = 'Account ID and API Token are required.';
        return;
      }

      try {
        saveConfigBtn.disabled = true;
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'rgba(56, 189, 248, 0.2)';
        statusMsg.style.color = '#7dd3fc';
        statusMsg.textContent = 'Validating and connecting to Cloudflare Workers AI...';

        const res = await fetch('/api/config/clef', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, apiToken, model }),
        });

        const data = await res.json();
        saveConfigBtn.disabled = false;

        if (!res.ok) throw new Error(data.error || 'Failed to save configuration');

        statusMsg.style.background = 'rgba(16, 185, 129, 0.2)';
        statusMsg.style.color = '#86efac';
        statusMsg.textContent = 'Connected! Now querying @cf/cloudflare/clef live.';

        await checkClefStatus();
        setTimeout(() => {
          configModal.close();
          statusMsg.style.display = 'none';
        }, 1200);
      } catch (err) {
        saveConfigBtn.disabled = false;
        statusMsg.style.background = 'rgba(239, 68, 68, 0.2)';
        statusMsg.style.color = '#fca5a5';
        statusMsg.textContent = 'Error: ' + err.message;
      }
    });
  }
  document.getElementById('runScenarioBtn').addEventListener('click', async () => {
    const sel = document.getElementById('scenarioSelect');
    if (!sel.value) return;
    try {
      const res = await fetch(`/api/scenarios/${sel.value}/run`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to run scenario');
      const data = await res.json();
      await loadQueue();
      selectEvent(data.event_id);
    } catch (err) {
      alert('Error running scenario: ' + err.message);
    }
  });

  document.getElementById('viewClipBtn').addEventListener('click', () => {
    openClipModal();
  });

  document.getElementById('closeClipBtn').addEventListener('click', () => {
    closeClipModal();
  });

  document.getElementById('confirmClipDoneBtn').addEventListener('click', () => {
    closeClipModal();
  });

  document.getElementById('playPauseSimBtn').addEventListener('click', () => {
    startClipAnimation();
  });

  document.getElementById('viewRawJsonBtn').addEventListener('click', () => {
    openJsonModal();
  });

  document.getElementById('closeJsonBtn').addEventListener('click', () => {
    document.getElementById('jsonDialog').close();
  });

  document.getElementById('copyJsonBtn').addEventListener('click', () => {
    const text = document.getElementById('rawJsonViewer').textContent;
    navigator.clipboard.writeText(text);
    alert('Copied Clef payload to clipboard!');
  });

  // Review Decision button click handlers
  document.querySelectorAll('.btn-decision').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-decision').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentDecision = btn.dataset.decision;

      // Auto-suggest matching label
      suggestLabelForDecision(currentDecision);
    });
  });

  // Submit Review
  document.getElementById('submitReviewBtn').addEventListener('click', async () => {
    if (!currentEvent) return;
    if (!currentDecision) {
      alert('Please select a human review decision (e.g. Confirmed Loss, Operational Error, etc.)');
      return;
    }

    const label = document.getElementById('reviewLabelSelect').value;
    const reviewerId = document.getElementById('reviewerIdInput').value || 'analyst_1';
    const notes = document.getElementById('reviewerNotesInput').value;

    try {
      const res = await fetch(`/api/events/${currentEvent.event_id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: currentDecision,
          label,
          reviewer_id: reviewerId,
          notes,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit review');
      const updated = await res.json();
      currentEvent = updated.event;
      renderCurrentEvent(updated);
      await loadQueue();
      alert(`Review recorded successfully: ${label} [${currentDecision}]`);
    } catch (err) {
      alert('Error submitting review: ' + err.message);
    }
  });
}

function setupRealVideoHandlers() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('videoFileInput');
  const dropZoneText = document.getElementById('dropZoneText');
  const uploadBtn = document.getElementById('uploadAndAnalyzeBtn');
  const progressText = document.getElementById('uploadProgressText');

  // Trigger file browser on click
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      selectedFile = e.target.files[0];
      dropZoneText.textContent = `🎬 Selected: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)`;
    }
  });

  // Drag and drop events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectedFile = e.dataTransfer.files[0];
      dropZoneText.textContent = `🎬 Selected: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)`;
    }
  });

  // Upload and analyze button
  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) {
      alert('Please select or drop a video file (.mp4, .mov, .webm) first.');
      return;
    }

    const cType = document.getElementById('uploadCheckoutType').value;
    const formData = new FormData();
    formData.append('video', selectedFile);
    formData.append('checkout_type', cType);

    progressText.style.display = 'block';
    progressText.textContent = '⏳ Uploading video & running OpenCV motion segmentation & Clef inference...';
    uploadBtn.disabled = true;

    try {
      const res = await fetch('/api/upload-video', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${res.status}`);
      }

      const result = await res.json();
      progressText.style.display = 'none';
      uploadBtn.disabled = false;

      // Refresh queue and select this event
      await loadQueue();
      selectEvent(result.event.event_id);

      // Display real video in player
      displayRealVideo(result.video_url, result.event, result.metadata);
    } catch (err) {
      progressText.style.display = 'none';
      uploadBtn.disabled = false;
      alert('Error analyzing video: ' + err.message);
    }
  });

  // Built-in Sample Real Video buttons
  document.getElementById('sampleSkipScanBtn').addEventListener('click', () => {
    runSampleRealVideo('real_skip_scan', 'self_checkout');
  });

  document.getElementById('sampleLegitScanBtn').addEventListener('click', () => {
    runSampleRealVideo('real_legitimate_scan', 'self_checkout');
  });

  document.getElementById('sampleBobBtn').addEventListener('click', () => {
    runSampleRealVideo('real_bob_case', 'cashier');
  });

  // Webcam recording modal setup
  setupWebcamModal();
}

async function runSampleRealVideo(sampleId, checkoutType) {
  const progressText = document.getElementById('uploadProgressText');
  progressText.style.display = 'block';
  progressText.textContent = `⏳ Processing real MP4 video sample (${sampleId}) with OpenCV & Clef...`;

  try {
    const res = await fetch('/api/process-sample-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample_id: sampleId, checkout_type: checkoutType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to process sample video');
    }

    const result = await res.json();
    progressText.style.display = 'none';

    await loadQueue();
    selectEvent(result.event.event_id);
    displayRealVideo(result.video_url, result.event, result.metadata);
  } catch (err) {
    progressText.style.display = 'none';
    alert('Error running sample video: ' + err.message);
  }
}

function displayRealVideo(videoUrl, eventOutput, metadata) {
  const card = document.getElementById('realVideoPlayerCard');
  const video = document.getElementById('realVideoPlayer');
  const title = document.getElementById('videoPlayerTitle');
  const metaBadge = document.getElementById('videoMetaBadge');
  const timeDisplay = document.getElementById('videoPlaybackTime');
  const keyframesBox = document.getElementById('keyframesContainer');

  card.style.display = 'block';
  video.src = videoUrl;

  const durationStr = metadata ? `${metadata.duration_seconds}s` : '5.0s';
  const fpsStr = metadata ? `${metadata.fps} FPS` : '30 FPS';
  metaBadge.textContent = `${durationStr} | ${fpsStr} | ${metadata?.width || 854}x${metadata?.height || 480}`;
  title.textContent = `📹 Real Footage: ${videoUrl.split('/').pop()} (${eventOutput.observable_behavior.primary_behavior})`;

  video.addEventListener('timeupdate', () => {
    const cur = video.currentTime.toFixed(1);
    const dur = (video.duration || 0).toFixed(1);
    timeDisplay.textContent = `${cur}s / ${dur}s`;
  });

  // Populate Keyframe Gallery
  keyframesBox.innerHTML = '';
  const frames = eventOutput?.visual_context?.frames || [];
  if (frames.length > 0) {
    frames.forEach((fUrl, fIdx) => {
      const kCard = document.createElement('div');
      kCard.className = 'keyframe-card';
      const label = fIdx === 0 ? 'Approach' : fIdx === 1 ? 'Interaction / Bypass' : fIdx === 2 ? 'Bagging' : 'Cart / Departure';
      kCard.innerHTML = `
        <img src="/${fUrl}" alt="Keyframe ${fIdx + 1}" onerror="this.style.display='none'">
        <div class="keyframe-label">${label} (Frame ${fIdx + 1})</div>
      `;
      keyframesBox.appendChild(kCard);
    });
  } else {
    keyframesBox.innerHTML = '<span style="font-size:0.75rem; color:var(--text-dim);">No keyframe images</span>';
  }

  // Scroll smoothly to player
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setupWebcamModal() {
  const modal = document.getElementById('webcamDialog');
  const openBtn = document.getElementById('recordWebcamBtn');
  const closeBtn = document.getElementById('closeWebcamBtn');
  const cancelBtn = document.getElementById('cancelWebcamBtn');
  const startRecBtn = document.getElementById('startRecordingBtn');
  const liveVideo = document.getElementById('webcamLiveVideo');
  const countdownText = document.getElementById('recordCountdownText');

  openBtn.addEventListener('click', async () => {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
      liveVideo.srcObject = webcamStream;
      modal.showModal();
    } catch (err) {
      alert('Could not access webcam: ' + err.message);
    }
  });

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
      webcamStream = null;
    }
    modal.close();
  }

  closeBtn.addEventListener('click', stopWebcam);
  cancelBtn.addEventListener('click', stopWebcam);

  startRecBtn.addEventListener('click', () => {
    if (!webcamStream) return;
    recordedChunks = [];
    try {
      mediaRecorder = new MediaRecorder(webcamStream, { mimeType: 'video/webm' });
    } catch {
      mediaRecorder = new MediaRecorder(webcamStream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const file = new File([blob], `webcam_record_${Date.now()}.webm`, { type: 'video/webm' });
      selectedFile = file;
      document.getElementById('dropZoneText').textContent = `📹 Recorded: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      stopWebcam();

      // Trigger automatic analysis
      document.getElementById('uploadAndAnalyzeBtn').click();
    };

    mediaRecorder.start();
    startRecBtn.disabled = true;

    let secondsLeft = 5;
    countdownText.textContent = `🔴 RECORDING: ${secondsLeft}s remaining... (perform checkout motion)`;
    const timer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(timer);
        countdownText.textContent = 'Processing recording...';
        mediaRecorder.stop();
        startRecBtn.disabled = false;
      } else {
        countdownText.textContent = `🔴 RECORDING: ${secondsLeft}s remaining...`;
      }
    }, 1000);
  });
}

async function loadScenarios() {
  try {
    const res = await fetch('/api/scenarios');
    const scenarios = await res.json();
    const select = document.getElementById('scenarioSelect');
    select.innerHTML = '<option value="">-- Load Benchmark Scenario --</option>';

    scenarios.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `[${s.phase}] ${s.name}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load scenarios:', err);
  }
}

async function loadQueue() {
  try {
    const res = await fetch('/api/events');
    const items = await res.json();
    const list = document.getElementById('queueList');
    const count = document.getElementById('queueCount');
    list.innerHTML = '';
    count.textContent = `${items.length} items`;

    if (items.length === 0) {
      list.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 20px 10px; text-align: center; line-height: 1.5;">Queue is empty.<br><span style="font-size:0.75rem; color: #38bdf8;">Upload or drop an MP4 video above to run detection.</span></div>';
      renderEmptyWorkspace();
      return;
    }

    items.forEach((item) => {
      const ev = item.event;
      const el = document.createElement('div');
      el.className = `queue-item ${currentEvent && currentEvent.event_id === ev.event_id ? 'active' : ''}`;
      el.dataset.id = ev.event_id;

      const scoreClass =
        ev.overall_shrink_probability >= 0.85
          ? 'score-critical'
          : ev.overall_shrink_probability >= 0.70
          ? 'score-high'
          : ev.overall_shrink_probability >= 0.40
          ? 'score-medium'
          : 'score-low';

      const pct = Math.round(ev.overall_shrink_probability * 100);

      el.innerHTML = `
        <div class="queue-header">
          <span class="queue-id">${ev.event_id}</span>
          <span class="queue-score ${scoreClass}">${pct}%</span>
        </div>
        <div class="queue-title">${ev.observable_behavior.primary_behavior}</div>
        <div class="queue-tags">
          <span class="tag">${ev.checkout_type === 'cashier' ? 'Cashier' : 'SCO'}</span>
          <span class="tag">${item.status === 'reviewed' ? '✓ ' + (item.review ? item.review.decision : 'Reviewed') : 'Pending'}</span>
        </div>
      `;

      el.addEventListener('click', () => {
        selectEvent(ev.event_id);
      });

      list.appendChild(el);
    });

    if (!currentEvent && items.length > 0) {
      selectEvent(items[0].event.event_id);
    }
  } catch (err) {
    console.error('Failed to load review queue:', err);
  }
}

async function selectEvent(eventId) {
  try {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) throw new Error('Event not found');
    const item = await res.json();
    currentEvent = item.event;
    currentInput = item.input;
    renderCurrentEvent(item);

    // If this item has a real video attached, show it in the video player
    if (item.input?.visual_context?.video && (item.input.visual_context.video.endsWith('.mp4') || item.input.visual_context.video.endsWith('.webm'))) {
      const videoPath = item.input.visual_context.video.startsWith('/')
        ? item.input.visual_context.video
        : `/${item.input.visual_context.video}`;
      displayRealVideo(videoPath, item.event, null);
    }

    // Update active class in list
    document.querySelectorAll('.queue-item').forEach((q) => {
      q.classList.toggle('active', q.dataset.id === eventId);
    });
  } catch (err) {
    console.error('Failed to load event details:', err);
  }
}

function renderEmptyWorkspace() {
  currentEvent = null;
  currentInput = null;
  currentDecision = null;
  document.getElementById('heroEventId').textContent = 'No Event Selected';
  const prioBadge = document.getElementById('heroPriorityBadge');
  prioBadge.textContent = 'READY';
  prioBadge.className = 'status-pill score-low';
  const typeBadge = document.getElementById('heroCheckoutTypeBadge');
  typeBadge.textContent = 'AWAITING VIDEO';
  const autoLaneBadge = document.getElementById('heroAutoLaneBadge');
  if (autoLaneBadge) autoLaneBadge.textContent = 'AUTO-DETECT';

  const theftBanner = document.getElementById('heroTheftAlertBanner');
  if (theftBanner) theftBanner.innerHTML = '';

  const theftCountBadge = document.getElementById('multiTheftCountBadge');
  if (theftCountBadge) {
    theftCountBadge.textContent = '0 DETECTED';
    theftCountBadge.className = 'status-pill score-low';
  }

  const laneExpl = document.getElementById('laneTypeExplanationText');
  if (laneExpl) laneExpl.textContent = 'Lane: Awaiting Ingestion...';

  const grid = document.getElementById('retailerTheftGrid');
  if (grid) grid.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 16px; text-align: center; grid-column: 1 / -1;">No video loaded. Upload a video above to auto-detect lane and evaluate the 8 theft categories.</div>';

  document.getElementById('heroStoreLane').textContent = 'Lane: -- | Store: --';
  document.getElementById('heroTimestamp').textContent = 'Awaiting Ingestion';
  document.getElementById('heroPosStatus').textContent = 'Phase 1 Ready';
  document.getElementById('heroExplanation').textContent =
    'No videos in the queue. Drop an MP4, MOV, or WEBM video in the ingestion panel above, or record webcam footage, to extract computer vision motion trajectories and run Clef probabilistic shrink estimation.';

  document.getElementById('gaugeLossLikelihood').textContent = '--%';
  document.getElementById('gaugeLossLikelihood').style.color = 'var(--text-muted)';
  document.getElementById('gaugeIntent').textContent = '--%';
  document.getElementById('gaugeQuality').textContent = '--%';
  document.getElementById('primaryBehaviorBadge').textContent = 'Primary: None';

  document.getElementById('behaviorProbList').innerHTML =
    '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 16px; text-align: center;">No active behavioral evaluation. Ingest a video above to begin.</div>';
  document.getElementById('trajectoryPathContainer').innerHTML =
    '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 16px; text-align: center;">No motion trajectory recorded yet.</div>';
  document.getElementById('trajectoryAnomaliesCount').textContent = '--';
  document.getElementById('timelineList').innerHTML =
    '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 16px; text-align: center;">Timeline empty.</div>';

  const playerCard = document.getElementById('realVideoPlayerCard');
  if (playerCard) playerCard.style.display = 'none';
}

function renderCurrentEvent(item) {
  const ev = item.event;
  const review = item.review;

  // Hero Meta
  document.getElementById('heroEventId').textContent = ev.event_id;

  const prioBadge = document.getElementById('heroPriorityBadge');
  prioBadge.textContent = ev.review_priority.toUpperCase();
  prioBadge.className = `status-pill ${
    ev.review_priority === 'critical' ? 'score-critical' :
    ev.review_priority === 'high' ? 'score-high' :
    ev.review_priority === 'medium' ? 'score-medium' : 'score-low'
  }`;

  const typeBadge = document.getElementById('heroCheckoutTypeBadge');
  const isCashier = ev.checkout_type === 'cashier' || ev.detected_checkout_type === 'cashier';
  typeBadge.textContent = isCashier ? 'MANNED CASHIER LANE' : 'SELF-CHECKOUT (SCO)';

  const autoLaneBadge = document.getElementById('heroAutoLaneBadge');
  if (autoLaneBadge) {
    const conf = Math.round((ev.checkout_type_confidence || 0.95) * 100);
    autoLaneBadge.textContent = `AUTO: ${isCashier ? 'MANNED' : 'SCO'} (${conf}%)`;
    autoLaneBadge.className = 'status-pill score-medium';
  }

  const laneExpl = document.getElementById('laneTypeExplanationText');
  if (laneExpl) {
    laneExpl.textContent = ev.lane_classification_evidence || 'Automated Station Geometry Classification';
  }

  // Render Multi-Theft Notification Banner
  const theftBanner = document.getElementById('heroTheftAlertBanner');
  const detectedThefts = ev.detected_theft_types || [];
  const theftCountBadge = document.getElementById('multiTheftCountBadge');
  if (theftCountBadge) {
    theftCountBadge.textContent = `${detectedThefts.length} DETECTED`;
    theftCountBadge.className = `status-pill ${detectedThefts.length > 0 ? 'score-critical' : 'score-low'}`;
  }

  if (theftBanner) {
    if (detectedThefts.length > 1) {
      theftBanner.innerHTML = `
        <span class="status-pill score-critical" style="font-size: 0.82rem; font-weight: 700; padding: 4px 10px;">
          🚨 MULTIPLE THEFTS DETECTED (${detectedThefts.length})
        </span>
        ${detectedThefts.map((t) => `<span class="status-pill score-high" style="font-size: 0.78rem;">${t}</span>`).join('')}
      `;
    } else if (detectedThefts.length === 1) {
      theftBanner.innerHTML = `
        <span class="status-pill score-critical" style="font-size: 0.82rem; font-weight: 700; padding: 4px 10px;">
          ⚠️ THEFT DETECTED
        </span>
        <span class="status-pill score-high" style="font-size: 0.78rem;">${detectedThefts[0]}</span>
      `;
    } else {
      theftBanner.innerHTML = `
        <span class="status-pill score-low" style="font-size: 0.82rem; font-weight: 700; padding: 4px 10px; background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4);">
          ✅ CLEAN TRANSACTION — ZERO SHRINK DETECTED
        </span>
      `;
    }
  }

  document.getElementById('heroStoreLane').textContent = `Lane: ${ev.lane_id || 'SCO-01'} | Store: ${ev.store_id || 'Store 104'}`;
  document.getElementById('heroTimestamp').textContent = `Observed: ${ev.timestamp}`;
  document.getElementById('heroPosStatus').textContent = ev.transaction_context_available ? 'POS: Correlated (T-Log)' : 'POS: Visual Only (Phase 1)';
  document.getElementById('heroExplanation').textContent = ev.explanation;

  // Gauges
  const lossPct = Math.round(ev.overall_shrink_probability * 100);
  document.getElementById('gaugeLossLikelihood').textContent = `${lossPct}%`;
  document.getElementById('gaugeLossLikelihood').style.color = lossPct >= 70 ? 'var(--danger)' : lossPct >= 40 ? 'var(--warning)' : 'var(--success)';

  const intentProb = ev.intent_probability.intentional_shrink_probability;
  document.getElementById('gaugeIntent').textContent = intentProb !== null ? `${Math.round(intentProb * 100)}%` : 'N/A';

  const qualProb = ev.visual_evidence_quality;
  document.getElementById('gaugeQuality').textContent = `${Math.round(qualProb * 100)}%`;

  // Primary behavior badge
  document.getElementById('primaryBehaviorBadge').textContent = `Primary: ${ev.observable_behavior.primary_behavior}`;

  // Render Retailer 8-Theft Categories Grid
  renderRetailerTheftGrid(ev);

  // Behavior Probabilities List
  renderBehaviorProbabilities(ev);

  // Trajectory Path
  renderTrajectory(item.input);

  // Timeline
  renderTimeline(ev.timeline);

  // Review status
  const revStatusEl = document.getElementById('currentReviewStatus');
  if (item.status === 'reviewed' && review) {
    revStatusEl.textContent = `REVIEWED: ${review.decision.toUpperCase()} (${review.label})`;
    revStatusEl.className = 'status-pill score-low';
    document.getElementById('reviewerNotesInput').value = review.notes || '';
    document.getElementById('reviewLabelSelect').value = review.label;

    document.querySelectorAll('.btn-decision').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.decision === review.decision);
    });
    currentDecision = review.decision;
  } else {
    revStatusEl.textContent = 'PENDING REVIEW';
    revStatusEl.className = 'status-pill score-medium';
    document.querySelectorAll('.btn-decision').forEach((btn) => btn.classList.remove('selected'));
    document.getElementById('reviewerNotesInput').value = '';
    currentDecision = null;

    // Suggest default label based on highest probability
    suggestLabelFromEvent(ev);
  }
}

function renderRetailerTheftGrid(ev) {
  const grid = document.getElementById('retailerTheftGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const summary = ev.retailer_theft_summary;
  if (!summary || !summary.categories) {
    grid.innerHTML = '<span style="color:var(--text-dim); font-size:0.85rem; grid-column: 1 / -1; padding: 12px; text-align: center;">No retailer category metrics available.</span>';
    return;
  }

  const icons = {
    non_scan: '🚫',
    left_in_cart: '🛒',
    no_sale: '💵',
    price_lookup_abuse: '🏷️',
    suspicious_refund: '🔄',
    canceled_transaction: '❌',
    inventory_loss: '📦',
    late_night_food_prep: '🍕',
  };

  Object.values(summary.categories).forEach((cat) => {
    const pct = Math.round(cat.probability * 100);
    const isDet = cat.detected;
    const card = document.createElement('div');
    card.style.padding = '12px 14px';
    card.style.background = isDet ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.03)';
    card.style.border = isDet ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(255, 255, 255, 0.07)';
    card.style.borderRadius = 'var(--radius-md)';
    card.style.transition = 'all 0.2s ease';

    const color = isDet ? 'var(--danger)' : pct >= 30 ? 'var(--warning)' : 'var(--success)';
    const badgeClass = isDet ? 'score-critical' : 'score-low';
    const badgeText = isDet ? 'DETECTED' : 'CLEAR';
    const icon = icons[cat.key] || '⚠️';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 0.88rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
          <span>${icon}</span>
          <span>${cat.label}</span>
        </span>
        <span class="status-pill ${badgeClass}" style="font-size: 0.68rem; padding: 2px 7px;">${badgeText}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 4px;">
        <span style="color: var(--text-muted);">Estimated Probability</span>
        <span style="font-weight: 700; color: ${color}; font-family: var(--font-mono);">${pct}%</span>
      </div>
      <div class="prob-meter-bg" style="height: 6px; margin-bottom: 8px;">
        <div class="prob-meter-fill" style="width: ${pct}%; background: ${color};"></div>
      </div>
      <div style="font-size: 0.74rem; color: var(--text-dim); line-height: 1.35;">
        ${cat.evidence}
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderBehaviorProbabilities(ev) {
  const container = document.getElementById('behaviorProbList');
  container.innerHTML = '';

  const behaviorKeys = [
    { key: 'skip_scan', name: 'Skip scan' },
    { key: 'fake_scan', name: 'Fake scan' },
    { key: 'pass_around', name: 'Pass-around' },
    { key: 'quantity_mismatch', name: 'Quantity mismatch' },
    { key: 'bagging_without_scan', name: 'Bagging without scan' },
    { key: 'item_left_in_cart', name: 'Item left in cart' },
    { key: 'bottom_of_basket', name: 'Bottom-of-basket item' },
    { key: 'sweethearting', name: 'Sweethearting collusion' },
    { key: 'walkoff', name: 'Walk-off without payment' },
    { key: 'plu_mismatch', name: 'Produce PLU mismatch' },
    { key: 'barcode_switch', name: 'Barcode switch / substitution' },
  ];

  behaviorKeys.forEach(({ key, name }) => {
    const entry = ev.events[key];
    const row = document.createElement('div');
    row.className = 'prob-row';

    if (!entry || entry.probability === null || !entry.evidence_available) {
      row.innerHTML = `
        <div class="prob-header">
          <span class="prob-name" style="color: var(--text-dim);">${name}</span>
          <span class="prob-unavailable">Unsupported / No evidence</span>
        </div>
        <div class="prob-meter-bg">
          <div class="prob-meter-fill" style="width: 0%;"></div>
        </div>
      `;
    } else {
      const pct = Math.round(entry.probability * 100);
      const color =
        pct >= 80 ? 'var(--danger)' :
        pct >= 60 ? '#f97316' :
        pct >= 30 ? 'var(--warning)' : 'var(--success)';

      row.innerHTML = `
        <div class="prob-header">
          <span class="prob-name">${name}</span>
          <span class="prob-percent" style="color: ${color};">${pct}%</span>
        </div>
        <div class="prob-meter-bg">
          <div class="prob-meter-fill" style="width: ${pct}%; background: ${color};"></div>
        </div>
      `;
    }

    container.appendChild(row);
  });
}

function renderTrajectory(input) {
  const container = document.getElementById('trajectoryPathContainer');
  const countEl = document.getElementById('trajectoryAnomaliesCount');
  container.innerHTML = '';

  const items = input?.visual_context?.tracked_items || [];
  if (items.length === 0) {
    container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem;">No item trajectories available</span>';
    countEl.textContent = 'None';
    return;
  }

  let totalAnomalies = 0;

  items.forEach((item, idx) => {
    const path = item.path || ['CART', 'HAND', 'SCANNER', 'BAG'];
    const hasScanner = item.scanner_interaction || path.some((p) => p.includes('SCANNER'));

    if (!hasScanner) totalAnomalies++;

    const itemLabel = document.createElement('div');
    itemLabel.style.width = '100%';
    itemLabel.style.fontSize = '0.78rem';
    itemLabel.style.color = 'var(--text-muted)';
    itemLabel.style.marginTop = idx > 0 ? '8px' : '0px';
    itemLabel.textContent = `Item ${idx + 1}: ${item.label || item.id}`;
    container.appendChild(itemLabel);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.flexWrap = 'wrap';

    path.forEach((node, nIdx) => {
      const span = document.createElement('span');
      span.className = 'path-node';
      span.textContent = node;

      if (!hasScanner && (node.includes('BAG') || node.includes('CUSTOMER') || node.includes('EXIT') || node.includes('SIDE'))) {
        span.classList.add('suspicious');
      } else if (node.includes('SCANNER')) {
        span.classList.add('valid');
      }

      row.appendChild(span);

      if (nIdx < path.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'path-arrow';
        arrow.textContent = '→';
        row.appendChild(arrow);
      }
    });

    container.appendChild(row);
  });

  countEl.textContent = totalAnomalies > 0 ? `${totalAnomalies} bypass anomalies detected` : 'Clean trajectory';
  countEl.style.color = totalAnomalies > 0 ? 'var(--danger)' : 'var(--success)';
}

function renderTimeline(timeline) {
  const container = document.getElementById('timelineList');
  container.innerHTML = '';

  if (!timeline || timeline.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem;">No timeline events</div>';
    return;
  }

  timeline.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'timeline-item';
    el.style.cursor = 'pointer';

    let dotClass = 'dot-normal';
    if (item.source === 'pos') {
      dotClass = item.severity === 'alert' ? 'dot-alert' : 'dot-pos';
    } else if (item.severity === 'alert') {
      dotClass = 'dot-alert';
    } else if (item.severity === 'suspicious') {
      dotClass = 'dot-suspicious';
    }

    el.innerHTML = `
      <div class="timeline-dot ${dotClass}"></div>
      <div class="timeline-time">${item.timestamp}</div>
      <div class="timeline-content">
        <span class="timeline-source source-${item.source}">${item.source}</span>
        ${item.description}
      </div>
    `;

    // Clicking timeline item seeks the real video player
    el.addEventListener('click', () => {
      const video = document.getElementById('realVideoPlayer');
      if (video && video.src) {
        const parts = item.timestamp.split(':');
        if (parts.length === 3) {
          const sec = parseFloat(parts[2]) % (video.duration || 10);
          video.currentTime = sec;
          video.play().catch(() => {});
        }
      }
    });

    container.appendChild(el);
  });
}

function suggestLabelForDecision(decision) {
  const select = document.getElementById('reviewLabelSelect');
  if (!currentEvent) return;

  if (decision === 'no_loss') {
    select.value = 'not_loss';
    return;
  }
  if (decision === 'operational_error') {
    select.value = 'operational_error';
    return;
  }
  if (decision === 'unclear') {
    select.value = 'insufficient_evidence';
    return;
  }

  suggestLabelFromEvent(currentEvent);
}

function suggestLabelFromEvent(ev) {
  const select = document.getElementById('reviewLabelSelect');
  const detected = ev.detected_theft_types || [];

  if (detected.length === 0 && ev.overall_shrink_probability < 0.35) {
    select.value = 'not_loss';
    return;
  }

  if (detected.includes('Non-Scan')) {
    select.value = 'non_scan';
    return;
  }
  if (detected.includes('Left in Cart')) {
    select.value = 'left_in_cart';
    return;
  }
  if (detected.includes('Inventory Loss')) {
    select.value = 'inventory_loss';
    return;
  }
  if (detected.includes('Price Look-Up Abuse')) {
    select.value = 'price_lookup_abuse';
    return;
  }
  if (detected.includes('No Sale')) {
    select.value = 'no_sale';
    return;
  }
  if (detected.includes('Suspicious Refund')) {
    select.value = 'suspicious_refund';
    return;
  }
  if (detected.includes('Canceled Transaction')) {
    select.value = 'canceled_transaction';
    return;
  }
  if (detected.includes('Late Night Food Prep')) {
    select.value = 'late_night_food_prep';
    return;
  }

  const prim = (ev.observable_behavior?.primary_behavior || '').toLowerCase();
  if (prim.includes('skip scan') || prim.includes('pass-around') || prim.includes('fake scan')) select.value = 'non_scan';
  else if (prim.includes('bottom-of-basket') || prim.includes('cart')) select.value = 'left_in_cart';
  else if (prim.includes('plu')) select.value = 'price_lookup_abuse';
  else select.value = 'inventory_loss';
}

function openClipModal() {
  const dialog = document.getElementById('clipDialog');
  dialog.showModal();
  startClipAnimation();
}

function closeClipModal() {
  if (animationTimer) cancelAnimationFrame(animationTimer);
  document.getElementById('clipDialog').close();
}

function startClipAnimation() {
  const canvas = document.getElementById('clipCanvas');
  const ctx = canvas.getContext('2d');
  let frame = 0;

  if (animationTimer) cancelAnimationFrame(animationTimer);

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines for checkout camera view
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Checkout Lane Elements
    // Cart Zone (Left)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 100, 120, 180);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.fillRect(40, 100, 120, 180);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '12px ui-monospace';
    ctx.fillText('CART ZONE', 60, 125);

    // Scanner Optical Window (Middle)
    const scannerX = 280;
    const scannerY = 140;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(scannerX, scannerY, 80, 100);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(scannerX, scannerY, 80, 100);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('OPTICAL SCANNER', scannerX - 10, scannerY - 10);

    // Bagging Well (Right)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.strokeRect(480, 100, 120, 180);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.fillRect(480, 100, 120, 180);
    ctx.fillStyle = '#10b981';
    ctx.fillText('BAGGING WELL', 495, 125);

    // Calculate item movement across frames
    frame = (frame + 1) % 240;
    const t = frame / 240;

    let itemX = 100;
    let itemY = 190;

    const isSkipScan = currentEvent?.events?.skip_scan?.probability && currentEvent.events.skip_scan.probability > 0.5;
    const isPassAround = currentEvent?.events?.pass_around?.probability && currentEvent.events.pass_around.probability > 0.5;

    if (isSkipScan || isPassAround) {
      // Bypasses around scanner (Arcing upwards away from scanner window)
      itemX = 100 + t * 440;
      itemY = 190 - Math.sin(t * Math.PI) * 90; // Routes above/around scanner
    } else {
      // Normal path: directly across optical scanner
      itemX = 100 + t * 440;
      itemY = 190;
    }

    // Draw item bounding box
    ctx.strokeStyle = isSkipScan ? '#ef4444' : '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(itemX - 25, itemY - 25, 50, 50);
    ctx.fillStyle = isSkipScan ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)';
    ctx.fillRect(itemX - 25, itemY - 25, 50, 50);

    // Item Label tag
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px ui-monospace';
    ctx.fillText('item_1 [TRACKED]', itemX - 40, itemY - 32);

    // Trajectory Path Trail
    ctx.strokeStyle = isSkipScan ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(100, 190);
    ctx.lineTo(itemX, itemY);
    ctx.stroke();
    ctx.setLineDash([]);

    animationTimer = requestAnimationFrame(draw);
  }

  draw();
}

function openJsonModal() {
  const dialog = document.getElementById('jsonDialog');
  const pre = document.getElementById('rawJsonViewer');
  pre.textContent = JSON.stringify(
    {
      input: currentInput,
      clef_output: currentEvent,
    },
    null,
    2
  );
  dialog.showModal();
}
