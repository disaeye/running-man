from datetime import datetime

from pydantic import BaseModel


class StreamPoint(BaseModel):
    sample_time: datetime
    metric_type: str
    value: float
    lat: float | None = None
    lon: float | None = None
    alt: float | None = None
