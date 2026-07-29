import type { PersonaInput } from "../shared/contracts";

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
      listVoices(): Promise<
        Array<{ voiceId: string; name: string; kind: string }>
      >;
      synthesizeVoice(input: {
        text: string;
        voiceId: string;
        model?: string;
        speed?: number;
        volume?: number;
        pitch?: number;
        languageBoost?: string | null;
      }): Promise<{
        audioPath: string;
        cacheHit: boolean;
        sha256: string;
      }>;
      listTasks(): Promise<GenerationTask[]>;
      createTaskBatch(input: {
        templateId: string;
        personaId: string;
        count: number;
        seed: number;
        snapshot: Record<string, unknown>;
      }): Promise<GenerationTask[]>;
      cancelTask(id: string): Promise<GenerationTask>;
      retryTask(id: string): Promise<GenerationTask>;
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

export {};
