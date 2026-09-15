import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  audioConversionArguments,
  audioDownloadArguments,
  ProgramRunner,
  transcribeWithWhisper,
  whisperArguments,
} from "../src/whisper";

test("downloads audio only for URL transcription", () => {
  const args = audioDownloadArguments("https://example.com/video", "C:\\temp\\whisper");
  assert.ok(args.includes("ba/bestaudio"));
  assert.ok(!args.includes("--write-subs"));
  assert.ok(!args.includes("--write-auto-subs"));
  assert.equal(args.at(-1), "https://example.com/video");
});

test("converts to Whisper's compact WAV input", () => {
  assert.deepEqual(audioConversionArguments("source.webm", "audio.wav"), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "source.webm",
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    "audio.wav",
  ]);
});

test("asks Whisper for clean text and SRT timestamps", () => {
  const args = whisperArguments(
    { executable: "whisper-cli", modelPath: "C:\\models\\ggml-base.bin", language: "auto" },
    "audio.wav",
    "transcript",
  );
  assert.deepEqual(args, [
    "-m",
    "C:\\models\\ggml-base.bin",
    "-f",
    "audio.wav",
    "-l",
    "auto",
    "-otxt",
    "-osrt",
    "-of",
    "transcript",
  ]);
});

test("removes all Whisper working files after a local transcription", async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "video-transcript-test-"));
  try {
    const videoPath = join(fixtureDirectory, "video.mp4");
    const modelPath = join(fixtureDirectory, "model.bin");
    await Promise.all([writeFile(videoPath, "video"), writeFile(modelPath, "model")]);

    let whisperDirectory = "";
    const runner: ProgramRunner = async (program, args) => {
      if (program === "ffmpeg") {
        await writeFile(args.at(-1)!, "wav");
        return { stdout: "", stderr: "" };
      }
      if (program === "whisper-cli") {
        const output = args[args.indexOf("-of") + 1];
        whisperDirectory = dirname(output);
        await writeFile(`${output}.srt`, "1\n00:00:00,000 --> 00:00:01,000\nLocal pipeline test.\n");
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected program: ${program}`);
    };

    const result = await transcribeWithWhisper(
      { kind: "file", path: videoPath },
      { executable: "whisper-cli", modelPath, language: "auto" },
      runner,
    );

    assert.equal(result.transcript, "Local pipeline test.");
    assert.equal(existsSync(whisperDirectory), false);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});
