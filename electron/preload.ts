import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";

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
    )
});
