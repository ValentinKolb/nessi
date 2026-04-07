export class AsyncLocalStorage<T> {
  run<R>(_store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    return callback(...args);
  }

  getStore(): T | undefined {
    return undefined;
  }

  enterWith(_store: T): void {}

  disable(): void {}
}
