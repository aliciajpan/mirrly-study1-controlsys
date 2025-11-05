document.addEventListener("DOMContentLoaded", () => {
  const $ = (s) => document.querySelector(s);
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

  let isScrubbing = false;
  let lastIsPlaying = false; // cache to render toggle text snappily

  async function getState() {
    const r = await fetch("/api/state", { cache: "no-store" });
    return r.json();
  }
  async function send(body) {
    const r = await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  function fmtSec(s) {
    if (!Number.isFinite(s)) return "0.0s";
    return (s >= 3600)
      ? new Date(s * 1000).toISOString().substr(11, 8)        // HH:MM:SS
      : new Date(s * 1000).toISOString().substr(14, 5) + "s"; // MM:SSs
  }

  function renderToggle(isPlaying) {
    toggleBtn.textContent = isPlaying ? "Pause" : "Play";
    lastIsPlaying = isPlaying;
  }

  async function refresh() {
    const s = await getState();
    stateEl.textContent = "state: " + JSON.stringify(s);

    // Toggle button label
    renderToggle(!!s.isPlaying);

    // Seek UI (driven by /screen progress)
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

    // Volume (0..1 -> 0..100)
    const v = Math.round(((s.volume ?? 1) * 100));
    if (document.activeElement !== volSlider) {
      volSlider.value = v;
      volPct.textContent = v + "%";
    }
  }

  // Load media
  loadBtn.onclick = async () => {
    const url = mediaUrl.value.trim();
    const type = mediaType.value;
    if (!url) return;
    await send({ action: "load", url, type });
    await refresh();
  };

// Replace your current toggleBtn.onclick with this:
toggleBtn.onclick = async () => {
  const wasPlaying = lastIsPlaying;        // capture BEFORE changing UI
  renderToggle(!wasPlaying);               // optimistic label update
  await send({ action: wasPlaying ? "pause" : "play" }); // use previous state
  await refresh();                         // sync with server truth
};

  // Reset to 0s (and pause to be explicit)
  resetBtn.onclick = async () => {
    await send({ action: "pause" });
    await send({ action: "seek", position: 0 });
    await refresh();
  };

  // Volume slider (0..100 -> 0..1)
  volSlider.addEventListener("input", async () => {
    const pct = Number(volSlider.value || 0);
    volPct.textContent = pct + "%";
    await send({ action: "volume", volume: Math.max(0, Math.min(1, pct / 100)) });
  });

  // Seek slider
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
    send({ action: "seek", position: val }).then(refresh);
  }
  seekSlider.addEventListener("pointerup", commitSeek);
  seekSlider.addEventListener("mouseup",   commitSeek);
  seekSlider.addEventListener("touchend",  commitSeek, { passive: true });

  // Poll state for live UI
  setInterval(refresh, 500);
  refresh();
});
