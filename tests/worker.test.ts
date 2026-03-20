import { describe, expect, test } from "vitest";

import { createLogger, main, runWorkerLoop } from "../dr-stone-scrapper/src/index.js";

class StubService {
  calls = 0;

  constructor(private readonly resultsPerRun: Array<Array<Record<string, string>>>) {}

  async collectAllActive() {
    const result = this.resultsPerRun[Math.min(this.calls, this.resultsPerRun.length - 1)];
    this.calls += 1;
    return result;
  }
}

describe("worker", () => {
  test("collects once when requested", async () => {
    const service = new StubService([[{ tracked_product_id: "prod-1" }]]);

    await runWorkerLoop({
      collector: service as never,
      logger: createLogger("silent"),
      intervalSeconds: 21600,
      runOnce: true
    });

    expect(service.calls).toBe(1);
  });

  test("sleeps remaining interval", async () => {
    const service = new StubService([
      [{ tracked_product_id: "prod-1" }],
      [{ tracked_product_id: "prod-2" }]
    ]);
    const sleepCalls: number[] = [];
    const nowValues = [100_000, 112_500];

    await expect(
      runWorkerLoop({
        collector: service as never,
        logger: createLogger("silent"),
        intervalSeconds: 30,
        sleepFn: async (milliseconds) => {
          sleepCalls.push(milliseconds);
          throw new Error("stop loop");
        },
        now: () => nowValues.shift() ?? 112_500
      })
    ).rejects.toThrow("stop loop");

    expect(service.calls).toBe(1);
    expect(sleepCalls).toEqual([17_500]);
  });

  test("rejects a non-positive interval", async () => {
    await expect(main(["--interval-seconds", "0"])).rejects.toThrow(
      "interval-seconds must be a positive integer"
    );
  });
});
