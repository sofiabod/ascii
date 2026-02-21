import { useCallback, useEffect, useRef } from "react";
import type {
  AsciiContext,
  UseAsciiMouseEffectOptions,
  MouseEffectHandlers,
} from "../lib/webgl";

export type { UseAsciiMouseEffectOptions, MouseEffectHandlers };

const MAX_TRAIL_LENGTH = 18;
const TRAIL_INTERVAL = 60;

interface MousePosition {
  x: number;
  y: number;
}

export function useAsciiMouseEffect(
  ascii: AsciiContext,
  options: UseAsciiMouseEffectOptions = {}
): MouseEffectHandlers {
  const { enabled = true, trailLength = 18 } = options;

  const mouseRef = useRef<MousePosition>({ x: -1, y: -1 });
  const trailRef = useRef<MousePosition[]>([]);
  const enabledRef = useRef(enabled);
  const trailLengthRef = useRef(trailLength);
  const intervalRef = useRef<number>(0);
  const lastMoveTimeRef = useRef(0);

  useEffect(() => {
    enabledRef.current = enabled;
    trailLengthRef.current = trailLength;
  }, [enabled, trailLength]);

  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = window.setInterval(() => {
      const pos = mouseRef.current;
      if (pos.x < 0) return;

      const trail = trailRef.current;
      const last = trail[0];
      const dx = last ? Math.abs(last.x - pos.x) : 1;
      const dy = last ? Math.abs(last.y - pos.y) : 1;
      const moved = !last || dx > 0.005 || dy > 0.005;

      if (moved) {
        lastMoveTimeRef.current = performance.now();
        trail.unshift({ ...pos });
        if (trail.length > trailLengthRef.current) {
          trail.pop();
        }
      } else if (trail.length > 0) {
        trail.pop();
        if (trail.length > 0) trail.pop();
      }
    }, TRAIL_INTERVAL);

    return () => clearInterval(intervalRef.current);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const uniformSetter = (
      gl: WebGL2RenderingContext,
      _program: WebGLProgram,
      locations: NonNullable<typeof ascii.uniformLocationsRef.current>
    ) => {
      const timeSinceMove = performance.now() - lastMoveTimeRef.current;
      const glow = timeSinceMove < 200 ? 1.0 : Math.max(0, 1.0 - (timeSinceMove - 200) / 500);

      gl.uniform2f(locations.u_mouse, mouseRef.current.x, mouseRef.current.y);
      gl.uniform1f(locations.u_mouseRadius, glow);

      const trail = trailRef.current;
      gl.uniform1i(locations.u_trailLength, trail.length);

      for (let i = 0; i < MAX_TRAIL_LENGTH; i++) {
        const loc = locations.u_trail[i];
        if (loc) {
          const pos = trail[i] || { x: -1, y: -1 };
          gl.uniform2f(loc, pos.x, pos.y);
        }
      }
    };

    ascii.registerUniformSetter("mouse", uniformSetter);

    return () => {
      ascii.unregisterUniformSetter("mouse");
    };
  }, [ascii, enabled]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabledRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    lastMoveTimeRef.current = performance.now();
  }, []);

  const onMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1, y: -1 };
    trailRef.current = [];
    lastMoveTimeRef.current = 0;
  }, []);

  return { onMouseMove, onMouseLeave };
}
