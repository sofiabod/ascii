import type { CharsetKey } from "../ascii-charsets";

export const CHAR_WIDTH_RATIO = 0.6;

export interface AsciiStats {
  fps: number;
  frameTime: number;
}

export interface GridDimensions {
  cols: number;
  rows: number;
}

export type UniformSetter = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  locations: UniformLocations
) => void;

export interface UniformLocations {
  u_video: WebGLUniformLocation | null;
  u_asciiAtlas: WebGLUniformLocation | null;
  u_resolution: WebGLUniformLocation | null;
  u_charSize: WebGLUniformLocation | null;
  u_gridSize: WebGLUniformLocation | null;
  u_numChars: WebGLUniformLocation | null;
  u_colored: WebGLUniformLocation | null;
  u_blend: WebGLUniformLocation | null;
  u_highlight: WebGLUniformLocation | null;
  u_brightness: WebGLUniformLocation | null;
  u_mouse: WebGLUniformLocation | null;
  u_mouseRadius: WebGLUniformLocation | null;
  u_trailLength: WebGLUniformLocation | null;
  u_trail: (WebGLUniformLocation | null)[];
  u_time: WebGLUniformLocation | null;
  u_rippleEnabled: WebGLUniformLocation | null;
  u_rippleSpeed: WebGLUniformLocation | null;
  u_ripples: (WebGLUniformLocation | null)[];
  u_audioLevel: WebGLUniformLocation | null;
  u_audioReactivity: WebGLUniformLocation | null;
  u_audioSensitivity: WebGLUniformLocation | null;
}

export interface UseVideoToAsciiOptions {
  fontSize?: number;
  colored?: boolean;
  blend?: number;
  highlight?: number;
  brightness?: number;
  charset?: CharsetKey;
  maxWidth?: number;
  numColumns?: number;
  enableSpacebarToggle?: boolean;
  onStats?: (stats: AsciiStats) => void;
}

export interface UseAsciiMouseEffectOptions {
  enabled?: boolean;
  trailLength?: number;
}

export interface UseAsciiRippleOptions {
  enabled?: boolean;
  speed?: number;
}

export interface UseAsciiAudioOptions {
  enabled?: boolean;
  reactivity?: number;
  sensitivity?: number;
}

export interface AsciiContext {
  containerRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  glRef: React.RefObject<WebGL2RenderingContext | null>;
  programRef: React.RefObject<WebGLProgram | null>;
  uniformLocationsRef: React.RefObject<UniformLocations | null>;
  registerUniformSetter: (id: string, setter: UniformSetter) => void;
  unregisterUniformSetter: (id: string) => void;
  dimensions: GridDimensions;
  stats: AsciiStats;
  isReady: boolean;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

export interface MouseEffectHandlers {
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: () => void;
}

export interface RippleHandlers {
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export interface VideoToAsciiProps {
  src: string;
  numColumns?: number;
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
  isPlaying?: boolean;
  autoPlay?: boolean;
  enableSpacebarToggle?: boolean;
  showStats?: boolean;
  className?: string;
  onRenderer?: (renderer: import("../../core/AsciiRenderer").AsciiRenderer | null) => void;
}

export interface VideoToAsciiWebGLProps extends VideoToAsciiProps {
  showBenchmark?: boolean;
  muted?: boolean;
}

export interface BenchmarkStats extends AsciiStats {
  gpuTime: number;
}

export interface WebGLResources {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  videoTexture: WebGLTexture;
  atlasTexture: WebGLTexture;
}

export interface Ripple {
  x: number;
  y: number;
  startTime: number;
}
