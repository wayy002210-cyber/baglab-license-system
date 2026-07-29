from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable

from app.tasks.runtime import TaskNotFoundError, TaskRuntime
from app.tasks.worker import TaskEvent, TaskExecutionRequest


PipelineFactory = Callable[
    [str, str, asyncio.Lock, asyncio.Semaphore], object
]


class SecurePipelineRuntime:
    """Creates per-task pipelines while retaining credentials only in memory."""

    def __init__(self, factory: PipelineFactory) -> None:
        self.factory = factory
        self.encoding_lock = asyncio.Lock()
        self.tts_semaphore = asyncio.Semaphore(3)
        self.runtimes: dict[str, TaskRuntime] = {}

    async def start(
        self,
        request: TaskExecutionRequest,
        *,
        bailian_key: str | None = None,
        minimax_key: str | None = None,
    ) -> None:
        if (
            (not bailian_key or not minimax_key)
            and not request.snapshot.get("approved")
        ):
            raise ValueError("Bailian and MiniMax API keys are required")
        runtime = self.runtimes.get(request.task_id)
        if runtime is None:
            pipeline = self.factory(
                bailian_key or "",
                minimax_key or "",
                self.encoding_lock,
                self.tts_semaphore,
            )
            runtime = TaskRuntime(pipeline.worker)
            self.runtimes[request.task_id] = runtime
        await runtime.start(request)

    async def retry(self, task_id: str) -> None:
        await self._runtime(task_id).retry(task_id)

    def cancel(self, task_id: str) -> None:
        self._runtime(task_id).cancel(task_id)

    def latest(self, task_id: str) -> TaskEvent:
        return self._runtime(task_id).latest(task_id)

    def stream(
        self, task_id: str, cursor: int = 0
    ) -> AsyncIterator[tuple[int, TaskEvent]]:
        return self._runtime(task_id).stream(task_id, cursor)

    def _runtime(self, task_id: str) -> TaskRuntime:
        try:
            return self.runtimes[task_id]
        except KeyError as error:
            raise TaskNotFoundError(f"Task not found: {task_id}") from error
