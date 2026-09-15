import {
  Action,
  ActionPanel,
  Detail,
  getPreferenceValues,
  Icon,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { useEffect, useState } from "react";
import { transcribeWithWhisper, WhisperInput, WhisperTranscriptResult } from "./whisper";

type WhisperPreferences = {
  whisperExecutable?: string;
  whisperModelPath?: string;
  whisperLanguage?: string;
};

function transcriptMarkdown(result: WhisperTranscriptResult): string {
  const language = result.language === "auto" ? "language detected automatically" : result.language;
  return `# ${result.title}\n\n_Whisper transcription, ${language}_\n\n${result.transcript}`;
}

function timestampedMarkdown(result: WhisperTranscriptResult): string {
  const language = result.language === "auto" ? "language detected automatically" : result.language;
  return `# ${result.title}\n\n_Whisper transcription, ${language}, timestamps included_\n\n${result.timestampedTranscript}`;
}

function exportFileName(result: WhisperTranscriptResult, includeTimestamps: boolean): string {
  const slug = result.title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "video-transcript"}${includeTimestamps ? "-timestamped" : ""}.md`;
}

function sourceLabel(input: WhisperInput): string {
  return input.kind === "url" ? input.url : input.path;
}

async function exportToDownloads(
  result: WhisperTranscriptResult,
  input: WhisperInput,
  includeTimestamps: boolean,
): Promise<void> {
  const downloads = join(homedir(), "Downloads");
  await mkdir(downloads, { recursive: true });
  const name = exportFileName(result, includeTimestamps);
  const transcript = includeTimestamps ? result.timestampedTranscript : result.transcript;
  const markdown = `# ${result.title}\n\n- Source: ${sourceLabel(input)}\n- Method: Whisper transcription\n- Timestamps: ${includeTimestamps ? "included" : "omitted"}\n\n## Transcript\n\n${transcript}\n`;
  await writeFile(join(downloads, name), markdown, "utf8");
  await showToast({ style: Toast.Style.Success, title: "Markdown saved to Downloads", message: name });
}

function TimestampedTranscript({ result, input }: { result: WhisperTranscriptResult; input: WhisperInput }) {
  return (
    <Detail
      markdown={timestampedMarkdown(result)}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Transcript with Timestamps"
            content={result.timestampedTranscript}
            icon={Icon.Clipboard}
          />
          <Action
            title="Export Timestamped Markdown"
            icon={Icon.Download}
            onAction={() => exportToDownloads(result, input, true)}
          />
        </ActionPanel>
      }
    />
  );
}

export function WhisperTranscript({ input }: { input: WhisperInput }) {
  const preferences = getPreferenceValues<WhisperPreferences>();
  const [result, setResult] = useState<WhisperTranscriptResult>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    async function transcribe() {
      try {
        const transcript = await transcribeWithWhisper(input, {
          executable: preferences.whisperExecutable?.trim() || "whisper-cli",
          modelPath: preferences.whisperModelPath?.trim() || "",
          language: preferences.whisperLanguage?.trim() || "auto",
        });
        if (active) setResult(transcript);
      } catch (transcriptionError) {
        const message =
          transcriptionError instanceof Error ? transcriptionError.message : "Whisper could not transcribe this video.";
        if (active) {
          setError(message);
          await showToast({ style: Toast.Style.Failure, title: "Whisper transcription unavailable", message });
        }
      }
    }
    void transcribe();
    return () => {
      active = false;
    };
  }, [input, preferences.whisperExecutable, preferences.whisperLanguage, preferences.whisperModelPath]);

  if (error) {
    return (
      <Detail
        markdown={`# Whisper transcription unavailable\n\n${error}\n\nAudio is kept in a temporary folder and deleted when this transcription finishes or fails.`}
        actions={
          <ActionPanel>
            <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
          </ActionPanel>
        }
      />
    );
  }

  if (!result) {
    return (
      <Detail
        isLoading
        markdown="Preparing local audio and transcribing with Whisper...\n\nTemporary audio is deleted when the transcription ends."
      />
    );
  }

  return (
    <Detail
      markdown={transcriptMarkdown(result)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Method" text="Whisper, on this device" />
          <Detail.Metadata.Label title="Language" text={result.language} />
          {input.kind === "url" ? <Detail.Metadata.Link title="Source" text={input.url} target={input.url} /> : null}
          {input.kind === "file" ? <Detail.Metadata.Label title="Source" text={input.path} /> : null}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Transcript" content={result.transcript} icon={Icon.Clipboard} />
          <Action.Push
            title="Show Transcript with Timestamps"
            icon={Icon.Clock}
            target={<TimestampedTranscript result={result} input={input} />}
          />
          <ActionPanel.Submenu title="Export Markdown…" icon={Icon.Download}>
            <Action
              title="Clean Transcript"
              icon={Icon.Document}
              onAction={() => exportToDownloads(result, input, false)}
            />
            <Action title="With Timestamps" icon={Icon.Clock} onAction={() => exportToDownloads(result, input, true)} />
          </ActionPanel.Submenu>
          {input.kind === "url" ? <Action.OpenInBrowser title="Open Source" url={input.url} /> : null}
        </ActionPanel>
      }
    />
  );
}
