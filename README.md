# Video Transcript

A Windows Raycast extension for getting clean transcripts from video URLs and local video files. For a URL, it retrieves an existing subtitle or caption track with your local `yt-dlp` installation. When captions are absent or unsuitable, it can transcribe audio locally with `whisper.cpp`.

It works with any public URL that `yt-dlp` supports. It does not use a transcript service, send data to a backend, or collect telemetry. Caption retrieval does not download video or audio. Whisper transcription downloads audio only for URLs, processes it on your computer, and deletes all temporary audio and intermediate files when it completes or fails.

## Use it

1. Open Raycast and run `Video Transcript` for a URL.
2. Paste a public video URL into the required URL field.
3. Read the clean transcript and press Enter to use `Copy Transcript`.
4. Open Actions to show or copy a timestamped transcript, export Markdown to Downloads, or choose `Transcribe with Whisper Instead`.

If a URL has no accessible captions, the result screen offers `Transcribe with Whisper`. It is an explicit action so a long audio download and local transcription never start unexpectedly.

Run `Transcribe Local Video` for an `.mp4`, `.mkv`, `.mov`, or other local video file. It opens a file picker and transcribes the selected file with Whisper. The original file is never moved, modified, or deleted.

The extension prefers a manual caption track in your preferred language, then automatic captions in that language, then English, then another available language. Within an equally good language match, it prefers the original-language track such as `en-orig`. Change `Preferred Subtitle Language` in Raycast Settings > Extensions > Video Transcript if needed. Use standard yt-dlp language tags, for example `en`, `es`, or `pt-BR`.

## Prerequisites

- Raycast for Windows, signed in.
- Node.js 22.22 or later and npm.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp), installed on `PATH`.

Whisper is optional until you use either Whisper action or `Transcribe Local Video`. It requires:

- [ffmpeg](https://ffmpeg.org/), installed on `PATH`.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)'s `whisper-cli`, installed on `PATH`.
- A local whisper.cpp model file. `base.en` is a good starting point for English. Use multilingual `base` when you need other spoken languages.

Install yt-dlp with winget:

```powershell
winget install yt-dlp.yt-dlp
```

Update it later with:

```powershell
winget upgrade yt-dlp.yt-dlp
```

Confirm that Raycast can find it from a new PowerShell window:

```powershell
yt-dlp --version
```

## Set up Whisper for offline transcription

Build whisper.cpp using its official Windows instructions, then add its `build\\bin` directory to `PATH`. From a clone of whisper.cpp, its documented baseline setup is:

```powershell
cmake -B build
cmake --build build --config Release
.\models\download-ggml-model.cmd base
```

The `download-ggml-model.cmd base` step downloads the model once. Whisper then runs locally. See the [whisper.cpp README](https://github.com/ggml-org/whisper.cpp) for model options and GPU builds.

Confirm both executables from a new PowerShell window:

```powershell
ffmpeg -version
whisper-cli -h
```

In Raycast Settings > Extensions > Video Transcript, choose the downloaded model as `Whisper Model File`. Leave `Whisper Language` set to `auto` unless you want to force a spoken-language code. The command never uploads the video or audio.

## Fresh-computer setup

Clone the repository, install dependencies, and let the Raycast development command import the extension:

```powershell
git clone git@github.com:FerreirAndree/raycast-video-transcript.git
cd raycast-video-transcript
.\scripts\setup.ps1 -RaycastHandle "your-raycast-handle" -StartDevelopmentMode
```

Raycast validates the `author` entry in `package.json` against a Raycast profile before it starts development mode. Pass the handle from your Raycast profile URL to the setup script. It writes that value into your local manifest. This change is for your local checkout and should not be committed unless you own the repository.

The script checks Node, npm, and `yt-dlp`, then runs `npm install` and `npm run dev`. While development mode starts, Raycast imports the local extension. You can then find `Video Transcript` in Raycast's root search. Press Ctrl+C once it is imported if you do not need hot reload. Raycast keeps the local extension registered. Run `npm run dev` again whenever you change the source.

This follows Raycast's current local-extension flow: `ray develop` imports an extension when needed, enables automatic reloads, and the extension stays available after development mode stops. See Raycast's [CLI documentation](https://developers.raycast.com/information/developer-tools/cli) and [local extension guide](https://developers.raycast.com/basics/create-your-first-extension).

If PowerShell blocks local scripts, use this one-time command for the current shell, then repeat the setup command:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## Development

```powershell
npm install
npm test
npm run lint
npm run build
npm run dev
```

## How it works

For caption retrieval, the extension asks `yt-dlp` for video metadata with `--skip-download`, selects one exposed subtitle track, and downloads only that track into a temporary directory. It asks for WebVTT first and falls back to another source-provided format. The parser supports WebVTT, SRT, and `json3`, strips subtitle markup, preserves cue start times, and collapses repeated or rolling automatic-caption cues before it renders the result.

For Whisper transcription of a URL, `yt-dlp` downloads an audio-only stream into a unique temporary directory. `ffmpeg` converts it to mono 16 kHz WAV, then `whisper-cli` writes text and SRT output. The extension reads those files and removes the entire temporary directory in a `finally` block, whether transcription succeeds or fails. For a local file, only the converted WAV and Whisper output are temporary. The original local file stays untouched.

## Limitations

- Caption retrieval needs a subtitle track exposed to `yt-dlp`. Whisper is available as a local fallback.
- Some sites require cookies, login, a compatible extractor, or a newer `yt-dlp` version. The extension intentionally does not add browser-cookie or account handling.
- Automatic captions vary in quality. The rolling-caption cleanup is conservative so it does not throw away new speech.
- Whisper needs local disk space, CPU or GPU time, and a compatible whisper.cpp model. It does not work offline until the model and tools have been installed, but it needs no transcription service afterward.

## License

[MIT](LICENSE)
