export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () =>
      reject(
        signal.reason instanceof Error ? signal.reason : new Error('Cancelled'),
      );
    signal.addEventListener('abort', aborted, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', aborted))
      .catch(() => undefined);
  });
}
