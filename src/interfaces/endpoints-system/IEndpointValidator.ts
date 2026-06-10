import { ZodSchema } from 'zod';

export const VALIDATION_TARGETS = ['body', 'query', 'params', 'headers', 'other'] as const;
export type VALIDATION_TARGETS_TYPE = typeof VALIDATION_TARGETS[number];

export default interface IEndpointValidator{
    dest: "endpoint-input" | "endpoint-output",
    schema: ZodSchema | ((...args: any[]) => boolean),
    target: VALIDATION_TARGETS_TYPE,
    customStatusNumber?: number
}