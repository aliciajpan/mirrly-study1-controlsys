async function fetchJSON(url){const r=await fetch(url);return r.json();}
async function postJSON(url,body){await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}

// const ctrlState={playlist:null,state:null,prevIndex:null,selectedGesture:null};
const ctrlState={playlist:null,state:null,prevIndex:null,lastRenderedIndex:null};

function qs(s){return document.querySelector(s);} 

function renderSections(){
	const list=qs('#sectionList');
	list.innerHTML='';
	ctrlState.playlist.sections.forEach((s,i)=>{
		const li=document.createElement('li');
		const idx=document.createElement('span');
		idx.textContent=String(i+1)+'.';
		idx.className='index';
		const label=document.createElement('span');
		label.textContent=`${s.title||s.id} (${s.type})`;
		li.appendChild(idx);
		li.appendChild(label);
		if(ctrlState.state&&i===ctrlState.state.index) li.className='active';
		li.addEventListener('click',()=>setIndex(i));
		list.appendChild(li);
	});
	// Auto-scroll active item into view if index changed
	const active=list.querySelector('li.active');
	if(active && ctrlState.prevIndex !== ctrlState.state.index){
		active.scrollIntoView({block:'nearest'});
	}
}

async function refreshState(){
	const oldIndex = ctrlState.state ? ctrlState.state.index : null;
	ctrlState.state=await fetchJSON('/api/state');
	ctrlState.prevIndex = oldIndex;
	updateStatus();
	renderSections();
}

function updateStatus(){
	if(!ctrlState.state) return;
	qs('#currentSection').textContent = ctrlState.playlist.sections[ctrlState.state.index].title || ctrlState.playlist.sections[ctrlState.state.index].id;
	qs('#pausedState').textContent = ctrlState.state.paused ? 'Yes' : 'No';
	// Update robot status display
	const robotStatusEl = qs('#robotStatus');
	if(robotStatusEl){
		if(ctrlState.state.robot_status === 'connected'){
			robotStatusEl.textContent = '🤖 Connected';
			robotStatusEl.style.color = '#4ade80';
		} else if(ctrlState.state.robot_status === 'connecting'){
			robotStatusEl.textContent = '🤖 Connecting...';
			robotStatusEl.style.color = '#fbbf24';
		} else {
			robotStatusEl.textContent = '🤖 Disconnected';
			robotStatusEl.style.color = '#ef4444';
		}
	}
	// Display robot message if present
	const robotMsgEl = qs('#robotMessage');
	if(robotMsgEl && ctrlState.state.robot_message){
		robotMsgEl.textContent = ctrlState.state.robot_message.message || JSON.stringify(ctrlState.state.robot_message).substring(0,100);
		robotMsgEl.style.display = 'block';
	} else if(robotMsgEl){
		robotMsgEl.style.display = 'none';
	}
	const pausePlayBtn = qs('#btnPausePlay');
	if(pausePlayBtn){
		if(ctrlState.state.paused){
			pausePlayBtn.textContent = '▶ Restart';
			pausePlayBtn.classList.remove('primary');
		} else {
			pausePlayBtn.textContent = '⏹ Stop';
			pausePlayBtn.classList.add('primary');
		}
	}
}

async function setIndex(i){
	// When selecting from list, set index and automatically start playing
	await postJSON('/api/state',{index:i, command:'play'}); // put in one package for less lag
	// await postJSON('/api/state',{command:'play'});
	refreshState();
}
async function sendCommand(command){await postJSON('/api/state',{command});refreshState();}

function setupControls(){
	qs('#btnPrev').addEventListener('click',()=>sendCommand('prev'));
	qs('#btnNext').addEventListener('click',()=>sendCommand('next'));
	qs('#btnOpenDisplay').addEventListener('click',()=>{window.open('/display','display');});
	const pausePlayBtn = qs('#btnPausePlay');
	if(pausePlayBtn){
		pausePlayBtn.addEventListener('click',()=>{
			if(ctrlState.state && ctrlState.state.paused){
				sendCommand('play');
			} else {
				sendCommand('pause');
			}
		});
	}
}

function maybeAddSelectionUI(){
    // if already built UI of current item in sequence of events, do not rebuild!
    if (ctrlState.lastRenderedIndex === ctrlState.state.index) return;

	const current=ctrlState.playlist.sections[ctrlState.state.index];
	const panel=qs('#selectionPanel');
	const container=qs('#selectionButtons');

    // set index to mark already-built status
    ctrlState.lastRenderedIndex = ctrlState.state.index;

	if(current.type!=='audio-select'){
		panel.style.display='none';
		container.innerHTML='';
		// ctrlState.selectedGesture=null;
		return;
	}
	panel.style.display='block';
	container.innerHTML='';
	
	// Create a wrapper for gestures and reactions
	const wrapper=document.createElement('div');
	wrapper.style.display='flex';
	wrapper.style.flexDirection='column';
	wrapper.style.gap='12px';
	
    // getting rid of this bc answers are hardcoded and only want to display the right answer
	// Step 1: Gesture Selection (FIRST)
	// const gestureDiv=document.createElement('div');
	// gestureDiv.style.paddingBottom='12px';
	// gestureDiv.style.borderBottom='1px solid #7c6fa6';
	
	// const gestureTitle=document.createElement('div');
	// gestureTitle.textContent='1. Select Winner:';
	// gestureTitle.style.color='#a89ad7';
	// gestureTitle.style.marginBottom='8px';
	// gestureTitle.style.fontSize='0.9em';
	// gestureDiv.appendChild(gestureTitle);
	
	// const gestureButtonsDiv=document.createElement('div');
	// gestureButtonsDiv.style.display='flex';
	// gestureButtonsDiv.style.gap='8px';
	
	// ['show_star','show_diamond'].forEach(g=>{
	// 	const btn=document.createElement('button');
	// 	btn.className='btn';
	// 	if(ctrlState.selectedGesture===g) btn.classList.add('primary');
	// 	btn.textContent=g.replace('show_','').charAt(0).toUpperCase()+g.replace('show_','').slice(1);
	// 	btn.style.flex='1';
	// 	btn.addEventListener('click',()=>{
	// 		ctrlState.selectedGesture=g;
	// 		maybeAddSelectionUI(); // Refresh to show selection and enable reactions
	// 	});
	// 	gestureButtonsDiv.appendChild(btn);
	// });
	
	// gestureDiv.appendChild(gestureButtonsDiv);
	// wrapper.appendChild(gestureDiv);
	
	// Step 2: Reaction Selection (ONLY ENABLED after gesture selected)
	const reactionsDiv=document.createElement('div');
	
	const reactionsTitle=document.createElement('div');
	reactionsTitle.textContent='2. Select Reaction:';
	reactionsTitle.style.color='#a89ad7';
	reactionsTitle.style.marginBottom='8px';
	reactionsTitle.style.fontSize='0.9em';
	reactionsDiv.appendChild(reactionsTitle);
	
	const reactionButtonsDiv=document.createElement('div');
	reactionButtonsDiv.style.display='flex';
	reactionButtonsDiv.style.flexWrap='wrap';
	reactionButtonsDiv.style.gap='8px';
	
	current.options.forEach(opt=>{
		const btn=document.createElement('button');
		btn.className='btn';
		btn.textContent=opt.label||opt.src;
		// btn.disabled=!ctrlState.selectedGesture; // Disabled until gesture selected
		// btn.style.opacity=ctrlState.selectedGesture?'1':'0.5';
		// btn.style.cursor=ctrlState.selectedGesture?'pointer':'not-allowed';

        // Always enabled now
        btn.style.opacity='1';
        btn.style.cursor='pointer';
		
		// if(ctrlState.selectedGesture){
		// 	btn.addEventListener('click',async()=>{
		// 		// Use selected gesture, override option's default
		// 		await postJSON('/api/state',{selection:{src:opt.src,label:opt.label,gesture:ctrlState.selectedGesture}});
		// 		ctrlState.selectedGesture=null; // Reset for next reaction
		// 		refreshState();
		// 	});
		// }

        btn.addEventListener('click',async()=>{
            // Use opt.gesture directly (hardcoded in JSON) instead of a selected override
            await postJSON('/api/state',{
                selection: {
                    src: opt.src,
                    label: opt.label,
                    gesture: opt.gesture // <--- reads from playlist.json
                }
            });
            refreshState();
        });

		reactionButtonsDiv.appendChild(btn);
	});
	
	reactionsDiv.appendChild(reactionButtonsDiv);
	wrapper.appendChild(reactionsDiv);
	
	container.appendChild(wrapper);
}

async function init(){setupControls();ctrlState.playlist=await fetchJSON('/api/playlist');await refreshState();renderSections();setInterval(async()=>{await refreshState();maybeAddSelectionUI();},1000);} 

document.addEventListener('DOMContentLoaded',init);