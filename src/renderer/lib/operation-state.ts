import { computed, ref } from "vue";
import { mapUserError, type UserError } from "./user-error";

export type OperationPhase =
  | "idle"
  | "validating"
  | "requesting"
  | "processing"
  | "success"
  | "error";

export type OperationStage = {
  phase: Exclude<OperationPhase, "idle" | "success" | "error">;
  progress: number;
  message: string;
  fallback?: string;
};

export function createOperationState() {
  const phase = ref<OperationPhase>("idle");
  const progress = ref(0);
  const message = ref("");
  const error = ref<UserError | null>(null);
  let lastOperation: (() => Promise<unknown>) | null = null;
  let lastStage: OperationStage | null = null;

  async function run<T>(
    operation: () => Promise<T>,
    stage: OperationStage
  ): Promise<T> {
    lastOperation = operation;
    lastStage = stage;
    phase.value = stage.phase;
    progress.value = stage.progress;
    message.value = stage.message;
    error.value = null;
    try {
      const result = await operation();
      phase.value = "success";
      progress.value = 100;
      message.value = "操作已完成";
      return result;
    } catch (reason) {
      phase.value = "error";
      progress.value = 0;
      error.value = mapUserError(reason, stage.fallback ?? "操作失败");
      message.value = error.value.title;
      throw reason;
    }
  }

  async function retry(): Promise<unknown> {
    if (!lastOperation || !lastStage) return;
    return run(lastOperation, lastStage);
  }

  function reset(): void {
    phase.value = "idle";
    progress.value = 0;
    message.value = "";
    error.value = null;
  }

  return {
    phase,
    progress,
    message,
    error,
    busy: computed(
      () =>
        phase.value === "validating" ||
        phase.value === "requesting" ||
        phase.value === "processing"
    ),
    run,
    retry,
    reset
  };
}
