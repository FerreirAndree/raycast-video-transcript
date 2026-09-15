import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateCues, parseSubtitleTranscript } from "../src/subtitle-parser";

test("parses VTT cues and removes markup", () => {
  const vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n<c.yellow>Hello &amp; welcome.</c>\n\n00:00:01.000 --> 00:00:02.000\n<v Speaker>It is good to be here.</v>`;
  assert.equal(parseSubtitleTranscript(vtt), "Hello & welcome. It is good to be here.");
});

test("parses SRT cues", () => {
  const srt = `1\n00:00:00,000 --> 00:00:01,000\nFirst line.\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond line.`;
  assert.equal(parseSubtitleTranscript(srt, "srt"), "First line. Second line.");
});

test("collapses rolling automatic captions", () => {
  assert.deepEqual(
    deduplicateCues(["This is", "This is a rolling", "This is a rolling caption.", "The next sentence."]),
    ["This is a rolling caption.", "The next sentence."],
  );
});

test("merges an overlapping unpunctuated cue", () => {
  assert.deepEqual(deduplicateCues(["we need to test", "to test this parser", "this parser today"]), [
    "we need to test this parser today",
  ]);
});

test("parses json3 subtitle events", () => {
  const json3 = JSON.stringify({
    events: [{ segs: [{ utf8: "Hello " }, { utf8: "world!" }] }, { segs: [{ utf8: "Again." }] }],
  });
  assert.equal(parseSubtitleTranscript(json3, "json3"), "Hello world! Again.");
});
