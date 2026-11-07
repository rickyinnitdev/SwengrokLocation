    import { MODE_CONFIG, REGION_CONFIG } from './data/modes.js';
    import { LOCATIONS_DB } from './data/locations.js';
    import { t, getLang, setLang, applyI18n, onLangChange } from './i18n.js';
    import { mapOptions, applyMapProfile } from './map/profile.js';
    import { AVATAR_LOCKS, UNLOCK_LABELS, isLocked as isAvatarLocked } from './data/avatar-unlocks.js';
    import { renderStandings, renderFinal, previousOrderFrom, sortByRoundPoints } from './ui/standings.js';

    // ============================================================
    //  AUDIO SYNTHESIZER (Web Audio API)
    // ============================================================
    let isSoundMuted = false;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playBeep(freq = 440, type = 'sine', duration = 0.12) {
        if (isSoundMuted) return;
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }

    function playSuccessChime() {
        setTimeout(() => playBeep(523.25, 'triangle', 0.18), 0);
        setTimeout(() => playBeep(659.25, 'triangle', 0.18), 90);
        setTimeout(() => playBeep(783.99, 'triangle', 0.3), 180);
    }

    function playBuzzer() {
        playBeep(180, 'sawtooth', 0.35);
    }

    function toggleMute() {
        isSoundMuted = !isSoundMuted;
        const dockSound = document.getElementById('dock-sound');
        if (dockSound) dockSound.textContent = isSoundMuted ? '🔇' : '🔊';
        const btn = document.getElementById('sound-toggle-btn');
        if (btn) {
            btn.innerHTML = isSoundMuted
                ? '<svg class="icon" viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>'
                : '<svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
        }
    }

    let toastTimer = null;
    function showToast(msg) {
        const el = document.getElementById('toast-notification');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('active');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('active'), 2500);
    }

    // ============================================================
    //  SAFE RENDERING HELPERS
    // ============================================================
    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }

    function cleanText(value, fallback, maxLen = 40) {
        const text = typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
        return text || fallback;
    }

    // Profiles from other players are untrusted: keep only known fields with safe values
    function sanitizeProfile(profile) {
        const p = (profile && typeof profile === 'object') ? profile : {};
        return {
            name: cleanText(p.name, 'Explorer', 24),
            title: cleanText(p.title, 'Explorer', 60),
            avatarType: p.avatarType === 'image' ? 'image' : 'custom',
            avatarConfig: sanitizeAvatarConfig(p.avatarConfig)
        };
    }

    // ============================================================
    //  CURATED PHNOM PENH COORDINATES DATABASE (110 LOCATIONS ACROSS 14 KHANS)
    // ============================================================
    const ALL_LOCATIONS = [...LOCATIONS_DB.landmarks, ...LOCATIONS_DB.classic];
    const WORLD_LOCATIONS = LOCATIONS_DB.countries;
    const CAMBODIA_LOCATIONS = LOCATIONS_DB.cambodia;
    const ASIA_LOCATIONS = LOCATIONS_DB.asia;
    const PP_CENTER = [11.5564, 104.9282];

    const ALL_COUNTRIES = [...new Set(WORLD_LOCATIONS.map(l => l.country))];

    const COUNTRY_FLAGS = {
        "France": "🇫🇷", "Italy": "🇮🇹", "United Kingdom": "🇬🇧", "Spain": "🇪🇸",
        "Germany": "🇩🇪", "Netherlands": "🇳🇱", "Czech Republic": "🇨🇿", "Greece": "🇬🇷",
        "Portugal": "🇵🇹", "Austria": "🇦🇹", "Russia": "🇷🇺", "Sweden": "🇸🇪",
        "Denmark": "🇩🇰", "Finland": "🇫🇮", "Poland": "🇵🇱", "Hungary": "🇭🇺",
        "Croatia": "🇭🇷", "Iceland": "🇮🇸", "Switzerland": "🇨🇭", "Belgium": "🇧🇪",
        "Ireland": "🇮🇪", "Romania": "🇷🇴", "Norway": "🇳🇴", "United States": "🇺🇸",
        "Brazil": "🇧🇷", "Canada": "🇨🇦", "Mexico": "🇲🇽", "Argentina": "🇦🇷",
        "Chile": "🇨🇱", "Colombia": "🇨🇴", "Costa Rica": "🇨🇷", "Peru": "🇵🇪",
        "Japan": "🇯🇵", "India": "🇮🇳", "South Korea": "🇰🇷", "UAE": "🇦🇪",
        "Turkey": "🇹🇷", "Taiwan": "🇹🇼", "Hong Kong": "🇭🇰", "Nepal": "🇳🇵",
        "Sri Lanka": "🇱🇰", "Jordan": "🇯🇴", "Thailand": "🇹🇭", "Vietnam": "🇻🇳",
        "Indonesia": "🇮🇩", "Malaysia": "🇲🇾", "Singapore": "🇸🇬", "Philippines": "🇵🇭",
        "Cambodia": "🇰🇭", "Laos": "🇱🇦", "Myanmar": "🇲🇲", "Egypt": "🇪🇬",
        "South Africa": "🇿🇦", "Morocco": "🇲🇦", "Kenya": "🇰🇪", "Nigeria": "🇳🇬",
        "Ghana": "🇬🇭", "Australia": "🇦🇺", "New Zealand": "🇳🇿"
    };

    const COUNTRY_CENTERS = {
        "France": { lat: 46.6033, lng: 1.8883 },
        "Italy": { lat: 41.8719, lng: 12.5674 },
        "United Kingdom": { lat: 55.3781, lng: -3.4360 },
        "Spain": { lat: 40.4637, lng: -3.7492 },
        "Germany": { lat: 51.1657, lng: 10.4515 },
        "Netherlands": { lat: 52.1326, lng: 5.2913 },
        "Czech Republic": { lat: 49.8175, lng: 15.4730 },
        "Greece": { lat: 39.0742, lng: 21.8243 },
        "Portugal": { lat: 39.3999, lng: -8.2245 },
        "Austria": { lat: 47.5162, lng: 14.5501 },
        "Russia": { lat: 55.7558, lng: 37.6173 },
        "Sweden": { lat: 60.1282, lng: 18.6435 },
        "Denmark": { lat: 56.2639, lng: 9.5018 },
        "Finland": { lat: 61.9241, lng: 25.7482 },
        "Poland": { lat: 51.9194, lng: 19.1451 },
        "Hungary": { lat: 47.1625, lng: 19.5033 },
        "Croatia": { lat: 45.1000, lng: 15.2000 },
        "Iceland": { lat: 64.9631, lng: -19.0208 },
        "Switzerland": { lat: 46.8182, lng: 8.2275 },
        "Belgium": { lat: 50.5039, lng: 4.4699 },
        "Ireland": { lat: 53.4129, lng: -8.2439 },
        "Romania": { lat: 45.9432, lng: 24.9668 },
        "Norway": { lat: 60.4720, lng: 8.4689 },
        "United States": { lat: 37.0902, lng: -95.7129 },
        "Brazil": { lat: -14.2350, lng: -51.9253 },
        "Canada": { lat: 56.1304, lng: -106.3468 },
        "Mexico": { lat: 23.6345, lng: -102.5528 },
        "Argentina": { lat: -38.4161, lng: -63.6167 },
        "Chile": { lat: -35.6751, lng: -71.5430 },
        "Colombia": { lat: 4.5709, lng: -74.2973 },
        "Costa Rica": { lat: 9.7489, lng: -83.7534 },
        "Peru": { lat: -9.1900, lng: -75.0152 },
        "Japan": { lat: 36.2048, lng: 138.2529 },
        "India": { lat: 20.5937, lng: 78.9629 },
        "South Korea": { lat: 35.9078, lng: 127.7669 },
        "UAE": { lat: 23.4241, lng: 53.8478 },
        "Turkey": { lat: 38.9637, lng: 35.2433 },
        "Taiwan": { lat: 23.6978, lng: 120.9605 },
        "Hong Kong": { lat: 22.3193, lng: 114.1694 },
        "Nepal": { lat: 28.3949, lng: 84.1240 },
        "Sri Lanka": { lat: 7.8731, lng: 80.7718 },
        "Jordan": { lat: 30.5852, lng: 36.2384 },
        "Thailand": { lat: 15.8700, lng: 100.9925 },
        "Vietnam": { lat: 14.0583, lng: 108.2772 },
        "Indonesia": { lat: -0.7893, lng: 113.9213 },
        "Malaysia": { lat: 4.2105, lng: 101.9758 },
        "Singapore": { lat: 1.3521, lng: 103.8198 },
        "Philippines": { lat: 12.8797, lng: 121.7740 },
        "Cambodia": { lat: 12.5657, lng: 104.9910 },
        "Laos": { lat: 19.8563, lng: 102.4955 },
        "Myanmar": { lat: 21.9162, lng: 95.9560 },
        "Egypt": { lat: 26.8206, lng: 30.8025 },
        "South Africa": { lat: -30.5595, lng: 22.9375 },
        "Morocco": { lat: 31.7917, lng: -7.0926 },
        "Kenya": { lat: -0.0236, lng: 37.9062 },
        "Nigeria": { lat: 9.0820, lng: 8.6753 },
        "Ghana": { lat: 7.9465, lng: -1.0232 },
        "Australia": { lat: -25.2744, lng: 133.7751 },
        "New Zealand": { lat: -40.9006, lng: 174.8860 }
    };

    // OSM khan names -> PP_KHANS ids (only the ones that differ are listed).
    const KHAN_BY_OSM_ID = new Proxy({ 'Prampir Makara': '7 Makara', 'Chamkar Mon': 'Chamkarmon', 'Pou Senchey': 'Por Senchey', 'Boeng Keng Kang': 'Boeung Keng Kang' }, { get: (m, k) => m[k] || k });
    const PP_KHANS = [
        { id: "Daun Penh", name: "Daun Penh (Royal Palace, Riverside)", icon: "🏛️", lat: 11.568, lng: 104.928 },
        { id: "Chamkarmon", name: "Chamkarmon (Russian Market, Bokor)", icon: "🛍️", lat: 11.540, lng: 104.920 },
        { id: "Boeung Keng Kang", name: "BKK / Boeung Keng Kang", icon: "☕", lat: 11.552, lng: 104.926 },
        { id: "Toul Kork", name: "Toul Kork (TK Avenue, Villas)", icon: "🏡", lat: 11.583, lng: 104.898 },
        { id: "7 Makara", name: "7 Makara (Olympic, Orussey)", icon: "🏟️", lat: 11.562, lng: 104.914 },
        { id: "Chroy Changvar", name: "Chroy Changvar (Mekong Peninsula)", icon: "🌉", lat: 11.587, lng: 104.930 },
        { id: "Sen Sok", name: "Sen Sok (Aeon 2, Makro)", icon: "🏢", lat: 11.590, lng: 104.878 },
        { id: "Mean Chey", name: "Mean Chey (Stung Meanchey, Aeon 3)", icon: "🌆", lat: 11.528, lng: 104.910 },
        { id: "Russey Keo", name: "Russey Keo (KM 6, Iron Bridge)", icon: "🚢", lat: 11.602, lng: 104.918 },
        { id: "Chbar Ampov", name: "Chbar Ampov (NR1, Koh Norea)", icon: "🏝️", lat: 11.540, lng: 104.950 },
        { id: "Por Senchey", name: "Por Senchey (Airport, Chom Chao)", icon: "✈️", lat: 11.546, lng: 104.844 },
        { id: "Dangkao", name: "Dangkao (Killing Fields, South)", icon: "🌾", lat: 11.485, lng: 104.902 },
        { id: "Kamboul", name: "Kamboul (PPSEZ Special Zone)", icon: "🏭", lat: 11.517, lng: 104.778 },
        { id: "Prek Pnov", name: "Prek Pnov (North Gateway)", icon: "🎣", lat: 11.649, lng: 104.887 }
    ];

    // ============================================================
    //  ANTI-REPEAT & RANDOM LOCATION ENGINE
    // ============================================================
    const HISTORY_KEY = 'wanderpenh_seen_history';
    const MAX_RECENT_HISTORY = 1500;
    const ROTATION_KEY = 'wanderpenh_location_rotation_v2';

    function getSeenHistory() {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string').slice(-MAX_RECENT_HISTORY) : [];
        } catch (e) {
            return [];
        }
    }

    function recordSeenLocation(locId) {
        if (!locId) return;
        try {
            let hist = getSeenHistory();
            hist = hist.filter(id => id !== locId);
            hist.push(locId);
            if (hist.length > MAX_RECENT_HISTORY) {
                hist = hist.slice(hist.length - MAX_RECENT_HISTORY);
            }
            localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
            // Share observed party spots with future solo/AI decks, too.
            let rotation;
            try { rotation = JSON.parse(localStorage.getItem(ROTATION_KEY)); } catch {}
            if (rotation && typeof rotation === 'object') {
                rotation.history = [...(rotation.history || []).filter(id => id !== locId), locId].slice(-MAX_RECENT_HISTORY);
                for (const key of Object.keys(rotation.decks || {})) rotation.decks[key] = rotation.decks[key].filter(id => id !== locId);
                localStorage.setItem(ROTATION_KEY, JSON.stringify(rotation));
            }
        } catch (e) {
            console.warn('Could not save seen history', e);
        }
    }

    function getRandomHeading() {
        return WanderRotation.rotationRandom(360);
    }

    function getNextUniqueLocation() {
        const pool = getModeLocationPool();
        let rotation;
        try { rotation = JSON.parse(localStorage.getItem(ROTATION_KEY)); } catch {}
        if (!rotation || typeof rotation !== 'object') rotation = { history: getSeenHistory() };
        const pKey = MODE_CONFIG[currentMode].pool || 'all';
        const key = (pKey === 'landmarks' || pKey === 'countries' || pKey === 'cambodia' || pKey === 'asia') ? pKey : 'all';
        const picked = WanderRotation.drawLocations(pool, 1, rotation, key, gameState.usedLocIds)[0];
        if (!picked) throw new Error('No unused locations left in this match');
        try { localStorage.setItem(ROTATION_KEY, JSON.stringify(rotation)); } catch {}
        gameState.usedLocIds.push(picked.id);
        recordSeenLocation(picked.id);
        return picked;
    }

    // ============================================================
    //  PROFILE & AVATAR STATE
    // ============================================================
    let userProfile = {
        name: 'Explorer',
        title: 'Daun Penh Tuk-Tuk Master',
        avatarType: 'custom',
        avatarConfig: {
            hairStyle: 'fluffy',
            hairColor: '#261b2b',
            eyeStyle: 'chill',
            mouthStyle: 'neutral',
            jacketStyle: 'cardigan',
            jacketColor: '#38bdf8',
            shirtColor: '#ffffff',
            bg: '#fed049',
            squiggles: 'electric',
            earrings: 'hoops',
            skinColor: '#fee0d2',
            blush: true
        },
        aura: '#f59e0b',
        auraGlow: 'rgba(245,158,11,0.5)'
    };

    function renderAvatarHTML(profile, width = '100%', height = '100%') {
        if (!profile) return '🛵';
        if (profile.avatarType === 'image') {
            return `<img src="avatar_default.png" alt="" style="width:${width};height:${height};object-fit:cover;border-radius:50%;display:block;">`;
        }
        if (typeof generateAvatarSVG === 'function') {
            return generateAvatarSVG(profile.avatarConfig || AVATAR_DEFAULTS);
        }
        return '🛵';
    }

    function loadProfile() {
        try {
            const saved = localStorage.getItem('wanderpenh_profile');
            if (saved) {
                const parsed = JSON.parse(saved);
                userProfile = { ...userProfile, ...parsed };
                if (parsed.avatarConfig) {
                    userProfile.avatarConfig = { ...AVATAR_DEFAULTS, ...parsed.avatarConfig };
                }
            }
        } catch (e) {}
        updateProfileUI();
    }

    function updateProfileUI() {
        document.getElementById('home-profile-name').textContent = userProfile.name;
        document.getElementById('home-profile-title').textContent = userProfile.title;
        const circle = document.getElementById('home-avatar-circle');
        if (circle) circle.innerHTML = renderAvatarHTML(userProfile, '100%', '100%');

        const hudAvatar = document.getElementById('hud-player-avatar');
        if (hudAvatar) hudAvatar.innerHTML = renderAvatarHTML(userProfile, '100%', '100%');
        const hudName = document.getElementById('hud-player-name');
        if (hudName) hudName.textContent = userProfile.name;
    }

    // Character Studio (Part D). Categories hold sections; each section edits one config key.
    // Option ids come from AVATAR_ALLOWED (avatar_generator.js), so the editor can never offer an unknown value.
    const COLOR_SWATCHES = {
        skinColor: ['#fee0d2', '#f9d2b4', '#f1c27d', '#e0ac69', '#c68642', '#a9683a', '#8d5524', '#5c3a21', '#3b2417', '#ffe4ec'],
        hairColor: ['#261b2b', '#4a2810', '#8a5a2b', '#d97706', '#0284c7', '#db2777', '#f1f5f9', '#7c3aed', '#16a34a', '#9ca3af'],
        jacketColor: ['#38bdf8', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#1e293b', '#ffffff', '#c62828'],
        bg: ['#fed049', '#fda4af', '#7dd3fc', '#86efac', '#c4b5fd', '#fdba74', '#e2e8f0', '#134e4a']
    };
    const STUDIO_CATEGORIES = {
        face: { icon: '🙂', sections: [['eyeStyle'], ['eyebrows'], ['mouthStyle'], ['facialHair'], ['skinColor', 'color'], ['earrings']] },
        hair: { icon: '💇', sections: [['hairStyle'], ['hairColor', 'color'], ['headwear']] },
        clothes: { icon: '👕', sections: [['jacketStyle'], ['jacketColor', 'color'], ['accessory']] },
        extras: { icon: '✨', sections: [['squiggles'], ['frame']] },
        background: { icon: '🖼️', sections: [['bgStyle'], ['bg', 'color']] }
    };
    // Old tab names still work (tests and saved links call setStudioOption('hair', 'beanie')).
    const STUDIO_ALIAS = { hair: 'hairStyle', jacket: 'jacketStyle', eye: 'eyeStyle', mouth: 'mouthStyle', skin: 'skinColor' };
    const STUDIO_CAT_OF = { hair: 'hair', hairColor: 'hair', jacket: 'clothes', jacketColor: 'clothes', squiggles: 'extras', eye: 'face' };
    const UNLOCKS_KEY = 'wanderpenh_unlocks';
    let userUnlocks = [];
    try { userUnlocks = JSON.parse(localStorage.getItem(UNLOCKS_KEY) || '[]'); } catch (e) {}
    function setUnlocks(list) {
        if (!Array.isArray(list)) return;
        userUnlocks = list.filter(x => typeof x === 'string');
        try { localStorage.setItem(UNLOCKS_KEY, JSON.stringify(userUnlocks)); } catch (e) {}
    }

    let activeStudioTab = 'face';
    let editingAvatar = null;
    let studioHistory = [];

    function openProfileModal() {
        if (isRealMultiplayer() && serverMatch) { showToast(t('toast.customizeBetween')); return; }
        document.getElementById('profile-name-input').value = userProfile.name;
        document.getElementById('profile-title-select').value = userProfile.title;

        editingAvatar = {
            avatarType: userProfile.avatarType || 'custom',
            avatarConfig: sanitizeAvatarConfig(userProfile.avatarConfig)
        };
        studioHistory = [];

        switchStudioTab('face');
        updateStudioPreview();
        document.getElementById('profile-modal').classList.add('active');
    }

    function studioKey(tab) { return STUDIO_ALIAS[tab] || tab; }
    function studioLabel(key) { return t('studio.slot.' + key); }
    function studioOptionName(key, id) { return id.replace(/([A-Z])/g, ' $1').replace(/^./, ch => ch.toUpperCase()); }
    function lockText(slot, id) {
        const need = AVATAR_LOCKS[slot]?.[id];
        return need ? UNLOCK_LABELS[need][getLang() === 'km' ? 'km' : 'en'] : '';
    }

    function switchStudioTab(tab) {
        const cat = STUDIO_CATEGORIES[tab] ? tab : (STUDIO_CAT_OF[tab] || 'face');
        activeStudioTab = cat;
        document.querySelectorAll('.studio-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.cat === cat);
            b.setAttribute('aria-selected', String(b.dataset.cat === cat));
        });
        const container = document.getElementById('studio-picker-container');
        if (!container || !editingAvatar) return;
        const cfg = editingAvatar.avatarConfig;
        container.style.display = 'block';
        container.innerHTML = STUDIO_CATEGORIES[cat].sections.map(([key, kind]) => {
            const head = `<div class="studio-section-title">${escapeHTML(studioLabel(key))}</div>`;
            if (kind === 'color') {
                return head + `<div class="studio-swatch-row">${COLOR_SWATCHES[key].map(color => `
                    <button type="button" class="color-swatch-opt ${cfg[key] === color ? 'selected' : ''}" style="background:${color};" aria-label="${color}" onclick="setStudioOption('${key}', '${color}')"></button>`).join('')}</div>`;
            }
            return head + `<div class="studio-thumb-grid">${AVATAR_ALLOWED[key].map(id => {
                const locked = isAvatarLocked(key, id, userUnlocks);
                // Each thumbnail shows the real option on the avatar being edited.
                const thumb = generateAvatarSVG({ ...cfg, [key]: id });
                return `<button type="button" class="studio-thumb ${cfg[key] === id ? 'selected' : ''} ${locked ? 'locked' : ''}" data-slot="${key}" data-id="${id}" aria-label="${escapeHTML(studioOptionName(key, id))}${locked ? ' 🔒' : ''}" title="${escapeHTML(locked ? lockText(key, id) : studioOptionName(key, id))}" onclick="setStudioOption('${key}', '${id}')">
                    <span class="studio-thumb-art">${thumb}</span>${locked ? '<span class="studio-lock">🔒</span>' : ''}</button>`;
            }).join('')}</div>`;
        }).join('');
    }

    function pushStudioHistory() {
        studioHistory.push({ ...editingAvatar.avatarConfig });
        if (studioHistory.length > 40) studioHistory.shift();
    }

    function setStudioOption(tab, val) {
        if (!editingAvatar) return;
        const key = studioKey(tab);
        if (isAvatarLocked(key, val, userUnlocks)) { showToast(`🔒 ${lockText(key, val)}`); return; }
        const next = sanitizeAvatarConfig({ ...editingAvatar.avatarConfig, [key]: val });
        if (next[key] !== val) return; // not an allowed value
        pushStudioHistory();
        editingAvatar.avatarConfig = next;
        playBeep(580, 'sine', 0.05);
        updateStudioPreview();
        switchStudioTab(STUDIO_CATEGORIES[tab] ? tab : (STUDIO_CAT_OF[tab] || activeStudioTab));
    }

    function randomizeCharacter() {
        if (!editingAvatar) return;
        pushStudioHistory();
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const next = { ...editingAvatar.avatarConfig };
        for (const [key, values] of Object.entries(AVATAR_ALLOWED)) {
            if (key === 'mode') continue;
            const open = values.filter(v => !isAvatarLocked(key, v, userUnlocks));
            next[key] = pick(open);
        }
        for (const key of Object.keys(COLOR_SWATCHES)) next[key] = pick(COLOR_SWATCHES[key]);
        editingAvatar.avatarConfig = sanitizeAvatarConfig(next);
        playBeep(720, 'triangle', 0.08);
        updateStudioPreview();
        switchStudioTab(activeStudioTab);
    }

    function undoStudio() {
        if (!editingAvatar || !studioHistory.length) return;
        editingAvatar.avatarConfig = studioHistory.pop();
        updateStudioPreview();
        switchStudioTab(activeStudioTab);
    }

    function resetStudio() {
        if (!editingAvatar) return;
        pushStudioHistory();
        editingAvatar.avatarConfig = sanitizeAvatarConfig({});
        updateStudioPreview();
        switchStudioTab(activeStudioTab);
    }

    function updateStudioPreview() {
        const preview = document.getElementById('studio-avatar-preview');
        if (preview && editingAvatar) {
            preview.innerHTML = renderAvatarHTML(editingAvatar, '100%', '100%');
        }
    }

    function saveProfile() {
        userProfile.name = document.getElementById('profile-name-input').value.trim() || 'Explorer';
        userProfile.title = document.getElementById('profile-title-select').value;
        if (editingAvatar) {
            userProfile.avatarConfig = { ...editingAvatar.avatarConfig };
        }
        try { localStorage.setItem('wanderpenh_profile', JSON.stringify(userProfile)); } catch {}
        if (isRealMultiplayer() && !serverMatch && roomReady) sendRoomMessage({ type: 'UPDATE_PROFILE', profile: sanitizeProfile(userProfile) });
        updateProfileUI();
        closeModal('profile-modal');
        playSuccessChime();
        showToast(t('toast.profileSaved'));
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    }

    // ============================================================
    //  LANGUAGE, REGION, THEME & HELP
    // ============================================================
    const REGION_KEY = 'wanderpenh_region';
    const THEME_KEY = 'wanderpenh_theme';
    const COACH_KEY = 'wanderpenh_coach_done';
    let currentRegion = 'kh';
    let currentMode = 'classic';

    const MODE_ICONS = {
        temple: '<path d="M4 20h16M6 20v-7h12v7M8 13V9h8v4M10 9V6h4v3M11 6 12 3l1 3M9 20v-3h6v3"/>',
        city: '<path d="M3 21h18M5 21V9h5v12M14 21V5h5v16M7 12h1M7 15h1M16 8h1M16 11h1M16 14h1M16 17h1"/>',
        bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
        target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
        eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18"/>',
        flag: '<path d="M5 21V4M5 4c4-2 7 2 11 0v9c-4 2-7-2-11 0"/>',
        compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
        flame: '<path d="M12 22c4 0 7-2.7 7-6.5 0-4.5-5-6-4-12-3 1.5-5 4.5-5 7.5 0 1.2.3 2.2.8 3-1.5-.4-2.6-1.6-3.3-3C6.4 13.4 5 15 5 17c0 3 3.2 5 7 5Z"/>',
        lotus: '<path d="M12 21c-5 0-9-3-9-6 2 0 3.6.6 5 1.7C7.4 13.4 9 10 12 7c3 3 4.6 6.4 4 9.7 1.4-1.1 3-1.7 5-1.7 0 3-4 6-9 6Z"/><path d="M12 7c-1-2-1-4 0-5 1 1 1 3 0 5Z"/>'
    };

    function modeIcon(name) {
        return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${MODE_ICONS[name] || MODE_ICONS.compass}</svg>`;
    }

    function modeName(m) {
        return getLang() === 'km' && m.nameKm ? m.nameKm : m.name;
    }

    function modeDesc(m) {
        return getLang() === 'km' && m.descKm ? m.descKm : m.desc;
    }

    function readSavedRegion() {
        try {
            const saved = localStorage.getItem(REGION_KEY);
            return saved === 'kh' || saved === 'world' ? saved : null;
        } catch (e) { return null; }
    }

    function regionModes(region = currentRegion) {
        return Object.entries(MODE_CONFIG).filter(([, m]) => m.region === region);
    }

    function defaultModeForRegion(region = currentRegion) {
        return region === 'world' ? 'world' : 'classic';
    }

    function setRegion(region, { persist = true, reveal = false } = {}) {
        currentRegion = region === 'world' ? 'world' : 'kh';
        if (persist) {
            try { localStorage.setItem(REGION_KEY, currentRegion); } catch (e) {}
        }
        if (!MODE_CONFIG[currentMode] || MODE_CONFIG[currentMode].region !== currentRegion) {
            currentMode = defaultModeForRegion();
        }
        if (reveal) {
            document.getElementById('doors-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            maybeShowCoach();
        }
        renderModeCards();
        updateHomeChrome();
    }

    function setLanguage(next) {
        const lang = setLang(next);
        const btn = document.getElementById('lang-toggle');
        if (btn) btn.textContent = lang === 'km' ? 'EN' : 'ខ្មែរ';
        applyI18n();
        gameState.mapTools?.relabel();
        updateProfileUI();
        renderModeCards();
        updateHomeChrome();
        renderLobbyPlayers();
        renderCoach();
        if (document.getElementById('ranked-screen')?.classList.contains('active')) paintRankedScreen();
        return lang;
    }

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F1E1F' : '#FFF8EE');
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }

    function toggleTheme() {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        applyTheme(next);
    }

    function poolCountFor(mode) {
        const cfg = MODE_CONFIG[mode] || {};
        if (cfg.pool === 'landmarks') return LOCATIONS_DB.landmarks.length;
        if (cfg.pool === 'countries') return LOCATIONS_DB.countries.length;
        if (cfg.pool === 'cambodia') return LOCATIONS_DB.cambodia.length;
        if (cfg.pool === 'asia') return LOCATIONS_DB.asia.length;
        return ALL_LOCATIONS.length;
    }

    function updateHomeChrome() {
        const region = REGION_CONFIG[currentRegion];
        const heroRegion = document.getElementById('hero-region-name');
        if (heroRegion) heroRegion.textContent = getLang() === 'km' ? region.nameKm : region.name;
        const heroKm = document.getElementById('hero-km-line');
        if (heroKm) {
            heroKm.textContent = currentRegion === 'kh'
                ? 'រុករក និងស្វែងយល់ទីក្រុងភ្នំពេញ'
                : 'រុករកពិភពលោកទាំងមូលពីបន្ទប់របស់អ្នក';
        }
        document.querySelectorAll('#region-switch [data-region]').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.region === currentRegion ? 'true' : 'false');
        });

        const m = MODE_CONFIG[currentMode] || MODE_CONFIG[defaultModeForRegion()];
        const name = document.getElementById('ticket-mode-name');
        const nameKm = document.getElementById('ticket-mode-km');
        const meta = document.getElementById('ticket-meta');
        if (name) name.textContent = getLang() === 'km' ? (m.nameKm || m.name) : m.name;
        if (nameKm) nameKm.textContent = getLang() === 'km' ? m.name : (m.nameKm || '');
        if (meta) meta.textContent = `${t('mode.rounds', { n: m.rounds })} · ${t('mode.perRound', { n: m.time })}`;

        const count = document.getElementById('location-count');
        if (count) count.textContent = poolCountFor(currentMode).toLocaleString();
        const profileRegion = document.querySelector('.hero-kicker [id="hero-region-name"]');

        const partySelect = document.getElementById('party-mode-select');
        if (partySelect && document.getElementById('mp-modal') && document.getElementById('mp-modal').classList.contains('active')) {
            renderPartyModes();
        }
    }

    function modeCardHTML(key, m) {
        const stars = '★'.repeat(m.difficulty || 1) + '☆'.repeat(Math.max(0, 3 - (m.difficulty || 1)));
        const secondary = getLang() === 'km' ? m.name : (m.nameKm || '');
        return `
            <article class="mode-card ${currentMode === key ? 'selected' : ''}" data-accent="${m.accent || 'gold'}" onclick="handleModeCardClick('${key}')">
                ${m.featured ? `<span class="mode-badge">${t('mode.featured')}</span>` : ''}
                <div class="mode-top">
                    <span class="mode-stamp">${modeIcon(m.icon)}</span>
                    <div class="mode-title-wrap">
                        <h3 class="mode-title">${escapeHTML(modeName(m))}</h3>
                        <span class="mode-km">${escapeHTML(secondary)}</span>
                    </div>
                </div>
                <p class="mode-desc">${escapeHTML(modeDesc(m))}</p>
                <div class="mode-chips">
                    <span class="chip">${t('mode.rounds', { n: m.rounds })}</span>
                    <span class="chip">${t('mode.perRound', { n: m.time })}</span>
                    <span class="chip" title="${t('mode.difficulty')}">${stars}</span>
                </div>
                <div class="mode-play-row">
                    <button class="btn btn-primary btn-sm" type="button" onclick="event.stopPropagation(); startModeGame('${key}', false);">
                        <svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                        ${t('mode.play')}
                    </button>
                </div>
            </article>`;
    }

    function renderModeCards() {
        const featuredBox = document.getElementById('featured-modes-container');
        const moreBox = document.getElementById('modes-selection-container');
        if (!featuredBox || !moreBox) return;
        // Team and Royale modes need other players, so they only appear in the party picker.
        const all = regionModes().filter(([, m]) => !m.teams && !m.royale);
        const featured = all.filter(([, m]) => m.featured);
        const rest = all.filter(([, m]) => !m.featured);
        featuredBox.innerHTML = featured.map(([key, m]) => modeCardHTML(key, m)).join('');
        moreBox.innerHTML = rest.map(([key, m]) => modeCardHTML(key, m)).join('');
        const moreWrap = document.getElementById('more-modes');
        const moreToggle = document.getElementById('more-toggle');
        if (moreWrap && moreToggle) {
            const hasRest = rest.length > 0;
            moreToggle.hidden = !hasRest;
            if (!hasRest) moreWrap.hidden = true;
        }
        updateLaunchBar();
    }

    function handleModeCardClick(key) {
        if (!MODE_CONFIG[key]) return;
        if (currentMode === key) {
            playBeep(580, 'sine', 0.06);
        } else {
            selectGameMode(key);
        }
    }

    function startModeGame(key, is4Player) {
        if (!MODE_CONFIG[key]) return;
        currentMode = key;
        updateHomeChrome();
        if (is4Player) start4PlayerSimulation();
        else startQuickPlay(key);
    }

    function selectGameMode(key) {
        currentMode = key;
        playBeep(520, 'sine', 0.05);
        renderModeCards();
        updateHomeChrome();
    }

    function startQuickPlay(mode = currentMode) {
        currentMode = MODE_CONFIG[mode] ? mode : defaultModeForRegion();
        updateHomeChrome();
        startSinglePlayerGame();
    }

    function updateLaunchBar() {
        updateHomeChrome();
    }

    // ============================================================
    //  COACH MARKS
    // ============================================================
    const COACH_STEPS = [
        { title: 'tutorial.step1.title', body: 'tutorial.step1.body' },
        { title: 'tutorial.step2.title', body: 'tutorial.step2.body' },
        { title: 'tutorial.step3.title', body: 'tutorial.step3.body' }
    ];
    let coachStep = 0;

    function coachSeen() {
        try { return localStorage.getItem(COACH_KEY) === '1'; } catch (e) { return false; }
    }

    function maybeShowCoach() {
        if (coachSeen()) return;
        if (!document.getElementById('start-screen').classList.contains('active')) return;
        showCoach(0);
    }

    function showCoach(step = 0) {
        coachStep = Math.max(0, Math.min(COACH_STEPS.length - 1, step));
        renderCoach();
        document.getElementById('coach').classList.add('active');
    }

    function renderCoach() {
        const card = document.getElementById('coach');
        if (!card) return;
        const step = COACH_STEPS[coachStep];
        document.getElementById('coach-step').textContent = `${coachStep + 1} / ${COACH_STEPS.length}`;
        document.getElementById('coach-title').textContent = t(step.title);
        document.getElementById('coach-body').textContent = t(step.body);
        document.getElementById('coach-next').textContent = coachStep === COACH_STEPS.length - 1 ? t('tutorial.gotIt') : t('tutorial.next');
        document.querySelectorAll('#coach-dots span').forEach((dot, i) => dot.classList.toggle('on', i === coachStep));
    }

    function nextCoachStep() {
        if (coachStep >= COACH_STEPS.length - 1) { closeCoach(); return; }
        coachStep++;
        renderCoach();
    }

    function closeCoach() {
        document.getElementById('coach').classList.remove('active');
        try { localStorage.setItem(COACH_KEY, '1'); } catch (e) {}
    }

    function openTutorialModal() {
        showCoach(0);
    }

    // ============================================================
    //  STREET VIEW EMBED ENGINE
    // ============================================================
    function loadPano(lat, lng, heading = 0) {
        const iframe = document.getElementById('streetview-iframe');
        const fixedView = !!MODE_CONFIG[currentMode].nmpz;
        iframe.style.pointerEvents = fixedView ? 'none' : 'auto';
        iframe.tabIndex = fixedView ? -1 : 0;
        iframe.title = fixedView ? 'Fixed Street View panorama — no moving, panning or zooming' : 'Explore the Street View panorama';
        // Clean free iframe embed URL with 360 degree randomized heading
        iframe.src = `https://maps.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=12,${heading},,0,0&output=svembed`;
    }

    function returnToStartPano() {
        if (!gameState.currentLocation) return;
        playBeep(480, 'sine', 0.08);
        loadPano(gameState.currentLocation.lat, gameState.currentLocation.lng, gameState.currentHeading || 0);
    }

    function skipBrokenLocation() {
        if (gameState.ranked) { showToast(t('ranked.noSkip')); return; }
        if (gameState.matchPlan) {
            if (gameState.isHost) { sendRoomMessage({ type: 'SKIP_LOCATION' }); showToast(t('toast.skipHost')); }
            else showToast(t('toast.skipGuest'));
            return;
        }
        playBeep(320, 'triangle', 0.12);
        // Swap the location without using up a round
        gameState.roundIndex--;
        loadRound();
        showToast(t('toast.skipped'));
    }

    // ============================================================
    //  LEAFLET GUESS MAP CONTROLS
    // ============================================================
    let gameState = {
        ranked: null,
        isMultiplayer: false,
        simulated4P: false,
        isHost: false,
        roomCode: null,
        roundIndex: 0,
        totalScore: 0,
        roundScore: 0,
        roundSpeedBonus: 0,
        roundDistance: 0,
        currentLocation: null,
        currentHeading: 0,
        guessLatLng: null,
        guessMap: null,
        guessMarker: null,
        resultMap: null,
        timerInterval: null,
        roundStartTime: 0,
        roundsHistory: [],
        usedLocIds: [],
        simPlayers: [],
        matchPlan: null,    // multiplayer: server-chosen [{ id, heading }] per round
        activeMatch: null,  // local indicator of the running server match
        mpGuesses: {},      // multiplayer: { [round]: { [playerId]: guess } }
        mpPinLayer: null
    };

    // Leaflet is ~140 kB. Load it only when a map is actually opened.
    let leafletPromise = null;
    function ensureLeaflet() {
        if (window.L) return Promise.resolve(window.L);
        if (!leafletPromise) {
            leafletPromise = new Promise((resolve, reject) => {
                const css = document.createElement('link');
                css.rel = 'stylesheet';
                css.href = '/vendor/leaflet/leaflet.css';
                document.head.appendChild(css);
                const script = document.createElement('script');
                script.src = '/vendor/leaflet/leaflet.js';
                script.onload = () => resolve(window.L);
                script.onerror = () => reject(new Error('Leaflet failed to load'));
                document.head.appendChild(script);
            });
        }
        return leafletPromise;
    }

    async function initGuessMap() {
        if (!window.L) {
            try { await ensureLeaflet(); }
            catch (e) { showToast(t('toast.mapLoad')); return; }
        }
        if (gameState.guessMap && gameState.guessMapMode === currentMode) {
            gameState.guessMap.invalidateSize();
            return;
        }
        if (gameState.guessMap) {
            // The host switched modes: rebuild the map with the new mode's profile.
            gameState.mapTools?.destroy();
            gameState.mapTools = null;
            gameState.guessMap.remove();
            gameState.guessMap = null;
            gameState.guessMarker = null;
        }

        const cfg = MODE_CONFIG[currentMode] || {};
        gameState.guessMapMode = currentMode;
        gameState.guessMap = L.map('guess-map', mapOptions(cfg.map));
        applyMapProfile(gameState.guessMap, cfg.map);

        // TODO(tiles): OSM's tile policy forbids heavy use. Before launch, pick a free-tier provider or self-host PMTiles (ask the owner first).
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(gameState.guessMap);

        gameState.guessMap.on('click', (e) => {
            placePin(e.latlng);
        });

        // Chips, layers, crosshair and the loupe load lazily; the map works without them.
        const mapForTools = gameState.guessMap;
        import('./map/tools.js').then(({ mountMapTools }) => {
            if (gameState.guessMap !== mapForTools) return;
            gameState.mapTools = mountMapTools({
                map: mapForTools, cfg, L, onPin: placePin, lang: getLang, t,
                landmarks: LOCATIONS_DB.landmarks,
                onKhanPick: id => { const k = KHAN_BY_OSM_ID[id]; if (k) selectChoiceOption('district', k); },
                // In Royale the zone, not the mode profile, is "home": resetting must not escape it.
                resetView: () => { if (serverMatch?.royale?.zone) { gameState.zoneKey = null; applyRoyaleZone(serverMatch); return true; } return false; }
            });
            if (gameState.guessMarker) gameState.mapTools.attachMarker(gameState.guessMarker);
        }).catch(() => {});

        const wrapper = document.getElementById('map-wrapper');
        let fitted = false;
        new ResizeObserver(() => {
            if (!gameState.guessMap) return;
            gameState.guessMap.invalidateSize();
            // fitBounds on a zero-size container picks a wrong zoom, so fit again once the map has a size.
            if (!fitted && wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
                fitted = true;
                if (!gameState.guessLatLng) applyMapProfile(gameState.guessMap, cfg.map);
            }
        }).observe(wrapper);
    }

    function placePin(latlng) {
        if (gameState.spectating) return; // spectators never pin
        if (gameState.guessMarker) {
            gameState.guessMarker.setLatLng(latlng);
        } else {
            const icon = L.divIcon({ className: 'marker-pin-guess', iconSize: [18, 18] });
            gameState.guessMarker = L.marker(latlng, { icon, draggable: true }).addTo(gameState.guessMap);
            gameState.guessMarker.on('dragend', (e) => {
                gameState.guessLatLng = e.target.getLatLng();
                gameState.mapTools?.pinMoved(gameState.guessLatLng);
            });
            gameState.mapTools?.attachMarker(gameState.guessMarker);
        }
        gameState.guessLatLng = latlng;
        gameState.mapTools?.pinMoved(latlng);
        playBeep(640, 'sine', 0.08);

        const btn = document.getElementById('guess-btn');
        btn.innerHTML = `<span>🎯 ${t('game.confirm')}</span>`;
        btn.classList.add('ready');
        btn.disabled = false;
        if (gameState.ghost) { btn.innerHTML = `<span>${t('royale.dropPin')}</span>`; btn.disabled = !!gameState.royale?.mineDropped; }

        const pinStatus = document.getElementById('map-pin-status');
        if (pinStatus) {
            pinStatus.textContent = '✓ ' + t('game.pinPlaced');
            pinStatus.classList.add('placed');
        }

        if (gameState.simulated4P) {
            const myChip = document.getElementById('sim-chip-player_me');
            if (myChip) {
                myChip.classList.add('guessed');
                myChip.innerHTML = `
                    <div class="hud-player-chip-avatar">${renderAvatarHTML(userProfile, '100%', '100%')}</div>
                    <span>${escapeHTML(userProfile.name)} (Ready)</span>
                `;
            }
        }
    }

    // ============================================================
    //  BOTTOM SHEET + DESKTOP SPLIT
    // ============================================================
    const SHEET_ORDER = ['peek', 'half', 'full'];

    function sheetState() {
        return document.getElementById('map-panel').dataset.state || 'peek';
    }

    function setSheet(state) {
        const panel = document.getElementById('map-panel');
        panel.dataset.state = state;
        const label = document.getElementById('expand-btn-text');
        if (label) {
            label.textContent = state === 'peek' ? t('game.sheetHalf')
                : state === 'half' ? t('game.sheetFull') : t('game.sheetPeek');
        }
        const handle = document.getElementById('sheet-handle');
        if (handle) handle.setAttribute('aria-label', state === 'peek' ? t('game.sheetHalf') : t('game.sheetPeek'));
        if (gameState.guessMap) {
            gameState.guessMap.invalidateSize();
            setTimeout(() => { if (gameState.guessMap) gameState.guessMap.invalidateSize(); }, 180);
            setTimeout(() => { if (gameState.guessMap) gameState.guessMap.invalidateSize(); }, 380);
        }
    }

    function cycleSheet() {
        const index = SHEET_ORDER.indexOf(sheetState());
        setSheet(SHEET_ORDER[(index + 1) % SHEET_ORDER.length]);
    }

    function toggleMapExpand(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        cycleSheet();
    }

    function setupSheetGesture() {
        const handle = document.getElementById('sheet-handle');
        if (!handle) return;
        let startY = null;
        handle.addEventListener('pointerdown', e => {
            startY = e.clientY;
            try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        });
        handle.addEventListener('pointerup', e => {
            if (startY === null) return;
            const dy = e.clientY - startY;
            startY = null;
            const index = SHEET_ORDER.indexOf(sheetState());
            if (dy < -32) setSheet(SHEET_ORDER[Math.min(SHEET_ORDER.length - 1, index + 1)]);
            else if (dy > 32) setSheet(SHEET_ORDER[Math.max(0, index - 1)]);
            else cycleSheet();
        });
    }


    // ============================================================
    //  IN-GAME HUD (>= 900px: floating panels over the panorama)
    // ============================================================
    const DESKTOP_HUD = window.matchMedia('(min-width: 900px)');
    const MAP_PIN_KEY = 'wanderpenh_map_pinned';

    function setMapPinned(on, { persist = true } = {}) {
        const panel = document.getElementById('map-panel');
        const btn = document.getElementById('map-pin-toggle');
        panel.classList.toggle('pinned', on);
        if (btn) btn.setAttribute('aria-pressed', String(on));
        if (persist) { try { localStorage.setItem(MAP_PIN_KEY, on ? '1' : '0'); } catch (e) {} }
        resizeGuessMapSoon();
    }
    function toggleMapPinned() { setMapPinned(!document.getElementById('map-panel').classList.contains('pinned')); }

    function resizeGuessMapSoon() {
        for (const ms of [0, 200, 400]) setTimeout(() => { gameState.guessMap?.invalidateSize(); }, ms);
    }

    function setupDesktopMap() {
        const panel = document.getElementById('map-panel');
        try { if (localStorage.getItem(MAP_PIN_KEY) === '1') setMapPinned(true, { persist: false }); } catch (e) {}
        // Hover expands on desktop; a tap expands on tablets (no hover). The pin keeps it open.
        panel.addEventListener('pointerenter', e => { if (DESKTOP_HUD.matches && e.pointerType === 'mouse') resizeGuessMapSoon(); });
        panel.addEventListener('pointerdown', e => {
            if (!DESKTOP_HUD.matches || e.pointerType === 'mouse') return;
            if (!panel.classList.contains('touch-open')) { panel.classList.add('touch-open'); resizeGuessMapSoon(); }
        });
        document.addEventListener('pointerdown', e => {
            if (!panel.contains(e.target) && panel.classList.contains('touch-open')) { panel.classList.remove('touch-open'); resizeGuessMapSoon(); }
        });
        panel.addEventListener('transitionend', () => gameState.guessMap?.invalidateSize());
    }

    function toggleTicketPanel() {
        const panel = document.getElementById('ticket-panel');
        const collapsed = panel.classList.toggle('collapsed');
        document.getElementById('ticket-collapse').setAttribute('aria-expanded', String(!collapsed));
    }
    function toggleDock() {
        const dock = document.getElementById('control-dock');
        const open = dock.classList.toggle('open');
        document.getElementById('dock-more').setAttribute('aria-expanded', String(open));
    }
    function dockZoom(dir) {
        if (!gameState.guessMap) return;
        dir > 0 ? gameState.guessMap.zoomIn() : gameState.guessMap.zoomOut();
    }

    // Emote radial menu (party games only) and floating emotes.
    function toggleEmoteMenu() {
        const menu = document.getElementById('emote-radial');
        if (!menu.hidden) { menu.hidden = true; return; }
        menu.replaceChildren(...LOBBY_EMOTES.map((text, i) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'emote-radial-item'; b.textContent = text;
            const angle = (-90 - 20 + i * 40) * Math.PI / 180;
            b.style.setProperty('--x', Math.round(Math.cos(angle) * 96) + 'px');
            b.style.setProperty('--y', Math.round(Math.sin(angle) * 96) + 'px');
            b.addEventListener('click', () => { sendLobbyEmote(text); menu.hidden = true; });
            return b;
        }));
        menu.hidden = false;
    }
    function showFloatingEmote(sender, emote, spectator = false) {
        const host = document.getElementById('emote-float');
        if (!host) return;
        const player = [...getLobbyPlayers(), ...lobbySpectators].find(p => p.name === sender);
        const row = document.createElement('div');
        row.className = 'emote-float-item';
        row.innerHTML = `<span class="emote-float-avatar">${player ? renderAvatarHTML(player, '100%', '100%') : ''}</span><span>${spectator ? '👀 ' : ''}${escapeHTML(sender)}: ${escapeHTML(emote)}</span>`;
        host.appendChild(row);
        while (host.children.length > 4) host.firstChild.remove();
        setTimeout(() => row.remove(), 4000);
    }

    // Compass strip: the embedded Street View cannot report its live heading, so this
    // shows the round's STARTING heading only and says so. It is never animated.
    function updateCompass() {
        const h = gameState.currentHeading;
        const strip = document.getElementById('compass-strip');
        if (!strip) return;
        if (typeof h !== 'number' || Number.isNaN(h)) { strip.hidden = true; return; }
        strip.hidden = false;
        const deg = ((h % 360) + 360) % 360;
        document.getElementById('compass-needle').style.left = (deg / 360 * 100) + '%';
        const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        document.getElementById('compass-label').textContent = `${t('game.startHeading')} ${Math.round(deg)}° ${names[Math.round(deg / 45) % 8]}`;
    }

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        if (e.code === 'Enter') {
            const btn = document.getElementById('guess-btn');
            if (btn && !btn.disabled && gameState.guessLatLng) {
                e.preventDefault();
                submitPlayerGuess();
            }
        } else if (gameState.spectating && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
            followStep(e.code === 'ArrowRight' ? 1 : -1);
        } else if (e.code === 'Space') {
            e.preventDefault();
            const gameScreen = document.getElementById('game-screen');
            if (gameScreen && gameScreen.classList.contains('active')) {
                toggleMapExpand();
            }
        } else if (e.code === 'Escape') {
            const panel = document.getElementById('map-panel');
            if (panel && panel.dataset.state !== 'peek') setSheet('peek');
            closeModal('profile-modal');
            closeModal('mp-modal');
        }
    });

    let currentChoices = [];

    function setupChoiceShelf() {
        const shelf = document.getElementById('mode-choice-shelf');
        const grid = document.getElementById('mode-choice-grid');
        const title = document.getElementById('mode-choice-title');
        const hint = document.getElementById('mode-choice-hint');
        if (!shelf || !grid) return;

        const cfg = MODE_CONFIG[currentMode] || {};
        const isWorld = !!cfg.isCountry;
        const isDist = !!cfg.isDistrict;

        if (!isWorld && !isDist) {
            shelf.style.display = 'none';
            return;
        }

        shelf.style.display = 'block';
        grid.innerHTML = '';
        currentChoices = [];

        if (isWorld) {
            title.textContent = '🌍 ' + t('game.selectCountry');
            hint.textContent = t('game.orTapMap');
            const correctCountry = gameState.currentLocation.country;
            const otherCountries = ALL_COUNTRIES.filter(c => c !== correctCountry);
            const distractors = otherCountries.sort(() => 0.5 - Math.random()).slice(0, 3);
            currentChoices = [correctCountry, ...distractors].sort(() => 0.5 - Math.random());

            grid.innerHTML = currentChoices.map(country => {
                const flag = COUNTRY_FLAGS[country] || '🌍';
                return `
                    <button type="button" class="choice-opt-btn" data-choice-type="country" data-choice-value="${escapeHTML(country)}" onclick="selectChoiceOption('country', '${escapeHTML(country)}')">
                        <span style="font-size: 1.15rem;">${flag}</span>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(country)}</span>
                    </button>
                `;
            }).join('');
        } else if (isDist) {
            title.textContent = '🏙️ ' + t('game.selectKhan');
            hint.textContent = t('game.orTapMap');
            const locArea = gameState.currentLocation.area || '';
            const matchedKhan = PP_KHANS.find(k => locArea.includes(k.id) || k.name.includes(locArea)) || PP_KHANS[0];
            gameState.currentKhan = matchedKhan.id;

            const otherKhans = PP_KHANS.filter(k => k.id !== matchedKhan.id);
            const distractors = otherKhans.sort(() => 0.5 - Math.random()).slice(0, 3);
            currentChoices = [matchedKhan, ...distractors].sort(() => 0.5 - Math.random());

            grid.innerHTML = currentChoices.map(khan => `
                <button type="button" class="choice-opt-btn" data-choice-type="district" data-choice-value="${escapeHTML(khan.id)}" onclick="selectChoiceOption('district', '${escapeHTML(khan.id)}')">
                    <span style="font-size: 1.05rem;">${khan.icon}</span>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(khan.id)}</span>
                </button>
            `).join('');
        }
    }

    function selectChoiceOption(type, value) {
        document.querySelectorAll('.choice-opt-btn').forEach(btn => {
            const match = btn.dataset.choiceValue ? btn.dataset.choiceValue === value : btn.textContent.includes(value);
            btn.classList.toggle('selected', match);
        });

        playBeep(640, 'sine', 0.08);

        if (type === 'country') {
            gameState.chosenCountry = value;
            const flag = COUNTRY_FLAGS[value] || '🌍';
            const center = COUNTRY_CENTERS[value] || { lat: 20, lng: 0 };
            placePin(center);
            if (gameState.guessMap) gameState.guessMap.flyTo([center.lat, center.lng], 4, { duration: 0.6 });

            const btn = document.getElementById('guess-btn');
            btn.innerHTML = `<span>🎯 CONFIRM: ${flag} ${escapeHTML(value)}</span>`;
            btn.classList.add('ready');
            btn.disabled = false;

            const pinStatus = document.getElementById('map-pin-status');
            if (pinStatus) {
                pinStatus.textContent = `✓ ${flag} ${value}`;
                pinStatus.classList.add('placed');
            }
        } else if (type === 'district') {
            gameState.chosenDistrict = value;
            const khan = PP_KHANS.find(k => k.id === value);
            const center = khan ? { lat: khan.lat, lng: khan.lng } : PP_CENTER;
            placePin(center);
            if (gameState.guessMap) gameState.guessMap.flyTo([center.lat, center.lng], 13, { duration: 0.5 });

            const btn = document.getElementById('guess-btn');
            btn.innerHTML = `<span>🎯 CONFIRM: ${khan ? khan.icon : '🏙️'} ${escapeHTML(value)}</span>`;
            btn.classList.add('ready');
            btn.disabled = false;

            const pinStatus = document.getElementById('map-pin-status');
            if (pinStatus) {
                pinStatus.textContent = `✓ ${khan ? khan.icon : '🏙️'} ${value}`;
                pinStatus.classList.add('placed');
            }
        }
    }

    function updateStreakHUD() {
        const streakCard = document.getElementById('hud-streak-card');
        const cfg = MODE_CONFIG[currentMode];
        if (!streakCard) return;
        if (cfg && cfg.isStreak) {
            streakCard.style.display = 'flex';
            const streak = gameState.streakCount || 0;
            const mult = streak === 0 ? '1x' : streak === 1 ? '1x' : streak === 2 ? '1.25x' : streak === 3 ? '1.5x' : streak === 4 ? '2x' : '3x';
            document.getElementById('hud-streak-num').textContent = streak;
            document.getElementById('hud-streak-mult').textContent = `(${mult})`;
        } else {
            streakCard.style.display = 'none';
        }
    }

    // ============================================================
    //  TIMER & ACCURACY SCORING SYSTEM
    // ============================================================
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function formatDistanceStr(distMeters) {
        if (distMeters === null) return 'No guess';
        if (distMeters < 1000) return `${Math.round(distMeters)} m`;
        return `${(distMeters / 1000).toFixed(2)} km`;
    }

    function scoreGuess(distMeters, timeRemaining, maxTime, matchedChoice = false) {
        const cfg = MODE_CONFIG[currentMode] || {};
        let distScore = 0;
        if (distMeters !== null) {
            if (matchedChoice) {
                distScore = 5000;
            } else if (cfg.isWorld || cfg.isCountry) {
                distScore = distMeters <= 50000 ? 5000 : Math.round(5000 * Math.exp(-distMeters / 3500000));
            } else if (cfg.isAsia) {
                distScore = distMeters <= 25000 ? 5000 : Math.round(5000 * Math.exp(-distMeters / 1200000));
            } else if (cfg.isCambodia) {
                distScore = distMeters <= 500 ? 5000 : Math.round(5000 * Math.exp(-distMeters / 30000));
            } else if (cfg.isSniper) {
                distScore = distMeters <= 35 ? 10000 : distMeters <= 75 ? 7500 : distMeters <= 150 ? 6000 : Math.max(0, Math.round(5000 * Math.exp(-distMeters / 1500)));
            } else {
                distScore = distMeters <= 25 ? 5000 : Math.max(0, Math.round(5000 * Math.exp(-distMeters / 1500)));
            }
        }

        // Speed bonus: up to 1000 pts (doubled in sprint mode)
        const speedRatio = Math.max(0, timeRemaining / maxTime);
        const speedMultiplier = currentMode === 'sprint' ? 2 : 1;
        const speedBonus = distMeters !== null ? Math.round(speedRatio * 1000) * speedMultiplier : 0;

        return {
            distScore,
            speedBonus,
            total: distScore + speedBonus
        };
    }

    function startRoundTimer(seconds) {
        clearInterval(gameState.timerInterval);
        let remaining = seconds;
        const run = gameState.ranked;
        gameState.roundStartTime = run ? run.startedAt - run.offset : isRealMultiplayer() && serverMatch ? serverMatch.startedAt - serverClockOffset : Date.now();

        const timerCard = document.getElementById('hud-timer-card');
        const timerVal = document.getElementById('hud-timer-num');
        const circle = document.getElementById('timer-svg-circle');
        const totalOffset = 75.4; // 2 * PI * 12

        timerCard.classList.remove('danger');
        timerCard.style.setProperty('--p', 1);
        timerVal.textContent = remaining;
        circle.style.strokeDashoffset = 0;
        circle.style.stroke = 'var(--rice)';

        gameState.timerInterval = setInterval(() => {
            remaining = Math.max(0, Math.ceil(run ? Math.min(seconds, (run.deadline - (Date.now() + run.offset)) / 1000) : isRealMultiplayer() && serverMatch ? (serverMatch.deadline - (Date.now() + serverClockOffset)) / 1000 : seconds - (Date.now() - gameState.roundStartTime) / 1000));
            timerVal.textContent = remaining;

            const progress = remaining / seconds;
            timerCard.style.setProperty('--p', progress.toFixed(3));
            circle.style.strokeDashoffset = totalOffset * (1 - progress);

            if (progress < 0.25) {
                circle.style.stroke = 'var(--lotus)';
                timerCard.classList.add('danger');
                playBeep(880, 'sine', 0.04);
            } else if (progress < 0.5) {
                circle.style.stroke = 'var(--gold-deep)';
            }

            if (remaining <= 0) {
                clearInterval(gameState.timerInterval);
                playBuzzer();
                if (gameState.guessLatLng) {
                    submitPlayerGuess();
                } else {
                    submitTimeoutZero();
                }
            }
        }, 1000);
    }

    // ============================================================
    //  4-PLAYER SIMULATION ENGINE & BOT ROSTER
    // ============================================================
    const SIM_BOTS = [
        {
            id: 'bot_sokha',
            name: 'Sokha 🛵',
            title: 'Daun Penh Tuk-Tuk Master',
            avatarType: 'custom',
            avatarConfig: {
                hairStyle: 'fluffy',
                hairColor: '#261b2b',
                jacketStyle: 'cardigan',
                jacketColor: '#0284c7',
                shirtColor: '#ffffff',
                skinColor: '#fee0d2',
                bg: '#38bdf8',
                squiggles: 'electric',
                eyeStyle: 'happy',
                blush: true
            },
            aura: '#38bdf8',
            minDist: 100, maxDist: 480,
            minDelay: 3200, maxDelay: 5800
        },
        {
            id: 'bot_dara',
            name: 'Dara 🛺',
            title: 'BKK1 Cafe Hopper',
            avatarType: 'custom',
            avatarConfig: {
                hairStyle: 'spiky',
                hairColor: '#4a2810',
                jacketStyle: 'hoodie',
                jacketColor: '#ea580c',
                shirtColor: '#fef08a',
                skinColor: '#fee0d2',
                bg: '#fbbf24',
                squiggles: 'electric',
                eyeStyle: 'curious',
                blush: true
            },
            aura: '#f59e0b',
            minDist: 320, maxDist: 980,
            minDelay: 5500, maxDelay: 9200
        },
        {
            id: 'bot_bopha',
            name: 'Bopha 🌸',
            title: 'Riverside Sunset Chaser',
            avatarType: 'custom',
            avatarConfig: {
                hairStyle: 'fluffy',
                hairColor: '#db2777',
                jacketStyle: 'cardigan',
                jacketColor: '#db2777',
                shirtColor: '#fbcfe8',
                skinColor: '#fee0d2',
                bg: '#f472b6',
                squiggles: 'sparkles',
                eyeStyle: 'chill',
                blush: true
            },
            aura: '#ec4899',
            minDist: 650, maxDist: 1850,
            minDelay: 8500, maxDelay: 13500
        }
    ];

    let simBotTimers = [];

    function start4PlayerSimulation() {
        gameState.ranked = null;
        gameState.isMultiplayer = true;
        gameState.simulated4P = true;
        gameState.matchPlan = null;
        gameState.simPlayers = [
            {
                id: 'player_me',
                name: userProfile.name || 'ricy',
                avatarType: userProfile.avatarType || 'custom',
                avatarConfig: userProfile.avatarConfig,
                aura: userProfile.aura || '#10b981',
                isMe: true,
                totalScore: 0
            },
            ...SIM_BOTS.map(b => ({
                id: b.id,
                name: b.name,
                avatarType: b.avatarType,
                avatarConfig: b.avatarConfig,
                aura: b.aura,
                isMe: false,
                botConfig: b,
                totalScore: 0
            }))
        ];

        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        gameState.roundIndex = 0;
        gameState.totalScore = 0;
        gameState.roundsHistory = [];
        gameState.usedLocIds = [];
        gameState.streakCount = 0;
        gameState.chosenCountry = null;
        gameState.chosenDistrict = null;
        SIM_BOTS.forEach(b => { b.streakCount = 0; });

        initGuessMap();
        loadRound();
    }

    function initSimRound() {
        simBotTimers.forEach(t => clearTimeout(t));
        simBotTimers = [];

        const hudCard = document.getElementById('hud-mp-status-card');
        const chipsContainer = document.getElementById('hud-mp-chips');
        if (!hudCard || !chipsContainer) return;

        hudCard.style.display = 'flex';
        chipsContainer.innerHTML = gameState.simPlayers.map(p => `
            <div class="hud-player-chip" id="sim-chip-${p.id}">
                <div class="hud-player-chip-avatar">${renderAvatarHTML(p, '100%', '100%')}</div>
                <span>${escapeHTML(p.name)}${p.isMe ? ` (${t('party.you')})` : ': 🤔'}</span>
            </div>
        `).join('');

        gameState.simPlayers.forEach(p => {
            p.currentGuess = null;
            p.roundCompleted = false;
        });

        const target = gameState.currentLocation;
        const cfg = MODE_CONFIG[currentMode];

        gameState.simPlayers.filter(p => !p.isMe).forEach(bot => {
            const delay = bot.botConfig.minDelay + Math.random() * (bot.botConfig.maxDelay - bot.botConfig.minDelay);
            const tId = setTimeout(() => {
                if (bot.roundCompleted) return;
                generateBotGuess(bot, target, cfg.time);
            }, delay);
            simBotTimers.push(tId);
        });
    }

    function generateBotGuess(bot, target, maxTime) {
        if (bot.roundCompleted) return;
        const bCfg = bot.botConfig;
        const cfg = MODE_CONFIG[currentMode] || {};

        let guessLatLng;
        let actualDist;
        let matchedChoice = false;
        let botCountryName = null;
        let botDistrictName = null;

        if (cfg.isWorld) {
            const worldMin = bot.id === 'bot_sokha' ? 80000 : bot.id === 'bot_dara' ? 300000 : 800000;
            const worldMax = bot.id === 'bot_sokha' ? 450000 : bot.id === 'bot_dara' ? 1200000 : 3500000;
            const dist = worldMin + Math.random() * (worldMax - worldMin);
            const angle = Math.random() * 2 * Math.PI;
            const dLat = (dist / 111320) * Math.cos(angle);
            const dLng = (dist / (111320 * Math.max(0.2, Math.cos(target.lat * Math.PI / 180)))) * Math.sin(angle);
            guessLatLng = { lat: target.lat + dLat, lng: target.lng + dLng };
            actualDist = calculateDistance(target.lat, target.lng, guessLatLng.lat, guessLatLng.lng);
        } else if (cfg.isCountry) {
            const targetCountry = target.country || 'Cambodia';
            const hitProb = bot.id === 'bot_sokha' ? 0.85 : bot.id === 'bot_dara' ? 0.65 : 0.40;
            const isCorrect = Math.random() < hitProb;
            if (isCorrect) {
                botCountryName = targetCountry;
                matchedChoice = true;
                const cCenter = COUNTRY_CENTERS[targetCountry] || { lat: target.lat, lng: target.lng };
                const jDist = 10000 + Math.random() * 140000;
                const jAng = Math.random() * 2 * Math.PI;
                guessLatLng = {
                    lat: cCenter.lat + (jDist / 111320) * Math.cos(jAng),
                    lng: cCenter.lng + (jDist / (111320 * Math.max(0.2, Math.cos(cCenter.lat * Math.PI / 180)))) * Math.sin(jAng)
                };
            } else {
                const otherCountries = ALL_COUNTRIES.filter(c => c !== targetCountry);
                botCountryName = otherCountries[Math.floor(Math.random() * otherCountries.length)] || 'France';
                const cCenter = COUNTRY_CENTERS[botCountryName] || { lat: 0, lng: 0 };
                const jDist = 20000 + Math.random() * 200000;
                const jAng = Math.random() * 2 * Math.PI;
                guessLatLng = {
                    lat: cCenter.lat + (jDist / 111320) * Math.cos(jAng),
                    lng: cCenter.lng + (jDist / (111320 * Math.max(0.2, Math.cos(cCenter.lat * Math.PI / 180)))) * Math.sin(jAng)
                };
            }
            actualDist = calculateDistance(target.lat, target.lng, guessLatLng.lat, guessLatLng.lng);
        } else if (cfg.isAsia) {
            const asiaMin = bot.id === 'bot_sokha' ? 35000 : bot.id === 'bot_dara' ? 120000 : 400000;
            const asiaMax = bot.id === 'bot_sokha' ? 200000 : bot.id === 'bot_dara' ? 500000 : 1500000;
            const dist = asiaMin + Math.random() * (asiaMax - asiaMin);
            const angle = Math.random() * 2 * Math.PI;
            const dLat = (dist / 111320) * Math.cos(angle);
            const dLng = (dist / (111320 * Math.max(0.2, Math.cos(target.lat * Math.PI / 180)))) * Math.sin(angle);
            guessLatLng = { lat: target.lat + dLat, lng: target.lng + dLng };
            actualDist = calculateDistance(target.lat, target.lng, guessLatLng.lat, guessLatLng.lng);
        } else if (cfg.isDistrict) {
            const targetKhan = PP_KHANS.find(k => (target.area || '').includes(k.id) || k.name.includes(target.area || '')) || PP_KHANS[0];
            const hitProb = bot.id === 'bot_sokha' ? 0.80 : bot.id === 'bot_dara' ? 0.60 : 0.40;
            const isCorrect = Math.random() < hitProb;
            let chosenKhan = targetKhan;
            if (!isCorrect) {
                const others = PP_KHANS.filter(k => k.id !== targetKhan.id);
                chosenKhan = others[Math.floor(Math.random() * others.length)] || targetKhan;
            } else {
                matchedChoice = true;
            }
            botDistrictName = chosenKhan.id;
            const jDist = 200 + Math.random() * 900;
            const jAng = Math.random() * 2 * Math.PI;
            guessLatLng = {
                lat: chosenKhan.lat + (jDist / 111320) * Math.cos(jAng),
                lng: chosenKhan.lng + (jDist / (111320 * Math.cos(chosenKhan.lat * Math.PI / 180))) * Math.sin(jAng)
            };
            actualDist = calculateDistance(target.lat, target.lng, guessLatLng.lat, guessLatLng.lng);
        } else if (cfg.isSniper) {
            const sniperMin = bot.id === 'bot_sokha' ? 12 : bot.id === 'bot_dara' ? 35 : 80;
            const sniperMax = bot.id === 'bot_sokha' ? 55 : bot.id === 'bot_dara' ? 110 : 250;
            const dist = sniperMin + Math.random() * (sniperMax - sniperMin);
            const angle = Math.random() * 2 * Math.PI;
            const dLat = (dist / 111320) * Math.cos(angle);
            const dLng = (dist / (111320 * Math.cos(target.lat * Math.PI / 180))) * Math.sin(angle);
            guessLatLng = { lat: target.lat + dLat, lng: target.lng + dLng };
            actualDist = calculateDistance(target.lat, target.lng, guessLatLng.lat, guessLatLng.lng);
        } else if (cfg.isCambodia) {
            const camMin = bot.id === 'bot_sokha' ? 250 : bot.id === 'bot_dara' ? 800 : 2500;
            const camMax = bot.id === 'bot_sokha' ? 1200 : bot.id === 'bot_dara' ? 4000 : 15000;
            const dist = camMin + Math.random() * (camMax - camMin);
            const angle = Math.random() * 2 * Math.PI;
            const dLat = (dist / 111320) * Math.cos(angle);
            const dLng = (dist / (111320 * Math.cos(target.lat * Math.PI / 180))) * Math.sin(angle);
            guessLatLng = { lat: target.lat + dLat, lng: target.lng + dLng };
            actualDist = calculateDistance(target.lat, target.lng, guessLatLng.lat, guessLatLng.lng);
        } else {
            const dist = bCfg.minDist + Math.random() * (bCfg.maxDist - bCfg.minDist);
            const angle = Math.random() * 2 * Math.PI;
            const dLat = (dist / 111320) * Math.cos(angle);
            const dLng = (dist / (111320 * Math.cos(target.lat * Math.PI / 180))) * Math.sin(angle);
            guessLatLng = { lat: target.lat + dLat, lng: target.lng + dLng };
            actualDist = calculateDistance(target.lat, target.lng, guessLatLng.lat, guessLatLng.lng);
        }

        const elapsed = Math.min(maxTime, Math.max(2.0, (Date.now() - gameState.roundStartTime) / 1000));
        const timeRemaining = Math.max(0, maxTime - elapsed);
        const scoreObj = scoreGuess(actualDist, timeRemaining, maxTime, matchedChoice);

        let streakMultiplier = 1;
        if (cfg.isStreak) {
            if (actualDist <= 500) {
                bot.streakCount = (bot.streakCount || 0) + 1;
                streakMultiplier = bot.streakCount >= 5 ? 5 : bot.streakCount === 4 ? 3 : bot.streakCount === 3 ? 2 : bot.streakCount === 2 ? 1.5 : 1;
            } else {
                bot.streakCount = 0;
            }
        }

        const finalDistScore = Math.round(scoreObj.distScore * streakMultiplier);
        const finalRoundScore = finalDistScore + scoreObj.speedBonus;

        bot.currentGuess = {
            guessLatLng,
            dist: actualDist,
            score: finalRoundScore,
            distScore: finalDistScore,
            speedBonus: scoreObj.speedBonus,
            elapsed,
            matchedChoice,
            botCountryName,
            botDistrictName
        };
        (bot.roundScores ||= []).push(finalRoundScore);
        bot.totalScore += finalRoundScore;
        bot.roundCompleted = true;

        const chip = document.getElementById(`sim-chip-${bot.id}`);
        if (chip) {
            chip.classList.add('guessed');
            let chipExtra = '';
            if (botCountryName) {
                const flag = COUNTRY_FLAGS[botCountryName] || '🌍';
                chipExtra = `${flag} ${botCountryName}`;
            } else if (botDistrictName) {
                chipExtra = `🏙️ ${botDistrictName}`;
            } else {
                chipExtra = `✓ (${elapsed.toFixed(1)}s)`;
            }
            chip.innerHTML = `
                <div class="hud-player-chip-avatar">${renderAvatarHTML(bot, '100%', '100%')}</div>
                <span>${escapeHTML(bot.name)}: ${escapeHTML(chipExtra)}</span>
            `;
        }
    }

    // ============================================================
    //  MATCH FLOW (SOLO & MULTIPLAYER)
    // ============================================================
    function getModeLocationPool() {
        const cfg = MODE_CONFIG[currentMode];
        if (cfg.pool === 'landmarks') return LOCATIONS_DB.landmarks;
        if (cfg.pool === 'countries') return LOCATIONS_DB.countries;
        if (cfg.pool === 'cambodia') return LOCATIONS_DB.cambodia;
        if (cfg.pool === 'asia') return LOCATIONS_DB.asia;
        return ALL_LOCATIONS;
    }

    function startSinglePlayerGame() {
        gameState.ranked = null;
        gameState.isMultiplayer = false;
        gameState.simulated4P = false;
        gameState.matchPlan = null;
        const mpCard = document.getElementById('hud-mp-status-card');
        if (mpCard) mpCard.style.display = 'none';

        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        gameState.roundIndex = 0;
        gameState.totalScore = 0;
        gameState.roundsHistory = [];
        gameState.usedLocIds = [];
        gameState.streakCount = 0;
        gameState.chosenCountry = null;
        gameState.chosenDistrict = null;

        initGuessMap();
        loadRound();
    }

    function loadRound() {
        gameState.roundSubmitted = false;
        guessPending = false;
        readyPending = false;
        readyPlayers.clear();
        gameState.guessLatLng = null;
        gameState.chosenCountry = null;
        gameState.chosenDistrict = null;
        gameState.roundIndex++;
        const cfg = MODE_CONFIG[currentMode];

        document.getElementById('hud-round-indicator').textContent = cfg.royale ? String(gameState.roundIndex) : `${gameState.roundIndex} / ${cfg.rounds}`;
        document.getElementById('hud-score-indicator').textContent = gameState.totalScore.toLocaleString();

        const planned = gameState.matchPlan && gameState.matchPlan[gameState.roundIndex - 1];
        const allPoolLocations = [...ALL_LOCATIONS, ...LOCATIONS_DB.countries, ...LOCATIONS_DB.cambodia, ...(LOCATIONS_DB.asia || [])];
        const plannedLoc = planned && allPoolLocations.find(l => l.id === planned.id);
        if (plannedLoc) {
            gameState.currentLocation = plannedLoc;
            gameState.currentHeading = planned.heading;
            recordSeenLocation(plannedLoc.id);
        } else if (planned && planned.redacted) {
            // Tag-Team Pinner: the server withholds the location until the reveal.
            gameState.currentLocation = null;
            gameState.currentHeading = planned.heading;
        } else {
            gameState.currentLocation = getNextUniqueLocation();
            gameState.currentHeading = getRandomHeading();
        }

        if (gameState.guessMarker) {
            gameState.guessMap.removeLayer(gameState.guessMarker);
            gameState.guessMarker = null;
            gameState.guessLatLng = null;
        }
        const btn = document.getElementById('guess-btn');
        btn.innerHTML = `<span>${t('game.confirmWait')}</span>`;
        btn.classList.remove('ready');
        btn.disabled = true;

        const pinStatus = document.getElementById('map-pin-status');
        if (pinStatus) {
            pinStatus.textContent = t('game.pinHint');
            pinStatus.classList.remove('placed');
        }

        if (gameState.guessMap && gameState.guessMapMode === currentMode) {
            if (gameState.mapTools) gameState.mapTools.resetRound();
            else applyMapProfile(gameState.guessMap, cfg.map);
        }

        const modePill = document.getElementById('hud-mode-pill');
        if (modePill) {
            modePill.innerHTML = `<span>${cfg.badge}</span> ${cfg.name}`;
        }
        updateStreakHUD();
        setupChoiceShelf();

        if (gameState.currentLocation && myRoleNow() !== 'pinner') {
            loadPano(gameState.currentLocation.lat, gameState.currentLocation.lng, gameState.currentHeading);
        } else if (!gameState.currentLocation) {
            document.getElementById('streetview-iframe').removeAttribute('src');
        }
        startRoundTimer(serverMatch?.roundTime || cfg.time);
        applyRoleUI();
        updateCompass();
        document.getElementById('dock-emote').hidden = !isRealMultiplayer();
        document.getElementById('hud-watching')?.toggleAttribute('hidden', !lobbySpectators.length);

        if (gameState.simulated4P) {
            initSimRound();
        } else if (isRealMultiplayer()) {
            renderMpHudChips();
        }
    }

    function submitPlayerGuess() {
        if (gameState.ghost) { dropGhostPin(); return; }
        if (gameState.ranked) { if (gameState.guessLatLng) submitRankedGuess(gameState.guessLatLng); return; }
        if (isRealMultiplayer()) { if (gameState.guessLatLng) submitRoomGuess(gameState.guessLatLng); return; }
        if (!gameState.guessLatLng || gameState.roundSubmitted) return;
        gameState.roundSubmitted = true;
        clearInterval(gameState.timerInterval);

        const elapsedSeconds = (Date.now() - gameState.roundStartTime) / 1000;
        const cfg = MODE_CONFIG[currentMode] || {};
        const timeRemaining = Math.max(0, cfg.time - elapsedSeconds);

        const dist = calculateDistance(
            gameState.currentLocation.lat, gameState.currentLocation.lng,
            gameState.guessLatLng.lat, gameState.guessLatLng.lng
        );

        let matchedChoice = false;
        if (cfg.isCountry && gameState.chosenCountry && gameState.currentLocation.country) {
            matchedChoice = (gameState.chosenCountry.toLowerCase() === gameState.currentLocation.country.toLowerCase());
        } else if (cfg.isDistrict && gameState.chosenDistrict && gameState.currentLocation.area) {
            const locArea = gameState.currentLocation.area.toLowerCase();
            const chosen = gameState.chosenDistrict.toLowerCase();
            matchedChoice = locArea.includes(chosen) || chosen.includes(locArea);
        }

        const scoreObj = scoreGuess(dist, timeRemaining, cfg.time, matchedChoice);

        let streakMultiplier = 1;
        if (cfg.isStreak) {
            if (dist <= 500) {
                gameState.streakCount = (gameState.streakCount || 0) + 1;
                streakMultiplier = gameState.streakCount >= 5 ? 5 : gameState.streakCount === 4 ? 3 : gameState.streakCount === 3 ? 2 : gameState.streakCount === 2 ? 1.5 : 1;
            } else {
                gameState.streakCount = 0;
            }
            updateStreakHUD();
        }

        const finalDistScore = Math.round(scoreObj.distScore * streakMultiplier);
        const finalRoundScore = finalDistScore + scoreObj.speedBonus;

        gameState.totalScore += finalRoundScore;
        gameState.roundScore = finalDistScore;
        gameState.roundSpeedBonus = scoreObj.speedBonus;
        gameState.roundDistance = dist;
        gameState.roundMatchedChoice = matchedChoice;

        gameState.roundsHistory.push({
            round: gameState.roundIndex,
            area: gameState.currentLocation.name,
            dist,
            distScore: finalDistScore,
            speedBonus: scoreObj.speedBonus,
            total: finalRoundScore,
            matchedChoice,
            streak: gameState.streakCount || 0
        });

        playSuccessChime();

        if (gameState.simulated4P) {
            const target = gameState.currentLocation;
            gameState.simPlayers.filter(p => !p.isMe && !p.roundCompleted).forEach(bot => {
                generateBotGuess(bot, target, cfg.time);
            });

            const me = gameState.simPlayers.find(p => p.isMe);
            if (me) {
                me.currentGuess = {
                    guessLatLng: gameState.guessLatLng,
                    dist,
                    score: finalRoundScore,
                    distScore: finalDistScore,
                    speedBonus: scoreObj.speedBonus,
                    elapsed: elapsedSeconds,
                    matchedChoice
                };
                me.totalScore = gameState.totalScore;
                (me.roundScores ||= []).push(finalRoundScore);
                me.roundCompleted = true;
            }

            const myChip = document.getElementById('sim-chip-player_me');
            if (myChip) {
                myChip.classList.add('guessed');
                myChip.innerHTML = `
                    <div class="hud-player-chip-avatar">${renderAvatarHTML(userProfile, '100%', '100%')}</div>
                    <span>${escapeHTML(userProfile.name)}: ✓ (${elapsedSeconds.toFixed(1)}s)</span>
                `;
            }
        }

        sendMpGuess(dist, finalRoundScore, gameState.guessLatLng, elapsedSeconds);

        showRoundResult();
    }

    function submitTimeoutZero() {
        if (gameState.ranked) { submitRankedGuess(null); return; }
        if (isRealMultiplayer()) { submitRoomGuess(null); return; }
        if (gameState.roundSubmitted) return;
        gameState.roundSubmitted = true;
        const cfg = MODE_CONFIG[currentMode] || {};
        if (cfg.isStreak) {
            gameState.streakCount = 0;
            updateStreakHUD();
        }
        // Reset last round's numbers so the result card doesn't show stale points
        gameState.roundScore = 0;
        gameState.roundSpeedBonus = 0;
        gameState.roundDistance = 10000;
        gameState.roundMatchedChoice = false;
        sendMpGuess(null, 0, null, null);
        gameState.roundsHistory.push({
            round: gameState.roundIndex,
            area: gameState.currentLocation.name,
            dist: 10000,
            distScore: 0,
            speedBonus: 0,
            total: 0
        });
        showRoundResult();
    }

    // ============================================================
    //  ROUND RESULT VIEW (SOLO & 4-PLAYER)
    // ============================================================
    function locationName(loc) {
        if (!loc) return '—';
        return getLang() === 'km' && loc.nameKm ? loc.nameKm : loc.name;
    }

    function locationSecondary(loc) {
        if (!loc) return '';
        return getLang() === 'km' ? loc.name : (loc.nameKm || loc.country || '');
    }

    function friendlyScale(distanceMeters) {
        if (!Number.isFinite(distanceMeters)) return '';
        if (distanceMeters < 2000) return t('scale.sameBlock');
        if (distanceMeters < 15000) return t('scale.sameKhan');
        if (distanceMeters < 60000) return t('scale.sameSide');
        if (distanceMeters < 400000) return t('scale.acrossCity');
        if (distanceMeters < 3000000) return t('scale.acrossCountry');
        return t('scale.otherContinent');
    }

    function animateCount(el, to, { duration = 600, prefix = '', suffix = '' } = {}) {
        if (!el) return;
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const target = Math.round(to);
        if (reduced) { el.textContent = prefix + target.toLocaleString() + suffix; return; }
        const start = performance.now();
        const tick = now => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    function showRoundResult() {
        document.getElementById('res-next-btn').disabled = false;
        if (isRealMultiplayer()) setTimeout(updateRoundReadyUI, 0);
        document.getElementById('result-screen').classList.add('active');

        const loc = gameState.currentLocation;
        document.getElementById('res-location-name').textContent = locationName(loc);
        document.getElementById('res-location-km').textContent = locationSecondary(loc);
        animateCount(document.getElementById('res-round-score'), gameState.roundScore + gameState.roundSpeedBonus);
        document.getElementById('res-distance').textContent = formatDistanceStr(gameState.roundDistance);
        const scaleEl = document.getElementById('res-distance-scale');
        if (scaleEl) scaleEl.textContent = friendlyScale(gameState.roundDistance);
        document.getElementById('res-dist-pts').textContent = gameState.roundScore.toLocaleString();
        document.getElementById('res-speed-pts').textContent = `+${gameState.roundSpeedBonus}`;

        const nextBtn = document.getElementById('res-next-btn');
        const cfg = MODE_CONFIG[currentMode];
        const roundMeta = document.getElementById('res-round-meta');
        if (roundMeta) roundMeta.textContent = `${t('game.round')} ${Math.min(gameState.roundIndex, cfg.rounds)} / ${cfg.rounds}`;
        const totalMeta = document.getElementById('res-total-meta');
        if (totalMeta) totalMeta.textContent = `${t('final.total')} ${gameState.totalScore.toLocaleString()}`;
        if (gameState.roundIndex >= cfg.rounds) {
            nextBtn.textContent = t('result.final') + ' 🏆';
        } else {
            nextBtn.textContent = `${t('result.next')} (${gameState.roundIndex + 1}/${cfg.rounds}) →`;
        }

        const banner = document.getElementById('res-mode-banner');
        if (banner) {
            const chip = (ok, text) => `<span class="banner-chip ${ok ? 'ok' : 'miss'}">${text}</span>`;
            let bannerHTML = '';
            if (cfg.isWorld) {
                const country = gameState.currentLocation.country || 'World';
                bannerHTML = `<span>${COUNTRY_FLAGS[country] || '🌍'}</span><span>${t('result.target')}: <strong>${escapeHTML(locationName(gameState.currentLocation))}</strong>, <em>${escapeHTML(country)}</em></span>`;
            } else if (cfg.isCountry) {
                const country = gameState.currentLocation.country || '—';
                const isCorrect = (gameState.chosenCountry && gameState.chosenCountry.toLowerCase() === country.toLowerCase()) || gameState.roundDistance < 50000;
                bannerHTML = `<span>${COUNTRY_FLAGS[country] || '🌍'}</span><span>${t('result.targetCountry')}: <strong>${escapeHTML(country)}</strong></span>${chip(isCorrect, isCorrect ? t('result.correct') : t('result.missed'))}`;
            } else if (cfg.isAsia) {
                const country = gameState.currentLocation.country || 'Asia';
                bannerHTML = `<span>${COUNTRY_FLAGS[country] || '🌏'}</span><span>${t('result.destination')}: <strong>${escapeHTML(locationName(gameState.currentLocation))}</strong>, <em>${escapeHTML(country)}</em></span>`;
            } else if (cfg.isDistrict) {
                const area = gameState.currentLocation.area || 'Phnom Penh';
                const isCorrect = !!gameState.roundMatchedChoice;
                bannerHTML = `<span>🏙️</span><span>${t('result.khan')}: <strong>${escapeHTML(area)}</strong></span>${chip(isCorrect, isCorrect ? t('result.correct') : t('result.missed'))}`;
            } else if (cfg.isSniper) {
                const dist = gameState.roundDistance;
                const isBullseye = dist <= 35;
                const isGreat = dist <= 75;
                const label = isBullseye ? t('result.perfect') : isGreat ? t('result.closeShot') : dist <= 150 ? t('result.nearby') : t('result.outside');
                bannerHTML = `<span>🎯</span><span>${t('result.bullseye')}:</span>${chip(isBullseye || isGreat, label)}`;
            } else if (cfg.isStreak) {
                const streak = gameState.streakCount || 0;
                const mult = streak >= 5 ? '5x' : streak === 4 ? '3x' : streak === 3 ? '2x' : streak === 2 ? '1.5x' : '1x';
                bannerHTML = `<span>🔥</span><span>${t('result.streak')}: <strong>${streak}</strong></span>${chip(streak > 0, `${t('result.multiplier')} ${mult}`)}`;
            } else if (cfg.isCambodia) {
                bannerHTML = `<span>🇰🇭</span><span>${t('result.province')}: <strong>${escapeHTML(gameState.currentLocation.area || 'Cambodia')}</strong></span>`;
            }
            banner.style.display = bannerHTML ? 'block' : 'none';
            banner.className = 'res-mode-banner neutral';
            banner.innerHTML = bannerHTML ? `<div class="banner-line">${bannerHTML}</div>` : '';
        }

        const mpLeaderboard = document.getElementById('mp-round-leaderboard');
        const mpList = document.getElementById('mp-round-players-list');

        if (gameState.simulated4P && mpLeaderboard && mpList) {
            mpLeaderboard.style.display = 'block';

            beginStandings();
            paintStandings(simStandingRows());
        } else if (isRealMultiplayer() && mpLeaderboard && mpList) {
            mpLeaderboard.style.display = 'block';
            beginStandings();
            renderMpRoundLeaderboard();
        } else if (mpLeaderboard) {
            mpLeaderboard.style.display = 'none';
        }

    function animateTukTuk(map, from, to) {
        if (!map || !from || !to) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const icon = L.divIcon({
            className: 'tuktuk-ride',
            html: '<div class="tuktuk-bubble">🛵</div>',
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });
        const marker = L.marker(from, { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
        const start = performance.now();
        const duration = 1600;
        const step = now => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 2);
            marker.setLatLng([from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased]);
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    setTimeout(async () => {
            try { await ensureLeaflet(); } catch (e) { return; }
            if (gameState.resultMap) gameState.resultMap.remove();

            gameState.resultMap = L.map('result-map', { zoomControl: true, attributionControl: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(gameState.resultMap);

            const actualLoc = [gameState.currentLocation.lat, gameState.currentLocation.lng];
            const actualIcon = L.divIcon({ className: 'marker-pin-actual', iconSize: [18, 18] });
            const countryOrArea = gameState.currentLocation.country ? `🌍 ${gameState.currentLocation.country}` : `📍 ${gameState.currentLocation.area || 'Phnom Penh'}`;
            L.marker(actualLoc, { icon: actualIcon }).addTo(gameState.resultMap).bindPopup(`<b>📍 ${escapeHTML(locationName(gameState.currentLocation))}</b><br><span style="color:#53645f; font-size:11px;">${escapeHTML(countryOrArea)}</span>`).openPopup();

            const boundsPoints = [actualLoc];

            if (gameState.simulated4P) {
                gameState.simPlayers.forEach(p => {
                    if (!p.currentGuess) return;
                    const guessLoc = [p.currentGuess.guessLatLng.lat, p.currentGuess.guessLatLng.lng];
                    boundsPoints.push(guessLoc);

                    const playerPinHtml = `
                        <div class="marker-player-pin">
                            <div class="marker-pin-bubble" style="border-color: ${p.aura || '#f59e0b'};">
                                ${renderAvatarHTML(p, '100%', '100%')}
                            </div>
                            <div class="marker-pin-point" style="border-top-color: ${p.aura || '#f59e0b'};"></div>
                            <div class="marker-pin-label" style="border-color: ${p.aura || '#f59e0b'};">${escapeHTML(p.name)}: ${formatDistanceStr(p.currentGuess.dist)}</div>
                        </div>
                    `;

                    const playerIcon = L.divIcon({
                        className: 'custom-leaflet-player-marker',
                        html: playerPinHtml,
                        iconSize: [40, 52],
                        iconAnchor: [20, 50]
                    });

                    L.marker(guessLoc, { icon: playerIcon }).addTo(gameState.resultMap);

                    L.polyline([actualLoc, guessLoc], {
                        color: p.aura || '#f59e0b',
                        weight: 3,
                        dashArray: '6,6',
                        opacity: 0.85
                    }).addTo(gameState.resultMap);
                });

                if (boundsPoints.length > 1) {
                    const bounds = L.latLngBounds(boundsPoints);
                    gameState.resultMap.fitBounds(bounds.pad(0.25));
                }
            } else if (gameState.guessLatLng) {
                const guessLoc = [gameState.guessLatLng.lat, gameState.guessLatLng.lng];
                const guessIcon = L.divIcon({ className: 'marker-pin-guess', iconSize: [18, 18] });
                L.marker(guessLoc, { icon: guessIcon }).addTo(gameState.resultMap).bindPopup(`<b>${t('game.yourGuess')}</b>`);

                L.polyline([actualLoc, guessLoc], { color: '#E0A526', weight: 4, dashArray: '2,8', lineCap: 'round' }).addTo(gameState.resultMap);

                const bounds = L.latLngBounds([actualLoc, guessLoc]);
                gameState.resultMap.fitBounds(bounds.pad(0.3));
                setTimeout(() => animateTukTuk(gameState.resultMap, guessLoc, actualLoc), 500);
            } else {
                gameState.resultMap.setView(actualLoc, 15);
            }

            gameState.mpPinLayer = null;
            refreshMpResultPins();
        }, 150);
    }

    function updateRoundReadyUI() {
        if (!isRealMultiplayer()) return;
        const btn = document.getElementById('res-next-btn');
        const players = getLobbyPlayers();
        const count = players.filter(p => readyPlayers.has(p.id)).length;
        const ready = readyPlayers.has(myPlayerId);
        btn.disabled = ready || readyPending || !roomReady;
        btn.textContent = ready
            ? t('result.waiting', { n: count, total: players.length })
            : t('result.ready');
    }

    function advanceNextRound() {
        if (gameState.ranked) { advanceRankedRound(); return; }
        if (isRealMultiplayer()) {
            if (!gameState.roundSubmitted || readyPlayers.has(myPlayerId) || readyPending) return;
            if (sendRoomMessage({ type: 'ROUND_READY', matchId, round: gameState.roundIndex })) readyPending = true;
            updateRoundReadyUI();
            return;
        }
        document.getElementById('result-screen').classList.remove('active');
        const cfg = MODE_CONFIG[currentMode];
        if (gameState.roundIndex >= cfg.rounds) {
            showFinalPodium();
        } else {
            loadRound();
        }
    }

    function showFinalPodium() {
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('final-screen').classList.add('active');

        const total = gameState.totalScore;
        document.getElementById('fin-total-score').textContent = total.toLocaleString();

        let badge = '🏆', rating = t('final.rating.explore');
        if (total >= 25000) { badge = '👑'; rating = t('final.rating.grandmaster'); }
        else if (total >= 20000) { badge = '🌟'; rating = t('final.rating.expert'); }
        else if (total >= 15000) { badge = '👏'; rating = t('final.rating.navigator'); }
        else if (total >= 10000) { badge = '🛵'; rating = t('final.rating.apprentice'); }

        document.getElementById('fin-badge').textContent = badge;
        document.getElementById('fin-rating').textContent = rating;

        const table = document.getElementById('fin-rounds-table');
        if (gameState.simulated4P) {
            const rows = gameState.simPlayers.map(p => ({ id: p.id, name: p.name, isMe: !!p.isMe, aura: p.aura, avatarSource: p, total: p.totalScore, roundScores: p.roundScores || [] }));
            table.innerHTML = `<div class="field-label">${t('final.tournament')}</div>` + renderFinal({ rows, deps: standingsDeps() });
        } else {
            const roundsHTML = gameState.roundsHistory.map(r => `
                <div class="mp-leaderboard-row">
                    <span class="final-rank">${t('final.roundShort', { n: r.round })}</span>
                    <span class="final-area">${escapeHTML(r.area)}</span>
                    <span>${formatDistanceStr(r.dist)}</span>
                    <span class="final-points">${r.total.toLocaleString()} ${t('final.points')}</span>
                </div>
            `).join('');

            let partyHTML = '';
            if (isRealMultiplayer() && isTeamMode() && serverTeams.length) {
                const me = myPlayerId || 'me';
                const rankedTeams = serverTeams
                    .map((team, i) => ({ team, i, guess: null, total: mpTotalFor(team.playerIds[0]) }))
                    .sort((a, b) => b.total - a.total);
                partyHTML = `
                    <div class="field-label">${t('team.finalBoard')}</div>
                    ${rankedTeams.map((r, idx) => renderTeamRow(r, idx, me, false)).join('')}
                    <div class="final-hint">${t('result.waiting', { n: readyPlayers.size, total: getLobbyPlayers().length })}</div>
                `;
            } else if (isRealMultiplayer() && serverMatch?.royale?.placements) {
                const me = myPlayerId || 'me', R = serverMatch.royale;
                const byId = Object.fromEntries(R.placements.map(x => [x.id, x]));
                const rows = R.placements.map(x => {
                    const st = R.players[x.id] || {}, p = playerById(x.id) || { name: st.name || '?' }; // quitters keep their name
                    const rounds = Object.keys(gameState.mpGuesses || {}).length;
                    return { id: x.id, name: p.name, isMe: x.id === me, aura: getPlayerAura(x.id), avatarSource: p, points: x.points,
                        hearts: st.lives, alive: st.alive, roundScores: [],
                        note: t('royale.stats', { rounds: st.survived || rounds, best: st.bestDist === null || st.bestDist === undefined ? '—' : formatDistanceStr(st.bestDist), shields: st.shieldsUsed || 0 }) };
                });
                const winner = rows[0];
                document.getElementById('fin-badge').textContent = '👑';
                document.getElementById('fin-rating').textContent = winner ? t('royale.winner', { name: winner.name }) : '';
                document.getElementById('fin-total-score').textContent = '+' + (byId[me]?.points ?? 0);
                partyHTML = `<div class="field-label">${t('final.partyBoard')}</div>${renderFinal({ rows, royale: true, ordered: true, deps: standingsDeps() })}`;
            } else if (isRealMultiplayer()) {
                const me = myPlayerId || 'me';
                const rows = getLobbyPlayers().map(p => ({
                    id: p.id, name: p.name, isMe: p.id === me, aura: getPlayerAura(p.id), avatarSource: p, total: mpTotalFor(p.id),
                    roundScores: Object.keys(gameState.mpGuesses || {}).sort((x, y) => x - y).map(rd => gameState.mpGuesses[rd][p.id]?.score || 0)
                }));
                partyHTML = `
                    <div class="field-label">${t('final.partyBoard')}</div>
                    ${renderFinal({ rows, deps: standingsDeps() })}
                    <div class="final-hint">${t('result.waiting', { n: readyPlayers.size, total: getLobbyPlayers().length })}</div>
                `;
            }
            table.innerHTML = (gameState.ranked ? rankedSummaryHTML(gameState.ranked) : '') + partyHTML + roundsHTML;
        }
    }

    function resetToHome() {
        if (gameState.ranked) {
            const again = gameState.ranked.mode;
            document.getElementById('final-screen').classList.remove('active');
            startRankedRun(again);
            return;
        }
        // Still connected to a party: go back to the waiting room for a rematch
        if (isRealMultiplayer() && roomSocket) {
            if (!gameState.isHost) { showToast(t('toast.waitHostLobby')); return; }
            sendRoomMessage({ type: 'REMATCH' });
            return;
        }
        document.getElementById('final-screen').classList.remove('active');
        gameState.isMultiplayer = false;
        gameState.matchPlan = null;
        gameState.streakCount = 0;
        gameState.chosenCountry = null;
        gameState.chosenDistrict = null;
        updateStreakHUD();
        document.getElementById('start-screen').classList.add('active');
        renderModeCards();
    }

    // ============================================================
    //  CLOUDFLARE MULTIPLAYER ROOMS (server coordinates all players)
    // ============================================================
    let roomSocket = null;
    let heartbeatTimer = null;
    let lastServerMessage = 0;
    let roomSession = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let serverClockOffset = 0;
    let serverMatch = null;
    let guessPending = false;
    let readyPending = false;
    let myPlayerId = null;
    let connectionTimer = null;
    let roomReady = false;
    let readyPlayers = new Set();
    let matchId = null;
    let lobbySpectators = [];
    let viewerRole = 'player';
    let followId = null;
    let spectTab = 'round', spectTimer = null;
    let lobbyPlayers = [];          // player list as last synced from the host (clients only)
    let serverTeams = [];           // Tag-Team pairs as confirmed by the server
    let teamSwapPick = null;        // host's first selection when swapping two players
    const TEAM_COLORS = ['#e4578a', '#1f7fb8', '#e0a526', '#4caf6a'];

    function isTeamMode(mode = currentMode) {
        return !!MODE_CONFIG[mode]?.teams;
    }
    function myTeam() {
        return serverTeams.find(team => team.playerIds.includes(myPlayerId)) || null;
    }
    function myRoleNow() {
        return isTeamMode() && serverMatch ? serverMatch.role || null : null;
    }
    function findLocationById(id) {
        if (!id) return null;
        const pool = [...ALL_LOCATIONS, ...LOCATIONS_DB.countries, ...LOCATIONS_DB.cambodia, ...(LOCATIONS_DB.asia || [])];
        return pool.find(l => l.id === id) || null;
    }
    function playerById(id) {
        return getLobbyPlayers().find(p => p.id === id) || null;
    }
    function teamIndex(teamId) {
        return Math.max(0, serverTeams.findIndex(team => team.id === teamId));
    }
    function teamNames(team, skipMe = false) {
        return team.playerIds
            .filter(id => !(skipMe && id === myPlayerId))
            .map(id => playerById(id)?.name || '?')
            .join(' + ');
    }

    const MAX_ROOM_PLAYERS = 8;
    const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const LOBBY_EMOTES = ['🛵 Vroom!', '📍 Easy spot!', '🤔 No clue!', '🔥 Ready!', '👑 GG!'];
    const MP_AURAS = ['#10b981', '#f59e0b', '#38bdf8', '#ec4899', '#8b5cf6', '#f43f5e', '#facc15', '#14b8a6'];

    function isRealMultiplayer() {
        return gameState.isMultiplayer && !gameState.simulated4P;
    }

    function openMultiplayerModal() {
        renderPartyModes();
        document.getElementById('mp-modal').classList.add('active');
        setTimeout(() => document.getElementById('join-code-input')?.focus(), 50);
    }

    function generateRoomCode() {
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        return 'WP-' + Array.from(bytes, b => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
    }

    function setLobbyStatus(text) {
        const el = document.getElementById('lobby-status-text');
        if (el) el.textContent = text;
        const waiting = document.getElementById('client-connection-text');
        if (waiting) waiting.textContent = text;
        const start = document.getElementById('start-party-btn');
        const spinner = document.querySelector('#client-waiting .spinner');
        if (spinner) spinner.style.display = roomReady ? 'none' : 'block';
        if (start) {
            start.disabled = !roomReady || getLobbyPlayers().filter(p => p.connected !== false).length < 2 || getLobbyPlayers().some(p => p.connected === false) || !!serverMatch;
            start.title = !roomReady ? t('lobby.connectingTitle') : getLobbyPlayers().length < 2 ? t('lobby.inviteTitle') : t('lobby.readyTitle');
        }
    }

    function createMultiplayerLobby() {
        closeModal('mp-modal');
        teardownRoom();
        currentMode = document.getElementById('party-mode-select').value || currentMode;
        const code = generateRoomCode();
        gameState.isMultiplayer = true;
        gameState.simulated4P = false;
        gameState.isHost = true;
        gameState.roomCode = code;
        gameState.activeMatch = null;

        openLobbyUI(code, true);
        initRoomConnection(code, true);
    }

    function joinMultiplayerLobby() {
        const input = document.getElementById('join-code-input');
        let code = input.value.trim().toUpperCase().replace(/\s+/g, '');
        if (!code) {
            showToast(t('toast.roomCodeRequired'));
            input.focus();
            return;
        }
        if (!code.startsWith('WP-')) code = 'WP-' + code.replace(/^WP-?/, '');
        if (!/^WP-[A-Z0-9]{5,6}$/.test(code)) {
            showToast(t('toast.roomCodeInvalid'));
            input.focus();
            return;
        }

        closeModal('mp-modal');
        teardownRoom();
        gameState.isMultiplayer = true;
        gameState.simulated4P = false;
        gameState.isHost = false;
        gameState.roomCode = code;

        openLobbyUI(code, false);
        initRoomConnection(code, false);
    }

    function openLobbyUI(code, isHost) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('lobby-screen').classList.add('active');
        document.getElementById('room-code-text').textContent = code;

        document.getElementById('host-controls').style.display = isHost ? 'flex' : 'none';
        document.getElementById('client-waiting').style.display = isHost ? 'none' : 'block';

        renderLobbyPlayers();
        renderPartyModes();
    }

    function myLobbyEntry() {
        return { id: myPlayerId || 'me', ...sanitizeProfile(userProfile), isHost: gameState.isHost };
    }

    function getLobbyPlayers() {
        return lobbyPlayers.length ? lobbyPlayers : [myLobbyEntry()];
    }

    function getPlayerAura(id) {
        const idx = getLobbyPlayers().findIndex(p => p.id === id);
        return MP_AURAS[Math.max(0, idx) % MP_AURAS.length];
    }

    function renderLobbyPlayers() {
        const container = document.getElementById('lobby-players-container');
        const players = getLobbyPlayers();

        document.getElementById('player-count').textContent = players.length;
        container.innerHTML = players.map(p => `
            <div class="lobby-player-card">
                <div class="lobby-player-thumb">${renderAvatarHTML(p, '100%', '100%')}</div>
                <div style="flex: 1; overflow: hidden;">
                    <div style="font-weight: 800; font-size: 0.88rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                        ${escapeHTML(p.name)} ${p.isHost ? `<span style="color: var(--gold-deep); font-size: 0.72rem;">(${t('party.host')})</span>` : ''} ${p.id === (myPlayerId || 'me') ? `<span style="color: var(--rice); font-size: 0.72rem;">(${t('party.you')})</span>` : ''}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--ink-2); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                        ${p.connected === false ? t('party.reconnecting') : escapeHTML(p.title || 'Explorer')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    function renderLobbyWatching() {
        const box = document.getElementById('lobby-watching');
        if (!box) return;
        box.hidden = !lobbySpectators.length;
        document.getElementById('watching-count').textContent = lobbySpectators.length;
        document.getElementById('lobby-watching-list').innerHTML = lobbySpectators.map(p => `
            <div class="lobby-player-card">
                <div class="lobby-player-thumb">${renderAvatarHTML(p, '100%', '100%')}</div>
                <div style="flex:1; overflow:hidden; font-weight:800; font-size:0.88rem;">${escapeHTML(p.name)} <span>👀</span>${p.id === myPlayerId ? ` <span style="color:var(--rice); font-size:0.72rem;">(${t('party.you')})</span>` : ''}</div>
            </div>`).join('');
    }

    function renderLobbyTeams() {
        const panel = document.getElementById('lobby-teams-panel');
        const list = document.getElementById('lobby-teams-list');
        const hint = document.getElementById('lobby-teams-hint');
        if (!panel || !list) return;
        if (!isRealMultiplayer() || !isTeamMode() || !serverTeams.length) { panel.hidden = true; return; }
        panel.hidden = false;
        const canEdit = gameState.isHost && roomReady && !serverMatch;
        if (hint) hint.hidden = !canEdit;
        list.innerHTML = serverTeams.map((team, i) => `
            <div class="lobby-team" style="--team-color:${TEAM_COLORS[i % TEAM_COLORS.length]};">
                <div class="lobby-team-badge">${t('team.name', { n: i + 1 })}</div>
                <div class="lobby-team-members">
                    ${team.playerIds.map(id => {
                        const p = playerById(id);
                        if (!p) return '';
                        return `<button type="button" class="lobby-team-member ${teamSwapPick === id ? 'picked' : ''}" ${canEdit ? '' : 'disabled'} onclick="pickTeamMember('${id}')">
                            <span class="lobby-player-thumb">${renderAvatarHTML(p, '100%', '100%')}</span>
                            <span>${escapeHTML(p.name)}</span>
                        </button>`;
                    }).join('')}
                </div>
            </div>
        `).join('');
    }

    function pickTeamMember(id) {
        if (!gameState.isHost || !roomReady || serverMatch || !isTeamMode()) return;
        if (!teamSwapPick) { teamSwapPick = id; renderLobbyTeams(); return; }
        if (teamSwapPick === id) { teamSwapPick = null; renderLobbyTeams(); return; }
        const a = teamSwapPick, b = id;
        teamSwapPick = null;
        const swapped = serverTeams.map(team => ({
            playerIds: team.playerIds.map(pid => pid === a ? b : pid === b ? a : pid)
        }));
        sendRoomMessage({ type: 'SET_TEAMS', teams: swapped });
        renderLobbyTeams();
    }

    // The Viewer sees only the street, the Pinner sees only the map.
    function applyRoleUI() {
        const role = myRoleNow();
        const body = document.body;
        body.dataset.role = role || '';
        const banner = document.getElementById('team-role-banner');
        if (!banner) return;
        const show = !!role && serverMatch?.phase === 'playing' && !gameState.roundSubmitted;
        banner.hidden = !show;
        if (!show) {
            const mapPanel = document.getElementById('map-panel');
            if (mapPanel && mapPanel.dataset.teamForced) { mapPanel.dataset.state = 'peek'; delete mapPanel.dataset.teamForced; }
            return;
        }
        const team = myTeam();
        const partner = team ? teamNames(team, true) : '';
        const emoji = role === 'viewer' ? '👀' : role === 'pinner' ? '📍' : '🧭';
        document.getElementById('team-role-emoji').textContent = emoji;
        document.getElementById('team-role-title').textContent = t('team.role.' + role);
        document.getElementById('team-role-sub').textContent = t('team.role.' + role + '.sub', { name: partner });
        banner.dataset.role = role;
        const mapPanel = document.getElementById('map-panel');
        if (mapPanel && role === 'pinner') {
            mapPanel.dataset.teamForced = '1';
            mapPanel.dataset.state = 'full';
            try { gameState.guessMap?.invalidateSize(); } catch {}
        } else if (mapPanel && mapPanel.dataset.teamForced) {
            mapPanel.dataset.state = 'peek';
            delete mapPanel.dataset.teamForced;
        }
    }

    // Keep the round's location in step with what the server will reveal to us.
    function syncTeamLocation(m) {
        const planned = m.plan[m.round - 1];
        if (!planned || !planned.id) return;
        const loc = findLocationById(planned.id);
        if (!loc || gameState.currentLocation?.id === loc.id) return;
        gameState.currentLocation = loc;
        gameState.currentHeading = planned.heading;
        recordSeenLocation(loc.id);
        const own = m.guesses[m.round]?.[myPlayerId];
        if (myRoleNow() !== 'pinner' && m.phase === 'playing' && !own) loadPano(loc.lat, loc.lng, planned.heading);
    }

    function renderPartyModes() {
        const entries = regionModes();
        if (MODE_CONFIG[currentMode] && !entries.some(([key]) => key === currentMode)) {
            entries.unshift([currentMode, MODE_CONFIG[currentMode]]);
        }
        for (const [id, descriptionId] of [['party-mode-select', 'party-mode-description'], ['lobby-mode-select', 'lobby-mode-description']]) {
            const select = document.getElementById(id);
            if (!select) continue;
            select.innerHTML = entries.map(([key, cfg]) => '<option value="' + key + '">' + escapeHTML(modeName(cfg)) + '</option>').join('');
            if (MODE_CONFIG[currentMode]) select.value = currentMode;
            select.disabled = id === 'lobby-mode-select' && (!gameState.isHost || !roomReady || !!serverMatch);
            const cfg = MODE_CONFIG[select.value] || MODE_CONFIG[currentMode];
            if (cfg) {
                document.getElementById(descriptionId).textContent = cfg.royale
                    ? `${t('mode.perRound', { n: cfg.time })} · ${poolCountFor(select.value)} ${t('home.size')}. ${modeDesc(cfg)}`
                    : `${t('mode.perRound', { n: cfg.time })} · ${t('mode.rounds', { n: cfg.rounds })} · ${poolCountFor(select.value)} ${t('home.size')}. ${modeDesc(cfg)}`;
            }
        }
        document.querySelectorAll('#party-region-switch [data-region]').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.region === currentRegion ? 'true' : 'false');
        });
    }

    function selectPartyMode(mode) {
        if (!MODE_CONFIG[mode]) return;
        if (isRealMultiplayer()) {
            if (!gameState.isHost || !roomReady || serverMatch) return;
            sendRoomMessage({ type: 'SET_MODE', mode });
        } else {
            currentMode = mode;
            if (MODE_CONFIG[mode].region !== currentRegion) {
                currentRegion = MODE_CONFIG[mode].region;
                try { localStorage.setItem(REGION_KEY, currentRegion); } catch (e) {}
            }
            renderPartyModes();
            renderModeCards();
            updateHomeChrome();
        }
    }

    function teardownRoom() {
        clearInterval(heartbeatTimer);
        clearTimeout(connectionTimer);
        clearTimeout(reconnectTimer);
        const old = roomSocket;
        roomSocket = null;
        if (old) {
            if (old.readyState === WebSocket.OPEN) old.send(JSON.stringify({ type: 'LEAVE' }));
            old.close();
        }
        roomReady = false;
        roomSession = null;
        serverMatch = null;
        serverTeams = [];
        teamSwapPick = null;
        document.body.dataset.role = '';
        const roleBanner = document.getElementById('team-role-banner');
        if (roleBanner) roleBanner.hidden = true;
        myPlayerId = null;
        lobbyPlayers = [];
        matchId = null;
        readyPlayers.clear();
        guessPending = false;
        readyPending = false;
    }

    function sendRoomMessage(msg) {
        if (!roomReady || roomSocket?.readyState !== WebSocket.OPEN) {
            showToast(t('toast.reconnectingWait'));
            return false;
        }
        roomSocket.send(JSON.stringify(msg));
        return true;
    }

    function initRoomConnection(code, create, resume = false) {
        if (!resume) {
            reconnectAttempts = 0;
            roomSession = null;
            try { roomSession = JSON.parse(sessionStorage.getItem('wanderpenh_room_' + code)); } catch {}
        }
        roomReady = false;
        setLobbyStatus(resume ? 'Reconnecting to your party…' : create ? 'Opening your party room…' : 'Connecting to ' + code + '…');
        const url = new URL('/api/rooms/' + encodeURIComponent(code), location.origin);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(url);
        roomSocket = socket;
        clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => {
            if (roomSocket !== socket || roomReady) return;
            leaveLobby();
            showToast(t('toast.serverUnreachable'));
        }, 15000);
        socket.onopen = () => {
            if (roomSocket !== socket) return;
            lastServerMessage = Date.now();
            clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
                if (roomSocket !== socket || socket.readyState !== WebSocket.OPEN) return;
                if (Date.now() - lastServerMessage > 40000) { socket.close(); return; }
                socket.send('ping');
            }, 15000);
            socket.send(JSON.stringify({ type: 'HELLO', protocol: WanderRotation.protocol, create: create && !roomSession, token: roomSession?.token, profile: sanitizeProfile(userProfile), mode: currentMode, seen: getSeenHistory().slice(-600), identity: deviceIdentity() }));
        };
        socket.onmessage = event => {
            if (roomSocket !== socket) return;
            lastServerMessage = Date.now();
            if (event.data === 'pong') return;
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg.type === 'WELCOME') {
                myPlayerId = msg.playerId;
                roomSession = { token: msg.token };
                try { sessionStorage.setItem('wanderpenh_room_' + code, JSON.stringify(roomSession)); } catch {}
                const invite = new URL(location.href);
                invite.searchParams.set('room', code);
                history.replaceState(null, '', invite);
            } else if (msg.type === 'ROOM_STATE') {
                clearTimeout(connectionTimer);
                reconnectAttempts = 0;
                roomReady = true;
                applyRoomState(msg);
            } else if (msg.type === 'ROOM_ERROR') {
                if (msg.message === 'ROOM_EXISTS' && create) {
                    teardownRoom();
                    gameState.roomCode = generateRoomCode();
                    openLobbyUI(gameState.roomCode, true);
                    initRoomConnection(gameState.roomCode, true);
                    return;
                }
                try { sessionStorage.removeItem('wanderpenh_room_' + code); } catch {}
                leaveLobby();
                showToast(msg.message || 'Unable to join this party.');
            } else if (msg.type === 'LOBBY_EMOTE') {
                if (document.getElementById('game-screen').classList.contains('active')) showFloatingEmote(cleanText(msg.sender, 'Explorer', 24), msg.emote, !!msg.spectator);
                else showToast(cleanText(msg.sender, 'Explorer', 24) + ': ' + msg.emote);
            }
        };
        socket.onclose = () => {
            if (roomSocket !== socket) return;
            clearInterval(heartbeatTimer);
            clearTimeout(connectionTimer);
            roomReady = false;
            guessPending = false;
            readyPending = false;
            setLobbyStatus('Connection interrupted. Rejoining your party…');
            if (!roomSession || reconnectAttempts >= 6) {
                leaveLobby();
                showToast(t('toast.roomLost'));
                return;
            }
            showToast(t('toast.reconnecting'));
            reconnectTimer = setTimeout(() => initRoomConnection(code, false, true), Math.min(4000, 500 * 2 ** reconnectAttempts++));
        };
        socket.onerror = () => { /* onclose handles retry and feedback */ };
    }

    function applyRoomState(state) {
        serverClockOffset = state.serverNow - Date.now();
        lobbyPlayers = state.players.map(p => ({ ...sanitizeProfile(p), id: p.id, isHost: p.isHost, connected: p.connected }));
        lobbySpectators = (state.spectators || []).map(p => ({ ...sanitizeProfile(p), id: p.id, connected: p.connected }));
        const prevRole = viewerRole;
        viewerRole = state.viewerRole === 'spectator' ? 'spectator' : 'player';
        gameState.spectating = viewerRole === 'spectator';
        document.body.dataset.spectator = gameState.spectating ? '1' : '';
        if (gameState.spectating && prevRole !== 'spectator') showToast(t(state.match ? 'spectate.joined' : 'spectate.lobbyFull'));
        else if (!gameState.spectating && prevRole === 'spectator') showToast(t('spectate.promoted'));
        const answerToggle = document.getElementById('spectator-answer-toggle');
        if (answerToggle) answerToggle.checked = !!state.spectatorsSeeAnswer;
        gameState.isHost = state.hostId === myPlayerId;
        currentMode = state.mode;
        serverMatch = state.match;
        serverTeams = state.teams || [];
        document.getElementById('host-controls').style.display = gameState.isHost ? 'flex' : 'none';
        document.getElementById('client-waiting').style.display = gameState.isHost ? 'none' : 'block';
        const connected = lobbyPlayers.filter(p => p.connected).length;
        setLobbyStatus(connected < lobbyPlayers.length ? t('lobby.reconnecting') : connected < 2 ? t('lobby.open') : gameState.isHost ? t('lobby.host', { n: connected }) : t('lobby.client', { n: connected }));
        renderLobbyPlayers();
        renderLobbyWatching();
        renderLobbyTeams();
        renderPartyModes();
        renderRoyaleLobby(state.royaleSettings);
        const customizeAvatar = document.getElementById('lobby-customize-avatar');
        document.getElementById('rotation-status').textContent = state.selection ? t('lobby.rotation', { n: state.selection.remaining }) : '';
        if (customizeAvatar) customizeAvatar.innerHTML = renderAvatarHTML(userProfile, '100%', '100%');
        const customizeButton = document.querySelector('.lobby-customize');
        if (customizeButton) customizeButton.disabled = !roomReady;
        if (state.match) closeModal('profile-modal');
        if (!state.match) {
            clearRoyaleUI();
            if (matchId) {
                matchId = null;
                clearInterval(gameState.timerInterval);
                gameState.activeMatch = null;
                gameState.matchPlan = null;
                openLobbyUI(gameState.roomCode, gameState.isHost);
            }
            return;
        }
        const m = state.match;
        const newMatch = matchId !== m.id;
        const changedRound = !newMatch && gameState.roundIndex !== m.round;
        // A redacted (null) id turning into a real one is a reveal, not a new location.
        const oldPlanId = gameState.matchPlan?.[m.round - 1]?.id, newPlanId = m.plan[m.round - 1].id;
        const changedLocation = !newMatch && !!oldPlanId && !!newPlanId && oldPlanId !== newPlanId;
        if (newMatch) {
            matchId = m.id;
            gameState.activeMatch = { mode: state.mode };
            gameState.mpGuesses = m.guesses;
            gameState.ranked = null;
            beginMatch(state.mode, m.plan, m.round);
        } else if (changedRound || changedLocation) {
            gameState.matchPlan = m.plan;
            gameState.roundIndex = m.round - 1;
            document.getElementById('result-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');
            loadRound();
        }
        gameState.mpGuesses = m.guesses;
        if (isTeamMode()) { gameState.matchPlan = m.plan; syncTeamLocation(m); }
        readyPlayers = new Set(m.ready);
        readyPending = false;
        if (gameState.spectating) {
            gameState.spectMatch = m;
            renderSpectator(m);
            if (m.phase === 'final') { document.getElementById('spectator-banner').hidden = true; document.getElementById('spect-results').hidden = true; showFinalPodium(); }
            return;
        }
        renderWatchingChip();
        if (m.royale) {
            applyRoyale(m);
            if (gameState.ghost && m.phase !== 'final') { renderGhost(m); renderMpHudChips(); return; }
        } else clearRoyaleUI();
        // Rebuild local totals from accepted server guesses, including after a refresh.
        gameState.roundsHistory = Object.entries(m.guesses).flatMap(([round, guesses]) => {
            const g = guesses[myPlayerId];
            if (!g) return [];
            return [{ round: +round, area: findLocationById(m.plan[+round - 1].id)?.name || 'Phnom Penh', dist: g.dist, distScore: g.distScore, speedBonus: g.speedBonus + g.bountyBonus, total: g.score }];
        });
        gameState.totalScore = gameState.roundsHistory.reduce((sum, g) => sum + g.total, 0);
        const own = m.guesses[m.round]?.[myPlayerId];
        if (own) {
            const firstResult = !gameState.roundSubmitted;
            gameState.roundSubmitted = true;
            guessPending = false;
            clearInterval(gameState.timerInterval);
            gameState.guessLatLng = own.guessLatLng;
            gameState.roundScore = own.distScore;
            gameState.roundSpeedBonus = own.speedBonus + own.bountyBonus;
            gameState.roundDistance = own.dist;
            if (firstResult && m.phase !== 'final') showRoundResult();
        } else if (m.phase === 'playing') {
            gameState.roundStartTime = m.startedAt - serverClockOffset;
            if (!guessPending) {
                const btn = document.getElementById('guess-btn');
                btn.disabled = !gameState.guessLatLng;
                if (gameState.guessLatLng) btn.innerHTML = '<span>Confirm guess</span>';
            }
        }
        if (m.phase === 'final') {
            document.getElementById('result-screen').classList.remove('active');
            showFinalPodium();
        }
        renderMpHudChips();
        applyRoleUI();
        if (document.getElementById('result-screen').classList.contains('active')) {
            renderMpRoundLeaderboard();
            refreshMpResultPins();
            updateRoundReadyUI();
        }
    }

    function beginMatch(mode, plan, round = 1) {
        currentMode = mode;
        gameState.matchPlan = plan;
        gameState.mpGuesses = {};
        gameState.roundIndex = round - 1;
        gameState.totalScore = 0;
        gameState.roundsHistory = [];
        gameState.usedLocIds = [];

        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('game-screen').classList.add('active');
        initGuessMap();
        loadRound();
    }

    function startMultiplayerGame() {
        if (!gameState.isHost || !roomReady || getLobbyPlayers().length < 2 || serverMatch) return;
        sendRoomMessage({ type: 'START_MATCH' });
    }

    function submitRoomGuess(point) {
        if (gameState.roundSubmitted || guessPending) return;
        if (serverMatch && Date.now() + serverClockOffset < serverMatch.startedAt) {
            showToast(t('toast.roundStarting'));
            return;
        }
        if (!sendRoomMessage({ type: 'PLAYER_GUESS', matchId, round: gameState.roundIndex, guessLatLng: point ? { lat: point.lat, lng: point.lng } : null })) return;
        guessPending = true;
        const btn = document.getElementById('guess-btn');
        btn.disabled = true;
        btn.innerHTML = `<span>${t('game.confirming')}</span>`;
    }

    function sendMpGuess() { /* Solo and AI results stay local. Party guesses use submitRoomGuess. */ }

    function mpTotalFor(playerId) {
        return Object.values(gameState.mpGuesses || {})
            .reduce((sum, round) => sum + (round[playerId] ? round[playerId].score : 0), 0);
    }

    function royaleChipClass(id) {
        const st = serverMatch?.royale?.players?.[id];
        return st ? (st.alive ? 'royale-alive' : 'royale-ghost') : '';
    }
    function royaleChipHearts(id) {
        const st = serverMatch?.royale?.players?.[id];
        if (!st) return '';
        return `<span class="who-hearts">${st.alive ? '❤️'.repeat(st.lives) + (st.shield ? '🛡️' : '') : '👻'}</span>`;
    }
    function renderMpHudChips() {
        if (!isRealMultiplayer()) return;
        const hudCard = document.getElementById('hud-mp-status-card');
        const chips = document.getElementById('hud-mp-chips');
        if (!hudCard || !chips) return;
        const guesses = (gameState.mpGuesses || {})[gameState.roundIndex] || {};
        const me = myPlayerId || 'me';

        hudCard.style.display = 'flex';
        chips.innerHTML = getLobbyPlayers().map(p => {
            const g = guesses[p.id];
            const tip = `${p.name}${p.id === me ? ` (${t('party.you')})` : ''}${g && g.elapsed !== null ? ` · ${g.elapsed.toFixed(1)}s` : ''}`;
            return `
                <div class="who-chip ${g ? 'guessed' : ''} ${royaleChipClass(p.id)}" title="${escapeHTML(tip)}" aria-label="${escapeHTML(tip)}" data-player="${escapeHTML(p.id)}">
                    <div class="who-chip-avatar">${renderAvatarHTML(p, '100%', '100%')}</div>
                    <b class="who-chip-tick" aria-hidden="true">${g ? '✓' : ''}</b>${royaleChipHearts(p.id)}
                </div>
            `;
        }).join('');
    }

    // ============================================================
    //  SPECTATORS (Part F)
    // ============================================================
    function setSpectatorAnswer(value) { if (gameState.isHost) sendRoomMessage({ type: 'SET_SPECTATOR_ANSWER', value: !!value }); }

    function renderWatchingChip() {
        const chip = document.getElementById('hud-watching');
        if (!chip) return;
        chip.hidden = !lobbySpectators.length;
        if (!lobbySpectators.length) return;
        chip.innerHTML = `<span>${t('spectate.watchingChip', { n: lobbySpectators.length })}</span>
            <span class="watching-faces">${lobbySpectators.map(p => `<span class="watching-face" title="${escapeHTML(p.name)}">${renderAvatarHTML(p, '100%', '100%')}</span>`).join('')}</span>`;
    }

    function followed() {
        const players = getLobbyPlayers();
        return players.find(p => p.id === followId) || players[0];
    }
    function followStep(dir) {
        const players = getLobbyPlayers();
        if (!players.length) return;
        const i = Math.max(0, players.findIndex(p => p.id === followed()?.id));
        followId = players[(i + dir + players.length) % players.length].id;
        if (gameState.spectMatch) renderSpectator(gameState.spectMatch);
    }
    function setFollow(id) { followId = id; if (gameState.spectMatch) renderSpectator(gameState.spectMatch); }

    function setSpectTab(tab) {
        spectTab = tab; clearTimeout(spectTimer);
        if (gameState.spectMatch) renderSpectResults(gameState.spectMatch, { keepTab: true });
    }

    // Everything the spectator sees comes from the server's redacted view. The map only ever
    // plots what that view contains: the answer exists in it only after the reveal (or if the host allowed it).
    function renderSpectator(m) {
        const banner = document.getElementById('spectator-banner');
        banner.hidden = false;
        const cfg = MODE_CONFIG[currentMode];
        document.getElementById('spect-title').innerHTML = `<b>${t('spectate.banner', { n: m.round, total: cfg.rounds })}</b><span>${t('spectate.roundView')}</span>`;
        const players = getLobbyPlayers();
        const cur = followed();
        const guesses = m.guesses[m.round] || {};
        document.getElementById('spect-follow').innerHTML = players.map(p => `
            <button type="button" role="tab" class="spect-chip ${p.id === cur?.id ? 'on' : ''} ${guesses[p.id] ? 'guessed' : ''}" aria-selected="${p.id === cur?.id}" onclick="setFollow('${escapeHTML(p.id)}')" title="${escapeHTML(p.name)}">
                <span class="who-chip-avatar">${renderAvatarHTML(p, '100%', '100%')}</span></button>`).join('')
            + `<button type="button" class="spect-chip arrow" aria-label="${t('spectate.followNext')}" onclick="followStep(1)">→</button>`;
        if (cur) {
            const g = guesses[cur.id];
            const total = mpTotalFor(cur.id);
            const state = g ? t('spectate.guessed') : t('spectate.looking');
            const roundPts = g && g.score !== undefined ? `+${g.score.toLocaleString()}` : '';
            document.getElementById('spect-card').innerHTML = `
                <span class="spect-avatar" style="--aura:${getPlayerAura(cur.id)}">${renderAvatarHTML(cur, '100%', '100%')}</span>
                <div><b>${escapeHTML(cur.name)}</b><div class="spect-state">${g ? state : t('spectate.thinking')}</div></div>
                <div class="spect-score"><b>${total.toLocaleString()}</b><span>${roundPts}</span></div>`;
        }
        mpGuessesRef(m);
        drawSpectatorMap(m, cur);
        renderSpectResults(m);
        renderMpHudChips();
    }
    function mpGuessesRef(m) { gameState.mpGuesses = m.guesses; }

    function drawSpectatorMap(m, cur) {
        const map = gameState.guessMap;
        if (!map || !window.L) return;
        gameState.spectLayer?.remove();
        gameState.spectLayer = L.layerGroup().addTo(map);
        const guesses = m.guesses[m.round] || {};
        const pin = (p, g) => {
            if (!g?.guessLatLng) return;
            const aura = getPlayerAura(p.id);
            L.marker([g.guessLatLng.lat, g.guessLatLng.lng], { icon: L.divIcon({ className: 'custom-leaflet-player-marker', iconSize: [40, 52], iconAnchor: [20, 50],
                html: `<div class="marker-player-pin"><div class="marker-pin-bubble" style="border-color:${aura}">${renderAvatarHTML(p, '100%', '100%')}</div><div class="marker-pin-point" style="border-top-color:${aura}"></div></div>` }) }).addTo(gameState.spectLayer);
        };
        const revealed = !!m.answer && getLobbyPlayers().every(p => guesses[p.id]?.score !== undefined);
        // Before the reveal only the followed player's locked pin is shown, and only once it is locked.
        if (revealed) getLobbyPlayers().forEach(p => pin(p, guesses[p.id]));
        else if (cur) pin(cur, guesses[cur.id]);
        if (m.answer) L.marker([m.answer.lat, m.answer.lng], { icon: L.divIcon({ className: 'marker-pin-actual', iconSize: [18, 18] }) }).addTo(gameState.spectLayer);
    }

    function renderSpectResults(m, { keepTab = false } = {}) {
        const box = document.getElementById('spect-results');
        const guesses = m.guesses[m.round] || {};
        const players = getLobbyPlayers();
        const allIn = m.phase === 'playing' && players.length && players.every(p => guesses[p.id]?.score !== undefined);
        const wasHidden = box.hidden;
        box.hidden = !allIn;
        if (!allIn) { clearTimeout(spectTimer); spectTab = 'round'; return; }
        if (wasHidden && !keepTab) {
            spectTab = 'round'; clearTimeout(spectTimer);
            spectTimer = setTimeout(() => { if (spectTab === 'round') setSpectTab('overall'); }, 4000);
        }
        const rows = players.map(p => ({ id: p.id, name: p.name, isMe: false, aura: getPlayerAura(p.id), avatarSource: p, guess: guesses[p.id] || null, total: mpTotalFor(p.id) }));
        document.getElementById('spect-results-list').innerHTML = renderStandings({
            rows, tab: spectTab, deps: standingsDeps(), previousOrder: m.round <= 1 ? null : previousOrderFrom(rows)
        });
        document.querySelectorAll('#spect-tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === spectTab));
    }

    // ============================================================
    //  BATTLE ROYALE (Part B). Everything shown here is decided by the server.
    // ============================================================
    let royaleHitKey = null, duelShownFor = null, royaleSettingsSync = null;

    function myRoyale() { return serverMatch?.royale?.players?.[myPlayerId] || null; }

    function renderRoyaleLobby(settings) {
        const card = document.getElementById('royale-settings');
        if (!card) return;
        card.hidden = !MODE_CONFIG[currentMode]?.royale;
        if (!settings) return;
        royaleSettingsSync = settings;
        const lives = document.getElementById('royale-lives'), time = document.getElementById('royale-time'), ghost = document.getElementById('royale-ghost');
        if (document.activeElement !== lives) lives.value = String(settings.lives);
        if (document.activeElement !== time) time.value = String(settings.time);
        ghost.checked = !!settings.ghostPins;
        for (const el of [lives, time, ghost]) el.disabled = !gameState.isHost || !!serverMatch;
    }
    function setRoyaleSettings() {
        if (!gameState.isHost) return;
        sendRoomMessage({ type: 'SET_ROYALE', settings: {
            lives: Number(document.getElementById('royale-lives').value),
            time: Number(document.getElementById('royale-time').value),
            ghostPins: document.getElementById('royale-ghost').checked
        } });
    }

    // Points on a circle (great-circle destination), for the dimmed area outside the zone.
    function circlePoints(center, radius, n = 72) {
        const rad = Math.PI / 180, ang = radius / 6371000, lat1 = center.lat * rad, lng1 = center.lng * rad;
        return [...Array(n)].map((_, i) => {
            const b = (i / n) * 2 * Math.PI;
            const lat = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(b));
            const lng = lng1 + Math.atan2(Math.sin(b) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat));
            return [lat / rad, ((lng / rad + 540) % 360) - 180];
        });
    }
    // The zone ring and dimming sit on the guess map. Everyone, ghosts included, gets the same server zone.
    function applyRoyaleZone(m, tries = 0) {
        const zone = m.royale?.zone || null;
        const map = gameState.guessMap;
        if (!map || !window.L) { if (tries < 30) setTimeout(() => applyRoyaleZone(m, tries + 1), 150); return; }
        const key = zone ? `${m.id}:${m.round}:${zone.center.lat}:${zone.radius}` : `${m.id}:${m.round}:none`;
        if (gameState.zoneKey === key) return;
        gameState.zoneKey = key;
        gameState.zoneLayer?.remove();
        gameState.zoneLayer = null;
        if (!zone) return;
        const ring = L.circle([zone.center.lat, zone.center.lng], { radius: zone.radius, color: '#e4578a', weight: 4, fill: false, className: 'royale-zone-ring', interactive: false });
        const dim = L.polygon([[[-85, -180], [-85, 180], [85, 180], [85, -180]], circlePoints(zone.center, zone.radius)], { stroke: false, fillColor: '#0b1b1c', fillOpacity: 0.5, interactive: false });
        gameState.zoneLayer = L.layerGroup([dim, ring]).addTo(map);
        // Players cannot wander off: pan limits shrink to the zone.
        const bounds = ring.getBounds().pad(0.2);
        map.setMinZoom(1);
        map.setMaxBounds(bounds);
        map.fitBounds(ring.getBounds(), { animate: false, padding: [10, 10] });
        map.setMinZoom(Math.max(1, map.getZoom() - 1));
    }

    function drawGhostPins(m) {
        const map = gameState.guessMap;
        if (!map || !window.L) return;
        gameState.ghostPinLayer?.remove();
        gameState.ghostPinLayer = L.layerGroup().addTo(map);
        for (const p of m.royale?.ghostPinList || []) {
            L.marker([p.lat, p.lng], { interactive: false, icon: L.divIcon({ className: 'ghost-pin', html: '<span>👻</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(gameState.ghostPinLayer);
        }
    }

    function royaleHud(m) {
        const R = m.royale;
        const players = getLobbyPlayers();
        const alive = players.filter(p => R.players[p.id]?.alive).length;
        const card = document.getElementById('hud-mp-status-card');
        if (card) {
            card.style.display = 'flex';
            let counter = document.getElementById('royale-alive');
            if (!counter) { counter = document.createElement('div'); counter.id = 'royale-alive'; card.prepend(counter); }
            counter.textContent = t('royale.alive', { n: alive, total: players.length });
        }
        const pill = document.getElementById('hud-mode-pill');
        if (pill && R.ghostPinCount) pill.dataset.ghosts = R.ghostPinCount;
        drawGhostPins(m);
    }

    // ~3 s hit sequence: losers shake, a heart breaks, the eliminated crash out of a tuk-tuk and become ghosts.
    function maybeShowHits(m) {
        const R = m.royale, res = R.results?.[m.round];
        if (!res) return;
        const key = `${m.id}:${m.round}`;
        if (royaleHitKey === key) return;
        royaleHitKey = key;
        const box = document.getElementById('royale-hit');
        box.innerHTML = `<div class="hit-row">${res.map(o => {
            const p = playerById(o.id) || { name: R.players[o.id]?.name || '?' };
            const state = o.eliminated ? 'out' : o.lostLife ? 'hurt' : o.shieldBlocked ? 'shield' : 'safe';
            const badge = o.eliminated ? '🛺💥' : o.lostLife ? '💔' : o.shieldBlocked ? '🛡️' : '';
            return `<div class="hit-chip ${state}"><span class="hit-avatar">${renderAvatarHTML(p, '100%', '100%')}</span>
                <b class="hit-badge">${badge}</b><span class="hit-name">${escapeHTML(p.name)}</span>
                <span class="hit-lives">${'❤️'.repeat(Math.max(0, o.lives))}</span>
                ${o.eliminated ? `<span class="hit-note">${t('royale.crash')}</span>` : o.lostLife ? `<span class="hit-note">${t('royale.lostLife')}</span>` : ''}</div>`;
        }).join('')}</div>`;
        box.hidden = false;
        playBeep(180, 'sawtooth', 0.2);
        setTimeout(() => { if (royaleHitKey === key) box.hidden = true; }, 3000);
    }

    function maybeDuelSplash(m) {
        const R = m.royale;
        if (!R.duel || duelShownFor === m.id) return;
        duelShownFor = m.id;
        const duelists = getLobbyPlayers().filter(p => R.players[p.id]?.alive);
        const splash = document.getElementById('duel-splash');
        splash.innerHTML = `<div class="duel-title">${t('royale.duel')}</div><div class="duel-faces">${duelists.map((p, i) => `
            <div class="duel-face"><span>${renderAvatarHTML(p, '100%', '100%')}</span><b>${escapeHTML(p.name)}</b></div>${i === 0 ? '<i>VS</i>' : ''}`).join('')}</div>`;
        splash.hidden = false;
        setTimeout(() => { splash.hidden = true; }, 2200);
    }

    // The eliminated watch as ghosts: panorama, the answer (after 5 s), the living locking in, and one ghost pin per round.
    function renderGhost(m) {
        const R = m.royale;
        const banner = document.getElementById('spectator-banner');
        banner.hidden = false;
        document.getElementById('spect-title').innerHTML = `<b>${t('royale.ghostBanner', { n: m.round })}</b><span>${t('royale.you_ghost')}</span>`;
        document.getElementById('spect-follow').innerHTML = '';
        document.getElementById('spect-card').innerHTML = '';
        const map = gameState.guessMap;
        if (map && window.L) {
            gameState.spectLayer?.remove();
            gameState.spectLayer = L.layerGroup().addTo(map);
            if (m.answer) L.marker([m.answer.lat, m.answer.lng], { icon: L.divIcon({ className: 'marker-pin-actual', iconSize: [18, 18] }) }).addTo(gameState.spectLayer);
            for (const p of getLobbyPlayers()) {
                const g = (m.guesses[m.round] || {})[p.id];
                if (!g?.guessLatLng || !R.players[p.id]?.alive) continue;
                const aura = getPlayerAura(p.id);
                L.marker([g.guessLatLng.lat, g.guessLatLng.lng], { icon: L.divIcon({ className: 'custom-leaflet-player-marker', iconSize: [40, 52], iconAnchor: [20, 50],
                    html: `<div class="marker-player-pin"><div class="marker-pin-bubble" style="border-color:${aura}">${renderAvatarHTML(p, '100%', '100%')}</div><div class="marker-pin-point" style="border-top-color:${aura}"></div></div>` }) }).addTo(gameState.spectLayer);
            }
        }
        const btn = document.getElementById('guess-btn');
        const can = R.settings.ghostPins && !R.mineDropped && !R.results?.[m.round];
        btn.disabled = !can || !gameState.guessLatLng;
        btn.classList.toggle('ready', can && !!gameState.guessLatLng);
        btn.innerHTML = `<span>${R.mineDropped ? t('royale.pinDropped') : t('royale.dropPin')}</span>`;
        // Results for the round, once decided.
        const box = document.getElementById('spect-results');
        const decided = !!R.results?.[m.round];
        box.hidden = !decided;
        if (decided) {
            document.getElementById('spect-tabs').hidden = true;
            document.getElementById('spect-results-list').innerHTML = renderStandings({ rows: mpStandingRows(), tab: 'round', royale: true, deps: standingsDeps() });
        }
    }
    function dropGhostPin() {
        if (!gameState.guessLatLng || !gameState.ghost) return;
        sendRoomMessage({ type: 'GHOST_PIN', latLng: { lat: gameState.guessLatLng.lat, lng: gameState.guessLatLng.lng } });
        showToast(t('royale.pinDropped'));
        const btn = document.getElementById('guess-btn');
        btn.disabled = true; btn.classList.remove('ready');
    }

    // Called from applyRoomState for every Royale state update.
    function applyRoyale(m) {
        const R = m.royale;
        const me = R.players[myPlayerId];
        gameState.royale = R;
        gameState.ghost = !!me && !me.alive;
        document.body.dataset.ghost = gameState.ghost ? '1' : '';
        document.body.dataset.duel = R.duel && m.phase === 'playing' ? '1' : '';
        document.body.dataset.royale = '1';
        applyRoyaleZone(m);
        royaleHud(m);
        if (m.phase === 'playing') maybeDuelSplash(m);
        maybeShowHits(m);
        if (m.phase === 'final') document.getElementById('royale-hit').hidden = true;
    }
    function clearRoyaleUI() {
        document.body.dataset.ghost = ''; document.body.dataset.duel = ''; document.body.dataset.royale = '';
        gameState.ghost = false; gameState.royale = null; gameState.zoneKey = null;
        gameState.zoneLayer?.remove(); gameState.ghostPinLayer?.remove(); gameState.spectLayer?.remove();
        royaleHitKey = null; duelShownFor = null;
        const counter = document.getElementById('royale-alive'); if (counter) counter.remove();
        for (const id of ['royale-hit', 'duel-splash']) { const el = document.getElementById(id); if (el) el.hidden = true; }
        const tabs = document.getElementById('spect-tabs'); if (tabs) tabs.hidden = false;
    }

    // ---- Standings (Part E): rows are built from server data; the component only sorts and draws.
    const standingsDeps = () => ({
        esc: escapeHTML, t,
        fmtDist: formatDistanceStr,
        avatar: r => renderAvatarHTML(r.avatarSource || r, '100%', '100%')
    });
    let standingsTab = 'round';
    let standingsRows = [];
    let standingsAutoTimer = null;

    function simStandingRows() {
        return gameState.simPlayers.map(p => ({
            id: p.id, name: p.name, isMe: !!p.isMe, aura: p.aura, avatarSource: p,
            guess: p.currentGuess ? { dist: p.currentGuess.dist, elapsed: p.currentGuess.elapsed ?? null, score: p.currentGuess.score } : null,
            total: p.totalScore
        }));
    }
    function mpStandingRows() {
        const guesses = (gameState.mpGuesses || {})[gameState.roundIndex] || {};
        const me = myPlayerId || 'me';
        return getLobbyPlayers().map(p => {
            const g = guesses[p.id] || null;
            const R = serverMatch?.royale, st = R?.players?.[p.id], res = R?.results?.[gameState.roundIndex]?.find(o => o.id === p.id);
            return { id: p.id, name: p.name, isMe: p.id === me, aura: getPlayerAura(p.id), avatarSource: p, guess: g, total: mpTotalFor(p.id),
                ...(st ? { hearts: st.lives, shield: st.shield, alive: st.alive, eliminatedRound: st.eliminatedRound, lostLife: !!res?.lostLife, shieldBlocked: !!res?.shieldBlocked } : {}) };
        });
    }
    // Called once when a result screen opens: "This round" first, then the running totals
    // once the count-up has landed. The player can tap either tab at any time.
    function beginStandings() {
        standingsTab = 'round';
        clearTimeout(standingsAutoTimer);
        const listEl = document.getElementById('mp-round-players-list'); if (listEl) delete listEl.dataset.sig;
        standingsAutoTimer = setTimeout(() => { if (standingsTab === 'round') setStandingsTab('overall'); }, 4000);
    }
    function paintStandings(rows) {
        const list = document.getElementById('mp-round-players-list');
        if (!list) return;
        standingsRows = rows;
        const sig = standingsTab + ':' + rows.length;
        const animate = list.dataset.sig !== sig;
        list.dataset.sig = sig;
        const first = Number(gameState.roundIndex) <= 1;
        list.innerHTML = renderStandings({
            rows, tab: standingsTab, deps: standingsDeps(), royale: !!serverMatch?.royale,
            previousOrder: first ? null : previousOrderFrom(rows)
        });
        document.querySelectorAll('#standings-tabs [data-tab]').forEach(b => {
            const on = b.dataset.tab === standingsTab;
            b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
        });
        // Rows slide in by rank, once per tab (server updates repaint without replaying it).
        if (animate) list.querySelectorAll('.st-row, .st-step').forEach(el => el.classList.add('st-in'));
    }
    function setStandingsTab(tab) {
        standingsTab = tab;
        clearTimeout(standingsAutoTimer);
        if (standingsRows.length) paintStandings(standingsRows);
    }

    function renderTeamRow(r, idx, me, showRoundPoints) {
        const g = r.guess;
        const color = TEAM_COLORS[r.i % TEAM_COLORS.length];
        const mine = r.team.playerIds.includes(me);
        const medals = ['🥇', '🥈', '🥉'];
        const detail = showRoundPoints
            ? (!g ? t('result.stillGuessing') : g.dist === null ? t('result.noGuess') : `${formatDistanceStr(g.dist)}${g.elapsed !== null ? ` (${g.elapsed.toFixed(1)}s)` : ''}`)
            : '';
        const faces = r.team.playerIds.map(id => {
            const p = playerById(id);
            return p ? `<span class="team-row-face" style="border-color:${color};">${renderAvatarHTML(p, '100%', '100%')}</span>` : '';
        }).join('');
        return `
            <div class="mp-leaderboard-row team-row ${idx === 0 && (g || !showRoundPoints) ? 'rank-1' : ''} ${mine ? 'is-me' : ''}" style="--team-color:${color};">
                <div class="team-row-main">
                    <span class="team-row-rank">${g || !showRoundPoints ? (medals[idx] || `${idx + 1}.`) : '…'}</span>
                    <span class="team-row-faces">${faces}</span>
                    <div>
                        <div class="team-row-name">${escapeHTML(teamNames(r.team))}${mine ? ` <span class="team-row-you">${t('party.you')}</span>` : ''}</div>
                        ${detail ? `<div class="team-row-detail">${detail}</div>` : ''}
                    </div>
                </div>
                <div class="team-row-score">
                    ${showRoundPoints && g ? `<div class="team-row-round">+${g.score.toLocaleString()} ${t('final.points')}</div>` : ''}
                    <div class="team-row-total">${showRoundPoints ? t('final.total') + ': ' : ''}${r.total.toLocaleString()}${showRoundPoints ? '' : ' ' + t('final.points')}</div>
                </div>
            </div>
        `;
    }

    function renderMpRoundLeaderboard() {
        const list = document.getElementById('mp-round-players-list');
        if (!list) return;
        const guesses = (gameState.mpGuesses || {})[gameState.roundIndex] || {};
        const me = myPlayerId || 'me';

        if (isTeamMode() && serverTeams.length) {
            const teamRows = serverTeams.map((team, i) => {
                const lead = team.playerIds[0];
                return { team, i, guess: guesses[lead] || null, total: mpTotalFor(lead) };
            }).sort((a, b) => (a.guess ? (a.guess.dist ?? 1e8) : 1e9) - (b.guess ? (b.guess.dist ?? 1e8) : 1e9));
            list.innerHTML = teamRows.map((r, idx) => renderTeamRow(r, idx, me, true)).join('');
            return;
        }

        paintStandings(mpStandingRows());
    }

    function refreshMpResultPins() {
        if (!isRealMultiplayer() || !gameState.resultMap || !gameState.currentLocation) return;
        if (gameState.mpPinLayer) gameState.mpPinLayer.remove();
        gameState.mpPinLayer = L.layerGroup().addTo(gameState.resultMap);

        const guesses = (gameState.mpGuesses || {})[gameState.roundIndex] || {};
        const me = myPlayerId || 'me';
        const actualLoc = [gameState.currentLocation.lat, gameState.currentLocation.lng];

        const myTeamIds = isTeamMode() ? (myTeam()?.playerIds || []) : [];
        const shownTeams = new Set();
        // Pin labels carry the same round rank as the standings list.
        const rankOf = Object.fromEntries(sortByRoundPoints(mpStandingRows()).map((r, i) => [r.id, i + 1]));
        getLobbyPlayers().forEach(p => {
            const g = guesses[p.id];
            if (p.id === me || !g || !g.guessLatLng) return;
            if (isTeamMode()) {
                if (myTeamIds.includes(p.id)) return; // our own team pin is already drawn
                const team = serverTeams.find(tm => tm.playerIds.includes(p.id));
                if (team) { if (shownTeams.has(team.id)) return; shownTeams.add(team.id); }
            }
            const aura = getPlayerAura(p.id);
            const guessLoc = [g.guessLatLng.lat, g.guessLatLng.lng];
            const html = `
                <div class="marker-player-pin">
                    <div class="marker-pin-bubble" style="border-color: ${aura};">${renderAvatarHTML(p, '100%', '100%')}</div>
                    <div class="marker-pin-point" style="border-top-color: ${aura};"></div>
                    <div class="marker-pin-label" style="border-color: ${aura};">${isTeamMode() ? '' : '#' + rankOf[p.id] + ' '}${escapeHTML(p.name)}: ${formatDistanceStr(g.dist)}</div>
                </div>
            `;
            L.marker(guessLoc, {
                icon: L.divIcon({ className: 'custom-leaflet-player-marker', html, iconSize: [40, 52], iconAnchor: [20, 50] })
            }).addTo(gameState.mpPinLayer);
            L.polyline([actualLoc, guessLoc], { color: aura, weight: 3, dashArray: '6,6', opacity: 0.85 }).addTo(gameState.mpPinLayer);
        });
    }

    function sendLobbyEmote(text) {
        if (LOBBY_EMOTES.includes(text)) sendRoomMessage({ type: 'LOBBY_EMOTE', emote: text });
    }

    function copyInviteLink() {
        const code = gameState.roomCode;
        const link = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(code);
        navigator.clipboard.writeText(link).then(() => {
            showToast(t('toast.linkCopied', { code }));
        }).catch(() => {
            prompt(t('toast.linkPrompt'), link);
        });
    }

    function inviteLink() {
        const code = gameState.roomCode || '';
        return window.location.origin + window.location.pathname + (code ? '?room=' + encodeURIComponent(code) : '');
    }

    function shareInviteLink() {
        const url = inviteLink();
        const text = t('party.shareText', { code: gameState.roomCode || '' });
        if (navigator.share) {
            navigator.share({ title: 'WanderPenh', text, url }).catch(() => {});
            return;
        }
        // Desktop fallback: copy the same link Telegram would receive.
        navigator.clipboard.writeText(url).then(() => {
            showToast(t('toast.linkCopied', { code: gameState.roomCode || '' }));
        }).catch(() => {
            prompt(t('toast.linkPrompt'), url);
        });
    }

    // ============================================================
    //  RANKED: device identity, server-scored runs and leaderboards
    // ============================================================
    const DEVICE_KEY = 'wanderpenh_device';
    const TIER_ICONS = { tourist: '🎒', moto: '🛵', tuktuk: '🛺', guide: '🧭', khan: '🏙️', legend: '👑' };
    let deviceMemo = null;
    let rankedRegion = null;
    let boardTab = 'week';
    let boardMode = 'classic';
    let myRatings = null;
    let boardData = null;
    let boardState = 'idle';      // idle | loading | ready | offline
    let boardRequest = 0;

    function randomHex(bytes) {
        return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    function newUuid() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const h = randomHex(16);
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    }
    function validDevice(d) {
        return !!d && /^[0-9a-f-]{36}$/.test(d.playerId) && /^[0-9a-f]{32,64}$/.test(d.secret);
    }
    // A random id plus a secret kept on this device. No account is needed.
    function deviceIdentity() {
        if (deviceMemo) return deviceMemo;
        try {
            const saved = JSON.parse(localStorage.getItem(DEVICE_KEY));
            if (validDevice(saved)) return (deviceMemo = { playerId: saved.playerId, secret: saved.secret });
        } catch {}
        deviceMemo = { playerId: newUuid(), secret: randomHex(16) };
        try { localStorage.setItem(DEVICE_KEY, JSON.stringify(deviceMemo)); } catch {}
        return deviceMemo;
    }

    async function rankedFetch(path, body = {}) {
        try {
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...deviceIdentity(), name: cleanText(userProfile.name, 'Explorer', 20), ...body })
            });
            return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
        } catch {
            return { ok: false, status: 0, data: {} };
        }
    }

    function rankedModesFor(region) {
        return Object.entries(MODE_CONFIG).filter(([, m]) => m.ranked && m.region === region);
    }
    function tierName(id) { return t('tier.' + id); }
    function tierBadgeHTML(id, small = false) {
        return `<span class="tier-badge tier-${id} ${small ? 'sm' : ''}" role="img" aria-label="${escapeHTML(tierName(id))}">${TIER_ICONS[id] || '🎒'}</span>`;
    }

    function openRanked(mode) {
        rankedRegion = (mode && MODE_CONFIG[mode]?.region) || rankedRegion || currentRegion;
        if (mode) { boardTab = 'week'; boardMode = mode; }
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById('ranked-screen').classList.add('active');
        document.getElementById('ranked-screen').scrollTop = 0;
        paintRankedScreen();
        refreshRankedScreen();
    }
    function closeRanked() { backToHome(); }

    function setRankedRegion(region) {
        if (region !== 'kh' && region !== 'world') return;
        rankedRegion = region;
        boardMode = defaultBoardMode();
        paintRankedScreen();
        loadBoard();
    }
    function setBoardTab(tab) {
        boardTab = tab;
        paintRankedScreen();
        loadBoard();
    }
    function setBoardMode(mode) {
        boardMode = mode;
        loadBoard();
    }
    function defaultBoardMode() {
        return rankedModesFor(rankedRegion)[0]?.[0] || 'classic';
    }
    function boardModeOptions() {
        const solo = rankedModesFor(rankedRegion).map(([key, m]) => ({ value: key, label: `${t('ranked.solo')} · ${modeName(m)}` }));
        const party = Object.entries(MODE_CONFIG)
            .filter(([, m]) => m.region === rankedRegion && (m.ranked || m.teams))
            .map(([key, m]) => ({ value: 'party:' + key, label: `${t('ranked.party')} · ${modeName(m)}` }));
        return [...solo, ...party, { value: 'party', label: t('ranked.partyAll') }];
    }

    async function refreshRankedScreen() {
        const me = await rankedFetch('/api/me');
        setUnlocks(me?.unlocks);
        myRatings = me.ok ? me.data.ratings : null;
        paintRankRank();
        loadBoard();
    }

    function paintRankedScreen() {
        if (!rankedRegion) rankedRegion = currentRegion;
        document.querySelectorAll('#ranked-region-switch [data-ranked-region]').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.rankedRegion === rankedRegion ? 'true' : 'false');
        });
        const modes = rankedModesFor(rankedRegion);
        document.getElementById('ranked-modes').innerHTML = modes.map(([key, m]) => `
            <button class="ranked-mode-btn" type="button" onclick="startRankedRun('${key}')">
                <span aria-hidden="true">${m.icon === 'flame' ? '🔥' : '📍'}</span>
                <span>${escapeHTML(modeName(m))}<small>${t('mode.perRound', { n: m.time })} · ${t('mode.rounds', { n: m.rounds })}</small></span>
            </button>`).join('');
        document.querySelectorAll('.board-tabs [data-board-tab]').forEach(btn => {
            btn.setAttribute('aria-selected', btn.dataset.boardTab === boardTab ? 'true' : 'false');
        });
        const wrap = document.getElementById('board-mode-wrap');
        wrap.hidden = boardTab === 'rating';
        const options = boardModeOptions();
        if (!options.some(o => o.value === boardMode)) boardMode = defaultBoardMode();
        const select = document.getElementById('board-mode');
        select.innerHTML = options.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
        select.value = boardMode;
        const code = document.getElementById('backup-code');
        if (code) code.value = backupCodeValue();
        paintRankRank();
        paintBoard();
    }

    function paintRankRank() {
        const card = document.getElementById('rank-card');
        if (!card) return;
        const r = myRatings && myRatings[rankedRegion];
        if (!r) {
            card.innerHTML = `<div class="rank-card-main"><span class="rank-card-hint">${boardState === 'offline' ? t('ranked.offline') : t('ranked.loading')}</span></div>`;
            return;
        }
        const span = r.next ? r.next.min - r.tierMin : 1;
        const pct = r.next ? Math.max(4, Math.min(100, Math.round((r.rating - r.tierMin) / span * 100))) : 100;
        const hint = r.games === 0 ? t('ranked.runs0')
            : r.next ? t('ranked.progress', { n: r.next.min - r.rating, tier: tierName(r.next.id) })
            : t('ranked.maxTier');
        card.innerHTML = `
            ${tierBadgeHTML(r.tier)}
            <div class="rank-card-main">
                <div class="rank-card-tier">${escapeHTML(tierName(r.tier))}</div>
                <div class="rank-card-rating">${r.rating.toLocaleString()} · ${t('ranked.games', { n: r.games })}</div>
                <div class="rank-bar"><span style="width:${pct}%"></span></div>
                <div class="rank-card-hint">${hint}</div>
            </div>`;
    }

    async function loadBoard() {
        const token = ++boardRequest;
        boardState = 'loading';
        paintBoard();
        const rating = boardTab === 'rating';
        const params = new URLSearchParams({
            type: rating ? 'rating' : 'score',
            period: rating ? 'week' : boardTab,
            mode: boardMode,
            region: rankedRegion,
            playerId: deviceIdentity().playerId
        });
        try {
            const res = await fetch('/api/leaderboard?' + params);
            if (token !== boardRequest) return;
            if (!res.ok) throw new Error('status ' + res.status);
            boardData = await res.json();
            boardState = 'ready';
        } catch {
            if (token !== boardRequest) return;
            boardData = null;
            boardState = 'offline';
        }
        paintBoard();
        paintRankRank();
    }

    function paintBoard() {
        const list = document.getElementById('board-list');
        const meBox = document.getElementById('board-me');
        if (!list || !meBox) return;
        if (boardState === 'loading' || boardState === 'idle') {
            list.innerHTML = `<div class="board-empty">${t('ranked.loading')}</div>`;
            meBox.innerHTML = '';
            return;
        }
        if (boardState === 'offline' || !boardData) {
            list.innerHTML = `<div class="board-empty">${t('ranked.offline')}</div>`;
            meBox.innerHTML = '';
            return;
        }
        const isRating = boardData.type === 'rating';
        const medals = ['🥇', '🥈', '🥉'];
        if (!boardData.rows.length) list.innerHTML = `<div class="board-empty">${t('ranked.empty')}</div>`;
        else list.innerHTML = boardData.rows.map(row => `
            <div class="board-row ${row.isMe ? 'is-me' : ''} ${row.rank === 1 ? 'top-1' : ''}">
                <span class="board-rank">${medals[row.rank - 1] || row.rank}</span>
                <span class="board-name">${isRating ? tierBadgeHTML(row.tier, true) : ''}<span>${escapeHTML(row.name)}${row.isMe ? ` <small>(${t('ranked.you')})</small>` : ''}</span></span>
                <span class="board-value">${row.value.toLocaleString()}${isRating ? '' : ' ' + t('ranked.pts')}</span>
            </div>`).join('');
        const inList = boardData.rows.some(row => row.isMe);
        let foot = '';
        if (boardData.me && !inList) foot = `<div><strong>${t('ranked.yourRank')}:</strong> #${boardData.me.rank} · ${boardData.me.value.toLocaleString()}${isRating ? '' : ' ' + t('ranked.pts')}</div>`;
        else if (!boardData.me && boardData.rows.length) foot = `<div>${t('ranked.notRanked')}</div>`;
        if (!isRating && boardData.period === 'week') foot += `<div class="board-foot">${t('ranked.weekStarts')}</div>`;
        meBox.innerHTML = foot;
    }

    function backupCodeValue() {
        const id = deviceIdentity();
        return `${id.playerId}:${id.secret}`;
    }
    async function copyBackupCode() {
        const input = document.getElementById('backup-code');
        try { await navigator.clipboard.writeText(input.value); showToast(t('ranked.copied')); }
        catch { input.select(); }
    }
    async function restoreBackupCode() {
        const raw = document.getElementById('restore-code').value.trim().toLowerCase();
        const m = raw.match(/^([0-9a-f-]{36}):([0-9a-f]{32,64})$/);
        if (!m) { showToast(t('ranked.restoreFailed')); return; }
        let res;
        try {
            const r = await fetch('/api/me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: m[1], secret: m[2], restore: true })
            });
            res = { ok: r.ok, data: await r.json().catch(() => ({})) };
        } catch { res = { ok: false }; }
        if (!res.ok) { showToast(t('ranked.restoreFailed')); return; }
        deviceMemo = { playerId: m[1], secret: m[2] };
        try { localStorage.setItem(DEVICE_KEY, JSON.stringify(deviceMemo)); } catch {}
        document.getElementById('restore-code').value = '';
        showToast(t('ranked.restored'));
        paintRankedScreen();
        refreshRankedScreen();
    }

    // ---- a ranked run: every round is started, timed and scored by the server ----
    async function startRankedRun(mode) {
        const cfg = MODE_CONFIG[mode];
        if (!cfg?.ranked) return;
        const buttons = document.querySelectorAll('.ranked-mode-btn');
        buttons.forEach(b => { b.disabled = true; });
        showToast(t('ranked.starting'));
        const res = await rankedFetch('/api/ranked/start', { mode });
        buttons.forEach(b => { b.disabled = false; });
        if (!res.ok) {
            showToast(res.status === 429 ? t('ranked.rateLimited') : res.status === 503 ? t('ranked.offline') : t('ranked.failed'));
            return;
        }
        const d = res.data;
        gameState.isMultiplayer = false;
        gameState.simulated4P = false;
        gameState.streakCount = 0;
        const mpCard = document.getElementById('hud-mp-status-card');
        if (mpCard) mpCard.style.display = 'none';
        gameState.ranked = {
            mode, runId: d.runId, offset: d.serverNow - Date.now(), startedAt: d.startedAt, deadline: d.deadline,
            pending: false, rating: null, saved: false, before: myRatings && myRatings[cfg.region] || null
        };
        beginMatch(mode, d.plan, 1);
    }

    async function submitRankedGuess(point, attempt = 1) {
        const run = gameState.ranked;
        if (!run || gameState.roundSubmitted || run.pending) return;
        run.pending = true;
        clearInterval(gameState.timerInterval);
        const btn = document.getElementById('guess-btn');
        btn.disabled = true;
        btn.innerHTML = `<span>${t('game.confirming')}</span>`;
        const res = await rankedFetch('/api/ranked/guess', {
            round: gameState.roundIndex,
            guessLatLng: point ? { lat: point.lat, lng: point.lng } : null
        });
        run.pending = false;
        if (!res.ok) {
            if (res.status === 409 || res.status === 404) { showToast(t('ranked.expired')); abandonRankedRun(); return; }
            if (attempt < 3) { setTimeout(() => submitRankedGuess(point, attempt + 1), 1500 * attempt); return; }
            showToast(t('ranked.failed'));
            btn.disabled = !gameState.guessLatLng;
            return;
        }
        const d = res.data;
        gameState.roundSubmitted = true;
        gameState.totalScore = d.total;
        gameState.roundScore = d.distScore;
        gameState.roundSpeedBonus = d.speedBonus + d.bountyBonus;
        gameState.roundDistance = d.dist === null ? 10000 : d.dist;
        gameState.roundMatchedChoice = false;
        gameState.roundsHistory.push({
            round: d.round, area: gameState.currentLocation.name, dist: gameState.roundDistance,
            distScore: d.distScore, speedBonus: d.speedBonus + d.bountyBonus, total: d.score
        });
        if (d.done) { run.rating = d.rating; run.saved = !!d.leaderboard && !!d.rating; myRatings = null; }
        playSuccessChime();
        showRoundResult();
    }

    async function advanceRankedRound() {
        const run = gameState.ranked;
        if (!run || run.pending || !gameState.roundSubmitted) return;
        const cfg = MODE_CONFIG[currentMode];
        if (gameState.roundIndex >= cfg.rounds) {
            document.getElementById('result-screen').classList.remove('active');
            showFinalPodium();
            return;
        }
        const nextBtn = document.getElementById('res-next-btn');
        run.pending = true;
        nextBtn.disabled = true;
        const res = await rankedFetch('/api/ranked/next');
        run.pending = false;
        if (!res.ok) {
            nextBtn.disabled = false;
            if (res.status === 409 || res.status === 404) { showToast(t('ranked.expired')); abandonRankedRun(); }
            else showToast(t('ranked.failed'));
            return;
        }
        run.startedAt = res.data.startedAt;
        run.deadline = res.data.deadline;
        run.offset = res.data.serverNow - Date.now();
        document.getElementById('result-screen').classList.remove('active');
        loadRound();
    }

    function abandonRankedRun() {
        clearInterval(gameState.timerInterval);
        gameState.ranked = null;
        gameState.matchPlan = null;
        openRanked();
    }

    function rankedSummaryHTML(run) {
        const open = `<button class="btn btn-sm btn-ghost" type="button" onclick="openRanked('${run.mode}')">${t('ranked.openBoard')}</button>`;
        if (!run.saved || !run.rating) {
            return `<div class="ranked-result"><div class="ranked-result-main"><strong>${t('ranked.finalTitle')}</strong><span class="rank-card-hint">${t('ranked.notSaved')}</span></div>${open}</div>`;
        }
        const r = run.rating;
        const sign = r.delta > 0 ? '+' : '';
        return `
            <div class="ranked-result">
                ${tierBadgeHTML(r.tier)}
                <div class="ranked-result-main">
                    <strong>${escapeHTML(tierName(r.tier))}</strong>
                    <span>${r.before.toLocaleString()} → <b>${r.after.toLocaleString()}</b></span>
                    <span class="ranked-delta ${r.delta >= 0 ? 'up' : 'down'}">${t('ranked.change')}: ${sign}${r.delta}</span>
                </div>
                ${open}
            </div>`;
    }

    function leaveLobby() {
        closeModal('profile-modal');
        try { sessionStorage.removeItem('wanderpenh_room_' + gameState.roomCode); } catch {}
        clearInterval(gameState.timerInterval);
        teardownRoom();
        gameState.isMultiplayer = false;
        gameState.isHost = false;
        gameState.roomCode = null;
        gameState.matchPlan = null;
        gameState.activeMatch = null;
        const mpCard = document.getElementById('hud-mp-status-card');
        if (mpCard) mpCard.style.display = 'none';

        // Drop ?room= so a refresh doesn't rejoin the party
        if (window.location.search) history.replaceState(null, '', window.location.pathname);

        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('start-screen').classList.add('active');
        renderModeCards();
    }

    function backToHome() {
        gameState.ranked = null;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('result-screen').classList.remove('active');
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
        gameState.roundSubmitted = false;
        clearInterval(gameState.timerInterval);
        updateHomeChrome();
        renderModeCards();
    }

    function joinFromHome() {
        const value = document.getElementById('home-join-input').value.trim();
        if (!value) return;
        document.getElementById('join-code-input').value = value;
        joinMultiplayerLobby();
    }

    function telegramShareUrl() {
        const code = gameState.roomCode || '';
        const url = window.location.origin + window.location.pathname + (code ? '?room=' + encodeURIComponent(code) : '');
        const text = `Join my WanderPenh party${code ? ' — ' + code : ''}`;
        return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    }

    function shareTelegram() {
        window.open(telegramShareUrl(), '_blank', 'noopener');
    }

    // ============================================================
    //  INITIALIZATION
    // ============================================================
    function boot() {
        // Theme first so there is no flash of the wrong palette.
        let savedTheme = null;
        try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

        let savedLang = null;
        try { savedLang = localStorage.getItem('wanderpenh_lang'); } catch (e) {}
        const savedRegion = readSavedRegion();
        const urlParams = new URLSearchParams(window.location.search);
        const room = urlParams.get('room');

        setLang(savedLang === 'km' ? 'km' : savedLang === 'en' ? 'en' : (savedRegion === 'world' ? 'en' : 'km'));
        applyI18n();
        document.getElementById('lang-toggle').textContent = getLang() === 'km' ? 'EN' : 'ខ្មែរ';

        loadProfile();

        if (savedRegion) {
            setRegion(savedRegion, { persist: false });
            document.getElementById('doors-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
        } else if (room) {
            setRegion('kh');
            document.getElementById('start-screen').classList.add('active');
        } else {
            setRegion('kh', { persist: false });
            document.getElementById('doors-screen').classList.add('active');
        }

        renderModeCards();
        updateHomeChrome();

        // Door choice.
        document.querySelectorAll('[data-pick-region]').forEach(btn => {
            btn.addEventListener('click', () => {
                const region = btn.dataset.pickRegion;
                if (!savedLang) setLanguage(region === 'kh' ? 'km' : 'en');
                setRegion(region, { reveal: true });
                maybeShowCoach();
            });
        });

        // Header controls.
        document.querySelectorAll('#region-switch [data-region]').forEach(btn => {
            btn.addEventListener('click', () => setRegion(btn.dataset.region));
        });
        document.querySelectorAll('#party-region-switch [data-region]').forEach(btn => {
            btn.addEventListener('click', () => {
                setRegion(btn.dataset.region);
                renderPartyModes();
            });
        });
        document.getElementById('lang-toggle').addEventListener('click', () => {
            setLanguage(getLang() === 'km' ? 'en' : 'km');
        });
        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        // Ticket and mode list.
        document.getElementById('play-now-btn').addEventListener('click', () => startQuickPlay());
        document.getElementById('more-toggle').addEventListener('click', () => {
            const wrap = document.getElementById('more-modes');
            const open = wrap.hidden;
            wrap.hidden = !open;
            document.getElementById('more-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        // Coach marks and map sheet.
        document.getElementById('coach-next').addEventListener('click', nextCoachStep);
        setupSheetGesture();
        setupDesktopMap();

        // Joining from the home card or the party modal.
        document.getElementById('home-join-input').addEventListener('keydown', e => { if (e.key === 'Enter') joinFromHome(); });
        document.getElementById('join-code-input').addEventListener('keydown', e => { if (e.key === 'Enter') joinMultiplayerLobby(); });

        if (room) {
            document.getElementById('join-code-input').value = room;
            joinMultiplayerLobby();
        } else {
            maybeShowCoach();
        }

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeCoach();
        });
    }

    // Inline handlers live in the markup and the e2e suite drives the game through
    // the console, so the module exposes its public API. `currentMode` is an
    // accessor so test assignments reach the module's own binding.
    Object.assign(globalThis, {
        gameState,
        ALL_LOCATIONS, WORLD_LOCATIONS, CAMBODIA_LOCATIONS, ASIA_LOCATIONS, LOCATIONS_DB, MODE_CONFIG,
        getNextUniqueLocation, getSeenHistory, recordSeenLocation, getLobbyPlayers, isRealMultiplayer,
        openTutorialModal, toggleMute, openProfileModal, closeModal, randomizeCharacter,
        switchStudioTab, setStudioOption, saveProfile, undoStudio, resetStudio,
        editingAvatarFrame: () => editingAvatar?.avatarConfig.frame,
        renderModeCards, handleModeCardClick, startModeGame, startQuickPlay, startSinglePlayerGame,
        start4PlayerSimulation, openMultiplayerModal, createMultiplayerLobby, joinMultiplayerLobby,
        selectPartyMode, leaveLobby, copyInviteLink, shareTelegram, sendLobbyEmote, startMultiplayerGame,
        skipBrokenLocation, returnToStartPano, toggleMapExpand, selectChoiceOption, submitPlayerGuess, advanceNextRound,
        resetToHome, backToHome, joinFromHome, nextCoachStep, closeCoach, setRegion, setLanguage, showFinalPodium,
        shareInviteLink, openRanked, closeRanked, setRankedRegion, setBoardTab, setBoardMode, startRankedRun, copyBackupCode, restoreBackupCode, copyInviteLink,
        setSheet, cycleSheet, pickTeamMember, myRoleNow,
        setStandingsTab, setRoyaleSettings, royaleSettingsLives: () => royaleSettingsSync?.lives, setSpectatorAnswer, setSpectTab, setFollow, followStep, toggleMapPinned, toggleTicketPanel, toggleDock, dockZoom, toggleEmoteMenu
    });

    Object.defineProperties(globalThis, {
        currentMode: {
            configurable: true,
            get: () => currentMode,
            set: value => { currentMode = value; }
        },
        currentRegion: {
            configurable: true,
            get: () => currentRegion,
            set: value => { currentRegion = value; }
        },
        roomReady: { configurable: true, get: () => roomReady },
        myPlayerId: { configurable: true, get: () => myPlayerId },
        serverClockOffset: { configurable: true, get: () => serverClockOffset },
        serverMatch: { configurable: true, get: () => serverMatch },
        serverTeams: { configurable: true, get: () => serverTeams },
        roomSocket: { configurable: true, get: () => roomSocket }
    });

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }