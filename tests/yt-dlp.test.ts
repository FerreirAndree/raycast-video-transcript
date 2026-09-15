import assert from "node:assert/strict";
import test from "node:test";
import { chooseTrack } from "../src/yt-dlp";

test("prefers an original-language track over a plain language variant", () => {
  const track = chooseTrack(
    {
      subtitles: {
        en: [{}],
        "en-orig": [{}],
      },
    },
    "en",
  );

  assert.deepEqual(track, { language: "en-orig", kind: "manual" });
});

test("still prefers manual subtitles over automatic original captions", () => {
  const track = chooseTrack(
    {
      subtitles: { en: [{}] },
      automatic_captions: { "en-orig": [{}] },
    },
    "en",
  );

  assert.deepEqual(track, { language: "en", kind: "manual" });
});

test("treats an original marker as the same requested language", () => {
  const track = chooseTrack(
    {
      subtitles: {
        pt: [{}],
        "pt-PT-orig": [{}],
        en: [{}],
      },
    },
    "pt-PT",
  );

  assert.deepEqual(track, { language: "pt-PT-orig", kind: "manual" });
});
