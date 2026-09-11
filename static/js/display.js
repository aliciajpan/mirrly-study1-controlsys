async function fetchJSON(url) {
    const r=await fetch(url);return r.json();
}

function qs(s) {
    return document.querySelector(s);
} 

const VIDEO_EXT=['mp4','mov','webm'];
const AUDIO_EXT=['mp3','m4a','wav','ogg'];
const IMAGE_EXT=['png','jpg','jpeg'];

let userInteracted = false;
let sidebarOpen = false;
let countdownInterval = null;
let countdownDuration = 10;
let attemptStartTime = null; // get rxn time tracker directly from countdown bar to sync in logs
let isMuted = false;
let currentVolume = 1.0;

const disp = { // global display tracker
    playlist: null,
    state: null,
    renderedIndex: null,
    currentMediaEl: null,
    wasPaused: false
};

async function postState(body) {
    try {
        const server_resp = await fetch('/api/state',
            {   
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });

        disp.state = await server_resp.json(); // update global with new server state
    } 
    
    catch(e) {
        console.error("postState broke:", e)
    }
}

function ext(src) {
    const p=src.split('?')[0];const parts=p.split('.');return parts.length>1?parts.pop().toLowerCase():'';
}

function clearStage() {
    const st=qs('#stage');st.innerHTML='';disp.currentMediaEl=null;
}

function createElementForSource(src,kind) {
    const e=ext(src);
    if(VIDEO_EXT.includes(e)) {
        const v=document.createElement('video');
        v.src=`/static/${src}`;
        v.className='media';
        v.playsInline=true;
        v.controls=false;
        v.preload='auto';
        return v;
    } 
    if(AUDIO_EXT.includes(e)) {
        const a=document.createElement('audio');
        a.src=`/static/${src}`;
        a.className='media';
        a.preload='auto';
        a.controls=false;
        return a;
    } 
    if(kind==='image' || IMAGE_EXT.includes(e)) {
        const img=document.createElement('img');
        img.src=`/static/${src}`;
        img.className='media';
        return img;
    } // fallback paragraph

    const p=document.createElement('p');
    p.style.color='#fff';
    p.textContent=`Unsupported media: ${src}`;
    return p;
}

function attachEndedAdvance(el, section) {
    if (!el) return; 

    const advanceTypes=['video','audio','image+audio','audio-select']; 
    if (!advanceTypes.includes(section.type)) return; 

    if (section.type==='audio-select' && !disp.state.selection) return; 

    // audio ending on countdown is not adv condition!! only if user answers OR timer runs out!!
    if (section.id && section.id.includes('countdown')) {
        console.log("Audio track completed on a countdown screen. Ignoring auto-advance to protect timer.");
        return;
    }

    if (typeof el.addEventListener==='function') {
        el.addEventListener('ended', () => {
            if (section.auto_advance === false) {
                console.log("Auto advance disabled. Waiting for WoZ to proceed");
                return;
            }
            postState({command:'next'});
        });
    }
}

function attemptPlay(element) {
    if (!element || typeof element.play !== 'function') return;
    if (!userInteracted) {
        console.log("Audio/Video playback deferred: waiting for initial user overlay interaction.");
        return;
    }

    // preserve sidebar volume & mute settings
    element.muted = isMuted;
    element.volume = currentVolume;

    element.play().catch(err => {
        console.warn("Playback failed or was blocked by browser autoplay rules:", err);
    });
}

// helper function for playSection, handles retry logic
async function handleAnswerSubmission(chosenSide) {
    clearInterval(countdownInterval);

    // --- Floating Debug Timer ---
    // hide when answer tapped
    const debugTimerEl = qs('#debug-reaction-timer');
    if (debugTimerEl) debugTimerEl.style.display = 'none';
    // ----------------------------

    const reactionTime = attemptStartTime ? (Date.now() - attemptStartTime) / 1000 : 0.0000;
    
    attemptStartTime = null; // reset   
    
    const tapOverlay = document.getElementById('dynamic-tap-overlay');
    if (tapOverlay) tapOverlay.remove();

    try {
        const response = await fetch('/api/submit_answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                side: chosenSide,
                reaction_time_s: parseFloat(reactionTime.toPrecision(4))
            })
        });
        
        const data = await response.json();

        // if the answer wrong and tries remain, play retry audio
        if (data.action === 'retry' && data.selection && data.selection.src) {
            const retryAudio = new Audio(`/static/${data.selection.src}`);
            disp.currentMediaEl = retryAudio;
            
            retryAudio.play().catch(err => console.warn("Playback blocked:", err));

            // once Mirrly done speaking, restart round attempt
            retryAudio.addEventListener('ended', () => {
                const currentSec = disp.playlist.sections[disp.state.index];
                playSection(currentSec);
            });
        }
        // if data.action === 'advance', poll() will detect the new index and advance on its own
    } catch (err) {
        console.error("Error submitting answer:", err);
    }
}

function playSection(section){
    clearInterval(countdownInterval);
    if (qs('#timer-bar-container')) qs('#timer-bar-container').style.display = 'none';
    if (qs('#ui-overlay')) qs('#ui-overlay').innerHTML = '';
    const oldBtn = qs('.nav-next-btn');
    if (oldBtn) {
        oldBtn.remove();
    }
    
    clearStage();
	const st=qs('#stage');

	if(section.type==='video') {
		const v=createElementForSource(section.src,'video');
		st.appendChild(v);
		disp.currentMediaEl=v;
		attachEndedAdvance(v,section);
	} 
    
    else if(section.type==='audio') {
		const a=createElementForSource(section.src,'audio');
		st.appendChild(a);
		disp.currentMediaEl=a;
		attachEndedAdvance(a,section);
	} 
    
    else if(section.type==='image') {
		const img=createElementForSource(section.src,'image');
		st.appendChild(img);
	} 
    
    else if(section.type==='image+audio') {
		const img=createElementForSource(section.src,'image');
		st.appendChild(img);
		const a=createElementForSource(section.audio,'audio');
		a.style.display = 'none'; // hide audio element
		st.appendChild(a);
		disp.currentMediaEl=a;
		attachEndedAdvance(a,section);

        if (section.id.includes('countdown')) {
			startCountdownBar(countdownDuration);  

            // clear the stage
            const oldTapOverlay = document.getElementById('dynamic-tap-overlay');
            if (oldTapOverlay) oldTapOverlay.remove();

            // new overlay
            const tapOverlay = document.createElement('div');
            tapOverlay.id = 'dynamic-tap-overlay';

            // hardcode LS/RS hitboxes
            Object.assign(tapOverlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                zIndex: '999999',
                pointerEvents: 'auto',
                display: 'flex',
                margin: '0',
                padding: '0',
                boxSizing: 'border-box'
            });

            // temp: coloured for visual position check !!
            tapOverlay.innerHTML = `
                <div id="left-touch-zone" style="flex: 1 !important; height: 100% !important; cursor: pointer; background: rgba(255, 0, 0, 0.4) !important; border: 5px solid red !important; box-sizing: border-box !important;"></div>
                <div id="right-touch-zone" style="flex: 1 !important; height: 100% !important; cursor: pointer; background: rgba(0, 0, 255, 0.4) !important; border: 5px solid blue !important; box-sizing: border-box !important;"></div>
            `;

            document.body.appendChild(tapOverlay);

            document.getElementById('left-touch-zone').addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("User answer input detected: LEFT SIDE (LS)");

                handleAnswerSubmission("LS");
            });

            document.getElementById('right-touch-zone').addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("User answer input detected: RIGHT SIDE (RS)");

                handleAnswerSubmission("RS");
            });
		}

        if (section.id.includes('answer')) {  
            const nextBtn = document.createElement('button');
            nextBtn.className = 'nav-next-btn';
            nextBtn.innerHTML = 'Next Round ➔';
            
            nextBtn.addEventListener('click', () => {
                nextBtn.remove();
                postState({ command: 'next' });
            });
            
            document.body.appendChild(nextBtn);
        }
	} 
    
    else if(section.type==='audio-select') {
		if(section.backgroundSrc) {
			const img=createElementForSource(section.backgroundSrc,'image');
			st.appendChild(img);
		}
		if(disp.state.selection) {
			const chosen=createElementForSource(disp.state.selection.src,'audio');
			chosen.style.display = 'none'; // hide audio element
			st.appendChild(chosen);
			disp.currentMediaEl=chosen;
			attachEndedAdvance(chosen,section);
		}
	} 

    else if (section.type === 'dual-camera') {
        const MIRRLY_CAM_IP = (disp.state && disp.state.robot_ip) ? disp.state.robot_ip : "192.168.0.110";

        const container = document.createElement('div');
        container.id = 'dual-camera-stage';
        Object.assign(container.style, {
            display: 'flex',
            width: '100vw',
            height: '100vh',
            position: 'fixed',
            inset: '0',
            backgroundColor: '#000',
            zIndex: '50'
        });

        container.innerHTML = `
            <div style="flex: 1; height: 100%; position: relative; overflow: hidden; border-right: 2px solid #333;">
                <img id="cam-left-feed" src="http://${MIRRLY_CAM_IP}:5002/video_feed/left" style="width: 100%; height: 100%; object-fit: cover; transition: filter 0.3s ease-in-out;" />
                <span style="position: absolute; top: 20px; left: 24px; background: rgba(0,0,0,0.65); color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 1.1rem; font-weight: 600; pointer-events: none;">Left Eye (Mirrly's POV)</span>
            </div>
            <div style="flex: 1; height: 100%; position: relative; overflow: hidden;">
                <img id="cam-right-feed" src="http://${MIRRLY_CAM_IP}:5002/video_feed/right" style="width: 100%; height: 100%; object-fit: cover; transition: filter 0.3s ease-in-out;" />
                <span style="position: absolute; top: 20px; right: 24px; background: rgba(0,0,0,0.65); color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 1.1rem; font-weight: 600; pointer-events: none;">Right Eye (Mirrly's POV)</span>
            </div>

            <!-- Floating On-Screen Blur Controls -->
            <div id="display-blur-pill" style="
                position: absolute;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 12px;
                background: rgba(15, 15, 23, 0.85);
                backdrop-filter: blur(8px);
                padding: 10px 18px;
                border-radius: 30px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                z-index: 100;
            ">
                <button id="disp-blur-none" style="padding: 10px 20px; font-size: 1rem; border-radius: 20px; border: none; cursor: pointer; background: #3b4252; color: #fff; font-weight: 600;">Clear Blur</button>
                <button id="disp-blur-left" style="padding: 10px 20px; font-size: 1rem; border-radius: 20px; border: none; cursor: pointer; background: #5e81ac; color: #fff; font-weight: 600;">Blur Left Eye</button>
                <button id="disp-blur-right" style="padding: 10px 20px; font-size: 1rem; border-radius: 20px; border: none; cursor: pointer; background: #5e81ac; color: #fff; font-weight: 600;">Blur Right Eye</button>
            </div>
        `;

        st.appendChild(container);

        // qs('#disp-blur-none').addEventListener('click', () => postState({ blur_side: 'none' }));
        // qs('#disp-blur-left').addEventListener('click', () => postState({ blur_side: 'left' }));
        // qs('#disp-blur-right').addEventListener('click', () => postState({ blur_side: 'right' }));

        // # TODO: Test this change 
        qs('#disp-blur-none').addEventListener('click', () => {
            applyCameraBlur('none');
            postState({ blur_side: 'none' });
        });
        qs('#disp-blur-left').addEventListener('click', () => {
            applyCameraBlur('left');
            postState({ blur_side: 'left' });
        });
        qs('#disp-blur-right').addEventListener('click', () => {
            applyCameraBlur('right');
            postState({ blur_side: 'right' });
        });

        // apply whatever blur mode is stored in global state
        applyCameraBlur(disp.state ? disp.state.blur_side : 'none');
    }
    
    else {
		const p=document.createElement('p');
		p.style.color='#fff';
		p.textContent=`Unknown section type ${section.type}`;
		st.appendChild(p);
	}

    if (disp.currentMediaEl) {
        setTimeout(() => {
            attemptPlay(disp.currentMediaEl);
        }, 250);
    }
	
	// trigger robot gesture for this section
	if(disp.state.robot_status!=='disconnected'){postState({command:'gesture'});}
}

function applyPauseState(){
	const playPauseBtn = qs('#disp-btn-play-pause');
    if (playPauseBtn && disp.state) {
        playPauseBtn.textContent = disp.state.paused ? '▶ Play' : '⏸ Pause';
        playPauseBtn.style.background = disp.state.paused ? '#a3be8c' : '#4c566a';
    }

    if(!disp.currentMediaEl) return;
    if(disp.state.paused) {
        if(typeof disp.currentMediaEl.pause==='function') disp.currentMediaEl.pause();
        disp.wasPaused = true;
    } 
    
    else {
        if(disp.wasPaused && disp.currentMediaEl.ended){
            disp.wasPaused = false;
            attemptPlay(disp.currentMediaEl);
        }
    }
}

function applyCameraBlur(blurSide) { // helper function used in poll()
    const leftCam = qs('#cam-left-feed');
    const rightCam = qs('#cam-right-feed');
    if (!leftCam || !rightCam) return;

    // reset filters
    leftCam.style.filter = 'none';
    rightCam.style.filter = 'none';

    const BLUR = 'blur(32px) contrast(0.9) brightness(0.9)';

    if (blurSide === 'left' || blurSide === 'LS') {
        leftCam.style.filter = BLUR;
    } else if (blurSide === 'right' || blurSide === 'RS') {
        rightCam.style.filter = BLUR;
    }

    // highlight which blur button applied
    const btnNone = qs('#disp-blur-none');
    const btnLeft = qs('#disp-blur-left');
    const btnRight = qs('#disp-blur-right');

    if (btnNone && btnLeft && btnRight) {
        btnNone.style.background = blurSide === 'none' ? '#a3be8c' : '#3b4252';
        btnLeft.style.background = (blurSide === 'left' || blurSide === 'LS') ? '#bf616a' : '#5e81ac';
        btnRight.style.background = (blurSide === 'right' || blurSide === 'RS') ? '#bf616a' : '#5e81ac';
    }
}

async function poll() {
    disp.state=await fetchJSON('/api/state'); // get global state

    if(!disp.playlist) { // ensure have playlist
        disp.playlist=await fetchJSON('/api/playlist');
    }

    if(disp.state.index!==disp.renderedIndex) { // index actually changed
        disp.renderedIndex=disp.state.index;
        disp.wasPaused=false;
        playSection(disp.playlist.sections[disp.state.index]);
    } 

    else { // same index, DO NOT LOOP playSection() here!!
        const section=disp.playlist.sections[disp.state.index];
        // const hasMedia = st.querySelector('audio') || st.querySelector('video'); // audio or video currently playing?
        // const hasMedia = !!disp.currentMediaEl; // when poll checks this during countdown, allegedly this wasn't being updated properly...?

        if(section.type==='audio-select' && disp.state.selection && !disp.currentMediaEl && !disp.wasPaused) {
                playSection(section);
        }

        if (disp.playlist && disp.playlist.sections[disp.state.index].type === 'dual-camera') {
            applyCameraBlur(disp.state.blur_side);
        }
    } 
    
    applyPauseState();
    updateRobotStatusDisplay();
}

function setupSessionModal() {
    const modal = qs('#session-modal-overlay');
    const input = qs('#modalPidInput');
    const errorEl = qs('#modalPidError');
    const startBtn = qs('#btnModalStart');
    const randBtn = qs('#btnModalRandom');

    if (!modal || !input || !startBtn) return;

    // clear error message when user types
    input.addEventListener('input', () => {
        if (errorEl) errorEl.style.display = 'none';
        input.style.border = '1px solid #7c6fa6';
    });

    if (randBtn) {
        randBtn.addEventListener('click', () => {
            input.value = `P-${Math.floor(1000 + Math.random() * 9000)}`;
            if (errorEl) errorEl.style.display = 'none';
            input.style.border = '1px solid #7c6fa6';
            input.focus();
        });
    }

    async function commitAndStart() {
        const pid = input.value.trim();

        // stop execution if empty + show error
        if (!pid) {
            if (errorEl) errorEl.style.display = 'block';
            input.style.border = '2px solid #ef4444';
            input.focus();
            return;
        }
        
        // send ID to flask backend
        try {
            await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ PID: pid })
            });
        } catch (e) {
            console.error("Failed to set session ID:", e);
        }

        // unblock audio + start playback
        userInteracted = true;
        modal.remove();

        await postState({ command: 'play' });
        attemptPlay(disp.currentMediaEl);
    }

    startBtn.addEventListener('click', commitAndStart);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // commitAndStart(); // MUST press on-screen button to proceed, not ENTER (less risky to accidentally start)
        }
    });
}

async function init(){
	// always start paused
	await postState({command:'pause'});
    setupSidebarControls();
    setupDisplayMediaControls();
    disp.playlist = await fetchJSON('/api/playlist');
	await poll();
    renderSidebarSections();
    setupSessionModal();
	setInterval(poll,1000); // check every 1000 ms
}

function setupSidebarControls() {
    const toggleBtn = qs('#menu-toggle');
    const sidebar = qs('#control-sidebar');
    const bottomControls = qs('#sidebar-bottom-controls');
    
    toggleBtn?.addEventListener('click', (e) => { // ? checks for existence 
        e.stopPropagation();
        sidebarOpen = !sidebarOpen;
        if (sidebarOpen) {
            sidebar.classList.add('open');
            toggleBtn.textContent = 'Close';
        } else {
            sidebar.classList.remove('open');
            toggleBtn.textContent = '☰';
        }
    });

    bottomControls?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    sidebar?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // close the drawer if a user taps anywhere out on the main stage
    qs('#stage')?.addEventListener('click', () => {
        if (sidebarOpen) {
            sidebarOpen = false;
            sidebar.classList.remove('open');
            toggleBtn.textContent = '☰';
        }
    });
}

function setupDisplayMediaControls() {
    const playPauseBtn = qs('#disp-btn-play-pause');
    const muteBtn = qs('#disp-btn-mute');
    const volumeSlider = qs('#disp-volume-slider');

    playPauseBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!disp.state) return;
        if (disp.state.paused) {
            await postState({ command: 'play' });
        } else {
            await postState({ command: 'pause' });
        }
    });

    muteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        isMuted = !isMuted;
        if (disp.currentMediaEl) {
            disp.currentMediaEl.muted = isMuted;
        }
        muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
        muteBtn.style.background = isMuted ? '#bf616a' : '#4c566a';
    });

    volumeSlider?.addEventListener('input', (e) => {
        e.stopPropagation();
        currentVolume = parseFloat(e.target.value);
        if (disp.currentMediaEl) {
            disp.currentMediaEl.volume = currentVolume;
            if (currentVolume === 0) {
                disp.currentMediaEl.muted = true;
                if (muteBtn) muteBtn.textContent = 'Unmute';
            } else if (isMuted) {
                isMuted = false;
                disp.currentMediaEl.muted = false;
                if (muteBtn) muteBtn.textContent = 'Mute';
            }
        }
    });
}

function renderSidebarSections() {
    if (!disp.playlist) return;
    
    const list = qs('#sectionList');
    list.innerHTML = '';
    
    disp.playlist.sections.forEach((s, i) => {
        const li = document.createElement('li');
        
        li.textContent = `${i + 1}. ${s.title || s.id}`;
        
        if (i === disp.state.index) {
            li.className = 'active';
        }
        
        li.addEventListener('click', async () => {
            await postState({ index: i, command: 'play' });
            sidebarOpen = false;
            qs('#control-sidebar')?.classList.remove('open');
            const toggleBtn = qs('#menu-toggle');
            if (toggleBtn) toggleBtn.textContent = '☰';
        });
        
        list.appendChild(li);
    });

    const activeItem = list.querySelector('li.active');
        if (activeItem && disp.renderedIndex !== disp.state.index) {
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
}

function updateRobotStatusDisplay() {
    const statusEl = qs('#robotStatus');
    if (!statusEl || !disp.state) return;

    if (disp.state.robot_status === 'connected') {
        statusEl.textContent = 'Robot Connected';
        statusEl.style.color = '#4ade80';
    } else {
        statusEl.textContent = 'Robot Disconnected';
        statusEl.style.color = '#ef4444';
    }
}

function startCountdownBar(sec) {
    clearInterval(countdownInterval);
    attemptStartTime = Date.now();
    
    const container = qs('#timer-bar-container');
    const bar = qs('#timer-bar');
    
    if (!container || !bar) return;

    container.style.display = 'block';
    bar.style.width = '100%';

    // --- Floating Debug Timer ---
    let debugTimerEl = qs('#debug-reaction-timer');
    if (!debugTimerEl) {
        debugTimerEl = document.createElement('div');
        debugTimerEl.id = 'debug-reaction-timer';
        Object.assign(debugTimerEl.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.75)',
            color: '#4ade80',
            fontFamily: 'monospace',
            fontSize: '1.5rem',
            padding: '8px 14px',
            borderRadius: '8px',
            zIndex: '10000000',
            pointerEvents: 'none'
        });
        document.body.appendChild(debugTimerEl);
    }
    debugTimerEl.style.display = 'block';
    debugTimerEl.textContent = '0.0000 s';
    // ----------------------------
    
    const totalMs = sec * 1000;
    let elapsedMs = 0;
    const updateRateMs = 100; // update every 100ms for smoothness
    
    countdownInterval = setInterval(() => {
        elapsedMs += updateRateMs;

        // --- Floating Debug Timer ---
        const currentSeconds = (Date.now() - attemptStartTime) / 1000;
        
        // update live reaction time display
        if (debugTimerEl) {
            debugTimerEl.textContent = `${currentSeconds.toPrecision(4)} s`;
        }
        // ----------------------------

        const percentageLeft = Math.max(0, 100 - (elapsedMs / totalMs) * 100);
        
        bar.style.width = `${percentageLeft}%`;
        
        if (elapsedMs >= totalMs) {
            container.style.display = 'none'; // hide bar when round ends
            handleAnswerSubmission("TIMEOUT");
        }
    }, updateRateMs);
}

document.addEventListener('DOMContentLoaded',init);