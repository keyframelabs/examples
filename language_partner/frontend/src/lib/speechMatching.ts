export type SuggestedSpeechMatch = {
  complete: boolean;
  matchedWordCount: number;
  normalizedSpoken: string;
  normalizedTarget: string;
  targetWordCount: number;
};

type SpeechToken = {
  text: string;
  surfaceWordCount: number;
  integerDigits: string | null;
};

type NumericExpression = {
  consumedTokens: number;
  hasDigits: boolean;
  value: number;
};

const MAX_INTEGER = 999_999;
const directNumbers = new Map<string, number>([
  ["cero", 0], ["un", 1], ["uno", 1], ["una", 1], ["dos", 2], ["tres", 3],
  ["cuatro", 4], ["cinco", 5], ["seis", 6], ["siete", 7], ["ocho", 8], ["nueve", 9],
  ["diez", 10], ["once", 11], ["doce", 12], ["trece", 13], ["catorce", 14], ["quince", 15],
  ["dieciseis", 16], ["diecisiete", 17], ["dieciocho", 18], ["diecinueve", 19], ["veinte", 20],
  ["veintiun", 21], ["veintiuno", 21], ["veintiuna", 21], ["veintidos", 22], ["veintitres", 23],
  ["veinticuatro", 24], ["veinticinco", 25], ["veintiseis", 26], ["veintisiete", 27],
  ["veintiocho", 28], ["veintinueve", 29]
]);
const tens = new Map<string, number>([
  ["treinta", 30], ["cuarenta", 40], ["cincuenta", 50], ["sesenta", 60],
  ["setenta", 70], ["ochenta", 80], ["noventa", 90]
]);
const hundreds = new Map<string, number>([
  ["cien", 100], ["ciento", 100], ["doscientos", 200], ["doscientas", 200],
  ["trescientos", 300], ["trescientas", 300], ["cuatrocientos", 400], ["cuatrocientas", 400],
  ["quinientos", 500], ["quinientas", 500], ["seiscientos", 600], ["seiscientas", 600],
  ["setecientos", 700], ["setecientas", 700], ["ochocientos", 800], ["ochocientas", 800],
  ["novecientos", 900], ["novecientas", 900]
]);
const digitWords = new Map([...directNumbers].filter(([, value]) => value < 10));
const numberWords = new Set([...directNumbers.keys(), ...tens.keys(), ...hundreds.keys(), "mil"]);

function baseNormalize(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

function normalizeSpeech(text: string): string {
  return baseNormalize(text)
    .match(/[\p{L}\p{N}]+/gu)
    ?.join(" ") ?? "";
}

function integerDigits(token: string): string | null {
  if (/^[0-9]+$/u.test(token)) return token;
  const grouped = token.match(/^([0-9]{1,3})([.,])([0-9]{3}(?:\2[0-9]{3})*)$/u);
  return grouped ? `${grouped[1]}${grouped[3].replaceAll(grouped[2], "")}` : null;
}

function speechTokens(text: string): SpeechToken[] {
  const normalized = baseNormalize(text)
    .replace(/(\p{Sc})\s+(?=[+-]?[0-9])/gu, "$1")
    .replace(/([0-9])\s+(?=\p{Sc})/gu, "$1");
  return Array.from(
    normalized.matchAll(/(?:\p{Sc})?[+-]?[0-9]+(?:[.,/:+-][0-9]+)*(?:\p{Sc})?|[\p{L}]+/gu),
    ({ 0: token }) => ({
      text: token,
      surfaceWordCount: token.match(/[\p{L}\p{N}]+/gu)?.length ?? 1,
      integerDigits: integerDigits(token)
    })
  );
}

function parseBelowHundred(tokens: SpeechToken[], start: number): NumericExpression | null {
  const word = tokens[start]?.text;
  if (!word) return null;
  const direct = directNumbers.get(word);
  const ten = tens.get(word);
  if (direct === undefined && ten === undefined) return null;
  const value = direct ?? ten!;
  if (value >= 20 && value % 10 === 0 && tokens[start + 1]?.text === "y") {
    const unit = directNumbers.get(tokens[start + 2]?.text ?? "");
    if (unit !== undefined && unit > 0 && unit < 10) {
      return { consumedTokens: 3, hasDigits: false, value: value + unit };
    }
  }
  return { consumedTokens: 1, hasDigits: false, value };
}

function parseBelowThousand(tokens: SpeechToken[], start: number): NumericExpression | null {
  const hundred = hundreds.get(tokens[start]?.text ?? "");
  if (hundred === undefined) return parseBelowHundred(tokens, start);
  if (tokens[start]?.text === "cien") return { consumedTokens: 1, hasDigits: false, value: hundred };
  const remainder = parseBelowHundred(tokens, start + 1);
  return remainder
    ? { consumedTokens: remainder.consumedTokens + 1, hasDigits: false, value: hundred + remainder.value }
    : { consumedTokens: 1, hasDigits: false, value: hundred };
}

function parseCardinal(tokens: SpeechToken[], start: number): NumericExpression | null {
  if (tokens[start]?.text === "mil") {
    const remainder = parseBelowThousand(tokens, start + 1);
    return {
      consumedTokens: 1 + (remainder?.consumedTokens ?? 0),
      hasDigits: false,
      value: 1_000 + (remainder?.value ?? 0)
    };
  }
  const leading = parseBelowThousand(tokens, start);
  if (!leading) return null;
  if (tokens[start + leading.consumedTokens]?.text !== "mil" || leading.value === 0) return leading;
  const remainder = parseBelowThousand(tokens, start + leading.consumedTokens + 1);
  return {
    consumedTokens: leading.consumedTokens + 1 + (remainder?.consumedTokens ?? 0),
    hasDigits: false,
    value: leading.value * 1_000 + (remainder?.value ?? 0)
  };
}

function numericExpressionsAt(tokens: SpeechToken[], start: number): NumericExpression[] {
  const expressions: NumericExpression[] = [];
  let rawDigits = "";
  let normalizedChunks = "";
  for (let index = start; index < tokens.length && tokens[index].integerDigits !== null; index += 1) {
    const digits = tokens[index].integerDigits!;
    rawDigits += digits;
    normalizedChunks += String(Number(digits));
    for (const value of new Set([Number(rawDigits), Number(normalizedChunks)])) {
      if (value <= MAX_INTEGER) expressions.push({ consumedTokens: index - start + 1, hasDigits: true, value });
    }
  }

  let spokenDigits = "";
  for (let index = start; index < tokens.length && index - start < 6; index += 1) {
    const digit = digitWords.get(tokens[index].text);
    if (digit === undefined) break;
    spokenDigits += String(digit);
    if (index > start) expressions.push({ consumedTokens: index - start + 1, hasDigits: false, value: Number(spokenDigits) });
  }

  const cardinal = parseCardinal(tokens, start);
  if (cardinal && cardinal.value <= MAX_INTEGER) expressions.push(cardinal);
  return expressions;
}

function numericMatch(
  spoken: SpeechToken[],
  spokenStart: number,
  target: SpeechToken[],
  targetStart: number
): { spokenTokens: number; targetTokens: number } | null {
  let best: { spokenTokens: number; targetTokens: number } | null = null;
  for (const targetNumber of numericExpressionsAt(target, targetStart)) {
    for (const spokenNumber of numericExpressionsAt(spoken, spokenStart)) {
      const contextual = targetNumber.hasDigits || spokenNumber.hasDigits
        || targetNumber.consumedTokens > 1 || spokenNumber.consumedTokens > 1 || targetNumber.value !== 1;
      if (!contextual || targetNumber.value !== spokenNumber.value) continue;
      const candidate = {
        spokenTokens: spokenNumber.consumedTokens,
        targetTokens: targetNumber.consumedTokens
      };
      if (!best || candidate.spokenTokens + candidate.targetTokens > best.spokenTokens + best.targetTokens) best = candidate;
    }
  }
  return best;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }

  return previous[right.length];
}

function wordsFuzzilyMatch(spoken: string, target: string): boolean {
  if (spoken === target) return true;
  if (/\p{N}/u.test(spoken) || /\p{N}/u.test(target) || numberWords.has(spoken) || numberWords.has(target)) {
    return false;
  }

  const longestLength = Math.max(spoken.length, target.length);
  const shortestLength = Math.min(spoken.length, target.length);
  if (shortestLength < 4) return false;

  const distance = editDistance(spoken, target);
  const allowedEdits = longestLength <= 5 ? 1 : longestLength <= 8 ? 2 : 3;
  return distance <= allowedEdits && 1 - distance / longestLength >= 0.72;
}

export function advanceSuggestedSpeechProgress(
  spoken: string,
  target: string,
  previousMatchedWordCount: number
): SuggestedSpeechMatch {
  const normalizedSpoken = normalizeSpeech(spoken);
  const normalizedTarget = normalizeSpeech(target);
  const spokenWords = speechTokens(spoken);
  const targetWords = speechTokens(target);
  const targetWordCount = normalizedTarget ? normalizedTarget.split(" ").length : 0;
  const retainedWordCount = Math.min(previousMatchedWordCount, targetWordCount);

  if (!targetWords.length) {
    return {
      complete: false,
      matchedWordCount: 0,
      normalizedSpoken,
      normalizedTarget,
      targetWordCount
    };
  }

  if (!spokenWords.length) {
    return {
      complete: retainedWordCount === targetWordCount,
      matchedWordCount: retainedWordCount,
      normalizedSpoken,
      normalizedTarget,
      targetWordCount
    };
  }

  let matchedWordCount = retainedWordCount;
  let spokenIndex = 0;
  let targetIndex = 0;

  while (
    targetIndex < targetWords.length
    && matchedWordCount >= targetWords[targetIndex].surfaceWordCount
  ) {
    matchedWordCount -= targetWords[targetIndex].surfaceWordCount;
    targetIndex += 1;
  }

  matchedWordCount = retainedWordCount;

  while (targetIndex < targetWords.length) {
    let matchedSpokenIndex = -1;
    let matchedSpokenTokens = 0;
    let matchedTargetTokens = 0;
    for (let candidateIndex = spokenIndex; candidateIndex < spokenWords.length; candidateIndex += 1) {
      const numberMatch = numericMatch(spokenWords, candidateIndex, targetWords, targetIndex);
      if (numberMatch) {
        matchedSpokenIndex = candidateIndex;
        matchedSpokenTokens = numberMatch.spokenTokens;
        matchedTargetTokens = numberMatch.targetTokens;
        break;
      }
      if (wordsFuzzilyMatch(spokenWords[candidateIndex].text, targetWords[targetIndex].text)) {
        matchedSpokenIndex = candidateIndex;
        matchedSpokenTokens = 1;
        matchedTargetTokens = 1;
        break;
      }
    }
    if (matchedSpokenIndex < 0) break;

    matchedWordCount += targetWords
      .slice(targetIndex, targetIndex + matchedTargetTokens)
      .reduce((total, token) => total + token.surfaceWordCount, 0);
    spokenIndex = matchedSpokenIndex + matchedSpokenTokens;
    targetIndex += matchedTargetTokens;
  }

  const complete = targetIndex === targetWords.length;

  return {
    complete,
    matchedWordCount,
    normalizedSpoken,
    normalizedTarget,
    targetWordCount
  };
}

export function matchSuggestedSpeech(spoken: string, target: string): SuggestedSpeechMatch {
  return advanceSuggestedSpeechProgress(spoken, target, 0);
}
