export interface AiTextParts {
  content: string;
  reasoning: string;
}

type Mode = "content" | "reasoning" | "drop";
type LabelDelimiter = "colon" | "message" | "none";

interface LabelRead {
  label: string;
  next: number;
  delimiter: LabelDelimiter;
}

// A channel/role label is a short ascii identifier — anything longer or
// containing spaces/newlines is prose that happened to follow a marker.
const WELL_FORMED_LABEL = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;

// Known label words, longest first. Degraded providers fuse them with the
// following text ("assistantcommentary{", "analysisWe", "finalGiven"), so a
// leading-label check runs on malformed labels too.
const LABEL_WORDS = [
  "assistant",
  "commentary",
  "analysis",
  "reasoning",
  "thinking",
  "developer",
  "answer",
  "system",
  "final",
  "think",
  "user",
  "tool",
];

// matchLeadingLabel splits one fused label prefix from text:
// "analysisWe got" → { label: "analysis", rest: "We got" }. The boundary
// after the word must be an uppercase letter or a non-letter, so prose like
// "finalize" is left alone — except "assistant" which may fuse directly
// into another label word ("assistantfinal", "assistantcommentary").
function matchLeadingLabel(
  text: string,
): { label: string; rest: string } | null {
  const lower = text.toLowerCase();
  for (const word of LABEL_WORDS) {
    if (!lower.startsWith(word)) continue;
    const rest = text.slice(word.length);
    if (rest === "") return { label: word, rest: "" };
    const next = rest.charAt(0);
    if (!/[a-z\s]/.test(next)) {
      return { label: word, rest };
    }
    if (word === "assistant") {
      const rl = rest.toLowerCase();
      if (LABEL_WORDS.some((w) => w !== "assistant" && rl.startsWith(w))) {
        return { label: word, rest };
      }
    }
  }
  return null;
}

// splitLeadingLabels strips every fused label prefix — "assistantanalysisX"
// yields labels ["assistant", "analysis"] and rest "X".
function splitLeadingLabels(text: string): {
  labels: string[];
  rest: string;
} {
  const labels: string[] = [];
  let rest = text;
  for (;;) {
    const m = matchLeadingLabel(rest);
    if (!m) break;
    labels.push(m.label);
    rest = m.rest;
    if (rest === "") break;
  }
  return { labels, rest };
}

// readLabel collects the role/channel label after a "start" token until a
// ':' (reduced variant) or a structural token (canonical form) ends it.
function readLabel(s: string, start: number): LabelRead {
  let i = start;
  let label = "";
  while (i < s.length) {
    const tok = s.indexOf("<|", i);
    const col = s.indexOf(":", i);
    const end = Math.min(tok < 0 ? Infinity : tok, col < 0 ? Infinity : col);
    if (end === Infinity) {
      return { label: label + s.slice(i), next: s.length, delimiter: "none" };
    }
    label += s.slice(i, end);
    if (col === end) {
      return { label, next: end + 1, delimiter: "colon" };
    }
    // Structural token inside the label.
    const close = s.indexOf("|>", tok + 2);
    if (close < 0) {
      return { label, next: s.length, delimiter: "none" };
    }
    const token = s
      .slice(tok + 2, close)
      .trim()
      .toLowerCase();
    i = close + 2;
    if (token === "channel") {
      // Canonical form — the channel name follows and is what classifies.
      label = "";
      continue;
    }
    if (token === "message") {
      return { label, next: i, delimiter: "message" };
    }
    if (token === "start" || token === "end" || token === "return") {
      // Label aborted by a boundary token — keep the accumulated text so the
      // caller can still salvage a fused label prefix from it.
      return { label, next: i, delimiter: "none" };
    }
    // Unknown structural token — keep waiting for the delimiter.
  }
  return { label, next: i, delimiter: "none" };
}

function classifyLabel(label: string): Mode {
  const l = label.trim().toLowerCase();
  if (
    l.includes("analysis") ||
    l.includes("reasoning") ||
    l.includes("think")
  ) {
    return "reasoning";
  }
  if (
    l.includes("commentary") ||
    l.includes("user") ||
    l.includes("system") ||
    l.includes("tool") ||
    l.includes("developer")
  ) {
    return "drop";
  }
  // "assistant", "assistantfinal", "final", "answer" — visible content.
  return "content";
}

// sanitizeAiText parses harmony-style message markup (the gpt-oss format:
// start/end/return tokens and channel labels) that some providers leak
// verbatim into message content instead of decoding it server-side.
// Analysis channels are routed to reasoning, content channels pass through,
// commentary/transcript channels are dropped, and all special tokens are
// stripped. Reduced variants seen in the wild — a bare "analysis" preamble
// and fused labels such as "assistantfinal:" or "analysisWe" — are handled
// as well.
export function sanitizeAiText(raw: string): AiTextParts {
  const content: string[] = [];
  const reasoning: string[] = [];
  let mode: Mode = "content";
  let i = 0;

  const push = (text: string) => pushAs(mode, text);
  const pushAs = (m: Mode, text: string) => {
    if (!text) return;
    if (m === "reasoning") reasoning.push(text);
    else if (m === "content") content.push(text);
  };

  // A bare "analysis"/"commentary" preamble at the very start opens the
  // corresponding channel without any marker — with or without the colon.
  // Without the colon a fused boundary is required ("analysisWe"): a space
  // means ordinary prose ("analysis of…"), a lowercase letter another word.
  const headMatch = raw.match(/^\s*(analysis|commentary)(:?)/i);
  if (headMatch) {
    const after = headMatch[0].length;
    const nextCh = raw.charAt(after);
    const fused = nextCh !== "" && !/[a-z\s]/.test(nextCh);
    if (headMatch[2] === ":" || fused) {
      mode = headMatch[1].toLowerCase() === "commentary" ? "drop" : "reasoning";
      i = after;
    }
  }

  while (i < raw.length) {
    const t = raw.indexOf("<|", i);
    const textEnd = t < 0 ? raw.length : t;
    push(raw.slice(i, textEnd));
    if (t < 0) break;
    const close = raw.indexOf("|>", t + 2);
    if (close < 0) break; // unterminated token — drop the tail
    const token = raw
      .slice(t + 2, close)
      .trim()
      .toLowerCase();
    i = close + 2;
    if (token === "start") {
      const lab = readLabel(raw, i);
      i = lab.next;
      const colonSuffix = lab.delimiter === "colon" ? ":" : "";
      if (lab.delimiter !== "none" && WELL_FORMED_LABEL.test(lab.label)) {
        mode = classifyLabel(lab.label);
        continue;
      }
      // Malformed label — try a fused label prefix ("assistantanalysisWe").
      const { labels, rest } = splitLeadingLabels(lab.label);
      if (labels.length > 0) {
        mode = classifyLabel(labels[labels.length - 1]);
        pushAs(mode, rest + colonSuffix);
      } else {
        // Plain text that happened to follow the marker — keep it.
        if (lab.delimiter !== "none" || !WELL_FORMED_LABEL.test(lab.label)) {
          content.push(lab.label + colonSuffix);
        }
        mode = "content";
      }
    } else if (token === "end" || token === "return") {
      mode = "content";
    }
    // message/channel/call and friends — structural noise, dropped.
  }

  return {
    content: content.join("").trim(),
    reasoning: reasoning.join("").trim(),
  };
}
