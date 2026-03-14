# video to ascii

converts video  into real-time ascii art using webgl. divides each frame into a grid of cells, maps cell brightness to characters, and renders them with cursor glow and trail effects.

inspired by [general intuition](https://www.generalintuition.com/).

check it out at [intuitionart.ca](https://intuitionart.ca)

## usage

```bash
npm install
npm run dev
```

upload a video and it renders as ascii art in the browser. you can copy the ascii text output or get embed code to use it on your own site.

## library

build the standalone library for use outside this app:

```bash
npm run build:lib
```

this outputs `ascii-renderer.umd.js` and `ascii-renderer.es.js` to `dist/lib/`.

### script tag

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

### es module

```js
import { AsciiRenderer } from './ascii-renderer.es.js';

new AsciiRenderer('#ascii', {
  videoSrc: 'video.mp4',
  columns: 90,
  colored: true,
  enableMouse: true,
});
```

## stack

react, typescript, vite, webgl
