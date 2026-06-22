/**
 * tts.js
 * ------
 * Wraps the browser's native Web Speech API to read diagnosis results
 * aloud in Hindi, for farmers who can't read the on-screen text.
 * Requires zero network access -- works fully offline once voices are
 * cached by the OS (standard on Android 8.0+).
 */

let hindiVoice = null;

function pickHindiVoice() {
  const voices = window.speechSynthesis.getVoices();
  // Prefer an exact Hindi (India) voice, fall back to anything tagged "hi"
  hindiVoice =
    voices.find((v) => v.lang === "hi-IN") ||
    voices.find((v) => v.lang.startsWith("hi")) ||
    null;
  return hindiVoice;
}

// Voice list loads asynchronously on first page visit in some browsers.
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = pickHindiVoice;
  pickHindiVoice();
}

/**
 * Speaks the given Hindi text aloud.
 * @param {string} text - Hindi sentence(s) to read out.
 */
export function speakHindi(text) {
  if (!("speechSynthesis" in window)) {
    console.warn("Web Speech API not supported on this device.");
    return;
  }
  window.speechSynthesis.cancel(); // stop any prior utterance

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "hi-IN";
  if (hindiVoice) utterance.voice = hindiVoice;
  utterance.rate = 0.95; // slightly slower for clarity
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

/** Builds the full spoken sentence from a treatments.json entry. */
export function buildHindiUtterance(entry) {
  const severityWord = { green: "हल्का", yellow: "मध्यम", red: "गंभीर" }[
    entry.severity
  ];
  return `निदान: ${entry.label_hi}. गंभीरता: ${severityWord}. सलाह: ${entry.advice_hi}`;
}
