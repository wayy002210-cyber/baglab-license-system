from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from app.media.asset_scanner import AssetScanner, Ffprobe, ScanResult
from app.copywriting.bailian import BailianChat
from app.copywriting.service import (
    CopywritingService,
    RewriteRequest,
    RewriteResult,
    StructuredOutputError,
)


class CreateTaskRequest(BaseModel):
    templateId: str = Field(min_length=1)
    personaId: str = Field(min_length=1)
    count: int = Field(ge=1, le=20)

class ScanAssetsRequest(BaseModel):
    folder_path: str = Field(alias="folderPath", min_length=1)


class Scanner(Protocol):
    def scan(self, root: Path) -> ScanResult: ...


class Copywriter(Protocol):
    def rewrite(
        self, *, api_key: str, model: str, request: RewriteRequest
    ) -> RewriteResult: ...


def create_app(
    session_token: str | None = None,
    asset_scanner: Scanner | None = None,
    copywriting_service: Copywriter | None = None,
) -> FastAPI:
    token = session_token or os.environ.get("AUTOCUT_SESSION_TOKEN")
    if not token:
        raise RuntimeError("AUTOCUT_SESSION_TOKEN is required")

    app = FastAPI(title="AutoCut Local Service", version="0.1.0")
    scanner = asset_scanner or AssetScanner(Ffprobe())
    copywriter = copywriting_service or CopywritingService(BailianChat())

    def authorize(x_autocut_token: str | None = Header(default=None)) -> None:
        if x_autocut_token != token:
            raise HTTPException(status_code=401, detail="Invalid session token")

    @app.get("/health", dependencies=[Depends(authorize)])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "autocut-backend"}

    @app.post("/tasks", status_code=201, dependencies=[Depends(authorize)])
    def create_task(payload: CreateTaskRequest) -> dict[str, object]:
        return {"status": "queued", "count": payload.count}

    @app.post(
        "/assets/scan",
        response_model=ScanResult,
        dependencies=[Depends(authorize)],
    )
    def scan_assets(payload: ScanAssetsRequest) -> ScanResult:
        try:
            return scanner.scan(Path(payload.folder_path))
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post(
        "/copywriting/rewrite",
        response_model=RewriteResult,
        dependencies=[Depends(authorize)],
    )
    def rewrite_copywriting(
        payload: RewriteRequest,
        x_bailian_key: str | None = Header(default=None),
    ) -> RewriteResult:
        if not x_bailian_key:
            raise HTTPException(status_code=401, detail="Bailian API key is required")
        try:
            return copywriter.rewrite(
                api_key=x_bailian_key,
                model="qwen-plus",
                request=payload,
            )
        except StructuredOutputError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    return app


def run() -> None:
    import uvicorn

    port = int(os.environ.get("AUTOCUT_PORT", "0"))
    app = create_app()
    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    run()
