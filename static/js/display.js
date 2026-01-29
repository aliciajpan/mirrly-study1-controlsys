async function fetchJSON(url){const r=await fetch(url);return r.json();}
function qs(s){return document.querySelector(s);} 

const VIDEO_EXT=['mp4','mov','webm'];
const AUDIO_EXT=['mp3','m4a','wav','ogg'];
const IMAGE_EXT=['png','jpg','jpeg'];
let userInteracted=false;

const disp={playlist:null,state:null,renderedIndex:null,currentMediaEl:null,wasPaused:false};
async function postState(body){try{await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch(e){}}

function ext(src){const p=src.split('?')[0];const parts=p.split('.');return parts.length>1?parts.pop().toLowerCase():'';}

function clearStage(){const st=qs('#stage');st.innerHTML='';disp.currentMediaEl=null;}

function createElementForSource(src,kind){const e=ext(src);if(VIDEO_EXT.includes(e)){const v=document.createElement('video');v.src=`/static/${src}`;v.className='media';v.playsInline=true;v.controls=false;v.preload='auto';return v;} if(AUDIO_EXT.includes(e)){const a=document.createElement('audio');a.src=`/static/${src}`;a.className='media';a.preload='auto';a.controls=false;return a;} if(kind==='image' || IMAGE_EXT.includes(e)){const img=document.createElement('img');img.src=`/static/${src}`;img.className='media';return img;} // fallback paragraph
const p=document.createElement('p');p.style.color='#fff';p.textContent=`Unsupported media: ${src}`;return p;}

function attemptPlay(el){if(!el) return; if(!userInteracted) return; if(el.ended) return; if(typeof el.play==='function'){const pr=el.play(); if(pr&&typeof pr.catch==='function'){pr.catch(()=>{});} }}

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

function playSection(section){
	clearStage();
	const st=qs('#stage');
	if(section.type==='video'){
		const v=createElementForSource(section.src,'video');
		st.appendChild(v);
		disp.currentMediaEl=v;
		attachEndedAdvance(v,section);
	} else if(section.type==='audio'){
		const a=createElementForSource(section.src,'audio');
		st.appendChild(a);
		disp.currentMediaEl=a;
		attachEndedAdvance(a,section);
	} else if(section.type==='image'){
		const img=createElementForSource(section.src,'image');
		st.appendChild(img);
	} else if(section.type==='image+audio'){
		const img=createElementForSource(section.src,'image');
		st.appendChild(img);
		const a=createElementForSource(section.audio,'audio');
		a.style.display = 'none'; // Hide audio element
		st.appendChild(a);
		disp.currentMediaEl=a;
		attachEndedAdvance(a,section);
	} else if(section.type==='audio-select'){
		if(section.backgroundSrc){
			const img=createElementForSource(section.backgroundSrc,'image');
			st.appendChild(img);
		}
		if(disp.state.selection){
			const chosen=createElementForSource(disp.state.selection.src,'audio');
			chosen.style.display = 'none'; // Hide audio element
			st.appendChild(chosen);
			disp.currentMediaEl=chosen;
			attachEndedAdvance(chosen,section);
		}
	} else {
		const p=document.createElement('p');
		p.style.color='#fff';
		p.textContent=`Unknown section type ${section.type}`;
		st.appendChild(p);
	}

    setTimeout(() => {
        attemptPlay(disp.currentMediaEl);
    }, 250)
	
	// Trigger robot gesture for this section
	if(disp.state.robot_status!=='disconnected'){postState({command:'gesture'});}
}

function applyPauseState(){
	if(!disp.currentMediaEl)return;
	if(disp.state.paused){
		if(typeof disp.currentMediaEl.pause==='function')disp.currentMediaEl.pause();
		disp.wasPaused = true;
	} else {
		// Only reset to beginning if transitioning from paused to playing (restart)
		if(disp.wasPaused && disp.currentMediaEl.currentTime !== undefined){
			disp.currentMediaEl.currentTime = 0;
			disp.wasPaused = false;
		}
		attemptPlay(disp.currentMediaEl);
	}
}

async function poll(){disp.state=await fetchJSON('/api/state');if(!disp.playlist)disp.playlist=await fetchJSON('/api/playlist');if(disp.state.index!==disp.renderedIndex){disp.renderedIndex=disp.state.index;disp.wasPaused=false;playSection(disp.playlist.sections[disp.state.index]);} else {const section=disp.playlist.sections[disp.state.index];if(section.type==='audio-select' && disp.state.selection){const st=qs('#stage');if(!st.querySelector('audio') && !st.querySelector('video')){playSection(section);} }} applyPauseState();}

function addInteractionOverlay(){const st=qs('#stage');const ov=document.createElement('div');ov.id='interactionOverlay';ov.style.position='fixed';ov.style.inset='0';ov.style.display='flex';ov.style.alignItems='center';ov.style.justifyContent='center';ov.style.background='rgba(0,0,0,0.85)';ov.style.color='#fff';ov.style.fontSize='2.5rem';ov.style.fontFamily='system-ui';ov.style.cursor='pointer';ov.textContent='Click to Start';ov.addEventListener('click',()=>{userInteracted=true;ov.remove();if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(()=>{});} attemptPlay(disp.currentMediaEl);});st.appendChild(ov);}

async function init(){
	// Always start paused
	await postState({command:'pause'});
	await poll();
	addInteractionOverlay();
	setInterval(poll,1000);
}

document.addEventListener('DOMContentLoaded',init);