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
  onError?: (msg: string) => void;
}

const DEFAULTS = {
  colored: true,
  blend: 0,
  highlight: 0,
  brightness: 1.0,
  charset: DEFAULT_CHARSET,
  enableMouse: true,
  trailLength: 24,
  enableRipple: false,
  rippleSpeed: 40,
  audioEffect: 0,
  audioRange: 50,
  autoPlay: true,
  enableSpacebarToggle: false,
} as const;

const MAX_TRAIL = 18;
const MAX_RIPPLES = 8;
const TRAIL_INTERVAL_MS = 60;

interface Vec2 { x: number; y: number }
interface Ripple extends Vec2 { startTime: number }

export class AsciiRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private video: HTMLVideoElement;

  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private videoTexture: WebGLTexture | null = null;
  private atlasTexture: WebGLTexture | null = null;
  private uniforms: UniformLocations | null = null;

  private animationId = 0;
  private _isReady = false;
  private _isPlaying = false;
  private destroyed = false;

  private frameCount = 0;
  private frameTimes: number[] = [];
  private lastFpsTime = performance.now();
  private _stats: AsciiStats = { fps: 0, frameTime: 0 };
  private _dimensions = { cols: 80, rows: 24 };

  private opts: {
    columns?: number;
    colored: boolean;
    blend: number;
    highlight: number;
    brightness: number;
    charset: CharsetKey;
    enableMouse: boolean;
    trailLength: number;
    enableRipple: boolean;
    rippleSpeed: number;
    audioEffect: number;
    audioRange: number;
    autoPlay: boolean;
    enableSpacebarToggle: boolean;
    onStats?: (stats: AsciiStats) => void;
    onReady?: () => void;
  };

  private mouse: Vec2 = { x: -1, y: -1 };
  private trail: Vec2[] = [];
  private trailIntervalId = 0;
  private lastMoveTime = 0;
  private ripples: Ripple[] = [];

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioData: Uint8Array<ArrayBuffer> | null = null;
  private volume = 0;
  private connectedVideo: HTMLVideoElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private handleMouseMove: (e: MouseEvent) => void;
  private handleMouseLeave: () => void;
  private handleTouchMove: (e: TouchEvent) => void;
  private handleTouchEnd: () => void;
  private handleClick: (e: MouseEvent) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleMetadata: () => void;
  private handlePlay: () => void;
  private handleStop: () => void;
  private handleAudioPlay: () => void;
  private handleVideoError: () => void;
  private handleContextLost: (e: Event) => void;
  private handleContextRestored: () => void;
  private _onError?: (msg: string) => void;

  constructor(container: string | HTMLElement, options: AsciiRendererOptions) {
    this.container = typeof container === "string"
      ? document.querySelector<HTMLElement>(container) ?? (() => { throw new Error(`Container not found: ${container}`); })()
      : container;

    this._onError = options.onError;
    this.opts = {
      colored: options.colored ?? DEFAULTS.colored,
      blend: options.blend ?? DEFAULTS.blend,
      highlight: options.highlight ?? DEFAULTS.highlight,
      brightness: options.brightness ?? DEFAULTS.brightness,
      charset: options.charset ?? DEFAULTS.charset,
      enableMouse: options.enableMouse ?? DEFAULTS.enableMouse,
      trailLength: Math.min(options.trailLength ?? DEFAULTS.trailLength, MAX_TRAIL),
      enableRipple: options.enableRipple ?? DEFAULTS.enableRipple,
      rippleSpeed: options.rippleSpeed ?? DEFAULTS.rippleSpeed,
      audioEffect: options.audioEffect ?? DEFAULTS.audioEffect,
      audioRange: options.audioRange ?? DEFAULTS.audioRange,
      autoPlay: options.autoPlay ?? DEFAULTS.autoPlay,
      enableSpacebarToggle: options.enableSpacebarToggle ?? DEFAULTS.enableSpacebarToggle,
      columns: options.columns,
      onStats: options.onStats,
      onReady: options.onReady,
    };

    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.maxWidth = "100%";
    this.canvas.style.margin = "0 auto";

    this.video = document.createElement("video");
    this.video.muted = this.opts.audioEffect === 0;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = "auto";
    this.video.setAttribute("playsinline", "");
    this.video.setAttribute("webkit-playsinline", "");
    this.video.setAttribute("muted", "");
    this.video.src = options.videoSrc;
    this.video.style.display = "none";

    this.container.appendChild(this.video);
    this.container.appendChild(this.canvas);

    this.handleMouseMove = this.onMouseMove.bind(this);
    this.handleMouseLeave = this.onMouseLeave.bind(this);
    this.handleTouchMove = this.onTouchMove.bind(this);
    this.handleTouchEnd = this.onMouseLeave.bind(this);
    this.handleClick = this.onClick.bind(this);
    this.handleKeyDown = this.onKeyDown.bind(this);
    this.handleMetadata = this.onMetadata.bind(this);
    this.handlePlay = this.onPlay.bind(this);
    this.handleStop = this.onStop.bind(this);
    this.handleAudioPlay = () => { if (this.opts.audioEffect > 0) this.connectAudio(); };
    this.handleVideoError = () => {
      const e = this.video.error;
      const msg = e ? `Video error: ${e.message || "format not supported by this browser"}` : "Video failed to load";
      this._onError?.(msg);
    };
    this.handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(this.animationId);
    };
    this.handleContextRestored = () => {
      if (this.video.readyState >= 1 && this.initWebGL() && !this.video.paused) {
        requestAnimationFrame(this.render);
      }
    };

    this.video.addEventListener("loadedmetadata", this.handleMetadata);
    this.video.addEventListener("play", this.handlePlay);
    this.video.addEventListener("pause", this.handleStop);
    this.video.addEventListener("ended", this.handleStop);
    this.video.addEventListener("error", this.handleVideoError);

    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);

    if (this.video.readyState >= 1) this.onMetadata();
    if (this.opts.enableMouse) this.addMouseListeners();
    if (this.opts.enableRipple) this.canvas.addEventListener("click", this.handleClick);
    if (this.opts.enableSpacebarToggle) window.addEventListener("keydown", this.handleKeyDown);

    if (this.opts.columns) {
      let lastWidth = 0;
      this.resizeObserver = new ResizeObserver(() => {
        if (this.video.readyState < 1) return;
        const w = this.container.clientWidth;
        if (w === lastWidth) return;
        lastWidth = w;
        const wasPlaying = !this.video.paused;
        if (this.initWebGL() && wasPlaying) requestAnimationFrame(() => this.render());
      });
      this.resizeObserver.observe(this.container);
    }

    if (this.opts.audioEffect > 0) {
      this.video.addEventListener("play", this.handleAudioPlay);
      if (!this.video.paused) this.connectAudio();
    }
  }

  play(): void {
    const attempt = () => {
      this.video.play().catch(() => {
        // Safari may block autoplay — retry once after a short delay
        setTimeout(() => { this.video.play().catch(() => {}); }, 100);
      });
    };
    if (this.video.readyState >= 2) attempt();
    else this.video.addEventListener("canplay", attempt, { once: true });
  }
  pause(): void { this.video.pause(); }
  toggle(): void { this.video.paused ? this.play() : this.pause(); }

  get isReady() { return this._isReady; }
  get isPlaying() { return this._isPlaying; }
  get dimensions() { return { ...this._dimensions }; }
  get stats() { return { ...this._stats }; }
  get canvasElement() { return this.canvas; }
  get videoElement() { return this.video; }

  setOptions(options: Partial<AsciiRendererOptions>): void {
    let reinit = false;

    if (options.columns !== undefined && options.columns !== this.opts.columns) {
      this.opts.columns = options.columns;
      reinit = true;
    }
    if (options.charset !== undefined && options.charset !== this.opts.charset) {
      this.opts.charset = options.charset;
      reinit = true;
    }
    if (options.brightness !== undefined && options.brightness !== this.opts.brightness) {
      this.opts.brightness = options.brightness;
      reinit = true;
    }
    if (options.videoSrc !== undefined) {
      this.video.src = options.videoSrc;
      reinit = true;
    }

    if (options.colored !== undefined) this.opts.colored = options.colored;
    if (options.blend !== undefined) this.opts.blend = options.blend;
    if (options.highlight !== undefined) this.opts.highlight = options.highlight;
    if (options.trailLength !== undefined) this.opts.trailLength = Math.min(options.trailLength, MAX_TRAIL);
    if (options.rippleSpeed !== undefined) this.opts.rippleSpeed = options.rippleSpeed;
    if (options.audioRange !== undefined) this.opts.audioRange = options.audioRange;
    if (options.onStats !== undefined) this.opts.onStats = options.onStats;
    if (options.onReady !== undefined) this.opts.onReady = options.onReady;

    this.toggleListener(
      options.enableMouse, this.opts.enableMouse,
      () => this.addMouseListeners(), () => this.removeMouseListeners(),
      (v) => { this.opts.enableMouse = v; }
    );
    this.toggleListener(
      options.enableRipple, this.opts.enableRipple,
      () => this.canvas.addEventListener("click", this.handleClick),
      () => this.canvas.removeEventListener("click", this.handleClick),
      (v) => { this.opts.enableRipple = v; }
    );
    this.toggleListener(
      options.enableSpacebarToggle, this.opts.enableSpacebarToggle,
      () => window.addEventListener("keydown", this.handleKeyDown),
      () => window.removeEventListener("keydown", this.handleKeyDown),
      (v) => { this.opts.enableSpacebarToggle = v; }
    );

    if (options.audioEffect !== undefined) {
      const wasOn = this.opts.audioEffect > 0;
      this.opts.audioEffect = options.audioEffect;
      const isOn = this.opts.audioEffect > 0;
      this.video.muted = !isOn;
      if (!wasOn && isOn) {
        this.video.addEventListener("play", this.handleAudioPlay);
        if (!this.video.paused) this.connectAudio();
      } else if (wasOn && !isOn) {
        this.video.removeEventListener("play", this.handleAudioPlay);
      }
    }

    if (reinit && this.video.readyState >= 1) this.initWebGL();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    cancelAnimationFrame(this.animationId);
    clearInterval(this.trailIntervalId);

    this.video.removeEventListener("loadedmetadata", this.handleMetadata);
    this.video.removeEventListener("play", this.handlePlay);
    this.video.removeEventListener("pause", this.handleStop);
    this.video.removeEventListener("ended", this.handleStop);
    this.video.removeEventListener("play", this.handleAudioPlay);
    this.video.removeEventListener("error", this.handleVideoError);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);

    this.removeMouseListeners();
    this.canvas.removeEventListener("click", this.handleClick);
    window.removeEventListener("keydown", this.handleKeyDown);

    this.resizeObserver?.disconnect();

    if (this.gl) {
      if (this.videoTexture) this.gl.deleteTexture(this.videoTexture);
      if (this.atlasTexture) this.gl.deleteTexture(this.atlasTexture);
      if (this.program) this.gl.deleteProgram(this.program);
    }

    this.audioContext?.close();
    this.video.pause();

    if (this.canvas.parentNode === this.container) this.container.removeChild(this.canvas);
    if (this.video.parentNode === this.container) this.container.removeChild(this.video);
  }

  captureText(): string {
    if (!this.video.videoWidth || !this._isReady) return "";

    const { cols, rows } = this._dimensions;
    const chars = getCharArray(this.opts.charset);
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.drawImage(this.video, 0, 0, cols, rows);
    const { data } = ctx.getImageData(0, 0, cols, rows);
    const lines: string[] = [];

    for (let y = 0; y < rows; y++) {
      let line = "";
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        const adjusted = Math.min(Math.max(Math.pow(luma, 1 / this.opts.brightness), 0), 1);
        line += chars[Math.min(Math.floor(adjusted * chars.length), chars.length - 1)];
      }
      lines.push(line);
    }

    return lines.join("\n");
  }

  private toggleListener(
    newVal: boolean | undefined,
    currentVal: boolean,
    setup: () => void,
    teardown: () => void,
    assign: (v: boolean) => void,
  ): void {
    if (newVal === undefined || newVal === currentVal) return;
    if (newVal) setup(); else teardown();
    assign(newVal);
  }

  private initWebGL(): boolean {
    if (!this.video.videoWidth) return false;

    const cols = this.opts.columns;
    const containerWidth = this.container.clientWidth || window.innerWidth;

    let finalCols: number;

    if (cols) {
      finalCols = cols;
    } else {
      finalCols = Math.floor(containerWidth / (10 * CHAR_WIDTH_RATIO));
    }

    const grid = calculateGridDimensions(this.video.videoWidth, this.video.videoHeight, finalCols);
    if (grid.cols <= 0 || grid.rows <= 0) return false;
    this._dimensions = grid;

    // fontSize from width (fill container horizontally)
    const fontSizeFromWidth = containerWidth / (finalCols * CHAR_WIDTH_RATIO);
    // fontSize from height (fit within viewport)
    const maxH = window.innerHeight * 0.85;
    const fontSizeFromHeight = maxH / grid.rows;
    // use whichever is smaller so canvas fits both dimensions
    const fontSize = Math.min(fontSizeFromWidth, fontSizeFromHeight);

    const dpr = window.devicePixelRatio || 1;
    const charWidth = fontSize * CHAR_WIDTH_RATIO;
    const pxW = grid.cols * charWidth;
    const pxH = grid.rows * fontSize;
    this.canvas.width = Math.round(pxW * dpr);
    this.canvas.height = Math.round(pxH * dpr);
    this.canvas.style.width = pxW + "px";
    this.canvas.style.height = pxH + "px";

    const gl = this.canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false });
    if (!gl) {
      this._onError?.("WebGL2 is not supported by your browser. Please try Chrome, Firefox, or Edge.");
      return false;
    }
    this.gl = gl;

    const vs = compileShader(gl, VERTEX_SHADER, gl.VERTEX_SHADER);
    const fs = compileShader(gl, FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return false;

    const program = createProgram(gl, vs, fs);
    if (!program) return false;
    this.program = program;
    gl.useProgram(program);

    createFullscreenQuad(gl, program);
    this.videoTexture = createVideoTexture(gl);

    const chars = getCharArray(this.opts.charset);
    this.atlasTexture = createAsciiAtlas(gl, chars, fontSize);

    const u = this.cacheUniforms(gl, program);
    this.uniforms = u;

    gl.uniform1i(u.u_video, 0);
    gl.uniform1i(u.u_asciiAtlas, 1);
    gl.uniform2f(u.u_resolution, pxW, pxH);
    gl.uniform2f(u.u_charSize, charWidth, fontSize);
    gl.uniform2f(u.u_gridSize, finalCols, grid.rows);
    gl.uniform1f(u.u_numChars, chars.length);
    gl.uniform1f(u.u_brightness, this.opts.brightness);
    gl.uniform2f(u.u_mouse, -1, -1);
    gl.uniform1f(u.u_mouseRadius, 0);
    gl.uniform1i(u.u_trailLength, 0);
    gl.uniform1f(u.u_rippleEnabled, 0);
    gl.uniform1f(u.u_audioLevel, 0);
    gl.uniform1f(u.u_audioReactivity, 0);
    gl.uniform1f(u.u_audioSensitivity, 0);
    gl.viewport(0, 0, Math.round(pxW * dpr), Math.round(pxH * dpr));

    this._isReady = true;
    this.opts.onReady?.();
    return true;
  }

  private cacheUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): UniformLocations {
    const loc = (name: string) => gl.getUniformLocation(program, name);
    return {
      u_video: loc("u_video"),
      u_asciiAtlas: loc("u_asciiAtlas"),
      u_resolution: loc("u_resolution"),
      u_charSize: loc("u_charSize"),
      u_gridSize: loc("u_gridSize"),
      u_numChars: loc("u_numChars"),
      u_colored: loc("u_colored"),
      u_blend: loc("u_blend"),
      u_highlight: loc("u_highlight"),
      u_brightness: loc("u_brightness"),
      u_mouse: loc("u_mouse"),
      u_mouseRadius: loc("u_mouseRadius"),
      u_trailLength: loc("u_trailLength"),
      u_trail: Array.from({ length: MAX_TRAIL }, (_, i) => loc(`u_trail[${i}]`)),
      u_time: loc("u_time"),
      u_rippleEnabled: loc("u_rippleEnabled"),
      u_rippleSpeed: loc("u_rippleSpeed"),
      u_ripples: Array.from({ length: MAX_RIPPLES }, (_, i) => loc(`u_ripples[${i}]`)),
      u_audioLevel: loc("u_audioLevel"),
      u_audioReactivity: loc("u_audioReactivity"),
      u_audioSensitivity: loc("u_audioSensitivity"),
    };
  }

  private render = (): void => {
    const { gl, program, uniforms: u, video } = this;
    if (!gl || !program || !u || video.paused || video.ended || gl.isContextLost()) return;

    const t0 = performance.now();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

    gl.uniform1i(u.u_colored, this.opts.colored ? 1 : 0);
    gl.uniform1f(u.u_blend, this.opts.blend / 100);
    gl.uniform1f(u.u_highlight, this.opts.highlight / 100);
    gl.uniform1f(u.u_brightness, this.opts.brightness);
    gl.uniform1f(u.u_time, t0 / 1000);

    this.uploadMouseUniforms(gl, u);
    this.uploadRippleUniforms(gl, u);
    this.uploadAudioUniforms(gl, u);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.frameCount++;
    this.frameTimes.push(performance.now() - t0);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    if (t0 - this.lastFpsTime >= 1000) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this._stats = { fps: this.frameCount, frameTime: avg };
      this.opts.onStats?.(this._stats);
      this.frameCount = 0;
      this.lastFpsTime = t0;
    }

    this.animationId = requestAnimationFrame(this.render);
  };

  private addMouseListeners(): void {
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mouseleave", this.handleMouseLeave);
    this.canvas.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.handleTouchEnd);

    this.trailIntervalId = window.setInterval(() => {
      if (this.mouse.x < 0) return;

      const last = this.trail[0];
      const moved = !last
        || Math.abs(last.x - this.mouse.x) > 0.005
        || Math.abs(last.y - this.mouse.y) > 0.005;

      if (moved) {
        this.lastMoveTime = performance.now();
        this.trail.unshift({ ...this.mouse });
        if (this.trail.length > this.opts.trailLength) this.trail.pop();
      } else if (this.trail.length > 0) {
        this.trail.pop();
        if (this.trail.length > 0) this.trail.pop();
      }
    }, TRAIL_INTERVAL_MS);
  }

  private removeMouseListeners(): void {
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("mouseleave", this.handleMouseLeave);
    this.canvas.removeEventListener("touchmove", this.handleTouchMove);
    this.canvas.removeEventListener("touchend", this.handleTouchEnd);
    clearInterval(this.trailIntervalId);
    this.trailIntervalId = 0;
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
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

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse = {
      x: (touch.clientX - rect.left) / rect.width,
      y: (touch.clientY - rect.top) / rect.height,
    };
    this.lastMoveTime = performance.now();
  }

  private uploadMouseUniforms(gl: WebGL2RenderingContext, u: UniformLocations): void {
    if (!this.opts.enableMouse) return;

    const elapsed = performance.now() - this.lastMoveTime;
    const glow = elapsed < 1000 ? 1.0 : Math.max(0, 1 - (elapsed - 1000) / 500);

    if (glow <= 0) {
      gl.uniform2f(u.u_mouse, -1.0, -1.0);
      gl.uniform1f(u.u_mouseRadius, 0.0);
      gl.uniform1i(u.u_trailLength, 0);
      return;
    }

    gl.uniform2f(u.u_mouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(u.u_mouseRadius, glow);
    gl.uniform1i(u.u_trailLength, this.trail.length);

    for (let i = 0; i < MAX_TRAIL; i++) {
      const loc = u.u_trail[i];
      if (!loc) continue;
      const p = this.trail[i];
      gl.uniform2f(loc, p?.x ?? -1, p?.y ?? -1);
    }
  }

  private onClick(e: MouseEvent): void {
    if (!this.opts.enableRipple) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ripples.unshift({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      startTime: performance.now() / 1000,
    });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.pop();
  }

  private uploadRippleUniforms(gl: WebGL2RenderingContext, u: UniformLocations): void {
    if (!this.opts.enableRipple) return;

    const now = performance.now() / 1000;
    gl.uniform1f(u.u_time, now);
    gl.uniform1f(u.u_rippleEnabled, 1);
    gl.uniform1f(u.u_rippleSpeed, this.opts.rippleSpeed);

    const maxDist = Math.hypot(this._dimensions.cols, this._dimensions.rows);
    const maxLife = maxDist / this.opts.rippleSpeed + 1;
    this.ripples = this.ripples.filter(r => now - r.startTime < maxLife);

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const loc = u.u_ripples[i];
      if (!loc) continue;
      const r = this.ripples[i];
      gl.uniform4f(loc, r?.x ?? 0, r?.y ?? 0, r?.startTime ?? 0, r ? 1 : 0);
    }
  }

  private connectAudio(): void {
    if (this.connectedVideo === this.video && this.audioContext) {
      this.audioContext.resume();
      return;
    }

    try {
      this.audioContext ??= new AudioContext();
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      this.analyser = analyser;
      this.audioData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

      const source = this.audioContext.createMediaElementSource(this.video);
      source.connect(analyser);
      analyser.connect(this.audioContext.destination);
      this.connectedVideo = this.video;
      this.audioContext.resume();
    } catch {
      // audio connection failed silently
    }
  }

  private uploadAudioUniforms(gl: WebGL2RenderingContext, u: UniformLocations): void {
    if (this.opts.audioEffect <= 0) return;

    if (this.analyser && this.audioData) {
      this.analyser.getByteFrequencyData(this.audioData);
      let sum = 0;
      for (let i = 0; i < this.audioData.length; i++) sum += this.audioData[i];
      this.volume = this.volume * 0.7 + (sum / this.audioData.length / 255) * 0.3;
    }

    gl.uniform1f(u.u_audioLevel, this.volume);
    gl.uniform1f(u.u_audioReactivity, this.opts.audioEffect / 100);
    gl.uniform1f(u.u_audioSensitivity, this.opts.audioRange / 100);
  }

  private onMetadata(): void {
    this.initWebGL();
    if (this.opts.autoPlay) this.play();
  }

  private onPlay(): void {
    this._isPlaying = true;
    this.animationId = requestAnimationFrame(this.render);
  }

  private onStop(): void {
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
