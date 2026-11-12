from collections.abc import Mapping

from presentation.api.analytics_insight_contracts import (
    IntensityDistributionResponse,
)


def intensity_distribution_item(
    row: Mapping[str, object], zone_seconds: list[int]
) -> IntensityDistributionResponse:
    return IntensityDistributionResponse.model_validate(
        {
            "bucket": row["week_start"],
            "zone_seconds": zone_seconds,
            "by_zone": row["by_zone"],
            "distribution_type": row["distribution_type"],
            "work_domain_seconds": row.get(
                "work_domain_seconds",
                {
                    "below_mt1": 0.0,
                    "mt1_mt2": 0.0,
                    "mt2_wmax": 0.0,
                    "above_wmax": 0.0,
                    "low_unspecified": 0.0,
                },
            ),
        }
    )
