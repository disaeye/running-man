"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TrackPlayback {
  /** 0..1，当前回放进度 */
  progress: number;
  playing: boolean;
  toggle: () => void;
}

/** 整条轨迹播完一遍的时长（秒） */
const REPLAY_SECONDS = 20;

/**
 * 轨迹回放的播放状态。
 *
 * 进入页面就开始播放，播到终点后从头继续；点击画面暂停，再次点击继续。
 * 进度推进放在 requestAnimationFrame 里，`progress` 只由这里写。
 */
export function useTrackPlayback(): TrackPlayback {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const progressRef = useRef(0);

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
        progressRef.current = 0;
        setProgress(0);
      } else {
        setProgress(next);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(() => setPlaying((value) => !value), []);

  return { progress, playing, toggle };
}
