// static/control.js
document.addEventListener("DOMContentLoaded", () => {
  const $ = (s) => document.querySelector(s);

  // --- Media controls ---
  const stateEl    = $("#status");
  const volSlider  = $("#volSlider");
  const volPct     = $("#volPct");
  const seekSlider = $("#seekSlider");
  const seekNow    = $("#seekNow");
  const seekDur    = $("#seekDur");
  const toggleBtn  = $("#toggleBtn");
  const resetBtn   = $("#resetBtn");
  const loadBtn    = $("#loadBtn");
  const mediaUrl   = $("#mediaUrl");
  const mediaType  = $("#mediaType");

  // --- Scenario controls (with JSON/YAML support) ---
  const scenTextEl       = $("#scenarioText");
  const fmtJsonEl        = $("#fmtJson");
  const fmtYamlEl        = $("#fmtYaml");
  const scenRunBtn       = $("#scenRunBtn");

  const scenFileInput    = $("#scenFile");
  const scenLoadLocalBtn = $("#scenLoadLocalBtn");
  const scenRunLocalBtn  = $("#scenRunLocalBtn");

  const scenPathEl       = $("#scenPath");
  const scenRunFileBtn   = $("#scenRunFileBtn");

  const scenPauseBtn     = $("#scenPauseBtn");
  const scenResumeBtn    = $("#scenResumeBtn");
  const scenStopBtn      = $("#scenStopBtn");
  const scenStatusEl     = $("#scenarioStatus");

  const nowActionLabel = document.querySelector("#nowActionLabel");
  const nowElapsed     = document.querySelector("#nowElapsed");
  const nowExtra       = document.querySelector("#nowExtra");


  let isScrubbing = false;
  let lastIsPlaying = false;

  // --- helpers ---

function fmtMillis(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const t = Math.floor(ms);
  const s = Math.floor(t / 1000);
  const m = Math.floor(s / 60);
  const remS = (s % 60).toString().padStart(2, "0");
  const tenths = Math.floor((ms % 1000) / 100);
  return `${m}:${remS}.${tenths}`;
}

let tickTimer = null;
let stepStartMs = null;
let stepMeta = null;

function startTick(startEpochSeconds, meta) {
  stepStartMs = startEpochSeconds ? startEpochSeconds * 1000 : null;
  stepMeta = meta || null;
  if (tickTimer) clearInterval(tickTimer);
  updateElapsed(); // immediate paint
  tickTimer = setInterval(updateElapsed, 250);
}

function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

function updateElapsed() {
  if (!stepStartMs) {
    nowElapsed.textContent = "00:00.0";
    return;
  }
  const ms = Date.now() - stepStartMs;
  nowElapsed.textContent = fmtMillis(ms);

  // For a timed wait, show remaining seconds (if available)
  if (stepMeta && stepMeta.action === "wait" && stepMeta.args && typeof stepMeta.args.seconds === "number") {
    const total = stepMeta.args.seconds * 1000;
    const remaining = Math.max(0, total - ms);
    nowExtra.textContent = `remaining: ${(remaining/1000).toFixed(1)}s`;
  } else {
    nowExtra.textContent = "";
  }
}

function labelForStep(current) {
  if (!current) return "—";
  const a = current.action || "";
  const args = current.args || {};
  if (a === "play_video") return `Play video ${args.url || ""}`;
  if (a === "show_image") return `Show image ${args.url || ""}`;
  if (a === "play_audio_over_image") return `Play audio ${args.url || ""} (over image)`;
  if (a === "wait" && "seconds" in args) return `Wait ${args.seconds}s`;
  if (a === "wait" && args.until) return `Wait until ${args.until}`;
  // raw control actions
  if (["load","play","pause","seek","volume",
       "overlay_audio_load","overlay_audio_play","overlay_audio_pause",
       "overlay_audio_seek","overlay_audio_volume","overlay_audio_clear"].includes(a)) {
    return `Action: ${a}`;
  }
  return a || "—";
}


  async function getState() {
    const r = await fetch("/api/state", { cache: "no-store" });
    return r.json();
  }
  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }
  async function sendControl(body) {
    return postJSON("/api/control", body);
  }
  function fmtSec(s) {
    if (!Number.isFinite(s)) return "0:00s";
    const iso = new Date(s * 1000).toISOString();
    return s >= 3600 ? iso.substr(11, 8) : iso.substr(14, 5) + "s";
  }
  function renderToggle(isPlaying) {
    toggleBtn.textContent = isPlaying ? "Pause" : "Play";
    lastIsPlaying = isPlaying;
  }

  // --- UI refresh (state + seek/volume) ---
  async function refresh() {
    const s = await getState();
    stateEl.textContent = "state: " + JSON.stringify(s);

    renderToggle(!!s.isPlaying);

    const dur = Number(s.duration || 0);
    const cur = Number(s.currentTime || 0);
    const safeDur = (Number.isFinite(dur) && dur > 0) ? dur : 0;
    const safeCur = (Number.isFinite(cur) && cur >= 0) ? cur : 0;

    seekSlider.max = safeDur;
    seekDur.textContent = fmtSec(safeDur);
    if (!isScrubbing) {
      seekSlider.value = safeCur;
      seekNow.textContent = fmtSec(safeCur);
    }

    const v = Math.round(((s.volume ?? 1) * 100));
    if (document.activeElement !== volSlider) {
      volSlider.value = v;
      volPct.textContent = v + "%";
    }
  }

  // --- Media control hooks ---
  loadBtn.onclick = async () => {
    const url = mediaUrl.value.trim();
    const type = mediaType.value;
    if (!url) return;
    await sendControl({ action: "load", url, type });
    await refresh();
  };

  toggleBtn.onclick = async () => {
    const wasPlaying = lastIsPlaying;   // capture BEFORE toggling
    renderToggle(!wasPlaying);          // optimistic UI
    await sendControl({ action: wasPlaying ? "pause" : "play" });
    await refresh();
  };

  resetBtn.onclick = async () => {
    await sendControl({ action: "pause" });
    await sendControl({ action: "seek", position: 0 });
    await refresh();
  };

  volSlider.addEventListener("input", async () => {
    const pct = Number(volSlider.value || 0);
    volPct.textContent = pct + "%";
    await sendControl({ action: "volume", volume: Math.max(0, Math.min(1, pct / 100)) });
  });

  seekSlider.addEventListener("pointerdown", () => { isScrubbing = true; });
  seekSlider.addEventListener("mousedown",   () => { isScrubbing = true; });
  seekSlider.addEventListener("touchstart",  () => { isScrubbing = true; }, { passive: true });

  seekSlider.addEventListener("input", () => {
    const val = Number(seekSlider.value || 0);
    seekNow.textContent = fmtSec(val);
  });

  function commitSeek() {
    const val = Number(seekSlider.value || 0);
    isScrubbing = false;
    postJSON("/api/control", { action: "seek", position: val }).then(refresh);
  }
  seekSlider.addEventListener("pointerup", commitSeek);
  seekSlider.addEventListener("mouseup",   commitSeek);
  seekSlider.addEventListener("touchend",  commitSeek, { passive: true });

  // --- Scenario: run text (JSON or YAML) ---
  scenRunBtn.onclick = async () => {
    const txt = scenTextEl.value.trim();
    if (!txt) return alert("Paste a scenario first.");
    const fmt = fmtYamlEl && fmtYamlEl.checked ? "yaml" : "json";
    const url = "/api/scenario/runtext"; // server parses JSON or YAML
    const res = await postJSON(url, { format: fmt, text: txt });
    if (!res.ok) return alert("Run failed: " + (res.error || "unknown error"));
    await pollScenarioOnce();
  };

  // Load a local file into the textarea (auto-detect JSON vs YAML)
  scenLoadLocalBtn.onclick = async () => {
    const f = scenFileInput.files && scenFileInput.files[0];
    if (!f) return alert("Choose a file first.");
    const text = await f.text();
    scenTextEl.value = text;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (ext === "yaml" || ext === "yml") {
      if (fmtYamlEl) fmtYamlEl.checked = true;
    } else {
      if (fmtJsonEl) fmtJsonEl.checked = true;
    }
  };

  // Parse & run a local file directly (no manual paste)
  scenRunLocalBtn.onclick = async () => {
    const f = scenFileInput.files && scenFileInput.files[0];
    if (!f) return alert("Choose a file first.");
    const text = await f.text();
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const fmt = (ext === "yaml" || ext === "yml") ? "yaml" : "json";
    const res = await postJSON("/api/scenario/runtext", { format: fmt, text });
    if (!res.ok) return alert("Run failed: " + (res.error || "unknown error"));
    await pollScenarioOnce();
  };

  // Run server-side YAML/JSON by path
  scenRunFileBtn.onclick = async () => {
    const path = scenPathEl.value.trim();
    if (!path) return alert("Enter a server file path (e.g., scenarios/lesson1.yaml).");
    const res = await postJSON("/api/scenario/runfile", { path });
    if (!res.ok) return alert("Run file failed: " + (res.error || "unknown error"));
    await pollScenarioOnce();
  };

  // Pause/Resume/Stop scenario
  scenPauseBtn.onclick  = async () => { await postJSON("/api/scenario/pause", {});  await pollScenarioOnce(); };
  scenResumeBtn.onclick = async () => { await postJSON("/api/scenario/resume", {}); await pollScenarioOnce(); };
  scenStopBtn.onclick   = async () => { await postJSON("/api/scenario/stop", {});   await pollScenarioOnce(); };

  // Scenario status
async function pollScenarioOnce() {
  try {
    const res = await fetch("/api/scenario/status", { cache: "no-store" });
    const st = await res.json();

    // existing compact status line:
    const idx = Number.isFinite(st.step_index) ? st.step_index : -1;
    const err = st.error ? ` | error: ${st.error}` : "";
    scenStatusEl.textContent = `status: ${st.status} | step: ${idx}${err}`;

    // new "Now" indicator
    if (st.status === "running" && st.current) {
      nowActionLabel.textContent = labelForStep(st.current);
      const started = typeof st.step_started_at === "number" ? st.step_started_at : null;
      startTick(started, { action: st.current.action, args: st.current.args || {} });
    } else {
      // not running — freeze display but stop ticking
      stopTick();
      if (st.status === "completed") {
        nowActionLabel.textContent = "Completed";
        nowExtra.textContent = "";
      } else if (st.status === "paused") {
        nowActionLabel.textContent = "Paused";
      } else if (st.status === "idle") {
        nowActionLabel.textContent = "—";
        nowElapsed.textContent = "00:00.0";
        nowExtra.textContent = "";
      } else if (st.status === "error") {
        nowActionLabel.textContent = "Error";
      }
    }
  } catch {
    scenStatusEl.textContent = "status: (unavailable)";
    stopTick();
  }
}

  setInterval(pollScenarioOnce, 1000);

  // Kick things off
  setInterval(refresh, 500);
  refresh();
  pollScenarioOnce();
});
