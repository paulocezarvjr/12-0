/* ============================================================================
 * 12-0 — gen-recent-majors.js  (one-off)
 *
 * The fetch workflow hit a session limit before the 4 most recent Majors were
 * collected. Their rosters were pulled by hand from Liquipedia (see chat) and
 * are encoded below. This script writes data/majors/{cph2024,aus2025,bud2025,
 * y2026}.json in the same schema the workflow produced.
 *
 * Roles are heuristic: confident AWPers/IGLs/stars are tagged from the sets
 * below; the remaining players get entry/support/lurker/rifle by position so
 * every team is draftable into every setup. Ratings are ESTIMATES (est:true) —
 * overlay the real HLTV per-event numbers later via import-hltv-ratings.js.
 *
 *   node scripts/gen-recent-majors.js && node scripts/build-data.js && node test/smoke.test.js
 *
 * Team line format:  "Team|placement|nick:CC nick:CC nick:CC nick:CC nick:CC"
 * ==========================================================================*/

const fs = require('fs');
const path = require('path');
const OUTDIR = path.join(__dirname, '..', 'data', 'majors');

const AWP = new Set(['zywoo','m0nesy','broky','w0nderful','sh1ro','jame','woxic','mzinho','fallen','nawwk','acor','mutiris','torzsi','hallzerk','jamyoung','s1mple','saffee','hen1','sunpayus','phzy','slaxz-','vexite','dumau','dem0n','azuwu','mercury','br0','osee','luken','kyousuke','d1ledez','v$m','jott aaa','jottaaa']);
const IGL = new Set(['apex','karrigan','aleksib','siuhy','chopper','hooxi','jt','boombl4','maj3r','gla1ve','keoz','story','art','910','snappi','tabsen','nitr0','stanislaw','blamef','niko']);
const STAR = new Set(['zywoo','donk','niko','m0nesy','s1mple','ropz','sh1ro','magixx','xantares','kscerato','yuurih','ax1le','electronic','frozen','jl','flamez','twistzz','yekindar','b1t','spinx','brollan','jimpphat','xertion','fame']);
const SUPER = new Set(['zywoo','donk','m0nesy','s1mple','sh1ro','ropz','b1t','niko']);

const norm = (s) => s.toLowerCase().replace(/\s+/g, '');

function rolesFor(nick, restQueue) {
  const k = norm(nick);
  if (AWP.has(k)) return { awp: true, roles: STAR.has(k) ? ['awp', 'star'] : ['awp'] };
  if (IGL.has(k)) return { awp: false, roles: STAR.has(k) ? ['igl', 'star'] : ['igl'] };
  const base = restQueue.shift() || 'rifle';
  return { awp: false, roles: STAR.has(k) ? [base, 'star'] : [base] };
}
function ratingFor(nick, info) {
  const k = norm(nick);
  if (SUPER.has(k)) return 1.2;
  if (info.roles.includes('star')) return 1.13;
  if (info.awp) return 1.08;
  if (info.roles.includes('igl')) return 1.0;
  return 1.04;
}

function buildTeam(line) {
  const [team, placement, roster] = line.split('|');
  const players = roster.trim().split(/\s+/).map((tok) => {
    const [n, c] = tok.split(':');
    return { n, c: (c || 'XXX').toUpperCase() };
  });
  const rest = ['entry', 'support', 'lurker', 'rifle', 'rifle'];
  const ps = players.map((p) => {
    const info = rolesFor(p.n, rest);
    return { n: p.n, c: p.c, awp: info.awp, roles: info.roles, r: ratingFor(p.n, info), est: true, src: 'liquipedia' };
  });
  return { team, placement, lowConfidence: true, players: ps };
}

const DATA = {
  cph2024: { event: 'PGL Major Copenhagen 2024', year: 2024, teams: [
    'NAVI|1st|b1t:UKR Aleksib:FIN jL:LTU iM:ROU w0nderful:UKR',
    'FaZe|2nd|rain:NOR broky:LAT karrigan:DEN ropz:EST frozen:SVK',
    'Vitality|3rd-4th|apEX:FRA ZywOo:FRA Spinx:ISR flameZ:ISR mezii:GBR',
    'G2|3rd-4th|huNter-:BIH NiKo:BIH m0NESY:RUS HooXi:DEN nexa:SRB',
    'Team Spirit|5th-8th|chopper:RUS magixx:RUS zont1x:UKR donk:RUS sh1ro:RUS',
    'MOUZ|5th-8th|torzsi:HUN xertioN:ISR siuhy:POL Jimpphat:FIN Brollan:SWE',
    'Complexity|9th-11th|JT:RSA floppy:USA Grim:USA hallzerk:NOR EliGE:USA',
    'Virtus.pro|9th-11th|Jame:RUS FL1T:RUS fame:RUS n0rb3r7:RUS mir:RUS',
    'Cloud9|Opening|Ax1Le:RUS HObbit:KAZ electronic:RUS Perfecto:RUS Boombl4:RUS',
    'Eternal Fire|Opening|XANTARES:TUR Calyx:TUR MAJ3R:TUR Wicadia:TUR woxic:TUR',
    'ENCE|Opening|dycha:POL gla1ve:DEN Goofy:POL Kylar:POL hades:POL',
    'Apeks|Opening|nawwk:SWE jkaem:NOR STYKO:SVK CacaNito:MKD sense:NOR',
    'Heroic|Opening|TeSeS:DEN sjuush:DEN NertZ:ISR nicoodoz:DEN kyxsan:MKD',
    'GamerLegion|Opening|isak:SWE acoR:DEN Keoz:BEL volt:ROU Snax:POL',
    'SAW|Opening|MUTiRiS:POR roman:POR ewjerkz:POR story:POR arrozdoce:POR',
    'FURIA|Opening|yuurih:BRA arT:BRA KSCERATO:BRA FalleN:BRA chelo:BRA',
    'ECSTATIC|Opening|kraghen:DEN Queenix:DEN salazar:DEN Nodios:DEN Patti:DEN',
    'The MongolZ|Opening|bLitz:MNG Techno4K:MNG 910:MNG mzinho:MNG Senzu:MNG',
    'Imperial|Opening|VINI:BRA HEN1:BRA felps:BRA noway:BRA decenty:BRA',
    'paiN|Opening|biguzera:BRA lux:BRA kauez:BRA nqz:BRA n1ssim:BRA',
    'Lynn Vision|Opening|westmelon:CHN z4kr:CHN EmiliaQAQ:CHN Starry:CHN C4LLM3SU3:CHN',
  ] },
  aus2025: { event: 'BLAST.tv Austin Major 2025', year: 2025, teams: [
    'Vitality|1st|apEX:FRA ZywOo:FRA flameZ:ISR mezii:GBR ropz:EST',
    'The MongolZ|2nd|bLitz:MNG Techno4K:MNG 910:MNG mzinho:MNG Senzu:MNG',
    'MOUZ|3rd-4th|torzsi:HUN xertioN:ISR Jimpphat:FIN Brollan:SWE Spinx:ISR',
    'paiN|3rd-4th|biguzera:BRA nqz:BRA snow:BRA dav1deuS:CHL dgt:URY',
    'Team Spirit|5th-8th|chopper:RUS magixx:RUS zont1x:UKR donk:RUS sh1ro:RUS',
    'NAVI|5th-8th|b1t:UKR Aleksib:FIN jL:LTU iM:ROU w0nderful:UKR',
    'FaZe|5th-8th|rain:NOR karrigan:DEN frozen:SVK EliGE:USA s1mple:UKR',
    'FURIA|5th-8th|yuurih:BRA KSCERATO:BRA FalleN:BRA molodoy:KAZ YEKINDAR:LAT',
    'G2|9th-11th|huNter-:BIH malbsMd:GUA Snax:POL HeavyGod:ISR hades:POL',
    'Virtus.pro|9th-11th|FL1T:RUS fame:RUS electroNic:RUS FL4MUS:RUS ICY:KAZ',
    '3DMAX|12th-14th|Lucky:FRA Ex3rcice:FRA Maka:FRA Graviti:FRA bodyy:FRA',
    'Aurora|12th-14th|XANTARES:TUR MAJ3R:TUR Wicadia:TUR woxic:TUR jottAAA:TUR',
    'Lynn Vision|12th-14th|westmelon:CHN z4kr:CHN EmiliaQAQ:CHN Starry:CHN C4LLM3SU3:CHN',
    'Team Falcons|15th-16th|Magisk:DEN NiKo:BIH TeSeS:DEN kyxsan:MKD m0NESY:RUS',
    'Team Liquid|15th-16th|NAF:CAN Twistzz:CAN ultimate:POL NertZ:ISR siuhy:POL',
    'MIBR|17th-19th|exit:BRA brnz4n:BRA insani:BRA saffee:BRA Lucaozy:BRA',
    'Heroic|17th-19th|SunPayus:ESP LNZ:SWE yxngstxr:SWE xfl0ud:TUR tN1R:BLR',
    'B8|17th-19th|npl:UKR esenthial:UKR headtr1ck:UKR alex666:UKR kensizor:UKR',
    'M80|20th-22nd|Swisher:USA reck:USA slaxz-:GER s1n:GER Lake:USA',
    'TYLOO|20th-22nd|Attacker:CHN JamYoung:CHN Moseyuh:CHN Mercury:CHN Jee:CHN',
    'BetBoom|23rd-24th|s1ren:RUS zorte:RUS Magnojez:RUS Ax1Le:RUS Boombl4:RUS',
    'Wildcard|25th-27th|stanislaw:CAN JBa:USA Sonic:RSA susp:SWE phzy:SWE',
    'FlyQuest|25th-27th|INS:AUS Liazz:AUS Vexite:AUS regali:ROU nettik:NZL',
  ] },
  bud2025: { event: 'StarLadder Budapest Major 2025', year: 2025, teams: [
    'Vitality|1st|apEX:FRA ZywOo:FRA flameZ:ISR mezii:GBR ropz:EST',
    'FaZe|2nd|rain:NOR broky:LAT karrigan:DEN frozen:SVK jcobbb:POL',
    'Team Spirit|3rd-4th|chopper:RUS donk:RUS sh1ro:RUS zweih:RUS zont1x:UKR',
    'NAVI|3rd-4th|b1t:UKR Aleksib:FIN iM:ROU w0nderful:UKR makazze:XK',
    'Team Falcons|5th-8th|NiKo:BIH TeSeS:DEN kyxsan:MKD m0NESY:RUS kyousuke:RUS',
    'The MongolZ|5th-8th|bLitz:MNG Techno4K:MNG 910:MNG mzinho:MNG controlez:MNG',
    'MOUZ|5th-8th|torzsi:HUN xertioN:ISR Jimpphat:FIN Brollan:SWE Spinx:ISR',
    'FURIA|5th-8th|yuurih:BRA KSCERATO:BRA FalleN:BRA molodoy:KAZ YEKINDAR:LAT',
    'B8|9th-16th|npl:UKR esenthial:UKR headtr1ck:UKR alex666:UKR kensizor:UKR',
    'G2|9th-16th|huNter-:BIH malbsMd:GUA HeavyGod:ISR SunPayus:ESP matys:SVK',
    'Passion UA|9th-16th|Kvem:UKR JT:RSA Grim:USA hallzerk:NOR nicx:USA',
    'Imperial|9th-16th|VINI:BRA noway:BRA try:ARG chelo:BRA skullz:BRA',
    '3DMAX|9th-16th|Lucky:FRA Ex3rcice:FRA Maka:FRA Graviti:FRA bodyy:FRA',
    'paiN|9th-16th|biguzera:BRA nqz:BRA snow:BRA dav1deuS:CHL dgt:URY',
    'Team Liquid|9th-16th|NAF:CAN ultimate:POL NertZ:ISR siuhy:POL EliGE:USA',
    'PARIVISION|9th-16th|BELCHONOKK:RUS Jame:RUS nota:RUS xiELO:RUS AW:RUS',
    'NiP|17th-32nd|r1nkle:UKR ewjerkz:POR sjuush:DEN Snappi:DEN xKacpersky:POL',
  ] },
  y2026: { event: 'IEM Cologne Major 2026', year: 2026, teams: [
    'Vitality|Playoffs|apEX:FRA ZywOo:FRA flameZ:ISR mezii:GBR ropz:EST',
    'Team Falcons|Grand Final|NiKo:BIH TeSeS:DEN kyxsan:MKD m0NESY:RUS kyousuke:RUS',
    'FURIA|Grand Final|yuurih:BRA KSCERATO:BRA FalleN:BRA molodoy:KAZ YEKINDAR:LAT',
    'NAVI|Playoffs|b1t:UKR Aleksib:FIN iM:ROU w0nderful:UKR makazze:XK',
    'The MongolZ|Playoffs|bLitz:MNG Techno4K:MNG 910:MNG mzinho:MNG cobrazera:MNG',
    'PARIVISION|Playoffs|BELCHONOKK:RUS Jame:RUS nota:RUS xiELO:RUS zweih:RUS',
    'Aurora|Stage 3|XANTARES:TUR MAJ3R:TUR Wicadia:TUR woxic:TUR soulfly:TUR',
    'MOUZ|Stage 3|torzsi:HUN xertioN:ISR Jimpphat:FIN Brollan:SWE Spinx:ISR',
    'FUT Esports|Stage 2|dem0n:UKR Krabeni:XK cmtry:UKR dziugss:LTU lauNX:ROU',
    'Team Spirit|Stage 2|magixx:RUS zont1x:UKR donk:RUS sh1ro:RUS tN1R:BLR',
    'Astralis|Stage 2|Staehr:DEN jabbi:DEN HooXi:DEN phzy:SWE ryu:LTU',
    'G2|Stage 2|huNter-:BIH HeavyGod:ISR SunPayus:ESP matys:SVK NertZ:ISR',
    'Legacy|Stage 2|latto:BRA dumau:BRA saadzin:BRA n1ssim:BRA arT:BRA',
    'paiN|Stage 2|biguzera:BRA nqz:BRA snow:BRA piriajr:BRA v$m:BRA',
    'Monte|Stage 2|Gizmy:GBR afro:FRA AZUWU:GBR Bymas:LTU Rainwaker:BGR',
    '9z|Stage 2|max:URY HUASOPEEK:CHL luchov:ARG meyern:ARG dgt:URY',
    'GamerLegion|Stage 1|Tauson:DEN PR:CZE REZ:SWE hypex:POL Snax:POL',
    'B8|Stage 1|npl:UKR esenthial:UKR alex666:UKR kensizor:UKR s1zzi:UKR',
    'Heroic|Stage 1|yxngstxr:SWE xfl0ud:TUR nilo:SWE Chr1zN:DEN susp:SWE',
    'BetBoom|Stage 1|zorte:RUS Magnojez:RUS Boombl4:RUS FL4MUS:RUS d1Ledez:RUS',
    'BIG|Stage 1|tabseN:GER JDC:GER gr1ks:BLR blameF:DEN faveN:GER',
    'M80|Stage 1|Swisher:USA slaxz-:GER s1n:GER Lake:USA JBa:USA',
    'MIBR|Stage 1|brnz4n:BRA insani:BRA kl1m:RUS LNZ:SWE venomzera:BRA',
    'SINNERS|Stage 1|beastik:CZE SHOCK:CZE kisserek:POL stressarN:MKD MoDo:ROU',
    'NRG|Stage 1|oSee:USA nitr0:USA br0:DEN Sonic:ZAF Grim:USA',
    'TYLOO|Stage 1|JamYoung:CHN Moseyuh:CHN Mercury:CHN Jee:CHN Zero:CHN',
    'Sharks|Stage 1|gafolo:BRA rdnzao:BRA doc:BRA koala:BRA maxxkor:ARG',
    'Gaimin Gladiators|Stage 1|JOTA:BRA NEKIZ:BRA felps:BRA HEN1:BRA Luken:ARG',
    'Team Liquid|Stage 1|NAF:CAN ultimate:POL siuhy:POL EliGE:USA malbsMd:GTM',
    'Lynn Vision|Stage 1|westmelon:CHN z4kr:CHN EmiliaQAQ:CHN Starry:CHN C4LLM3SU3:CHN',
  ] },
};

for (const [id, d] of Object.entries(DATA)) {
  const out = { id, event: d.event, year: d.year, url: 'liquipedia (manual)', teams: d.teams.map(buildTeam) };
  fs.writeFileSync(path.join(OUTDIR, id + '.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(id + ': ' + out.teams.length + ' teams, ' + out.teams.reduce((a, t) => a + t.players.length, 0) + ' players');
}
console.log('\nWrote 4 recent-Major files. Next: node scripts/build-data.js && node test/smoke.test.js');
