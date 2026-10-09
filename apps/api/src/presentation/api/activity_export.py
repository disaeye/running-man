from fastapi import HTTPException, Response, status

from infrastructure.auth.models import Athlete
from infrastructure.parsing.fit_writer import write_fit
from infrastructure.parsing.stream_reconstruction import samples_from_streams
from infrastructure.parsing.tcx_writer import write_tcx
from infrastructure.repositories.activity import ActivityRepo
from presentation.errors import NotFoundError

EXPORT_FORMATS = frozenset({"fit", "tcx"})
_EXPORT_MIME = {"fit": "application/vnd.ant.fit", "tcx": "application/xml"}


async def export_activity(
    activity_id: str,
    format: str,
    athlete: Athlete,
    repo: ActivityRepo,
) -> Response:
    file_format = format.lower()
    if file_format not in EXPORT_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unsupported export format: {format} (allowed: fit, tcx)",
        )
    activity = await repo.get_by_id(athlete.id, activity_id)
    if activity is None:
        if await repo.exists(activity_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="activity belongs to another athlete"
            )
        raise NotFoundError("activity not found")
    streams = await repo.get_streams(athlete.id, activity_id)
    samples = samples_from_streams(streams)
    if not samples:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="activity has no stream data to export"
        )
    sport = str(activity.get("sport") or "Run")
    body = write_fit(samples, sport) if file_format == "fit" else write_tcx(samples, sport)
    return Response(
        content=body,
        media_type=_EXPORT_MIME[file_format],
        headers={
            "Content-Disposition": (
                f'attachment; filename="{_safe_filename(activity_id)}.{file_format}"'
            ),
            "Content-Length": str(len(body)),
        },
    )


def _safe_filename(activity_id: str) -> str:
    return "".join(c if c.isalnum() or c in {"-", "_"} else "_" for c in activity_id)
