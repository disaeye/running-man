from __future__ import annotations

import re
from pathlib import Path


OMH_STREAM_ROW = re.compile(r"^\| `([a-z_]+)` \|")


def documented_stream_keys(root: Path) -> list[str]:
    mapping = root / "infra" / "db" / "omh_mapping.md"
    lines = mapping.read_text(encoding="utf-8").splitlines()
    stream_section = lines[lines.index("## `activity_streams.metric_type` mappings") : lines.index("## Location fields")]
    return [match.group(1) for line in stream_section if (match := OMH_STREAM_ROW.match(line))]
