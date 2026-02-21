import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { getCharArray, DEFAULT_CHARSET } from "../lib/ascii-charsets";
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
  type UseVideoToAsciiOptions,
  type AsciiContext,
  type AsciiStats,
  type UniformSetter,
  type UniformLocations,
} from "../lib/webgl";

export type { UseVideoToAsciiOptions, AsciiContext, AsciiStats };

const MAX_TRAIL_LENGTH = 18;
const MAX_RIPPLES = 8;

export function useVideoToAscii(
  options: UseVideoToAsciiOptions = {}
): AsciiContext {
  const {
    fontSize,
    numColumns,
    colored = true,
    blend = 0,
    highlight = 0,
    brightness = 1.0,
    charset = DEFAULT_CHARSET,
    maxWidth,
    enableSpacebarToggle = false,
    onStats,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const videoTextureRef = useRef<WebGLTexture | null>(null);
  const atlasTextureRef = useRef<WebGLTexture | null>(null);
  const animationRef = useRef<number>(0);

  const uniformSettersRef = useRef<Map<string, UniformSetter>>(new Map());
  const uniformLocationsRef = useRef<UniformLocations | null>(null);

  const frameCountRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFpsTimeRef = useRef(performance.now());

  const [dimensions, setDimensions] = useState({ cols: 80, rows: 24 });
  const [stats, setStats] = useState<AsciiStats>({ fps: 0, frameTime: 0 });
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const defaultWidth = typeof window !== "undefined" ? window.innerWidth : 900;
  const containerWidth = maxWidth || defaultWidth;
  const calculatedFontSize = numColumns
    ? containerWidth / (numColumns * CHAR_WIDTH_RATIO)
    : fontSize || 10;
  const calculatedMaxWidth = numColumns
    ? numColumns * calculatedFontSize * CHAR_WIDTH_RATIO
    : maxWidth || 900;

  const charWidth = calculatedFontSize * CHAR_WIDTH_RATIO;
  const cols = numColumns || Math.floor(calculatedMaxWidth / charWidth);
  const chars = useMemo(() => getCharArray(charset), [charset]);

  const registerUniformSetter = useCallback(
    (id: string, setter: UniformSetter) => {
      uniformSettersRef.current.set(id, setter);
    },
    []
  );

  const unregisterUniformSetter = useCallback((id: string) => {
    uniformSettersRef.current.delete(id);
  }, []);

  const cacheUniformLocations = useCallback(
    (gl: WebGL2RenderingContext, program: WebGLProgram): UniformLocations => {
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
    },
    []
  );

  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const container = containerRef.current;
    if (!canvas || !video || !video.videoWidth) return false;

    let finalFontSize = calculatedFontSize;
    let finalCols = cols;
    if (numColumns && container) {
      const actualWidth = container.clientWidth || defaultWidth;
      finalFontSize = actualWidth / (numColumns * CHAR_WIDTH_RATIO);
      finalCols = numColumns;
    }

    const grid = calculateGridDimensions(
      video.videoWidth,
      video.videoHeight,
      finalCols
    );
    setDimensions(grid);

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
    glRef.current = gl;

    const vertexShader = compileShader(gl, VERTEX_SHADER, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(
      gl,
      FRAGMENT_SHADER,
      gl.FRAGMENT_SHADER
    );
    if (!vertexShader || !fragmentShader) return false;

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return false;
    programRef.current = program;
    gl.useProgram(program);

    createFullscreenQuad(gl, program);

    videoTextureRef.current = createVideoTexture(gl);
    const finalFontSizeForAtlas =
      numColumns && container
        ? (container.clientWidth || defaultWidth) /
          (numColumns * CHAR_WIDTH_RATIO)
        : calculatedFontSize;
    atlasTextureRef.current = createAsciiAtlas(
      gl,
      chars,
      finalFontSizeForAtlas
    );

    const locations = cacheUniformLocations(gl, program);
    uniformLocationsRef.current = locations;

    gl.uniform1i(locations.u_video, 0);
    gl.uniform1i(locations.u_asciiAtlas, 1);

    gl.uniform2f(locations.u_resolution, pixelWidth, pixelHeight);
    gl.uniform2f(locations.u_charSize, finalCharWidth, finalFontSize);
    gl.uniform2f(locations.u_gridSize, finalCols, grid.rows);
    gl.uniform1f(locations.u_numChars, chars.length);
    gl.uniform1f(locations.u_brightness, brightness);

    gl.uniform2f(locations.u_mouse, -1, -1);
    gl.uniform1f(locations.u_mouseRadius, 0);
    gl.uniform1i(locations.u_trailLength, 0);
    gl.uniform1f(locations.u_rippleEnabled, 0);
    gl.uniform1f(locations.u_audioLevel, 0);
    gl.uniform1f(locations.u_audioReactivity, 0);
    gl.uniform1f(locations.u_audioSensitivity, 0);

    gl.viewport(0, 0, Math.round(pixelWidth * dpr), Math.round(pixelHeight * dpr));

    setIsReady(true);
    return true;
  }, [
    cols,
    numColumns,
    calculatedFontSize,
    chars,
    cacheUniformLocations,
    brightness,
    defaultWidth,
  ]);

  const render = useCallback(() => {
    const gl = glRef.current;
    const video = videoRef.current;
    const program = programRef.current;
    const locations = uniformLocationsRef.current;

    if (!gl || !video || !program || !locations || video.paused || video.ended)
      return;

    const frameStart = performance.now();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTextureRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTextureRef.current);

    gl.uniform1i(locations.u_colored, colored ? 1 : 0);
    gl.uniform1f(locations.u_blend, blend / 100);
    gl.uniform1f(locations.u_highlight, highlight / 100);
    gl.uniform1f(locations.u_brightness, brightness);
    gl.uniform1f(locations.u_time, performance.now() / 1000.0);

    for (const setter of uniformSettersRef.current.values()) {
      setter(gl, program, locations);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const frameEnd = performance.now();
    frameCountRef.current++;
    frameTimesRef.current.push(frameEnd - frameStart);
    if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();

    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      const avgFrameTime =
        frameTimesRef.current.reduce((a, b) => a + b, 0) /
        frameTimesRef.current.length;
      const newStats = { fps: frameCountRef.current, frameTime: avgFrameTime };
      setStats(newStats);
      onStats?.(newStats);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    animationRef.current = requestAnimationFrame(render);
  }, [colored, blend, highlight, brightness, onStats]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      initWebGL();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      animationRef.current = requestAnimationFrame(render);
    };

    const handlePause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationRef.current);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationRef.current);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      cancelAnimationFrame(animationRef.current);
    };
  }, [initWebGL, render]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= 1) {
      initWebGL();
    }
  }, [initWebGL]);

  useEffect(() => {
    if (!numColumns || !containerRef.current) return;

    const container = containerRef.current;
    const resizeObserver = new ResizeObserver(() => {
      if (videoRef.current && videoRef.current.readyState >= 1) {
        const wasPlaying = !videoRef.current.paused;
        if (initWebGL() && wasPlaying) {
          requestAnimationFrame(() => {
            render();
          });
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [numColumns, initWebGL, render]);

  useEffect(() => {
    return () => {
      const gl = glRef.current;
      if (gl) {
        if (videoTextureRef.current) gl.deleteTexture(videoTextureRef.current);
        if (atlasTextureRef.current) gl.deleteTexture(atlasTextureRef.current);
        if (programRef.current) gl.deleteProgram(programRef.current);
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const play = useCallback(() => {
    videoRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  useEffect(() => {
    if (!enableSpacebarToggle) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, enableSpacebarToggle]);

  return {
    containerRef,
    videoRef,
    canvasRef,
    glRef,
    programRef,
    uniformLocationsRef,
    registerUniformSetter,
    unregisterUniformSetter,
    dimensions,
    stats,
    isReady,
    isPlaying,
    play,
    pause,
    toggle,
  };
}
