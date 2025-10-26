// NFL League Home — robust, schema-agnostic with sortable table
const d3 = window.d3;

console.log("script loaded (v4)");

const divisionsUrl = "./divisions.json";
const playerCsv = "./data/playerdata.csv";

// State
const state = { conf: "ALL", div: "ALL", season: null, metric: null, position: "ALL" };
const sortState = { key: "value", asc: false }; // default: sort by Total desc

// Elements
const els = {
  metric: document.getElementById("metricSelect"),
  season: document.getElementById("seasonSelect"),
  position: document.getElementById("positionSelect"),
  tableBody: document.querySelector("#playerTable tbody"),
  tableHead: document.querySelector("#playerTable thead"),
};

// Data
let divisionsMap = {};
let players = [];
let lastRows = [];
let map = null;

const statusEl = document.getElementById("statusLine");
function setStatus(msg){ if(statusEl) statusEl.textContent = msg; }
function labelize(s){ return (s+"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()); }

// --- Column canonicalization ---
function canonicalizeColumns(rows) {
  const first = rows[0] || {};
  const cols = Object.keys(first);

  const pick = (patterns, fallback=null) => {
    const re = new RegExp(patterns.join("|"), "i");
    return cols.find(c => re.test(c)) || fallback;
  };

  const map = {
    player_id:           pick(["^player_id$", "gsis_id", "nfl_id", "playerid"], "player_id"),
    player_display_name: pick(["^player_display_name$", "full_name", "display_name", "^name$"]),
    player_name:         pick(["^player_name$", "abbr_name", "short_name", "player"]),
    team:                pick(["^team$", "team_abbr", "team_code"]),
    season:              pick(["^season$"]),
    week:                pick(["^week$"]),
    position:            pick(["^position$", "^pos$"]),
    headshot_url:        pick(["headshot_url", "headshot", "photo_url"])
  };

  // detect numeric metrics (exclude canonical fields)
  const exclude = new Set(Object.values(map).filter(Boolean));
  const numeric = [];
  for (const c of cols) {
    if (exclude.has(c)) continue;
    const vals = rows.map(r => r[c]).filter(v => typeof v === "number" && Number.isFinite(v));
    if (vals.length >= 5) {
      const uniq = new Set(vals);
      if (uniq.size > 1) numeric.push(c);
    }
  }

  // prefer common football metrics if present
  const preferred = ["passing_yards","passing_tds","interceptions","rushing_yards","rushing_tds","receiving_yards","receiving_tds","receptions","targets","sacks","fantasy_points"];
  numeric.sort((a,b) => (preferred.indexOf(a)+1 || 9999) - (preferred.indexOf(b)+1 || 9999));

  return { map, numeric };
}

// existing helpers above...


// existing code below...

function rebuildDependentOptions() {
  if (!map) return;

  // Current team set for selected conf/div
  const teamsInDiv = Object.entries(divisionsMap)
    .filter(([team, [conf, div]]) =>
      (state.conf === 'ALL' || conf === state.conf) &&
      (state.div  === 'ALL' || div  === state.div)
    )
    .map(([t]) => t);

  // Scope rows by season + conf/div
  let scoped = players.filter(d =>
    +d[map.season] === +state.season &&
    teamsInDiv.includes(d[map.team])
  );

  // Build positions list from scoped rows
  const posSet = new Set(scoped.map(d => d[map.position]).filter(Boolean));
  const positions = ["ALL", ...Array.from(posSet).sort()];

  // If a non-ALL position is selected, narrow scoped further (for player list)
  if (state.position && state.position !== "ALL" && map.position) {
    scoped = scoped.filter(d => eq(d[map.position], state.position));
  }

  // Build players list from (possibly narrowed) scoped rows
  // (kept for potential future use)
  // const playerSet = new Set(scoped.map(d => d[map.player_name]).filter(Boolean));
  // const playersList = ["ALL", ...Array.from(playerSet).sort((a,b)=>a.localeCompare(b))];

  // Update Position select
  const prevPos = state.position || "ALL";
  els.position.innerHTML = "";
  positions.forEach(p => els.position.append(new Option(p, p)));
  els.position.value = positions.includes(prevPos) ? prevPos : "ALL";
  state.position = els.position.value;
}

async function init() {
  setStatus("Loading divisions.json …");
  try {
    divisionsMap = await fetchJSON(divisionsUrl);

    setStatus("Loading CSV …");
    players = await loadCSV(playerCsv);

    // Build column mapping + numeric metrics
    const out = canonicalizeColumns(players);
    map = out.map;
    const numeric = out.numeric;
    if (!numeric.length) throw new Error("No numeric stat columns detected in CSV.");

    // Seasons list
    const seasons = [...new Set(players.map(d => +d[map.season]).filter(Number.isFinite))].sort((a, b) => a - b);
    state.season = seasons.at(-1) ?? seasons[0];

    // Initial Position list
    const positions = ["ALL", ...new Set(players.map(d => d[map.position]).filter(Boolean))].sort();

    // Populate initial dropdowns
    setStatus("Populating controls …");

    els.metric.innerHTML = "";
    numeric.forEach(m => els.metric.append(new Option(labelize(m), m)));
    state.metric = numeric[0];
    els.metric.value = state.metric;

    els.season.innerHTML = "";
    seasons.forEach(s => els.season.append(new Option(s, s)));
    els.season.value = state.season;

    els.position.innerHTML = "";
    positions.forEach(p => els.position.append(new Option(p, p)));
    els.position.value = state.position;

    // Listeners
    const playersAll = [...new Set(players.map(getName).filter(Boolean))].sort();
    const playerInput = document.getElementById("playerInput");
    const suggestionBox = document.getElementById("playerSuggestions");

    playerInput.addEventListener("input", () => {
      const query = playerInput.value.toLowerCase();
      if (!query) {
        suggestionBox.style.display = "none";
        return;
      }
      const matches = playersAll.filter(n =>
        n.toLowerCase().includes(query)
      ).slice(0, 15);

      suggestionBox.innerHTML = matches.map(m => `<div>${m}</div>`).join("");
      suggestionBox.style.display = matches.length ? "block" : "none";
    });

    suggestionBox.addEventListener("click", (e) => {
      const name = e.target.textContent;
      state.player = name;
      playerInput.value = name;
      suggestionBox.style.display = "none";

      state.conf = "ALL";
      state.div = "ALL";
      syncPillActive();
      render();
    });

    document.addEventListener("click", (e) => {
      if (e.target.id !== "playerInput") {
        suggestionBox.style.display = "none";
      }
    });

    els.metric.onchange = () => {
      state.metric = els.metric.value;
      render();
    };

    els.season.onchange = () => {
      state.season = +els.season.value;
      rebuildDependentOptions();
      render();
    };

    els.position.onchange = () => {
      state.position = els.position.value;
      rebuildDependentOptions();
      render();
    };

    // Conference pills
    document.querySelectorAll(".pill.conf").forEach(p => {
      p.addEventListener("click", () => {
        state.conf = p.dataset.conf; // AFC/NFC
        syncPillActive();
        rebuildDependentOptions();
        render();
      });
    });

    // Division pills (including ALL)
    document.querySelectorAll(".pill.div").forEach(p => {
      p.addEventListener("click", () => {
        state.div = p.dataset.div;
        syncPillActive();
        rebuildDependentOptions();
        render();
      });
    });

    // NFL (both conferences)
    document.getElementById("btnNFL")?.addEventListener("click", () => {
      state.conf = "ALL";
      syncPillActive();
      rebuildDependentOptions();
      render();
    });

    // Hook up sortable headers
    wireTableSorting();

    // Default highlights and dependent options
    syncPillActive();
    rebuildDependentOptions();

    setStatus("Rendering …");
    render();
    setStatus(`✅ Data OK — rows: ${players.length}`);

  } catch (err) {
    console.error("INIT ERROR:", err);
    setStatus("❌ Init error: " + (err?.message || err));
  }
}

async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`Failed to fetch ${url} (${r.status})`);
  return r.json();
}

async function loadCSV(url){
  const rows = await d3.csv(url, d3.autoType);
  if (!rows.length) throw new Error(`No rows found in ${url}`);
  if (rows.columns?.length === 1) {
    const only = rows.columns[0];
    const v = (rows[0][only] || "").toString().trim();
    if (v.startsWith(":root")) throw new Error("Loaded CSS instead of CSV — check path/filename.");
  }
  console.log("CSV columns:", rows.columns);
  console.table(rows.slice(0, 5));
  return rows;
}

function eq(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function getName(d) {
  return d?.[map.player_display_name] ?? d?.[map.player_name] ?? d?.[map.player_id] ?? "—";
}

function comparator(key, asc) {
  return (a, b) => {
    const va = a[key];
    const vb = b[key];
    const isNum = typeof va === "number" && typeof vb === "number";
    let cmp = 0;
    if (isNum) {
      cmp = va - vb;
    } else {
      cmp = d3.ascending(String(va), String(vb));
    }
    return asc ? cmp : -cmp;
  };
}

function wireTableSorting() {
  const ths = els.tableHead.querySelectorAll("th.sortable");
  ths.forEach(th => {
    // initialize default direction if provided
    const key = th.getAttribute("data-key");
    const def = th.getAttribute("data-default");
    if (def && key === sortState.key) {
      sortState.asc = def.toLowerCase() !== "desc";
    }

    th.addEventListener("click", () => {
      const k = th.getAttribute("data-key");
      if (!k) return;
      if (sortState.key === k) {
        sortState.asc = !sortState.asc; // toggle
      } else {
        sortState.key = k;
        // default: ascending unless overridden by data-default="desc"
        const d = th.getAttribute("data-default");
        sortState.asc = d ? (d.toLowerCase() !== "desc") : true;
      }
      updateSortIndicators();
      render();
    });
  });
  updateSortIndicators();
}

function updateSortIndicators() {
  const ths = els.tableHead.querySelectorAll("th.sortable");
  ths.forEach(th => {
    const k = th.getAttribute("data-key");
    const arrow = th.querySelector(".arrow");
    th.classList.toggle("active", k === sortState.key);
    if (arrow) {
      arrow.textContent = (k === sortState.key ? (sortState.asc ? "↑" : "↓") : "↕");
    }
  });
}




// existing helpers above...

/* --- BEGIN MODIFICATION ✅ team badge generator (no image files) --- */
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

// Generates a data: URL for a 28x28 SVG badge with team abbrev text
function teamBadgeUrl(team) {
  const abbr = String(team || "").toUpperCase();
  const style = TEAM_STYLE[abbr] || {bg:"#eee", fg:"#333"};
  const svg =
`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>
  <rect rx='6' ry='6' width='28' height='28' fill='${style.bg}'/>
  <text x='14' y='18' text-anchor='middle' font-size='12' font-family='system-ui,Arial' fill='${style.fg}'>${abbr}</text>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
/* --- END MODIFICATION ✅ --- */

// existing code below...





function render() {
  if (!map) return;

  const teamsInDiv = Object.entries(divisionsMap)
    .filter(([team, [conf, div]]) =>
      (state.conf === 'ALL' || conf === state.conf) &&
      (state.div  === 'ALL' || div  === state.div)
    )
    .map(([t]) => t);

  let rows = players.filter(d =>
    +d[map.season] === +state.season &&
    teamsInDiv.includes(d[map.team])
  );

  if (state.position !== "ALL" && map.position) {
    rows = rows.filter(d => eq(d[map.position], state.position));
  }

  if (state.player && state.player !== "ALL") {
    rows = rows.filter(d => eq(d[map.player_name], state.player));
  }

  const roll = d3.rollups(
    rows,
    v => {
      const vals = v.map(x => +x[state.metric] || 0).sort(d3.ascending);

      const gp = map.week
        ? new Set(v.map(x => x[map.week])).size
        : v.length;

      const total = d3.sum(vals);
      const avg = gp > 0 ? total / gp : 0;

      const trimmed = vals.length > 2 ? vals.slice(1, -1) : vals;
      const balAvg = d3.mean(trimmed) || 0;

      const variance = d3.mean(vals.map(d => (d - avg) ** 2)) || 0;
      const sd = Math.sqrt(variance);
      const cv = avg !== 0 ? (sd / avg) * 100 : 0;

      return {
        team: mostCommon(v.map(x => x[map.team])),
        value: total,
        gp,
        avg,
        balAvg,
        sd,
        cv,
        display: getName(v[0])
      };
    },
    d => d[map.player_id]
  );

  // shape as array
  let data = roll.map(([player_id, obj]) => ({ player_id, ...obj }));

  // sort by current sort state
  data.sort(comparator(sortState.key, sortState.asc));

  // (optional) slice top 20 AFTER sorting
  data = data.slice(0, 20);

  // render rows
  els.tableBody.innerHTML = "";
  if (!data.length) {
    els.tableBody.innerHTML = `<tr><td colspan="8">No results — adjust filters.</td></tr>`;
    return;
  }

  for (const r of data) {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => {
      console.log("Row clicked:", r.player_id);
    });

    // --- BEGIN MODIFICATION ✅ Player cell with thumbnail (extra context lines included) ---
    const nameTd = document.createElement("td");
    const nameWrap = document.createElement("div");
    nameWrap.className = "cell-flex";

    const img = document.createElement("img");
    img.className = "thumb";
    // find original v[0] row for headshot; we only stored display in r
    // use players array + name match (safe enough for display image)
    const rowForPic = players.find(d => getName(d) === r.display);
    img.src = rowForPic ? safeHeadshotUrl(rowForPic) : "./img/player_placeholder.png";
    img.alt = r.display;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = r.display;

    nameWrap.appendChild(img);
    nameWrap.appendChild(nameSpan);
    nameTd.appendChild(nameWrap);
    tr.appendChild(nameTd);
    // --- END MODIFICATION ✅ ---


    // Player cell is built above…

    /* --- BEGIN MODIFICATION ✅ Team cell with inline SVG badge --- */
    const teamTd = document.createElement("td");
    const teamWrap = document.createElement("div");
    teamWrap.className = "cell-flex";

    const badge = document.createElement("img");
    badge.className = "teambadge";
    badge.alt = r.team || "";
    const badgeSrc = teamBadgeUrl(r.team);
    if (badgeSrc) {
      badge.src = badgeSrc;
    } else {
      badge.style.display = "none";
    }

    const teamSpan = document.createElement("span");
    teamSpan.textContent = r.team || "—";

    teamWrap.appendChild(badge);
    teamWrap.appendChild(teamSpan);
    teamTd.appendChild(teamWrap);
    ////tr.appendChild(teamTd);
    /* --- END MODIFICATION ✅ --- */

// existing lines above…
////const teamTd = document.createElement("td");
teamTd.textContent = r.team || "—";
/* --- BEGIN MODIFICATION ✅ make team cell clickable to team.html --- */
teamTd.style.cursor = "pointer";
teamTd.title = "Open team page";
teamTd.addEventListener("click", (e) => {
  e.stopPropagation();
  if (r.team) location.href = `./team.html?team=${encodeURIComponent(r.team)}`;
});
/* --- END MODIFICATION ✅ --- */
tr.appendChild(teamTd);
// existing lines below…


    const gpTd = document.createElement("td");
    gpTd.textContent = r.gp;
    tr.appendChild(gpTd);

    const avgTd = document.createElement("td");
    avgTd.textContent = r.avg.toFixed(1);
    tr.appendChild(avgTd);

    const balTd = document.createElement("td");
    balTd.textContent = r.balAvg.toFixed(1);
    balTd.classList.add("adv-col");
    balTd.style.display = "none";
    tr.appendChild(balTd);

    const sdTd = document.createElement("td");
    sdTd.textContent = r.sd.toFixed(1);
    sdTd.classList.add("adv-col");
    sdTd.style.display = "none";
    tr.appendChild(sdTd);

    const cvTd = document.createElement("td");
    cvTd.textContent = r.cv.toFixed(1);
    cvTd.classList.add("adv-col");
    cvTd.style.display = "none";
    tr.appendChild(cvTd);

    const valTd = document.createElement("td");
    valTd.textContent = r.value;
    tr.appendChild(valTd);

    els.tableBody.appendChild(tr);
  }
}

/* ================= Helpers ================= */
let advVisible = false;

document.getElementById("toggleAdvanced")?.addEventListener("click", () => {
  advVisible = !advVisible;

  document.querySelectorAll(".adv-col").forEach(col =>
    col.style.display = advVisible ? "table-cell" : "none"
  );

  document.getElementById("toggleAdvanced").textContent =
    advVisible ? "Hide Advanced Stats" : "Show Advanced Stats";
});

function detectNumericMetrics(rows) { /* unused here; kept for reference */ }
function labelize2(s) { return (s+"").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function uniq(arr) { return [...new Set(arr)]; }
function toNum(x) { const n = +x; return Number.isFinite(n) ? n : null; }
function mostCommon(arr) {
  const m = d3.rollup(arr, v => v.length, d => d);
  let best = null, cnt = -1;
  for (const [k, v] of m) { if (v > cnt) { best = k; cnt = v; } }
  return best;
}
function debounce(fn, ms=180) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

function syncPillActive() {
  document.querySelectorAll('.pill.conf, .pill.div, #btnNFL').forEach(el => el.classList.remove('active'));
  if (state.conf === 'AFC') document.querySelector('.pill.conf[data-conf="AFC"]')?.classList.add('active');
  if (state.conf === 'NFC') document.querySelector('.pill.conf[data-conf="NFC"]')?.classList.add('active');
  if (state.conf === 'ALL') document.getElementById('btnNFL')?.classList.add('active');
  if (state.div === 'ALL') {
    document.querySelector('.pill.div[data-div="ALL"]')?.classList.add('active');
  } else {
    document.querySelector(`.pill.div[data-div="${state.div}"]`)?.classList.add('active');
  }
}


function safeHeadshotUrl(row) {
  const url = row?.[map.headshot_url];
  return url && String(url).startsWith("http") ? url : "./img/player_placeholder.png";
}

// Kick off
init();
