"""跑步课的预计训练压力（rTSS 近似）。

TSS ≈ 小时数 × IF² × 100，其中 IF = 阈值配速 / 课程平均配速
（两者均为秒每公里，越快数值越小，所以快于阈值时 IF 大于 1）。
IF 封顶在 1.3：更快的段落按 1.3 计，避免把冲刺外推成天文数字。
"""

from __future__ import annotations

from typing import Final

TSS_ESTIMATE_ALGORITHM_VERSION: Final = "1.0.0"
TSS_ESTIMATE_SOURCE_REFS: Final[tuple[str, ...]] = ("rTSS-approx",)

MAX_INTENSITY_FACTOR: Final = 1.3


def estimate_session_tss(
    duration_min: int,
    mean_pace_s_per_km: float,
    threshold_pace_s_per_km: float,
) -> float:
    """一节跑步课的预计 TSS，保留一位小数。"""
    if duration_min <= 0:
        raise ValueError("课程时长必须为正数，才能估算训练压力")
    if mean_pace_s_per_km <= 0 or threshold_pace_s_per_km <= 0:
        raise ValueError("配速必须为正数，才能估算训练压力")
    intensity_factor = min(threshold_pace_s_per_km / mean_pace_s_per_km, MAX_INTENSITY_FACTOR)
    return round(duration_min / 60.0 * intensity_factor**2 * 100, 1)
