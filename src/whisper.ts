import { spawn } from "node:child_process";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { parseSubtitleTranscript, parseTimestampedTranscript } from "./subtitle-parser";

export type WhisperInput = { kind: "url"; url: string } | { kind: "file"; path: string };

export type WhisperOptions = {
  executable: string;
  modelPath: string;
  language: string;
};

export type WhisperTranscriptResult = {
  title: string;
  transcript: string;
  timestampedTranscript: string;
  language: string;
};

class ProgramError extends Error {
  constructor(
    readonly program: string,
    readonly stderr: string,
    readonly code?: number,
  ) {
    super(`${program} failed.`);
  }
}

export type ProgramRunner = (program: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const runProgram: ProgramRunner = (program, args) => {
  return new Promise((resolve, reject) => {
    const process = spawn(program, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
    process.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    process.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new ProgramError(program, "not found on PATH"));
        return;
      }
      reject(new ProgramError(program, error.message));
    });
    process.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new ProgramError(program, stderr, code ?? undefined));
    });
  });
};

function outputFile(directory: string, baseName: string, extension: string): string {
  return join(directory, `${baseName}.${extension}`);
}

export function audioDownloadArguments(url: string, directory: string): string[] {
  return [
    "--no-playlist",
    "--format",
    "ba/bestaudio",
    "--paths",
    `home:${directory}`,
    "--output",
    "source.%(ext)s",
    "--print",
    "after_move:%(title)s",
    "--no-warnings",
    "--quiet",
    url,
  ];
}

export function audioConversionArguments(input: string, output: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    output,
  ];
}

export function whisperArguments(options: WhisperOptions, input: string, outputBase: string): string[] {
  return ["-m", options.modelPath, "-f", input, "-l", options.language || "auto", "-otxt", "-osrt", "-of", outputBase];
}

function usableFile(file: string): boolean {
  return !file.endsWith(".part") && !file.endsWith(".ytdl") && !file.endsWith(".tmp");
}

async function downloadedAudio(directory: string): Promise<string | undefined> {
  const files = await readdir(directory);
  return files.find((file) => file.startsWith("source.") && usableFile(file));
}

function errorMessage(error: unknown, options: WhisperOptions): string {
  if (!(error instanceof ProgramError))
    return error instanceof Error ? error.message : "Whisper could not transcribe this video.";
  if (error.program === "yt-dlp" && error.stderr.includes("not found"))
    return "yt-dlp is not installed or is not available on PATH.";
  if (error.program === "ffmpeg" && error.stderr.includes("not found"))
    return "ffmpeg is not installed or is not available on PATH.";
  if (error.program === options.executable && error.stderr.includes("not found")) {
    return `Whisper CLI '${options.executable}' was not found on PATH.`;
  }
  if (error.program === "yt-dlp")
    return "yt-dlp could not download audio from this URL. Check that it is public and supported.";
  if (error.program === "ffmpeg") return "ffmpeg could not prepare the audio for Whisper.";
  return "Whisper could not transcribe this video. Check the selected model and try again.";
}

function titleFromOutput(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

function localTitle(path: string): string {
  return basename(path, extname(path)) || "Local Video";
}

export async function transcribeWithWhisper(
  input: WhisperInput,
  options: WhisperOptions,
  runner: ProgramRunner = runProgram,
): Promise<WhisperTranscriptResult> {
  const normalizedOptions = { ...options, executable: options.executable || "whisper-cli" };
  if (!options.modelPath.trim()) throw new Error("Choose a local Whisper model in the extension preferences.");
  try {
    await access(options.modelPath);
  } catch {
    throw new Error("The configured Whisper model file could not be found.");
  }

  if (input.kind === "url") {
    try {
      const parsedUrl = new URL(input.url);
      if (!parsedUrl.protocol.startsWith("http")) throw new Error();
    } catch {
      throw new Error("Enter a complete http:// or https:// video URL.");
    }
  } else {
    try {
      await access(input.path);
    } catch {
      throw new Error("The selected video file could not be found.");
    }
  }

  const directory = await mkdtemp(join(tmpdir(), "raycast-video-whisper-"));
  try {
    let audioPath: string;
    let title: string;
    if (input.kind === "url") {
      const { stdout } = await runner("yt-dlp", audioDownloadArguments(input.url, directory));
      const audioFile = await downloadedAudio(directory);
      if (!audioFile) throw new Error("yt-dlp did not create an audio file for this video.");
      audioPath = join(directory, audioFile);
      title = titleFromOutput(stdout) || "Video Transcript";
    } else {
      audioPath = input.path;
      title = localTitle(input.path);
    }

    const wavPath = outputFile(directory, "audio", "wav");
    await runner("ffmpeg", audioConversionArguments(audioPath, wavPath));

    const outputBase = join(directory, "transcript");
    await runner(normalizedOptions.executable, whisperArguments(normalizedOptions, wavPath, outputBase));

    const srtPath = outputFile(directory, "transcript", "srt");
    const textPath = outputFile(directory, "transcript", "txt");
    let transcript = "";
    let timestampedTranscript = "";
    try {
      const subtitle = await readFile(srtPath, "utf8");
      transcript = parseSubtitleTranscript(subtitle, "srt");
      timestampedTranscript = parseTimestampedTranscript(subtitle, "srt");
    } catch {
      transcript = (await readFile(textPath, "utf8")).trim();
      timestampedTranscript = transcript;
    }
    if (!transcript) throw new Error("Whisper did not produce readable text.");

    return { title, transcript, timestampedTranscript, language: options.language || "auto" };
  } catch (error) {
    throw new Error(errorMessage(error, normalizedOptions));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
