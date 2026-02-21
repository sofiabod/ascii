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
    colored, blend, highlight, brightness, charset, numColumns,
    enableMouse, trailLength, enableRipple, rippleSpeed,
    audioEffect, audioRange, enableSpacebarToggle,
  ]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (isPlaying && autoPlay && renderer.isReady) renderer.play();
    else if (!isPlaying) renderer.pause();
  }, [isPlaying, autoPlay, isReady]);

  return (
    <div className={`video-to-ascii ${className}`}>
      <div ref={containerRef} style={{ overflow: "hidden", background: "#000" }}>
        {showStats && isReady && (
          <div style={{
            position: "absolute",
            top: 8,
            left: 8,
            background: "rgba(0,0,0,0.7)",
            color: "#4ade80",
            padding: "4px 8px",
            fontSize: 12,
            fontFamily: "monospace",
          }}>
            {stats.fps} FPS | {stats.frameTime.toFixed(2)}ms | {dimensions.cols}x{dimensions.rows}
          </div>
        )}
      </div>
    </div>
  );
}

export default Video2Ascii;
