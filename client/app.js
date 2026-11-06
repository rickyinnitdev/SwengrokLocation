    import { MODE_CONFIG, REGION_CONFIG } from './data/modes.js';
    import { LOCATIONS_DB } from './data/locations.js';
    import { t, getLang, setLang, applyI18n, onLangChange } from './i18n.js';

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
    const WORLD_CENTER = [20, 0];
    const ASIA_CENTER = [13, 105];

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

    // Character Studio Config Options
    const STUDIO_OPTIONS = {
        hair: [
            { id: 'fluffy', label: 'Fluffy Curls' },
            { id: 'spiky', label: 'Spiky Anime' },
            { id: 'beanie', label: 'Cozy Beanie' },
            { id: 'cap', label: 'Street Cap' }
        ],
        hairColor: [
            { id: '#261b2b', label: 'Obsidian', color: '#261b2b' },
            { id: '#4a2810', label: 'Chestnut', color: '#4a2810' },
            { id: '#d97706', label: 'Caramel', color: '#d97706' },
            { id: '#0284c7', label: 'Electric Blue', color: '#0284c7' },
            { id: '#db2777', label: 'Sakura Pink', color: '#db2777' },
            { id: '#f1f5f9', label: 'Frost White', color: '#f1f5f9' }
        ],
        jacket: [
            { id: 'cardigan', label: 'Cardigan' },
            { id: 'hoodie', label: 'Hoodie' },
            { id: 'bomber', label: 'Bomber' }
        ],
        jacketColor: [
            { id: '#38bdf8', label: 'Sky Marine', color: '#38bdf8' },
            { id: '#f59e0b', label: 'Gold Amber', color: '#f59e0b' },
            { id: '#10b981', label: 'Emerald', color: '#10b981' },
            { id: '#f43f5e', label: 'Rose Pop', color: '#f43f5e' },
            { id: '#8b5cf6', label: 'Royal Violet', color: '#8b5cf6' },
            { id: '#1e293b', label: 'Charcoal', color: '#1e293b' }
        ],
        squiggles: [
            { id: 'electric', label: '⚡ Sparks' },
            { id: 'question', label: '❓ Lost' },
            { id: 'sparkles', label: '✨ Stars' },
            { id: 'sweat', label: '💧 Sweat' },
            { id: 'none', label: 'Clean' }
        ],
        eye: [
            { id: 'chill', label: 'Unbothered' },
            { id: 'happy', label: 'Joyful' },
            { id: 'curious', label: 'Curious' },
            { id: 'smug', label: 'Smug Wink' },
            { id: 'shades', label: 'Sunglasses' }
        ]
    };

    let activeStudioTab = 'hair';
    let editingAvatar = null;

    function openProfileModal() {
        if (isRealMultiplayer() && serverMatch) { showToast(t('toast.customizeBetween')); return; }
        document.getElementById('profile-name-input').value = userProfile.name;
        document.getElementById('profile-title-select').value = userProfile.title;

        editingAvatar = {
            avatarType: userProfile.avatarType || 'custom',
            avatarConfig: { ...(userProfile.avatarConfig || AVATAR_DEFAULTS) }
        };

        switchStudioTab('hair');
        updateStudioPreview();
        document.getElementById('profile-modal').classList.add('active');
    }

    function switchStudioTab(tab) {
        activeStudioTab = tab;
        document.querySelectorAll('.studio-tab-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('onclick').includes(`'${tab}'`));
        });

        const container = document.getElementById('studio-picker-container');
        if (!container) return;

        const options = STUDIO_OPTIONS[tab] || [];
        if (tab === 'hairColor' || tab === 'jacketColor') {
            container.style.display = 'flex';
            container.style.flexWrap = 'wrap';
            container.style.gap = '12px';
            const curVal = tab === 'hairColor' ? editingAvatar.avatarConfig.hairColor : editingAvatar.avatarConfig.jacketColor;
            container.innerHTML = options.map(opt => `
                <div class="color-swatch-opt ${curVal === opt.id ? 'selected' : ''}" style="background: ${opt.color};" onclick="setStudioOption('${tab}', '${opt.id}')" title="${opt.label}"></div>
            `).join('');
        } else {
            container.style.display = 'grid';
            let curVal = '';
            if (tab === 'hair') curVal = editingAvatar.avatarConfig.hairStyle;
            else if (tab === 'jacket') curVal = editingAvatar.avatarConfig.jacketStyle;
            else if (tab === 'squiggles') curVal = editingAvatar.avatarConfig.squiggles;
            else if (tab === 'eye') curVal = editingAvatar.avatarConfig.eyeStyle;

            container.innerHTML = options.map(opt => `
                <div class="studio-opt-btn ${curVal === opt.id ? 'selected' : ''}" onclick="setStudioOption('${tab}', '${opt.id}')">
                    <span>${opt.label}</span>
                </div>
            `).join('');
        }
    }

    function setStudioOption(tab, val) {
        if (!editingAvatar) return;
        if (tab === 'hair') editingAvatar.avatarConfig.hairStyle = val;
        else if (tab === 'hairColor') editingAvatar.avatarConfig.hairColor = val;
        else if (tab === 'jacket') editingAvatar.avatarConfig.jacketStyle = val;
        else if (tab === 'jacketColor') editingAvatar.avatarConfig.jacketColor = val;
        else if (tab === 'squiggles') editingAvatar.avatarConfig.squiggles = val;
        else if (tab === 'eye') editingAvatar.avatarConfig.eyeStyle = val;

        playBeep(580, 'sine', 0.05);
        updateStudioPreview();
        switchStudioTab(tab);
    }

    function randomizeCharacter() {
        if (!editingAvatar) return;
        const rand = (arr) => arr[Math.floor(Math.random() * arr.length)].id;
        editingAvatar.avatarConfig.hairStyle = rand(STUDIO_OPTIONS.hair);
        editingAvatar.avatarConfig.hairColor = rand(STUDIO_OPTIONS.hairColor);
        editingAvatar.avatarConfig.jacketStyle = rand(STUDIO_OPTIONS.jacket);
        editingAvatar.avatarConfig.jacketColor = rand(STUDIO_OPTIONS.jacketColor);
        editingAvatar.avatarConfig.squiggles = rand(STUDIO_OPTIONS.squiggles);
        editingAvatar.avatarConfig.eyeStyle = rand(STUDIO_OPTIONS.eye);

        playBeep(720, 'triangle', 0.08);
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
        updateProfileUI();
        renderModeCards();
        updateHomeChrome();
        renderLobbyPlayers();
        renderCoach();
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
        const all = regionModes();
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
        if (gameState.guessMap) {
            gameState.guessMap.invalidateSize();
            return;
        }

        const cfg = MODE_CONFIG[currentMode] || {};
        const isWorld = !!cfg.isWorld || !!cfg.isCountry;
        const isAsia = !!cfg.isAsia;
        const isCam = !!cfg.isCambodia;
        const center = isWorld ? WORLD_CENTER : isAsia ? ASIA_CENTER : isCam ? [12.5, 104.9] : PP_CENTER;
        const zoom = isWorld ? 2 : isAsia ? 4 : isCam ? 7 : 12;

        gameState.guessMap = L.map('guess-map', {
            center: center,
            zoom: zoom,
            minZoom: 1,
            maxZoom: 18,
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(gameState.guessMap);

        gameState.guessMap.on('click', (e) => {
            placePin(e.latlng);
        });

        const wrapper = document.getElementById('map-wrapper');
        new ResizeObserver(() => {
            if (gameState.guessMap) gameState.guessMap.invalidateSize();
        }).observe(wrapper);
    }

    function placePin(latlng) {
        if (gameState.guessMarker) {
            gameState.guessMarker.setLatLng(latlng);
        } else {
            const icon = L.divIcon({ className: 'marker-pin-guess', iconSize: [18, 18] });
            gameState.guessMarker = L.marker(latlng, { icon, draggable: true }).addTo(gameState.guessMap);
            gameState.guessMarker.on('dragend', (e) => {
                gameState.guessLatLng = e.target.getLatLng();
            });
        }
        gameState.guessLatLng = latlng;
        playBeep(640, 'sine', 0.08);

        const btn = document.getElementById('guess-btn');
        btn.innerHTML = `<span>🎯 ${t('game.confirm')}</span>`;
        btn.classList.add('ready');
        btn.disabled = false;

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

    function setupResizer() {
        const bar = document.getElementById('map-resizer');
        if (!bar) return;
        bar.addEventListener('pointerdown', e => {
            e.preventDefault();
            try { bar.setPointerCapture(e.pointerId); } catch (err) {}
            const move = ev => {
                const pct = Math.min(58, Math.max(22, ((window.innerWidth - ev.clientX) / window.innerWidth) * 100));
                document.documentElement.style.setProperty('--map-width', pct.toFixed(2) + '%');
                if (gameState.guessMap) gameState.guessMap.invalidateSize();
                if (gameState.resultMap) gameState.resultMap.invalidateSize();
            };
            const up = () => {
                bar.removeEventListener('pointermove', move);
                bar.removeEventListener('pointerup', up);
                bar.removeEventListener('pointercancel', up);
            };
            bar.addEventListener('pointermove', move);
            bar.addEventListener('pointerup', up);
            bar.addEventListener('pointercancel', up);
        });
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
                    <button type="button" class="choice-opt-btn" onclick="selectChoiceOption('country', '${escapeHTML(country)}')">
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
                <button type="button" class="choice-opt-btn" onclick="selectChoiceOption('district', '${escapeHTML(khan.id)}')">
                    <span style="font-size: 1.05rem;">${khan.icon}</span>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(khan.id)}</span>
                </button>
            `).join('');
        }
    }

    function selectChoiceOption(type, value) {
        document.querySelectorAll('.choice-opt-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.textContent.includes(value));
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
        gameState.roundStartTime = isRealMultiplayer() && serverMatch ? serverMatch.startedAt - serverClockOffset : Date.now();

        const timerCard = document.getElementById('hud-timer-card');
        const timerVal = document.getElementById('hud-timer-num');
        const circle = document.getElementById('timer-svg-circle');
        const totalOffset = 75.4; // 2 * PI * 12

        timerCard.classList.remove('danger');
        timerVal.textContent = remaining;
        circle.style.strokeDashoffset = 0;
        circle.style.stroke = 'var(--rice)';

        gameState.timerInterval = setInterval(() => {
            remaining = Math.max(0, Math.ceil(isRealMultiplayer() && serverMatch ? (serverMatch.deadline - (Date.now() + serverClockOffset)) / 1000 : seconds - (Date.now() - gameState.roundStartTime) / 1000));
            timerVal.textContent = remaining;

            const progress = remaining / seconds;
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
