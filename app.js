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
const helpBtn = document.getElementById("help-btn");
const helpDialog = document.getElementById("help-dialog");

let detailsExpanded = false;
let bRowIdCounter = 0;
let quadsGridBuilt = false;

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

function getSelectedQuadCodes() {
  return [...quadsGrid.querySelectorAll(".quad-btn.is-active")]
    .map((btn) => btn.dataset.code)
    .sort();
}

function updateQuadsSelectedCount() {
  const n = getSelectedQuadCodes().length;
  quadsSelectedCount.textContent = n > 0 ? ` Выбрано: ${n}.` : "";
}

function buildQuadsGrid() {
  if (quadsGridBuilt) return;
  quadsGridBuilt = true;

  const fragment = document.createDocumentFragment();
  for (const code of ALL_EVEN_QUADS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quad-btn";
    btn.dataset.code = code;
    btn.textContent = code;
    btn.title = `Вариант B: ${code}`;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const on = btn.classList.toggle("is-active");
      btn.setAttribute("aria-pressed", String(on));
      updateQuadsSelectedCount();
    });
    fragment.appendChild(btn);
  }
  quadsGrid.appendChild(fragment);
}

function getBCodesForCalculate() {
  const selectedQuads = getSelectedQuadCodes();
  if (selectedQuads.length > 0) {
    return { codes: selectedQuads, fromQuads: true, allOk: true };
  }

  const { codes, allOk } = getValidatedBCodes();
  return { codes, fromQuads: false, allOk };
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

  const bSource = getBCodesForCalculate();

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

showQuadsBtn.addEventListener("click", () => {
  const hidden = quadsPanel.classList.toggle("is-collapsed");
  if (!hidden) {
    buildQuadsGrid();
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
clearResults("Введите числа и нажмите СЧИТАЕМ.");
