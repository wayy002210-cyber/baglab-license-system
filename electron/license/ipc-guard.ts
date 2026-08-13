type LicenseGate = { assertAllowed(): void };
type IpcHandler = (event: unknown, ...args: any[]) => unknown;

export function createLicensedHandler<T extends IpcHandler>(
  gate: LicenseGate,
  handler: T
): T {
  return (async (event: unknown, ...args: Parameters<T> extends [unknown, ...infer A] ? A : never) => {
    gate.assertAllowed();
    return handler(event, ...args);
  }) as T;
}
