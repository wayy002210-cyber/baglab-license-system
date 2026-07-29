import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import { AssetRepository } from "../../electron/repositories/asset-repository";

describe("AssetRepository", () => {
  it("replaces a category scan and removes missing files", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new AssetRepository(database);

    repository.saveCategoryScan({
      categoryName: "人物",
      folderPath: "D:/assets/人物",
      assets: [
        {
          fileName: "old.mp4",
          filePath: "D:/assets/人物/old.mp4",
          durationSec: 3,
          width: 1080,
          height: 1920,
          fps: 30,
          codec: "h264",
          rotation: 0,
          fileSize: 100,
          fingerprint: "old",
          thumbnailPath: "D:/cache/old.jpg",
          status: "ready",
          errorMessage: null
        }
      ]
    });
    repository.saveCategoryScan({
      categoryName: "人物",
      folderPath: "D:/assets/人物",
      assets: [
        {
          fileName: "new.mp4",
          filePath: "D:/assets/人物/new.mp4",
          durationSec: 4,
          width: 1080,
          height: 1920,
          fps: 30,
          codec: "h264",
          rotation: 0,
          fileSize: 120,
          fingerprint: "new",
          thumbnailPath: "D:/cache/new.jpg",
          status: "ready",
          errorMessage: null
        }
      ]
    });

    const categories = repository.listCategories();
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({
      name: "人物",
      assetCount: 1,
      invalidCount: 0
    });
    const stored = repository.listAssets(categories[0].id)[0];
    expect(stored.fileName).toBe("new.mp4");
    expect(stored.thumbnailPath).toBe(
      "D:/cache/new.jpg"
    );
    expect(repository.getAsset(stored.id)?.id).toBe(stored.id);
  });
});
