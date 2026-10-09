import "vitest-canvas-mock";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

if (typeof window !== "undefined") {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

  if (typeof Element !== "undefined") {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
  }

  if (!window.ResizeObserver) {
    const instances = new Set<ResizeObserverStub>();

    class ResizeObserverStub {
      readonly _targets = new Set<Element>();
      private readonly _callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this._callback = callback;
        instances.add(this);
      }

      observe(target: Element): void {
        this._targets.add(target);
      }

      unobserve(target: Element): void {
        this._targets.delete(target);
      }

      disconnect(): void {
        this._targets.clear();
        instances.delete(this);
      }

      _emit(entries: ResizeObserverEntry[]): void {
        const active = entries.filter((entry) => this._targets.has(entry.target));
        if (active.length > 0) this._callback(active, this as unknown as ResizeObserver);
      }

      static flush(entries: ResizeObserverEntry[]): void {
        for (const instance of instances) instance._emit(entries);
      }

      static get _activeInstances(): ReadonlySet<ResizeObserverStub> {
        return instances;
      }
    }

    window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }

  if (!window.IntersectionObserver) {
    const instances = new Set<IntersectionObserverStub>();

    class IntersectionObserverStub {
      readonly _targets = new Set<Element>();
      private readonly _callback: IntersectionObserverCallback;
      readonly root: Element | Document | null;
      readonly rootMargin: string;
      readonly thresholds: ReadonlyArray<number>;

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this._callback = callback;
        this.root = options?.root ?? null;
        this.rootMargin = options?.rootMargin ?? "0px";
        const threshold = options?.threshold;
        this.thresholds = Array.isArray(threshold) ? threshold : [threshold ?? 0];
        instances.add(this);
      }

      observe(target: Element): void {
        this._targets.add(target);
      }

      unobserve(target: Element): void {
        this._targets.delete(target);
      }

      disconnect(): void {
        this._targets.clear();
        instances.delete(this);
      }

      _emit(entries: IntersectionObserverEntry[]): void {
        const active = entries.filter((entry) => this._targets.has(entry.target));
        if (active.length > 0) this._callback(active, this as unknown as IntersectionObserver);
      }

      static flush(entries: IntersectionObserverEntry[]): void {
        for (const instance of instances) instance._emit(entries);
      }

      static get _activeInstances(): ReadonlySet<IntersectionObserverStub> {
        return instances;
      }
    }

    window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
  }

  afterEach(() => {
    cleanup();
  });
}
