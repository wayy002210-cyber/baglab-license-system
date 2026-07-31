import asyncio

import pytest

from app.tasks.runtime import TaskAlreadyRunningError, TaskRuntime
from app.tasks.worker import GenerationWorker, TaskExecutionRequest


def request(task_id: str = "task-1") -> TaskExecutionRequest:
    return TaskExecutionRequest(
        taskId=task_id,
        seed=1,
        snapshot={},
        outputPath=f"D:/output/{task_id}.mp4",
    )


def test_runtime_records_replayable_events_and_terminal_state() -> None:
    async def prepare(task, context):
        return context

    async def scenario():
        runtime = TaskRuntime(
            GenerationWorker(stages={"preparing_copy": prepare})
        )
        await runtime.start(request())
        await runtime.wait("task-1")
        return runtime

    runtime = asyncio.run(scenario())

    assert runtime.latest("task-1").status == "completed"
    assert [event.status for event in runtime.events_after("task-1", 0)] == [
        "preparing_copy",
        "completed",
    ]
    assert runtime.events_after("task-1", 1)[0].status == "completed"


def test_runtime_rejects_duplicate_running_task_and_supports_cancel() -> None:
    entered = asyncio.Event()
    release = asyncio.Event()

    async def slow(task, context):
        entered.set()
        await release.wait()
        return context

    async def scenario():
        runtime = TaskRuntime(GenerationWorker(stages={"preparing_copy": slow}))
        await runtime.start(request())
        await entered.wait()
        with pytest.raises(TaskAlreadyRunningError):
            await runtime.start(request())
        runtime.cancel("task-1")
        release.set()
        with pytest.raises(Exception):
            await runtime.wait("task-1")
        return runtime

    runtime = asyncio.run(scenario())
    assert runtime.latest("task-1").status == "canceled"


def test_runtime_accepts_progress_events_from_encoder_thread() -> None:
    async def encode(task, context):
        await asyncio.to_thread(context["emitEncodingProgress"], 0.5)
        return context

    async def scenario():
        runtime = TaskRuntime(GenerationWorker(stages={"encoding": encode}))
        await runtime.start(request("thread-progress"))
        await runtime.wait("thread-progress")
        return runtime

    runtime = asyncio.run(scenario())
    statuses = [event.status for event in runtime.events_after("thread-progress", 0)]
    assert statuses[-1] == "completed"
    assert "encoding" in statuses
