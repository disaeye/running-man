def detect_consecutive_hard_days(
    daily_tss: list[float], threshold: float = 100.0
) -> list[tuple[int, int]]:
    """Find 2+ day runs where daily TSS is strictly above threshold."""
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, tss in enumerate(daily_tss):
        if tss > threshold:
            if start is None:
                start = index
            continue
        if start is not None and index - start >= 2:
            runs.append((start, index - 1))
        start = None
    if start is not None and len(daily_tss) - start >= 2:
        runs.append((start, len(daily_tss) - 1))
    return runs
