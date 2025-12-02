async function fetchJSON(url){const r=await fetch(url);return r.json();}
async function postJSON(url,body){await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}

const ctrlState={playlist:null,state:null,prevIndex:null};

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
	const pausePlayBtn = qs('#btnPausePlay');
	if(pausePlayBtn){
		if(ctrlState.state.paused){
			pausePlayBtn.textContent = '▶ Play';
			pausePlayBtn.classList.remove('primary');
		} else {
			pausePlayBtn.textContent = '⏸ Pause';
			pausePlayBtn.classList.add('primary');
		}
	}
}

async function setIndex(i){await postJSON('/api/state',{index:i});refreshState();}
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
	const current=ctrlState.playlist.sections[ctrlState.state.index];
	const panel=qs('#selectionPanel');
	const container=qs('#selectionButtons');
	if(current.type!=='audio-select'){
		panel.style.display='none';
		container.innerHTML='';
		return;
	}
	panel.style.display='block';
	container.innerHTML='';
	current.options.forEach(opt=>{
		const btn=document.createElement('button');
		btn.className='btn';
		btn.textContent=opt.label||opt.src;
		btn.addEventListener('click',async()=>{
			await postJSON('/api/state',{selection:{src:opt.src,label:opt.label}});
			refreshState();
		});
		container.appendChild(btn);
	});
}

async function init(){setupControls();ctrlState.playlist=await fetchJSON('/api/playlist');await refreshState();renderSections();setInterval(async()=>{await refreshState();maybeAddSelectionUI();},1000);} 

document.addEventListener('DOMContentLoaded',init);