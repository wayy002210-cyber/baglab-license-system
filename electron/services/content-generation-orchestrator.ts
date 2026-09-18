import {
  ContentHistoryRepository,
  type ContentHistoryDigest,
  type ContentLifecycleState,
  type ContentTopic
} from "../repositories/content-history-repository.js";

export type TopicGenerationPayload = {
  personaId: string;
  model: string;
  personaName: string;
  [key: string]: unknown;
};

export type TopicGenerationResult = {
  topics: ContentTopic[];
  historyChecked: number;
  hotspotStatus: "disabled" | "available" | "no_match" | "unavailable";
};

export type CopywritingGenerationPayload = TopicGenerationPayload & {
  topic: ContentTopic;
  projectId?: string | null;
  recentStructures?: string[];
};

export type CopywritingGenerationResult = {
  text: string;
  structureType: string;
  hookType: string;
  argumentBeats: string[];
  semanticVector: number[] | null;
};

export type HistoryAwarePayload<T> = T & {
  recentTopicTitles: string[];
  recentScriptHashes: string[];
};

export interface ContentGenerationBackend {
  generateTopics(
    payload: HistoryAwarePayload<TopicGenerationPayload>
  ): Promise<TopicGenerationResult>;
  generateCopywriting(
    payload: HistoryAwarePayload<CopywritingGenerationPayload> & { recentStructures: string[] }
  ): Promise<CopywritingGenerationResult>;
}

export class ContentGenerationOrchestrator {
  constructor(
    private readonly history: ContentHistoryRepository,
    private readonly backend: ContentGenerationBackend
  ) {}

  async generateTopics(input: TopicGenerationPayload): Promise<TopicGenerationResult> {
    return this.backend.generateTopics({
      ...input,
      recentTopicTitles: this.history.listRecentConfirmedTopicTitles(input.personaId, 100),
      recentScriptHashes: []
    });
  }

  async generateCopywriting(
    input: CopywritingGenerationPayload
  ): Promise<CopywritingGenerationResult> {
    this.history.markTopic(
      input.personaId,
      input.topic,
      "selected",
      input.projectId ?? undefined
    );
    const digest = this.history.listDigest(input.personaId, 100);
    const recentStructures = input.recentStructures ?? digest
      .filter((item) => item.contentType === "script")
      .map((item) => item.structureType)
      .filter(Boolean)
      .slice(0, 20);
    const result = await this.backend.generateCopywriting({
      ...input,
      recentTopicTitles: this.history.listRecentConfirmedTopicTitles(input.personaId, 100),
      recentScriptHashes: this.history.listRecentConfirmedScriptHashes(input.personaId, 100),
      recentStructures
    });
    const scriptTopic: ContentTopic = {
      ...input.topic,
      identity: {
        ...input.topic.identity,
        structureType: result.structureType,
        hookType: result.hookType
      },
      semanticVector: result.semanticVector
    };
    this.history.recordScript(
      input.personaId,
      scriptTopic,
      result.text,
      input.projectId ?? null
    );
    return result;
  }

  markContent(
    personaId: string,
    topic: ContentTopic,
    state: ContentLifecycleState,
    projectId?: string
  ): ContentHistoryDigest {
    return this.history.markTopic(personaId, topic, state, projectId);
  }

  markScript(
    personaId: string,
    text: string,
    state: ContentLifecycleState,
    projectId?: string
  ): ContentHistoryDigest | null {
    return this.history.markScript(personaId, text, state, projectId);
  }
}
