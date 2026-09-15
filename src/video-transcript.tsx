import { Action, ActionPanel, Detail, getPreferenceValues, Icon, LaunchProps, showToast, Toast } from "@raycast/api";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { useEffect, useState } from "react";
import { retrieveTranscript, TranscriptResult } from "./yt-dlp";

type Preferences = { preferredLanguage?: string };
type Props = LaunchProps<{ arguments: { url: string } }>;

function transcriptMarkdown(result: TranscriptResult): string {
  const source = result.subtitleKind === "manual" ? "subtitles" : "automatic captions";
  return `# ${result.title}\n\n_${result.language} ${source}_\n\n${result.transcript}`;
}

function timestampedMarkdown(result: TranscriptResult): string {
  const source = result.subtitleKind === "manual" ? "subtitles" : "automatic captions";
  return `# ${result.title}\n\n_${result.language} ${source}, timestamps included_\n\n${result.timestampedTranscript}`;
}

function exportMarkdown(result: TranscriptResult, url: string, includeTimestamps: boolean): string {
  const source = result.subtitleKind === "manual" ? "subtitles" : "automatic captions";
  const transcript = includeTimestamps ? result.timestampedTranscript : result.transcript;
  return `# ${result.title}\n\n- Source: ${url}\n- Track: ${result.language} ${source}\n- Timestamps: ${includeTimestamps ? "included" : "omitted"}\n\n## Transcript\n\n${transcript}\n`;
}

function exportFileName(result: TranscriptResult, includeTimestamps: boolean): string {
  const slug = result.title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "video-transcript"}${includeTimestamps ? "-timestamped" : ""}.md`;
}

async function exportToDownloads(result: TranscriptResult, url: string, includeTimestamps: boolean): Promise<void> {
  const downloads = join(homedir(), "Downloads");
  await mkdir(downloads, { recursive: true });
  const name = exportFileName(result, includeTimestamps);
  await writeFile(join(downloads, name), exportMarkdown(result, url, includeTimestamps), "utf8");
  await showToast({ style: Toast.Style.Success, title: "Markdown saved to Downloads", message: name });
}

function TimestampedTranscript({ result, url }: { result: TranscriptResult; url: string }) {
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
            onAction={() => exportToDownloads(result, url, true)}
          />
        </ActionPanel>
      }
    />
  );
}

export default function VideoTranscript({ arguments: { url } }: Props) {
  const preferences = getPreferenceValues<Preferences>();
  const [result, setResult] = useState<TranscriptResult>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const transcript = await retrieveTranscript(url.trim(), preferences.preferredLanguage?.trim() || "en");
        if (active) setResult(transcript);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Could not retrieve a transcript.";
        if (active) {
          setError(message);
          await showToast({ style: Toast.Style.Failure, title: "Transcript unavailable", message });
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [url, preferences.preferredLanguage]);

  if (error) {
    return (
      <Detail
        markdown={`# Transcript unavailable\n\n${error}\n\nThis extension retrieves existing subtitle tracks only. It does not generate a transcript from audio.`}
      />
    );
  }

  if (!result) return <Detail isLoading markdown="Retrieving available subtitles with yt-dlp..." />;

  return (
    <Detail
      markdown={transcriptMarkdown(result)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Track" text={`${result.language} (${result.subtitleKind})`} />
          <Detail.Metadata.Link title="Source" text={url} target={url} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Transcript" content={result.transcript} icon={Icon.Clipboard} />
          <Action.Push
            title="Show Transcript with Timestamps"
            icon={Icon.Clock}
            target={<TimestampedTranscript result={result} url={url} />}
          />
          <ActionPanel.Submenu title="Export Markdown…" icon={Icon.Download}>
            <Action
              title="Clean Transcript"
              icon={Icon.Document}
              onAction={() => exportToDownloads(result, url, false)}
            />
            <Action title="With Timestamps" icon={Icon.Clock} onAction={() => exportToDownloads(result, url, true)} />
          </ActionPanel.Submenu>
          <Action.OpenInBrowser title="Open Source" url={url} />
        </ActionPanel>
      }
    />
  );
}
