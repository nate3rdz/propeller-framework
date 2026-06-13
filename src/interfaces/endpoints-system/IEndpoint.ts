import { Response } from "express";
import IEndpointMiddleware from "./IEndpointMiddleware";
import IEndpointValidator from "./IEndpointValidator";
import IPropellerInputContract from "./IPropellerInputContract";
import IPropellerOutputContract from "./IPropellerOutputContract";

export type EndpointFunction<
    Req = IPropellerInputContract,
    Res = IPropellerOutputContract,
> = (req: Req, res: Response) => Promise<Res | null>;
export type EndpointMethods = "post" | "get" | "patch" | "put" | "delete";

export default interface IEndpoint<
    TAccount = any,
    TPermission extends string = string
> {
    method: EndpointMethods;
    handler: EndpointFunction;
    validators: IEndpointValidator[];
    middlewares: IEndpointMiddleware[];
    auth: boolean;
    path: string;
    requiredPermissions: TPermission[];
}
