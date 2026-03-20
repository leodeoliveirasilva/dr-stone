import { describe, expect, test } from "vitest";

import { createLogger, main, runWorkerLoop } from "../dr-stone-scrapper/src/index.js";

class StubScheduler {
  calls = 0;

  constructor(
    private readonly resultsPerRun: Array<{
      scheduledCount: number;
      skippedCount: number;
    }>
  ) {}

  async scheduleQueuedWork() {
    const result = this.resultsPerRun[Math.min(this.calls, this.resultsPerRun.length - 1)];
    this.calls += 1;
    return result;
  }
}

describe("worker", () => {
  test("schedules once when requested", async () => {
    const scheduler = new StubScheduler([{ scheduledCount: 1, skippedCount: 0 }]);

    await runWorkerLoop({
      logger: createLogger("silent"),
      intervalSeconds: 21600,
      runOnce: true,
      scheduleQueuedWork: () => scheduler.scheduleQueuedWork()
    });

    expect(scheduler.calls).toBe(1);
  });

  test("sleeps remaining interval", async () => {
    const scheduler = new StubScheduler([
      { scheduledCount: 1, skippedCount: 0 },
      { scheduledCount: 1, skippedCount: 0 }
    ]);
    const sleepCalls: number[] = [];
    const nowValues = [100_000, 112_500];

    await expect(
      runWorkerLoop({
        logger: createLogger("silent"),
        intervalSeconds: 30,
        scheduleQueuedWork: () => scheduler.scheduleQueuedWork(),
        sleepFn: async (milliseconds) => {
          sleepCalls.push(milliseconds);
          throw new Error("stop loop");
        },
        now: () => nowValues.shift() ?? 112_500
      })
    ).rejects.toThrow("stop loop");

    expect(scheduler.calls).toBe(1);
    expect(sleepCalls).toEqual([17_500]);
  });

  test("rejects a non-positive interval", async () => {
    await expect(main(["--interval-seconds", "0"])).rejects.toThrow(
      "interval-seconds must be a positive integer"
    );
  });
});
