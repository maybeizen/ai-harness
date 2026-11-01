export interface CloseDependencies {
  stop: () => Promise<void>;
  isActive: () => boolean;
  flush: () => Promise<void>;
  freeze: (closing: boolean) => void;
  destroy: () => Promise<void>;
  report: (error: unknown) => void;
}
export function closeBarrier(dependencies: CloseDependencies) {
  let pending: Promise<void> | undefined;
  return () => {
    if (pending) return pending;
    dependencies.freeze(true);
    pending = (async () => {
      try {
        await dependencies.stop();
        if (dependencies.isActive())
          throw Object.assign(
            new Error('Stop the active task before closing.'),
            { code: 'BUSY' },
          );
        await dependencies.flush();
        await dependencies.destroy();
      } catch (error) {
        dependencies.report(error);
        dependencies.freeze(false);
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  };
}
