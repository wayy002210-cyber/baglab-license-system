from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TaskCanceledError(RuntimeError):
    pass


class TaskExecutionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    seed: int
    snapshot: dict[str, Any]
    output_path: str = Field(alias="outputPath", min_length=1)


class TaskEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(alias="taskId")
    status: str
    progress: float = Field(ge=0, le=100)
    stage: str | None = None
    message: str | None = None
    error_code: str | None = Field(default=None, alias="errorCode")
    error_message: str | None = Field(default=None, alias="errorMessage")
    created_at: str = Field(alias="createdAt")


Stage = Callable[
    [TaskExecutionRequest, dict[str, Any]],
    Awaitable[dict[str, Any]],
]
EventCallback = Callable[[TaskEvent], None]


class GenerationWorker:
    stage_progress = (
        ("preparing_copy", 5),
        ("generating_voice", 25),
        ("selecting_assets", 45),
        ("composing", 60),
        ("encoding", 75),
    )

    def __init__(
        self,
        *,
        stages: dict[str, Stage],
        encoding_lock: asyncio.Lock | None = None,
        on_cancel: Callable[[str], None] | None = None,
        on_start: Callable[[str], None] | None = None,
        on_finish: Callable[[str], None] | None = None,
    ) -> None:
        self.stages = stages
        self._canceled: set[str] = set()
        self._encoding_lock = encoding_lock or asyncio.Lock()
        self._on_cancel = on_cancel
        self._on_start = on_start
        self._on_finish = on_finish

    def cancel(self, task_id: str) -> None:
        self._canceled.add(task_id)
        if self._on_cancel:
            self._on_cancel(task_id)

    async def run(
        self,
        request: TaskExecutionRequest,
        *,
        on_event: EventCallback | None = None,
    ) -> dict[str, Any]:
        context: dict[str, Any] = {
            "seed": request.seed,
            "snapshot": request.snapshot,
            "outputPath": request.output_path,
        }
        if self._on_start:
            self._on_start(request.task_id)
        current_stage: str | None = None
        try:
            for stage_name, progress in self.stage_progress:
                self._raise_if_canceled(request.task_id)
                stage = self.stages.get(stage_name)
                if stage is None:
                    continue
                current_stage = stage_name
                self._emit(
                    on_event,
                    request.task_id,
                    status=stage_name,
                    progress=progress,
                    stage=stage_name,
                )
                if stage_name == "encoding":
                    async with self._encoding_lock:
                        self._raise_if_canceled(request.task_id)
                        context = await stage(request, context)
                else:
                    context = await stage(request, context)

            self._raise_if_canceled(request.task_id)
            self._emit(
                on_event,
                request.task_id,
                status="completed",
                progress=100,
                stage=current_stage,
            )
            return context
        except TaskCanceledError:
            self._emit(
                on_event,
                request.task_id,
                status="canceled",
                progress=0,
                stage=current_stage,
                message="Task canceled",
            )
            raise
        except Exception as error:
            if request.task_id in self._canceled:
                self._emit(
                    on_event,
                    request.task_id,
                    status="canceled",
                    progress=0,
                    stage=current_stage,
                    message="Task canceled",
                )
                raise TaskCanceledError(
                    f"Task canceled: {request.task_id}"
                ) from error
            self._emit(
                on_event,
                request.task_id,
                status="failed",
                progress=0,
                stage=current_stage,
                error_code="STAGE_FAILED",
                error_message=str(error),
            )
            raise
        finally:
            self._canceled.discard(request.task_id)
            if self._on_finish:
                self._on_finish(request.task_id)

    def _raise_if_canceled(self, task_id: str) -> None:
        if task_id in self._canceled:
            raise TaskCanceledError(f"Task canceled: {task_id}")

    @staticmethod
    def _emit(
        callback: EventCallback | None,
        task_id: str,
        *,
        status: str,
        progress: float,
        stage: str | None = None,
        message: str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> None:
        if callback is None:
            return
        callback(
            TaskEvent(
                taskId=task_id,
                status=status,
                progress=progress,
                stage=stage,
                message=message,
                errorCode=error_code,
                errorMessage=error_message,
                createdAt=datetime.now(timezone.utc).isoformat(),
            )
        )
