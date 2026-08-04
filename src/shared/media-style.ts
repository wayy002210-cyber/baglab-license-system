import { z } from "zod";
const color=z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
export const textStyleSchema=z.object({
 fontPath:z.string().nullable(),fontFamily:z.string().min(1),fontSize:z.number().min(12).max(240),
 bold:z.boolean().default(false),italic:z.boolean().default(false),underline:z.boolean().default(false),
 letterSpacing:z.number().min(-20).max(100).default(0),lineSpacing:z.number().min(-20).max(100).default(0),
 scale:z.number().min(10).max(300).default(100),opacity:z.number().min(0).max(100).default(100),
 primaryColor:color,outlineColor:color,outlineWidth:z.number().min(0).max(20),shadowColor:color,
 shadowX:z.number().min(-30).max(30),shadowY:z.number().min(-30).max(30),shadowBlur:z.number().min(0).max(30).default(0),
 alignment:z.number().int().min(1).max(9),marginV:z.number().int().min(0).max(960),
 positionX:z.number().int().min(0).max(1080).default(540),positionY:z.number().int().min(0).max(1920).default(1650)
}).strict();
export type TextStyle=z.infer<typeof textStyleSchema>;
export const defaultSubtitleStyle:TextStyle={fontPath:null,fontFamily:"Microsoft YaHei",fontSize:58,bold:false,italic:false,underline:false,letterSpacing:0,lineSpacing:0,scale:100,opacity:100,primaryColor:"#FFFFFF",outlineColor:"#101010",outlineWidth:2,shadowColor:"#00000000",shadowX:0,shadowY:0,shadowBlur:0,alignment:2,marginV:170,positionX:540,positionY:1650};
export const defaultTitleStyle:TextStyle={...defaultSubtitleStyle,fontSize:82,bold:true,primaryColor:"#FFE600",alignment:8,marginV:120,positionY:180};
export const subtitleStylePresets=[
 {name:"白字黑边",value:defaultSubtitleStyle},
 {name:"品牌黄",value:{...defaultSubtitleStyle,primaryColor:"#FFE600"}},
 {name:"高亮黑底",value:{...defaultSubtitleStyle,primaryColor:"#111111",outlineColor:"#FFE600",outlineWidth:3}}
] as const;
