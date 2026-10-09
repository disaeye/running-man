from .constants import FTP_REFERENCE_TSS, HR_TSS_PER_HOUR_BY_ZONE, SECONDS_PER_HOUR


def intensity_factor(np: float, ftp: float) -> float:
    return np / ftp


def power_tss(duration_s: int, np: float, ftp: float) -> float:
    effort_ratio = intensity_factor(np=np, ftp=ftp)
    return (duration_s * np * effort_ratio) / (ftp * SECONDS_PER_HOUR) * FTP_REFERENCE_TSS


def pace_intensity_factor(ngp: float, threshold_pace: float) -> float:
    """Running intensity factor: threshold_pace / NGP.

    Pace is inverse to intensity (a faster, smaller pace value is harder), so
    the IF is the threshold pace divided by the actual (graded) pace. This
    mirrors ``np / ftp`` for power: an NGP equal to threshold pace → IF 1.0.
    Both inputs are in s/km.
    """
    return threshold_pace / ngp


def pace_tss(duration_s: int, ngp: float, threshold_pace: float) -> float:
    """Running TSS (rTSS) from Normalized Graded Pace and threshold pace.

    Structurally identical to ``power_tss`` with NGP/threshold_pace standing in
    for NP/FTP. ``ngp`` and ``threshold_pace`` are both s/km.
    """
    effort_ratio = pace_intensity_factor(ngp=ngp, threshold_pace=threshold_pace)
    return (duration_s * effort_ratio * effort_ratio) / SECONDS_PER_HOUR * FTP_REFERENCE_TSS


def hr_tss(time_in_zones: dict[int, float]) -> float:
    return sum(
        seconds / SECONDS_PER_HOUR * HR_TSS_PER_HOUR_BY_ZONE[zone]
        for zone, seconds in time_in_zones.items()
        if zone in HR_TSS_PER_HOUR_BY_ZONE
    )


def estimate_tss(
    *,
    duration_s: int,
    np: float | None = None,
    ftp: float | None = None,
    time_in_hr_zones: dict[int, float] | None = None,
    ngp: float | None = None,
    threshold_pace: float | None = None,
) -> float | None:
    """Best-available session load, by preference: power > pace > HR.

    For running the dominant signal is pace relative to threshold (rTSS); power
    is rare (running power meters). Falling back to HR zones captures runs with
    neither — but pace, when available, is the first-class dose because it is
    the external work, not the internal response.
    """
    if np is not None and ftp is not None:
        return power_tss(duration_s=duration_s, np=np, ftp=ftp)
    if ngp is not None and threshold_pace is not None:
        return pace_tss(duration_s=duration_s, ngp=ngp, threshold_pace=threshold_pace)
    if time_in_hr_zones:
        return hr_tss(time_in_hr_zones)
    return None
