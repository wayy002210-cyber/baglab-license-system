import { z } from "zod";

const complianceIssueSchema = z
  .object({
    term: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    riskType: z.string(),
    explanation: z.string(),
    suggestion: z.string()
  })
  .strict();

const draftCopywritingSchema = z
  .object({
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    topics: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          angle: z.string(),
          hook: z.string()
        })
        .strict()
    ),
    selectedTopicId: z.string().min(1).nullable(),
    text: z.string(),
    complianceIssues: z.array(complianceIssueSchema)
  })
  .strict();

const draftVoiceSchema = z
  .object({
    voiceId: z.string().min(1),
    source: z.enum(["system", "custom", "clone"]),
    emotion: z.string().nullable(),
    speed: z.number().min(0.5).max(2),
    volume: z.number().min(0).max(3),
    pitch: z.number().int().min(-12).max(12),
    languageBoost: z.string().nullable()
  })
  .strict();

const draftAudioSegmentSchema = z
  .object({
    id: z.string().min(1),
    index: z.number().int().nonnegative(),
    text: z.string().min(1),
    sourceStart: z.number().int().nonnegative(),
    sourceEnd: z.number().int().positive(),
    textHash: z.string(),
    parameterHash: z.string(),
    audioPath: z.string().nullable(),
    durationSec: z.number().positive().nullable(),
    status: z.enum(["pending", "generating", "ready", "failed"]),
    errorMessage: z.string().nullable()
  })
  .strict();

const draftShotSchema = z
  .object({
    id: z.string().min(1),
    index: z.number().int().nonnegative(),
    audioSegmentId: z.string().min(1),
    copywriting: z.string().min(1),
    assetCategoryId: z.string().min(1).nullable(),
    durationMode: z.enum(["voice", "fixed", "auto"]),
    durationSec: z.number().positive().nullable(),
    muteOriginal: z.boolean()
  })
  .strict();

const draftBgmSchema = z
  .object({
    sourceType: z.enum(["file", "folder"]),
    path: z.string().min(1),
    mode: z.enum(["fixed", "random", "sequential"]),
    volume: z.number().min(0).max(1),
    fadeInSec: z.number().nonnegative(),
    fadeOutSec: z.number().nonnegative()
  })
  .strict();

const draftTextStyleSchema = z
  .object({
    fontPath: z.string().nullable(),
    fontFamily: z.string().min(1),
    fontSize: z.number().positive(),
    primaryColor: z.string().min(1),
    outlineColor: z.string().min(1),
    outlineWidth: z.number().nonnegative(),
    shadowColor: z.string().min(1),
    shadowX: z.number(),
    shadowY: z.number(),
    alignment: z.number().int().min(1).max(9),
    marginV: z.number().int().nonnegative()
  })
  .strict();

export const creationDraftSchema = z
  .object({
    version: z.literal(1),
    stage: z.enum(["persona", "copywriting", "audio", "editing", "ready"]),
    personaId: z.string().min(1).nullable(),
    copywriting: draftCopywritingSchema.nullable(),
    voice: draftVoiceSchema.nullable(),
    audioSegments: z.array(draftAudioSegmentSchema),
    shots: z.array(draftShotSchema),
    bgm: draftBgmSchema.nullable(),
    titleStyle: draftTextStyleSchema.nullable(),
    subtitleStyle: draftTextStyleSchema.nullable()
  })
  .strict();

export const taskStatusSchema = z.enum([
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

export const shotPlanSchema = z
  .object({
    index: z.number().int().nonnegative(),
    role: z.enum(["hook", "problem", "proof", "solution", "cta", "custom"]),
    assetCategoryId: z.string().min(1),
    copywriting: z.string().min(1),
    durationMode: z.enum(["voice", "fixed", "auto"]),
    durationSec: z.number().positive().optional(),
    muteOriginal: z.boolean()
  })
  .superRefine((shot, context) => {
    if (shot.durationMode === "fixed" && shot.durationSec === undefined) {
      context.addIssue({
        code: "custom",
        message: "固定时长镜头必须设置正数时长",
        path: ["durationSec"]
      });
    }
  });

export const createTaskSchema = z.object({
  templateId: z.string().min(1),
  personaId: z.string().min(1),
  count: z.number().int().min(1).max(20)
});

const stringListSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(/[,，、\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  z.array(z.string().min(1))
);

export const personaInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  industry: z.string().trim().max(80),
  brandFacts: stringListSchema,
  tone: z.string().trim().max(200),
  cta: z.string().trim().max(200),
  bannedWords: stringListSchema,
  isDefault: z.boolean()
});

export const publishJobSchema = z
  .object({
    taskId: z.string().min(1),
    accountId: z.string().min(1),
    title: z.string().min(1),
    topics: z.array(z.string().min(1)).min(1),
    status: z.enum([
      "pending",
      "scheduled",
      "publishing",
      "published",
      "failed",
      "needs_user"
    ]),
    scheduledAt: z.number().int().positive().optional()
  })
  .superRefine((job, context) => {
    if (job.status === "scheduled" && job.scheduledAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "排期任务必须设置发布时间",
        path: ["scheduledAt"]
      });
    }
  });

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type ShotPlan = z.infer<typeof shotPlanSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PersonaInput = z.infer<typeof personaInputSchema>;
export type PublishJob = z.infer<typeof publishJobSchema>;
export type CreationDraft = z.infer<typeof creationDraftSchema>;
