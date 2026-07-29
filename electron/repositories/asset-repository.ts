import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type ScannedAssetInput = {
  fileName: string;
  filePath: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  rotation: number;
  fileSize: number;
  fingerprint: string;
  thumbnailPath: string | null;
  status: string;
  errorMessage: string | null;
};

export type CategoryScanInput = {
  categoryName: string;
  folderPath: string;
  assets: ScannedAssetInput[];
};

export type AssetCategorySummary = {
  id: string;
  name: string;
  folderPath: string;
  assetCount: number;
  invalidCount: number;
  lastScannedAt: string | null;
};

export type AssetRecord = ScannedAssetInput & {
  id: string;
  categoryId: string;
};

type AssetRow = {
  id: string;
  category_id: string;
  file_path: string;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  rotation: number;
  file_size: number;
  fingerprint: string;
  thumbnail_path: string | null;
  status: string;
  error_message: string | null;
};

export class AssetRepository {
  constructor(private readonly database: Database.Database) {}

  saveCategoryScan(input: CategoryScanInput): AssetCategorySummary {
    const save = this.database.transaction(() => {
      const existing = this.database
        .prepare("SELECT id FROM asset_categories WHERE folder_path = ?")
        .get(input.folderPath) as { id: string } | undefined;
      const categoryId = existing?.id ?? randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(
          `INSERT INTO asset_categories(
             id, name, folder_path, last_scanned_at, created_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(folder_path) DO UPDATE SET
             name = excluded.name,
             last_scanned_at = excluded.last_scanned_at`
        )
        .run(categoryId, input.categoryName.trim(), input.folderPath, now, now);
      this.database
        .prepare("DELETE FROM assets WHERE category_id = ?")
        .run(categoryId);
      const insert = this.database.prepare(
        `INSERT INTO assets(
           id, category_id, file_path, duration_sec, width, height, fps,
           codec, rotation, file_size, fingerprint, thumbnail_path, status, error_message,
           probed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const asset of input.assets) {
        insert.run(
          randomUUID(),
          categoryId,
          asset.filePath,
          asset.durationSec,
          asset.width,
          asset.height,
          asset.fps,
          asset.codec,
          asset.rotation,
          asset.fileSize,
          asset.fingerprint,
          asset.thumbnailPath,
          asset.status,
          asset.errorMessage,
          now
        );
      }
      return categoryId;
    });
    const categoryId = save();
    const category = this.listCategories().find((item) => item.id === categoryId);
    if (!category) throw new Error("Failed to save category scan");
    return category;
  }

  listCategories(): AssetCategorySummary[] {
    const rows = this.database
      .prepare(
        `SELECT
           c.id, c.name, c.folder_path, c.last_scanned_at,
           COUNT(a.id) AS asset_count,
           COALESCE(SUM(CASE WHEN a.status = 'invalid' THEN 1 ELSE 0 END), 0)
             AS invalid_count
         FROM asset_categories c
         LEFT JOIN assets a ON a.category_id = c.id
         GROUP BY c.id
         ORDER BY c.name COLLATE NOCASE`
      )
      .all() as Array<{
      id: string;
      name: string;
      folder_path: string;
      last_scanned_at: string | null;
      asset_count: number;
      invalid_count: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      folderPath: row.folder_path,
      assetCount: row.asset_count,
      invalidCount: row.invalid_count,
      lastScannedAt: row.last_scanned_at
    }));
  }

  listAssets(categoryId: string): AssetRecord[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM assets
         WHERE category_id = ?
         ORDER BY file_path COLLATE NOCASE`
      )
      .all(categoryId) as AssetRow[];
    return rows.map(mapAsset);
  }

  getAsset(id: string): AssetRecord | null {
    const row = this.database
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as AssetRow | undefined;
    return row ? mapAsset(row) : null;
  }
}

const mapAsset = (row: AssetRow): AssetRecord => ({
      id: row.id,
      categoryId: row.category_id,
      fileName: row.file_path.replaceAll("\\", "/").split("/").at(-1) ?? "",
      filePath: row.file_path,
      durationSec: row.duration_sec,
      width: row.width,
      height: row.height,
      fps: row.fps,
      codec: row.codec,
      rotation: row.rotation,
      fileSize: row.file_size,
      fingerprint: row.fingerprint,
      thumbnailPath: row.thumbnail_path,
      status: row.status,
      errorMessage: row.error_message
    });
