export const MIDDLEWARES: Record<string, (...args: any) => any> = {};

export function registerMiddleware(name: string, fn: (...args: any) => any): void {
    MIDDLEWARES[name] = fn;
}
