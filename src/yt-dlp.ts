import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { parseSubtitleTranscript, parseTimestampedTranscript } from "./subtitle-parser";

type SubtitleFormat = { ext?: string };
type VideoInfo = {
  id?: string;
  title?: string;
  subtitles?: Record<string, SubtitleFormat[]>;
  automatic_captions?: Record<string, SubtitleFormat[]>;
};

type SubtitleTrack = {
  language: string;
  kind: "manual" | "automatic";
};

export type TranscriptResult = {
  title: string;
  transcript: string;
  timestampedTranscript: string;
  language: string;
  subtitleKind: SubtitleTrack["kind"];
};

class YtDlpError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const process = spawn("yt-dlp", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
    process.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    process.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new YtDlpError("yt-dlp was not found on PATH.", "", undefined));
        return;
      }
      reject(new YtDlpError("Could not start yt-dlp.", error.message, undefined));
    });
    process.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new YtDlpError("yt-dlp could not retrieve this video.", stderr, code ?? undefined));
    });
  });
}

function trackLanguage(language: string): string {
  return language.toLocaleLowerCase().replace(/(?:[-_]orig(?:inal)?)$/, "");
}

function isOriginalTrack(language: string): boolean {
  return /(?:^|[-_])orig(?:inal)?$/i.test(language);
}

function languagePriority(language: string, preferredLanguage: string): number {
  const normalized = trackLanguage(language);
  const preferred = preferredLanguage.toLocaleLowerCase();
  if (normalized === preferred) return 0;
  if (normalized.startsWith(`${preferred}-`) || normalized.startsWith(`${preferred}_`)) return 1;
  if (normalized === "en") return 2;
  if (normalized.startsWith("en-") || normalized.startsWith("en_")) return 3;
  return 4;
}

export function chooseTrack(info: VideoInfo, preferredLanguage: string): SubtitleTrack | undefined {
  const tracks: SubtitleTrack[] = [
    ...Object.keys(info.subtitles ?? {}).map((language) => ({ language, kind: "manual" as const })),
    ...Object.keys(info.automatic_captions ?? {}).map((language) => ({ language, kind: "automatic" as const })),
  ];

  return tracks.sort((left, right) => {
    const languageDifference =
      languagePriority(left.language, preferredLanguage) - languagePriority(right.language, preferredLanguage);
    if (languageDifference !== 0) return languageDifference;
    if (left.kind !== right.kind) return left.kind === "manual" ? -1 : 1;
    if (isOriginalTrack(left.language) !== isOriginalTrack(right.language)) {
      return isOriginalTrack(left.language) ? -1 : 1;
    }
    return left.language.localeCompare(right.language);
  })[0];
}

function userFacingError(error: unknown): string {
  if (!(error instanceof YtDlpError)) return "Could not retrieve a transcript.";
  if (error.message.includes("not found")) return "yt-dlp is not installed or is not available on PATH.";

  const details = error.stderr.toLocaleLowerCase();
  if (details.includes("unsupported url")) return "yt-dlp does not support this URL.";
  if (details.includes("private video") || details.includes("login") || details.includes("sign in")) {
    return "This media is private, restricted, or requires an account yt-dlp cannot access.";
  }
  if (details.includes("unable to download") || details.includes("network") || details.includes("timed out")) {
    return "yt-dlp could not reach the source. Check the URL and your connection.";
  }
  return "yt-dlp could not retrieve this video. Check that the URL is public and supported.";
}

export async function retrieveTranscript(url: string, preferredLanguage: string): Promise<TranscriptResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Enter a complete video URL, including https://.");
  }
  if (!parsedUrl.protocol.startsWith("http")) throw new Error("Enter an http:// or https:// video URL.");

  let info: VideoInfo;
  try {
    const { stdout } = await runYtDlp([
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      url,
    ]);
    info = JSON.parse(stdout) as VideoInfo;
  } catch (error) {
    throw new Error(userFacingError(error));
  }

  const track = chooseTrack(info, preferredLanguage || "en");
  if (!track) throw new Error("No subtitles or captions are available for this video.");

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "raycast-video-transcript-"));
  try {
    try {
      await runYtDlp([
        "--skip-download",
        "--no-playlist",
        track.kind === "manual" ? "--write-subs" : "--write-auto-subs",
        "--sub-langs",
        track.language,
        "--sub-format",
        "vtt/best",
        "--paths",
        `home:${temporaryDirectory}`,
        "--output",
        "%(id)s.%(ext)s",
        "--no-warnings",
        "--quiet",
        url,
      ]);
    } catch (error) {
      throw new Error(userFacingError(error));
    }

    const files = await readdir(temporaryDirectory);
    const subtitleFile = files.find((file) => /\.(vtt|srt|json3)$/i.test(file));
    if (!subtitleFile)
      throw new Error("The source reported captions, but yt-dlp could not download a usable subtitle track.");

    const subtitle = await readFile(join(temporaryDirectory, subtitleFile), "utf8");
    const transcript = parseSubtitleTranscript(subtitle, extname(subtitleFile).slice(1));
    const timestampedTranscript = parseTimestampedTranscript(subtitle, extname(subtitleFile).slice(1));
    if (!transcript) throw new Error("The downloaded subtitle track did not contain readable text.");

    return {
      title: info.title?.trim() || "Video Transcript",
      transcript,
      timestampedTranscript,
      language: track.language,
      subtitleKind: track.kind,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
