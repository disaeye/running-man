export function scrollToStreamCharts() {
  document.querySelector("[data-testid='stream-charts']")?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "center",
  });
}
