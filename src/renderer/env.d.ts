import type { CreationDraft, PersonaInput } from "../shared/contracts";

type Persona = PersonaInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

declare global {
  interface Window {
    autocut: {
      backendStatus(): Promise<
        | {
            status: "starting" | "ready";
            baseUrl: string;
            token: string;
          }
        | { status: "stopped" | "failed"; message: string }
      >;
      credentialStatus(): Promise<{ bailian: boolean; minimax: boolean }>;
      setCredential(
        name: "bailian" | "minimax",
        value: string
      ): Promise<{ configured: boolean }>;
      deleteCredential(
        name: "bailian" | "minimax"
      ): Promise<{ deleted: boolean }>;
      listPersonas(): Promise<Persona[]>;
      createPersona(input: PersonaInput): Promise<Persona>;
      updatePersona(
        id: string,
        input: Partial<PersonaInput>
      ): Promise<Persona>;
      duplicatePersona(id: string): Promise<Persona>;
      deletePersona(id: string): Promise<{ deleted: boolean }>;
      getCreationDraft(): Promise<CreationDraft | null>;
      saveCreationDraft(input: CreationDraft): Promise<CreationDraft>;
      clearCreationDraft(): Promise<{ cleared: boolean }>;
      duplicateCreationDraft(): Promise<CreationDraft | null>;
      listReferenceScripts(): Promise<ReferenceScript[]>;
      createReferenceScript(input: ReferenceScriptInput): Promise<ReferenceScript>;
      updateReferenceScript(
        id: string,
        input: ReferenceScriptInput
      ): Promise<ReferenceScript>;
      deleteReferenceScript(id: string): Promise<{ deleted: boolean }>;
      searchReferenceScripts(input: {
        industry: string;
        query: string;
        limit: number;
      }): Promise<ReferenceScript[]>;
      listAssetCategories(): Promise<
        Array<{
          id: string;
          name: string;
          folderPath: string;
          assetCount: number;
          invalidCount: number;
          lastScannedAt: string | null;
        }>
      >;
      listAssets(categoryId: string): Promise<
        Array<{
          id: string;
          categoryId: string;
          fileName: string;
          filePath: string;
          durationSec: number | null;
          width: number | null;
          height: number | null;
          fps: number | null;
          codec: string | null;
          rotation: number;
          fileSize: number;
          fingerprint: string;
          thumbnailPath: string | null;
          status: string;
          errorMessage: string | null;
        }>
      >;
      selectAndScanAssets(): Promise<{
        id: string;
        name: string;
        folderPath: string;
        assetCount: number;
        invalidCount: number;
        lastScannedAt: string | null;
      } | null>;
      listTemplates(): Promise<VideoTemplate[]>;
      createTemplate(input: TemplateInput): Promise<VideoTemplate>;
      updateTemplate(id: string, input: TemplateInput): Promise<VideoTemplate>;
      duplicateTemplate(id: string): Promise<VideoTemplate>;
      deleteTemplate(id: string): Promise<{ deleted: boolean }>;
      exportTemplate(id: string): Promise<string | null>;
      importTemplate(): Promise<VideoTemplate | null>;
      rewriteCopywriting(input: {
        sourceText: string;
        personaName: string;
        brandFacts: string[];
        tone: string;
        cta: string;
        bannedWords: string[];
        shots: Array<{
          index: number;
          role: TemplateShotInput["role"];
          assetCategoryId: string;
        }>;
      }): Promise<{
        shots: Array<{
          index: number;
          role: TemplateShotInput["role"];
          assetCategoryId: string;
          copywriting: string;
          durationMode: TemplateShotInput["durationMode"];
          durationSec?: number | null;
          muteOriginal: boolean;
        }>;
      }>;
      generateTopics(input: CopywritingContext): Promise<{
        topics: CopywritingTopic[];
      }>;
      generateCopywriting(
        input: CopywritingContext & {
          bannedWords: string[];
          topic: string;
          minLength: number;
          maxLength: number;
        }
      ): Promise<{ text: string }>;
      checkCopywritingCompliance(input: {
        text: string;
        personaBannedWords: string[];
      }): Promise<{
        originalText: string;
        issues: ComplianceIssue[];
        disclaimer: string;
      }>;
      listVoices(): Promise<
        Array<{ voiceId: string; name: string; kind: string }>
      >;
      getVoiceCapabilities(): Promise<{
        models: string[];
        emotions: string[];
        speedRange: [number, number];
        volumeRange: [number, number];
        pitchRange: [number, number];
        sample: {
          formats: string[];
          minDurationSec: number;
          maxDurationSec: number;
          maxSizeBytes: number;
        };
      }>;
      selectVoiceSample(): Promise<string | null>;
      validateVoiceSample(samplePath: string): Promise<{
        path: string;
        durationSec: number;
        format: string;
        sizeBytes: number;
      }>;
      cloneVoice(input: {
        samplePath: string;
        voiceId: string;
        previewText?: string;
        model?: string;
        languageBoost?: string | null;
        needNoiseReduction?: boolean;
        needVolumeNormalization?: boolean;
      }): Promise<{
        voiceId: string;
        status: "ready" | "failed";
        demoAudio: string;
        sample: {
          path: string;
          durationSec: number;
          format: string;
          sizeBytes: number;
        };
      }>;
      synthesizeVoice(input: {
        text: string;
        voiceId: string;
        model?: string;
        speed?: number;
        volume?: number;
        pitch?: number;
        emotion?: string | null;
        languageBoost?: string | null;
      }): Promise<{
        audioPath: string;
        cacheHit: boolean;
        sha256: string;
      }>;
      previewVoice(input: {
        text: string;
        voiceId: string;
        model?: string;
        speed?: number;
        volume?: number;
        pitch?: number;
        emotion?: string | null;
      }): Promise<string>;
      listTasks(): Promise<GenerationTask[]>;
      createTaskBatch(input: {
        templateId: string;
        personaId: string;
        count: number;
        seed: number;
        snapshot: Record<string, unknown>;
      }): Promise<GenerationTask[]>;
      createTasksFromDraft(input: {
        count: number;
        seed: number;
      }): Promise<GenerationTask[]>;
      cancelTask(id: string): Promise<GenerationTask>;
      retryTask(id: string): Promise<GenerationTask>;
      openTaskOutput(id: string): Promise<{ opened: boolean }>;
      deleteTask(id: string): Promise<{ deleted: boolean }>;
      listPublishAccounts(): Promise<PublishAccount[]>;
      createPublishAccount(input: {
        name: string;
        platform: "douyin" | "xiaohongshu";
      }): Promise<PublishAccount>;
      setPublishAccountStatus(
        id: string,
        status: PublishAccount["linkStatus"]
      ): Promise<PublishAccount>;
      checkPublishAccount(id: string): Promise<PublishAccount>;
      connectPublishAccount(id: string): Promise<PublishAccount>;
      deletePublishAccount(id: string): Promise<{ deleted: boolean }>;
      listPublishJobs(): Promise<PublishJob[]>;
      createPublishJob(input: {
        taskId: string;
        accountId: string;
        title: string;
        topics: string[];
        scheduledAt: string | null;
        coverPath?: string | null;
      }): Promise<PublishJob>;
      cancelPublishJob(id: string): Promise<PublishJob>;
      exportDiagnostics(): Promise<string | null>;
      getMediaSettings(): Promise<MediaSettings>;
      saveMediaSettings(input: MediaSettings): Promise<MediaSettings>;
      selectBgmFile(): Promise<string | null>;
      selectBgmFolder(): Promise<string | null>;
      scanAudioLibrary(input: {
        folderPath: string;
        recursive?: boolean;
      }): Promise<{
        tracks: Array<{
          path: string;
          name: string;
          format: string;
          durationSec: number;
          sizeBytes: number;
        }>;
        invalid: Array<{ path: string; error: string }>;
      }>;
      selectAndProbeFont(): Promise<{
        path: string;
        family: string;
        format: "ttf" | "otf";
      } | null>;
      listSystemFonts(): Promise<Array<{
        id: string;
        displayName: string;
        family: string;
        path: string;
        extension: "ttf" | "otf" | "ttc";
      }>>;
      getCopyModelSettings(): Promise<CopyModelSettings>;
      saveCopyModelSettings(input: CopyModelSettings): Promise<CopyModelSettings>;
      selectSettingsPath(
        kind: "output" | "work" | "bgm"
      ): Promise<string | null>;
    };
  }
}

type TemplateShotInput = {
  role: "hook" | "problem" | "proof" | "solution" | "cta" | "custom";
  assetCategoryId: string | null;
  copywriting: string;
  durationMode: "voice" | "fixed" | "auto";
  durationSec: number | null;
  muteOriginal: boolean;
};

type TemplateInput = {
  name: string;
  description: string;
  shots: TemplateShotInput[];
};

type VideoTemplate = Omit<TemplateInput, "shots"> & {
  id: string;
  canvas: { width: 1080; height: 1920; fps: 30 };
  version: number;
  shots: Array<TemplateShotInput & { id: string; index: number }>;
  createdAt: string;
  updatedAt: string;
};

type GenerationTask = {
  id: string;
  templateId: string;
  personaId: string;
  status:
    | "draft"
    | "queued"
    | "preparing_copy"
    | "generating_voice"
    | "selecting_assets"
    | "composing"
    | "encoding"
    | "completed"
    | "failed"
    | "canceled";
  progress: number;
  seed: number;
  snapshot: Record<string, unknown>;
  outputPath: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};
type PublishAccount = {
  id: string;
  name: string;
  platform: "douyin" | "xiaohongshu";
  userDataDir: string;
  linkStatus: "unknown" | "connected" | "expired" | "needs_user";
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type PublishJob = {
  id: string; taskId: string; accountId: string; title: string; topics: string[];
  coverPath: string | null;
  status: "pending" | "scheduled" | "publishing" | "published" | "failed" | "needs_user" | "canceled";
  scheduledAt: string | null; startedAt: string | null; completedAt: string | null;
  errorMessage: string | null; screenshotPath: string | null; attemptCount: number;
  idempotencyKey: string; createdAt: string; updatedAt: string;
};
type MediaSettings = {
  outputDirectory: string;
  workDirectory: string;
  encoder: "auto" | "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264";
  videoBitrateMbps: number;
  fontFamily: string;
  bgmPath: string | null;
  bgmVolume: number;
};
type CopyModelSettings = {
  defaultModel: string;
  temperature: number;
  candidateModels: string[];
};
type CopywritingContext = {
  model: string;
  personaName: string;
  industry: string;
  brandFacts: string[];
  tone: string;
  cta: string;
  referenceScripts: string[];
};
type CopywritingTopic = {
  id: string;
  title: string;
  angle: string;
  hook: string;
};
type ComplianceIssue = {
  term: string;
  start: number;
  end: number;
  riskType: string;
  explanation: string;
  suggestion: string;
};
type ReferenceScriptInput = {
  title: string;
  industry: string;
  tags: string[];
  content: string;
  structure: { hook: string; narrative: string; cta: string };
};
type ReferenceScript = ReferenceScriptInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export {};
