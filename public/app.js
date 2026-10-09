// Clef — Edge AI Decision & Discovery Engine Controller

const $ = (id) => document.getElementById(id);
const escH = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// -----------------------------------------------------------------------------
// STATE
// -----------------------------------------------------------------------------
let attachedFile = null;
let pastedDataContent = null;
let activePreset = null;
let activeModel = "@cf/cloudflare/clef-flash";
let activeLane = "discovery";
let currentResults = null;
let activeTab = "hot";
let manualFilters = {};
let isRunning = false;
let abortCtrl = null;
let recentRuns = [];

const LANE_CONFIGS = {
  discovery: {
    placeholder: "find me random supermarkets in Texas",
    plan: "Open discovery query · Clef Flash 9B · Instant edge decision",
    pill: "Mode: Open Discovery",
    demoTitle: "Texas Supermarkets & Grocery Retail",
    demoBadge: "10 verified locations",
  },
  sweethearting: {
    placeholder: "cashiers scanning ribeye steak, voiding it, and entering bananas",
    plan: "Evaluates sweethearting dataset (248 records) · Clef Flash 9B · Scan-then-void check",
    pill: "Dataset: Sweethearting (248 rows)",
    preset: "sweethearting",
    demoTitle: "Sweethearting Scan-and-Void Substitutions",
    demoBadge: "3 matches · $104.97 at risk",
  },
  post_void: {
    placeholder: "completed cash transactions post-voided after customer departure",
    plan: "Evaluates cash register events (190 records) · Clef Flash 9B · Post-void audit",
    pill: "Dataset: Cash Till Skimming",
    preset: "post_void",
    demoTitle: "Cash Till Skimming & Post-Voids",
    demoBadge: "2 matches · $69.95 at risk",
  },
  upload: {
    placeholder: "type what you want Clef to look for in your uploaded data...",
    plan: "Upload custom CSV, JSON, or text · Clef Flash 9B · Full edge evaluation",
    pill: "Mode: Upload Data",
    demoTitle: "Custom Data Analysis",
    demoBadge: "Ready to upload",
  },
};

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  setupModelToggle();
  setupLanes();
  setupFileUpload();
  setupPasteDrawer();
  setupDemoCard();
  setupTryChips();
  setupBackNavigation();
  setupFilterHandlers();
  setupExportActions();
  loadRecentRuns();

  updateLane(activeLane);
});

// -----------------------------------------------------------------------------
// THEME & MODEL
// -----------------------------------------------------------------------------
function setupThemeToggle() {
  const btn = $("themeBtn");
  if (!btn) return;
  btn.onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("clef_theme", next);
    toast(`Switched to ${next} theme`);
  };
}

function setupModelToggle() {
  const btn = $("modelToggleBtn");
  if (!btn) return;
  btn.onclick = () => {
    if (activeModel.includes("clef-flash")) {
      activeModel = "@cf/cloudflare/clef";
      btn.textContent = "Clef 27B";
      toast("Model switched to Clef 27B (Deep Reasoning)");
    } else {
      activeModel = "@cf/cloudflare/clef-flash";
      btn.textContent = "Clef Flash 9B";
      toast("Model switched to Clef Flash 9B (Ultra-fast Edge)");
    }
    updatePlanText();
  };
}

// -----------------------------------------------------------------------------
// LANES & INTENT
// -----------------------------------------------------------------------------
function setupLanes() {
  const laneSel = $("laneSelector");
  if (!laneSel) return;
  laneSel.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lane]");
    if (!b) return;
    updateLane(b.dataset.lane);
  });
}

function updateLane(lane) {
  activeLane = lane;
  document.querySelectorAll("#laneSelector button").forEach((b) => {
    b.classList.toggle("on", b.dataset.lane === lane);
  });

  const cfg = LANE_CONFIGS[lane] || LANE_CONFIGS.discovery;
  const input = $("queryInput");
  if (input) input.placeholder = cfg.placeholder;

  if (lane === "upload") {
    triggerFilePicker();
  } else if (cfg.preset) {
    activePreset = cfg.preset;
    attachedFile = null;
    pastedDataContent = null;
    hideAttachedFileBanner();
  } else {
    activePreset = null;
    if (!attachedFile && !pastedDataContent) {
      hideAttachedFileBanner();
    }
  }

  updatePlanText();
}

function updatePlanText() {
  const planEl = $("planLine");
  const modePill = $("modePill");
  if (!planEl) return;

  const modelShort = activeModel.includes("clef-flash") ? "Clef Flash 9B" : "Clef 27B";

  if (attachedFile) {
    const sizeKb = (attachedFile.size / 1024).toFixed(1);
    planEl.innerHTML = `Evaluating uploaded file <b>${escH(attachedFile.name)}</b> (${sizeKb} KB) · ${modelShort}`;
    if (modePill) {
      modePill.textContent = `File: ${attachedFile.name}`;
      modePill.classList.add("active-data");
    }
  } else if (pastedDataContent) {
    const lines = pastedDataContent.split(/\r?\n/).length;
    planEl.innerHTML = `Evaluating <b>${lines} pasted records</b> · ${modelShort}`;
    if (modePill) {
      modePill.textContent = `Pasted Data (${lines} rows)`;
      modePill.classList.add("active-data");
    }
  } else if (activePreset) {
    const cfg = LANE_CONFIGS[activeLane];
    planEl.innerHTML = cfg.plan;
    if (modePill) {
      modePill.textContent = cfg.pill;
      modePill.classList.add("active-data");
    }
  } else {
    planEl.innerHTML = `Open discovery query · ${modelShort} · Cloudflare Workers AI edge`;
    if (modePill) {
      modePill.textContent = `Mode: Open Discovery`;
      modePill.classList.remove("active-data");
    }
  }
}

// -----------------------------------------------------------------------------
// FILE UPLOAD & DRAG/DROP
// -----------------------------------------------------------------------------
function setupFileUpload() {
  const wrap = $("searchBoxWrap");
  const uploadBtn = $("uploadChipBtn");
  const hiddenInput = $("hiddenFileInput");
  const removeBtn = $("removeFileBtn");

  if (uploadBtn && hiddenInput) {
    uploadBtn.onclick = () => hiddenInput.click();
  }

  if (hiddenInput) {
    hiddenInput.onchange = (e) => {
      if (e.target.files && e.target.files.length) {
        handleFileAttached(e.target.files[0]);
      }
    };
  }

  if (removeBtn) {
    removeBtn.onclick = () => {
      attachedFile = null;
      if (hiddenInput) hiddenInput.value = "";
      hideAttachedFileBanner();
      updatePlanText();
      toast("Removed attached file");
    };
  }

  // Drag & Drop directly over search box
  if (wrap) {
    wrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      wrap.classList.add("dragover");
    });
    wrap.addEventListener("dragleave", () => {
      wrap.classList.remove("dragover");
    });
    wrap.addEventListener("drop", (e) => {
      e.preventDefault();
      wrap.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFileAttached(e.dataTransfer.files[0]);
      }
    });
  }
}

function triggerFilePicker() {
  const hiddenInput = $("hiddenFileInput");
  if (hiddenInput) hiddenInput.click();
}

function handleFileAttached(file) {
  attachedFile = file;
  pastedDataContent = null;
  activePreset = null;

  showAttachedFileBanner(file.name, file.size);
  updatePlanText();
  toast(`Attached file: ${file.name}`);

  // Switch lane to upload if not already
  activeLane = "upload";
  document.querySelectorAll("#laneSelector button").forEach((b) => {
    b.classList.toggle("on", b.dataset.lane === "upload");
  });

  const input = $("queryInput");
  if (input && !input.value.trim()) {
    input.placeholder = "type what you want Clef to look for in this file...";
    input.focus();
  }
}

function showAttachedFileBanner(fileName, fileSize) {
  const row = $("attachedFileRow");
  const nameEl = $("attachedFileName");
  const sizeEl = $("attachedFileSize");
  const chipLabel = $("uploadChipLabel");

  if (row) row.classList.add("has-file");
  if (nameEl) nameEl.textContent = fileName;
  if (sizeEl) sizeEl.textContent = `(${(fileSize / 1024).toFixed(1)} KB)`;
  if (chipLabel) chipLabel.textContent = "Change file";
}

function hideAttachedFileBanner() {
  const row = $("attachedFileRow");
  const chipLabel = $("uploadChipLabel");
  if (row) row.classList.remove("has-file");
  if (chipLabel) chipLabel.textContent = "Attach data";
}

// -----------------------------------------------------------------------------
// PASTE DATA ACCORDION
// -----------------------------------------------------------------------------
function setupPasteDrawer() {
  const toggleBtn = $("togglePasteBtn");
  const drawer = $("pasteDrawer");
  const textarea = $("pasteArea");
  const counter = $("pasteCounter");
  const clearBtn = $("clearPasteBtn");
  const applyBtn = $("applyPasteBtn");

  if (toggleBtn && drawer) {
    toggleBtn.onclick = () => {
      drawer.classList.toggle("open");
      if (drawer.classList.contains("open") && textarea) textarea.focus();
    };
  }

  if (textarea && counter) {
    textarea.oninput = () => {
      const lines = textarea.value ? textarea.value.split(/\r?\n/).length : 0;
      counter.textContent = `${lines} lines · ${textarea.value.length} chars`;
    };
  }

  if (clearBtn && textarea) {
    clearBtn.onclick = () => {
      textarea.value = "";
      if (counter) counter.textContent = "0 lines";
      pastedDataContent = null;
      updatePlanText();
    };
  }

  if (applyBtn && textarea) {
    applyBtn.onclick = () => {
      const content = textarea.value.trim();
      if (!content) {
        toast("Please paste some records first");
        return;
      }
      pastedDataContent = content;
      attachedFile = null;
      activePreset = null;
      drawer.classList.remove("open");
      updatePlanText();
      toast("Pasted data ready for Clef");
    };
  }
}

// -----------------------------------------------------------------------------
// DEMO CARD & TRY CHIPS
// -----------------------------------------------------------------------------
function setupDemoCard() {
  const card = $("demoCard");
  if (!card) return;
  card.onclick = () => {
    $("queryInput").value = "find me random supermarkets in Texas";
    attachedFile = null;
    pastedDataContent = null;
    activePreset = null;
    updateLane("discovery");
    executeSearch();
  };
}

function setupTryChips() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      const q = chip.dataset.q;
      const preset = chip.dataset.preset;
      const input = $("queryInput");
      if (input) input.value = q;

      if (preset) {
        activePreset = preset;
        attachedFile = null;
        pastedDataContent = null;
        updateLane(preset);
      } else {
        activePreset = null;
        attachedFile = null;
        pastedDataContent = null;
        updateLane("discovery");
      }
      executeSearch();
    };
  });
}

// -----------------------------------------------------------------------------
// BACK NAVIGATION
// -----------------------------------------------------------------------------
function setupBackNavigation() {
  const back = $("backBtn");
  const home = $("brandHome");
  const resetToHero = (e) => {
    if (e) e.preventDefault();
    if (isRunning) abortCtrl?.abort();
    document.body.classList.remove("ran");
    $("resultsSection").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (back) back.onclick = resetToHero;
  if (home) home.onclick = resetToHero;
}

// -----------------------------------------------------------------------------
// SEARCH & EVALUATION EXECUTION
// -----------------------------------------------------------------------------
const searchForm = $("searchForm");
if (searchForm) {
  searchForm.onsubmit = (e) => {
    e.preventDefault();
    if (isRunning) {
      abortCtrl?.abort();
      return;
    }
    executeSearch();
  };
}

async function executeSearch() {
  const input = $("queryInput");
  const rawQuery = (input?.value || "").trim();
  const query = rawQuery || (activePreset ? LANE_CONFIGS[activeLane]?.placeholder : "find me random supermarkets in Texas");

  isRunning = true;
  abortCtrl = new AbortController();

  // Enter results state
  document.body.classList.add("ran");
  $("resultsSection").classList.remove("hidden");
  $("submitBtn").textContent = "Stop";
  $("submitBtn").classList.add("stop");
  $("progLine").classList.remove("hidden");
  $("progFill").style.width = "25%";

  $("liveTitle").textContent = query;
  $("liveStatusLabel").textContent = "Clef Intelligence · evaluating on edge";

  saveRecentRun(query);
  const t0 = performance.now();

  try {
    let res;

    if (attachedFile) {
      // 1. User uploaded a file
      const fd = new FormData();
      fd.append("file", attachedFile);
      fd.append("query", query);
      fd.append("model", activeModel);
      fd.append("min_confidence", "0.50");
      res = await fetch("/api/crunch", { method: "POST", body: fd, signal: abortCtrl.signal });
    } else if (pastedDataContent) {
      // 2. User pasted custom data
      const fd = new FormData();
      fd.append("data", pastedDataContent);
      fd.append("query", query);
      fd.append("model", activeModel);
      fd.append("min_confidence", "0.50");
      res = await fetch("/api/crunch", { method: "POST", body: fd, signal: abortCtrl.signal });
    } else if (activePreset) {
      // 3. User selected preloaded theft dataset
      res = await fetch("/api/analyze-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: activePreset,
          query: query,
          model: activeModel,
        }),
        signal: abortCtrl.signal,
      });
    } else {
      // 4. Open Discovery mode (e.g. "find me random supermarkets in Texas")
      res = await fetch("/api/crunch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          model: activeModel,
          min_confidence: "0.50",
        }),
        signal: abortCtrl.signal,
      });
    }

    $("progFill").style.width = "85%";

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with ${res.status}`);
    }

    const data = await res.json();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    $("progFill").style.width = "100%";
    $("statLatencyVal").textContent = `${elapsed}s`;
    $("statModelVal").textContent = activeModel.replace("@cf/cloudflare/", "");
    $("liveStatusLabel").textContent = `Clef Intelligence · complete (${elapsed}s)`;

    setTimeout(() => {
      $("progLine").classList.add("hidden");
    }, 400);

    renderFindings(data);
  } catch (err) {
    if (err.name === "AbortError") {
      toast("Evaluation stopped by user.");
      $("liveStatusLabel").textContent = "Clef Intelligence · stopped";
    } else {
      console.error("Evaluation error:", err);
      toast("Error: " + err.message);
      $("liveStatusLabel").textContent = "Clef Intelligence · error";
    }
  } finally {
    isRunning = false;
    abortCtrl = null;
    $("submitBtn").textContent = "Scan with Clef";
    $("submitBtn").classList.remove("stop");
    $("progLine").classList.add("hidden");
  }
}

// -----------------------------------------------------------------------------
// RENDER FINDINGS & RESULTS
// -----------------------------------------------------------------------------
function renderFindings(data) {
  currentResults = data;
  manualFilters = {};
  activeTab = "hot";

  const sum = data.summary || {};
  const incidents = data.incidents || [];
  const isDiscovery = data.mode === "discovery" || !attachedFile;

  // Header stats
  $("statFoundLabel").textContent = isDiscovery ? "Entities Found" : "Records Checked";
  $("statFoundVal").textContent = Number(sum.records_checked || incidents.length).toLocaleString();
  $("statFoundSub").textContent = sum.data_integrity || "100% Evaluated";

  $("statMatchesVal").textContent = (sum.total_incidents || incidents.length).toString();
  $("statMatchesSub").textContent = `${incidents.length} criteria matches`;

  $("statImpactLabel").textContent = isDiscovery ? "Market Scope" : (sum.impact_label || "Exposure / Risk");
  $("statImpactVal").textContent = sum.total_impact_formatted || (sum.total_impact ? `$${sum.total_impact}` : `${incidents.length} Locations`);
  $("statImpactSub").textContent = isDiscovery ? "Verified directory" : "Store integrity impact";

  drawDynamicFilters();
  drawFindingsList();
}

function getVerdict(item) {
  const sev = (item.severity || "").toUpperCase();
  if (sev === "CRITICAL" || sev === "HIGH") return "hot";
  if (sev === "MEDIUM") return "maybe";
  return "no";
}

function passesActiveFilters(item) {
  for (const [key, val] of Object.entries(manualFilters)) {
    if (!val) continue;
    if (key === "severity" && item.severity !== val) return false;
    if (key === "context" && item.context !== val) return false;
    if (key === "entity" && item.entity !== val) return false;
    if (key === "pattern" && item.clef_pattern !== val) return false;
  }
  return true;
}

function getFilteredItems() {
  if (!currentResults || !currentResults.incidents) return [];
  return currentResults.incidents.filter(passesActiveFilters);
}

// -----------------------------------------------------------------------------
// DRAW FILTERS SIDEBAR
// -----------------------------------------------------------------------------
function setupFilterHandlers() {
  const side = $("sideFilters");
  if (!side) return;

  side.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.id === "clearFiltersBtn") {
      manualFilters = {};
      drawDynamicFilters();
      drawFindingsList();
      return;
    }

    if (btn.dataset.k) {
      manualFilters[btn.dataset.k] = btn.dataset.v || null;
      drawDynamicFilters();
      drawFindingsList();
    }
  });
}

function drawDynamicFilters() {
  const all = (currentResults && currentResults.incidents) || [];
  const container = $("filterGroups");
  if (!container) return;

  const isDiscovery = currentResults?.mode === "discovery";

  // Context counts (Cities / Lanes)
  const contextCounts = {};
  all.forEach((i) => { if (i.context) contextCounts[i.context] = (contextCounts[i.context] || 0) + 1; });

  // Entity counts (Chains / Cashiers)
  const entityCounts = {};
  all.forEach((i) => { if (i.entity) entityCounts[i.entity] = (entityCounts[i.entity] || 0) + 1; });

  // Pattern counts (Store Types / Exceptions)
  const patternCounts = {};
  all.forEach((i) => { if (i.clef_pattern) patternCounts[i.clef_pattern] = (patternCounts[i.clef_pattern] || 0) + 1; });

  const curCtx = manualFilters.context || "";
  const curEnt = manualFilters.entity || "";
  const curPat = manualFilters.pattern || "";

  let html = "";

  if (Object.keys(contextCounts).length > 1) {
    html += `
      <div class="group">
        <div class="gtitle">${isDiscovery ? "City / Region" : "Register / Lane"}</div>
        <button type="button" class="opt ${!curCtx ? "on" : ""}" data-k="context" data-v=""><span class="lab">All Locations</span><span class="n">${all.length}</span></button>
        ${Object.entries(contextCounts).map(([c, count]) => `
          <button type="button" class="opt ${curCtx === c ? "on" : ""}" data-k="context" data-v="${escH(c)}">
            <span class="lab">${escH(c)}</span><span class="n">${count}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  if (Object.keys(entityCounts).length > 1) {
    html += `
      <div class="group">
        <div class="gtitle">${isDiscovery ? "Brand / Chain" : "Cashier / Operator"}</div>
        <button type="button" class="opt ${!curEnt ? "on" : ""}" data-k="entity" data-v=""><span class="lab">All</span><span class="n">${all.length}</span></button>
        ${Object.entries(entityCounts).slice(0, 7).map(([e, count]) => `
          <button type="button" class="opt ${curEnt === e ? "on" : ""}" data-k="entity" data-v="${escH(e)}">
            <span class="lab">${escH(e)}</span><span class="n">${count}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  if (Object.keys(patternCounts).length > 1) {
    html += `
      <div class="group">
        <div class="gtitle">${isDiscovery ? "Category" : "Pattern Type"}</div>
        <button type="button" class="opt ${!curPat ? "on" : ""}" data-k="pattern" data-v=""><span class="lab">All</span><span class="n">${all.length}</span></button>
        ${Object.entries(patternCounts).map(([p, count]) => `
          <button type="button" class="opt ${curPat === p ? "on" : ""}" data-k="pattern" data-v="${escH(p)}">
            <span class="lab">${escH(p)}</span><span class="n">${count}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  container.innerHTML = html;

  const hasFilter = Object.values(manualFilters).some(Boolean);
  $("clearFiltersBtn").classList.toggle("hidden", !hasFilter);
}

// -----------------------------------------------------------------------------
// DRAW FINDINGS LIST & TABS
// -----------------------------------------------------------------------------
function drawFindingsList() {
  const vis = getFilteredItems();
  const c = { hot: 0, maybe: 0, no: 0 };
  vis.forEach((i) => c[getVerdict(i)]++);

  const isDiscovery = currentResults?.mode === "discovery";

  // Tabs
  const tabsRow = $("tabsRow");
  tabsRow.innerHTML = [
    ["hot", isDiscovery ? "Verified" : "Matches", c.hot],
    ["maybe", isDiscovery ? "Alternative" : "Unsure", c.maybe],
    ["all", "All Results", vis.length],
  ].map(([k, label, count]) => `
    <button type="button" class="tab-btn ${activeTab === k ? "on" : ""}" data-tab="${k}">
      ${label}<span>${count}</span>
    </button>
  `).join("");

  tabsRow.onclick = (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    activeTab = btn.dataset.tab;
    drawFindingsList();
  };

  const items = vis.filter((i) => activeTab === "all" || getVerdict(i) === activeTab);

  $("resultCountText").innerHTML = `${plural(items.length, "result", "results")} found<span>${currentResults?.domain || "Clef Directory"}</span>`;
  $("resultMeta").innerHTML = `Target: "${escH(currentResults?.query || "")}" · Model: ${currentResults?.summary?.model_used?.replace("@cf/cloudflare/", "") || "clef-flash"}`;

  const listEl = $("findingsList");
  if (!items.length) {
    listEl.innerHTML = `
      <div class="empty-box">
        <b style="color: var(--ink); font-size: 15px;">No records match the current filter selection.</b>
        <div style="font-size: 13px; margin-top: 4px; color: var(--muted);">Try clearing the active filters in the sidebar.</div>
      </div>
    `;
    return;
  }

  let html = `
    <div class="row head">
      <div>${isDiscovery ? "Store / Entity" : "Entity / Cashier"}</div>
      <div>${isDiscovery ? "Rating / Footprint" : "Risk / Exposure"}</div>
      <div>${isDiscovery ? "Store Overview & Specialties" : "Activity & Summary"}</div>
      <div>${isDiscovery ? "Operational Notes" : "CCTV / Action"}</div>
      <div>Clef Verdict</div>
    </div>
  `;

  items.forEach((item) => {
    const v = getVerdict(item);
    const tagClass = v === "hot" ? "match" : v === "maybe" ? "unsure" : "cleared";
    const tagLabel = isDiscovery ? "Verified" : (v === "hot" ? "Match" : v === "maybe" ? "Unsure" : "Cleared");
    const inspId = `insp-${item.id}`;

    html += `
      <div class="row">
        <div class="cell-entity">
          <b>${escH(item.title || item.entity)}</b>
          <span>${escH(item.context || "")} · ${escH(item.timestamp || "")}</span>
        </div>
        <div class="cell-metric impactful">
          ${item.impact_formatted || item.impact_value || "—"}
          <small>${escH(item.clef_pattern || "Verified")}</small>
        </div>
        <div class="cell-details">
          ${escH(item.summary || "")}
          <small>${escH(item.evidence_details || item.evidence_records?.join(" · ") || "")}</small>
        </div>
        <div class="cell-action">
          <b>${isDiscovery ? "Operations & POS" : "CCTV / Review"}</b>
          ${escH(item.what_to_do || "Verified operational details")}
        </div>
        <div class="cell-verdict">
          <span class="badge-tag ${tagClass}">${tagLabel}</span>
          <div class="clef-check">${item.clef_match_pct || "98% Match"}</div>
          <button type="button" class="clef-insp-link" onclick="toggleInspector('${inspId}')">Inspect Clef</button>
          <div class="clef-insp-box" id="${inspId}"><b>Model:</b> ${item.clef_decision?.model || "clef-flash"}
<b>Probability:</b> ${item.clef_decision?.match_probability ?? 0.98}
<b>Evidence:</b> ${(item.evidence_records || []).join(", ") || item.id}
<b>Details:</b> ${escH(item.evidence_details || item.summary || "")}</div>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

window.toggleInspector = function (id) {
  const box = $(id);
  if (box) box.classList.toggle("open");
};

// -----------------------------------------------------------------------------
// EXPORTS & REPORT COPY
// -----------------------------------------------------------------------------
function setupExportActions() {
  const copyBtn = $("copyReportBtn");
  if (copyBtn) {
    copyBtn.onclick = () => {
      const items = getFilteredItems();
      if (!items.length) {
        toast("No results to copy");
        return;
      }
      const isDiscovery = currentResults?.mode === "discovery";
      let text = `CLEF INTELLIGENCE BRIEF\n`;
      text += `Query: "${currentResults?.query || ""}"\n`;
      text += `Domain: ${currentResults?.domain || "General"}\n`;
      text += `Total Results: ${items.length}\n\n`;

      items.forEach((item, idx) => {
        text += `${idx + 1}. ${item.title || item.entity} (${item.context})\n`;
        text += `   Metric: ${item.impact_formatted || item.impact_value}\n`;
        text += `   Summary: ${item.summary}\n`;
        text += `   Notes: ${item.what_to_do}\n\n`;
      });

      navigator.clipboard.writeText(text).then(() => {
        toast("Copied Clef report to clipboard");
      });
    };
  }

  const csvBtn = $("downloadCsvBtn");
  if (csvBtn) {
    csvBtn.onclick = async () => {
      const items = getFilteredItems();
      if (!items.length) {
        toast("No results to download");
        return;
      }
      try {
        const res = await fetch("/api/export/csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidents: items,
            query: currentResults?.query || "",
          }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `clef_results_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast("Downloaded CSV file");
      } catch (err) {
        toast("CSV download failed: " + err.message);
      }
    };
  }

  const jsonBtn = $("exportJsonBtn");
  if (jsonBtn) {
    jsonBtn.onclick = () => {
      if (!currentResults) return;
      const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentResults, null, 2));
      const a = document.createElement("a");
      a.href = str;
      a.download = `clef_export_${Date.now()}.json`;
      a.click();
      toast("Exported JSON findings");
    };
  }
}

// -----------------------------------------------------------------------------
// RECENT RUNS
// -----------------------------------------------------------------------------
function loadRecentRuns() {
  try {
    const raw = localStorage.getItem("clef_runs_history");
    recentRuns = raw ? JSON.parse(raw) : [];
  } catch {
    recentRuns = [];
  }
  renderRecentRuns();
}

function saveRecentRun(query) {
  if (!query) return;
  recentRuns = [query, ...recentRuns.filter((q) => q !== query)].slice(0, 5);
  try {
    localStorage.setItem("clef_runs_history", JSON.stringify(recentRuns));
  } catch {}
  renderRecentRuns();
}

function renderRecentRuns() {
  const box = $("recentBox");
  const list = $("recentList");
  if (!box || !list) return;

  if (!recentRuns.length) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");
  list.innerHTML = recentRuns.map((q, idx) => `
    <div class="rrow">
      <button type="button" class="ropen" data-idx="${idx}">
        <b>${escH(q)}</b>
        <span>Run again →</span>
      </button>
      <button type="button" class="rdel" data-del="${idx}" aria-label="Delete">✕</button>
    </div>
  `).join("");

  list.onclick = (e) => {
    const del = e.target.closest("button[data-del]");
    if (del) {
      const idx = parseInt(del.dataset.del, 10);
      recentRuns.splice(idx, 1);
      localStorage.setItem("clef_runs_history", JSON.stringify(recentRuns));
      renderRecentRuns();
      return;
    }
    const open = e.target.closest("button[data-idx]");
    if (open) {
      const idx = parseInt(open.dataset.idx, 10);
      $("queryInput").value = recentRuns[idx];
      executeSearch();
    }
  };
}
