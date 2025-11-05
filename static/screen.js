const $ = (s) => document.querySelector(s);
const v = $("#v");
const a = $("#a");
const i = $("#i");
const dbg = $("#debug");

let lastUrl = null;
let lastType = null;
let lastPositionNonce = 0;

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

function showOnly(el) {
  [v, a, i].forEach(e => e.style.display = "none");
  el.style.display = "";
}

function attachProgress(el) {
  const report = () => {
    const cur = Number.isFinite(el.currentTime) ? el.currentTime : 0;
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    postProgress(cur, dur);
  };
  ["timeupdate","seeked","play","pause","loadedmetadata","durationchange"].forEach(ev => {
    el.addEventListener(ev, report);
  });
  // initial report too
  report();
}

async function applyState(s) {
  dbg.textContent = JSON.stringify(s, null, 2);

  const mediaChanged = (s.url !== lastUrl) || (s.type !== lastType);
  if (mediaChanged) {
    lastUrl = s.url; lastType = s.type;

    [v, a].forEach(e => { e.pause(); e.removeAttribute("src"); try { e.load(); } catch(_) {} });
    i.removeAttribute("src");

    if (!s.url) return;

    if (s.type === "video") {
      showOnly(v);
      v.src = s.url;
      try { await v.play().catch(()=>{}); } catch(_) {}
      v.pause();
      attachProgress(v); // <— IMPORTANT
    } else if (s.type === "audio") {
      showOnly(a);
      a.src = s.url;
      try { await a.play().catch(()=>{}); } catch(_) {}
      a.pause();
      attachProgress(a); // <— IMPORTANT
    } else if (s.type === "image") {
      showOnly(i);
      i.src = s.url;
      postProgress(0, 0); // images have no timeline
      return;
    }
  }

  // volume
  v.volume = a.volume = (s.volume ?? 1.0);

  // seek only on nonce change
  if ((s.type === "video" || s.type === "audio") && s.position_nonce !== lastPositionNonce) {
    const el = s.type === "video" ? v : a;
    el.currentTime = s.position || 0;
    lastPositionNonce = s.position_nonce;
  }

  // play/pause
  if (s.type === "video" || s.type === "audio") {
    const el = s.type === "video" ? v : a;
    if (s.isPlaying) {
      if (el.paused) { try { await el.play(); } catch(_) {} }
    } else {
      if (!el.paused) el.pause();
    }
    // periodic safety report (in case events are throttled)
    postProgress(el.currentTime || 0, Number.isFinite(el.duration) ? el.duration : 0);
  } else {
    postProgress(0, 0);
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
