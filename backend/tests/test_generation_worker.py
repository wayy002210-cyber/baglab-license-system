import asyncio

import pytest

from app.tasks.worker import (
    GenerationWorker,
    TaskCanceledError,
    TaskEvent,
    TaskExecutionRequest,
)


def test_worker_runs_pipeline_in_order_and_emits_progress() -> None:
    calls: list[str] = []

    async def stage(name: str, request, context):
        calls.append(name)
        return {**context, name: True}

    worker = GenerationWorker(
        stages={
            "preparing_copy": lambda request, context: stage(
                "preparing_copy", request, context
            ),
            "generating_voice": lambda request, context: stage(
                "generating_voice", request, context
            ),
            "selecting_assets": lambda request, context: stage(
                "selecting_assets", request, context
            ),
            "composing": lambda request, context: stage(
                "composing", request, context
            ),
            "encoding": lambda request, context: stage(
                "encoding", request, context
            ),
        }
    )
    events: list[TaskEvent] = []

    result = asyncio.run(
        worker.run(
            TaskExecutionRequest(
                taskId="task-1",
                seed=10,
                snapshot={"template": {"shots": []}},
                outputPath="D:/output/task-1.mp4",
            ),
            on_event=events.append,
        )
    )

    assert calls == [
        "preparing_copy",
        "generating_voice",
        "selecting_assets",
        "composing",
        "encoding",
    ]
    assert [event.status for event in events] == [
        "preparing_copy",
        "generating_voice",
        "selecting_assets",
        "composing",
        "encoding",
        "completed",
    ]
    assert [event.progress for event in events] == [5, 25, 45, 60, 75, 100]
    assert result["outputPath"] == "D:/output/task-1.mp4"


def test_worker_emits_failed_event_with_stage_and_error() -> None:
    async def fail(request, context):
        raise RuntimeError("TTS provider unavailable")

    worker = GenerationWorker(stages={"preparing_copy": fail})
    events: list[TaskEvent] = []

    with pytest.raises(RuntimeError, match="TTS provider unavailable"):
        asyncio.run(
            worker.run(
                TaskExecutionRequest(
                    taskId="task-2",
                    seed=1,
                    snapshot={},
                    outputPath="out.mp4",
                ),
                on_event=events.append,
            )
        )

    assert events[-1].status == "failed"
    assert events[-1].stage == "preparing_copy"
    assert events[-1].error_code == "STAGE_FAILED"


def test_worker_can_be_canceled_between_stages() -> None:
    worker: GenerationWorker

    async def first(request, context):
        worker.cancel(request.task_id)
        return context

    worker = GenerationWorker(stages={"preparing_copy": first})
    events: list[TaskEvent] = []

    with pytest.raises(TaskCanceledError):
        asyncio.run(
            worker.run(
                TaskExecutionRequest(
                    taskId="task-3",
                    seed=1,
                    snapshot={},
                    outputPath="out.mp4",
                ),
                on_event=events.append,
            )
        )

    assert events[-1].status == "canceled"


def test_worker_allows_only_one_encoding_stage_at_a_time() -> None:
    active = 0
    maximum_active = 0

    async def encode(request, context):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.02)
        active -= 1
        return context

    worker = GenerationWorker(stages={"encoding": encode})

    async def run_both():
        await asyncio.gather(
            worker.run(
                TaskExecutionRequest(
                    taskId="one", seed=1, snapshot={}, outputPath="one.mp4"
                )
            ),
            worker.run(
                TaskExecutionRequest(
                    taskId="two", seed=2, snapshot={}, outputPath="two.mp4"
                )
            ),
        )

    asyncio.run(run_both())

    assert maximum_active == 1


def test_encoding_stage_can_emit_real_progress_between_75_and_99() -> None:
    async def encode(request, context):
        context["emitEncodingProgress"](0.5)
        context["emitEncodingProgress"](0.25)
        context["emitEncodingProgress"](1.0)
        return context

    events: list[TaskEvent] = []
    worker = GenerationWorker(stages={"encoding": encode})

    asyncio.run(
        worker.run(
            TaskExecutionRequest(
                taskId="progress",
                seed=1,
                snapshot={},
                outputPath="out.mp4",
            ),
            on_event=events.append,
        )
    )

    assert [event.progress for event in events] == [75, 87, 87, 99, 100]
