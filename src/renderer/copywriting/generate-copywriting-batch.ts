export type ContentIdentity = {
  audience: string; scenario: string; problem: string; thesis: string;
  evidenceType: string; angle: string; structureType: string; hookType: string;
  viewerGain: string; hotspotId: string | null;
};
export type HotspotSource = {
  id: string; title: string; sourceUrl: string; publishedAt: string; retrievedAt: string;
  summary: string; relevance: string;
};
export type BatchTopic = {
  id: string; displayTitle: string; shortTitle: string; description: string; hook: string;
  identity: ContentIdentity; hotspot: HotspotSource | null; semanticVector: number[] | null;
};
export type BatchScriptResult = {
  text: string; structureType: string; hookType: string; argumentBeats: string[];
  semanticVector: number[] | null;
};
export type BatchProgress = { total: number; completed: number; succeeded: number; failed: number; currentTopicId: string | null };

export async function generateCopywritingBatch(input: {
  topics: BatchTopic[];
  generate: (topic: BatchTopic) => Promise<BatchScriptResult>;
  saveSuccess: (topic: BatchTopic, result: BatchScriptResult) => Promise<void>;
  saveFailure: (topic: BatchTopic, error: Error) => Promise<void>;
  onProgress?: (state: BatchProgress) => void;
}): Promise<Omit<BatchProgress, "currentTopicId">> {
  const state: BatchProgress = { total: input.topics.length, completed: 0, succeeded: 0, failed: 0, currentTopicId: null };
  for (const topic of input.topics) {
    state.currentTopicId = topic.id;
    try {
      const result = await input.generate(topic);
      await input.saveSuccess(topic, result);
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
