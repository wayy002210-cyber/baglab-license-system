import { z } from "zod";

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);

export const textStyleSchema = z.object({
  fontPath: z.string().nullable(),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(12).max(240),
  primaryColor: colorSchema,
  outlineColor: colorSchema,
  outlineWidth: z.number().min(0).max(20),
  shadowColor: colorSchema,
  shadowX: z.number().min(-30).max(30),
  shadowY: z.number().min(-30).max(30),
  alignment: z.number().int().min(1).max(9),
  marginV: z.number().int().min(0).max(960)
}).strict();

export type TextStyle = z.infer<typeof textStyleSchema>;

export const defaultSubtitleStyle: TextStyle = {
  fontPath: null,
  fontFamily: "Microsoft YaHei",
  fontSize: 58,
  primaryColor: "#FFFFFF",
  outlineColor: "#101010",
  outlineWidth: 4,
  shadowColor: "#80000000",
  shadowX: 1,
  shadowY: 1,
  alignment: 2,
  marginV: 170
};

export const defaultTitleStyle: TextStyle = {
  ...defaultSubtitleStyle,
  fontSize: 82,
  primaryColor: "#FFE600",
  alignment: 8,
  marginV: 120
};

export const subtitleStylePresets = [
  { name: "白字黑边", value: defaultSubtitleStyle },
  {
    name: "品牌黄",
    value: { ...defaultSubtitleStyle, primaryColor: "#FFE600" }
  },
  {
    name: "高亮黑底",
    value: {
      ...defaultSubtitleStyle,
      primaryColor: "#111111",
      outlineColor: "#FFE600",
      outlineWidth: 8
    }
  }
] as const;
