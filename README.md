# Simple SFX Studio

Simple SFX Studio is a browser-based sound effect generator built with React, TypeScript, and Vite. It lets you preview, tweak, layer, and export short UI and game-style sound effects directly in the browser.

Live app: https://sfx-studio.enisn-projects.io/

## Features

- Browse and preview built-in sound presets for common UI, feedback, alert, and motion cues.
- Fine-tune core sound parameters like duration, pitch, waveform, noise, envelope, vibrato, and filtering.
- Use the advanced studio workspace to build layered patches with timeline editing and per-layer controls.
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
- Vitest and Testing Library
- Nginx and Docker for production serving

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

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

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
docker run --rm -p 8080:80 simple-sfx-studio
```

Then open `http://localhost:8080`.

## Project Structure

```text
src/
  app/            Application shell and routing
  audio/          Sound synthesis, presets, runtime, and display helpers
  pages/          Landing page and studio workspace
  test/           Test setup
public/           Static assets
dist/             Production build output
```

## License

Licensed under the Apache License 2.0. See `LICENSE` for details.
