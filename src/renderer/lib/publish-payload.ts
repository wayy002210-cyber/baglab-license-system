type EditablePublishAsset = {
  id: string;
  publishTitle: string;
  topics: readonly string[];
  topicTemplateId: string | null;
  coverPath: string | null;
};

export function createPublishAssetPatch(asset: EditablePublishAsset) {
  return {
    publishTitle: String(asset.publishTitle),
    topics: Array.from(asset.topics, (topic) => String(topic)),
    topicTemplateId: asset.topicTemplateId ? String(asset.topicTemplateId) : null,
    coverPath: asset.coverPath ? String(asset.coverPath) : null
  };
}

export function createPublishJobsInput(assetId: string, accountIds: readonly string[], scheduledAt: string | null) {
  return {
    assetId: String(assetId),
    accountIds: Array.from(accountIds, (accountId) => String(accountId)),
    scheduledAt
  };
}
