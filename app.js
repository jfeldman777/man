const MIN_DIGIT = 1;
const MAX_DIGIT = 8;
const SIDE_LEN = 4;
const MAX_PARTY_MOVES = 500;

const inputA = document.getElementById("side-a");
const errorA = document.getElementById("error-a");
const bRowsList = document.getElementById("b-rows");
const calcBtn = document.getElementById("calc-btn");
const resultsSummary = document.getElementById("results-summary");
const finaleSummaryList = document.getElementById("finale-summary-list");
const detailsBtn = document.getElementById("details-btn");
const resultsDetails = document.getElementById("results-details");
const resultsBody = document.getElementById("results-body");
const resultsFoot = document.getElementById("results-foot");
const resultsHint = document.getElementById("results-hint");
const batchResults = document.getElementById("batch-results");
const singleResults = document.getElementById("single-results");
const showQuadsBtn = document.getElementById("show-quads-btn");
const quadsPanel = document.getElementById("quads-panel");
const quadsGrid = document.getElementById("quads-grid");
const quadsSelectedCount = document.getElementById("quads-selected-count");
const conflictFreeBtn = document.getElementById("conflict-free-btn");
const warMatrixBtn = document.getElementById("war-matrix-btn");
const playSelect = document.getElementById("play-select");
const helpBtn = document.getElementById("help-btn");
const helpDialog = document.getElementById("help-dialog");

let detailsExpanded = false;
let bRowIdCounter = 0;
let quadsGridBuilt = false;
/** @type {Record<string, string>} */
let quadHints = {};
/** @type {{ name: string, entries: { code: string, name: string }[] }[]} */
let quadPlays = [];
/** @type {{ name: string, characters: { names: string[], notes: { score: number, text: string }[] }[] }[]} */
let playComments = [];

/** 38 четвёрок: цифры 1–8, все разные, по возрастанию, сумма чётная */
const ALL_EVEN_QUADS = (() => {
  const list = [];
  for (let a = MIN_DIGIT; a <= MAX_DIGIT; a++) {
    for (let b = a + 1; b <= MAX_DIGIT; b++) {
      for (let c = b + 1; c <= MAX_DIGIT; c++) {
        for (let d = c + 1; d <= MAX_DIGIT; d++) {
          if ((a + b + c + d) % 2 === 0) {
            list.push(`${a}${b}${c}${d}`);
          }
        }
      }
    }
  }
  return list;
})();

function otherSide(side) {
  return side === "A" ? "B" : "A";
}

function sideAtMoveIndex(startSide, index) {
  return index % 2 === 0 ? startSide : otherSide(startSide);
}

function sanitizeInput(el) {
  const digits = el.value.replace(/\D/g, "").slice(0, SIDE_LEN);
  if (el.value !== digits) el.value = digits;
}

/**
 * @returns {{ ok: true, digits: number[] } | { ok: false, message: string }}
 */
function parseSide(raw) {
  const s = String(raw).trim();

  if (s.length === 0) {
    return { ok: false, message: "Введите 4 цифры" };
  }
  if (s.length < SIDE_LEN) {
    return { ok: false, message: `Нужно 4 цифры (сейчас ${s.length})` };
  }

  const digits = [...s].map((ch) => Number(ch));

  for (const d of digits) {
    if (d < MIN_DIGIT || d > MAX_DIGIT) {
      return { ok: false, message: `Цифры только от ${MIN_DIGIT} до ${MAX_DIGIT}` };
    }
  }

  const unique = new Set(digits);
  if (unique.size !== SIDE_LEN) {
    return { ok: false, message: "На стороне цифры не должны повторяться" };
  }

  return { ok: true, digits };
}

function setFieldError(errorEl, inputEl, message) {
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    inputEl.classList.add("invalid");
  } else {
    errorEl.textContent = "";
    errorEl.hidden = true;
    inputEl.classList.remove("invalid");
  }
}

/** Очки за пару двух ходов подряд (предыдущий → следующий) */
function pairPoints(prevNum, prevSide, nextNum, nextSide) {
  if (prevNum === nextNum) {
    return { scores: { A: 2, B: 2 }, type: "competition" };
  }

  let sideSmall;
  let sideLarge;
  if (prevNum < nextNum) {
    sideSmall = prevSide;
    sideLarge = nextSide;
  } else {
    sideSmall = nextSide;
    sideLarge = prevSide;
  }

  const small = Math.min(prevNum, nextNum);
  const large = Math.max(prevNum, nextNum);

  const scores = { A: 0, B: 0 };

  if (large === small + 1) {
    scores[sideSmall] = 3;
    scores[sideLarge] = 4;
    return { scores, type: "cooperation" };
  }

  scores[sideSmall] = 1;
  scores[sideLarge] = -100;
  return { scores, type: "war" };
}

/** Очки по числам сторон A и B в паре (для финала) */
function scorePair(aNum, bNum) {
  if (aNum === bNum) {
    return { A: 2, B: 2 };
  }
  if (Math.abs(aNum - bNum) === 1) {
    if (aNum < bNum) return { A: 3, B: 4 };
    return { A: 4, B: 3 };
  }
  if (aNum < bNum) return { A: 1, B: -100 };
  return { A: -100, B: 1 };
}

const PAIR_TYPE_RANK = { cooperation: 2, competition: 1, war: 0 };

function isBetterMove(candidate, gain, type, best) {
  if (!best) return true;
  if (gain > best.gain) return true;
  if (gain < best.gain) return false;
  const typeRank = PAIR_TYPE_RANK[type] ?? 0;
  const bestTypeRank = PAIR_TYPE_RANK[best.type] ?? 0;
  if (typeRank !== bestTypeRank) return typeRank > bestTypeRank;
  return candidate < best.move;
}

/** Тип финальной пары по последним ходам сторон A и B */
function describePartyFinale(lastA, lastB) {
  if (lastA == null || lastB == null) {
    return { pair: "—", label: "—" };
  }

  const pts = scorePair(lastA, lastB);
  const pair = `(A,B) = (${lastA}, ${lastB})`;

  if (lastA === lastB) {
    return { pair, label: "конкуренция" };
  }

  if (Math.abs(lastA - lastB) === 1) {
    const elderSide = lastA > lastB ? "A" : "B";
    return { pair, label: `кооперация, старший ${elderSide}` };
  }

  const loser = pts.A === -100 ? "A" : "B";
  return { pair, label: `война, проиграл ${loser}` };
}

function getSideLastMoves(moves, startSide) {
  let lastA = null;
  let lastB = null;
  for (let i = 0; i < moves.length; i++) {
    const s = sideAtMoveIndex(startSide, i);
    if (s === "A") lastA = moves[i];
    else lastB = moves[i];
  }
  return { lastA, lastB };
}

/** Ключ позиции: последний ход A и последний ход B */
function positionKey(lastA, lastB) {
  return `${lastA},${lastB}`;
}

/** Позиция уже была — конец партии (66 ≠ повтор, 666 = та же позиция снова) */
function registerPosition(moves, startSide, seenPositions) {
  const { lastA, lastB } = getSideLastMoves(moves, startSide);
  if (lastA == null || lastB == null) return false;

  const key = positionKey(lastA, lastB);
  if (seenPositions.has(key)) return true;
  seenPositions.add(key);
  return false;
}

function chooseMove(pool, side, lastNum, lastSide) {
  let best = null;

  for (const candidate of pool) {
    const { scores, type } = pairPoints(lastNum, lastSide, candidate, side);
    const gain = scores[side];
    if (isBetterMove(candidate, gain, type, best)) {
      best = { move: candidate, gain, type };
    }
  }

  return best.move;
}

/**
 * @param {number} startNum
 * @param {"A"|"B"} startSide
 * @param {number[]} poolA
 * @param {number[]} poolB
 */
function playParty(startNum, startSide, poolA, poolB) {
  const moves = [startNum];
  const scores = { A: 0, B: 0 };
  const seenPositions = new Set();
  let endReason = "";

  let turn = otherSide(startSide);
  let steps = 0;

  while (!endReason && steps < MAX_PARTY_MOVES) {
    const pool = turn === "A" ? poolA : poolB;
    const lastIdx = moves.length - 1;
    const lastNum = moves[lastIdx];
    const lastSide = sideAtMoveIndex(startSide, lastIdx);

    const next = chooseMove(pool, turn, lastNum, lastSide);
    moves.push(next);

    const { scores: pts } = pairPoints(lastNum, lastSide, next, turn);
    scores.A += pts.A;
    scores.B += pts.B;

    if (scores.A <= -100 || scores.B <= -100) {
      endReason = "война";
    } else if (registerPosition(moves, startSide, seenPositions)) {
      endReason = "повторение ходов";
    } else {
      turn = otherSide(turn);
      steps++;
    }
  }

  if (!endReason && steps >= MAX_PARTY_MOVES) {
    endReason = "лимит ходов";
  }

  const { lastA, lastB } = getSideLastMoves(moves, startSide);
  const finale = describePartyFinale(lastA, lastB);

  return {
    startNum,
    startSide,
    moves,
    scores,
    endReason,
    lastA,
    lastB,
    finale,
  };
}

function calculate(sideA, sideB) {
  const parties = [];

  for (let i = 0; i < SIDE_LEN; i++) {
    parties.push({
      index: i + 1,
      startSide: "A",
      startNum: sideA[i],
      ...playParty(sideA[i], "A", sideA, sideB),
    });
  }

  for (let i = 0; i < SIDE_LEN; i++) {
    parties.push({
      index: SIDE_LEN + i + 1,
      startSide: "B",
      startNum: sideB[i],
      ...playParty(sideB[i], "B", sideA, sideB),
    });
  }

  const totalA = parties.reduce((s, p) => s + p.scores.A, 0);
  const totalB = parties.reduce((s, p) => s + p.scores.B, 0);

  return { parties, totalA, totalB };
}

function pluralRaz(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "раз";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "раза";
  return "раз";
}

function countFinaleLabels(parties) {
  const counts = new Map();
  for (const p of parties) {
    const { label } = p.finale;
    if (label === "—") continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function variantLabel(code) {
  return `В${code}`;
}

function getBRowElements() {
  return [...bRowsList.querySelectorAll(".b-row")];
}

function getBInputs() {
  return getBRowElements().map((row) => row.querySelector(".b-row-input"));
}

function createIconButton(label, title, className) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `row-btn ${className}`;
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  return btn;
}

function addBRow(value = "") {
  const id = ++bRowIdCounter;
  const row = document.createElement("div");
  row.className = "b-row";
  row.dataset.rowId = String(id);

  const label = document.createElement("span");
  label.className = "b-row-label";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "b-row-input";
  input.inputMode = "numeric";
  input.maxLength = SIDE_LEN;
  input.placeholder = "5678";
  input.value = value;
  input.autocomplete = "off";

  const error = document.createElement("span");
  error.className = "field-error b-row-error";
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "b-row-actions";

  const field = document.createElement("div");
  field.className = "b-row-field";
  field.append(label, input, error);

  row.append(field, actions);
  bRowsList.appendChild(row);

  input.addEventListener("input", () => {
    sanitizeInput(input);
    validateAllBRows();
  });

  updateBRowButtons();
  updateBRowLabels();
  return row;
}

function removeBRow(row) {
  if (getBRowElements().length <= 1) return;
  row.remove();
  updateBRowButtons();
  updateBRowLabels();
  validateAllBRows();
}

function updateBRowLabels() {
  getBRowElements().forEach((row, index) => {
    row.querySelector(".b-row-label").textContent =
      getBRowElements().length > 1 ? `Вариант B ${index + 1}` : "Четырёхзначное число";
  });
}

function updateBRowButtons() {
  const rows = getBRowElements();
  const count = rows.length;

  rows.forEach((row, index) => {
    const actions = row.querySelector(".b-row-actions");
    actions.innerHTML = "";
    const isFirst = index === 0;
    const isLast = index === count - 1;

    if (count === 1) {
      const addBtn = createIconButton("+", "Добавить вариант B", "row-btn-add");
      addBtn.addEventListener("click", () => addBRow());
      actions.appendChild(addBtn);
      return;
    }

    if (isLast && !isFirst) {
      const addBtn = createIconButton("+", "Добавить вариант B", "row-btn-add");
      addBtn.addEventListener("click", () => addBRow());
      const removeBtn = createIconButton("−", "Убрать вариант", "row-btn-remove");
      removeBtn.addEventListener("click", () => removeBRow(row));
      actions.appendChild(addBtn);
      actions.appendChild(removeBtn);
      return;
    }

    if (!isFirst && !isLast) {
      const removeBtn = createIconButton("−", "Убрать вариант", "row-btn-remove");
      removeBtn.addEventListener("click", () => removeBRow(row));
      actions.appendChild(removeBtn);
    }
  });
}

function validateAllBRows() {
  let allOk = true;
  getBRowElements().forEach((row) => {
    const input = row.querySelector(".b-row-input");
    const error = row.querySelector(".b-row-error");
    const parsed = parseSide(input.value);
    if (!parsed.ok) {
      allOk = false;
      error.textContent = parsed.message;
      error.hidden = false;
      input.classList.add("invalid");
    } else {
      error.textContent = "";
      error.hidden = true;
      input.classList.remove("invalid");
    }
  });
  return allOk;
}

function getValidatedBCodes() {
  const codes = [];
  let allOk = true;

  getBRowElements().forEach((row) => {
    const input = row.querySelector(".b-row-input");
    const parsed = parseSide(input.value);
    if (!parsed.ok) allOk = false;
    else codes.push(input.value.trim());
  });

  return { codes, allOk };
}

/** Коды B только из непустых полей ввода */
function getBCodesFromFields() {
  const codes = [];
  let allOk = true;
  let hasAny = false;

  getBRowElements().forEach((row) => {
    const input = row.querySelector(".b-row-input");
    const raw = input.value.trim();
    if (raw.length === 0) return;

    hasAny = true;
    const parsed = parseSide(raw);
    if (!parsed.ok) allOk = false;
    else codes.push(raw);
  });

  return { codes, allOk, hasAny };
}

function getSelectedQuadCodes() {
  return [...quadsGrid.querySelectorAll(".quad-btn.is-active")]
    .map((btn) => btn.dataset.code)
    .sort();
}

function updateQuadsSelectedCount() {
  const n = getSelectedQuadCodes().length;
  quadsSelectedCount.textContent = n > 0 ? ` Выбрано: ${n}.` : "";
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePlayName(name) {
  return name.trim().toLowerCase();
}

function parsePlayCommentsText(text) {
  /** @type {{ name: string, characters: { names: string[], notes: { score: number, text: string }[] }[] }[]} */
  const plays = [];
  /** @type {{ name: string, characters: { names: string[], notes: { score: number, text: string }[] }[] } | null} */
  let currentPlay = null;
  /** @type {{ names: string[], notes: { score: number, text: string }[] }[]} */
  let currentGroups = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("===")) {
      const noteMatch = trimmed.match(/^===\s*(\d+)\s*(?:[-=–]\s*|\s+)(.+)$/);
      if (noteMatch && currentGroups.length > 0) {
        const note = {
          score: Number(noteMatch[1]),
          text: noteMatch[2].trim(),
        };
        for (const group of currentGroups) {
          group.notes.push(note);
        }
      }
      continue;
    }

    if (trimmed.startsWith("==")) {
      const charLine = trimmed.replace(/^==\s*/, "").replace(/\s*=\s*$/, "").trim();
      if (!charLine || !currentPlay) continue;

      const names = charLine.split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) continue;

      const group = { names, notes: [] };
      currentPlay.characters.push(group);
      currentGroups = [group];
      continue;
    }

    if (trimmed.startsWith("=")) {
      const playName = trimmed.replace(/^=\s*/, "").replace(/\s*=\s*$/, "").trim();
      if (!playName || playName.toLowerCase() === "конец") continue;
      if (currentPlay) plays.push(currentPlay);
      currentPlay = { name: playName, characters: [] };
      currentGroups = [];
    }
  }

  if (currentPlay) plays.push(currentPlay);
  return plays;
}

function findPlayComments(playName) {
  const key = normalizePlayName(playName);
  return playComments.find((p) => normalizePlayName(p.name) === key);
}

function findQuadPlay(playName) {
  const key = normalizePlayName(playName);
  return quadPlays.find((p) => normalizePlayName(p.name) === key);
}

function codeForCharacterName(charName, names, codes) {
  if (!names) return "";
  for (const code of codes) {
    if (normalizePlayName(names[code]) === normalizePlayName(charName)) {
      return code;
    }
  }
  return "";
}

function formatCommentGroupTitle(groupNames, names, codes) {
  const codesForHeroes = groupNames
    .map((hero) => codeForCharacterName(hero, names, codes))
    .filter(Boolean);
  const uniqueCodes = [...new Set(codesForHeroes)];

  if (uniqueCodes.length === 1 && groupNames.length > 1) {
    return `${groupNames.join(", ")} ${uniqueCodes[0]}`;
  }

  return groupNames
    .map((hero) => {
      const code = codeForCharacterName(hero, names, codes);
      return code ? `${hero} ${code}` : hero;
    })
    .join(", ");
}

function getPlayCommentsByLevel(playName, names, codes) {
  const commentPlay = findPlayComments(playName);
  if (!commentPlay) return [];

  /** @type {Map<number, { heroes: string, text: string }[]>} */
  const byLevel = new Map();

  for (const group of commentPlay.characters) {
    const heroTitle = formatCommentGroupTitle(group.names, names, codes);
    for (const note of group.notes) {
      if (!byLevel.has(note.score)) {
        byLevel.set(note.score, []);
      }
      byLevel.get(note.score).push({ heroes: heroTitle, text: note.text });
    }
  }

  return [...byLevel.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([level, items]) => ({ level, items }));
}

function buildPlayCommentsHtml(playName, names, codes) {
  const levels = getPlayCommentsByLevel(playName, names, codes);
  if (levels.length === 0) return "";

  const levelBlocks = levels
    .map(({ level, items }) => {
      const rows = items
        .map(
          (item) =>
            `<li class="play-comment-level-item"><span class="play-comment-heroes">${escapeHtml(item.heroes)}</span><span class="play-comment-sep">—</span><span class="play-comment-text">${escapeHtml(item.text)}</span></li>`
        )
        .join("");

      return `
        <article class="play-comment-level">
          <h4 class="play-comment-level-title">Уровень ${level}</h4>
          <ul class="play-comment-level-list">${rows}</ul>
        </article>
      `;
    })
    .join("");

  return `
    <section class="play-comments" aria-labelledby="play-comments-title">
      <h3 id="play-comments-title" class="play-comments-heading">Комментарии по уровням</h3>
      <div class="play-comments-levels">${levelBlocks}</div>
    </section>
  `;
}

async function loadPlayComments() {
  try {
    const response = await fetch("play-comments.txt", { cache: "no-store" });
    if (response.ok) {
      playComments = parsePlayCommentsText(await response.text());
    }
  } catch {
    playComments = [];
  }
}

async function loadPlayData() {
  await Promise.all([loadQuadHints(), loadPlayComments()]);
}

function parseQuadHintsText(text) {
  const hints = {};
  /** @type {{ name: string, entries: { code: string, name: string }[] }[]} */
  const plays = [];
  /** @type {{ name: string, entries: { code: string, name: string }[] } | null} */
  let currentPlay = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const section = trimmed.match(/^=\s*(.+?)\s*=$/);
    if (section) {
      const sectionName = section[1].trim();
      if (sectionName.toLowerCase() === "конец") {
        if (currentPlay && currentPlay.entries.length > 0) {
          plays.push(currentPlay);
        }
        currentPlay = null;
        continue;
      }
      if (currentPlay && currentPlay.entries.length > 0) {
        plays.push(currentPlay);
      }
      currentPlay = { name: sectionName, entries: [] };
      continue;
    }

    const match = trimmed.match(/^(\d{4})\s*[-=–]\s*(.+)$/);
    if (match) {
      const code = match[1];
      const name = match[2].trim();
      hints[code] = name;
      if (currentPlay) {
        currentPlay.entries.push({ code, name });
      }
    }
  }

  if (currentPlay && currentPlay.entries.length > 0) {
    plays.push(currentPlay);
  }

  return { hints, plays };
}

function populatePlaySelect() {
  if (!playSelect) return;

  const prev = playSelect.value;
  playSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— выберите пьесу —";
  playSelect.appendChild(placeholder);

  for (let i = 0; i < quadPlays.length; i++) {
    const play = quadPlays[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${play.name} (${consolidatePlayEntries(play.entries).length})`;
    playSelect.appendChild(opt);
  }

  if (prev && playSelect.querySelector(`option[value="${prev}"]`)) {
    playSelect.value = prev;
  }
}

async function loadQuadHints() {
  try {
    const response = await fetch("quad-hints.txt", { cache: "no-store" });
    if (response.ok) {
      const parsed = parseQuadHintsText(await response.text());
      quadHints = parsed.hints;
      quadPlays = parsed.plays;
      populatePlaySelect();
    }
  } catch {
    quadHints = {};
    quadPlays = [];
    populatePlaySelect();
  }
}

function createQuadButton(code) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "quad-btn";
  btn.dataset.code = code;
  btn.setAttribute("aria-pressed", "false");

  btn.textContent = code;
  const hint = quadHints[code];
  if (hint) {
    btn.classList.add("quad-btn-has-hint");
    btn.title = hint;
    btn.setAttribute("aria-label", `${code}, ${hint}`);
  } else {
    btn.title = "?";
    btn.setAttribute("aria-label", `${code}, ?`);
  }

  btn.addEventListener("click", () => {
    const on = btn.classList.toggle("is-active");
    btn.setAttribute("aria-pressed", String(on));
    updateQuadsSelectedCount();
  });

  return btn;
}

function buildQuadsGrid(force = false) {
  if (quadsGridBuilt && !force) return;
  quadsGridBuilt = true;
  quadsGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();
  for (const code of ALL_EVEN_QUADS) {
    fragment.appendChild(createQuadButton(code));
  }
  quadsGrid.appendChild(fragment);
}

/**
 * @param {{ preferFields?: boolean }} options
 * preferFields: для СЧИТАЕМ — если в полях B есть число, не брать выбранные четвёрки
 */
function getBCodesForCalculate(options = {}) {
  const { preferFields = false } = options;
  const fields = getBCodesFromFields();
  const selectedQuads = getSelectedQuadCodes();

  if (preferFields && fields.hasAny) {
    return { codes: fields.codes, fromQuads: false, allOk: fields.allOk };
  }

  if (selectedQuads.length > 0) {
    return { codes: selectedQuads, fromQuads: true, allOk: true };
  }

  return { codes: fields.codes, fromQuads: false, allOk: fields.allOk };
}

function formatFinaleCountsHtml(counts) {
  if (counts.length === 0) return "<li>—</li>";
  return counts
    .map(([label, n]) => `<li>${label} — ${n} ${pluralRaz(n)}</li>`)
    .join("");
}

function hideSingleResults() {
  singleResults.hidden = true;
  resultsSummary.hidden = true;
  detailsBtn.hidden = true;
}

function showSingleResults() {
  singleResults.hidden = false;
  batchResults.hidden = true;
  batchResults.innerHTML = "";
}

function buildPartiesRowsHtml(parties) {
  return parties
    .map(
      (p) => `
        <tr>
          <td>${p.index}</td>
          <td>${p.startNum} (${p.startSide})</td>
          <td>${p.finale.pair}</td>
          <td class="finale-name">${p.finale.label}</td>
          <td>${p.scores.A} / ${p.scores.B}</td>
        </tr>
      `
    )
    .join("");
}

function buildPartiesTableHtml(data) {
  const { parties, totalA, totalB } = data;
  return `
    <div class="table-wrap">
      <table class="results-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Начальный ход</th>
            <th>Финальные ходы</th>
            <th>Финал партии</th>
            <th>Выигрыш A / B</th>
          </tr>
        </thead>
        <tbody>${buildPartiesRowsHtml(parties)}</tbody>
        <tfoot>
          <tr class="totals">
            <td colspan="4">Итого выигрыш A / B</td>
            <td>${totalA} / ${totalB}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function partyHasWar(party) {
  return (
    party.finale.label.startsWith("война") || party.endReason === "война"
  );
}

function formatSigned(n) {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

/** Выигрыш row (как A) против col (как B) — сумма очков A только в партиях с войной */
function warGainBetween(rowDigits, colDigits) {
  const { parties } = calculate(rowDigits, colDigits);
  let gain = 0;
  let warCount = 0;

  for (const party of parties) {
    if (partyHasWar(party)) {
      warCount++;
      gain += party.scores.A;
    }
  }

  return { gain, warCount, partyCount: parties.length };
}

function buildWarMatrix(codes) {
  const parsed = codes.map((code) => ({ code, ...parseSide(code) }));
  const matrix = [];

  for (let i = 0; i < parsed.length; i++) {
    const row = [];
    for (let j = 0; j < parsed.length; j++) {
      if (i === j) {
        row.push({ gain: 0, warCount: 0, partyCount: 0 });
      } else {
        row.push(warGainBetween(parsed[i].digits, parsed[j].digits));
      }
    }
    matrix.push(row);
  }

  return { parsed, matrix };
}

function quadMatrixLabel(code, names) {
  const name = names?.[code] ?? quadHints[code];
  return name ? `${code} (${name})` : code;
}

function warMatrixColLabel(code, names) {
  const name = names?.[code] ?? quadHints[code];
  if (name) {
    return `<span class="war-matrix-axis war-matrix-axis-col"><span class="war-matrix-char">${escapeHtml(name)}</span><span class="war-matrix-code">${code}</span></span>`;
  }
  return `<span class="war-matrix-axis war-matrix-axis-col"><span class="war-matrix-code">${code}</span></span>`;
}

function warMatrixRowLabel(code, names) {
  const name = names?.[code] ?? quadHints[code];
  if (name) {
    return `<span class="war-matrix-axis war-matrix-axis-row">${escapeHtml(name)} ${code}</span>`;
  }
  return `<span class="war-matrix-axis war-matrix-axis-row">${code}</span>`;
}

function characterName(code, names) {
  return names?.[code] ?? quadHints[code] ?? code;
}

function buildWarMatrixHtml(codes, matrixData, names) {
  const { matrix } = matrixData;
  const headerCells = codes
    .map((code) => `<th scope="col" class="war-matrix-col-head">${warMatrixColLabel(code, names)}</th>`)
    .join("");

  const bodyRows = codes
    .map((rowCode, i) => {
      const cells = matrix[i]
        .map((cell, j) => {
          if (i === j) {
            return '<td class="war-matrix-diag">0</td>';
          }
          const colCode = codes[j];
          const title = `${rowCode} (${characterName(rowCode, names)}) против ${colCode} (${characterName(colCode, names)}): ${cell.warCount} ${pluralVoyna(cell.warCount)} из ${cell.partyCount} партий`;
          return `<td class="war-matrix-cell" title="${escapeHtml(title)}">${formatSigned(cell.gain)}</td>`;
        })
        .join("");
      return `<tr><th scope="row" class="war-matrix-row-head">${warMatrixRowLabel(rowCode, names)}</th>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="table-wrap war-matrix-wrap">
      <table class="war-matrix">
        <thead>
          <tr>
            <th scope="col" class="war-matrix-corner"></th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function renderWarMatrix(codes, options = {}) {
  hideSingleResults();
  batchResults.hidden = false;

  const names = options.names ?? null;
  const matrixData = buildWarMatrix(codes);
  const labels = codes.map((code) => quadMatrixLabel(code, names)).join(", ");
  const playTitle = options.playName ? ` — «${options.playName}»` : "";
  const commentsHtml =
    options.playName && buildPlayCommentsHtml(options.playName, names, codes);

  batchResults.innerHTML = `
    <p class="batch-intro war-matrix-intro">
      Матрица войн${playTitle}: ${codes.length} четвёрок. Ячейка — выигрыш строки против столбца (сумма очков A только в партиях с войной). Диагональ — 0.
    </p>
    <p class="batch-codes-line">${escapeHtml(labels)}</p>
    ${buildWarMatrixHtml(codes, matrixData, names)}
    ${commentsHtml || ""}
  `;
}

function calculateWarMatrixAndRender() {
  const selected = getSelectedQuadCodes();

  if (selected.length < 2) {
    clearResults("Матрица войн: выберите минимум 2 четвёрки из 38.");
    return;
  }

  if (playSelect) playSelect.value = "";
  resultsHint.hidden = true;
  renderWarMatrix(selected);
}

function consolidatePlayEntries(entries) {
  const byCode = new Map();

  for (const { code, name } of entries) {
    if (!byCode.has(code)) {
      byCode.set(code, { code, names: [name] });
      continue;
    }
    const group = byCode.get(code);
    const exists = group.names.some(
      (n) => normalizePlayName(n) === normalizePlayName(name)
    );
    if (!exists) group.names.push(name);
  }

  return [...byCode.values()].map(({ code, names }) => ({
    code,
    name: names.join(", "),
  }));
}

function renderPlayWarMatrix(playIndex) {
  const play = quadPlays[Number(playIndex)];
  if (!play) return;

  const consolidated = consolidatePlayEntries(play.entries);

  if (consolidated.length < 2) {
    clearResults(`«${play.name}»: нужно минимум 2 разных четвёрки у персонажей.`);
    return;
  }

  const codes = consolidated.map((e) => e.code);
  const names = Object.fromEntries(consolidated.map((e) => [e.code, e.name]));

  resultsHint.hidden = true;
  renderWarMatrix(codes, { playName: play.name, names });
}

function pluralVoyna(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "война";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "войны";
  return "войн";
}

function renderBatchResults(items, options = {}) {
  hideSingleResults();
  batchResults.hidden = false;

  const intro = options.intro
    ? `<p class="batch-intro">${options.intro}</p>`
    : "";

  const codesLine = options.codesLine
    ? `<p class="batch-codes-line">${options.codesLine}</p>`
    : "";

  batchResults.innerHTML =
    intro +
    codesLine +
    items
    .map((item) => {
      if (item.error) {
        return `
          <section class="batch-block batch-block-error">
            <h3 class="batch-title">${variantLabel(item.code)}</h3>
            <p class="batch-error">${item.error}</p>
          </section>
        `;
      }
      return `
        <section class="batch-block">
          <h3 class="batch-title">${variantLabel(item.code)}</h3>
          <ul class="totals-finale-list">${formatFinaleCountsHtml(item.counts)}</ul>
          <button type="button" class="details-btn batch-details-btn" aria-expanded="false">
            ПОДРОБНЕЕ
          </button>
          <div class="batch-details is-collapsed">
            ${buildPartiesTableHtml(item.data)}
          </div>
        </section>
      `;
    })
    .join("");
}

function calculateConflictFreeAndRender() {
  const parsedA = parseSide(inputA.value);
  setFieldError(errorA, inputA, parsedA.ok ? "" : parsedA.message);

  if (!parsedA.ok) {
    clearResults("Задайте корректную сторону A и нажмите БЕСКОНФЛИКТНЫЕ.");
    return;
  }

  const peaceful = [];

  for (const code of ALL_EVEN_QUADS) {
    const parsedB = parseSide(code);
    if (!parsedB.ok) continue;

    const data = calculate(parsedA.digits, parsedB.digits);
    if (!data.parties.some(partyHasWar)) {
      peaceful.push({
        code,
        counts: countFinaleLabels(data.parties),
        data,
      });
    }
  }

  if (peaceful.length === 0) {
    clearResults(
      `Среди ${ALL_EVEN_QUADS.length} четвёрок для данной A нет бесконфликтных вариантов B.`
    );
    return;
  }

  resultsHint.hidden = true;
  renderBatchResults(peaceful, {
    intro: `Бесконфликтные: ${peaceful.length} из ${ALL_EVEN_QUADS.length} (ни в одной из 8 партий нет войны)`,
    codesLine: peaceful.map((p) => p.code).join(", "),
  });
}

function calculateAllVariants(sideA, variantCodes) {
  return variantCodes.map((code) => {
    const parsed = parseSide(code);
    if (!parsed.ok) {
      return { code, error: parsed.message };
    }
    const data = calculate(sideA, parsed.digits);
    return { code, counts: countFinaleLabels(data.parties), data };
  });
}

function setDetailsExpanded(expanded) {
  detailsExpanded = expanded;
  resultsDetails.classList.toggle("is-collapsed", !expanded);
  detailsBtn.textContent = expanded ? "СКРЫТЬ" : "ПОДРОБНЕЕ";
  detailsBtn.setAttribute("aria-expanded", String(expanded));
}

function renderResults(data) {
  const { parties, totalA, totalB } = data;
  const finaleCounts = countFinaleLabels(parties);

  const finaleSummary = finaleCounts
    .map(([label, n]) => `<li>${label} — ${n} ${pluralRaz(n)}</li>`)
    .join("");

  finaleSummaryList.innerHTML = finaleSummary || "<li>—</li>";
  resultsSummary.hidden = false;
  detailsBtn.hidden = false;
  setDetailsExpanded(false);

  resultsBody.innerHTML = buildPartiesRowsHtml(parties);

  resultsFoot.innerHTML = `
    <tr class="totals">
      <td colspan="4">Итого выигрыш A / B</td>
      <td>${totalA} / ${totalB}</td>
    </tr>
  `;
}

function validateInputs() {
  const parsedA = parseSide(inputA.value);
  setFieldError(errorA, inputA, parsedA.ok ? "" : parsedA.message);
  const bSource = getBCodesForCalculate();
  const rowsOk = bSource.fromQuads || validateAllBRows();

  return {
    parsedA,
    bCodes: bSource.codes,
    bothOk:
      parsedA.ok &&
      rowsOk &&
      bSource.allOk &&
      bSource.codes.length > 0,
  };
}

function clearResults(message) {
  resultsHint.hidden = false;
  resultsHint.textContent = message;
  batchResults.hidden = true;
  batchResults.innerHTML = "";
  showSingleResults();
  resultsSummary.hidden = true;
  detailsBtn.hidden = true;
  setDetailsExpanded(false);
  resultsBody.innerHTML = "";
  resultsFoot.innerHTML = "";
  finaleSummaryList.innerHTML = "";
}

function calculateAndRender() {
  const parsedA = parseSide(inputA.value);
  setFieldError(errorA, inputA, parsedA.ok ? "" : parsedA.message);

  if (!parsedA.ok) {
    clearResults("Исправьте сторону A и нажмите СЧИТАЕМ.");
    return;
  }

  const bSource = getBCodesForCalculate({ preferFields: true });

  if (!bSource.fromQuads) {
    validateAllBRows();
    if (!bSource.allOk) {
      clearResults("Исправьте варианты B в полях или выберите четвёрки.");
      return;
    }
  }

  const bCodes = bSource.codes;
  if (bCodes.length === 0) {
    clearResults("Выберите четвёрки кнопками или введите варианты B.");
    return;
  }

  resultsHint.hidden = true;

  if (bCodes.length === 1) {
    const parsedB = parseSide(bCodes[0]);
    showSingleResults();
    setDetailsExpanded(false);
    renderResults(calculate(parsedA.digits, parsedB.digits));
    return;
  }

  renderBatchResults(calculateAllVariants(parsedA.digits, bCodes));
}

inputA.addEventListener("input", () => {
  sanitizeInput(inputA);
  validateInputs();
});

calcBtn.addEventListener("click", calculateAndRender);

conflictFreeBtn.addEventListener("click", calculateConflictFreeAndRender);

warMatrixBtn.addEventListener("click", async () => {
  await loadPlayData();
  calculateWarMatrixAndRender();
});

if (playSelect) {
  playSelect.addEventListener("change", async () => {
    const idx = playSelect.value;
    if (idx === "") return;
    await loadPlayData();
    renderPlayWarMatrix(idx);
  });
}

helpBtn.addEventListener("click", () => {
  if (typeof helpDialog.showModal === "function") {
    helpDialog.showModal();
  }
});

helpDialog.querySelector(".help-dialog-close").addEventListener("click", () => {
  helpDialog.close();
});

helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) helpDialog.close();
});

showQuadsBtn.addEventListener("click", async () => {
  const hidden = quadsPanel.classList.toggle("is-collapsed");
  if (!hidden) {
    await loadPlayData();
    buildQuadsGrid(true);
    updateQuadsSelectedCount();
    showQuadsBtn.textContent = "СКРЫТЬ ЧЕТВЁРКИ";
    showQuadsBtn.setAttribute("aria-expanded", "true");
  } else {
    showQuadsBtn.textContent = "ПОКАЗАТЬ ВСЕ ЧЕТВЁРКИ";
    showQuadsBtn.setAttribute("aria-expanded", "false");
  }
});

detailsBtn.addEventListener("click", () => {
  setDetailsExpanded(!detailsExpanded);
});

batchResults.addEventListener("click", (event) => {
  const btn = event.target.closest(".batch-details-btn");
  if (!btn) return;

  const block = btn.closest(".batch-block");
  const details = block.querySelector(".batch-details");
  const expanded = details.classList.toggle("is-collapsed");
  const isOpen = !expanded;

  btn.textContent = isOpen ? "СКРЫТЬ" : "ПОДРОБНЕЕ";
  btn.setAttribute("aria-expanded", String(isOpen));
});

addBRow("");
loadPlayData();
clearResults("Введите числа и нажмите СЧИТАЕМ.");
