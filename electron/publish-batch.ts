export type PublishBatchResult = { total: number; succeeded: number; failed: number };

export async function runPublishBatch(
  jobIds: string[],
  run: (jobId: string) => Promise<boolean>
): Promise<PublishBatchResult> {
  let succeeded = 0;
  for (const jobId of jobIds) {
    try {
      if (await run(jobId)) succeeded += 1;
    } catch {
      // One broken job must not prevent the remaining batch from running.
    }
  }
  return { total: jobIds.length, succeeded, failed: jobIds.length - succeeded };
}
