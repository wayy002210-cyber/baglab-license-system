from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.tasks.worker import (
    GenerationWorker,
    TaskEvent,
    TaskExecutionRequest,
)


TERMINAL_STATUSES = {"completed", "failed", "canceled"}


class TaskAlreadyRunningError(RuntimeError):
    pass


class TaskNotFoundError(RuntimeError):
    pass


class TaskRuntime:
    """Owns running coroutines and a replayable in-memory event stream."""

    def __init__(self, worker: GenerationWorker) -> None:
        self.worker = worker
        self._tasks: dict[str, asyncio.Task[dict[str, object]]] = {}
        self._requests: dict[str, TaskExecutionRequest] = {}
        self._events: dict[str, list[TaskEvent]] = {}
        self._conditions: dict[str, asyncio.Condition] = {}

    async def start(self, request: TaskExecutionRequest) -> None:
        active = self._tasks.get(request.task_id)
        if active and not active.done():
            raise TaskAlreadyRunningError(
                f"Task is already running: {request.task_id}"
            )
        self._requests[request.task_id] = request
        self._events.setdefault(request.task_id, [])
        self._conditions.setdefault(request.task_id, asyncio.Condition())

        def record(event: TaskEvent) -> None:
            self._events[request.task_id].append(event)
            asyncio.create_task(self._notify(request.task_id))

        self._tasks[request.task_id] = asyncio.create_task(
            self.worker.run(request, on_event=record)
        )

    async def retry(self, task_id: str) -> None:
        request = self._requests.get(task_id)
        if not request:
            raise TaskNotFoundError(f"Task not found: {task_id}")
        await self.start(request)

    def cancel(self, task_id: str) -> None:
        if task_id not in self._requests:
            raise TaskNotFoundError(f"Task not found: {task_id}")
        self.worker.cancel(task_id)

    async def wait(self, task_id: str) -> dict[str, object]:
        task = self._tasks.get(task_id)
        if not task:
            raise TaskNotFoundError(f"Task not found: {task_id}")
        return await task

    def latest(self, task_id: str) -> TaskEvent:
        events = self._events.get(task_id)
        if not events:
            raise TaskNotFoundError(f"Task has no events: {task_id}")
        return events[-1]

    def events_after(self, task_id: str, cursor: int) -> list[TaskEvent]:
        if task_id not in self._events:
            raise TaskNotFoundError(f"Task not found: {task_id}")
        return self._events[task_id][max(0, cursor) :]

    async def stream(
        self, task_id: str, cursor: int = 0
    ) -> AsyncIterator[tuple[int, TaskEvent]]:
        if task_id not in self._events:
            raise TaskNotFoundError(f"Task not found: {task_id}")
        position = max(0, cursor)
        condition = self._conditions[task_id]
        while True:
            events = self._events[task_id]
            while position < len(events):
                event = events[position]
                position += 1
                yield position, event
                if event.status in TERMINAL_STATUSES:
                    return
            async with condition:
                await condition.wait()

    async def _notify(self, task_id: str) -> None:
        condition = self._conditions[task_id]
        async with condition:
            condition.notify_all()
