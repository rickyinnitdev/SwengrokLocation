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
