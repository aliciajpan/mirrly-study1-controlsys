const $ = (s) => document.querySelector(s);
const v = $("#v");
const a = $("#a");
const i = $("#i");
const dbg = $("#debug");

let lastUrl = null;
let lastType = null;
let lastPositionNonce = 0;
let lastOverlayNonce = 0;
let overlayEl = a; // reuse the existing <audio> for overlay when type === "image"

async function fetchState() {
  const res = await fetch("/api/state", { cache: "no-store" });
  return res.json();
}
async function postProgress(currentTime, duration) {
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentTime, duration })
    });
  } catch (_) {}
}
async function postEvent(ev, track, at) {
  try {
    await fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: ev, track, at })
    });
  } catch (_) {}
}

function showVisualOnly(el) {
  // Show exactly one visual (video OR image), but keep audio hidden state independent
  v.style.display = "none";
  i.style.display = "none";
  el.style.display = "";
}

function attachEnded(el, track) {
  el.addEventListener("ended", () => postEvent("ended", track, el.currentTime || 0));
}

async function applyState(s) {
  dbg.textContent = JSON.stringify(s, null, 2);

  const mediaChanged = (s.url !== lastUrl) || (s.type !== lastType);
  if (mediaChanged) {
    lastUrl = s.url; lastType = s.type;
    // reset primary elements
    [v].forEach(e => { e.pause(); e.removeAttribute("src"); try { e.load(); } catch(_) {} });
    i.removeAttribute("src");

    if (!s.url) return;

    if (s.type === "video") {
      showVisualOnly(v);
      // 🔧 autoplay helpers
      v.setAttribute("playsinline", "");   // iOS/Safari inline playback
      v.playsInline = true;
      v.muted = true;                      // allow autoplay on first attach

      v.src = s.url;
      try { await v.play(); } catch(_) {}
      v.pause();                           // prewarm the pipeline

      attachEnded(v, "primary");
    } else if (s.type === "image") {
      showVisualOnly(i);
      i.src = s.url;
      // leave audio decisions below (overlay)
      postProgress(0, 0);
      // no return; overlay audio may apply
    } else if (s.type === "audio") {
      // Fallback mode (rare): use primary audio with a blank visual
      showVisualOnly(i);
      i.src = "";
      a.src = s.url;
      try { await a.play().catch(()=>{}); } catch(_) {}
      a.pause();
      attachEnded(a, "primary");
    }
  }

  // Primary volume
  v.volume = s.volume ?? 1.0;

  // Primary seek on nonce
  if ((s.type === "video") && s.position_nonce !== lastPositionNonce) {
    v.currentTime = s.position || 0;
    lastPositionNonce = s.position_nonce;
  }

  // Primary play/pause
if (s.type === "video") {
  if (s.isPlaying) {
    if (v.muted && (s.volume ?? 1) > 0) v.muted = false;  // 🔊 unmute when actually playing
    if (v.paused) { try { await v.play(); } catch(_) {} }
  } else {
    if (!v.paused) v.pause();
  }
  postProgress(v.currentTime || 0, Number.isFinite(v.duration) ? v.duration : 0);
} else {
  postProgress(0, 0);
}


  // ----- OVERLAY AUDIO while image is visible -----
  if (s.type === "image" && s.overlayAudioUrl) {
    if (overlayEl.src !== location.origin + s.overlayAudioUrl && overlayEl.src !== s.overlayAudioUrl) {
      overlayEl.pause();
      overlayEl.removeAttribute("src");
      overlayEl.src = s.overlayAudioUrl;
      attachEnded(overlayEl, "overlay");
      try { await overlayEl.play().catch(()=>{}); } catch(_) {}
      overlayEl.pause();
    }
    overlayEl.volume = s.overlayAudioVolume ?? 1.0;

    if (s.overlayAudioNonce !== lastOverlayNonce) {
      overlayEl.currentTime = s.overlayAudioPosition || 0;
      lastOverlayNonce = s.overlayAudioNonce;
    }
    if (s.overlayAudioPlaying) {
      if (overlayEl.paused) { try { await overlayEl.play(); } catch(_) {} }
    } else {
      if (!overlayEl.paused) overlayEl.pause();
    }
  } else {
    // clear overlay if leaving image mode
    if (!overlayEl.paused) overlayEl.pause();
  }
}

async function loop() {
  try {
    const state = await fetchState();
    await applyState(state);
  } catch (e) {
    // ignore transient errors
  } finally {
    setTimeout(loop, 500);
  }
}
loop();
