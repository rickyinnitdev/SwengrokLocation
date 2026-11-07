// ============================================================
//  WANDERPENH HAND-DRAWN DOODLE AVATAR GENERATOR
//  Vector SVG generator for customizable explorer avatars
// ============================================================

const AVATAR_DEFAULTS = {
    mode: 'custom',
    hairStyle: 'fluffy',
    hairColor: '#231c26',
    eyeStyle: 'chill',
    mouthStyle: 'neutral',
    jacketStyle: 'cardigan',
    jacketColor: '#38bdf8',
    shirtColor: '#ffffff',
    bg: '#fed049',
    squiggles: 'electric',
    earrings: 'hoops',
    skinColor: '#fee0d2',
    blush: true,
    headwear: 'none',
    eyebrows: 'auto',
    facialHair: 'none',
    accessory: 'none',
    bgStyle: 'solid',
    frame: 'plain'
};

// Allowed values for every option. Configs can arrive from other players over
// the network, so anything not listed here falls back to the default rather
// than being written into the SVG markup.
const AVATAR_ALLOWED = {
    mode: ['custom'],
    hairStyle: ['fluffy', 'spiky', 'beanie', 'cap', 'longStraight', 'ponytail', 'bun', 'buzz', 'afro', 'sidePart', 'braids', 'bald', 'krama'],
    headwear: ['none', 'helmet', 'bucket', 'straw', 'flower', 'headphones', 'crown', 'helmetTuk', 'crownGold'],
    eyeStyle: ['chill', 'shades', 'curious', 'happy', 'smug', 'sleepy', 'stars', 'wink', 'glasses', 'angry'],
    eyebrows: ['auto', 'normal', 'thick', 'raised', 'angry', 'worried'],
    mouthStyle: ['neutral', 'smirk', 'smile', 'open', 'tongue', 'grin', 'surprised', 'cat'],
    facialHair: ['none', 'stubble', 'moustache', 'goatee'],
    jacketStyle: ['cardigan', 'hoodie', 'bomber', 'tshirt', 'uniform', 'kramaScarf', 'jersey', 'polo', 'sampot'],
    accessory: ['none', 'kramaNeck', 'strap', 'camera', 'coffee', 'phone'],
    squiggles: ['electric', 'question', 'sparkles', 'sweat', 'none', 'hearts', 'notes', 'steam', 'zzz'],
    earrings: ['hoops', 'none', 'studs', 'dangles'],
    bgStyle: ['solid', 'kramaChecks', 'lotus', 'angkor', 'skyline', 'nightMarket'],
    frame: ['plain', 'goldTicket', 'lotusRing', 'rankTuk', 'rankLegend', 'royale']
};
// Every option has a stable order so the editor and tests can walk them.
const AVATAR_COLOR_KEYS = ['hairColor', 'jacketColor', 'shirtColor', 'bg', 'skinColor'];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeAvatarConfig(config) {
    const src = (config && typeof config === 'object') ? config : {};
    const c = { ...AVATAR_DEFAULTS };
    Object.keys(AVATAR_ALLOWED).forEach(k => {
        if (AVATAR_ALLOWED[k].includes(src[k])) c[k] = src[k];
    });
    AVATAR_COLOR_KEYS.forEach(k => {
        if (typeof src[k] === 'string' && HEX_COLOR_RE.test(src[k])) c[k] = src[k];
    });
    if (typeof src.blush === 'boolean') c.blush = src.blush;
    return c;
}

const AVATAR_CACHE = new Map();
function generateAvatarSVG(config = {}) {
    const c = sanitizeAvatarConfig(config);
    // In-game strips draw many avatars per frame, so the SVG string is cached per config.
    const cacheKey = JSON.stringify(c);
    const hit = AVATAR_CACHE.get(cacheKey);
    if (hit) return hit;
    const out = buildAvatarSVG(c);
    if (AVATAR_CACHE.size > 300) AVATAR_CACHE.clear();
    AVATAR_CACHE.set(cacheKey, out);
    return out;
}

function buildAvatarSVG(c) {

    // Hand-drawn comic ink styling
    const ink = '#261b2b';
    const strokeProps = `stroke="${ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
    const thinStroke = `stroke="${ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"`;

    // 1. Squiggles / Mood Aura (Corners)
    let squigglesSVG = '';
    if (c.squiggles === 'electric') {
        squigglesSVG = `
            <path d="M 40 50 Q 25 65 40 75 Q 26 88 42 105" fill="none" ${strokeProps} />
            <path d="M 260 45 Q 280 58 265 72 Q 282 85 266 100" fill="none" ${strokeProps} />
            <path d="M 60 240 Q 75 250 64 262 Q 78 274 66 285" fill="none" ${strokeProps} />
            <path d="M 245 230 Q 262 240 252 252 Q 265 262 254 274" fill="none" ${strokeProps} />
        `;
    } else if (c.squiggles === 'question') {
        squigglesSVG = `
            <text x="35" y="85" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="34" fill="${ink}">?</text>
            <text x="250" y="75" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="38" fill="${ink}">?</text>
            <text x="252" y="240" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="30" fill="${ink}">?</text>
        `;
    } else if (c.squiggles === 'sparkles') {
        squigglesSVG = `
            <path d="M 45 75 Q 45 85 35 85 Q 45 85 45 95 Q 45 85 55 85 Q 45 85 45 75 Z" fill="${ink}" />
            <path d="M 255 70 Q 255 82 243 82 Q 255 82 255 94 Q 255 82 267 82 Q 255 82 255 70 Z" fill="${ink}" />
            <path d="M 248 230 Q 248 238 240 238 Q 248 238 248 246 Q 248 238 256 238 Q 248 238 248 230 Z" fill="${ink}" />
        `;
    } else if (c.squiggles === 'sweat') {
        squigglesSVG = `
            <path d="M 240 85 C 240 75, 250 60, 250 60 C 250 60, 260 75, 260 85 C 260 92, 250 95, 240 85 Z" fill="#38bdf8" ${thinStroke} />
        `;
    }

    if (!squigglesSVG) squigglesSVG = extraSquiggles(c, ink, thinStroke);

    // 2. Back Hair Volume (Drawn behind head)
    let hairBackSVG = '';
    if (c.hairStyle === 'fluffy') {
        hairBackSVG = `
            <path d="M 65 170
                     C 25 150, 15 95, 45 60
                     C 60 30, 95 20, 125 28
                     C 150 10, 185 8, 220 28
                     C 260 45, 280 90, 265 135
                     C 280 170, 255 210, 225 195
                     L 65 170 Z" fill="${c.hairColor}" ${strokeProps} />
            <!-- Sketch hatching highlights on hair -->
            <path d="M 55 75 Q 75 70 70 90 M 95 45 Q 115 35 110 60 M 165 30 Q 185 20 180 45 M 225 50 Q 245 45 235 70" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.35" stroke-linecap="round" />
        `;
    } else if (c.hairStyle === 'spiky') {
        hairBackSVG = `
            <path d="M 55 170 L 30 120 L 50 100 L 35 60 L 70 55 L 85 25 L 120 35 L 150 10 L 175 30 L 210 20 L 225 50 L 255 55 L 245 95 L 270 120 L 245 170 Z" fill="${c.hairColor}" ${strokeProps} />
        `;
    } else if (c.hairStyle === 'beanie') {
        hairBackSVG = `
            <path d="M 55 140 C 45 50, 90 15, 150 15 C 210 15, 255 50, 245 140 Z" fill="#e11d48" ${strokeProps} />
            <path d="M 45 130 Q 150 120 255 130 L 255 150 Q 150 140 45 150 Z" fill="#be123c" ${strokeProps} />
        `;
    } else if (c.hairStyle === 'cap') {
        hairBackSVG = `
            <path d="M 50 120 C 50 50, 250 50, 250 120 Z" fill="#1e293b" ${strokeProps} />
            <path d="M 40 120 Q 150 105 260 120" fill="none" ${strokeProps} />
            <path d="M 35 125 Q 10 135 25 150 Q 55 145 65 125" fill="#0f172a" ${strokeProps} />
        `;
    }

    if (!hairBackSVG) hairBackSVG = extraHairBack(c, strokeProps, ink);

    // 3. Clothes & Torso
    let clothesSVG = '';
    if (c.jacketStyle === 'cardigan') {
        clothesSVG = `
            <!-- Neck -->
            <path d="M 132 195 L 132 235 Q 150 242 168 235 L 168 195" fill="${c.skinColor}" ${strokeProps} />

            <!-- White T-shirt -->
            <path d="M 112 235 Q 150 248 188 235 L 195 310 L 105 310 Z" fill="${c.shirtColor}" ${strokeProps} />
            <!-- Little cat/bear badge -->
            <circle cx="172" cy="272" r="7" fill="none" ${thinStroke} />
            <circle cx="169" cy="270" r="1.5" fill="${ink}" />
            <circle cx="175" cy="270" r="1.5" fill="${ink}" />
            <path d="M 166 266 L 168 262 L 170 266 M 174 266 L 176 262 L 178 266" ${thinStroke} />

            <!-- Cardigan open lapels -->
            <path d="M 45 310 Q 75 220 112 232 L 122 310 Z" fill="${c.jacketColor}" ${strokeProps} />
            <path d="M 255 310 Q 225 220 188 232 L 178 310 Z" fill="${c.jacketColor}" ${strokeProps} />
            <path d="M 45 310 C 60 225, 95 218, 112 232" fill="none" ${strokeProps} />
            <path d="M 255 310 C 240 225, 205 218, 188 232" fill="none" ${strokeProps} />
        `;
    } else if (c.jacketStyle === 'hoodie') {
        clothesSVG = `
            <path d="M 132 195 L 132 230 L 168 230 L 168 195" fill="${c.skinColor}" ${strokeProps} />
            <path d="M 42 310 C 65 215, 235 215, 258 310 Z" fill="${c.jacketColor}" ${strokeProps} />
            <path d="M 100 225 Q 150 265 200 225" fill="none" ${strokeProps} />
            <line x1="140" y1="245" x2="140" y2="285" ${strokeProps} />
            <line x1="160" y1="245" x2="160" y2="280" ${strokeProps} />
        `;
    } else if (c.jacketStyle === 'bomber') {
        clothesSVG = `
            <path d="M 132 195 L 132 235 L 168 235 L 168 195" fill="${c.skinColor}" ${strokeProps} />
            <path d="M 115 235 L 185 235 L 185 310 L 115 310 Z" fill="${c.shirtColor}" ${strokeProps} />
            <path d="M 45 310 C 65 215, 115 225, 125 310 Z" fill="${c.jacketColor}" ${strokeProps} />
            <path d="M 255 310 C 235 215, 185 225, 175 310 Z" fill="${c.jacketColor}" ${strokeProps} />
            <line x1="150" y1="235" x2="150" y2="310" stroke="#facc15" stroke-width="4" stroke-dasharray="4,4" />
        `;
    }

    if (!clothesSVG) clothesSVG = extraTop(c, strokeProps, thinStroke, ink);

    // 4. Face & Ears
    const earsSVG = `
        <path d="M 76 178 C 62 178, 58 208, 80 214" fill="${c.skinColor}" ${strokeProps} />
        <path d="M 224 172 C 238 172, 242 202, 220 208" fill="${c.skinColor}" ${strokeProps} />
        ${c.earrings === 'studs' ? `
            <circle cx="79" cy="206" r="4" fill="#facc15" stroke="${ink}" stroke-width="2.5" />
            <circle cx="226" cy="200" r="4" fill="#facc15" stroke="${ink}" stroke-width="2.5" />
        ` : ''}
        ${c.earrings === 'dangles' ? `
            <path d="M 80 210 L 80 232" stroke="${ink}" stroke-width="3" /><circle cx="80" cy="236" r="6" fill="#e4578a" stroke="${ink}" stroke-width="3" />
            <path d="M 225 204 L 225 226" stroke="${ink}" stroke-width="3" /><circle cx="225" cy="230" r="6" fill="#e4578a" stroke="${ink}" stroke-width="3" />
        ` : ''}
        ${c.earrings === 'hoops' ? `
            <circle cx="80" cy="204" r="6" fill="none" stroke="${ink}" stroke-width="4.5" />
            <circle cx="225" cy="198" r="6" fill="none" stroke="${ink}" stroke-width="4.5" />
        ` : ''}
    `;

    const faceBaseSVG = `
        <path d="M 78 142
                 C 74 195, 95 222, 150 222
                 C 205 222, 226 195, 222 142
                 C 222 110, 78 110, 78 142 Z"
                 fill="${c.skinColor}" ${strokeProps} />
        <!-- Chin dot detail from photo -->
        <circle cx="150" cy="214" r="2" fill="${ink}" />
    `;

    // 5. Eyes (Big, droopy, hand-drawn look)
    let eyesSVG = '';
    if (c.eyeStyle === 'chill') {
        eyesSVG = `
            <!-- Eyebrows -->
            <path d="M 100 120 L 114 116" ${strokeProps} />
            <path d="M 172 114 L 186 117" ${strokeProps} />

            <!-- Left Chill Eye -->
            <ellipse cx="107" cy="150" rx="22" ry="16" fill="#ffffff" ${strokeProps} />
            <!-- Heavy Droopy Upper Lid -->
            <path d="M 85 142 Q 107 132 129 143" fill="${c.skinColor}" ${strokeProps} />
            <!-- Round dark pupil tucked under upper lid -->
            <ellipse cx="108" cy="144" rx="12" ry="9" fill="${ink}" />
            <!-- Under eye sketch marks -->
            <path d="M 92 168 Q 107 172 122 168" ${thinStroke} />

            <!-- Right Chill Eye -->
            <ellipse cx="182" cy="144" rx="24" ry="17" fill="#ffffff" ${strokeProps} />
            <!-- Heavy Droopy Upper Lid -->
            <path d="M 158 136 Q 182 126 206 137" fill="${c.skinColor}" ${strokeProps} />
            <!-- Round dark pupil -->
            <ellipse cx="183" cy="138" rx="13" ry="10" fill="${ink}" />
            <!-- Under eye sketch marks -->
            <path d="M 168 163 Q 183 167 198 162" ${thinStroke} />
        `;
    } else if (c.eyeStyle === 'shades') {
        eyesSVG = `
            <rect x="80" y="128" width="54" height="34" rx="8" fill="#18181b" ${strokeProps} />
            <rect x="156" y="124" width="56" height="34" rx="8" fill="#18181b" ${strokeProps} />
            <path d="M 134 140 L 156 138" ${strokeProps} />
            <line x1="90" y1="134" x2="102" y2="154" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.65" />
            <line x1="166" y1="130" x2="178" y2="150" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.65" />
        `;
    } else if (c.eyeStyle === 'curious') {
        eyesSVG = `
            <ellipse cx="108" cy="146" rx="19" ry="20" fill="#ffffff" ${strokeProps} />
            <circle cx="108" cy="146" r="11" fill="${ink}" />
            <circle cx="104" cy="142" r="4" fill="#ffffff" />
            <ellipse cx="182" cy="140" rx="19" ry="20" fill="#ffffff" ${strokeProps} />
            <circle cx="182" cy="140" r="11" fill="${ink}" />
            <circle cx="178" cy="136" r="4" fill="#ffffff" />
        `;
    } else if (c.eyeStyle === 'happy') {
        eyesSVG = `
            <path d="M 88 148 Q 107 134 126 148" fill="none" ${strokeProps} />
            <path d="M 164 142 Q 183 128 202 142" fill="none" ${strokeProps} />
        `;
    } else if (c.eyeStyle === 'smug') {
        eyesSVG = `
            <path d="M 88 148 Q 107 136 126 148" fill="none" ${strokeProps} />
            <ellipse cx="182" cy="142" rx="20" ry="14" fill="#ffffff" ${strokeProps} />
            <circle cx="184" cy="140" r="8" fill="${ink}" />
            <path d="M 160 134 Q 182 126 204 134" fill="${c.skinColor}" ${strokeProps} />
        `;
    }

    if (!eyesSVG) eyesSVG = extraEyes(c, strokeProps, thinStroke, ink);

    // 6. Mouth
    let mouthSVG = '';
    if (c.mouthStyle === 'neutral') {
        mouthSVG = `<path d="M 134 182 Q 148 174 162 181" fill="none" ${strokeProps} />`;
    } else if (c.mouthStyle === 'smirk') {
        mouthSVG = `<path d="M 134 178 Q 150 188 166 176" fill="none" ${strokeProps} />`;
    } else if (c.mouthStyle === 'smile') {
        mouthSVG = `<path d="M 132 176 Q 148 192 164 176" fill="#fda4af" ${strokeProps} />`;
    } else if (c.mouthStyle === 'open') {
        mouthSVG = `<ellipse cx="148" cy="180" rx="8" ry="10" fill="${ink}" />`;
    }

    if (!mouthSVG) mouthSVG = extraMouth(c, strokeProps, ink);

    // 7. Front Bangs / Forehead Fringe (Curling naturally ABOVE eyes)
    let hairFrontSVG = '';
    if (c.hairStyle === 'fluffy') {
        hairFrontSVG = `
            <!-- Top head messy fringe (stays comfortably above y=125) -->
            <path d="M 68 110
                     Q 85 124 105 106
                     Q 125 126 145 102
                     Q 165 125 188 104
                     Q 208 124 230 102
                     Q 245 118 252 95
                     L 245 40 Q 150 20 68 40 Z" fill="${c.hairColor}" ${strokeProps} />
            <!-- Little playful dangling curls on sides -->
            <path d="M 68 105 Q 60 135 72 150" fill="${c.hairColor}" ${strokeProps} />
            <path d="M 235 100 Q 242 130 230 148" fill="${c.hairColor}" ${strokeProps} />
            <path d="M 138 95 Q 146 116 154 95" fill="${c.hairColor}" ${strokeProps} />
        `;
    } else if (c.hairStyle === 'spiky') {
        hairFrontSVG = `
            <path d="M 75 105 L 105 85 L 135 105 L 165 80 L 195 102 L 225 80 L 235 105 Z" fill="${c.hairColor}" ${strokeProps} />
        `;
    }

    if (!hairFrontSVG) hairFrontSVG = extraHairFront(c, strokeProps, ink);

    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="100%" height="100%" aria-hidden="true" style="border-radius: 50%; overflow: hidden; background: ${c.bg};">
        <rect width="300" height="300" fill="${c.bg}" />
        ${bgPattern(c, ink)}
        ${squigglesSVG}
        ${hairBackSVG}
        ${clothesSVG}
        ${accessorySVG(c, strokeProps, thinStroke, ink)}
        ${earsSVG}
        ${faceBaseSVG}
        ${c.blush ? `
            <ellipse cx="94" cy="174" rx="10" ry="5" fill="#fca5a5" opacity="0.8" />
            <ellipse cx="196" cy="168" rx="10" ry="5" fill="#fca5a5" opacity="0.8" />
        ` : ''}
        ${eyesSVG}
        ${eyebrowSVG(c, strokeProps)}
        ${mouthSVG}
        ${facialHairSVG(c, strokeProps, ink)}
        ${hairFrontSVG}
        ${headwearSVG(c, strokeProps, ink)}
        ${frameSVG(c, ink)}
    </svg>`;
}

// ------------------------------------------------------------
//  Extra slots (Part D). Same doodle style: thick ink outline, flat fills.
//  Every function returns an SVG fragment string and reads only sanitized config values.
// ------------------------------------------------------------
const KRAMA_RED = '#c62828';
function kramaChecks(x, y, w, h, cell = 12) {
    // A checkered krama cloth: red ground with white checks, drawn as plain rects (no <pattern>, so it
    // renders the same wherever the SVG is inlined).
    let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${KRAMA_RED}" />`;
    for (let i = 0; i * cell < w; i++) for (let j = 0; j * cell < h; j++) {
        if ((i + j) % 2 === 0) out += `<rect x="${x + i * cell}" y="${y + j * cell}" width="${Math.min(cell, w - i * cell)}" height="${Math.min(cell, h - j * cell)}" fill="#ffffff" opacity="0.85" />`;
    }
    return out;
}

function extraSquiggles(c, ink, thin) {
    if (c.squiggles === 'hearts') return `
        <path d="M 52 90 C 40 72, 66 66, 52 82 C 38 66, 66 72, 52 90 Z" fill="#e4578a" ${thin} />
        <path d="M 252 78 C 240 60, 266 54, 252 70 C 238 54, 266 60, 252 78 Z" fill="#e4578a" ${thin} />
        <path d="M 248 246 C 238 232, 258 228, 248 240 C 238 228, 258 232, 248 246 Z" fill="#e4578a" ${thin} />`;
    if (c.squiggles === 'notes') return `
        <path d="M 48 100 L 48 66 L 66 62 L 66 94" fill="none" ${thin} /><ellipse cx="42" cy="102" rx="8" ry="6" fill="${ink}" /><ellipse cx="60" cy="96" rx="8" ry="6" fill="${ink}" />
        <path d="M 256 90 L 256 60" fill="none" ${thin} /><ellipse cx="249" cy="92" rx="8" ry="6" fill="${ink}" /><path d="M 256 60 Q 270 66 266 78" fill="none" ${thin} />`;
    if (c.squiggles === 'steam') return `
        <path d="M 44 120 Q 34 104 44 90 Q 54 76 44 62" fill="none" ${thin} />
        <path d="M 66 124 Q 56 108 66 94 Q 76 80 66 66" fill="none" ${thin} />
        <path d="M 252 118 Q 242 102 252 88 Q 262 74 252 60" fill="none" ${thin} />`;
    if (c.squiggles === 'zzz') return `
        <text x="226" y="86" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="30" fill="${ink}">Z</text>
        <text x="250" y="64" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="22" fill="${ink}">z</text>
        <text x="266" y="46" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="16" fill="${ink}">z</text>`;
    return '';
}

function extraHairBack(c, sp, ink) {
    const h = c.hairColor;
    const cap = `<path d="M 66 160 C 50 60, 100 22, 150 22 C 200 22, 252 60, 234 160 Z" fill="${h}" ${sp} />`;
    switch (c.hairStyle) {
        case 'longStraight': return `<path d="M 62 170 C 22 100, 60 24, 150 22 C 240 24, 278 100, 238 170 L 256 288 L 44 288 Z" fill="${h}" ${sp} />`;
        case 'ponytail': return `${cap}<path d="M 232 100 C 290 90, 296 170, 262 230 C 262 190, 250 170, 226 150 Z" fill="${h}" ${sp} /><path d="M 230 104 L 242 118" ${sp} />`;
        case 'bun': return `${cap}<circle cx="150" cy="24" r="30" fill="${h}" ${sp} /><path d="M 130 30 Q 150 18 170 30" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.4" />`;
        case 'buzz': return '';
        case 'afro': return `<circle cx="150" cy="112" r="108" fill="${h}" ${sp} /><path d="M 70 70 Q 90 60 96 80 M 200 50 Q 222 52 220 74 M 150 20 Q 170 18 176 36" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3" stroke-linecap="round" />`;
        case 'sidePart': return cap;
        case 'braids': return `${cap}<path d="M 66 150 L 52 176 L 70 196 L 54 222 L 72 244 L 60 268" fill="none" stroke="${h}" stroke-width="16" stroke-linecap="round" /><path d="M 66 150 L 52 176 L 70 196 L 54 222 L 72 244 L 60 268" fill="none" ${sp} opacity="0.0" /><path d="M 234 150 L 248 176 L 230 196 L 246 222 L 228 244 L 240 268" fill="none" stroke="${h}" stroke-width="16" stroke-linecap="round" />`;
        case 'bald': return '';
        case 'krama': return `<path d="M 62 150 C 56 60, 100 24, 150 24 C 200 24, 244 60, 238 150 Z" fill="${KRAMA_RED}" ${sp} />`;
        default: return '';
    }
}
function extraHairFront(c, sp, ink) {
    const h = c.hairColor;
    switch (c.hairStyle) {
        case 'longStraight': return `<path d="M 74 130 Q 90 92 150 88 Q 210 92 226 130 Q 190 112 150 108 Q 110 112 74 130 Z" fill="${h}" ${sp} />`;
        case 'ponytail': case 'bun': return `<path d="M 76 128 Q 100 96 150 92 Q 200 96 224 128 Q 190 110 150 108 Q 110 110 76 128 Z" fill="${h}" ${sp} />`;
        case 'buzz': return `<path d="M 80 130 Q 84 82 150 80 Q 216 82 220 130 Q 190 100 150 98 Q 110 100 80 130 Z" fill="${h}" opacity="0.8" stroke="${ink}" stroke-width="3" stroke-linejoin="round" />`;
        case 'sidePart': return `<path d="M 74 132 Q 84 84 150 80 Q 212 82 226 130 Q 200 100 120 100 Q 96 104 74 132 Z" fill="${h}" ${sp} /><path d="M 120 100 Q 140 88 160 84" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.4" />`;
        case 'braids': return `<path d="M 76 128 Q 100 94 150 90 Q 200 94 224 128 Q 190 112 150 108 Q 110 112 76 128 Z" fill="${h}" ${sp} />`;
        case 'krama': return `<g>${kramaChecks(70, 88, 160, 34, 12)}<path d="M 70 88 L 230 88 L 230 122 L 70 122 Z" fill="none" ${sp} /></g><path d="M 226 100 Q 262 112 252 150 Q 238 130 222 120 Z" fill="${KRAMA_RED}" ${sp} />`;
        default: return '';
    }
}

function headwearSVG(c, sp, ink) {
    switch (c.headwear) {
        case 'helmet': case 'helmetTuk': return `
            <path d="M 66 138 C 60 52, 110 30, 150 30 C 200 30, 244 56, 236 138 Z" fill="#e11d48" ${sp} />
            <path d="M 64 132 L 236 132 L 240 148 L 62 148 Z" fill="#1e293b" ${sp} />
            <path d="M 100 70 Q 120 50 150 48" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.5" />
            ${c.headwear === 'helmetTuk' ? '<rect x="124" y="74" width="52" height="30" rx="6" fill="#fde68a" stroke="' + ink + '" stroke-width="3.5" /><text x="150" y="96" text-anchor="middle" font-size="22">🛺</text>' : ''}`;
        case 'bucket': return `
            <path d="M 70 118 C 74 62, 226 62, 230 118 Z" fill="#7dd3fc" ${sp} />
            <ellipse cx="150" cy="122" rx="104" ry="18" fill="#38bdf8" ${sp} />
            <path d="M 90 100 Q 150 88 210 100" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.5" />`;
        case 'straw': return `
            <ellipse cx="150" cy="112" rx="128" ry="26" fill="#fcd34d" ${sp} />
            <path d="M 92 106 C 92 40, 208 40, 208 106 Z" fill="#fbbf24" ${sp} />
            <path d="M 94 94 L 206 94" stroke="#b45309" stroke-width="7" />
            <path d="M 30 112 Q 150 140 270 112" fill="none" stroke="${ink}" stroke-width="2.5" opacity="0.35" stroke-dasharray="4 5" />`;
        case 'flower': return `
            <g transform="translate(86 96)">
                <circle cx="0" cy="-12" r="10" fill="#f9a8d4" ${sp} /><circle cx="12" cy="-4" r="10" fill="#f9a8d4" ${sp} /><circle cx="8" cy="10" r="10" fill="#f9a8d4" ${sp} />
                <circle cx="-8" cy="10" r="10" fill="#f9a8d4" ${sp} /><circle cx="-12" cy="-4" r="10" fill="#f9a8d4" ${sp} /><circle cx="0" cy="0" r="7" fill="#facc15" ${sp} />
            </g>`;
        case 'headphones': return `
            <path d="M 70 150 C 62 50, 238 50, 230 150" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round" />
            <path d="M 70 150 C 62 50, 238 50, 230 150" fill="none" stroke="#a78bfa" stroke-width="6" stroke-linecap="round" />
            <rect x="52" y="140" width="30" height="48" rx="12" fill="#7c3aed" ${sp} /><rect x="218" y="140" width="30" height="48" rx="12" fill="#7c3aed" ${sp} />`;
        case 'crown': case 'crownGold': {
            const fill = c.headwear === 'crownGold' ? '#facc15' : '#fde68a';
            return `<path d="M 88 106 L 84 56 L 116 80 L 150 38 L 184 80 L 216 56 L 212 106 Z" fill="${fill}" ${sp} />
                <circle cx="150" cy="56" r="6" fill="#e11d48" stroke="${ink}" stroke-width="3" /><circle cx="100" cy="74" r="4.5" fill="#38bdf8" stroke="${ink}" stroke-width="2.5" /><circle cx="200" cy="74" r="4.5" fill="#38bdf8" stroke="${ink}" stroke-width="2.5" />`;
        }
        default: return '';
    }
}

function eyebrowSVG(c, sp) {
    switch (c.eyebrows) {
        case 'normal': return `<path d="M 88 122 Q 106 114 126 122" fill="none" ${sp} /><path d="M 168 118 Q 188 110 208 118" fill="none" ${sp} />`;
        case 'thick': return `<path d="M 86 122 Q 106 112 128 122" fill="none" stroke="#261b2b" stroke-width="10" stroke-linecap="round" /><path d="M 166 118 Q 188 108 210 118" fill="none" stroke="#261b2b" stroke-width="10" stroke-linecap="round" />`;
        case 'raised': return `<path d="M 88 112 Q 106 100 126 110" fill="none" ${sp} /><path d="M 168 104 Q 188 92 208 104" fill="none" ${sp} />`;
        case 'angry': return `<path d="M 88 112 L 126 126" fill="none" ${sp} /><path d="M 208 108 L 168 122" fill="none" ${sp} />`;
        case 'worried': return `<path d="M 88 124 L 126 112" fill="none" ${sp} /><path d="M 208 120 L 168 108" fill="none" ${sp} />`;
        default: return '';
    }
}

function extraEyes(c, sp, thin, ink) {
    switch (c.eyeStyle) {
        case 'sleepy': return `
            <path d="M 86 150 Q 107 162 128 150" fill="none" ${sp} /><path d="M 90 154 L 82 160 M 106 160 L 106 168 M 122 154 L 130 160" fill="none" ${thin} />
            <path d="M 162 146 Q 183 158 204 146" fill="none" ${sp} /><path d="M 166 150 L 158 156 M 182 156 L 182 164 M 198 150 L 206 156" fill="none" ${thin} />`;
        case 'stars': {
            const star = (x, y) => `<path d="M ${x} ${y - 20} L ${x + 6} ${y - 6} L ${x + 21} ${y - 6} L ${x + 9} ${y + 4} L ${x + 13} ${y + 19} L ${x} ${y + 10} L ${x - 13} ${y + 19} L ${x - 9} ${y + 4} L ${x - 21} ${y - 6} L ${x - 6} ${y - 6} Z" fill="#facc15" ${thin} />`;
            return star(107, 148) + star(185, 142);
        }
        case 'wink': return `
            <ellipse cx="107" cy="146" rx="19" ry="20" fill="#ffffff" ${sp} /><circle cx="107" cy="146" r="11" fill="${ink}" /><circle cx="103" cy="142" r="4" fill="#ffffff" />
            <path d="M 162 144 Q 183 130 204 144" fill="none" ${sp} />`;
        case 'glasses': return `
            <circle cx="107" cy="148" r="25" fill="#ffffff" fill-opacity="0.55" ${sp} /><circle cx="107" cy="148" r="8" fill="${ink}" />
            <circle cx="185" cy="144" r="25" fill="#ffffff" fill-opacity="0.55" ${sp} /><circle cx="185" cy="144" r="8" fill="${ink}" />
            <path d="M 132 146 Q 146 138 160 144" fill="none" ${sp} /><path d="M 82 146 L 70 140 M 210 142 L 224 136" fill="none" ${thin} />`;
        case 'angry': return `
            <ellipse cx="107" cy="150" rx="19" ry="14" fill="#ffffff" ${sp} /><circle cx="109" cy="152" r="8" fill="${ink}" />
            <ellipse cx="183" cy="146" rx="19" ry="14" fill="#ffffff" ${sp} /><circle cx="181" cy="148" r="8" fill="${ink}" />
            <path d="M 84 128 L 128 144" fill="none" ${sp} /><path d="M 210 124 L 166 140" fill="none" ${sp} />`;
        default: return '';
    }
}

function extraMouth(c, sp, ink) {
    switch (c.mouthStyle) {
        case 'tongue': return `<path d="M 132 176 Q 148 192 164 176 Z" fill="#7f1d1d" ${sp} /><path d="M 144 186 Q 148 206 156 186 Z" fill="#fb7185" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round" />`;
        case 'grin': return `<path d="M 124 174 Q 148 200 172 174 Z" fill="#ffffff" ${sp} /><path d="M 130 182 L 166 182 M 148 176 L 148 192" fill="none" stroke="${ink}" stroke-width="2.5" />`;
        case 'surprised': return `<ellipse cx="148" cy="184" rx="11" ry="14" fill="${ink}" /><ellipse cx="148" cy="188" rx="6" ry="7" fill="#fb7185" />`;
        case 'cat': return `<path d="M 130 178 Q 140 190 148 178 Q 156 190 166 178" fill="none" ${sp} />`;
        default: return '';
    }
}

function facialHairSVG(c, sp, ink) {
    switch (c.facialHair) {
        case 'stubble': return `<g fill="${ink}" opacity="0.55">${[[110,196],[122,204],[134,210],[150,213],[166,210],[178,204],[190,196],[118,190],[184,190],[142,206],[158,206]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2"/>`).join('')}</g>`;
        case 'moustache': return `<path d="M 118 172 Q 132 160 148 170 Q 164 160 178 172 Q 164 182 148 176 Q 132 182 118 172 Z" fill="${c.hairColor}" ${sp} />`;
        case 'goatee': return `<path d="M 134 200 Q 148 196 162 200 Q 158 226 148 228 Q 138 226 134 200 Z" fill="${c.hairColor}" ${sp} />`;
        default: return '';
    }
}

function extraTop(c, sp, thin, ink) {
    const neck = `<path d="M 132 195 L 132 235 Q 150 242 168 235 L 168 195" fill="${c.skinColor}" ${sp} />`;
    const body = fill => `<path d="M 60 310 C 70 236, 112 228, 150 244 C 188 228, 230 236, 240 310 Z" fill="${fill}" ${sp} />`;
    switch (c.jacketStyle) {
        case 'tshirt': return `${neck}${body(c.jacketColor)}<path d="M 120 236 Q 150 262 180 236" fill="none" ${sp} />`;
        case 'uniform': return `${neck}${body('#ffffff')}<path d="M 120 236 L 150 262 L 180 236 L 168 232 L 150 246 L 132 232 Z" fill="#1d4ed8" ${sp} /><path d="M 150 262 L 142 300 L 150 308 L 158 300 Z" fill="#1d4ed8" ${sp} /><rect x="86" y="268" width="24" height="16" rx="3" fill="none" ${thin} />`;
        case 'kramaScarf': return `${neck}${body(c.jacketColor)}<path d="M 112 234 Q 150 262 188 234 L 196 254 Q 150 284 104 254 Z" fill="${KRAMA_RED}" ${sp} /><path d="M 130 262 L 126 304 L 148 296 L 150 270 Z" fill="${KRAMA_RED}" ${sp} />`;
        case 'jersey': return `${neck}${body(c.jacketColor)}<path d="M 118 236 Q 150 256 182 236" fill="none" ${sp} /><text x="150" y="296" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="44" fill="#ffffff" stroke="${ink}" stroke-width="2">7</text>`;
        case 'polo': return `${neck}${body(c.jacketColor)}<path d="M 120 236 L 134 258 L 150 244 L 166 258 L 180 236 L 168 232 L 150 242 L 132 232 Z" fill="#ffffff" ${sp} /><circle cx="150" cy="262" r="2.5" fill="${ink}" /><circle cx="150" cy="276" r="2.5" fill="${ink}" />`;
        case 'sampot': return `${neck}${body('#7c3aed')}<path d="M 120 236 Q 150 258 180 236" fill="none" stroke="#facc15" stroke-width="5" /><g fill="#facc15" opacity="0.9">${[[96,270],[124,284],[152,270],[180,284],[208,270],[110,298],[150,298],[190,298]].map(([x, y]) => `<path d="M ${x} ${y - 7} L ${x + 6} ${y} L ${x} ${y + 7} L ${x - 6} ${y} Z"/>`).join('')}</g>`;
        default: return '';
    }
}

function accessorySVG(c, sp, thin, ink) {
    switch (c.accessory) {
        case 'kramaNeck': return `<path d="M 116 232 Q 150 258 184 232 L 190 250 Q 150 276 110 250 Z" fill="${KRAMA_RED}" ${sp} /><g fill="#ffffff" opacity="0.8">${[[128,244],[146,252],[164,252],[176,244]].map(([x, y]) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8"/>`).join('')}</g>`;
        case 'strap': return `<path d="M 96 236 L 214 310" stroke="${ink}" stroke-width="12" stroke-linecap="round" /><path d="M 96 236 L 214 310" stroke="#f97316" stroke-width="6" stroke-linecap="round" />`;
        case 'camera': return `<rect x="118" y="270" width="64" height="38" rx="8" fill="#334155" ${sp} /><circle cx="150" cy="290" r="13" fill="#94a3b8" ${sp} /><circle cx="150" cy="290" r="5" fill="${ink}" /><rect x="128" y="264" width="18" height="9" rx="3" fill="#334155" ${thin} />`;
        case 'coffee': return `<path d="M 202 262 L 208 306 L 240 306 L 246 262 Z" fill="#fef3c7" ${sp} /><rect x="198" y="254" width="52" height="10" rx="4" fill="#92400e" ${sp} /><path d="M 204 276 L 244 276" stroke="#92400e" stroke-width="6" /><path d="M 222 240 Q 214 232 222 224" fill="none" ${thin} />`;
        case 'phone': return `<rect x="196" y="258" width="34" height="56" rx="7" fill="#1e293b" ${sp} /><rect x="201" y="266" width="24" height="38" rx="3" fill="#7dd3fc" /><circle cx="213" cy="309" r="2" fill="#ffffff" />`;
        default: return '';
    }
}

function bgPattern(c, ink) {
    switch (c.bgStyle) {
        case 'kramaChecks': return `<g opacity="0.22">${[...Array(10)].map((_, j) => [...Array(10)].map((_, i) => (i + j) % 2 === 0 ? `<rect x="${i * 30}" y="${j * 30}" width="30" height="30" fill="${KRAMA_RED}"/>` : '').join('')).join('')}</g>`;
        case 'lotus': {
            const lotus = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#f9a8d4" stroke="${ink}" stroke-width="3" opacity="0.6"><path d="M 0 0 Q -22 -22 0 -46 Q 22 -22 0 0 Z"/><path d="M 0 0 Q -40 -8 -34 -36 Q -6 -22 0 0 Z"/><path d="M 0 0 Q 40 -8 34 -36 Q 6 -22 0 0 Z"/></g>`;
            return lotus(48, 80, 0.9) + lotus(252, 60, 0.8) + lotus(40, 262, 1) + lotus(258, 250, 0.9);
        }
        case 'angkor': return `<g fill="${ink}" opacity="0.28"><path d="M 20 300 L 20 230 L 60 230 L 60 300 Z M 100 300 L 100 190 Q 110 150 122 190 L 122 160 Q 150 100 178 160 L 178 190 Q 190 150 200 190 L 200 300 Z M 240 300 L 240 230 L 280 230 L 280 300 Z"/></g><path d="M 0 300 L 300 300" stroke="${ink}" stroke-width="3" opacity="0.28"/>`;
        case 'skyline': return `<g fill="${ink}" opacity="0.24"><rect x="10" y="190" width="30" height="110"/><rect x="46" y="150" width="26" height="150"/><rect x="78" y="210" width="34" height="90"/><rect x="118" y="120" width="30" height="180"/><rect x="154" y="176" width="28" height="124"/><rect x="188" y="140" width="34" height="160"/><rect x="228" y="200" width="30" height="100"/><rect x="262" y="170" width="30" height="130"/></g>`;
        case 'nightMarket': return `<path d="M 0 40 Q 150 90 300 40" fill="none" stroke="${ink}" stroke-width="2.5" opacity="0.4"/>${[[30,52],[70,66],[110,76],[150,80],[190,76],[230,66],[270,52]].map(([x, y], i) => `<circle cx="${x}" cy="${y + 8}" r="8" fill="${['#fde047','#fb7185','#7dd3fc'][i % 3]}" stroke="${ink}" stroke-width="2" opacity="0.9"/>`).join('')}`;
        default: return '';
    }
}

function frameSVG(c, ink) {
    switch (c.frame) {
        case 'goldTicket': return `<circle cx="150" cy="150" r="145" fill="none" stroke="#d4a017" stroke-width="12" /><circle cx="150" cy="150" r="145" fill="none" stroke="#fff3b0" stroke-width="3" stroke-dasharray="10 8" />`;
        case 'lotusRing': return `<circle cx="150" cy="150" r="144" fill="none" stroke="#f472b6" stroke-width="12" />${[...Array(12)].map((_, i) => `<ellipse cx="150" cy="8" rx="11" ry="18" fill="#fbcfe8" stroke="${ink}" stroke-width="3" transform="rotate(${i * 30} 150 150)"/>`).join('')}`;
        case 'rankTuk': return `<circle cx="150" cy="150" r="145" fill="none" stroke="#22c55e" stroke-width="12" /><circle cx="150" cy="150" r="145" fill="none" stroke="#bbf7d0" stroke-width="3" stroke-dasharray="14 10" /><text x="150" y="30" text-anchor="middle" font-size="28">🛺</text>`;
        case 'rankLegend': return `<circle cx="150" cy="150" r="145" fill="none" stroke="#facc15" stroke-width="14" /><circle cx="150" cy="150" r="138" fill="none" stroke="#b45309" stroke-width="3" /><text x="150" y="34" text-anchor="middle" font-size="30">👑</text>`;
        case 'royale': return `<circle cx="150" cy="150" r="145" fill="none" stroke="#e11d48" stroke-width="12" /><circle cx="150" cy="150" r="145" fill="none" stroke="#fde68a" stroke-width="4" stroke-dasharray="3 9" /><text x="150" y="34" text-anchor="middle" font-size="30">🏆</text>`;
        default: return '';
    }
}

if (typeof module !== 'undefined') module.exports = { generateAvatarSVG, sanitizeAvatarConfig, AVATAR_DEFAULTS, AVATAR_ALLOWED };
