export type BatchTopic = { id: string; shortTitle: string; description: string; hook: string };
export type BatchProgress = { total: number; completed: number; succeeded: number; failed: number; currentTopicId: string | null };

export async function generateCopywritingBatch(input: {
  topics: BatchTopic[];
  generate: (topic: BatchTopic) => Promise<{ text: string }>;
  saveSuccess: (topic: BatchTopic, text: string) => Promise<void>;
  saveFailure: (topic: BatchTopic, error: Error) => Promise<void>;
  onProgress?: (state: BatchProgress) => void;
}): Promise<Omit<BatchProgress, "currentTopicId">> {
  const state: BatchProgress = { total: input.topics.length, completed: 0, succeeded: 0, failed: 0, currentTopicId: null };
  for (const topic of input.topics) {
    state.currentTopicId = topic.id;
    try {
      const result = await input.generate(topic);
      await input.saveSuccess(topic, result.text);
      state.succeeded += 1;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      await input.saveFailure(topic, error);
      state.failed += 1;
    }
    state.completed += 1;
    input.onProgress?.({ ...state });
  }
  return { total: state.total, completed: state.completed, succeeded: state.succeeded, failed: state.failed };
}
