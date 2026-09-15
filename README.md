# Video Transcript

A Windows Raycast extension that retrieves an existing subtitle or caption track from a video URL using your local `yt-dlp` installation. It cleans the track into readable text and puts a copy action directly in Raycast.

It works with any public URL that `yt-dlp` supports. It does not download video media, use a transcript service, send data to a backend, collect telemetry, or generate speech-to-text. If a source has no accessible captions, it says so plainly.

## Use it

1. Open Raycast and run `Video Transcript`.
2. Paste a public video URL into the required URL field.
3. Read the clean transcript and press Enter to use `Copy Transcript`.
4. Open Actions to show or copy a timestamped transcript, or export a Markdown file to Downloads.

The extension prefers a manual caption track in your preferred language, then automatic captions in that language, then English, then another available language. Change `Preferred Subtitle Language` in Raycast Settings > Extensions > Video Transcript if needed. Use standard yt-dlp language tags, for example `en`, `es`, or `pt-BR`.

## Prerequisites

- Raycast for Windows, signed in.
- Node.js 22.22 or later and npm.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp), installed on `PATH`.

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

The extension asks `yt-dlp` for video metadata with `--skip-download`, selects one exposed subtitle track, and downloads only that track into a temporary directory. It asks for WebVTT first and falls back to another source-provided format. The parser supports WebVTT, SRT, and `json3`, strips subtitle markup, preserves cue start times, and collapses repeated or rolling automatic-caption cues before it renders the result.

## Limitations

- Captions must already be exposed to `yt-dlp`. This extension does not use Whisper or any other speech-to-text engine.
- Some sites require cookies, login, a compatible extractor, or a newer `yt-dlp` version. The extension intentionally does not add browser-cookie or account handling.
- Automatic captions vary in quality. The rolling-caption cleanup is conservative so it does not throw away new speech.

## License

[MIT](LICENSE)
