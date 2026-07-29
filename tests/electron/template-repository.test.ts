import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import {
  ensureBuiltInTemplate,
  TemplateRepository
} from "../../electron/repositories/template-repository";

describe("TemplateRepository", () => {
  it("saves ordered shots and returns an immutable task snapshot", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new TemplateRepository(database);

    const template = repository.create({
      name: "工厂口播",
      description: "九镜头模板",
      shots: [
        {
          role: "hook",
          assetCategoryId: null,
          copywriting: "开场",
          durationMode: "voice",
          durationSec: null,
          muteOriginal: true
        },
        {
          role: "cta",
          assetCategoryId: null,
          copywriting: "关注我",
          durationMode: "fixed",
          durationSec: 3,
          muteOriginal: true
        }
      ]
    });
    const snapshot = repository.createSnapshot(template.id);
    repository.update(template.id, {
      name: "修改后的模板",
      description: "修改",
      shots: template.shots
    });

    expect(snapshot.name).toBe("工厂口播");
    expect(snapshot.shots.map((shot) => shot.index)).toEqual([0, 1]);
    expect(snapshot.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it("rejects a fixed shot without a positive duration", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new TemplateRepository(database);

    expect(() =>
      repository.create({
        name: "无效模板",
        description: "",
        shots: [
          {
            role: "hook",
            assetCategoryId: null,
            copywriting: "开场",
            durationMode: "fixed",
            durationSec: null,
            muteOriginal: true
          }
        ]
      })
    ).toThrow("Fixed-duration shot requires a positive duration");
  });

  it("seeds the built-in template only once with nine shots", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new TemplateRepository(database);

    ensureBuiltInTemplate(repository);
    ensureBuiltInTemplate(repository);

    expect(repository.list()).toHaveLength(1);
    expect(repository.list()[0].shots).toHaveLength(9);
    expect(repository.list()[0].shots.at(-1)?.role).toBe("cta");
  });
});
