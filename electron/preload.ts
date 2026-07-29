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

contextBridge.exposeInMainWorld("autocut", {
  backendStatus: async () =>
    backendStatusSchema.parse(await ipcRenderer.invoke("backend:status"))
});
