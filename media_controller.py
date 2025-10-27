import threading
import time
from typing import Optional

try:
    import vlc  # system player optional
except Exception:
    vlc = None

class SystemVLCController:
    """
    Controls a local system player via python-vlc.
    All methods are idempotent and safe to call from any thread.
    """
    def __init__(self):
        if vlc is None:
            raise RuntimeError("python-vlc not available or VLC not installed.")
        self._instance = vlc.Instance()
        self._player = self._instance.media_player_new()
        self._lock = threading.Lock()

    def load(self, url_or_path: str, autoplay: bool = False):
        with self._lock:
            media = self._instance.media_new(url_or_path)
            self._player.set_media(media)
            if autoplay:
                self._player.play()

    def play(self):
        with self._lock:
            self._player.play()

    def pause(self):
        with self._lock:
            self._player.pause()

    def stop(self):
        with self._lock:
            self._player.stop()

    def seek_seconds(self, t: float):
        """Seek to t seconds."""
        with self._lock:
            length_ms = self._player.get_length()
            if length_ms <= 0:
                return
            target_ms = int(t * 1000)
            target_ms = max(0, min(target_ms, length_ms))
            self._player.set_time(target_ms)

    def get_status(self):
        with self._lock:
            pos_ms = self._player.get_time()
            length_ms = self._player.get_length()
            state = str(self._player.get_state())
            return {
                "position": max(0.0, pos_ms / 1000.0) if pos_ms >= 0 else 0.0,
                "duration": max(0.0, length_ms / 1000.0) if length_ms > 0 else None,
                "state": state,
            }


class BrowserBroadcaster:
    """
    Broadcasts play/pause/seek/load to all connected browsers via Socket.IO.
    """
    def __init__(self, socketio):
        self.socketio = socketio

    def load(self, url: str, media_type: str = "video", autoplay: bool = True):
        self.socketio.emit("media:load", {
            "url": url,
            "mediaType": media_type,  # "video" or "audio"
            "autoplay": autoplay
        }, namespace="/ws", broadcast=True)

    def play(self):
        self.socketio.emit("media:play", {}, namespace="/ws", broadcast=True)

    def pause(self):
        self.socketio.emit("media:pause", {}, namespace="/ws", broadcast=True)

    def seek(self, seconds: float):
        self.socketio.emit("media:seek", {"time": float(seconds)}, namespace="/ws", broadcast=True)

    def beacon(self, payload: dict):
        # optional sync ticks to browsers
        self.socketio.emit("sync:beacon", payload, namespace="/ws", broadcast=True)


class DualController:
    """
    Fan-out to both: browser clients and optional system VLC player.
    Toggle either by passing vlc_controller=None, etc.
    """
    def __init__(self, browser: BrowserBroadcaster, vlc_controller: Optional[SystemVLCController] = None):
        self.browser = browser
        self.vlc = vlc_controller

    def load(self, url: str, media_type: str = "video", autoplay: bool = True):
        self.browser.load(url, media_type, autoplay)
        if self.vlc:
            self.vlc.load(url, autoplay=autoplay)

    def play(self):
        self.browser.play()
        if self.vlc:
            self.vlc.play()

    def pause(self):
        self.browser.pause()
        if self.vlc:
            self.vlc.pause()

    def seek(self, seconds: float):
        self.browser.seek(seconds)
        if self.vlc:
            self.vlc.seek_seconds(seconds)

    def status(self):
        if self.vlc:
            return self.vlc.get_status()
        return {"position": None, "duration": None, "state": "BROWSER_ONLY"}
