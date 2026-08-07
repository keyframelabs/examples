import { expect, it } from "vitest";

import { advanceSuggestedSpeechProgress, matchSuggestedSpeech } from "@/lib/speechMatching";

it("advances from the current word and accepts an immediate retry", () => {
  const target = "Tengo una llanta.";
  const firstWord = advanceSuggestedSpeechProgress("tengo", target, 0);
  const incorrectWord = advanceSuggestedSpeechProgress("uno", target, firstWord.matchedWordCount);
  const retriedWord = advanceSuggestedSpeechProgress("una", target, incorrectWord.matchedWordCount);
  const complete = advanceSuggestedSpeechProgress("llanta", target, retriedWord.matchedWordCount);

  expect(firstWord).toMatchObject({ matchedWordCount: 1, complete: false });
  expect(incorrectWord).toMatchObject({ matchedWordCount: 1, complete: false });
  expect(retriedWord).toMatchObject({ matchedWordCount: 2, complete: false });
  expect(complete).toMatchObject({ matchedWordCount: 3, complete: true });
});

it("keeps numeric matching while advancing from a prior word", () => {
  expect(advanceSuggestedSpeechProgress("305", "Diga trescientos cinco ahora.", 1)).toMatchObject({
    matchedWordCount: 3,
    complete: false
  });
});

it("matches representative Spanish speech without accepting partial answers", () => {
  const target = "Tengo una llanta pinchada. ¿Puede ayudarme?";
  const cases: Array<[string, number, boolean]> = [
    ["tengo una llanta pinchada puede ayudarme", 6, true],
    ["TÉNGO una llanta pinchadaa puede ayudarme", 6, true],
    ["tengo una rueda llanta pinchada puede ayudarme", 6, true],
    ["tengo llanta una pinchada puede ayudarme", 2, false],
    ["tengo una llanta", 3, false],
    ["necesito ayuda", 0, false],
    ["", 0, false]
  ];
  for (const [spoken, words, complete] of cases) {
    expect(matchSuggestedSpeech(spoken, target)).toMatchObject({
      matchedWordCount: words,
      complete
    });
  }
});

it.each([
  ["305", "305"],
  ["3 0 5", "305"],
  ["3 0 05", "305"],
  ["trescientos cinco", "305"],
  ["tres cero cinco", "305"],
  ["305", "trescientos cinco"],
  ["tres cero cinco", "trescientos cinco"],
  ["quince mil", "15000"],
  ["quince mil", "15.000"],
  ["cinco", "005"],
  ["diez", "10"],
  ["dieciséis", "16"],
  ["veintidós", "22"],
  ["veinte y dos", "22"],
  ["treinta y una", "31"],
  ["trescientas cinco", "305"],
  ["doscientas cuarenta y dos", "242"],
  ["mil uno", "1001"],
  ["ciento cinco mil seis", "105006"],
  ["novecientos noventa y nueve mil novecientos noventa y nueve", "999999"]
])("matches Spanish integer form %j against %j", (spoken, target) => {
  expect(matchSuggestedSpeech(spoken, target)).toMatchObject({ complete: true });
});

it("counts the target's visible words when a number uses a different spoken form", () => {
  expect(matchSuggestedSpeech("305", "trescientos cinco")).toMatchObject({
    complete: true,
    matchedWordCount: 2,
    targetWordCount: 2
  });
});

it.each([
  ["306", "305"],
  ["35", "305"],
  ["3005", "305"],
  ["Tengo un llanta", "Tengo una llanta"],
  ["quince coma cincuenta", "15,50"],
  ["quince", "15 €"],
  ["quince", "$ 15"],
  ["quince", "-15"],
  ["tres cero cinco", "3:05"],
  ["un millón", "1000000"]
])("rejects unsupported or unequal number form %j against %j", (spoken, target) => {
  expect(matchSuggestedSpeech(spoken, target).complete).toBe(false);
});

it("still matches identical out-of-range and decimal literals exactly", () => {
  expect(matchSuggestedSpeech("1000000", "1000000").complete).toBe(true);
  expect(matchSuggestedSpeech("15,50", "15,50").complete).toBe(true);
  expect(matchSuggestedSpeech("15 €", "15 €").complete).toBe(true);
  expect(matchSuggestedSpeech("-15", "-15").complete).toBe(true);
});
