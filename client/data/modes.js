// Game modes. Single source of truth for the client and the server.
// `region` decides which door a mode lives behind: "kh" (Cambodia) or "world".
// Khmer copy is first-pass and should be reviewed by a native speaker.
export const MODE_CONFIG = {
  landmarks: {
    ranked: true,
    name: 'Landmark Blitz',
    nameKm: 'សម្គាល់ដីសំខាន់',
    badge: 'Best for beginners',
    desc: 'Temples, palaces, markets and bridges around Phnom Penh.',
    descKm: 'ប្រាសាទ វាំង ផ្សារ និងស្ពាននៅជុំវិញភ្នំពេញ។',
    time: 60, rounds: 5, pool: 'landmarks', nmpz: false,
    region: 'kh', icon: 'temple', accent: 'gold', difficulty: 1, featured: true
  },
  classic: {
    ranked: true,
    name: 'City Pulse',
    nameKm: 'ជីពចរទីក្រុង',
    badge: 'The full capital',
    desc: 'Real streets, alleys and avenues across all 14 khans.',
    descKm: 'ផ្លូវ តូច និងមហាវិថីពិតៗ នៅគ្រប់ខណ្ឌទាំង ១៤។',
    time: 60, rounds: 5, pool: 'all', nmpz: false,
    region: 'kh', icon: 'city', accent: 'mekong', difficulty: 1
  },
  sprint: {
    ranked: true,
    name: 'Tuk-Tuk Sprint',
    nameKm: 'ប្រណាំងទុកទុក',
    badge: 'Fast and loud',
    desc: '30-second rounds with a double speed bonus in party play.',
    descKm: 'វគ្គ ៣០ វិនាទី ជាមួយប្រាក់រង្វាន់ល្បឿនទ្វេដងក្នុងក្រុម។',
    time: 30, rounds: 5, pool: 'all', nmpz: false,
    region: 'kh', icon: 'bolt', accent: 'lotus', difficulty: 2
  },
  bounty: {
    ranked: true,
    name: 'Bounty Point Race',
    nameKm: 'ប្រណាំងពិន្ទុ',
    badge: 'Party competitive',
    desc: 'The first guess cuts rivals to 15 seconds. Hit under 200 m for a bounty.',
    descKm: 'អ្នកទាយមុនកាត់ពេលគូប្រកួតមក ១៥ វិនាទី។ ត្រូវក្រោម ២០០ ម៉ែត្រដើម្បីបានរង្វាន់។',
    time: 60, rounds: 5, pool: 'all', nmpz: false, isBounty: true,
    region: 'kh', icon: 'target', accent: 'gold', difficulty: 3
  },
  nmpz: {
    ranked: true,
    name: 'No-Move Challenge',
    nameKm: 'មិនកម្រើក',
    badge: 'Master deduction',
    desc: 'One fixed viewpoint. No panning, no zooming, no walking.',
    descKm: 'ទិដ្ឋភាពថេរមួយ។ មិនអាចបង្វិល ពង្រីក ឬដើរ។',
    time: 45, rounds: 5, pool: 'all', nmpz: true,
    region: 'kh', icon: 'eye', accent: 'mekong', difficulty: 3
  },
  world: {
    ranked: true,
    name: 'World Explorer',
    nameKm: 'អ្នករុករកពិភពលោក',
    badge: 'Pin the world map',
    desc: 'Dropped anywhere on Earth. Pin the globe and score the distance.',
    descKm: 'ទម្លាក់នៅកន្លែងណាមួយលើផែនដី។ ដាក់ម្ជុលលើផែនទីពិភពលោក។',
    time: 60, rounds: 5, pool: 'countries', nmpz: false, isWorld: true,
    region: 'world', icon: 'globe', accent: 'mekong', difficulty: 2, featured: true
  },
  country: {
    name: 'Country Guesser',
    nameKm: 'ទាយប្រទេស',
    badge: 'Four flags, one answer',
    desc: 'Pick the country from four flags. A match is worth 5,000 points.',
    descKm: 'ជ្រើសរើសប្រទេសពីទង់ជាតិ ៤។ ត្រូវបាន ៥,០០០ ពិន្ទុ។',
    time: 45, rounds: 5, pool: 'countries', nmpz: false, isCountry: true,
    region: 'world', icon: 'flag', accent: 'lotus', difficulty: 1, featured: true
  },
  asia: {
    ranked: true,
    name: 'Asia Adventure',
    nameKm: 'ផ្សងព្រេងអាស៊ី',
    badge: 'Southeast Asia and beyond',
    desc: 'Bangkok, Hanoi, Singapore, Bali, Tokyo and everything between.',
    descKm: 'បាងកក ហាណូយ សិង្ហបុរី បាលី តូក្យូ និងច្រើនទៀត។',
    time: 60, rounds: 5, pool: 'asia', nmpz: false, isAsia: true,
    region: 'world', icon: 'globe', accent: 'rice', difficulty: 2, featured: true
  },
  district: {
    name: 'Khan Detective',
    nameKm: 'អ្នកស៊ើបអង្កេតខណ្ឌ',
    badge: 'The 14 khans',
    desc: 'Work out which Phnom Penh khan you are standing in.',
    descKm: 'ដឹងថាអ្នកកំពុងឈរនៅខណ្ឌណានៃភ្នំពេញ។',
    time: 45, rounds: 5, pool: 'all', nmpz: false, isDistrict: true,
    region: 'kh', icon: 'compass', accent: 'rice', difficulty: 2, featured: true
  },
  sniper: {
    ranked: true,
    name: 'Bullseye Sniper',
    nameKm: 'អ្នកបាញ់ម៉ត់',
    badge: 'Ten-times precision',
    desc: '25-second pinpoint rounds. A sub-50 m hit pays up to 10,000.',
    descKm: 'វគ្គ ២៥ វិនាទី។ ត្រូវក្រោម ៥០ ម៉ែត្រ បានដល់ ១០,០០០ ពិន្ទុ។',
    time: 25, rounds: 5, pool: 'all', nmpz: false, isSniper: true,
    region: 'kh', icon: 'target', accent: 'lotus', difficulty: 3
  },
  streak: {
    name: 'Street Streak',
    nameKm: 'ផ្លូវជាប់គ្នា',
    badge: 'Ten rounds, one combo',
    desc: 'Ten quick rounds. Stay within 500 m to build a 5x multiplier.',
    descKm: 'ដប់វគ្គរហ័ស។ នៅក្នុង ៥០០ ម៉ែត្រ ដើម្បីបង្កើនកត្តា ៥ ដង។',
    time: 25, rounds: 10, pool: 'all', nmpz: false, isStreak: true,
    region: 'kh', icon: 'flame', accent: 'gold', difficulty: 2
  },
  // Party-only relay: teammates split the eyes and the hands. Khmer copy is
  // first-pass. TODO(km-review): confirm the Tag-Team name and role words.
  tagteam_kh: {
    name: 'Tag-Team Relay',
    nameKm: 'ដង្ហែក្រុមជាដៃគូ',
    badge: 'Party relay',
    desc: 'One teammate sees the street, the other holds the map. Swap roles every round.',
    descKm: 'ដៃគូម្នាក់មើលផ្លូវ ម្នាក់ទៀតកាន់ផែនទី។ ប្តូរតួនាទីរាល់វគ្គ។',
    time: 60, rounds: 6, pool: 'all', nmpz: false, teams: true,
    region: 'kh', icon: 'people', accent: 'rice', difficulty: 2
  },
  tagteam_world: {
    name: 'World Tag-Team',
    nameKm: 'ដង្ហែក្រុមពិភពលោក',
    badge: 'Party relay',
    desc: 'A world-map relay for two-player teams. One sees, one pins, then swap.',
    descKm: 'ការប្រកួតផែនទីពិភពលោកសម្រាប់ក្រុមពីរនាក់។ ម្នាក់មើល ម្នាក់ដាក់ម្ជុល បន្ទាប់មកប្តូរ។',
    time: 60, rounds: 6, pool: 'countries', nmpz: false, teams: true, isWorld: true,
    region: 'world', icon: 'people', accent: 'rice', difficulty: 3
  },
  cambodia: {
    ranked: true,
    name: 'Angkor & Beyond',
    nameKm: 'អង្គរ និងលើសពីនេះ',
    badge: 'All of Cambodia',
    desc: 'Angkor Wat, Bayon, Bokor, Kep, Battambang and the coast.',
    descKm: 'អង្គរវត្ត បាយ័ន បូកគោ កែប បាត់ដំបង និងឆ្នេរសមុទ្រ។',
    time: 60, rounds: 5, pool: 'cambodia', nmpz: false, isCambodia: true,
    region: 'kh', icon: 'lotus', accent: 'gold', difficulty: 2, featured: true
  }
};

export const REGION_CONFIG = {
  kh: { name: 'In Cambodia', nameKm: 'ក្នុងស្រុក', blurb: 'Phnom Penh streets, landmarks, khans and Angkor.' },
  world: { name: 'Around the World', nameKm: 'ជុំវិញពិភពលោក', blurb: 'World, country flags and Asia.' }
};
