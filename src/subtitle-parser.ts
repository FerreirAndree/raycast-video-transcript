type Json3Event = {
  segs?: Array<{ utf8?: string }>;
};

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
    if (normalizedCue.startsWith(normalizedPrevious) && !hasPunctuation(previous)) {
      result[result.length - 1] = cue;
      continue;
    }

    const overlap = overlapWordCount(previous, cue);
    if (overlap > 0 && overlap < words(cue).length && !hasPunctuation(previous)) {
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
