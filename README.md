# video to ascii

Converts video or images into real-time ASCII art using WebGL. Divides each frame into a grid of cells, maps cell brightness to characters, and renders them with cursor glow and trail effects.

Inspired by [General Intuition](https://www.generalintuition.com/).

## Usage

```bash
npm install
npm run dev
```

Upload a video or image (or try a sample) and it renders as ASCII art in the browser. You can copy the ASCII text output or get embed code to use it on your own site.

## Library

Build the standalone library for use outside this app:

```bash
npm run build:lib
```

This outputs `ascii-renderer.umd.js` and `ascii-renderer.es.js` to `dist/lib/`.

### Script Tag

```html
<div id="ascii"></div>
<script src="ascii-renderer.umd.js"></script>
<script>
  new AsciiRenderer('#ascii', {
    videoSrc: 'video.mp4',
    columns: 90,
    colored: true,
    enableMouse: true,
  });
</script>
```

### ES Module

```js
import { AsciiRenderer } from './ascii-renderer.es.js';

new AsciiRenderer('#ascii', {
  videoSrc: 'video.mp4',
  columns: 90,
  colored: true,
  enableMouse: true,
});
```

## Stack

React, TypeScript, Vite, WebGL
