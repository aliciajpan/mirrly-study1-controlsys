(function () {
  const socket = io("/ws", { transports: ["websocket"] });
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

  let currentType = mediaTypeEl.value;

  function pickEl() {
    return currentType === "audio" ? audio : video;
  }
  function showOnly(type) {
    currentType = type;
    audio.style.display = type === "audio" ? "block" : "none";
    video.style.display = type === "video" ? "block" : "none";
  }

  // UI wire-up
  btnLoad.onclick = () => {
    const url = mediaUrlEl.value.trim();
    const mediaType = mediaTypeEl.value;
    socket.emit("media:load", { url, mediaType, autoplay: true });
  };
  btnPlay.onclick = () => socket.emit("media:play", {});
  btnPause.onclick = () => socket.emit("media:pause", {});
  btnSeek.onclick = () => {
    const t = parseFloat(seekSecondsEl.value || "0");
    socket.emit("media:seek", { time: isFinite(t) ? t : 0 });
  };

  // Socket status
  socket.on("connect", () => (statusEl.textContent = "Connected"));
  socket.on("disconnect", () => (statusEl.textContent = "Disconnected"));
  socket.on("server:hello", (p) => console.log("hello", p));

  // Server → Browser player commands
  socket.on("media:load", ({ url, mediaType, autoplay }) => {
    showOnly(mediaType);
    const el = pickEl();
    el.src = url;
    el.load();
    if (autoplay) {
      el.play().catch((e) => console.warn("Autoplay blocked:", e));
    }
  });

  socket.on("media:play", () => {
    const el = pickEl();
    el.play().catch((e) => console.warn("Play error:", e));
  });

  socket.on("media:pause", () => {
    pickEl().pause();
  });

  socket.on("media:seek", ({ time }) => {
    const el = pickEl();
    try {
      el.currentTime = Number(time) || 0;
    } catch (e) {
      console.warn("Seek failed:", e);
    }
  });

  // Optional: sync beacon handler (for wall-clock coordination)
  socket.on("sync:beacon", (payload) => {
    nowEl.textContent = `Beacon ts=${payload.server_ts?.toFixed(3) || "?"}`;
    // Could align playback here using payloads like { target_time, media_pos }
  });
})();
