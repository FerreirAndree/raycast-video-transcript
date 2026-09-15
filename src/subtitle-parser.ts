type Json3Event = {
  segs?: Array<{ utf8?: string }>;
  tStartMs?: number;
};

type TimedCue = { text: string; startTimeMs: number };

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) => {
      const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      return entities[entity];
    });
}

function cleanCue(value: string): string {
  return decodeEntities(
    value
      .replace(/<\/?(?:c(?:\.[^ >]+)?|v(?: [^>]*)?|lang(?: [^>]*)?|b|i|u|ruby|rt)>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/\r/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function vttCues(input: string): string[] {
  const blocks = input.replace(/^\uFEFF?WEBVTT[^\n]*\n?/i, "").split(/\n\s*\n/);
  const cues: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    const timingLine = lines.findIndex((line) => line.includes("-->"));
    if (timingLine === -1) continue;

    const timing = lines[timingLine].match(
      /^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})/,
    );
    if (timing && timestampToMilliseconds(timing[2]) - timestampToMilliseconds(timing[1]) < 50) continue;

    const text = cleanCue(lines.slice(timingLine + 1).join(" "));
    if (text) cues.push(text);
  }

  return cues;
}

function json3Cues(input: string): string[] {
  const parsed = JSON.parse(input) as { events?: Json3Event[] };
  return (parsed.events ?? [])
    .map((event) => cleanCue((event.segs ?? []).map((segment) => segment.utf8 ?? "").join("")))
    .filter(Boolean);
}

function words(value: string): string[] {
  return value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

function hasPunctuation(value: string): boolean {
  return /[.!?…]["')\]]?$/.test(value.trim());
}

function overlapWordCount(previous: string, next: string): number {
  const previousWords = words(previous);
  const nextWords = words(next);
  const max = Math.min(previousWords.length, nextWords.length);

  for (let count = max; count > 0; count -= 1) {
    if (previousWords.slice(-count).join(" ") === nextWords.slice(0, count).join(" ")) return count;
  }

  return 0;
}

function commonPrefixWordCount(previous: string, next: string): number {
  const previousWords = words(previous);
  const nextWords = words(next);
  const max = Math.min(previousWords.length, nextWords.length);
  let count = 0;
  while (count < max && previousWords[count] === nextWords[count]) count += 1;
  return count;
}

/** Merge rolling automatic-caption cues without discarding genuinely new speech. */
export function deduplicateCues(cues: string[]): string[] {
  const result: string[] = [];

  for (const rawCue of cues) {
    const cue = cleanCue(rawCue);
    if (!cue) continue;

    const previous = result.at(-1);
    if (!previous) {
      result.push(cue);
      continue;
    }

    const normalizedCue = cue.toLocaleLowerCase();
    const normalizedPrevious = previous.toLocaleLowerCase();
    if (normalizedCue === normalizedPrevious || normalizedPrevious.startsWith(normalizedCue)) continue;
    if (normalizedCue.startsWith(normalizedPrevious)) {
      result[result.length - 1] = cue;
      continue;
    }

    const sharedStart = commonPrefixWordCount(previous, cue);
    if (sharedStart >= 3) {
      const cueWords = cue.split(/\s+/);
      const sharedWord = words(cue)[sharedStart - 1];
      const bridgeWords = new Set([
        "a",
        "an",
        "the",
        "to",
        "of",
        "in",
        "on",
        "at",
        "for",
        "with",
        "from",
        "by",
        "and",
        "or",
        "but",
      ]);
      const tail = cueWords.slice(bridgeWords.has(sharedWord) ? sharedStart - 1 : sharedStart).join(" ");
      if (tail) result.push(tail);
      continue;
    }

    const overlap = overlapWordCount(previous, cue);
    const minimumOverlap = hasPunctuation(previous) ? 3 : 1;
    if (overlap >= minimumOverlap && overlap < words(cue).length) {
      result[result.length - 1] = `${previous} ${cue.split(/\s+/).slice(overlap).join(" ")}`;
      continue;
    }

    result.push(cue);
  }

  return result;
}

function paragraphize(text: string): string {
  const sentences = text.match(/[^.!?…]+[.!?…]+(?:["')\]]+)?|[^.!?…]+$/g)?.map((sentence) => sentence.trim()) ?? [];
  if (sentences.length < 3) return text;

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(" "));
  }
  return paragraphs.join("\n\n");
}

/** Convert WebVTT or YouTube-style json3 to plain, readable transcript text. */
export function parseSubtitleTranscript(input: string, extension?: string): string {
  const trimmed = input.trim();
  const isJson = extension?.toLowerCase() === "json3" || trimmed.startsWith("{");
  const cues = isJson ? json3Cues(trimmed) : vttCues(trimmed);
  const transcript = deduplicateCues(cues)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return paragraphize(transcript);
}

function timestampToMilliseconds(value: string): number {
  const parts = value.replace(",", ".").split(":");
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  return Math.round((hours * 60 * 60 + minutes * 60 + seconds) * 1000);
}

function timedVttCues(input: string): TimedCue[] {
  const blocks = input.replace(/^\uFEFF?WEBVTT[^\n]*\n?/i, "").split(/\n\s*\n/);
  const cues: TimedCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    const timingLine = lines.findIndex((line) => line.includes("-->"));
    if (timingLine === -1) continue;
    const timing = lines[timingLine].match(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->/);
    const endTiming = lines[timingLine].match(/-->\s+((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})/);
    if (timing && endTiming && timestampToMilliseconds(endTiming[1]) - timestampToMilliseconds(timing[1]) < 50)
      continue;
    const text = cleanCue(lines.slice(timingLine + 1).join(" "));
    if (timing && text) cues.push({ text, startTimeMs: timestampToMilliseconds(timing[1]) });
  }
  return cues;
}

function timedJson3Cues(input: string): TimedCue[] {
  const parsed = JSON.parse(input) as { events?: Json3Event[] };
  return (parsed.events ?? [])
    .map((event) => ({
      text: cleanCue((event.segs ?? []).map((segment) => segment.utf8 ?? "").join("")),
      startTimeMs: event.tStartMs ?? 0,
    }))
    .filter((cue) => Boolean(cue.text));
}

export function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const twoDigits = (value: number) => value.toString().padStart(2, "0");
  return hours > 0
    ? `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

/** Return the same cleaned caption text with cue start times for reference. */
export function parseTimestampedTranscript(input: string, extension?: string): string {
  const trimmed = input.trim();
  const cues =
    extension?.toLowerCase() === "json3" || trimmed.startsWith("{") ? timedJson3Cues(trimmed) : timedVttCues(trimmed);
  const cleanCues = deduplicateCues(cues.map((cue) => cue.text));
  return cleanCues
    .map((text) => {
      const source = cues.find((cue) => text.startsWith(cue.text) || cue.text.startsWith(text)) ?? cues[0];
      return `[${formatTimestamp(source?.startTimeMs ?? 0)}] ${text}`;
    })
    .join("\n");
}
