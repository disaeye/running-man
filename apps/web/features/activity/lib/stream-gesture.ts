export type StreamGesture = "pending" | "reading" | "scrolling";

export function streamGesture(dx: number, dy: number, current: StreamGesture): StreamGesture {
  if (current !== "pending") return current;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return "pending";
  return Math.abs(dx) > Math.abs(dy) ? "reading" : "scrolling";
}

export function clampStreamRatio(clientX: number, left: number, width: number): number {
  return Math.min(1, Math.max(0, (clientX - left) / width));
}
