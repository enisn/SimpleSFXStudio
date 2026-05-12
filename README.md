# Simple SFX Studio

Simple SFX Studio is a browser-based sound effect generator built with React, TypeScript, and Vite. It lets you preview, tweak, layer, and export short UI and game-style sound effects directly in the browser.

Live app: https://sfx-studio.enisn-projects.io/

## Features

- Browse and preview built-in sound presets for common UI, feedback, alert, and motion cues.
- Fine-tune core sound parameters like duration, pitch, waveform, noise, envelope, vibrato, and filtering.
- Use the advanced studio workspace to build layered patches with timeline editing and per-layer controls.
- Chat with an AI assistant that can inspect the current studio patch, modify any configurable control, add or remove layers, or generate a new sound from scratch.
- Export generated sounds from the browser.
- Switch between light, dark, and system theme modes.
- Persist studio drafts and layout preferences locally in the browser.

## Routes

- `/` - preset-driven sound generator
- `/studio` - advanced layered sound design workspace

## Tech Stack

- React 19
- TypeScript
- Vite
- React Router
- Node.js HTTP server for same-origin API and static hosting
- Vitest and Testing Library
- Docker for production serving

## Development

### Requirements

- Node.js 22+
- npm

### Install

```bash
npm ci
```

### Start the dev server

```bash
npm run dev
```

This starts both the Vite client and the local API server.

### Server environment variables

Set these on the server only. Do not prefix them with `VITE_`.

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your-secret-key
OPENAI_MODEL=gpt-5-mini
```

`OPENAI_MODEL` must support Chat Completions tool calling.

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

The preview server expects `dist/` to already exist, so run `npm run build` first.

### Run checks

```bash
npm run lint
npm run test
```

## Docker

Build the image:

```bash
docker build -t simple-sfx-studio .
```

Run the container:

```bash
docker run --rm -p 3000:3000 \
  -e OPENAI_BASE_URL=https://api.openai.com/v1 \
  -e OPENAI_API_KEY=your-secret-key \
  -e OPENAI_MODEL=gpt-5-mini \
  simple-sfx-studio
```

Then open `http://localhost:3000`.

## Project Structure

```text
src/
  app/            Application shell and routing
  audio/          Sound synthesis, presets, runtime, and display helpers
  components/     Shared UI like the AI assistant bubble and drawer
  features/       Feature-specific client helpers
  pages/          Landing page and studio workspace
  test/           Test setup
server/           Same-origin API server and static asset host
public/           Static assets
dist/             Production build output
```

## License

Licensed under the Apache License 2.0. See `LICENSE` for details.
