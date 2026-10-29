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
    blush: true
};

// Allowed values for every option. Configs can arrive from other players over
// the network, so anything not listed here falls back to the default rather
// than being written into the SVG markup.
const AVATAR_ALLOWED = {
    mode: ['custom'],
    hairStyle: ['fluffy', 'spiky', 'beanie', 'cap'],
    eyeStyle: ['chill', 'shades', 'curious', 'happy', 'smug'],
    mouthStyle: ['neutral', 'smirk', 'smile', 'open'],
    jacketStyle: ['cardigan', 'hoodie', 'bomber'],
    squiggles: ['electric', 'question', 'sparkles', 'sweat', 'none'],
    earrings: ['hoops', 'none']
};
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

function generateAvatarSVG(config = {}) {
    const c = sanitizeAvatarConfig(config);
    
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

    // 4. Face & Ears
    const earsSVG = `
        <path d="M 76 178 C 62 178, 58 208, 80 214" fill="${c.skinColor}" ${strokeProps} />
        <path d="M 224 172 C 238 172, 242 202, 220 208" fill="${c.skinColor}" ${strokeProps} />
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

    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="100%" height="100%" aria-hidden="true" style="border-radius: 50%; overflow: hidden; background: ${c.bg};">
        <rect width="300" height="300" fill="${c.bg}" />
        ${squigglesSVG}
        ${hairBackSVG}
        ${clothesSVG}
        ${earsSVG}
        ${faceBaseSVG}
        ${c.blush ? `
            <ellipse cx="94" cy="174" rx="10" ry="5" fill="#fca5a5" opacity="0.8" />
            <ellipse cx="196" cy="168" rx="10" ry="5" fill="#fca5a5" opacity="0.8" />
        ` : ''}
        ${eyesSVG}
        ${mouthSVG}
        ${hairFrontSVG}
    </svg>`;
}

if (typeof module !== 'undefined') module.exports = { generateAvatarSVG, sanitizeAvatarConfig, AVATAR_DEFAULTS };
