import type { CharsetKey } from "../ascii-charsets";

export const CHAR_WIDTH_RATIO = 0.6;

export interface AsciiStats {
  fps: number;
  frameTime: number;
}

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
