// ================= ETAT & DONNÉES DE BASE =================
let DATA = typeof BASE_DATA !== 'undefined' ? [...BASE_DATA] : [];
let customItems = JSON.parse(localStorage.getItem('wl_custom')||'[]');
let customEdits = JSON.parse(localStorage.getItem('wl_edits')||'{}');
let W_dates = JSON.parse(localStorage.getItem('wl_watched_dates')||'{}'); 
let userOscars = JSON.parse(localStorage.getItem('wl_oscars')||'{}');
let apiCache = JSON.parse(localStorage.getItem('wl_api_cache')||'{}');

// IA Gemini
let GEMINI_API_KEY = localStorage.getItem('wl_gemini_key') || "";
if(document.getElementById('setting-gemini-key')) document.getElementById('setting-gemini-key').value = GEMINI_API_KEY;

// Clé TMDB (Officielle)
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMjUzZmVjZjU1NGUzN2Y2MGY1ZGZhZjE5YjM5ZWM3MSIsIm5iZiI6MTc3MjM3NzgxOC45ODg5OTk4LCJzdWIiOiI2OWE0NTZkYThiMDYyNTBmNDNjMTc4ODciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.XmRTyo9yz5ct9vuuOKeQgMWQApzFXBgrX75ihzM31Us";

// Fusion des données
function rebuildData() {
    let base = [...DATA];
    Object.entries(customEdits).forEach(([id, edit]) => {
        let idx = base.findIndex(i => i.id == id);
        if (idx >= 0) base[idx] = { ...base[idx], ...edit };
    });
    customItems.forEach(i => { if (!base.find(d => d.id == i.id)) base.push(i); });
    return base;
}
let workingData = rebuildData();

// ================= SYSTÈME D'UNDO (HISTORIQUE) =================
let actionHistory = [];
function pushHistory(actionName, reverseFunc) {
    actionHistory.push({ name: actionName, undo: reverseFunc });
    showToast(`Action: ${actionName}`, true);
}
function showToast(msg, withUndo = false) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${msg}</span> ${withUndo ? `<button onclick="triggerUndo(this.parentElement)">Annuler</button>` : ''}`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => { if(t.parentElement) t.remove(); }, 5000);
}
function triggerUndo(toastEl) {
    if(actionHistory.length > 0) {
        let lastAction = actionHistory.pop();
        lastAction.undo();
        if(toastEl) toastEl.remove();
        showToast("Annulé !");
        go(); computeGamification();
    }
}
document.addEventListener('keydown', e => { if(e.ctrlKey && e.key === 'z') triggerUndo(); });

// ================= GESTION DES PARAMÈTRES (FONTS, AVATAR, BLUE LIGHT) =================
function changeFont(val) {
    document.documentElement.className = val;
    localStorage.setItem('wl_font', val);
}
if(localStorage.getItem('wl_font')) changeFont(localStorage.getItem('wl_font'));

function toggleBlueLight(val) {
    document.body.classList.toggle('blue-light', val);
    localStorage.setItem('wl_bluelight', val);
}
if(localStorage.getItem('wl_bluelight') === 'true') {
    document.getElementById('blue-light-toggle').checked = true;
    toggleBlueLight(true);
}

function uploadAvatar(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('user-avatar').src = ev.target.result;
            localStorage.setItem('wl_custom_avatar', ev.target.result);
        };
        reader.readAsDataURL(file);
    }
}
if(localStorage.getItem('wl_custom_avatar')) document.getElementById('user-avatar').src = localStorage.getItem('wl_custom_avatar');

function saveGeminiKey() {
    GEMINI_API_KEY = document.getElementById('setting-gemini-key').value.trim();
    localStorage.setItem('wl_gemini_key', GEMINI_API_KEY);
    showToast("Clé IA sauvegardée !");
}

// ================= BATCH EDIT (SÉLECTION MULTIPLE) =================
let selectedIds = new Set();
let isBatchMode = false;

// Si Shift est maintenu pendant le clic sur une carte
document.addEventListener('keydown', e => { if(e.key === 'Shift') isBatchMode = true; });
document.addEventListener('keyup', e => { if(e.key === 'Shift') isBatchMode = false; });

function toggleSelection(id, cardEl) {
    if(selectedIds.has(id)) { selectedIds.delete(id); cardEl.classList.remove('selected'); }
    else { selectedIds.add(id); cardEl.classList.add('selected'); }
    
    let bar = document.getElementById('batch-bar');
    if(selectedIds.size > 0) {
        bar.style.display = 'flex';
        document.getElementById('batch-count').textContent = `${selectedIds.size} sélectionné(s)`;
    } else {
        bar.style.display = 'none';
    }
}
function cancelBatch() {
    selectedIds.clear();
    document.querySelectorAll('.pcard.selected').forEach(c => c.classList.remove('selected'));
    document.getElementById('batch-bar').style.display = 'none';
}
function batchMarkWatched() {
    let savedState = JSON.parse(JSON.stringify(W_dates)); // Pour Undo
    let added = 0;
    selectedIds.forEach(id => { if(!W_dates[id]) { W_dates[id] = Date.now(); added++; } });
    localStorage.setItem('wl_watched_dates', JSON.stringify(W_dates));
    pushHistory(`Marqué ${added} film(s) vu(s)`, () => { W_dates = savedState; localStorage.setItem('wl_watched_dates', JSON.stringify(W_dates)); });
    cancelBatch(); go(); computeGamification();
}
function batchDelete() {
    if(!confirm(`Supprimer ces ${selectedIds.size} éléments ?`)) return;
    let oldCustom = [...customItems];
    selectedIds.forEach(id => { customItems = customItems.filter(i => i.id != id); });
    localStorage.setItem('wl_custom', JSON.stringify(customItems));
    pushHistory(`Supprimé ${selectedIds.size} élément(s)`, () => { customItems = oldCustom; localStorage.setItem('wl_custom', JSON.stringify(customItems)); workingData = rebuildData(); go();});
    workingData = rebuildData(); cancelBatch(); go();
}

// ================= MOTEUR DE RENDU (UI, TRI, FILTRES) =================
let currentView = 'poster';
let filterCat = 'all';
let searchQ = '';
let groupBySaga = false;

document.querySelectorAll('.nav-tab').forEach(b => b.onclick = (e) => {
    document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active')); e.target.classList.add('active');
    ['list','stats','fun','settings'].forEach(p => document.getElementById('page-'+p).style.display = 'none');
    document.getElementById('page-'+e.target.dataset.page).style.display = 'block';
    if(e.target.dataset.page === 'stats') computeGamification();
});

document.getElementById('btn-focus').onclick = () => document.body.classList.toggle('focus-mode');

document.querySelectorAll('.view-btn').forEach(b => b.onclick = (e) => {
    document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('on')); e.target.classList.add('on');
    currentView = e.target.dataset.view; go();
});

document.getElementById('btn-saga').onclick = (e) => { groupBySaga = !groupBySaga; e.target.classList.toggle('active-btn'); go(); };
document.querySelectorAll('.cat-tab').forEach(b => b.onclick = (e) => {
    document.querySelectorAll('.cat-tab').forEach(x => x.classList.remove('active')); e.target.classList.add('active');
    filterCat = e.target.dataset.cat; go();
});
document.getElementById('search').oninput = (e) => { searchQ = e.target.value.toLowerCase(); go(); };

const zoomSlider = document.getElementById('zoom-slider');
zoomSlider.oninput = (e) => document.documentElement.style.setProperty('--poster-size', e.target.value + 'px');

function fuzzySearch(needle, haystack) {
    let hLen = haystack.length, nLen = needle.length;
    if (nLen > hLen) return false;
    if (nLen === hLen) return needle === haystack;
    outer: for (let i = 0, j = 0; i < nLen; i++) {
        let nch = needle.charCodeAt(i);
        while (j < hLen) { if (haystack.charCodeAt(j++) === nch) continue outer; }
        return false;
    }
    return true;
}

function go() {
    let filtered = workingData.filter(i => {
        if (filterCat !== 'all' && i.type !== filterCat && !(filterCat==='anime' && i.type==='anime-film')) return false;
        if (searchQ) {
            let nameLower = i.name.toLowerCase();
            let real = apiCache[i.id]?.real?.toLowerCase() || "";
            // Recherche exacte, ou floue, ou réalisateur
            if(!nameLower.includes(searchQ) && !real.includes(searchQ) && !fuzzySearch(searchQ.replace(/\s+/g,''), nameLower.replace(/\s+/g,''))) return false;
        }
        return true;
    });

    // Tri Avancé
    let sort = document.getElementById('adv-sort').value;
    if(sort === 'rating-desc') filtered.sort((a,b) => (b.imdb||0) - (a.imdb||0));
    else if(sort === 'year-desc') filtered.sort((a,b) => (b.year||0) - (a.year||0));
    else if(sort === 'time-asc') filtered.sort((a,b) => (apiCache[a.id]?.time||999) - (apiCache[b.id]?.time||999));
    else if(sort === 'alpha-asc') filtered.sort((a,b) => a.name.localeCompare(b.name));
    else if(sort === 'random') filtered.sort(() => Math.random() - 0.5);

    let html = '';
    const TYPE_META={'anime':{l:'🎌 Animés', c:'var(--anime)'},'film':{l:'🎬 Films', c:'var(--film)'},'serie':{l:'📺 Séries', c:'var(--serie)'},'manga':{l:'📚 Mangas', c:'var(--manga)'}, 'anime-film':{l:'🎥 Film Animé', c:'var(--anime)'}};

    let containerClass = currentView === 'coverflow' ? 'coverflow-view' : currentView === 'compact' ? 'compact-view' : '';
    document.getElementById('scontainer').className = containerClass;

    if(groupBySaga) {
        let sagas = {}; let singles = [];
        filtered.forEach(i => { if(i.saga) { sagas[i.saga] = sagas[i.saga]||[]; sagas[i.saga].push(i); } else singles.push(i); });
        Object.keys(sagas).forEach(s => html += buildSection(s, sagas[s], 'var(--serie)'));
        if(singles.length) html += buildSection("Indépendants", singles, 'var(--muted)');
    } else {
        ['film','serie','anime','manga'].forEach(t => {
            let list = filtered.filter(i => i.type === t || (t==='anime'&&i.type==='anime-film'));
            if(list.length) html += buildSection(TYPE_META[t].l, list, TYPE_META[t].c);
        });
    }
    
    document.getElementById('scontainer').innerHTML = html || "<div style='padding:40px; text-align:center; color:var(--muted)'>Aucun résultat.</div>";
    
    // Attacher les events (Click pour Modale, Shift+Click pour Batch)
    document.querySelectorAll('.pcard').forEach(c => {
        c.onclick = (e) => {
            if(isBatchMode) { e.preventDefault(); toggleSelection(parseInt(c.dataset.id), c); }
            else { openModal(parseInt(c.dataset.id)); }
        }
    });
    
    document.getElementById('sttotal').textContent = workingData.length;
    document.getElementById('stwatched').textContent = Object.keys(W_dates).length;
}

function buildSection(title, list, color) {
    let inner = list.map(it => `
        <div class="pcard ${W_dates[it.id]?'done':''} ${selectedIds.has(it.id)?'selected':''}" data-id="${it.id}">
            <div class="no-poster">${it.emoji||'🎬'}</div>
            <div class="done-badge">✓</div>
            <div class="pcard-overlay"><div class="pcard-name">${it.name}</div><div style="font-size:.65rem; color:rgba(255,255,255,0.7);">${it.year||''} ${it.imdb?'⭐'+it.imdb:''}</div></div>
        </div>`).join('');
    return `<div class="section"><div class="sec-header"><span class="sec-line" style="background:${color}"></span><span class="sec-title">${title}</span></div><div class="grid-poster">${inner}</div></div>`;
}

// ================= TMDB & MODAL ENRICHIE =================
async function openModal(id) {
    const it = workingData.find(i => i.id == id);
    document.getElementById('modal-title').textContent = it.name;
    document.getElementById('modal-overlay').classList.add('open');
    document.getElementById('modal-ai-result').innerHTML = ''; // Reset IA
    
    const r = (id*33)%100, g = (id*66)%100, b = (id*99)%150+50;
    document.getElementById('modal').style.setProperty('--modal-bg', `rgba(${r},${g},${b}, 0.9)`);
    document.getElementById('modal-poster-wrap').innerHTML = `<div style="width:140px;height:210px;background:var(--border2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:4rem;flex-shrink:0;">${it.emoji||'🎬'}</div>`;

    document.getElementById('modal-genres').innerHTML = (it.genres||[]).map(g=>`<span class="api-tag">${g}</span>`).join('');
    document.getElementById('modal-meta').innerHTML = `<span class="api-tag">${it.year||''}</span> ${it.imdb?`<span class="api-tag" style="color:var(--gold)">⭐ ${it.imdb}</span>`:''}`;
    
    // Wiki Fandom URL
    document.getElementById('modal-wiki-link').href = `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(it.name)}`;

    let extras = document.getElementById('modal-api-extras');
    extras.innerHTML = 'Chargement TMDB...';

    if(!apiCache[id] && (it.type==='film' || it.type==='serie')) {
        try {
            let ep = it.type === 'serie' ? 'tv' : 'movie';
            const sr = await fetch(`https://api.themoviedb.org/3/search/${ep}?query=${encodeURIComponent(it.name)}&language=fr-FR`, {headers:{Authorization:`Bearer ${TMDB_TOKEN}`}});
            const sd = await sr.json();
            const tmdbId = sd.results?.[0]?.id;
            if(tmdbId) {
                const dr = await fetch(`https://api.themoviedb.org/3/${ep}/${tmdbId}?append_to_response=credits,release_dates,content_ratings&language=fr-FR`, {headers:{Authorization:`Bearer ${TMDB_TOKEN}`}});
                const d = await dr.json();
                
                let time = d.runtime ? d.runtime : (d.episode_run_time?.[0] || 0);
                let studio = d.production_companies?.[0]?.name || '';
                let country = d.production_countries?.[0]?.iso_3166_1 || '';
                let real = it.type==='film' ? d.credits?.crew?.find(c=>c.job==='Director')?.name : d.created_by?.[0]?.name;
                
                // Certification (Âge)
                let certif = '';
                if(it.type === 'film' && d.release_dates?.results) {
                    let us = d.release_dates.results.find(x=>x.iso_3166_1==='US');
                    if(us) certif = us.release_dates[0]?.certification;
                } else if (it.type === 'serie' && d.content_ratings?.results) {
                    let us = d.content_ratings.results.find(x=>x.iso_3166_1==='US');
                    if(us) certif = us.rating;
                }

                apiCache[id] = { time, studio, country, real, certif, ov: d.overview };
                localStorage.setItem('wl_api_cache', JSON.stringify(apiCache));
            }
        } catch(e){}
    }

    let c = apiCache[id];
    if(c) {
        let h = '';
        if(c.time) h += `<span class="api-tag">⏱️ ${Math.floor(c.time/60)}h${c.time%60}</span>`;
        if(c.certif) h += `<span class="api-tag" style="border-color:var(--red); color:var(--red)">🔞 ${c.certif}</span>`;
        if(c.country) h += `<span class="api-tag">🌍 ${c.country}</span>`;
        if(c.studio) h += `<span class="api-tag">🏢 ${c.studio}</span>`;
        if(c.real) h += `<span class="api-tag" style="cursor:pointer;" onclick="searchQ='${c.real}';go();document.getElementById('modal-close').click();">🎬 ${c.real}</span>`;
        extras.innerHTML = h;
        if(c.ov) document.getElementById('modal-overview').textContent = c.ov;
    } else { extras.innerHTML = ''; document.getElementById('modal-overview').textContent = "Pas de synopsis."; }

    let btn = document.getElementById('modal-watch-btn');
    btn.textContent = W_dates[id] ? '✅ Retirer des vus' : '🔲 Marquer Vu';
    btn.onclick = () => {
        let savedState = JSON.parse(JSON.stringify(W_dates));
        let action = "";
        if(W_dates[id]) { delete W_dates[id]; action = "Non vu"; } 
        else { W_dates[id] = Date.now(); action = "Vu"; }
        localStorage.setItem('wl_watched_dates', JSON.stringify(W_dates));
        pushHistory(`${action} : ${it.name}`, () => { W_dates = savedState; localStorage.setItem('wl_watched_dates', JSON.stringify(W_dates)); });
        openModal(id); go(); computeGamification();
    }
}
document.getElementById('modal-close').onclick = () => document.getElementById('modal-overlay').classList.remove('open');

// ================= GAMIFICATION & STATS (HEATMAP, WORDCLOUD) =================
function computeGamification() {
    let count = Object.keys(W_dates).length;
    let grade = count < 10 ? 'Novice 🍿' : count < 50 ? 'Amateur 🎥' : count < 150 ? 'Cinéphile 🎞️' : 'Expert 👑';
    document.getElementById('stat-grade').textContent = grade;

    // Temps total & Réalisateur Fétiche & Pays
    let totalMin = 0;
    let directors = {};
    let countries = {};
    let allTags = {};

    Object.keys(W_dates).forEach(id => {
        let it = workingData.find(i=>i.id==id);
        if(it && it.genres) it.genres.forEach(g => allTags[g] = (allTags[g]||0)+1);
        if(apiCache[id]) {
            if(apiCache[id].time) totalMin += apiCache[id].time;
            if(apiCache[id].real) directors[apiCache[id].real] = (directors[apiCache[id].real]||0)+1;
            if(apiCache[id].country) countries[apiCache[id].country] = (countries[apiCache[id].country]||0)+1;
        }
    });
    
    let jours = Math.floor(totalMin / (60 * 24));
    let heures = Math.floor((totalMin % (60 * 24)) / 60);
    document.getElementById('stat-time').textContent = `${jours}j ${heures}h`;

    let topDir = Object.entries(directors).sort((a,b)=>b[1]-a[1])[0];
    document.getElementById('stat-director').textContent = topDir ? `${topDir[0]} (${topDir[1]} vus)` : '—';

    // Rendu Répartition Pays
    let topCountries = Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,5);
    document.getElementById('chart-countries').innerHTML = topCountries.map(c => `<div><span style="display:inline-block;width:30px">${c[0]}</span> <div style="display:inline-block;height:8px;background:var(--film);width:${Math.min(c[1]*10, 100)}px;border-radius:4px"></div> ${c[1]}</div>`).join('');

    // Rendu Nuage de Tags (Wordcloud CSS simple)
    let tagHtml = '';
    let maxTag = Math.max(...Object.values(allTags), 1);
    Object.entries(allTags).forEach(([tag, val]) => {
        let size = 0.6 + (val / maxTag) * 1.5; // Scale entre 0.6em et 2.1em
        tagHtml += `<span class="cloud-word" style="font-size:${size}em" onclick="searchQ='${tag}';go();document.querySelector('[data-page=list]').click();">${tag}</span>`;
    });
    document.getElementById('wordcloud').innerHTML = tagHtml || 'Regarde des films pour générer des tags !';

    renderHeatmap();
    renderOscars();
}

function renderHeatmap() {
    let container = document.getElementById('heatmap-container');
    let html = '';
    // Simplification : 365 cases (1 an)
    let daysWithActivity = {};
    Object.values(W_dates).forEach(ts => {
        let d = new Date(ts).toISOString().split('T')[0];
        daysWithActivity[d] = (daysWithActivity[d]||0)+1;
    });

    let today = new Date();
    for(let i=364; i>=0; i--) {
        let d = new Date(today); d.setDate(d.getDate() - i);
        let dStr = d.toISOString().split('T')[0];
        let count = daysWithActivity[dStr] || 0;
        let lvl = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : 3;
        html += `<div class="heatmap-day" data-level="${lvl}" title="${dStr} : ${count} vus"></div>`;
    }
    container.innerHTML = html;
}

function renderOscars() {
    const cats = [{id:'f',n:'🎬 Meilleur Film'},{id:'s',n:'📺 Meilleure Série'},{id:'v',n:'🎨 Claque Visuelle'},{id:'d',n:'🗑️ Pire Déception'}];
    const vus = workingData.filter(i => W_dates[i.id]);
    let opts = `<option value="">-- Sélectionner --</option>` + vus.map(i=>`<option value="${i.id}">${i.emoji||''} ${i.name}</option>`).join('');
    
    document.getElementById('oscars-grid').innerHTML = cats.map(c => `
        <div class="oscar-card">
            <div style="color:var(--gold);font-weight:bold;margin-bottom:10px">${c.n}</div>
            <select class="settings-input" onchange="userOscars['${c.id}']=this.value;localStorage.setItem('wl_oscars',JSON.stringify(userOscars))">
                ${opts.replace(`value="${userOscars[c.id]||''}"`, `value="${userOscars[c.id]||''}" selected`)}
            </select>
        </div>
    `).join('');
}

// ================= FONCTIONS IA (GEMINI) =================
async function geminiRecommendSimilar() {
    if(!GEMINI_API_KEY) { alert("Configure ta clé IA dans les paramètres !"); return; }
    const title = document.getElementById('modal-title').textContent;
    const listNames = workingData.map(i=>i.name).join(', ');
    const prompt = `Je regarde "${title}". Trouve-moi 3 œuvres SIMILAIRES qui sont PRÉSENTES DANS CETTE LISTE EXACTE : [${listNames}]. Ne réponds que par les 3 noms séparés par des virgules.`;
    
    document.getElementById('modal-ai-result').innerHTML = "<em>L'IA fouille ta collection... ⏳</em>";
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{parts: [{text: prompt}]}] })
        });
        const data = await res.json();
        document.getElementById('modal-ai-result').innerHTML = "<strong>💡 L'IA te conseille :</strong> " + data.candidates[0].content.parts[0].text;
    } catch(e) { document.getElementById('modal-ai-result').innerHTML = "Erreur IA."; }
}

async function geminiQuiz() {
    if(!GEMINI_API_KEY) { alert("Configure ta clé !"); return; }
    const title = document.getElementById('modal-title').textContent;
    document.getElementById('modal-ai-result').innerHTML = "<em>Génération du Quiz... ⏳</em>";
    const prompt = `Génère une question de quiz très difficile (trivia) sur l'œuvre "${title}". Donne la question, puis saute une ligne, puis donne la réponse.`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{parts: [{text: prompt}]}] })
        });
        const data = await res.json();
        let txt = data.candidates[0].content.parts[0].text.replace('\n', '<br><br><span style="color:var(--muted)">Réponse (surligne pour voir): </span><span style="background:#000; color:#000;">');
        document.getElementById('modal-ai-result').innerHTML = `<strong>🎯 Mini-Quiz :</strong><br>${txt}</span>`;
    } catch(e) { document.getElementById('modal-ai-result').innerHTML = "Erreur IA."; }
}

async function analyzeMood() {
    if(!GEMINI_API_KEY) { alert("Configure ta clé !"); return; }
    const vus = workingData.filter(i => W_dates[i.id]).map(i=>i.name).slice(-10).join(', ');
    if(!vus) { alert("Regarde d'abord quelques films !"); return; }
    
    document.getElementById('mood-result').textContent = "Analyse psychologique en cours... ⏳";
    const prompt = `Voici les derniers films/séries que j'ai regardés : ${vus}. En une seule phrase très courte et un peu sarcastique, dis-moi quel est mon état psychologique ou mon "mood" du moment basé là-dessus.`;
    
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{parts: [{text: prompt}]}] })
        });
        const data = await res.json();
        document.getElementById('mood-result').textContent = '"' + data.candidates[0].content.parts[0].text.trim() + '"';
    } catch(e) { document.getElementById('mood-result').textContent = "Erreur."; }
}

// ================= LE COIN FUN =================
function absoluteAIChoice() {
    let unatched = workingData.filter(i => !W_dates[i.id]);
    if(unatched.length === 0) { alert("Tu as tout vu !"); return; }
    let choice = unatched[Math.floor(Math.random() * unatched.length)];
    alert(`L'IA a décidé. Tu dois regarder : ${choice.name}. Ouverture du lien...`);
    window.open(`https://cinehd.cc/search?q=${encodeURIComponent(choice.name)}`, '_blank');
}

let duelItems = [];
function startDuel() {
    let vus = workingData.filter(i => W_dates[i.id]);
    if(vus.length < 2) { alert("Tu dois avoir vu au moins 2 trucs !"); return; }
    // Picks 2 random
    let a = vus[Math.floor(Math.random() * vus.length)];
    let b = vus[Math.floor(Math.random() * vus.length)];
    while(a.id === b.id) b = vus[Math.floor(Math.random() * vus.length)];
    
    document.getElementById('duel-arena').innerHTML = `
        <div class="g-card" style="cursor:pointer; width:150px" onclick="duelWin('${a.name}')">
            <div style="font-size:3rem">${a.emoji||'🎬'}</div>
            <h4>${a.name}</h4>
        </div>
        <div style="font-family:'Syne'; font-size:2rem; color:var(--red)">VS</div>
        <div class="g-card" style="cursor:pointer; width:150px" onclick="duelWin('${b.name}')">
            <div style="font-size:3rem">${b.emoji||'🎬'}</div>
            <h4>${b.name}</h4>
        </div>
    `;
    document.getElementById('duel-overlay').classList.add('open');
}
function duelWin(name) {
    showToast(`${name} remporte le duel !`);
    document.getElementById('duel-overlay').classList.remove('open');
}

// ================= IMPORTS & EXPORTS =================
function exportCSV() {
    let csv = "Titre,Année,Type,Note IMDb,Vu\n";
    workingData.forEach(i => {
        csv += `"${i.name}",${i.year||''},${i.type},${i.imdb||''},${W_dates[i.id]?'Oui':'Non'}\n`;
    });
    let blob = new Blob([csv], { type: 'text/csv' });
    let url = window.URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url; a.download = 'MaWatchlist.csv'; a.click();
}

function exportPDF() {
    // Faux export PDF (Ouvre la boîte de dialogue d'impression navigateur formatée)
    window.print();
}

function importCSV(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        let text = ev.target.result;
        let lines = text.split('\n');
        let added = 0;
        // Logic hyper basique pour CSV Letterboxd (Name, Year...)
        for(let i=1; i<lines.length; i++) {
            let cols = lines[i].split(',');
            if(cols.length > 1) {
                let name = cols[1]?.replace(/"/g,'').trim();
                let year = parseInt(cols[2]);
                if(name && !workingData.find(x=>x.name.toLowerCase()===name.toLowerCase())) {
                    let newItem = {id: Date.now()+i, name: name, year: year, type: 'film', genres:[]};
                    customItems.push(newItem);
                    added++;
                }
            }
        }
        localStorage.setItem('wl_custom', JSON.stringify(customItems));
        workingData = rebuildData();
        go();
        showToast(`Import réussi : ${added} films ajoutés !`);
    };
    reader.readAsText(file);
}

// Init finale
go();