import * as d3Module from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
const d3 = d3Module;
const params = new URLSearchParams(location.search);
const player_id = params.get("player_id");
const season = +params.get("season") || null;


const csv = "./data/playerdata.csv";
const metrics = ["passing_yards","passing_tds","rushing_yards","rushing_tds","receiving_yards","receiving_tds","targets","receptions"];
let currentMetric = metrics[0];
let data = [];

const defaultMetric = localStorage.getItem("metricChoice") || "passing_yards";
const metrics = ["passing_yards","passing_tds","rushing_yards","rushing_tds","receiving_yards","receiving_tds","targets","receptions"];
let currentMetric = defaultMetric;

init();


async function init(){
const all = await d3.csv(csv, d3.autoType);
data = all.filter(d => (!season || d.season===season) && d.player_id===player_id);
if(data.length===0){ document.getElementById("playerName").textContent = "Player not found"; return; }


const d0 = data[0];
document.getElementById("playerName").textContent = d0.player_display_name || d0.player_name || d0.player_id;
document.getElementById("playerTeam").textContent = d0.team;
document.getElementById("playerPos").textContent = d0.position;
document.getElementById("playerSeason").textContent = d0.season;
document.getElementById("headshot").style.backgroundImage = d0.headshot_url ? `url(${d0.headshot_url})` : "none";
document.getElementById("headshot").style.backgroundSize = "cover";


const tabs = document.getElementById("metricTabs");
metrics.filter(m=> data.some(x => (x[m]||0)>0)).forEach((m,i)=>{
const t=document.createElement("div");
t.className = "tab" + (i===0?" active":"");
t.textContent = labelize(m);
t.onclick = ()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); currentMetric=m; draw(); };
tabs.appendChild(t);
});

const desired = labelize(defaultMetric).toLowerCase();
const tabEls = [...document.querySelectorAll('#metricTabs .tab')];
const match = tabEls.find(t => t.textContent.toLowerCase() === desired);
if (match) {
  match.click();
} else if (tabEls.length) {
  tabEls[0].click();
}

document.getElementById("compareLink").href = `./index.html`;
draw();
}



function draw(){
const weeks = [...new Set(data.map(d=>d.week))].sort((a,b)=>a-b);
const series = weeks.map(w => ({week:w, value:d3.sum(data.filter(d=>d.week===w), x=>x[currentMetric]||0)}));
const el = document.getElementById("chart"); el.innerHTML = "";
const W=700,H=280,M={top:20,right:20,bottom:30,left:40};
const svg=d3.select(el).append("svg").attr("viewBox",`0 0 ${W} ${H}`);
const x=d3.scaleLinear().domain(d3.extent(series,d=>d.week)).range([M.left,W-M.right]);
const y=d3.scaleLinear().domain([0,d3.max(series,d=>d.value)||1]).nice().range([H-M.bottom,M.top]);
svg.append("g").attr("transform",`translate(0,${H-M.bottom})`).call(d3.axisBottom(x).ticks(10).tickFormat(d=>`W${d}`));
svg.append("g").attr("transform",`translate(${M.left},0)`).call(d3.axisLeft(y));
const line=d3.line().x(d=>x(d.week)).y(d=>y(d.value));
svg.append("path").datum(series).attr("fill","none").attr("stroke","#3182ce").attr("stroke-width",2).attr("d",line);
svg.selectAll("circle").data(series).join("circle").attr("cx",d=>x(d.week)).attr("cy",d=>y(d.value)).attr("r",3).append("title").text(d=>`${labelize(currentMetric)}: ${d.value}`);
}
function labelize(s){ return s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }