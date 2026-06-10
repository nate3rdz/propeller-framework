import { NextFunction, Request, Response } from "express";
import PropellerLogger from "../services/propellerLogger.service.js";
import { ZodSchema } from "zod";
import IEndpointValidator, { VALIDATION_TARGETS, VALIDATION_TARGETS_TYPE } from "../interfaces/endpoints-system/IEndpointValidator.js";
import InternalAPIError from "./InternalAPIError.js";

/**
 * An Endpoint validator is a class that through the generateFunction method can generate a middleware that is used to validate the input or the output of a middleware / endpoint
 */
export default class EndpointValidator<R extends Request, S extends Response, T> implements IEndpointValidator {
    constructor(schema: ZodSchema | ((...args: any[]) => any), dest: "endpoint-input" | "endpoint-output", target: VALIDATION_TARGETS_TYPE, customStatusNumber?: number) {
        this.schema = schema;
        this.dest = dest;
        this.target = target;
        this.customStatusNumber = customStatusNumber;
    }

    private _schema: ZodSchema | ((...args: any[]) => any);
    private _dest: "endpoint-input" | "endpoint-output";
    private _target: VALIDATION_TARGETS_TYPE
    private _customStatusNumber?: number;

    async generateFunction() {
        return async (req: R, res: S, next: NextFunction) => {
            let validation: boolean = await this.validate(req);

            if (!validation)
                res.status(this.customStatusNumber || 400).send({ message: "Invalid input " + this.target + " for this call." });
            else next();
        }
    }

    private async validate(input: any): Promise<boolean> {
        if(this.dest === 'endpoint-input' && this.target === 'other')
            throw new InternalAPIError('Invalid validator data provided.', 500);

        // if we're trying to validate targets that are not part of the input body
        if (this.target === 'other') {
            if (typeof this.schema === 'function')
                return this.schema(input);
            else
                return (await this.schema.safeParseAsync(input)).success;
        } else { // else, select a target
            if (typeof this.schema === 'function')
                return this.schema(input[this.target]);
            else
                return (await this.schema.safeParseAsync(input[this.target])).success;
        }
    }



    /**Validation schema used by the validator. It can be a zod schema or a function */
    get schema() {
        return this._schema;
    }

    /**Destination of the validation: it can be at the start/end of the endpoint flow (sequence) or before / after the endpoint itself.*/
    get dest() {
        return this._dest;
    }

    /**The parts of the call (i.e. body, params) that are subjected to the verification by the schema. */
    get target() {
        return this._target;
    }

    /**A custom status number in case of error during validation. */
    get customStatusNumber() {
        return this._customStatusNumber;
    }


    set schema(schema: ZodSchema | ((...args: any[]) => any)) {
        this._schema = schema;
    }

    set dest(dest: "endpoint-input" | "endpoint-output") {
        this._dest = dest;
    }

    set target(target: VALIDATION_TARGETS_TYPE) {
        if(!VALIDATION_TARGETS.includes(target))
            throw new InternalAPIError('Invalid validation target passed.', 500);

        this._target = target;
    }

    set customStatusNumber(status: number) {
        this._customStatusNumber = status;
    }
}