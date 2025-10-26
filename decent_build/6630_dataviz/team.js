// ------------------------ Config ------------------------
const teamCsv      = "./data/teamdata.csv";
const divisionsUrl = "./divisions.json"; // optional; safe if missing

// ------------------------ State & Els -------------------
const els = {};
const state = {
  team: null,       // e.g., "BUF" (can be set from URL)
  season: null,     // latest by default
  metric: null,     // current offense metric (string)
  view: "both",     // "off" | "def" | "both"
  mirrorOn: true,   // we use "mirror" (paired metrics) mode by default
  currentPair: null // {label, off, def:null, opponent:true}
};

let rows = [];
let map  = null;
let divisionsMap = {};
let rowByTSW = new Map();  // (TEAM|SEASON|WEEK) -> row

// ------------------------ Small helpers -----------------
function $(sel){ return document.querySelector(sel); }
function byId(id){ return document.getElementById(id); }

function eq(a,b){
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function keyTSW(team, season, week){
  return `${normalizeAbbr(team)}|${+season}|${+week}`;
}

function setStatus(s){
  const el = byId("statusLine");
  if (el) el.textContent = s || "";
}

const TEAM_ALIAS = { JAC:"JAX", LA:"LAR", OAK:"LV", STL:"LAR", SD:"LAC" };
function normalizeAbbr(t){
  const a = String(t||"").trim().toUpperCase();
  return TEAM_ALIAS[a] || a || "";
}

function teamBadgeUrl(team){
  // simple NFL logo CDN pattern or your own assets; safe fallback
  const t = String(team||"").toUpperCase();//team?
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${t}.png`;
}




const TEAM_STYLE = {
  ARI:{bg:"#97233F", fg:"#FFFFFF"}, ATL:{bg:"#A71930", fg:"#FFFFFF"}, BAL:{bg:"#241773", fg:"#FFFFFF"},
  BUF:{bg:"#00338D", fg:"#FFFFFF"}, CAR:{bg:"#0085CA", fg:"#111111"}, CHI:{bg:"#0B162A", fg:"#DC4405"},
  CIN:{bg:"#FB4F14", fg:"#111111"}, CLE:{bg:"#311D00", fg:"#FF3C00"}, DAL:{bg:"#041E42", fg:"#869397"},
  DEN:{bg:"#FB4F14", fg:"#002244"}, DET:{bg:"#0076B6", fg:"#B0B7BC"}, GB:{bg:"#203731", fg:"#FFB612"},
  HOU:{bg:"#03202F", fg:"#A71930"}, IND:{bg:"#002C5F", fg:"#A2AAAD"}, JAX:{bg:"#006778", fg:"#D7A22A"},
  KC:{bg:"#E31837", fg:"#FFB81C"}, LAC:{bg:"#0080C6", fg:"#FFC20E"}, LAR:{bg:"#003594", fg:"#FFA300"},
  LV:{bg:"#000000", fg:"#A5ACAF"}, MIA:{bg:"#008E97", fg:"#FC4C02"}, MIN:{bg:"#4F2683", fg:"#FFC62F"},
  NE:{bg:"#002244", fg:"#C60C30"}, NO:{bg:"#D3BC8D", fg:"#101820"}, NYG:{bg:"#0B2265", fg:"#A71930"},
  NYJ:{bg:"#125740", fg:"#FFFFFF"}, PHI:{bg:"#004C54", fg:"#A5ACAF"}, PIT:{bg:"#FFB612", fg:"#101820"},
  SF:{bg:"#AA0000", fg:"#B3995D"}, SEA:{bg:"#002244", fg:"#69BE28"}, TB:{bg:"#D50A0A", fg:"#0A0A08"},
  TEN:{bg:"#0C2340", fg:"#4B92DB"}, WAS:{bg:"#5A1414", fg:"#FFB612"}
};

function tinyTeamBadgeDataUrl(team) {
  const abbr = String(team || "").toUpperCase();
  const style = TEAM_STYLE[abbr] || { bg:"#eee", fg:"#333" };
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
    <rect rx='5' ry='5' width='24' height='24' fill='${style.bg}'/>
    <text x='12' y='16' text-anchor='middle' font-size='10' font-family='system-ui,Arial' fill='${style.fg}'>${abbr}</text>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}




// Normalize headers: lower_snake_case
function normalizeHeaders(arr){
  if (!arr || !arr.length) return arr;
  const first = arr[0];
  const ren = {};
  Object.keys(first).forEach(k=>{
    const nk = String(k).trim()
      .replace(/\s+/g,'_')
      .replace(/[^\w]/g,'_')
      .replace(/__+/g,'_')
      .toLowerCase();
    ren[k] = nk;
  });
  return arr.map(r=>{
    const o = {};
    for (const k in r) o[ren[k]] = r[k];
    return o;
  });
}

// Identify canonical columns + numeric set
function canonicalizeColumns(arr){
  const cols = Object.keys(arr[0] || {});
  // try to find keys
  const kTeam   = cols.find(c => /^(team)$/.test(c)) || "team";
  const kSeason = cols.find(c => /^(season)$/.test(c)) || "season";
  const kWeek   = cols.find(c => /^(week)$/.test(c)) || "week";

const kOpp = cols.find(c => /^(opponent_team|opponent|opp_team|opp)$/i.test(c));

  // numeric columns
  const numeric = cols.filter(c=>{
    if (c===kTeam || c===kSeason || c===kWeek || c==="opponent_team") return false;
    // heuristic: if first finite values exist
    for (let i=0;i<Math.min(25, arr.length);i++){
      const v = +arr[i][c];
      if (Number.isFinite(v)) return true;
    }
    return false;
  });

  return { map: {team:kTeam, season:kSeason, week:kWeek}, numeric };
}

// ------------------------ Chart: Grouped Bars -----------------
function drawOffDefBars(sel, rowsData){
  sel.innerHTML = "";
  const W = sel.clientWidth || 700;
  const H = 300;
  const M = { t:16, r:16, b:40, l:48 };

  // Which series to render
  const series = state.view === "off" ? ["off"]
               : state.view === "def" ? ["def"]
               : ["off","def"];

  // defensively coerce to numbers
  const safeRows = rowsData.map(d => ({
    week: +d.week,
    off: Number.isFinite(+d.off) ? +d.off : 0,
    def: Number.isFinite(+d.def) ? +d.def : 0,
    oppTeam: (d.oppTeam || "").toString().trim().toUpperCase()
  }));

  const weeks = safeRows.map(d => d.week);
  const yMax = d3.max(safeRows, d => d3.max(series.map(k => d[k] || 0))) || 1;

  const x = d3.scaleBand().domain(weeks).range([M.l, W - M.r]).padding(0.2);
  const xSub = d3.scaleBand().domain(series).range([0, x.bandwidth()]).padding(series.length===1 ? 0 : 0.2);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([H - M.b, M.t]);

  const svg = d3.select(sel).append("svg").attr("width", W).attr("height", H);

  // axes
  svg.append("g")
    .attr("transform", `translate(0,${H - M.b})`)
    .call(d3.axisBottom(x).tickSizeOuter(0));
  svg.append("g")
    .attr("transform", `translate(${M.l},0)`)
    .call(d3.axisLeft(y).ticks(6));

  const color = d3.scaleOrdinal()
    .domain(["off","def"])
    .range(["#ffffff", "#EF4444"]); // Offense white, Defense red

  // bars
  const gWeek = svg.append("g").selectAll("g.week")
    .data(safeRows)
    .enter().append("g")
      .attr("class", "week")
      .attr("transform", d => `translate(${x(d.week)},0)`);

  gWeek.selectAll("rect")
    .data(d => series.map(k => ({k, v:d[k]})))
    .enter().append("rect")
      .attr("x", d => xSub(d.k))
      .attr("y", d => y(d.v))
      .attr("width", xSub.bandwidth())
      .attr("height", d => Math.max(0, (H - M.b) - y(d.v))) // guard against NaN/neg
      .attr("rx", 6)
      .attr("fill", d => color(d.k));

/*
gWeek.append("image")
  .attr("href", d => {
    const url = teamBadgeUrl(d.oppTeam);
    return url || null;                // skip if empty → no 404s
  })
  .attr("width", 24)
  .attr("height", 24)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .attr("style", "pointer-events:none")
  .attr("x", x.bandwidth()/2 - 12)
  .attr("y", H - M.b + 6);
*/
  // legend (only for visible series)
  const items = series.map(k => ({ key:k, label: k==="off" ? "Offense" : "Defense (Allowed)" }));
  const legend = svg.append("g").attr("transform", `translate(${W - 170}, ${M.t})`);

  legend.selectAll("rect.l").data(items).enter().append("rect")
    .attr("x",0).attr("y",(d,i)=>i*20)
    .attr("width",14).attr("height",14).attr("rx",3)
    .attr("fill",d=>color(d.key));

  legend.selectAll("text.l").data(items).enter().append("text")
    .attr("x",20).attr("y",(d,i)=>i*20+11)
    .text(d=>d.label);

// opponent logos under x-axis as HTML overlay (same CDN as left-side team card)
sel.style.position = "relative";
sel.style.overflow = "visible";

// remove any previous logos before redraw
sel.querySelectorAll(".opp-logo").forEach(el => el.remove());

const LOGO_W = 24, LOGO_H = 24;
const LOGO_Y = H - M.b + 6;

safeRows.forEach(d => {

  const code = (d.oppTeam || "").toUpperCase();
  if (!code) return; // no code, no logo

  const url = `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`;

  const img = document.createElement("img");
  img.className = "opp-logo";
  img.src = url;
  img.alt = code;
  img.width = LOGO_W;
  img.height = LOGO_H;
  img.style.position = "absolute";
  img.style.pointerEvents = "none";
  img.style.zIndex = "3";

  // center under the week's bar group
  const cx = x(d.week) + x.bandwidth()/2 - LOGO_W/2;
  img.style.left = `${cx}px`;
  img.style.top  = `${LOGO_Y}px`;

/*
  const url = teamBadgeUrl(d.oppTeam);
  if (!url) return; // skip if opponent code unknown

  const img = document.createElement("img");
  img.className = "opp-logo";
  img.src = url;
  img.alt = d.oppTeam || "";
  img.width = LOGO_W;
  img.height = LOGO_H;
  img.style.position = "absolute";
  img.style.pointerEvents = "none";


  // center under bar group
  const cx = x(d.week) + x.bandwidth()/2 - LOGO_W/2;
  img.style.left = `${cx}px`;
  img.style.top  = `${LOGO_Y}px`;

*/

  sel.appendChild(img);
}); //bruh
// ------- INSERT ENDS BEFORE THIS LINE -------

/*

  // --- opponent logos as HTML overlay under x-axis ---
  sel.style.position = "relative";

  // remove old logos (for re-renders)
  sel.querySelectorAll(".opp-logo").forEach(el => el.remove());

  const LOGO_W = 24, LOGO_H = 24;
  const LOGO_Y = H - M.b + 6;

  safeRows.forEach(d => {
    const url = teamBadgeUrl(d.oppTeam);
    if (!url) return; // skip if opponent code not known

    const img = document.createElement("img");
    img.className = "opp-logo";
    img.src = url;
    img.alt = d.oppTeam;
    img.width = LOGO_W;
    img.height = LOGO_H;
    img.style.position = "absolute";
    img.style.pointerEvents = "none";

    // center under this week's bar group
    const cx = x(d.week) + x.bandwidth() / 2 - LOGO_W / 2;
    img.style.left = `${cx}px`;
    img.style.top  = `${LOGO_Y}px`;

    sel.appendChild(img);

  });

*/
  // --- END INSERT ---
//}


}

// ------------------------ Renderers -----------------
function render(){
  if (!map) return;

  const team   = state.team;
  const season = state.season;

  // subset weekly rows for team+season
  const weeks = rows
    .filter(r => eq(r[map.team], team) && (+r[map.season]===+season))
    .map(r => {
      const week = +r[map.week];
      const key  = state.metric;
      const offV = Number.isFinite(+r[key]) ? +r[key] : 0;

	const oppTeamRaw = map.opponent ? r[map.opponent] : r["opponent_team"];
	const rOpp = rowByTSW.get(keyTSW(oppTeamRaw, r[map.season], r[map.week]));
	const defV = rOpp && Number.isFinite(+rOpp[key]) ? +rOpp[key] : 0;

	// ✅ Always set a usable opponent code: prefer explicit column, else fallback to rOpp.team
	const oppTeam = normalizeAbbr(oppTeamRaw || (rOpp ? rOpp[map.team] : ""));

//console.table(weeks.slice(0,10));

	return { week, off: offV, def: defV, oppTeam };

    })
    .sort((a,b)=>a.week-b.week);

  // draw grouped/solo bars (respects Off/Def/Both toggle)


  // identity blurb
  els.name.textContent = team || "TEAM";
  els.metaDot.textContent = weeks.length ? `• ${weeks.length} games in ${season}` : "• No games found";
  const badge = teamBadgeUrl(team);
  if (badge){ els.logoImg.src = badge; els.logoImg.style.display="block"; els.logoFallback.style.display="none"; }
  else { els.logoImg.style.display="none"; els.logoFallback.style.display="block"; }

console.table(weeks.map(w => ({week:w.week, opp:w.oppTeam, off:w.off, def:w.def})).slice(0,8));

  drawOffDefBars(els.chart, weeks);

}

function renderMirror(){
  if (!map || !state.currentPair) return;
  const {off} = state.currentPair;
  const team   = state.team;
  const season = state.season;

  const weeks = rows
    .filter(r => eq(r[map.team], team) && (+r[map.season]===+season))
    .map(r => {
      const week = +r[map.week];
      const offV = Number.isFinite(+r[off]) ? +r[off] : 0;

      // opponent’s row (same season, same week)
	const oppTeamRaw = map.opponent ? r[map.opponent] : r["opponent_team"];
	const rOpp = rowByTSW.get(keyTSW(oppTeamRaw, r[map.season], r[map.week]));
	const defV = rOpp && Number.isFinite(+rOpp[off]) ? +rOpp[off] : 0;

	const oppTeam = normalizeAbbr(oppTeamRaw || (rOpp ? rOpp[map.team] : ""));

	return { week, off: offV, def: defV, oppTeam };
    })
    .sort((a,b)=>a.week-b.week);

  // identity
  els.name.textContent = team || "TEAM";
  els.metaDot.textContent = weeks.length ? `• ${weeks.length} games in ${season}` : "• No games found";
  const badge = teamBadgeUrl(team);
  if (badge){ els.logoImg.src = badge; els.logoImg.style.display="block"; els.logoFallback.style.display="none"; }
  else { els.logoImg.style.display="none"; els.logoFallback.style.display="block"; }

console.table(weeks.map(w => ({week:w.week, opp:w.oppTeam, off:w.off, def:w.def})).slice(0,8));

  drawOffDefBars(els.chart, weeks);
}

// ------------------------ UI Builders -----------------
function buildMirrorControls(){
  const mc = els.mirrorControls;
  if (!mc) return;

  mc.style.display = "flex";
  mc.innerHTML = `
    <div class="view-toggle" style="display:inline-flex; gap:8px;">
      <button class="pill" data-view="off">Offense</button>
      <button class="pill" data-view="def">Defense</button>
      <button class="pill" data-view="both">Both</button>
    </div>
  `;

  const sync = () => {
    mc.querySelectorAll('button.pill').forEach(b=>{
      b.classList.toggle('active', b.dataset.view === state.view);
    });
  };

  mc.querySelectorAll('button.pill').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.view = b.dataset.view;   // "off" | "def" | "both"
      (state.currentPair ? renderMirror() : render());
      sync();
    });
  });

  if (!state.view) state.view = "both";
  sync();
}

function buildTabsFromPairs(pairs){
  els.tabs.innerHTML = "";
  const first = pairs[0];
  state.metric = first.off;
  state.currentPair = first;

  pairs.forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "tab" + (i===0 ? " active" : "");
    b.textContent = p.label.replace(/\b\w/g,c=>c.toUpperCase());
    b.title = `${p.off} vs opponent`;
    b.addEventListener("click", () => {
      els.tabs.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      b.classList.add("active");
      state.metric = p.off;
      state.currentPair = p;
      renderMirror();
    });
    els.tabs.appendChild(b);
  });

  // Show Off/Def/Both toggle
  buildMirrorControls();
}

// ------------------------ Init -----------------
async function init(){
  try{
    setStatus("Loading…");

    // wire els
    els.logoImg       = byId("teamLogo");
    els.logoFallback  = byId("teamLogoFallback");
    els.name          = byId("teamName");
    els.metaDot       = byId("teamMetaDot");
    els.tabs          = byId("teamMetricTabs");
    els.mirrorControls= byId("mirrorControls");
    els.chart         = byId("teamChart");
    els.back          = byId("btnBackLeague");

    if (els.back) els.back.addEventListener("click", ()=> location.href = "index.html");

    // optional divisions
    try{
      const resp = await fetch(divisionsUrl);
      if (resp.ok) divisionsMap = await resp.json();
    }catch(_e){ /* ignore */ }

    // load CSV
    rows = await d3.csv(teamCsv, d3.autoType);
    rows = normalizeHeaders(rows);

    // canonical mapping
    const out = canonicalizeColumns(rows);
    map = out.map;
    const numeric = out.numeric;


const qs = new URLSearchParams(location.search);
const tParam = qs.get("team");
const firstTeam = rows.find(r => r[map.team])?.[map.team];
state.team = (tParam || state.team || firstTeam || "").toString().trim().toUpperCase();


    if (!map.team || !map.season || !map.week) throw new Error("Missing required columns (team/season/week).");
    if (!numeric.length) throw new Error("No numeric metric columns detected.");

    // latest season
    const seasons = [...new Set(rows.map(r => +r[map.season]).filter(Number.isFinite))].sort((a,b)=>a-b);
    state.season = seasons.at(-1) ?? seasons[0];

    // build row index for opponent lookup
    rowByTSW = new Map();
    rows.forEach(r => {
      rowByTSW.set(keyTSW(r[map.team], r[map.season], r[map.week]), r);
    });

    // hard-code the offense metrics we want tabs for (only those present)
    const cols = Object.keys(rows[0] || {});
    const OFF_KEYS = [
      "passing_yards",
      "rushing_yards",
      "completions",
      "attempts",
      "passing_tds",
    ].filter(k => cols.includes(k));

    // build "pairs" (defense will be computed from opponent row in renderers)
    const pairs = OFF_KEYS.map(off => ({
      label: off.replace(/_/g,' '),
      off,
      def: null,
      opponent: true
    }));

    if (pairs.length){
      buildTabsFromPairs(pairs);
      renderMirror();
    } else {
      // fallback: single-series metric tabs (still drawn via grouped drawer for consistency)
      els.mirrorControls.style.display = "none";
      els.tabs.innerHTML = "";
      const fallbackTabs = numeric.slice(0,6);
      state.metric = fallbackTabs[0];

      fallbackTabs.forEach((k, i) => {
        const b = document.createElement("button");
        b.className = "tab" + (i===0 ? " active" : "");
        b.textContent = k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
        b.addEventListener("click", () => {
          els.tabs.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
          b.classList.add("active");
          state.metric = k;
          state.currentPair = null;
          render();
        });
        els.tabs.appendChild(b);
      });

      render();
    }

    setStatus("");
  }catch(err){
    console.error(err);
    setStatus(err.message || "Error");
  }
}

// ------------------------ Boot -----------------
console.log("team.js loaded");
init();
