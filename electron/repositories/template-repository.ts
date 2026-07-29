import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type TemplateShotInput = {
  role: "hook" | "problem" | "proof" | "solution" | "cta" | "custom";
  assetCategoryId: string | null;
  copywriting: string;
  durationMode: "voice" | "fixed" | "auto";
  durationSec: number | null;
  muteOriginal: boolean;
};

export type TemplateShot = TemplateShotInput & {
  id: string;
  index: number;
};

export type TemplateInput = {
  name: string;
  description: string;
  shots: TemplateShotInput[];
};

export type VideoTemplate = {
  id: string;
  name: string;
  description: string;
  canvas: { width: number; height: number; fps: number };
  version: number;
  shots: TemplateShot[];
  createdAt: string;
  updatedAt: string;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  version: number;
  created_at: string;
  updated_at: string;
};

type ShotRow = {
  id: string;
  shot_index: number;
  role: TemplateShotInput["role"];
  asset_category_id: string | null;
  copywriting: string;
  duration_mode: TemplateShotInput["durationMode"];
  duration_sec: number | null;
  mute_original: number;
};

function validate(input: TemplateInput): void {
  if (!input.name.trim()) throw new Error("Template name is required");
  if (input.shots.length === 0) throw new Error("Template requires at least one shot");
  for (const shot of input.shots) {
    if (
      shot.durationMode === "fixed" &&
      (shot.durationSec === null || shot.durationSec <= 0)
    ) {
      throw new Error("Fixed-duration shot requires a positive duration");
    }
  }
}

export class TemplateRepository {
  constructor(private readonly database: Database.Database) {}

  list(): VideoTemplate[] {
    const rows = this.database
      .prepare("SELECT * FROM templates ORDER BY updated_at DESC")
      .all() as TemplateRow[];
    return rows.map((row) => this.mapTemplate(row));
  }

  get(id: string): VideoTemplate | null {
    const row = this.database
      .prepare("SELECT * FROM templates WHERE id = ?")
      .get(id) as TemplateRow | undefined;
    return row ? this.mapTemplate(row) : null;
  }

  create(input: TemplateInput): VideoTemplate {
    validate(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    const save = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO templates(
             id, name, description, width, height, fps, version,
             created_at, updated_at
           ) VALUES (?, ?, ?, 1080, 1920, 30, 1, ?, ?)`
        )
        .run(id, input.name.trim(), input.description.trim(), now, now);
      this.replaceShots(id, input.shots);
    });
    save();
    const template = this.get(id);
    if (!template) throw new Error("Failed to create template");
    return template;
  }

  update(id: string, input: TemplateInput): VideoTemplate {
    validate(input);
    if (!this.get(id)) throw new Error(`Template not found: ${id}`);
    const save = this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE templates SET
             name = ?, description = ?, version = version + 1, updated_at = ?
           WHERE id = ?`
        )
        .run(input.name.trim(), input.description.trim(), new Date().toISOString(), id);
      this.database
        .prepare("DELETE FROM template_shots WHERE template_id = ?")
        .run(id);
      this.replaceShots(id, input.shots);
    });
    save();
    const template = this.get(id);
    if (!template) throw new Error("Failed to update template");
    return template;
  }

  duplicate(id: string): VideoTemplate {
    const source = this.get(id);
    if (!source) throw new Error(`Template not found: ${id}`);
    return this.create({
      name: `${source.name} 副本`,
      description: source.description,
      shots: source.shots.map(({ id: _id, index: _index, ...shot }) => shot)
    });
  }

  delete(id: string): boolean {
    return this.database
      .prepare("DELETE FROM templates WHERE id = ?")
      .run(id).changes > 0;
  }

  createSnapshot(id: string): VideoTemplate {
    const template = this.get(id);
    if (!template) throw new Error(`Template not found: ${id}`);
    return structuredClone(template);
  }

  private replaceShots(templateId: string, shots: TemplateShotInput[]): void {
    const insert = this.database.prepare(
      `INSERT INTO template_shots(
         id, template_id, shot_index, role, asset_category_id, copywriting,
         duration_mode, duration_sec, mute_original, subtitle_overrides_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`
    );
    shots.forEach((shot, index) => {
      insert.run(
        randomUUID(),
        templateId,
        index,
        shot.role,
        shot.assetCategoryId,
        shot.copywriting.trim(),
        shot.durationMode,
        shot.durationSec,
        shot.muteOriginal ? 1 : 0
      );
    });
  }

  private mapTemplate(row: TemplateRow): VideoTemplate {
    const shots = this.database
      .prepare(
        `SELECT * FROM template_shots
         WHERE template_id = ?
         ORDER BY shot_index`
      )
      .all(row.id) as ShotRow[];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      canvas: { width: row.width, height: row.height, fps: row.fps },
      version: row.version,
      shots: shots.map((shot) => ({
        id: shot.id,
        index: shot.shot_index,
        role: shot.role,
        assetCategoryId: shot.asset_category_id,
        copywriting: shot.copywriting,
        durationMode: shot.duration_mode,
        durationSec: shot.duration_sec,
        muteOriginal: Boolean(shot.mute_original)
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export function ensureBuiltInTemplate(repository: TemplateRepository): void {
  if (repository.list().length > 0) return;
  repository.create({
    name: "工厂 / 门店口播模板",
    description: "九镜头竖屏口播结构：钩子、痛点、证明、方案与行动引导",
    shots: [
      {
        role: "hook",
        assetCategoryId: null,
        copywriting: "用一句结果或反常识观点抓住注意力",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "problem",
        assetCategoryId: null,
        copywriting: "指出目标客户正在遇到的核心问题",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "proof",
        assetCategoryId: null,
        copywriting: "展示工厂、门店或团队的真实依据",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "solution",
        assetCategoryId: null,
        copywriting: "解释解决方案的第一步",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "solution",
        assetCategoryId: null,
        copywriting: "解释解决方案的第二步",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "proof",
        assetCategoryId: null,
        copywriting: "补充过程、数据或客户反馈",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "solution",
        assetCategoryId: null,
        copywriting: "说明客户最终能获得的结果",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "proof",
        assetCategoryId: null,
        copywriting: "用一句可信承诺收束价值",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      },
      {
        role: "cta",
        assetCategoryId: null,
        copywriting: "给出明确、克制的行动引导",
        durationMode: "voice",
        durationSec: null,
        muteOriginal: true
      }
    ]
  });
}
