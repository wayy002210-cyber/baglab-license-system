type EditablePublishAsset = {
  id: string;
  publishTitle: string;
  topics: readonly string[];
  topicTemplateId: string | null;
  coverPath: string | null;
  verticalCoverPath?: string | null;
  horizontalCoverPath?: string | null;
};

export function createPublishAssetPatch(asset: EditablePublishAsset) {
  const verticalCoverPath = asset.verticalCoverPath ?? asset.coverPath ?? null;
  const horizontalCoverPath = asset.horizontalCoverPath ?? null;
  return {
    publishTitle: String(asset.publishTitle),
    topics: Array.from(asset.topics, (topic) => String(topic)),
    topicTemplateId: asset.topicTemplateId ? String(asset.topicTemplateId) : null,
    coverPath: verticalCoverPath ? String(verticalCoverPath) : null,
    verticalCoverPath: verticalCoverPath ? String(verticalCoverPath) : null,
    horizontalCoverPath: horizontalCoverPath ? String(horizontalCoverPath) : null
  };
}

export function createPublishJobsInput(assetId: string, accountIds: readonly string[], publishTime: string | null) {
  return {
    assetId: String(assetId),
    accountIds: Array.from(accountIds, (accountId) => String(accountId)),
    publishTime
  };
}
