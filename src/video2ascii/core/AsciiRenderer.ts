import { getCharArray, DEFAULT_CHARSET } from "../lib/ascii-charsets";
import type { CharsetKey } from "../lib/ascii-charsets";
import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  compileShader,
  createProgram,
  createFullscreenQuad,
  createVideoTexture,
  createAsciiAtlas,
  calculateGridDimensions,
  CHAR_WIDTH_RATIO,
  type AsciiStats,
  type UniformLocations,
} from "../lib/webgl";

export interface AsciiRendererOptions {
  videoSrc: string;
  columns?: number;
  colored?: boolean;
  blend?: number;
  highlight?: number;
  brightness?: number;
  charset?: CharsetKey;
  enableMouse?: boolean;
  trailLength?: number;
  enableRipple?: boolean;
  rippleSpeed?: number;
  audioEffect?: number;
  audioRange?: number;
  autoPlay?: boolean;
  enableSpacebarToggle?: boolean;
  onStats?: (stats: AsciiStats) => void;
  onReady?: () => void;
}

interface MousePosition {
  x: number;
  y: number;
}

interface Ripple {
  x: number;
  y: number;
  startTime: number;
}

const MAX_TRAIL_LENGTH = 18;
const MAX_RIPPLES = 8;
const TRAIL_INTERVAL = 60;

export class AsciiRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private video: HTMLVideoElement;

  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private videoTexture: WebGLTexture | null = null;
  private atlasTexture: WebGLTexture | null = null;
  private uniformLocations: UniformLocations | null = null;

  private animationId = 0;
  private _isReady = false;
  private _isPlaying = false;
  private destroyed = false;

  private frameCount = 0;
  private frameTimes: number[] = [];
  private lastFpsTime = performance.now();
  private _stats: AsciiStats = { fps: 0, frameTime: 0 };

  private _dimensions = { cols: 80, rows: 24 };

  private opts: Required<
    Pick<
      AsciiRendererOptions,
      | "colored"
      | "blend"
      | "highlight"
      | "brightness"
      | "charset"
      | "enableMouse"
      | "trailLength"
      | "enableRipple"
      | "rippleSpeed"
      | "audioEffect"
      | "audioRange"
      | "autoPlay"
      | "enableSpacebarToggle"
    >
  > & {
    columns?: number;
    onStats?: (stats: AsciiStats) => void;
    onReady?: () => void;
  };

  private mouse: MousePosition = { x: -1, y: -1 };
  private trail: MousePosition[] = [];
  private trailIntervalId = 0;
  private lastMoveTime = 0;

  private ripples: Ripple[] = [];

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioDataArray: Uint8Array<ArrayBuffer> | null = null;
  private volume = 0;
  private connectedVideo: HTMLVideoElement | null = null;

  private resizeObserver: ResizeObserver | null = null;

  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseLeave: () => void;
  private boundOnClick: (e: MouseEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnLoadedMetadata: () => void;
  private boundOnPlay: () => void;
  private boundOnPause: () => void;
  private boundOnEnded: () => void;
  private boundOnVideoPlay: () => void;

  constructor(
    container: string | HTMLElement,
    options: AsciiRendererOptions
  ) {
    if (typeof container === "string") {
      const el = document.querySelector<HTMLElement>(container);
      if (!el) throw new Error(`Container not found: ${container}`);
      this.container = el;
    } else {
      this.container = container;
    }

    this.opts = {
      colored: options.colored ?? true,
      blend: options.blend ?? 0,
      highlight: options.highlight ?? 0,
      brightness: options.brightness ?? 1.0,
      charset: options.charset ?? DEFAULT_CHARSET,
      enableMouse: options.enableMouse ?? true,
      trailLength: options.trailLength ?? 24,
      enableRipple: options.enableRipple ?? false,
      rippleSpeed: options.rippleSpeed ?? 40,
      audioEffect: options.audioEffect ?? 0,
      audioRange: options.audioRange ?? 50,
      autoPlay: options.autoPlay ?? true,
      enableSpacebarToggle: options.enableSpacebarToggle ?? false,
      columns: options.columns,
      onStats: options.onStats,
      onReady: options.onReady,
    };

    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.maxWidth = "100%";

    this.video = document.createElement("video");
    this.video.src = options.videoSrc;
    this.video.muted = this.opts.audioEffect === 0;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.crossOrigin = "anonymous";
    this.video.style.display = "none";

    this.container.appendChild(this.video);
    this.container.appendChild(this.canvas);

    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseLeave = this.onMouseLeave.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.boundOnPlay = this.onVideoPlay.bind(this);
    this.boundOnPause = this.onVideoPause.bind(this);
    this.boundOnEnded = this.onVideoEnded.bind(this);
    this.boundOnVideoPlay = this.onVideoPlayForAudio.bind(this);

    this.video.addEventListener("loadedmetadata", this.boundOnLoadedMetadata);
    this.video.addEventListener("play", this.boundOnPlay);
    this.video.addEventListener("pause", this.boundOnPause);
    this.video.addEventListener("ended", this.boundOnEnded);

    if (this.video.readyState >= 1) {
      this.onLoadedMetadata();
    }

    if (this.opts.enableMouse) {
      this.setupMouseListeners();
    }

    if (this.opts.enableRipple) {
      this.container.addEventListener("click", this.boundOnClick);
    }

    if (this.opts.enableSpacebarToggle) {
      window.addEventListener("keydown", this.boundOnKeyDown);
    }

    if (this.opts.columns) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.video.readyState >= 1) {
          const wasPlaying = !this.video.paused;
          if (this.initWebGL() && wasPlaying) {
            requestAnimationFrame(() => this.render());
          }
        }
      });
      this.resizeObserver.observe(this.container);
    }

    if (this.opts.audioEffect > 0) {
      this.video.addEventListener("play", this.boundOnVideoPlay);
      if (!this.video.paused) {
        this.connectAudio();
      }
    }
  }

  play(): void {
    this.video.play().catch(() => {});
  }

  pause(): void {
    this.video.pause();
  }

  toggle(): void {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }

  setOptions(options: Partial<AsciiRendererOptions>): void {
    let needsReinit = false;
    let needsMouseSetup = false;
    let needsMouseTeardown = false;
    let needsRippleSetup = false;
    let needsRippleTeardown = false;
    let needsAudioSetup = false;
    let needsAudioTeardown = false;
    let needsSpacebarSetup = false;
    let needsSpacebarTeardown = false;

    if (options.columns !== undefined && options.columns !== this.opts.columns) {
      this.opts.columns = options.columns;
      needsReinit = true;
    }
    if (options.charset !== undefined && options.charset !== this.opts.charset) {
      this.opts.charset = options.charset;
      needsReinit = true;
    }
    if (options.colored !== undefined) this.opts.colored = options.colored;
    if (options.blend !== undefined) this.opts.blend = options.blend;
    if (options.highlight !== undefined) this.opts.highlight = options.highlight;
    if (options.brightness !== undefined) {
      this.opts.brightness = options.brightness;
      needsReinit = true;
    }
    if (options.trailLength !== undefined) this.opts.trailLength = options.trailLength;
    if (options.rippleSpeed !== undefined) this.opts.rippleSpeed = options.rippleSpeed;
    if (options.audioEffect !== undefined) {
      const wasEnabled = this.opts.audioEffect > 0;
      this.opts.audioEffect = options.audioEffect;
      const isEnabled = this.opts.audioEffect > 0;
      if (!wasEnabled && isEnabled) needsAudioSetup = true;
      if (wasEnabled && !isEnabled) needsAudioTeardown = true;
      this.video.muted = this.opts.audioEffect === 0;
    }
    if (options.audioRange !== undefined) this.opts.audioRange = options.audioRange;
    if (options.onStats !== undefined) this.opts.onStats = options.onStats;
    if (options.onReady !== undefined) this.opts.onReady = options.onReady;

    if (options.enableMouse !== undefined && options.enableMouse !== this.opts.enableMouse) {
      if (options.enableMouse) needsMouseSetup = true;
      else needsMouseTeardown = true;
      this.opts.enableMouse = options.enableMouse;
    }
    if (options.enableRipple !== undefined && options.enableRipple !== this.opts.enableRipple) {
      if (options.enableRipple) needsRippleSetup = true;
      else needsRippleTeardown = true;
      this.opts.enableRipple = options.enableRipple;
    }
    if (options.enableSpacebarToggle !== undefined && options.enableSpacebarToggle !== this.opts.enableSpacebarToggle) {
      if (options.enableSpacebarToggle) needsSpacebarSetup = true;
      else needsSpacebarTeardown = true;
      this.opts.enableSpacebarToggle = options.enableSpacebarToggle;
    }

    if (options.videoSrc !== undefined) {
      this.video.src = options.videoSrc;
      needsReinit = true;
    }

    if (needsMouseTeardown) this.teardownMouseListeners();
    if (needsMouseSetup) this.setupMouseListeners();
    if (needsRippleTeardown) this.container.removeEventListener("click", this.boundOnClick);
    if (needsRippleSetup) this.container.addEventListener("click", this.boundOnClick);
    if (needsSpacebarTeardown) window.removeEventListener("keydown", this.boundOnKeyDown);
    if (needsSpacebarSetup) window.addEventListener("keydown", this.boundOnKeyDown);
    if (needsAudioTeardown) {
      this.video.removeEventListener("play", this.boundOnVideoPlay);
    }
    if (needsAudioSetup) {
      this.video.addEventListener("play", this.boundOnVideoPlay);
      if (!this.video.paused) this.connectAudio();
    }

    if (needsReinit && this.video.readyState >= 1) {
      this.initWebGL();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    cancelAnimationFrame(this.animationId);
    clearInterval(this.trailIntervalId);

    this.video.removeEventListener("loadedmetadata", this.boundOnLoadedMetadata);
    this.video.removeEventListener("play", this.boundOnPlay);
    this.video.removeEventListener("pause", this.boundOnPause);
    this.video.removeEventListener("ended", this.boundOnEnded);
    this.video.removeEventListener("play", this.boundOnVideoPlay);

    this.teardownMouseListeners();
    this.container.removeEventListener("click", this.boundOnClick);
    window.removeEventListener("keydown", this.boundOnKeyDown);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.gl) {
      if (this.videoTexture) this.gl.deleteTexture(this.videoTexture);
      if (this.atlasTexture) this.gl.deleteTexture(this.atlasTexture);
      if (this.program) this.gl.deleteProgram(this.program);
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    this.video.pause();

    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }
    if (this.video.parentNode === this.container) {
      this.container.removeChild(this.video);
    }
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get dimensions(): { cols: number; rows: number } {
    return { ...this._dimensions };
  }

  get stats(): AsciiStats {
    return { ...this._stats };
  }

  get canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  get videoElement(): HTMLVideoElement {
    return this.video;
  }

  captureText(): string {
    const video = this.video;
    if (!video.videoWidth || !this._isReady) return "";

    const { cols, rows } = this._dimensions;
    const chars = getCharArray(this.opts.charset);

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = cols;
    sampleCanvas.height = rows;
    const ctx = sampleCanvas.getContext("2d");
    if (!ctx) return "";

    ctx.drawImage(video, 0, 0, cols, rows);
    const imageData = ctx.getImageData(0, 0, cols, rows);
    const pixels = imageData.data;

    let text = "";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const adjusted = Math.pow(brightness, 1.0 / this.opts.brightness);
        const clamped = Math.min(Math.max(adjusted, 0), 1);
        const charIndex = Math.min(
          Math.floor(clamped * chars.length),
          chars.length - 1
        );
        text += chars[charIndex];
      }
      if (y < rows - 1) text += "\n";
    }

    return text;
  }

  private initWebGL(): boolean {
    const canvas = this.canvas;
    const video = this.video;
    const container = this.container;
    if (!video.videoWidth) return false;

    const defaultWidth = typeof window !== "undefined" ? window.innerWidth : 900;
    const numColumns = this.opts.columns;

    let finalFontSize: number;
    let finalCols: number;

    if (numColumns) {
      const actualWidth = container.clientWidth || defaultWidth;
      finalFontSize = actualWidth / (numColumns * CHAR_WIDTH_RATIO);
      finalCols = numColumns;
    } else {
      finalFontSize = 10;
      finalCols = Math.floor(defaultWidth / (10 * CHAR_WIDTH_RATIO));
    }

    const grid = calculateGridDimensions(
      video.videoWidth,
      video.videoHeight,
      finalCols
    );
    this._dimensions = grid;

    const dpr = window.devicePixelRatio || 1;
    const finalCharWidth = finalFontSize * CHAR_WIDTH_RATIO;
    const pixelWidth = grid.cols * finalCharWidth;
    const pixelHeight = grid.rows * finalFontSize;
    canvas.width = Math.round(pixelWidth * dpr);
    canvas.height = Math.round(pixelHeight * dpr);
    canvas.style.width = pixelWidth + "px";
    canvas.style.height = pixelHeight + "px";

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      console.error("WebGL2 not supported");
      return false;
    }
    this.gl = gl;

    const vertexShader = compileShader(gl, VERTEX_SHADER, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return false;

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return false;
    this.program = program;
    gl.useProgram(program);

    createFullscreenQuad(gl, program);

    this.videoTexture = createVideoTexture(gl);
    const chars = getCharArray(this.opts.charset);
    this.atlasTexture = createAsciiAtlas(gl, chars, finalFontSize);

    const locations = this.cacheUniformLocations(gl, program);
    this.uniformLocations = locations;

    gl.uniform1i(locations.u_video, 0);
    gl.uniform1i(locations.u_asciiAtlas, 1);

    gl.uniform2f(locations.u_resolution, pixelWidth, pixelHeight);
    gl.uniform2f(locations.u_charSize, finalCharWidth, finalFontSize);
    gl.uniform2f(locations.u_gridSize, finalCols, grid.rows);
    gl.uniform1f(locations.u_numChars, chars.length);
    gl.uniform1f(locations.u_brightness, this.opts.brightness);

    gl.uniform2f(locations.u_mouse, -1, -1);
    gl.uniform1f(locations.u_mouseRadius, 0);
    gl.uniform1i(locations.u_trailLength, 0);
    gl.uniform1f(locations.u_rippleEnabled, 0);
    gl.uniform1f(locations.u_audioLevel, 0);
    gl.uniform1f(locations.u_audioReactivity, 0);
    gl.uniform1f(locations.u_audioSensitivity, 0);

    gl.viewport(0, 0, Math.round(pixelWidth * dpr), Math.round(pixelHeight * dpr));

    this._isReady = true;
    this.opts.onReady?.();
    return true;
  }

  private cacheUniformLocations(
    gl: WebGL2RenderingContext,
    program: WebGLProgram
  ): UniformLocations {
    const get = (name: string) => gl.getUniformLocation(program, name);

    return {
      u_video: get("u_video"),
      u_asciiAtlas: get("u_asciiAtlas"),
      u_resolution: get("u_resolution"),
      u_charSize: get("u_charSize"),
      u_gridSize: get("u_gridSize"),
      u_numChars: get("u_numChars"),
      u_colored: get("u_colored"),
      u_blend: get("u_blend"),
      u_highlight: get("u_highlight"),
      u_brightness: get("u_brightness"),
      u_mouse: get("u_mouse"),
      u_mouseRadius: get("u_mouseRadius"),
      u_trailLength: get("u_trailLength"),
      u_trail: Array.from({ length: MAX_TRAIL_LENGTH }, (_, i) =>
        get(`u_trail[${i}]`)
      ),
      u_time: get("u_time"),
      u_rippleEnabled: get("u_rippleEnabled"),
      u_rippleSpeed: get("u_rippleSpeed"),
      u_ripples: Array.from({ length: MAX_RIPPLES }, (_, i) =>
        get(`u_ripples[${i}]`)
      ),
      u_audioLevel: get("u_audioLevel"),
      u_audioReactivity: get("u_audioReactivity"),
      u_audioSensitivity: get("u_audioSensitivity"),
    };
  }

  private render = (): void => {
    const gl = this.gl;
    const video = this.video;
    const program = this.program;
    const locations = this.uniformLocations;

    if (!gl || !program || !locations || video.paused || video.ended) return;

    const frameStart = performance.now();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

    gl.uniform1i(locations.u_colored, this.opts.colored ? 1 : 0);
    gl.uniform1f(locations.u_blend, this.opts.blend / 100);
    gl.uniform1f(locations.u_highlight, this.opts.highlight / 100);
    gl.uniform1f(locations.u_brightness, this.opts.brightness);
    gl.uniform1f(locations.u_time, performance.now() / 1000.0);

    this.updateMouseUniforms(gl, locations);
    this.updateRippleUniforms(gl, locations);
    this.updateAudioUniforms(gl, locations);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const frameEnd = performance.now();
    this.frameCount++;
    this.frameTimes.push(frameEnd - frameStart);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      const avgFrameTime =
        this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this._stats = { fps: this.frameCount, frameTime: avgFrameTime };
      this.opts.onStats?.(this._stats);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    this.animationId = requestAnimationFrame(this.render);
  };

  private setupMouseListeners(): void {
    this.container.addEventListener("mousemove", this.boundOnMouseMove);
    this.container.addEventListener("mouseleave", this.boundOnMouseLeave);

    this.trailIntervalId = window.setInterval(() => {
      const pos = this.mouse;
      if (pos.x < 0) return;

      const trail = this.trail;
      const last = trail[0];
      const dx = last ? Math.abs(last.x - pos.x) : 1;
      const dy = last ? Math.abs(last.y - pos.y) : 1;
      const moved = !last || dx > 0.005 || dy > 0.005;

      if (moved) {
        this.lastMoveTime = performance.now();
        trail.unshift({ ...pos });
        if (trail.length > this.opts.trailLength) {
          trail.pop();
        }
      } else if (trail.length > 0) {
        trail.pop();
        if (trail.length > 0) trail.pop();
      }
    }, TRAIL_INTERVAL);
  }

  private teardownMouseListeners(): void {
    this.container.removeEventListener("mousemove", this.boundOnMouseMove);
    this.container.removeEventListener("mouseleave", this.boundOnMouseLeave);
    clearInterval(this.trailIntervalId);
    this.trailIntervalId = 0;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.opts.enableMouse) return;
    const rect = this.container.getBoundingClientRect();
    this.mouse = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    this.lastMoveTime = performance.now();
  }

  private onMouseLeave(): void {
    this.mouse = { x: -1, y: -1 };
    this.trail = [];
    this.lastMoveTime = 0;
  }

  private updateMouseUniforms(
    gl: WebGL2RenderingContext,
    locations: UniformLocations
  ): void {
    if (!this.opts.enableMouse) return;

    const timeSinceMove = performance.now() - this.lastMoveTime;
    const glow =
      timeSinceMove < 200
        ? 1.0
        : Math.max(0, 1.0 - (timeSinceMove - 200) / 500);

    gl.uniform2f(locations.u_mouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(locations.u_mouseRadius, glow);

    const trail = this.trail;
    gl.uniform1i(locations.u_trailLength, trail.length);

    for (let i = 0; i < MAX_TRAIL_LENGTH; i++) {
      const loc = locations.u_trail[i];
      if (loc) {
        const pos = trail[i] || { x: -1, y: -1 };
        gl.uniform2f(loc, pos.x, pos.y);
      }
    }
  }

  private onClick(e: MouseEvent): void {
    if (!this.opts.enableRipple) return;

    const rect = this.container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    this.ripples.unshift({
      x,
      y,
      startTime: performance.now() / 1000,
    });

    if (this.ripples.length > MAX_RIPPLES) {
      this.ripples.pop();
    }
  }

  private updateRippleUniforms(
    gl: WebGL2RenderingContext,
    locations: UniformLocations
  ): void {
    if (!this.opts.enableRipple) return;

    const currentTime = performance.now() / 1000;

    gl.uniform1f(locations.u_time, currentTime);
    gl.uniform1f(locations.u_rippleEnabled, 1.0);
    gl.uniform1f(locations.u_rippleSpeed, this.opts.rippleSpeed);

    const maxDist = Math.sqrt(
      this._dimensions.cols ** 2 + this._dimensions.rows ** 2
    );
    const maxLifetime = maxDist / this.opts.rippleSpeed + 1.0;
    this.ripples = this.ripples.filter(
      (r) => currentTime - r.startTime < maxLifetime
    );

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const loc = locations.u_ripples[i];
      if (loc) {
        const ripple = this.ripples[i];
        if (ripple) {
          gl.uniform4f(loc, ripple.x, ripple.y, ripple.startTime, 1.0);
        } else {
          gl.uniform4f(loc, 0, 0, 0, 0.0);
        }
      }
    }
  }

  private connectAudio(): void {
    const video = this.video;

    if (this.connectedVideo === video && this.audioContext) {
      this.audioContext.resume();
      return;
    }

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      const ctx = this.audioContext;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      this.analyser = analyser;

      this.audioDataArray = new Uint8Array(
        analyser.frequencyBinCount
      ) as Uint8Array<ArrayBuffer>;

      const source = ctx.createMediaElementSource(video);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      this.connectedVideo = video;

      ctx.resume();
    } catch (error) {
      console.warn("Failed to connect audio analyzer:", error);
    }
  }

  private onVideoPlayForAudio(): void {
    if (this.opts.audioEffect > 0) {
      this.connectAudio();
    }
  }

  private updateAudioUniforms(
    gl: WebGL2RenderingContext,
    locations: UniformLocations
  ): void {
    if (this.opts.audioEffect <= 0) return;

    if (this.analyser && this.audioDataArray) {
      this.analyser.getByteFrequencyData(this.audioDataArray);
      let sum = 0;
      for (let i = 0; i < this.audioDataArray.length; i++) {
        sum += this.audioDataArray[i];
      }
      const average = sum / this.audioDataArray.length / 255;
      this.volume = this.volume * 0.7 + average * 0.3;
    }

    gl.uniform1f(locations.u_audioLevel, this.volume);
    gl.uniform1f(locations.u_audioReactivity, this.opts.audioEffect / 100);
    gl.uniform1f(locations.u_audioSensitivity, this.opts.audioRange / 100);
  }

  private onLoadedMetadata(): void {
    this.initWebGL();
    if (this.opts.autoPlay) {
      this.play();
    }
  }

  private onVideoPlay(): void {
    this._isPlaying = true;
    this.animationId = requestAnimationFrame(this.render);
  }

  private onVideoPause(): void {
    this._isPlaying = false;
    cancelAnimationFrame(this.animationId);
  }

  private onVideoEnded(): void {
    this._isPlaying = false;
    cancelAnimationFrame(this.animationId);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      this.toggle();
    }
  }
}
