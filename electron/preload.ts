import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
import {
  creationDraftSchema,
  personaInputSchema
} from "../src/shared/contracts.js";

const backendStatusSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.enum(["starting", "ready"]),
    baseUrl: z.string().url(),
    token: z.string().min(32)
  }),
  z.object({
    status: z.enum(["stopped", "failed"]),
    message: z.string()
  })
]);
const credentialNameSchema = z.enum(["bailian", "minimax"]);
const credentialStatusSchema = z.object({
  bailian: z.boolean(),
  minimax: z.boolean()
});
const personaSchema = personaInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string()
});
const personaIdSchema = z.string().uuid();
const assetCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  folderPath: z.string(),
  assetCount: z.number().int().nonnegative(),
  invalidCount: z.number().int().nonnegative(),
  lastScannedAt: z.string().nullable()
});
const assetSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  fileName: z.string(),
  filePath: z.string(),
  durationSec: z.number().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  fps: z.number().nullable(),
  codec: z.string().nullable(),
  rotation: z.number().int(),
  fileSize: z.number().int().nonnegative(),
  fingerprint: z.string(),
  thumbnailPath: z.string().nullable(),
  status: z.string(),
  errorMessage: z.string().nullable()
});
const templateShotInputSchema = z
  .object({
    role: z.enum(["hook", "problem", "proof", "solution", "cta", "custom"]),
    assetCategoryId: z.string().uuid().nullable(),
    copywriting: z.string(),
    durationMode: z.enum(["voice", "fixed", "auto"]),
    durationSec: z.number().positive().nullable(),
    muteOriginal: z.boolean()
  })
  .superRefine((shot, context) => {
    if (shot.durationMode === "fixed" && shot.durationSec === null) {
      context.addIssue({
        code: "custom",
        message: "固定时长镜头必须设置时长",
        path: ["durationSec"]
      });
    }
  });
const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  shots: z.array(templateShotInputSchema).min(1).max(30)
});
const videoTemplateSchema = templateInputSchema.extend({
  id: z.string().uuid(),
  canvas: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
    fps: z.literal(30)
  }),
  version: z.number().int().positive(),
  shots: z.array(
    templateShotInputSchema.extend({
      id: z.string().uuid(),
      index: z.number().int().nonnegative()
    })
  ),
  createdAt: z.string(),
  updatedAt: z.string()
});
const rewriteRequestSchema = z.object({
  sourceText: z.string().trim().min(1),
  personaName: z.string().trim().min(1),
  brandFacts: z.array(z.string()),
  tone: z.string(),
  cta: z.string(),
  bannedWords: z.array(z.string()),
  shots: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        role: z.enum(["hook", "problem", "proof", "solution", "cta", "custom"]),
        assetCategoryId: z.string().min(1)
      })
    )
    .min(1)
    .max(30)
});
const rewrittenShotSchema = z.object({
  index: z.number().int().nonnegative(),
  role: z.enum(["hook", "problem", "proof", "solution", "cta", "custom"]),
  assetCategoryId: z.string(),
  copywriting: z.string().min(1),
  durationMode: z.enum(["voice", "fixed", "auto"]),
  durationSec: z.number().positive().nullable().optional(),
  muteOriginal: z.boolean()
});
const synthesisRequestSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  voiceId: z.string().min(1),
  model: z.string().min(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  volume: z.number().min(0).max(3).optional(),
  pitch: z.number().int().min(-12).max(12).optional(),
  emotion: z.string().nullable().optional(),
  languageBoost: z.string().nullable().optional()
});
const voiceSchema = z.object({
  voiceId: z.string().min(1),
  name: z.string(),
  kind: z.string()
});
const synthesisResultSchema = z.object({
  audioPath: z.string().min(1),
  cacheHit: z.boolean(),
  sha256: z.string().length(64)
});
const sampleMetadataSchema = z.object({
  path: z.string().min(1),
  durationSec: z.number().positive(),
  format: z.string().min(1),
  sizeBytes: z.number().int().nonnegative()
});
const cloneVoiceRequestSchema = z.object({
  samplePath: z.string().min(1),
  voiceId: z.string().min(8).max(256),
  previewText: z.string().max(1000).optional(),
  model: z.string().min(1).optional(),
  languageBoost: z.string().nullable().optional(),
  needNoiseReduction: z.boolean().optional(),
  needVolumeNormalization: z.boolean().optional()
});
const cloneVoiceResultSchema = z.object({
  voiceId: z.string().min(1),
  status: z.enum(["ready", "failed"]),
  demoAudio: z.string(),
  sample: sampleMetadataSchema
});
const voiceCapabilitiesSchema = z.object({
  models: z.array(z.string()).min(1),
  emotions: z.array(z.string()),
  speedRange: z.tuple([z.number(), z.number()]),
  volumeRange: z.tuple([z.number(), z.number()]),
  pitchRange: z.tuple([z.number(), z.number()]),
  sample: z.object({
    formats: z.array(z.string()),
    minDurationSec: z.number(),
    maxDurationSec: z.number(),
    maxSizeBytes: z.number()
  })
});
const taskStatusSchema = z.enum([
  "draft",
  "queued",
  "preparing_copy",
  "generating_voice",
  "selecting_assets",
  "composing",
  "encoding",
  "completed",
  "failed",
  "canceled"
]);
const taskSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().min(1),
  personaId: z.string().min(1),
  status: taskStatusSchema,
  progress: z.number().min(0).max(100),
  seed: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  outputPath: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  updatedAt: z.string()
});
const createTaskBatchSchema = z.object({
  templateId: z.string().min(1),
  personaId: z.string().min(1),
  count: z.number().int().min(1).max(20),
  seed: z.number().int(),
  snapshot: z.record(z.string(), z.unknown())
});
const publishPlatformSchema = z.enum(["douyin", "xiaohongshu"]);
const accountLinkStatusSchema = z.enum([
  "unknown", "connected", "expired", "needs_user"
]);
const publishAccountSchema = z.object({
  id: z.string().uuid(), name: z.string(), platform: publishPlatformSchema,
  userDataDir: z.string(), linkStatus: accountLinkStatusSchema,
  lastCheckedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string()
});
const publishJobSchema = z.object({
  id: z.string().uuid(), taskId: z.string(), accountId: z.string().uuid(),
  title: z.string(), topics: z.array(z.string()), coverPath: z.string().nullable(),
  status: z.enum(["pending", "scheduled", "publishing", "published", "failed", "needs_user", "canceled"]),
  scheduledAt: z.string().nullable(), startedAt: z.string().nullable(),
  completedAt: z.string().nullable(), errorMessage: z.string().nullable(),
  screenshotPath: z.string().nullable(), attemptCount: z.number().int().nonnegative(),
  idempotencyKey: z.string(), createdAt: z.string(), updatedAt: z.string()
});
const createPublishJobSchema = z.object({
  taskId: z.string().min(1), accountId: z.string().uuid(), title: z.string().trim().min(1),
  topics: z.array(z.string()), scheduledAt: z.string().nullable(),
  coverPath: z.string().nullable().optional()
});
const mediaSettingsSchema = z.object({
  outputDirectory: z.string(),
  workDirectory: z.string(),
  encoder: z.enum(["auto", "h264_nvenc", "h264_qsv", "h264_amf", "libx264"]),
  videoBitrateMbps: z.number().min(1).max(50),
  fontFamily: z.string().min(1),
  bgmPath: z.string().nullable(),
  bgmVolume: z.number().min(0).max(1)
});
const audioLibraryResultSchema = z.object({
  tracks: z.array(z.object({
    path: z.string(),
    name: z.string(),
    format: z.string(),
    durationSec: z.number().positive(),
    sizeBytes: z.number().int().nonnegative()
  })),
  invalid: z.array(z.object({ path: z.string(), error: z.string() }))
});
const fontMetadataSchema = z.object({
  path: z.string(),
  family: z.string().min(1),
  format: z.enum(["ttf", "otf"])
});
const systemFontSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  family: z.string().min(1),
  path: z.string().min(1),
  extension: z.enum(["ttf", "otf", "ttc"])
});
const copyModelSettingsSchema = z.object({
  defaultModel: z.string().trim().min(1),
  temperature: z.number().min(0).max(2),
  candidateModels: z.array(z.string().trim().min(1)).min(1)
});
const referenceScriptStructureSchema = z.object({
  hook: z.string(),
  narrative: z.string(),
  cta: z.string()
});
const referenceScriptInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  industry: z.string().trim().max(80),
  tags: z.array(z.string().trim().min(1)),
  content: z.string().trim().min(1).max(20_000),
  structure: referenceScriptStructureSchema
});
const referenceScriptSchema = referenceScriptInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string()
});
const contentContextSchema = z.object({
  model: z.string().trim().min(1),
  personaName: z.string().trim().min(1),
  industry: z.string(),
  brandFacts: z.array(z.string()),
  tone: z.string(),
  cta: z.string(),
  referenceScripts: z.array(z.string()).max(5)
});
const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  angle: z.string().min(1),
  hook: z.string().min(1)
});
const topicRequestSchema = contentContextSchema;
const generateCopywritingRequestSchema = contentContextSchema.extend({
  bannedWords: z.array(z.string()),
  topic: z.string().trim().min(1),
  minLength: z.number().int().min(50).max(1000),
  maxLength: z.number().int().min(200).max(2000)
});
const complianceIssueSchema = z.object({
  term: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  riskType: z.string(),
  explanation: z.string(),
  suggestion: z.string()
});
const complianceRequestSchema = z.object({
  text: z.string().min(1).max(20_000),
  personaBannedWords: z.array(z.string())
});

contextBridge.exposeInMainWorld("autocut", {
  backendStatus: async () =>
    backendStatusSchema.parse(await ipcRenderer.invoke("backend:status")),
  credentialStatus: async () =>
    credentialStatusSchema.parse(
      await ipcRenderer.invoke("credentials:status")
    ),
  setCredential: async (name: string, value: string) =>
    ipcRenderer.invoke(
      "credentials:set",
      credentialNameSchema.parse(name),
      z.string().min(1).parse(value)
    ),
  deleteCredential: async (name: string) =>
    ipcRenderer.invoke(
      "credentials:delete",
      credentialNameSchema.parse(name)
    ),
  listPersonas: async () =>
    z.array(personaSchema).parse(await ipcRenderer.invoke("personas:list")),
  createPersona: async (input: unknown) =>
    personaSchema.parse(
      await ipcRenderer.invoke("personas:create", personaInputSchema.parse(input))
    ),
  updatePersona: async (id: string, patch: unknown) =>
    personaSchema.parse(
      await ipcRenderer.invoke(
        "personas:update",
        personaIdSchema.parse(id),
        personaInputSchema.partial().parse(patch)
      )
    ),
  duplicatePersona: async (id: string) =>
    personaSchema.parse(
      await ipcRenderer.invoke("personas:duplicate", personaIdSchema.parse(id))
    ),
  deletePersona: async (id: string) =>
    z
      .object({ deleted: z.boolean() })
      .parse(
        await ipcRenderer.invoke("personas:delete", personaIdSchema.parse(id))
      ),
  getCreationDraft: async () => {
    const result = await ipcRenderer.invoke("draft:get");
    return result === null ? null : creationDraftSchema.parse(result);
  },
  saveCreationDraft: async (input: unknown) =>
    creationDraftSchema.parse(
      await ipcRenderer.invoke("draft:save", creationDraftSchema.parse(input))
    ),
  clearCreationDraft: async () =>
    z
      .object({ cleared: z.boolean() })
      .parse(await ipcRenderer.invoke("draft:clear")),
  duplicateCreationDraft: async () => {
    const result = await ipcRenderer.invoke("draft:duplicate");
    return result === null ? null : creationDraftSchema.parse(result);
  },
  listReferenceScripts: async () =>
    z
      .array(referenceScriptSchema)
      .parse(await ipcRenderer.invoke("referenceScripts:list")),
  createReferenceScript: async (input: unknown) =>
    referenceScriptSchema.parse(
      await ipcRenderer.invoke(
        "referenceScripts:create",
        referenceScriptInputSchema.parse(input)
      )
    ),
  updateReferenceScript: async (id: string, input: unknown) =>
    referenceScriptSchema.parse(
      await ipcRenderer.invoke(
        "referenceScripts:update",
        z.string().uuid().parse(id),
        referenceScriptInputSchema.parse(input)
      )
    ),
  deleteReferenceScript: async (id: string) =>
    z
      .object({ deleted: z.boolean() })
      .parse(
        await ipcRenderer.invoke(
          "referenceScripts:delete",
          z.string().uuid().parse(id)
        )
      ),
  searchReferenceScripts: async (input: unknown) =>
    z.array(referenceScriptSchema).parse(
      await ipcRenderer.invoke(
        "referenceScripts:search",
        z.object({
          industry: z.string(),
          query: z.string(),
          limit: z.number().int().min(1).max(5)
        }).parse(input)
      )
    ),
  listAssetCategories: async () =>
    z
      .array(assetCategorySchema)
      .parse(await ipcRenderer.invoke("assets:listCategories")),
  listAssets: async (categoryId: string) =>
    z
      .array(assetSchema)
      .parse(
        await ipcRenderer.invoke(
          "assets:list",
          z.string().uuid().parse(categoryId)
        )
      ),
  selectAndScanAssets: async () => {
    const result = await ipcRenderer.invoke("assets:selectAndScan");
    return result === null ? null : assetCategorySchema.parse(result);
  },
  listTemplates: async () =>
    z.array(videoTemplateSchema).parse(await ipcRenderer.invoke("templates:list")),
  createTemplate: async (input: unknown) =>
    videoTemplateSchema.parse(
      await ipcRenderer.invoke("templates:create", templateInputSchema.parse(input))
    ),
  updateTemplate: async (id: string, input: unknown) =>
    videoTemplateSchema.parse(
      await ipcRenderer.invoke(
        "templates:update",
        z.string().uuid().parse(id),
        templateInputSchema.parse(input)
      )
    ),
  duplicateTemplate: async (id: string) =>
    videoTemplateSchema.parse(
      await ipcRenderer.invoke("templates:duplicate", z.string().uuid().parse(id))
    ),
  deleteTemplate: async (id: string) =>
    z
      .object({ deleted: z.boolean() })
      .parse(
        await ipcRenderer.invoke(
          "templates:delete",
          z.string().uuid().parse(id)
        )
      ),
  exportTemplate: async (id: string) => z.string().nullable().parse(
    await ipcRenderer.invoke("templates:export", z.string().uuid().parse(id))
  ),
  importTemplate: async () => {
    const result = await ipcRenderer.invoke("templates:import");
    return result === null ? null : videoTemplateSchema.parse(result);
  },
  rewriteCopywriting: async (input: unknown) =>
    z
      .object({ shots: z.array(rewrittenShotSchema) })
      .parse(
        await ipcRenderer.invoke(
          "copywriting:rewrite",
          rewriteRequestSchema.parse(input)
        )
      ),
  generateTopics: async (input: unknown) =>
    z
      .object({ topics: z.array(topicSchema).length(5) })
      .parse(
        await ipcRenderer.invoke(
          "copywriting:topics",
          topicRequestSchema.parse(input)
        )
      ),
  generateCopywriting: async (input: unknown) =>
    z
      .object({ text: z.string().min(1) })
      .parse(
        await ipcRenderer.invoke(
          "copywriting:generate",
          generateCopywritingRequestSchema.parse(input)
        )
      ),
  checkCopywritingCompliance: async (input: unknown) =>
    z
      .object({
        originalText: z.string(),
        issues: z.array(complianceIssueSchema),
        disclaimer: z.string()
      })
      .parse(
        await ipcRenderer.invoke(
          "copywriting:compliance",
          complianceRequestSchema.parse(input)
        )
      ),
  listVoices: async () =>
    z.array(voiceSchema).parse(await ipcRenderer.invoke("voices:list")),
  getVoiceCapabilities: async () =>
    voiceCapabilitiesSchema.parse(
      await ipcRenderer.invoke("voices:capabilities")
    ),
  selectVoiceSample: async () =>
    z.string().nullable().parse(await ipcRenderer.invoke("voices:selectSample")),
  validateVoiceSample: async (samplePath: unknown) =>
    sampleMetadataSchema.parse(
      await ipcRenderer.invoke(
        "voices:validateSample",
        z.string().min(1).parse(samplePath)
      )
    ),
  cloneVoice: async (input: unknown) =>
    cloneVoiceResultSchema.parse(
      await ipcRenderer.invoke(
        "voices:clone",
        cloneVoiceRequestSchema.parse(input)
      )
    ),
  synthesizeVoice: async (input: unknown) =>
    synthesisResultSchema.parse(
      await ipcRenderer.invoke(
        "voices:synthesize",
        synthesisRequestSchema.parse(input)
      )
    ),
  previewVoice: async (input: unknown) => z.string().startsWith("data:audio/").parse(
    await ipcRenderer.invoke("voices:preview", synthesisRequestSchema.parse(input))
  ),
  listTasks: async () =>
    z.array(taskSchema).parse(await ipcRenderer.invoke("tasks:list")),
  createTaskBatch: async (input: unknown) =>
    z
      .array(taskSchema)
      .parse(
        await ipcRenderer.invoke(
          "tasks:createBatch",
          createTaskBatchSchema.parse(input)
        )
      ),
  createTasksFromDraft: async (input: unknown) =>
    z.array(taskSchema).parse(
      await ipcRenderer.invoke(
        "tasks:createFromDraft",
        z.object({
          count: z.number().int().min(1).max(20),
          seed: z.number().int()
        }).parse(input)
      )
    ),
  cancelTask: async (id: string) =>
    taskSchema.parse(
      await ipcRenderer.invoke("tasks:cancel", z.string().uuid().parse(id))
    ),
  retryTask: async (id: string) =>
    taskSchema.parse(
      await ipcRenderer.invoke("tasks:retry", z.string().uuid().parse(id))
    ),
  openTaskOutput: async (id: string) => z.object({ opened: z.boolean() }).parse(
    await ipcRenderer.invoke("tasks:openOutput", z.string().uuid().parse(id))
  ),
  deleteTask: async (id: string) => z.object({ deleted: z.boolean() }).parse(
    await ipcRenderer.invoke("tasks:delete", z.string().uuid().parse(id))
  ),
  listPublishAccounts: async () => z.array(publishAccountSchema).parse(
    await ipcRenderer.invoke("publishAccounts:list")
  ),
  createPublishAccount: async (input: unknown) => publishAccountSchema.parse(
    await ipcRenderer.invoke("publishAccounts:create", z.object({
      name: z.string().trim().min(1), platform: publishPlatformSchema
    }).parse(input))
  ),
  setPublishAccountStatus: async (id: string, status: unknown) =>
    publishAccountSchema.parse(await ipcRenderer.invoke(
      "publishAccounts:setStatus", z.string().uuid().parse(id),
      accountLinkStatusSchema.parse(status)
    )),
  checkPublishAccount: async (id: string) => publishAccountSchema.parse(
    await ipcRenderer.invoke("publishAccounts:check", z.string().uuid().parse(id))
  ),
  connectPublishAccount: async (id: string) => publishAccountSchema.parse(
    await ipcRenderer.invoke("publishAccounts:connect", z.string().uuid().parse(id))
  ),
  deletePublishAccount: async (id: string) => z.object({ deleted: z.boolean() }).parse(
    await ipcRenderer.invoke("publishAccounts:delete", z.string().uuid().parse(id))
  ),
  listPublishJobs: async () => z.array(publishJobSchema).parse(
    await ipcRenderer.invoke("publishJobs:list")
  ),
  createPublishJob: async (input: unknown) => publishJobSchema.parse(
    await ipcRenderer.invoke("publishJobs:create", createPublishJobSchema.parse(input))
  ),
  cancelPublishJob: async (id: string) => publishJobSchema.parse(
    await ipcRenderer.invoke("publishJobs:cancel", z.string().uuid().parse(id))
  ),
  exportDiagnostics: async () => z.string().nullable().parse(
    await ipcRenderer.invoke("diagnostics:export")
  ),
  getMediaSettings: async () => mediaSettingsSchema.parse(
    await ipcRenderer.invoke("settings:getMedia")
  ),
  saveMediaSettings: async (input: unknown) => mediaSettingsSchema.parse(
    await ipcRenderer.invoke("settings:saveMedia", mediaSettingsSchema.parse(input))
  ),
  selectBgmFile: async () => z.string().nullable().parse(
    await ipcRenderer.invoke("media:selectBgmFile")
  ),
  selectBgmFolder: async () => z.string().nullable().parse(
    await ipcRenderer.invoke("media:selectBgmFolder")
  ),
  scanAudioLibrary: async (input: unknown) => audioLibraryResultSchema.parse(
    await ipcRenderer.invoke(
      "media:scanAudioLibrary",
      z.object({
        folderPath: z.string().min(1),
        recursive: z.boolean().optional()
      }).parse(input)
    )
  ),
  selectAndProbeFont: async () => {
    const result = await ipcRenderer.invoke("media:selectAndProbeFont");
    return result === null ? null : fontMetadataSchema.parse(result);
  },
  listSystemFonts: async () =>
    z.array(systemFontSchema).parse(
      await ipcRenderer.invoke("media:listSystemFonts")
    ),
  getCopyModelSettings: async () =>
    copyModelSettingsSchema.parse(
      await ipcRenderer.invoke("settings:getCopyModel")
    ),
  saveCopyModelSettings: async (input: unknown) =>
    copyModelSettingsSchema.parse(
      await ipcRenderer.invoke(
        "settings:saveCopyModel",
        copyModelSettingsSchema.parse(input)
      )
    ),
  selectSettingsPath: async (kind: unknown) => z.string().nullable().parse(
    await ipcRenderer.invoke(
      "settings:selectPath",
      z.enum(["output", "work", "bgm"]).parse(kind)
    )
  )
});
