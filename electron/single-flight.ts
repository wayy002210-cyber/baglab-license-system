export type SingleFlightSkipHandler<TArgs extends unknown[]> = (...args: TArgs) => void;

export function createSingleFlight<TArgs extends unknown[]>(
  task: (...args: TArgs) => Promise<void>,
  onSkip?: SingleFlightSkipHandler<TArgs>
): (...args: TArgs) => Promise<void> {
  let running: Promise<void> | null = null;

  return (...args: TArgs) => {
    if (running) {
      onSkip?.(...args);
      return running;
    }

    running = task(...args).finally(() => {
      running = null;
    });
    return running;
  };
}
