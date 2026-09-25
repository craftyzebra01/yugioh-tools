const qInput = document.getElementById("q");
const resultsEl = document.getElementById("results");
const detailEl = document.getElementById("detail");
const metaEl = document.getElementById("meta");
const selectedName = document.getElementById("selected-name");
const selectedMeta = document.getElementById("selected-meta");
const selectedDesc = document.getElementById("selected-desc");
const matchSummary = document.getElementById("match-summary");
const matchesEl = document.getElementById("matches");
const uncertainNote = document.getElementById("uncertain-note");

let searchTimer = 0;
let activeController = null;

async function loadMeta() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    metaEl.textContent = data.ok
      ? `TCG cache · ${data.cardCount.toLocaleString()} cards · DB ${data.databaseVersion ?? "?"}`
      : "Cache unavailable — run npm run ingest";
  } catch {
    metaEl.textContent = "Could not reach API";
  }
}

function formatCardLine(card) {
  const bits = [card.type];
  if (card.race) bits.push(card.race);
  if (card.attribute) bits.push(card.attribute);
  if (card.level != null) bits.push(`Lv${card.level}`);
  return bits.join(" · ");
}

function renderResults(results) {
  resultsEl.innerHTML = "";
  if (!results.length) {
    resultsEl.hidden = true;
    return;
  }
  resultsEl.hidden = false;
  for (const card of results) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<span>${escapeHtml(card.name)}</span><span class="sub">${escapeHtml(formatCardLine(card))}</span>`;
    btn.addEventListener("click", () => {
      resultsEl.hidden = true;
      qInput.value = card.name;
      void selectCard(card.id);
    });
    li.appendChild(btn);
    resultsEl.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function runSearch(q) {
  if (activeController) activeController.abort();
  activeController = new AbortController();
  if (!q.trim()) {
    renderResults([]);
    return;
  }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`, {
    signal: activeController.signal,
  });
  const data = await res.json();
  renderResults(data.results ?? []);
}

async function selectCard(id) {
  detailEl.hidden = false;
  selectedName.textContent = "Loading…";
  selectedMeta.textContent = "";
  selectedDesc.textContent = "";
  matchSummary.textContent = "";
  matchesEl.innerHTML = "";
  uncertainNote.hidden = true;

  const res = await fetch(`/api/cards/${id}/pulls`);
  if (!res.ok) {
    selectedName.textContent = "Card not found";
    return;
  }
  const data = await res.json();
  const src = data.source;
  selectedName.textContent = src.name;
  selectedMeta.textContent = formatCardLine(src);
  selectedDesc.textContent = src.desc ?? "";
  matchSummary.textContent = `${data.matchCount} match${data.matchCount === 1 ? "" : "es"} · flat list · no drill-down`;

  if (data.uncertainClauseCount > 0) {
    uncertainNote.hidden = false;
    uncertainNote.textContent = `${data.uncertainClauseCount} effect clause(s) could not be fully parsed and were not expanded into the list. See docs/matching-coverage.md.`;
  }

  if (!data.matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      data.clauseCount === 0
        ? "No pull clauses detected on this card’s effect text."
        : "No matching cards in the TCG pool for the parsed criteria.";
    matchesEl.appendChild(empty);
    return;
  }

  for (const m of data.matches) {
    const li = document.createElement("li");
    // v1: listed matches are not clickable for drill-down
    li.innerHTML = `<span class="match-name">${escapeHtml(m.name)}</span><span class="match-loc">${escapeHtml((m.locations || []).join(" / "))}</span>`;
    matchesEl.appendChild(li);
  }
}

qInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void runSearch(qInput.value);
  }, 180);
});

qInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    resultsEl.hidden = true;
  }
});

void loadMeta();
