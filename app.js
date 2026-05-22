const MIN_DIGIT = 1;
const MAX_DIGIT = 8;
const SIDE_LEN = 4;
const MAX_PARTY_MOVES = 500;

const inputA = document.getElementById("side-a");
const inputB = document.getElementById("side-b");
const errorA = document.getElementById("error-a");
const errorB = document.getElementById("error-b");
const calcBtn = document.getElementById("calc-btn");
const resultsSummary = document.getElementById("results-summary");
const finaleSummaryList = document.getElementById("finale-summary-list");
const detailsBtn = document.getElementById("details-btn");
const resultsDetails = document.getElementById("results-details");
const resultsBody = document.getElementById("results-body");
const resultsFoot = document.getElementById("results-foot");
const resultsHint = document.getElementById("results-hint");

let detailsExpanded = false;

const inputs = [inputA, inputB];

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
  return candidate > best.move;
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

  resultsBody.innerHTML = parties
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

  resultsFoot.innerHTML = `
    <tr class="totals">
      <td colspan="4">Итого выигрыш A / B</td>
      <td>${totalA} / ${totalB}</td>
    </tr>
  `;
}

function validateInputs() {
  const parsedA = parseSide(inputA.value);
  const parsedB = parseSide(inputB.value);

  setFieldError(errorA, inputA, parsedA.ok ? "" : parsedA.message);
  setFieldError(errorB, inputB, parsedB.ok ? "" : parsedB.message);

  return { parsedA, parsedB, bothOk: parsedA.ok && parsedB.ok };
}

function clearResults(message) {
  resultsHint.hidden = false;
  resultsHint.textContent = message;
  resultsSummary.hidden = true;
  detailsBtn.hidden = true;
  setDetailsExpanded(false);
  resultsBody.innerHTML = "";
  resultsFoot.innerHTML = "";
  finaleSummaryList.innerHTML = "";
}

function calculateAndRender() {
  const { parsedA, parsedB, bothOk } = validateInputs();

  if (!bothOk) {
    clearResults("Исправьте ввод на обеих сторонах и нажмите СЧИТАЕМ.");
    return;
  }

  resultsHint.hidden = true;
  renderResults(calculate(parsedA.digits, parsedB.digits));
}

inputs.forEach((el) => {
  el.addEventListener("input", () => {
    sanitizeInput(el);
    validateInputs();
  });
});

calcBtn.addEventListener("click", calculateAndRender);

detailsBtn.addEventListener("click", () => {
  setDetailsExpanded(!detailsExpanded);
});

clearResults("Введите числа и нажмите СЧИТАЕМ.");
