from fastapi import FastAPI
from fastapi.responses import Response

app = FastAPI()


@app.get("/api/draft", operation_id="duplicate")
async def draft_response() -> dict[str, str]:
    return {"status": "draft"}


@app.get("/api/v1/duplicate", operation_id="duplicate")
async def duplicate_response() -> dict[str, str]:
    return {"status": "duplicate"}


@app.get("/api/v1/missing", response_class=Response)
async def missing_response() -> Response:
    return Response()
