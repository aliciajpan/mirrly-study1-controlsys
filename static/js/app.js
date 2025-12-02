async function fetchJSON(url) {
  const r = await fetch(url);
  return r.json();
}

function qs(sel) { return document.querySelector(sel); }

const state = {
  playlist: null,
  index: 0,
  paused: false,
  currentMediaEl: null,
};

function robot(action, payload) {
  return fetch('/api/robot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  }).catch(() => {});
}

function renderSectionList() {
  const list = qs('#sectionList');
  list.innerHTML = '';
  state.playlist.sections.forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = `${i+1}. ${s.title || s.id} (${s.type})`;
    li.className = i === state.index ? 'active' : '';
    li.addEventListener('click', () => { goTo(i); });
    list.appendChild(li);
  });
}

function clearPlayer() {
  const player = qs('#player');
  player.innerHTML = '';
  state.currentMediaEl = null;
}

function applyRobotHook(hook, section) {
  if (!section.robot || !section.robot[hook]) return;
  robot(section.robot[hook], { id: section.id, type: section.type });
}

function playSection(section) {
  clearPlayer();
  const player = qs('#player');
  applyRobotHook('onStart', section);

  if (section.type === 'video') {
    const video = document.createElement('video');
    video.src = `/static/${section.src}`;
    video.controls = true;
    video.autoplay = true;
    video.className = 'media';
    video.addEventListener('ended', () => applyRobotHook('onEnd', section));
    player.appendChild(video);
    state.currentMediaEl = video;
  } else if (section.type === 'audio') {
    const audio = document.createElement('audio');
    audio.src = `/static/${section.src}`;
    audio.controls = true;
    audio.autoplay = true;
    audio.className = 'media';
    audio.addEventListener('ended', () => applyRobotHook('onEnd', section));
    player.appendChild(audio);
    state.currentMediaEl = audio;
  } else if (section.type === 'image') {
    const img = document.createElement('img');
    img.src = `/static/${section.src}`;
    img.className = 'media';
    player.appendChild(img);
  } else if (section.type === 'image+audio') {
    const img = document.createElement('img');
    img.src = `/static/${section.src}`;
    img.className = 'media';
    const audio = document.createElement('audio');
    audio.src = `/static/${section.audio}`;
    audio.controls = true;
    audio.autoplay = true;
    audio.className = 'media';
    audio.addEventListener('ended', () => applyRobotHook('onEnd', section));
    player.appendChild(img);
    player.appendChild(audio);
    state.currentMediaEl = audio;
  } else if (section.type === 'audio-select') {
    const wrapper = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = section.title || 'Select response audio';
    wrapper.appendChild(title);

    const list = document.createElement('div');
    list.className = 'audio-list';

    (section.options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt.label || opt.src;
      btn.addEventListener('click', () => {
        const audio = document.createElement('audio');
        audio.src = `/static/${opt.src}`;
        audio.controls = true;
        audio.autoplay = true;
        audio.className = 'media';
        audio.addEventListener('ended', () => applyRobotHook('onEnd', section));
        // replace existing audio if any
        const existing = wrapper.querySelector('audio');
        if (existing) existing.remove();
        wrapper.appendChild(audio);
        state.currentMediaEl = audio;
        robot('audio_selected', { id: section.id, src: opt.src });
      });
      list.appendChild(btn);
    });

    wrapper.appendChild(list);
    player.appendChild(wrapper);
  } else {
    const p = document.createElement('p');
    p.textContent = `Unknown section type: ${section.type}`;
    player.appendChild(p);
  }
}

function goTo(i) {
  state.index = Math.max(0, Math.min(i, state.playlist.sections.length-1));
  renderSectionList();
  playSection(state.playlist.sections[state.index]);
}

function pause() {
  state.paused = true;
  const el = state.currentMediaEl;
  if (el && typeof el.pause === 'function') el.pause();
}

function play() {
  state.paused = false;
  const el = state.currentMediaEl;
  if (el && typeof el.play === 'function') el.play();
}

function next() { goTo(state.index + 1); }
function prev() { goTo(state.index - 1); }

function setupControls() {
  qs('#btnPrev').addEventListener('click', prev);
  qs('#btnPause').addEventListener('click', pause);
  qs('#btnPlay').addEventListener('click', play);
  qs('#btnNext').addEventListener('click', next);
  qs('#btnFullscreen').addEventListener('click', () => {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen().catch(() => {});
    }
  });
}

async function init() {
  setupControls();
  state.playlist = await fetchJSON('/api/playlist');
  renderSectionList();
  goTo(0);
}

window.addEventListener('DOMContentLoaded', init);
