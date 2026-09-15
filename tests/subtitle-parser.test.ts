import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateCues,
  formatTimestamp,
  parseSubtitleTranscript,
  parseTimestampedTranscript,
} from "../src/subtitle-parser";

test("parses VTT cues and removes markup", () => {
  const vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n<c.yellow>Hello &amp; welcome.</c>\n\n00:00:01.000 --> 00:00:02.000\n<v Speaker>It is good to be here.</v>`;
  assert.equal(parseSubtitleTranscript(vtt), "Hello & welcome. It is good to be here.");
});

test("parses SRT cues", () => {
  const srt = `1\n00:00:00,000 --> 00:00:01,000\nFirst line.\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond line.`;
  assert.equal(parseSubtitleTranscript(srt, "srt"), "First line. Second line.");
});

test("adds compact timestamps to cleaned cues", () => {
  const vtt = `WEBVTT\n\n00:01:02.000 --> 00:01:04.000\nA timed caption.`;
  assert.equal(parseTimestampedTranscript(vtt), "[01:02] A timed caption.");
  assert.equal(formatTimestamp(3_661_000), "01:01:01");
});

test("collapses rolling automatic captions", () => {
  assert.deepEqual(
    deduplicateCues(["This is", "This is a rolling", "This is a rolling caption.", "The next sentence."]),
    ["This is a rolling caption.", "The next sentence."],
  );
});

test("ignores YouTube's near-zero-duration bridge cues", () => {
  const vtt = `WEBVTT

00:00:00.080 --> 00:00:01.750
This is the complete guide to using

00:00:01.750 --> 00:00:01.760
This is the complete guide to using

00:00:01.760 --> 00:00:04.950
This is the complete guide to using codecs with GPT6.`;
  assert.equal(parseSubtitleTranscript(vtt), "This is the complete guide to using codecs with GPT6.");
});

test("merges an overlapping unpunctuated cue", () => {
  assert.deepEqual(deduplicateCues(["we need to test", "to test this parser", "this parser today"]), [
    "we need to test this parser today",
  ]);
});

test("removes the repeated lead-in from rolling captions after punctuation", () => {
  assert.deepEqual(
    deduplicateCues([
      "However, I could say, looks like this.",
      "However, I could say, okay, please push it to prod.",
      "And we will see the changes in code.",
      "And we will see the changes in just a second.",
    ]),
    [
      "However, I could say, looks like this.",
      "okay, please push it to prod.",
      "And we will see the changes in code.",
      "in just a second.",
    ],
  );
});

test("parses json3 subtitle events", () => {
  const json3 = JSON.stringify({
    events: [{ segs: [{ utf8: "Hello " }, { utf8: "world!" }] }, { segs: [{ utf8: "Again." }] }],
  });
  assert.equal(parseSubtitleTranscript(json3, "json3"), "Hello world! Again.");
});
