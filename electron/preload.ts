import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
import { personaInputSchema } from "../src/shared/contracts.js";

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
      )
});
