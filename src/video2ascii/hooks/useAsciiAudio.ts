import { useEffect, useRef } from "react";
import type { AsciiContext, UseAsciiAudioOptions } from "../lib/webgl";

export type { UseAsciiAudioOptions };

export function useAsciiAudio(
  ascii: AsciiContext,
  options: UseAsciiAudioOptions = {}
): void {
  const { enabled = false, reactivity = 50, sensitivity = 50 } = options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const volumeRef = useRef(0);
  const connectedVideoRef = useRef<HTMLVideoElement | null>(null);

  const enabledRef = useRef(enabled);
  const reactivityRef = useRef(reactivity);
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => {
    enabledRef.current = enabled;
    reactivityRef.current = reactivity;
    sensitivityRef.current = sensitivity;
  }, [enabled, reactivity, sensitivity]);

  const updateVolume = () => {
    const analyzer = analyzerRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyzer || !dataArray) return;

    analyzer.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length / 255;
    volumeRef.current = volumeRef.current * 0.7 + average * 0.3;
  };

  useEffect(() => {
    if (!enabled) return;

    const video = ascii.videoRef.current;
    if (!video) return;

    const connectAudio = () => {
      if (connectedVideoRef.current === video && audioContextRef.current) {
        audioContextRef.current.resume();
        return;
      }

      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        const ctx = audioContextRef.current;

        const analyzer = ctx.createAnalyser();
        analyzer.fftSize = 256;
        analyzer.smoothingTimeConstant = 0.8;
        analyzerRef.current = analyzer;

        dataArrayRef.current = new Uint8Array(
          analyzer.frequencyBinCount
        ) as Uint8Array<ArrayBuffer>;

        const source = ctx.createMediaElementSource(video);
        source.connect(analyzer);
        analyzer.connect(ctx.destination);
        sourceRef.current = source;
        connectedVideoRef.current = video;

        ctx.resume();
      } catch (error) {
        console.warn("Failed to connect audio analyzer:", error);
      }
    };

    const handlePlay = () => {
      connectAudio();
    };

    video.addEventListener("play", handlePlay);

    if (!video.paused) {
      connectAudio();
    }

    return () => {
      video.removeEventListener("play", handlePlay);
    };
  }, [ascii.videoRef, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const uniformSetter = (
      gl: WebGL2RenderingContext,
      _program: WebGLProgram,
      locations: NonNullable<typeof ascii.uniformLocationsRef.current>
    ) => {
      updateVolume();

      gl.uniform1f(locations.u_audioLevel, volumeRef.current);
      gl.uniform1f(locations.u_audioReactivity, reactivityRef.current / 100);
      gl.uniform1f(locations.u_audioSensitivity, sensitivityRef.current / 100);
    };

    ascii.registerUniformSetter("audio", uniformSetter);

    return () => {
      ascii.unregisterUniformSetter("audio");
    };
  }, [ascii, enabled]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
}
