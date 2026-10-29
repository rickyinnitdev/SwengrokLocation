import fs from 'node:fs';import vm from 'node:vm';
const xml=fs.readFileSync('data/osm-map.raw.xml','utf8');
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>')]));
const nodes=new Map();for(const m of xml.matchAll(/<node\s+([^>]+)>|<node\s+([^>]+)\/>/g)){const a=attrs(m[1]||m[2]);nodes.set(a.id,{lat:+a.lat,lng:+a.lon})}
const h=fs.readFileSync('index.html','utf8');const db=vm.runInNewContext('('+h.match(/const LOCATIONS_DB = ([\s\S]*?);/)[1]+')');
const original=Object.values(db).flat();const candidates=[];
for(const m of xml.matchAll(/<way\s+([^>]+)>([\s\S]*?)<\/way>/g)){
 const wa=attrs(m[1]);const tags={};for(const t of m[2].matchAll(/<tag\s+([^>]+)\/>/g)){const a=attrs(t[1]);tags[a.k]=a.v}
 if(!/^(primary|secondary|tertiary|residential)$/.test(tags.highway)||!tags.name||tags.access==='private')continue;
 const refs=[...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(r=>nodes.get(r[1])).filter(Boolean);if(!refs.length)continue;
 const n=refs[Math.floor(refs.length/2)];if(n.lat<11.55||n.lat>11.58||n.lng<104.89||n.lng>104.92)continue;
 candidates.push({id:'osm_'+wa.id,name:tags['name:en']||tags.name,...n,area:'Central Phnom Penh',osmWay:wa.id});
}
function d2(a,b){return ((a.lat-b.lat)*111000)**2+((a.lng-b.lng)*108800)**2}
for(const c of candidates)c.nearest=Math.min(...original.map(p=>d2(c,p)));
const picks=[];
while(picks.length<100&&candidates.length){candidates.sort((a,b)=>b.nearest-a.nearest);const c=candidates.shift();if(c.nearest<140**2)break;delete c.nearest;picks.push(c);for(const n of candidates)n.nearest=Math.min(n.nearest,d2(c,n))}
fs.writeFileSync('data/extra-locations.json',JSON.stringify({source:'© OpenStreetMap contributors',license:'ODbL 1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',sourceUrl:'https://www.openstreetmap.org',retrieved:'2026-10-29',coverage:'Named road geometry within central Phnom Penh; panorama availability is not guaranteed.',locations:picks},null,2)+'\n');
console.log('Added',picks.length,'road locations; source candidates',candidates.length);
