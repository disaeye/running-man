"""Constants for the load computation pipeline."""

from typing import Final

# A pace series needs at least two distance samples to derive a speed.
MIN_PACE_STREAM_SAMPLES: Final = 2

# Longest gap treated as continuous movement when integrating speed. A larger
# interval means the recording paused; bridging it at the last known speed would
# invent distance.
MAX_SPEED_GAP_SECONDS: Final = 30.0
