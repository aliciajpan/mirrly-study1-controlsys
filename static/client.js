// client.js (HTTP/REST version, no websockets)
(function () {
  const statusEl = document.getElementById("conn");
  const nowEl = document.getElementById("now");

  const video = document.getElementById("video");
  const audio = document.getElementById("audio");
  const mediaUrlEl = document.getElementById("media-url");
  const mediaTypeEl = document.getElementById("media-type");

  const btnLoad = document.getElementById("btn-load");
  const btnPlay = document.getElementById("btn-play");
  const btnPause = document.getElementById("btn-pause");
  const seekSecondsEl = document.getElementById("seek-seconds");
  const btnSeek = document.getElementById("btn-seek");

  // ---- config ----
  const API_BASE = ""; // same origin. If server differs: "http://host:5000"
  const HEADERS = { "Content-Type": "application/json" };
  // If you add a token on the server, include: HEADERS.Authorization = "Bearer <token>";

  let currentType = mediaTypeEl.value;

  function pickEl() {
    return currentType === "audio" ? audio : video;
  }
  function showOnly(type) {
    currentType = type;
    audio.style.display = type === "audio" ? "block" : "none";
    video.style.display = type === "video" ? "block" : "none";
  }

  async function postJSON(path, body) {
    const res = await fetch(API_BASE + path, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json().catch(() => ({}));
  }
  async function getJSON(path) {
    const res = await fetch(API_BASE + path, { headers: HEADERS });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
  }

  // ---- UI wire-up (HTTP calls + local player control) ----
  btnLoad.onclick = async () => {
    const url = mediaUrlEl.value.trim();
    const mediaType = mediaTypeEl.value;
    if (!url) return;

    // 1) Update local browser player
    showOnly(mediaType);
    const el = pickEl();
    el.src = url;
    el.load();
    el.play().catch((e) => console.warn("Autoplay blocked locally:", e));

    // 2) Tell server to "load" (so system player mirrors if enabled)
    try {
      await postJSON("/api/load", { url, type: mediaType, autoplay: true });
      setStatus("Loaded (browser + server)");
    } catch (e) {
      setStatus("Load failed on server (browser ok)");
      console.error(e);
    }
  };

  btnPlay.onclick = async () => {
    // Local
    pickEl().play().catch((e) => console.warn("Play error:", e));
    // Server
    try {
      await postJSON("/api/play");
      setStatus("Playing (browser + server)");
    } catch (e) {
      setStatus("Play: server failed (browser ok)");
      console.error(e);
    }
  };

  btnPause.onclick = async () => {
    // Local
    pickEl().pause();
    // Server
    try {
      await postJSON("/api/pause");
      setStatus("Paused (browser + server)");
    } catch (e) {
      setStatus("Pause: server failed (browser ok)");
      console.error(e);
    }
  };

  btnSeek.onclick = async () => {
    const t = parseFloat(seekSecondsEl.value || "0");
    const seconds = Number.isFinite(t) ? t : 0;

    // Local
    try {
      pickEl().currentTime = seconds;
    } catch (e) {
      console.warn("Local seek failed:", e);
    }

    // Server
    try {
      await postJSON("/api/seek", { time: seconds });
      setStatus(`Seeked to ${seconds}s`);
    } catch (e) {
      setStatus("Seek: server failed (browser ok)");
      console.error(e);
    }
  };

  // ---- lightweight status loop (HTTP) ----
  async function pingServer() {
    try {
      const st = await getJSON("/api/status"); // returns VLC/system status if enabled
      const pos = st.position != null ? `${st.position.toFixed(1)}s` : "—";
      const dur = st.duration != null ? `${st.duration.toFixed(1)}s` : "—";
      setStatus(`Server OK · state=${st.state || "?"} · pos=${pos} / ${dur}`);
    } catch {
      setStatus("Server unreachable");
    }
  }

  function setStatus(txt) {
    statusEl.textContent = txt;
  }

  // show local time (since we no longer get WS beacons)
  setInterval(() => {
    nowEl.textContent = new Date().toLocaleTimeString();
  }, 500);

  // poll server status periodically (optional)
  setStatus("Initializing…");
  pingServer();
  setInterval(pingServer, 3000);
})();
