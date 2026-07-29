import { z } from "zod";

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
export type PublishJob = z.infer<typeof publishJobSchema>;
