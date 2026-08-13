import { describe, expect, it } from "vitest";
import { createSingleFlight } from "../../electron/single-flight";

describe("createSingleFlight", () => {
  it("prevents concurrent duplicate task execution", async () => {
    let releases!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      releases = resolve;
    });
    const calls: string[] = [];
    const skipped: string[] = [];
    const runner = createSingleFlight(
      async (id: string) => {
        calls.push(id);
        await firstRun;
      },
      (id) => skipped.push(id)
    );

    const first = runner("job-1");
    const second = runner("job-1");

    expect(calls).toEqual(["job-1"]);
    expect(skipped).toEqual(["job-1"]);

    releases();
    await Promise.all([first, second]);

    const third = runner("job-1");
    releases();
    await third;

    expect(calls).toEqual(["job-1", "job-1"]);
  });
});
