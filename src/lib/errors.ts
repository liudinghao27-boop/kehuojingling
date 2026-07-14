export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.message === 'string') return err.message;
    if (typeof err.error === 'object' && err.error !== null) {
      const nested = err.error as Record<string, unknown>;
      if (typeof nested.message === 'string') return nested.message;
    }
  }
  return String(error);
}
