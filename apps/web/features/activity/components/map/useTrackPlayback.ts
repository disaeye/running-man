"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TrackPlayback {
  /** 0..1，当前回放进度 */
  progress: number;
  playing: boolean;
  toggle: () => void;
  pause: () => void;
}

const REPLAY_SECONDS = 20;

/**
 * 轨迹回放的播放状态：默认静止展示完整轨迹（progress = 1），按需点击播放。
 */
export function useTrackPlayback(): TrackPlayback {
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(1);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = progressRef.current + dt / REPLAY_SECONDS;
      if (next >= 1) {
        progressRef.current = 1;
        setProgress(1);
        setPlaying(false);
        return;
      }
      setProgress(next);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(() => {
    setPlaying((wasPlaying) => {
      if (!wasPlaying && progressRef.current >= 0.999) {
        progressRef.current = 0;
        setProgress(0);
      }
      return !wasPlaying;
    });
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  return { progress, playing, toggle, pause };
}
