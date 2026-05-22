const MIN_DIGIT = 1;
const MAX_DIGIT = 8;
const SIDE_LEN = 4;
const MAX_PARTY_MOVES = 500;

const inputA = document.getElementById("side-a");
const inputB = document.getElementById("side-b");
const errorA = document.getElementById("error-a");
const errorB = document.getElementById("error-b");
const calcBtn = document.getElementById("calc-btn");
const resultsBody = document.getElementById("results-body");
const resultsFoot = document.getElementById("results-foot");
const resultsHint = document.getElementById("results-hint");

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

/** Очки за пару (число стороны A, число стороны B) */
function scorePair(a, b) {
  if (a === b) {
    return { A: 2, B: 2 };
  }
  if (Math.abs(a - b) === 1) {
    if (a < b) return { A: 3, B: 4 };
    return { A: 4, B: 3 };
  }
  if (a < b) return { A: 1, B: -100 };
  return { A: -100, B: 1 };
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

function isMoveSequenceRepeating(moves) {
  const n = moves.length;
  if (n < 2) return false;

  for (let period = 1; period <= n / 2; period++) {
    if (n % period !== 0) continue;
    const repeats = n / period;
    if (repeats < 2) continue;

    let ok = true;
    for (let i = 0; i < n; i++) {
      if (moves[i] !== moves[i % period]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function chooseMove(pool, side, lastNum, lastSide) {
  let bestMove = pool[0];
  let bestGain = -Infinity;

  for (const candidate of pool) {
    const aNum = lastSide === "A" ? lastNum : candidate;
    const bNum = lastSide === "A" ? candidate : lastNum;
    const pts = scorePair(aNum, bNum);
    const gain = pts[side];

    if (gain > bestGain || (gain === bestGain && candidate < bestMove)) {
      bestGain = gain;
      bestMove = candidate;
    }
  }

  return bestMove;
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
  let endReason = "";

  if (isMoveSequenceRepeating(moves)) {
    endReason = "повторение ходов";
  }

  let turn = otherSide(startSide);
  let steps = 0;

  while (!endReason && steps < MAX_PARTY_MOVES) {
    const pool = turn === "A" ? poolA : poolB;
    const lastIdx = moves.length - 1;
    const lastNum = moves[lastIdx];
    const lastSide = sideAtMoveIndex(startSide, lastIdx);

    const next = chooseMove(pool, turn, lastNum, lastSide);
    moves.push(next);

    const aNum = lastSide === "A" ? lastNum : next;
    const bNum = lastSide === "A" ? next : lastNum;
    const pts = scorePair(aNum, bNum);
    scores.A += pts.A;
    scores.B += pts.B;

    if (scores.A <= -100 || scores.B <= -100) {
      endReason = "война";
    } else if (isMoveSequenceRepeating(moves)) {
      endReason = "повторение ходов";
    } else {
      turn = otherSide(turn);
      steps++;
    }
  }

  if (!endReason && steps >= MAX_PARTY_MOVES) {
    endReason = "лимит ходов";
  }

  let lastA = null;
  let lastB = null;
  for (let i = 0; i < moves.length; i++) {
    const s = sideAtMoveIndex(startSide, i);
    if (s === "A") lastA = moves[i];
    else lastB = moves[i];
  }

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

function renderResults(data) {
  const { parties, totalA, totalB } = data;
  const finaleCounts = countFinaleLabels(parties);

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

  const finaleSummary = finaleCounts
    .map(([label, n]) => `<li>${label} — ${n} ${pluralRaz(n)}</li>`)
    .join("");

  resultsFoot.innerHTML = `
    <tr class="totals">
      <td colspan="4">Итого выигрыш A / B</td>
      <td>${totalA} / ${totalB}</td>
    </tr>
    <tr class="totals-finale">
      <td colspan="5">
        <div class="totals-finale-title">Итого по финалам</div>
        <ul class="totals-finale-list">${finaleSummary || "<li>—</li>"}</ul>
      </td>
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
  resultsBody.innerHTML = "";
  resultsFoot.innerHTML = "";
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

clearResults("Введите числа и нажмите СЧИТАЕМ.");
