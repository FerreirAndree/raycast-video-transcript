import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  getPreferenceValues,
  Icon,
  LaunchProps,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { retrieveTranscript, TranscriptResult } from "./yt-dlp";

type Preferences = { preferredLanguage?: string };
type Props = LaunchProps<{ arguments: { url: string } }>;

function transcriptMarkdown(result: TranscriptResult): string {
  const source = result.subtitleKind === "manual" ? "subtitles" : "automatic captions";
  return `# ${result.title}\n\n_${result.language} ${source}_\n\n${result.transcript}`;
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
          <Action
            title="Copy Transcript with Title"
            icon={Icon.Clipboard}
            onAction={async () => {
              await Clipboard.copy(`${result.title}\n\n${result.transcript}`);
              await showToast({ style: Toast.Style.Success, title: "Transcript copied" });
            }}
          />
          <Action.OpenInBrowser title="Open Source" url={url} />
        </ActionPanel>
      }
    />
  );
}
