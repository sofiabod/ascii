"use client";

import { useEffect, useRef, useState } from "react";
import { AsciiRenderer } from "../core/AsciiRenderer";
import type { VideoToAsciiProps, AsciiStats } from "../lib/webgl/types";

export type { VideoToAsciiProps };

export function Video2Ascii({
  src,
  numColumns,
  colored = true,
  blend = 0,
  highlight = 0,
  brightness = 1.0,
  charset = "standard",
  enableMouse = true,
  trailLength = 24,
  enableRipple = false,
  rippleSpeed = 40,
  audioEffect = 0,
  audioRange = 50,
  isPlaying = true,
  autoPlay = true,
  enableSpacebarToggle = false,
  showStats = false,
  className = "",
  onRenderer,
}: VideoToAsciiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AsciiRenderer | null>(null);
  const [stats, setStats] = useState<AsciiStats>({ fps: 0, frameTime: 0 });
  const [dimensions, setDimensions] = useState({ cols: 80, rows: 24 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new AsciiRenderer(container, {
      videoSrc: src,
      columns: numColumns,
      colored,
      blend,
      highlight,
      brightness,
      charset,
      enableMouse,
      trailLength,
      enableRipple,
      rippleSpeed,
      audioEffect,
      audioRange,
      autoPlay,
      enableSpacebarToggle,
      onStats: (s) => {
        setStats(s);
        setDimensions(renderer.dimensions);
      },
      onReady: () => {
        setIsReady(true);
        setDimensions(renderer.dimensions);
      },
    });

    rendererRef.current = renderer;
    onRenderer?.(renderer);

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      onRenderer?.(null);
      setIsReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    rendererRef.current?.setOptions({
      colored,
      blend,
      highlight,
      brightness,
      charset,
      columns: numColumns,
      enableMouse,
      trailLength,
      enableRipple,
      rippleSpeed,
      audioEffect,
      audioRange,
      enableSpacebarToggle,
    });
  }, [
    colored,
    blend,
    highlight,
    brightness,
    charset,
    numColumns,
    enableMouse,
    trailLength,
    enableRipple,
    rippleSpeed,
    audioEffect,
    audioRange,
    enableSpacebarToggle,
  ]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (isPlaying) {
      if (autoPlay && renderer.isReady) {
        renderer.play();
      }
    } else {
      renderer.pause();
    }
  }, [isPlaying, autoPlay, isReady]);

  return (
    <div className={`video-to-ascii ${className}`}>
      <div
        ref={containerRef}
        className="relative cursor-pointer select-none overflow-hidden bg-black"
      >
        {showStats && isReady && (
          <div className="absolute top-2 left-2 bg-black/70 text-green-400 px-2 py-1 text-xs font-mono">
            {stats.fps} FPS | {stats.frameTime.toFixed(2)}ms | {dimensions.cols}
            ×{dimensions.rows}
          </div>
        )}
      </div>
    </div>
  );
}

export default Video2Ascii;
