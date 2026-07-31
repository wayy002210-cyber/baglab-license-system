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
  ,
  positionX: z.number().int().min(0).max(1080).default(540),
  positionY: z.number().int().min(0).max(1920).default(1650)
}).strict();

export type TextStyle = z.infer<typeof textStyleSchema>;

export const defaultSubtitleStyle: TextStyle = {
  fontPath: null,
  fontFamily: "Microsoft YaHei",
  fontSize: 58,
  primaryColor: "#FFFFFF",
  outlineColor: "#101010",
  outlineWidth: 2,
  shadowColor: "#40000000",
  shadowX: 0,
  shadowY: 0,
  alignment: 2,
  marginV: 170,
  positionX: 540,
  positionY: 1650
};

export const defaultTitleStyle: TextStyle = {
  ...defaultSubtitleStyle,
  fontSize: 82,
  primaryColor: "#FFE600",
  alignment: 8,
  marginV: 120,
  positionX: 540,
  positionY: 180
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
      outlineWidth: 3
    }
  }
] as const;
