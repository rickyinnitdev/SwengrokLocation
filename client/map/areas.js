// Quick-jump chip sets. Boxes are Leaflet [[south, west], [north, east]].
// Khan boxes are not listed here: they come from data/pp-khans.geojson.
// Province and country boxes are hand-set approximations, good enough to frame an area.
// `km` is the Khmer label where one is known; otherwise the chip shows the English name.
const box = (s, w, n, e) => [[s, w], [n, e]];

export const KH_PROVINCES = [
  ['Phnom Penh', 'ភ្នំពេញ', box(11.38, 104.72, 11.72, 105.08)],
  ['Siem Reap', 'សៀមរាប', box(12.9, 103.2, 14.2, 104.6)],
  ['Battambang', 'បាត់ដំបង', box(12.4, 102.6, 13.5, 103.8)],
  ['Banteay Meanchey', 'បន្ទាយមានជ័យ', box(13.2, 102.4, 14.0, 103.5)],
  ['Oddar Meanchey', 'ឧត្តរមានជ័យ', box(13.8, 103.3, 14.5, 104.6)],
  ['Preah Vihear', 'ព្រះវិហារ', box(13.3, 104.3, 14.4, 105.8)],
  ['Stung Treng', 'ស្ទឹងត្រែង', box(13.2, 105.4, 14.3, 106.6)],
  ['Ratanakiri', 'រតនគិរី', box(13.4, 106.4, 14.7, 107.6)],
  ['Mondulkiri', 'មណ្ឌលគិរី', box(11.8, 106.3, 13.2, 107.6)],
  ['Kratie', 'ក្រចេះ', box(12.0, 105.5, 13.3, 106.8)],
  ['Kampong Thom', 'កំពង់ធំ', box(12.0, 104.0, 13.4, 105.5)],
  ['Kampong Cham', 'កំពង់ចាម', box(11.5, 104.8, 12.4, 105.9)],
  ['Tboung Khmum', 'ត្បូងឃ្មុំ', box(11.6, 105.4, 12.3, 106.4)],
  ['Kampong Chhnang', 'កំពង់ឆ្នាំង', box(11.7, 104.1, 12.5, 105.0)],
  ['Pursat', 'ពោធិ៍សាត់', box(11.7, 102.7, 12.8, 104.2)],
  ['Koh Kong', 'កោះកុង', box(10.9, 102.3, 12.2, 103.7)],
  ['Kampong Speu', 'កំពង់ស្පឺ', box(11.2, 103.4, 11.9, 104.8)],
  ['Kandal', 'កណ្ដាល', box(11.0, 104.6, 11.8, 105.4)],
  ['Takeo', 'តាកែវ', box(10.6, 104.4, 11.4, 105.1)],
  ['Kampot', 'កំពត', box(10.4, 103.8, 11.2, 104.8)],
  ['Kep', 'កែប', box(10.4, 104.2, 10.6, 104.5)],
  ['Preah Sihanouk', 'ព្រះសីហនុ', box(10.4, 103.3, 11.1, 104.0)],
  ['Svay Rieng', 'ស្វាយរៀង', box(10.8, 105.3, 11.5, 106.2)],
  ['Prey Veng', 'ព្រៃវែង', box(10.9, 105.0, 11.7, 105.9)],
  ['Pailin', 'ប៉ៃលិន', box(12.7, 102.4, 13.2, 103.0)]
].map(([name, km, bounds]) => ({ id: name, name, km, bounds }));

export const ASIA_COUNTRIES = [
  ['Cambodia', 'កម្ពុជា', box(10.4, 102.3, 14.7, 107.7)],
  ['Thailand', 'ថៃ', box(5.6, 97.3, 20.5, 105.7)],
  ['Vietnam', 'វៀតណាម', box(8.5, 102.1, 23.4, 109.5)],
  ['Laos', 'ឡាវ', box(13.9, 100.1, 22.5, 107.7)],
  ['Myanmar', 'មីយ៉ាន់ម៉ា', box(9.7, 92.1, 28.5, 101.2)],
  ['Malaysia', 'ម៉ាឡេស៊ី', box(0.8, 99.6, 7.4, 119.3)],
  ['Singapore', 'សិង្ហបុរី', box(1.15, 103.6, 1.48, 104.1)],
  ['Indonesia', 'ឥណ្ឌូនេស៊ី', box(-11.0, 95.0, 6.0, 141.0)],
  ['Philippines', 'ហ្វីលីពីន', box(4.6, 116.9, 21.2, 126.6)],
  ['China', 'ចិន', box(18.0, 73.5, 53.6, 134.8)],
  ['Japan', 'ជប៉ុន', box(30.9, 129.4, 45.6, 145.8)],
  ['South Korea', 'កូរ៉េខាងត្បូង', box(33.1, 125.9, 38.7, 129.6)],
  ['India', 'ឥណ្ឌា', box(6.7, 68.1, 35.5, 97.4)],
  ['Sri Lanka', 'ស្រីលង្កា', box(5.9, 79.6, 9.9, 81.9)],
  ['Nepal', 'នេប៉ាល់', box(26.3, 80.0, 30.5, 88.2)]
].map(([name, km, bounds]) => ({ id: name, name, km, bounds }));

export const CONTINENTS = [
  ['Asia', 'អាស៊ី', box(-10, 26, 77, 180)],
  ['Europe', 'អឺរ៉ុប', box(35, -25, 71, 45)],
  ['Africa', 'អាហ្វ្រិក', box(-35, -18, 37, 52)],
  ['North America', 'អាមេរិកខាងជើង', box(7, -170, 72, -50)],
  ['South America', 'អាមេរិកខាងត្បូង', box(-56, -82, 13, -34)],
  ['Oceania', 'អូសេអានី', box(-47, 110, 0, 180)]
].map(([name, km, bounds]) => ({ id: name, name, km, bounds }));

export const CHIP_SETS = {
  'kh-provinces': KH_PROVINCES,
  'asia-countries': ASIA_COUNTRIES,
  continents: CONTINENTS
};

// Rivers: a label-emphasis layer, the strongest orientation cue in Phnom Penh.
export const RIVERS = [
  { name: 'Tonle Sap', km: 'ទន្លេសាប', at: [11.585, 104.915] },
  { name: 'Mekong', km: 'មេគង្គ', at: [11.575, 104.948] },
  { name: 'Bassac', km: 'បាសាក់', at: [11.535, 104.945] }
];

// Orientation icons. Ids point at LOCATIONS_DB.landmarks, so coordinates stay verified in one place.
export const PP_ORIENTATION_IDS = [
  'lm_01', 'lm_02', 'lm_03', 'lm_04', 'lm_05', 'lm_06', 'lm_07', 'lm_08', 'lm_09', 'lm_11',
  'lm_13', 'lm_14', 'lm_19', 'lm_23', 'lm_24', 'lm_26', 'lm_27', 'lm_28', 'lm_29', 'lm_30',
  'lm_31', 'lm_33', 'lm_36', 'lm_41', 'lm_42'
];
export const KH_CITIES = [
  ['Phnom Penh', 'ភ្នំពេញ', 11.5564, 104.9282], ['Siem Reap', 'សៀមរាប', 13.3633, 103.8564],
  ['Battambang', 'បាត់ដំបង', 13.0957, 103.2022], ['Sihanoukville', 'ព្រះសីហនុ', 10.6093, 103.5296],
  ['Kampot', 'កំពត', 10.6104, 104.1815], ['Kep', 'កែប', 10.4829, 104.3167],
  ['Kratie', 'ក្រចេះ', 12.4881, 106.0188], ['Kampong Cham', 'កំពង់ចាម', 11.9934, 105.4635],
  ['Poipet', 'ប៉ោយប៉ែត', 13.6578, 102.5636], ['Koh Kong', 'កោះកុង', 11.6153, 102.984],
  ['Banlung', 'បានលុង', 13.7394, 106.9873], ['Sen Monorom', 'សែនមនោរម្យ', 12.4558, 107.1881]
];
