// ================= ETAT & CLÉS EN DUR =================
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMjUzZmVjZjU1NGUzN2Y2MGY1ZGZhZjE5YjM5ZWM3MSIsIm5iZiI6MTc3MjM3NzgxOC45ODg5OTk4LCJzdWIiOiI2OWE0NTZkYThiMDYyNTBmNDNjMTc4ODciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.XmRTyo9yz5ct9vuuOKeQgMWQApzFXBgrX75ihzM31Us";
const GEMINI_API_KEY = "AIzaSyD2yVqkVakO_zLDvVrUwGjGjMziji_6A0k"; // EXACTEMENT TA CLÉ

let DATA = typeof BASE_DATA !== 'undefined' ? [...BASE_DATA] : [];
let customItems = JSON.parse(localStorage.getItem('wl_custom')||'[]');
let customEdits = JSON.parse(localStorage.getItem('wl_edits')||'{}');
let W = new Set(JSON.parse(localStorage.getItem('wl_watched')||'[]'));
let W_dates = JSON.parse(localStorage.getItem('wl_watched_dates')||'{}'); 
let userRatings = JSON.parse(localStorage.getItem('wl_ratings')||'{}');
let userNotes = JSON.parse(localStorage.getItem('wl_notes')||'{}');
let userHype = JSON.parse(localStorage.getItem('wl_hype')||'{}');
let userOscars = JSON.parse(localStorage.getItem('wl_oscars')||'{}');
let apiCache = JSON.parse(localStorage.getItem('wl_api_cache')||'{}');
let posterCache = JSON.parse(localStorage.getItem('wl_posters')||'{}');
let downloaded = new Set(JSON.parse(localStorage.getItem('wl_dl')||'[]'));
let trashItems = JSON.parse(localStorage.getItem('wl_trash')||'[]');
let settings = JSON.parse(localStorage.getItem('wl_settings')||'{"font":"font-default","blueLight":false,"hideHype":false}');

// Migration W -> W_dates
if(W.size > 0 && Object.keys(W_dates).length === 0) {
    W.forEach(id => W_dates[id] = Date.now());
    localStorage.setItem('wl_watched_dates', JSON.stringify(W_dates));
}

function rebuildData() {
    let base = [...DATA];
    Object.entries(customEdits).forEach(([id, edit]) => {
        let idx = base.findIndex(i => i.id == id);
        if (idx >= 0) base[idx] = { ...base[idx], ...edit };
    });
    customItems.forEach(i => { if (!base.find(d => d.id == i.id)) base.push(i); });
    let trashedIds = new Set(trashItems.map(t=>t.id));
    return base.filter(i=>!trashedIds.has(i.id));
}
let workingData = rebuildData();

function saveLocal() {
    localStorage.setItem('wl_watched', JSON.stringify([...W]));
    localStorage.setItem('wl_watched_dates', JSON.stringify(W_dates));
    localStorage.setItem('wl_ratings', JSON.stringify(userRatings));
    localStorage.setItem('wl_notes', JSON.stringify(userNotes));
    localStorage.setItem('wl_hype', JSON.stringify(userHype));
    localStorage.setItem('wl_dl', JSON.stringify([...downloaded]));
    localStorage.setItem('wl_settings', JSON.stringify(settings));
    localStorage.setItem('wl_trash', JSON.stringify(trashItems));
}

// ================= TOASTS & UNDO =================
let actionHistory = [];
function pushHistory(actionName, reverseFunc) {
    actionHistory.push({ name: actionName, undo: reverseFunc });
    showToast(`Action: ${actionName}`, true);
}
function showToast(msg, withUndo = false) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<span>${msg}</span> ${withUndo ? `<button onclick="triggerUndo(this.parentElement)">Annuler</button>` : ''}`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => { if(t.parentElement) t.remove(); }, 5000);
}
function triggerUndo(toastEl) {
    if(actionHistory.length > 0) {
        let lastAction = actionHistory.pop(); lastAction.undo();
        if(toastEl) toastEl.remove(); showToast("Annulé !");
        go(); if(document.getElementById('page-stats').style.display==='block') computeGamification();
    }
}
document.addEventListener('keydown', e => { if(e.ctrlKey && e.key === 'z') triggerUndo(); });

// ================= PARAMÈTRES UI =================
function changeFont(val) { settings.font = val; document.documentElement.className = val; saveLocal(); }
if(settings.font) document.documentElement.className = settings.font;

function toggleBlueLight(val) { settings.blueLight = val; document.body.classList.toggle('blue-light', val); saveLocal(); }
if(settings.blueLight) document.body.classList.add('blue-light');

function toggleHideHype(val) { settings.hideHype = val; document.body.classList.toggle('hide-hype', val); saveLocal(); }
if(settings.hideHype) document.body.classList.add('hide-hype');

function uploadAvatar(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (ev) => { document.getElementById('user-avatar').src = ev.target.result; localStorage.setItem('wl_custom_avatar', ev.target.result); document.getElementById('user-badge').style.display='flex';};
        reader.readAsDataURL(file);
    }
}
if(localStorage.getItem('wl_custom_avatar')) { document.getElementById('user-avatar').src = localStorage.getItem('wl_custom_avatar'); document.getElementById('user-badge').style.display='flex'; }

// ================= NAVIGATION =================
document.querySelectorAll('.nav-tab').forEach(b => b.onclick = (e) => {
    document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active')); e.target.classList.add('active');
    ['list','stats','timeline','roulette','downloads','trash','fun','settings'].forEach(p => {
        let el = document.getElementById('page-'+p); if(el) el.style.display = 'none';
    });
    document.getElementById('page-'+e.target.dataset.page).style.display = 'block';
    
    if(e.target.dataset.page === 'stats') computeGamification();
    if(e.target.dataset.page === 'timeline') renderTimeline();
    if(e.target.dataset.page === 'downloads') renderDownloads();
    if(e.target.dataset.page === 'trash') renderTrash();
});

document.getElementById('btn-focus').onclick = () => document.body.classList.toggle('focus-mode');

let currentView = 'poster';
document.querySelectorAll('.view-btn').forEach(b => b.onclick = (e) => {
    document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('on')); e.target.classList.add('on');
    currentView = e.target.dataset.view; go();
});

const zoomSlider = document.getElementById('zoom-slider');
zoomSlider.oninput = (e) => document.documentElement.style.setProperty('--poster-size', e.target.value + 'px');

// ================= BATCH EDIT =================
let selectedIds = new Set(); let isBatchMode = false;
document.addEventListener('keydown', e => { if(e.key === 'Shift') isBatchMode = true; });
document.addEventListener('keyup', e => { if(e.key === 'Shift') isBatchMode = false; });
function toggleSelection(id, cardEl) {
    if(selectedIds.has(id)) { selectedIds.delete(id); cardEl.classList.remove('selected'); }
    else { selectedIds.add(id); cardEl.classList.add('selected'); }
    let bar = document.getElementById('batch-bar');
    if(selectedIds.size > 0) { bar.style.display = 'flex'; document.getElementById('batch-count').textContent = `${selectedIds.size} sélectionné(s)`; }
    else bar.style.display = 'none';
}
function cancelBatch() { selectedIds.clear(); document.querySelectorAll('.pcard.selected').forEach(c => c.classList.remove('selected')); document.getElementById('batch-bar').style.display = 'none'; }
function batchMarkWatched() {
    let savedState = JSON.parse(JSON.stringify(W_dates)); let savedW = new Set(W); let added = 0;
    selectedIds.forEach(id => { if(!W.has(id)) { W.add(id); W_dates[id] = Date.now(); added++; } });
    pushHistory(`Marqué ${added} film(s) vu(s)`, () => { W_dates = savedState; W = savedW; saveLocal(); go(); });
    saveLocal(); cancelBatch(); go(); 
}
function batchDelete() {
    if(!confirm(`Mettre ${selectedIds.size} éléments à la corbeille ?`)) return;
    let oldCustom = [...customItems]; let oldTrash = [...trashItems];
    selectedIds.forEach(id => {
        const it = workingData.find(i=>i.id==id); if(it) trashItems.push({...it, deletedAt:Date.now()});
        customItems = customItems.filter(i => i.id != id); delete customEdits[id];
    });
    pushHistory(`Supprimé ${selectedIds.size} élément(s)`, () => { customItems = oldCustom; trashItems = oldTrash; workingData = rebuildData(); saveLocal(); go(); });
    workingData = rebuildData(); saveLocal(); cancelBatch(); go();
}

// ================= FETCH POSTERS (SÉCURISÉ) =================
function posterUrl(p){ if(!p)return null; if(p.startsWith("__JIKAN__"))return p.slice(9); if(p.startsWith("http"))return p; return `https://image.tmdb.org/t/p/w300${p}`; }

let jikanQueue = []; let isJikanRunning = false;
async function processJikanQueue() {
    if(isJikanRunning || jikanQueue.length === 0) return;
    isJikanRunning = true;
    while(jikanQueue.length > 0) {
        let task = jikanQueue.shift();
        try {
            const r = await fetch(task.url); const d = await r.json(); const res = d.data&&d.data[0];
            const url = res?(res.images?.jpg?.large_image_url||null):null;
            task.resolve(url ? '__JIKAN__'+url : null);
        } catch { task.resolve(null); }
        await new Promise(r=>setTimeout(r, 600)); // Délais anti-ban Jikan
    }
    isJikanRunning = false;
}

async function fetchPosterSafe(item) {
    if(posterCache[item.id] !== undefined) return posterCache[item.id];
    
    if(item.type === 'manga' || item.type === 'anime' || item.type === 'anime-film') {
        const url = item.type==='manga' ? `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(item.name)}&limit=1` : `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(item.name)}&limit=1&type=${item.type==='anime-film'?'movie':'tv'}`;
        return new Promise(resolve => {
            jikanQueue.push({ url, resolve: (res) => { posterCache[item.id] = res; localStorage.setItem('wl_posters', JSON.stringify(posterCache)); resolve(res); } });
            processJikanQueue();
        });
    } else {
        const ep = item.type==='serie'?'tv':'movie';
        try {
            const r = await fetch(`https://api.themoviedb.org/3/search/${ep}?query=${encodeURIComponent(item.name)}&year=${item.year||''}&language=fr-FR`, {headers:{Authorization:`Bearer ${TMDB_TOKEN}`}});
            const d = await r.json(); const path = d.results?.[0]?.poster_path || null;
            posterCache[item.id] = path; localStorage.setItem('wl_posters', JSON.stringify(posterCache));
            return path;
        } catch { return null; }
    }
}

async function loadVisiblePosters(ids) {
    const toLoad = ids.filter(id => posterCache[id] === undefined).slice(0, 10);
    for(const id of toLoad) {
        const it = workingData.find(i=>i.id===id); if(!it) continue;
        const path = await fetchPosterSafe(it);
        if(path) {
            document.querySelectorAll(`.pcard[data-id="${id}"] .no-poster`).forEach(np => {
                const img = document.createElement('img'); img.src = posterUrl(path); img.loading="lazy";
                np.replaceWith(img);
            });
            document.querySelectorAll(`.dl-item[data-id="${id}"] .dl-thumb-ph`).forEach(ph => {
                const img = document.createElement('img'); img.className='dl-thumb'; img.src = posterUrl(path);
                ph.replaceWith(img);
            });
        } else { posterCache[id] = null; }
    }
}

// ================= RENDER GRID =================
let filterCat = 'all'; let searchQ = ''; let groupBySaga = false;
document.getElementById('btn-saga').onclick = (e) => { groupBySaga = !groupBySaga; e.target.classList.toggle('active-btn'); go(); };
document.querySelectorAll('.cat-tab').forEach(b => b.onclick = (e) => { document.querySelectorAll('.cat-tab').forEach(x => x.classList.remove('active')); e.target.classList.add('active'); filterCat = e.target.dataset.cat; go(); });
document.getElementById('search').oninput = (e) => { searchQ = e.target.value.toLowerCase(); go(); };

function fuzzySearch(n, h) {
    if(n.length > h.length) return false; if(n===h) return true;
    outer: for(let i=0, j=0; i<n.length; i++) {
        let ch = n.charCodeAt(i); while(j<h.length) { if(h.charCodeAt(j++)===ch) continue outer; } return false;
    } return true;
}

function go() {
    let filtered = workingData.filter(i => {
        if(filterCat!=='all' && i.type!==filterCat && !(filterCat==='anime'&&i.type==='anime-film')) return false;
        if(searchQ) {
            let nl = i.name.toLowerCase(); let r = apiCache[i.id]?.real?.toLowerCase()||"";
            if(!nl.includes(searchQ) && !r.includes(searchQ) && !fuzzySearch(searchQ.replace(/\s+/g,''), nl.replace(/\s+/g,''))) return false;
        }
        return true;
    });

    let sort = document.getElementById('adv-sort').value;
    if(sort === 'rating-desc') filtered.sort((a,b) => (b.imdb||0) - (a.imdb||0));
    else if(sort === 'year-desc') filtered.sort((a,b) => (b.year||0) - (a.year||0));
    else if(sort === 'time-asc') filtered.sort((a,b) => (apiCache[a.id]?.time||9999) - (apiCache[b.id]?.time||9999));
    else if(sort === 'alpha-asc') filtered.sort((a,b) => a.name.localeCompare(b.name));
    else if(sort === 'hype') filtered.sort((a,b) => (userHype[b.id]||0) - (userHype[a.id]||0));
    else if(sort === 'random') filtered.sort(() => Math.random() - 0.5);

    let html = ''; const visibleIds = [];
    const TYPE_META={'anime':{l:'🎌 Animés', c:'var(--anime)'},'film':{l:'🎬 Films', c:'var(--film)'},'serie':{l:'📺 Séries', c:'var(--serie)'},'manga':{l:'📚 Mangas', c:'var(--manga)'}, 'anime-film':{l:'🎥 Film Animé', c:'var(--anime)'}};
    document.getElementById('scontainer').className = currentView==='coverflow'?'coverflow-view':currentView==='compact'?'compact-view':'';

    if(groupBySaga) {
        let sagas = {}; let singles = [];
        filtered.forEach(i => { if(i.saga) { sagas[i.saga]=sagas[i.saga]||[]; sagas[i.saga].push(i); } else singles.push(i); });
        Object.keys(sagas).forEach(s => html += buildSection(s, sagas[s], 'var(--serie)', visibleIds));
        if(singles.length) html += buildSection("Indépendants", singles, 'var(--muted)', visibleIds);
    } else {
        ['film','serie','anime','manga'].forEach(t => {
            let list = filtered.filter(i => i.type===t || (t==='anime'&&i.type==='anime-film'));
            if(list.length) html += buildSection(TYPE_META[t].l, list, TYPE_META[t].c, visibleIds);
        });
    }
    
    document.getElementById('scontainer').innerHTML = html || "<div style='padding:40px; text-align:center; color:var(--muted)'>Aucun résultat.</div>";
    
    document.querySelectorAll('.pcard').forEach(c => {
        c.onclick = (e) => { if(isBatchMode) { e.preventDefault(); toggleSelection(parseInt(c.dataset.id), c); } else openModal(parseInt(c.dataset.id)); }
    });
    
    document.getElementById('sttotal').textContent = DATA.length;
    document.getElementById('stwatched').textContent = W.size;
    document.getElementById('stleft').textContent = DATA.length - W.size;
    document.getElementById('ppct').textContent = DATA.length ? Math.round((W.size/DATA.length)*100)+'%' : '0%';
    document.getElementById('pfill').style.width = DATA.length ? Math.round((W.size/DATA.length)*100)+'%' : '0%';
    
    setTimeout(() => loadVisiblePosters(visibleIds), 50);
}

function buildSection(title, list, color, visibleIds) {
    let inner = list.map(it => {
        visibleIds.push(it.id);
        const done = W.has(it.id); const hype = userHype[it.id]; const poster = posterCache[it.id];
        let h = `<div class="pcard ${done?'done':''} ${selectedIds.has(it.id)?'selected':''}" data-id="${it.id}">`;
        if(poster) h+= `<img src="${posterUrl(poster)}" loading="lazy">`;
        else h+= `<div class="no-poster"><span class="np-em">${it.emoji||'🎬'}</span></div>`;
        h+= `<div class="done-badge">✓</div>`;
        if(it.imdb) h+= `<div class="rating-badge">⭐ ${it.imdb}</div>`;
        if(hype!==undefined) h+= `<div class="hype-badge-card">${HYPE_LABEL[hype]}</div>`;
        h+= `<div class="pcard-overlay"><div class="pcard-name">${it.name}</div><div class="pcard-year">${it.year||''} ${userRatings[it.id]?`<span style="color:#a78bfa">★${userRatings[it.id]}</span>`:''}</div></div></div>`;
        return h;
    }).join('');
    return `<div class="section"><div class="sec-header"><span class="sec-line" style="background:${color}"></span><span class="sec-title">${title}</span><span class="sec-count">${list.length}</span></div><div class="grid-poster">${inner}</div></div>`;
}

// ================= MODAL DETAIL ENRICHIE =================
async function openModal(id) {
    currentModalId = id; const it = workingData.find(i=>i.id==id); if(!it) return;
    const done = W.has(id); const isDl = downloaded.has(id); const hype = userHype[id];
    
    // Thème Caméléon Rapide
    const r=(id*33)%100, g=(id*66)%100, b=(id*99)%150+50;
    document.getElementById('modal').style.setProperty('--modal-bg', `rgba(${r},${g},${b}, 0.9)`);
    
    const pw = document.getElementById('modal-poster-wrap');
    const poster = posterCache[id];
    if(poster) pw.innerHTML = `<img class="modal-poster" src="${posterUrl(poster,true)}">`;
    else pw.innerHTML = `<div class="modal-poster-ph">${it.emoji||'🎬'}</div>`;

    document.getElementById('modal-title').textContent = it.name;
    document.getElementById('modal-meta').innerHTML = `<span class="api-tag">${it.year||'—'}</span> <span class="api-tag" style="color:var(--gold)">⭐ ${it.imdb||'N/A'}</span>`;
    document.getElementById('modal-genres').innerHTML = (it.genres||[]).map(g=>`<span class="api-tag">${g}</span>`).join('');
    document.getElementById('modal-overview').textContent = overviewCache[id]||'Pas de synopsis disponible.';
    document.getElementById('modal-ai-result').innerHTML = ''; 

    // Extra TMDB Info Async
    let extras = document.getElementById('modal-api-extras'); extras.innerHTML = '';
    if(it.type==='film'||it.type==='serie') {
        if(!apiCache[id]) {
            try {
                const sr = await fetch(`https://api.themoviedb.org/3/search/${it.type==='serie'?'tv':'movie'}?query=${encodeURIComponent(it.name)}&language=fr-FR`, {headers:{Authorization:`Bearer ${TMDB_TOKEN}`}});
                const sd = await sr.json(); const tmdbId = sd.results?.[0]?.id;
                if(tmdbId) {
                    const dr = await fetch(`https://api.themoviedb.org/3/${it.type==='serie'?'tv':'movie'}/${tmdbId}?append_to_response=credits&language=fr-FR`, {headers:{Authorization:`Bearer ${TMDB_TOKEN}`}});
                    const d = await dr.json();
                    apiCache[id] = { time: d.runtime||d.episode_run_time?.[0]||0, studio: d.production_companies?.[0]?.name||'', country: d.production_countries?.[0]?.iso_3166_1||'', real: it.type==='film'?d.credits?.crew?.find(c=>c.job==='Director')?.name:d.created_by?.[0]?.name };
                    localStorage.setItem('wl_api_cache', JSON.stringify(apiCache));
                }
            } catch(e){}
        }
        let c = apiCache[id];
        if(c) {
            let eh=''; if(c.time) eh+=`<span class="api-tag" style="color:var(--gold)">⏱️ ${Math.floor(c.time/60)}h${c.time%60}</span>`;
            if(c.country) eh+=`<span class="api-tag">🌍 ${c.country}</span>`;
            if(c.studio) eh+=`<span class="api-tag">🏢 ${c.studio}</span>`;
            if(c.real) eh+=`<span class="api-tag" style="cursor:pointer" onclick="document.getElementById('search').value='${c.real}';go();document.getElementById('modal-close').click();">🎬 ${c.real}</span>`;
            extras.innerHTML = eh;
        }
    }

    // Streaming
    document.getElementById('modal-streaming').innerHTML='<span style="font-size:.7rem;color:var(--muted)">Recherche officielle...</span>';
    fetchStreamingProviders(it).then(prov=>{
        if(!prov||(!prov.flatrate&&!prov.rent&&!prov.buy)){ document.getElementById('modal-streaming').innerHTML='<span style="font-size:.7rem;color:var(--muted)">Non disponible</span>'; return; }
        const all=[]; const seen=new Set();
        ['flatrate','rent','buy'].forEach(type=>{ (prov[type]||[]).forEach(p=>{ if(!seen.has(p.provider_id)){ seen.add(p.provider_id); all.push({...p, stype: type==='flatrate'?'Abo':type==='rent'?'Loc':'Achat'}); } }); });
        document.getElementById('modal-streaming').innerHTML = `<div class="streaming-providers">` + all.slice(0,5).map(p=>`<a class="stream-pill" href="${getProviderLink(p.provider_name,it.name)}" target="_blank"><img class="stream-logo" src="https://image.tmdb.org/t/p/original${p.logo_path}">${p.provider_name}</a>`).join('') + `</div>`;
    });

    // Links
    const enc = encodeURIComponent(it.name);
    document.getElementById('modal-ext-links').innerHTML = `
        <a class="ext-link" href="${(settings.linkCinehd||'https://cinehd.cc/search?q={q}').replace('{q}',enc)}" target="_blank">🍿 CineHD</a>
        <a class="ext-link" href="${(settings.linkVidbox||'https://vidbox.cc/search?q={q}').replace('{q}',enc)}" target="_blank">📺 VidBox</a>
    `;

    // Notes & Rating
    document.getElementById('modal-notes').value = userNotes[id]||'';
    document.getElementById('modal-save-notes').onclick = (e) => { userNotes[id]=document.getElementById('modal-notes').value; saveLocal(); e.target.textContent='✓ Sauvegardé'; setTimeout(()=>e.target.textContent='Sauvegarder',1000); };
    renderStarRating(id);

    // Hype
    document.getElementById('modal-hype').innerHTML=[3,2,1,0].map(h=>`<button class="hype-btn ${hype===h?'on':''}" onclick="setHype(${id}, ${h})">${HYPE_LABEL[h]}</button>`).join('');

    // Actions
    let wb = document.getElementById('modal-watch-btn');
    wb.textContent = done ? '✅ Vu / Lu' : '🔲 Marquer comme vu';
    wb.style.background = done ? 'var(--manga)' : ''; wb.style.color = done ? '#000' : '';
    wb.onclick = () => {
        let savedState = JSON.parse(JSON.stringify(W_dates)); let savedW = new Set(W);
        if(W.has(id)) { W.delete(id); delete W_dates[id]; } else { W.add(id); W_dates[id] = Date.now(); }
        pushHistory(`${W.has(id)?'Vu':'Non vu'} : ${it.name}`, () => { W_dates=savedState; W=savedW; saveLocal(); openModal(id); go(); });
        saveLocal(); openModal(id); go(); computeGamification();
    }

    let db = document.getElementById('modal-dl-btn');
    db.textContent = isDl ? '💾 Téléchargé ✓' : '⬜ Marquer téléchargé';
    db.style.background = isDl ? 'var(--film)' : ''; db.style.color = isDl ? '#000' : '';
    db.onclick = () => { downloaded.has(id)?downloaded.delete(id):downloaded.add(id); saveLocal(); openModal(id); }

    document.getElementById('modal-overlay').classList.add('open');
}
document.getElementById('modal-close').onclick = () => document.getElementById('modal-overlay').classList.remove('open');

function renderStarRating(id){
    const v=userRatings[id]||0; let h='';
    for(let i=1;i<=5;i++){
        const full=v>=i; const half=!full&&v>=(i-0.5);
        h+=`<div class="star-half-wrap"><span class="star-empty">★</span>${full?`<span class="star-fill" style="width:100%">★</span>`:half?`<span class="star-fill" style="width:50%">★</span>`:''}<div class="hitbox-left" onclick="rate(${id}, ${i-0.5})"></div><div class="hitbox-right" onclick="rate(${id}, ${i})"></div></div>`;
    }
    document.getElementById('modal-stars').innerHTML=h; document.getElementById('star-val-display').textContent=v?`${v}/5`:'—';
    document.getElementById('clear-rating-btn').onclick=()=>{delete userRatings[id];saveLocal();renderStarRating(id);go();};
}
function rate(id, val) { userRatings[id] = val; saveLocal(); renderStarRating(id); go(); }
function setHype(id, val) { if(userHype[id]===val) delete userHype[id]; else userHype[id]=val; saveLocal(); openModal(id); go(); }

// ===================== IA GEMINI (POPUP) =====================
async function geminiRecommendSimilar() {
    if(!GEMINI_API_KEY) { alert("Configure ta clé !"); return; }
    const title = document.getElementById('modal-title').textContent;
    document.getElementById('modal-ai-result').innerHTML = "<em>L'IA fouille ta collection... ⏳</em>";
    const listNames = workingData.map(i=>i.name).join(', ');
    const prompt = `Je regarde "${title}". Trouve-moi 3 œuvres SIMILAIRES PRÉSENTES DANS CETTE LISTE EXACTE : [${listNames}]. Ne réponds que par les 3 noms séparés par des virgules.`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{parts: [{text: prompt}]}] }) });
        const data = await res.json();
        document.getElementById('modal-ai-result').innerHTML = "<strong>💡 Dans ta liste :</strong> " + data.candidates[0].content.parts[0].text;
    } catch { document.getElementById('modal-ai-result').innerHTML = "Erreur IA."; }
}

async function geminiQuiz() {
    if(!GEMINI_API_KEY) return;
    const title = document.getElementById('modal-title').textContent;
    document.getElementById('modal-ai-result').innerHTML = "<em>Génération du Quiz... ⏳</em>";
    const prompt = `Génère une question de quiz très difficile (trivia) sur l'œuvre "${title}". Donne la question, puis saute une ligne, puis donne la réponse.`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{parts: [{text: prompt}]}] }) });
        const data = await res.json();
        let txt = data.candidates[0].content.parts[0].text.replace('\n', '<br><br><span style="color:var(--muted)">Réponse (surligne): </span><span style="background:#000; color:#000;">');
        document.getElementById('modal-ai-result').innerHTML = `<strong>🎯 Quiz :</strong><br>${txt}</span>`;
    } catch { document.getElementById('modal-ai-result').innerHTML = "Erreur IA."; }
}

// ===================== STATS & GAMIFICATION =====================
function computeGamification() {
    let count = W.size;
    document.getElementById('stat-grade').textContent = count < 10 ? 'Novice 🍿' : count < 50 ? 'Amateur 🎥' : count < 150 ? 'Cinéphile 🎞️' : 'Expert 👑';

    let totalMin = 0; let countries = {}; let allTags = {};
    W.forEach(id => {
        let it = workingData.find(i=>i.id==id);
        if(it && it.genres) it.genres.forEach(g => allTags[g] = (allTags[g]||0)+1);
        if(apiCache[id]) {
            if(apiCache[id].time) totalMin += apiCache[id].time;
            if(apiCache[id].country) countries[apiCache[id].country] = (countries[apiCache[id].country]||0)+1;
        }
    });
    
    let jours = Math.floor(totalMin / (60 * 24)); let heures = Math.floor((totalMin % (60 * 24)) / 60);
    document.getElementById('stat-time').textContent = `${jours}j ${heures}h`;

    let topC = Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,5);
    document.getElementById('chart-countries').innerHTML = topC.map(c => `<div><span style="display:inline-block;width:30px">${c[0]}</span> <div style="display:inline-block;height:8px;background:var(--film);width:${Math.min(c[1]*10, 100)}px;border-radius:4px"></div> ${c[1]}</div>`).join('');

    let tagHtml = ''; let maxTag = Math.max(...Object.values(allTags), 1);
    Object.entries(allTags).forEach(([tag, val]) => {
        let size = 0.6 + (val / maxTag) * 1.5;
        tagHtml += `<span class="cloud-word" style="font-size:${size}em" onclick="document.getElementById('search').value='${tag}';go();document.querySelector('[data-page=list]').click();">${tag}</span>`;
    });
    document.getElementById('wordcloud').innerHTML = tagHtml || 'Aucun tag.';

    renderHeatmap(); renderOscars();
}

function renderHeatmap() {
    let html = ''; let daysWithActivity = {};
    Object.values(W_dates).forEach(ts => { let d = new Date(ts).toISOString().split('T')[0]; daysWithActivity[d] = (daysWithActivity[d]||0)+1; });
    let today = new Date();
    for(let i=364; i>=0; i--) {
        let d = new Date(today); d.setDate(d.getDate() - i); let dStr = d.toISOString().split('T')[0];
        let count = daysWithActivity[dStr] || 0; let lvl = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : 3;
        html += `<div class="heatmap-day" data-level="${lvl}" title="${dStr} : ${count} vus"></div>`;
    }
    document.getElementById('heatmap-container').innerHTML = html;
}

function renderOscars() {
    const cats = [{id:'f',n:'🎬 Meilleur Film'},{id:'s',n:'📺 Meilleure Série'},{id:'v',n:'🎨 Claque Visuelle'},{id:'d',n:'🗑️ Pire Déception'}];
    const vus = workingData.filter(i => W.has(i.id));
    let opts = `<option value="">-- Sélectionner --</option>` + vus.map(i=>`<option value="${i.id}">${i.emoji||''} ${i.name}</option>`).join('');
    document.getElementById('oscars-grid').innerHTML = cats.map(c => `
        <div class="oscar-card"><div class="oscar-title">${c.n}</div><select class="settings-input" onchange="userOscars['${c.id}']=this.value;saveLocal()">
            ${opts.replace(`value="${userOscars[c.id]||''}"`, `value="${userOscars[c.id]||''}" selected`)}
        </select></div>`).join('');
}

// ===================== COIN FUN =====================
async function analyzeMood() {
    if(!GEMINI_API_KEY) { alert("Clé requise !"); return; }
    const vus = workingData.filter(i => W.has(i.id)).map(i=>i.name).slice(-10).join(', ');
    if(!vus) return;
    document.getElementById('mood-result').textContent = "Analyse psychologique... ⏳";
    const prompt = `Voici mes derniers vus : ${vus}. En une phrase sarcastique, quel est mon état psychologique basé là-dessus ?`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{parts: [{text: prompt}]}] }) });
        const data = await res.json(); document.getElementById('mood-result').textContent = '"' + data.candidates[0].content.parts[0].text.trim() + '"';
    } catch(e) { document.getElementById('mood-result').textContent = "Erreur."; }
}

function absoluteAIChoice() {
    let unatched = workingData.filter(i => !W.has(i.id)); if(unatched.length === 0) return;
    let choice = unatched[Math.floor(Math.random() * unatched.length)];
    alert(`L'IA a décidé. Tu vas regarder : ${choice.name}. Ouverture...`);
    window.open((settings.linkCinehd||'https://cinehd.cc/search?q={q}').replace('{q}', encodeURIComponent(choice.name)), '_blank');
}

function startDuel() {
    let vus = workingData.filter(i => W.has(i.id)); if(vus.length < 2) return;
    let a = vus[Math.floor(Math.random() * vus.length)]; let b = vus[Math.floor(Math.random() * vus.length)];
    while(a.id === b.id) b = vus[Math.floor(Math.random() * vus.length)];
    document.getElementById('duel-arena').innerHTML = `
        <div class="g-card" style="cursor:pointer; width:150px" onclick="duelWin('${a.name}')"><div style="font-size:3rem">${a.emoji||'🎬'}</div><h4>${a.name}</h4></div>
        <div style="font-family:'Syne'; font-size:2rem; color:var(--red)">VS</div>
        <div class="g-card" style="cursor:pointer; width:150px" onclick="duelWin('${b.name}')"><div style="font-size:3rem">${b.emoji||'🎬'}</div><h4>${b.name}</h4></div>`;
    document.getElementById('duel-overlay').classList.add('open');
}
function duelWin(name) { showToast(`${name} gagne !`); document.getElementById('duel-overlay').classList.remove('open'); }

// ===================== ANCIENS ONGLETS RESTAURÉS (Roulette, Timeline, Dl, Trash) =====================
document.getElementById('roulette-spin').onclick = () => {
    let unatched = workingData.filter(i => !W.has(i.id)); if(!unatched.length) return;
    let c = unatched[Math.floor(Math.random() * unatched.length)];
    let rc = document.getElementById('roulette-result');
    rc.innerHTML = `<div style="font-size:4rem">${c.emoji||'🎬'}</div><h3>${c.name}</h3><p>${c.year||''}</p><button class="btn-full" onclick="openModal(${c.id})">Voir Détails</button>`;
    rc.style.display = 'inline-block';
};

function renderTimeline() {
    const items=workingData.filter(i=>i.year).sort((a,b)=>a.year-b.year); const decades={};
    items.forEach(i=>{const d=Math.floor(i.year/10)*10; decades[d]=decades[d]||[]; decades[d].push(i);});
    document.getElementById('tl-content').innerHTML=Object.entries(decades).map(([d,list])=>`
      <div style="margin-bottom:20px;"><div style="font-family:'Syne';font-size:1.4rem;color:var(--muted)">${d}s</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">${list.map(it=>`<div style="background:var(--card);padding:5px 10px;border-radius:5px;cursor:pointer;opacity:${W.has(it.id)?'.5':'1'}" onclick="openModal(${it.id})">${it.emoji||''} ${it.name}</div>`).join('')}</div></div>`).join('');
}

function renderDownloads() {
    document.getElementById('dl-container').innerHTML = workingData.filter(i=>downloaded.has(i.id)).map(i=>`
        <div class="pcard dl-item" data-id="${i.id}" onclick="openModal(${i.id})"><div class="no-poster">${i.emoji||'🎬'}</div><div class="dl-badge">💾</div><div class="pcard-overlay"><div class="pcard-name">${i.name}</div></div></div>
    `).join('');
}

function renderTrash() {
    const now=Date.now(); trashItems=trashItems.filter(i=>(now-i.deletedAt)<30*24*3600*1000); saveLocal();
    document.getElementById('trash-container').innerHTML = trashItems.map((it,idx)=>`
        <div style="background:var(--card);padding:10px;border-radius:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
            <div>${it.emoji||'🎬'} ${it.name}</div>
            <div style="display:flex;gap:10px;"><button style="background:var(--anime);border:none;padding:5px 10px;border-radius:5px;cursor:pointer;" onclick="restoreTrash(${idx})">Restaurer</button></div>
        </div>`).join('') || "Corbeille vide.";
}
window.restoreTrash = function(idx) {
    const it = trashItems[idx]; delete it.deletedAt; customItems.push(it); trashItems.splice(idx,1);
    workingData = rebuildData(); saveLocal(); renderTrash(); go(); showToast("Restauré !");
}

// BTT
window.onscroll = () => { let b = document.getElementById('back-to-top'); if(window.scrollY > 300) b.classList.add('show'); else b.classList.remove('show'); }
document.getElementById('back-to-top').onclick = () => window.scrollTo({top:0, behavior:'smooth'});

// Init
go();