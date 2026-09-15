import { Action, ActionPanel, Form, Icon } from "@raycast/api";
import { useState } from "react";
import { WhisperTranscript } from "./whisper-transcript";

type FormValues = { video: string[] };

export default function TranscribeLocalVideo() {
  const [videoPath, setVideoPath] = useState<string>();

  if (videoPath) return <WhisperTranscript input={{ kind: "file", path: videoPath }} />;

  return (
    <Form
      navigationTitle="Transcribe Local Video"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Transcribe with Whisper"
            icon={Icon.TextCursor}
            onSubmit={(values: FormValues) => setVideoPath(values.video[0])}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker id="video" title="Video File" allowMultipleSelection={false} canChooseDirectories={false} />
      <Form.Description text="Whisper runs on this device. The original file stays where it is." />
    </Form>
  );
}
