import { z } from "zod";
export const loginSchema = z.object({ password: z.string().min(8).max(256) }).strict();
export const generateSchema = z.object({ plan: z.enum(["day1","day3","day7","month","year","permanent"]), count: z.number().int().min(1).max(500), note: z.string().max(500).default("") }).strict();
export const mutationSchema = z.object({ licenseId: z.uuid(), action: z.enum(["disable","restore","extend","unbind"]), hours: z.number().int().positive().max(87600).optional(), note: z.string().max(500).default("") }).strict().refine((value) => value.action !== "extend" || value.hours !== undefined, "Extension hours required");
