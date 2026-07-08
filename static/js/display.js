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
    element.play().catch(err => {
        console.warn("Playback failed or was blocked by browser autoplay rules:", err);
    });
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

            // invisible hitboxes for user to tap an ans for game
            const overlay = qs('#ui-overlay');

            overlay.innerHTML = `
                <div style="position: fixed; inset: 0; display: flex; z-index: 99999;">
                    <div id="left-touch-zone" style="flex: 1; height: 100%; cursor: pointer; background: rgba(0,0,0,0.01);"></div>
                    <div id="right-touch-zone" style="flex: 1; height: 100%; cursor: pointer; background: rgba(0,0,0,0.01);"></div>
                </div>
            `;

            qs('#left-touch-zone').addEventListener('click', async () => {
                console.log("Tablet Input Captured: LEFT SIDE (LS)");
                overlay.innerHTML = ''; // clear hitboxes to prevent double taps
                clearInterval(countdownInterval); // stop countdown bar
                
                await fetch('/api/submit_answer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ side: "LS" })
                });
            });

            qs('#right-touch-zone').addEventListener('click', async () => {
                console.log("Tablet Input Captured: RIGHT SIDE (RS)");
                overlay.innerHTML = ''; 
                clearInterval(countdownInterval); 
                
                await fetch('/api/submit_answer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ side: "RS" })
                });
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
    
    else {
		const p=document.createElement('p');
		p.style.color='#fff';
		p.textContent=`Unknown section type ${section.type}`;
		st.appendChild(p);
	}

    setTimeout(() => {
        attemptPlay(disp.currentMediaEl);
    }, 250)
	
	// trigger robot gesture for this section
	if(disp.state.robot_status!=='disconnected'){postState({command:'gesture'});}
}

function applyPauseState(){
	if(!disp.currentMediaEl)return;
	if(disp.state.paused){
		if(typeof disp.currentMediaEl.pause==='function')disp.currentMediaEl.pause();
		disp.wasPaused = true;
	} else {
		// only reset to beginning if transitioning from paused to playing (restart)
		if(disp.wasPaused && disp.currentMediaEl.currentTime !== undefined){
			disp.currentMediaEl.currentTime = 0;
			disp.wasPaused = false;
		}
		attemptPlay(disp.currentMediaEl);
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

    else { // same index
        const section=disp.playlist.sections[disp.state.index];
        const st = qs('#stage');
        const hasMedia = st.querySelector('audio') || st.querySelector('video'); // audio or video currently playing?

        if(section.type==='audio-select' && disp.state.selection) { // mirrly supposed to say smth + rxn chosen
            if (!hasMedia) {
                playSection(section);
            } 
        }

        else if (section.id.includes('countdown') && !hasMedia) {
            console.log("Poll loop recovery: Forcing initialization of frozen countdown step"); // debugging
            playSection(section);
        }
    } 
    
    applyPauseState();
    updateRobotStatusDisplay();
}

function addInteractionOverlay() {
    const st=qs('#stage');
    const ov=document.createElement('div');
    ov.id='interactionOverlay';
    ov.style.position='fixed';
    ov.style.inset='0';
    ov.style.display='flex';
    ov.style.alignItems='center';
    ov.style.justifyContent='center';
    ov.style.background='rgba(0,0,0,0.85)';
    ov.style.color='#fff';
    ov.style.fontSize='2.5rem';
    ov.style.fontFamily='system-ui';
    ov.style.cursor='pointer';
    ov.textContent='Click to Start';
    ov.addEventListener('click', async () => {
        userInteracted = true;
        ov.remove();

        // if(!document.fullscreenElement) {
        //     document.documentElement.requestFullscreen().catch(()=>{});
        // } 
        
        await postState({command: 'play'});

        attemptPlay(disp.currentMediaEl);
    });
    st.appendChild(ov);
}

async function init(){
	// always start paused
	await postState({command:'pause'});
    setupSidebarControls();
    disp.playlist = await fetchJSON('/api/playlist');
	await poll();
    renderSidebarSections();
	addInteractionOverlay();
	setInterval(poll,1000); // check every 1000 ms
}

function setupSidebarControls() {
    const toggleBtn = qs('#menu-toggle');
    const sidebar = qs('#control-sidebar');
    
    toggleBtn.addEventListener('click', (e) => {
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

    // close the drawer if a user taps anywhere out on the main stage
    qs('#stage').addEventListener('click', () => {
        if (sidebarOpen) {
            sidebarOpen = false;
            sidebar.classList.remove('open');
            toggleBtn.textContent = '☰';
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
            // close panel after selecting an index to clear the screen area ?
            document.getElementById('menu-toggle').click();
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
    
    const container = qs('#timer-bar-container');
    const bar = qs('#timer-bar');
    
    if (!container || !bar) return;

    container.style.display = 'block';
    bar.style.width = '100%';
    
    const totalMs = sec * 1000;
    let elapsedMs = 0;
    const updateRateMs = 100; // update every 100ms for smoothness
    
    countdownInterval = setInterval(() => {
        elapsedMs += updateRateMs;
        const percentageLeft = Math.max(0, 100 - (elapsedMs / totalMs) * 100);
        
        bar.style.width = `${percentageLeft}%`;
        
        if (elapsedMs >= totalMs) {
            clearInterval(countdownInterval);
            container.style.display = 'none'; // hide bar when round ends
            // automatically push step forward once the countdown runs out ?? ** maybe change this mechanism
            postState({command: 'next'});
        }
    }, updateRateMs);
}

document.addEventListener('DOMContentLoaded',init);