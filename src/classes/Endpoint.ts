import { NextFunction, Request, Response } from "express";
import PropellerLogger from "../services/propellerLogger.service.js";
import IEndpoint, { EndpointFunction, EndpointMethods } from "../interfaces/endpoints-system/IEndpoint.js";
import IEndpointMiddleware from "../interfaces/endpoints-system/IEndpointMiddleware.js";
import IEndpointValidator from "../interfaces/endpoints-system/IEndpointValidator.js";
import { MIDDLEWARES } from "../middlewares/index.js";
import InternalAPIError from "./InternalAPIError.js";
import InnerDataI from "../interfaces/endpoints-system/InnerDataI.js";
import AuthService from "../services/auth.service.js";
import PermissionsService from "../services/permissions.service.js";
import { getConfig } from "../config.js";

export default abstract class Endpoint<
    R extends Request,
    S extends Response,
    T,
    TAccount = any,
    TPermission extends string = string
> implements IEndpoint<R, S, T, TPermission> {

    constructor(middlewares?: IEndpointMiddleware[]) {
        this.setValidators();
        this.setMiddlewares(middlewares || []);
    }

    private _method: EndpointMethods;
    private _auth: boolean = true;
    private _requiredPermissions: TPermission[] = [];
    private _validators: IEndpointValidator[] = [];
    private _path: string;
    private _function: EndpointFunction<R, S, T>;
    private _middlewares: IEndpointMiddleware[] = [];
    private _innerData: InnerDataI<TAccount> = {
        account: null,
        auth: {
            token: null,
            data: null
        },
        request: {
            ip: null
        }
    };

    /**This function sets the validators of the endpoint. */
    abstract setValidators(): void;

    /** This function takes an array of Endpoint Middlewares info and then is used to initialize the endpoint with its middlewares */
    private setMiddlewares(middlewares: IEndpointMiddleware[]): void {
        this.middlewares.push(...middlewares);
    };

    /** This function generates an endpoint flow. It's called inside of the router, and takes an endpoint as argument.
     * This is done to circumvent the limitation about the subclasses that implements this endpoint.
     */
    static generate<R extends Request, S extends Response, T, TAccount, TPermission extends string>(
        endpoint: Endpoint<R, S, T, TAccount, TPermission>
    ): (req: R, res: S, next: NextFunction) => Promise<void> {
        return async (req: R, res: S, next: NextFunction) => {
            try {
                const config = getConfig();

                // innerData population
                let innerDataPopulationSuccess = true;
                try {
                    if (endpoint.auth) { // if the endpoint inner data about user info can be populated because of the presence of the auth token
                        const authToken = AuthService.getDataByToken(req?.headers?.authorization);

                        if (!authToken || !authToken?.data?.userId) {
                            PropellerLogger.error(`Impossible to seed user\'s data.`);
                            throw new InternalAPIError('Internal error', 500);
                        }

                        if (!config.accountResolver)
                            throw new InternalAPIError('accountResolver not configured. Call configure() before starting the server.', 500);

                        // populate user's data via the user-provided resolver
                        endpoint._innerData.account = await config.accountResolver(authToken.data.userId) as TAccount;
                        if (!endpoint._innerData.account)
                            throw new InternalAPIError('Account not found.', 404);

                        endpoint._innerData.auth = authToken;
                    }

                    // populates inner data that's about the endpoint call
                    endpoint._innerData.request.ip = req.socket.remoteAddress; // IP
                } catch (e) {
                    PropellerLogger.error(`Critical error while populating endpoint's inner data (${e.toString()})`);
                    res.status(500).send({ message: 'Invalid credentials.' });
                    innerDataPopulationSuccess = false;
                }

                if (innerDataPopulationSuccess) { // if the innerData population went correctly
                    // user permissions check via the user-provided resolver
                    const givenPermissions = config.permissionsResolver
                        ? config.permissionsResolver(endpoint._innerData.account)
                        : [];

                    if (!PermissionsService.validate(givenPermissions, endpoint?.requiredPermissions || []))
                        throw new InternalAPIError('Not authorized to perform this action.', 403);


                    let middlewareResult = null; // if there's any 'pre' middleware, then this variable saves the result of the middleware
                    let data = null; // final result of endpoint's call.

                    for (let middleware of endpoint.middlewares || []) { // applies 'pre' middlewares, if any
                        if (middleware.dest === 'pre') {
                            //@ts-ignore
                            middlewareResult = await MIDDLEWARES[middleware.identifier](req); // todo: the typing is lost here because of the definition of the MIDDLEWARES array. Find a solution
                        }
                    }

                    // TODO: Add somesort of runtime validation here

                    data = await endpoint.function(middlewareResult || req, res); // applies main function

                    // TODO: Add somesort of runtime validation here

                    for (let middleware of endpoint.middlewares || []) { // applies 'post' middlewares, if any
                        if (middleware.dest === 'post') {
                            //@ts-ignore
                            data = await MIDDLEWARES[middleware.identifier](data as any);
                        }
                    }

                    res.send(data); // sends the result to the user.
                }
            } catch (e) {
                if (e instanceof InternalAPIError) {
                    if (e.log)
                        PropellerLogger.error(e.log); // if there's any log message to write

                    res.status(e.status).send({ message: e.message });
                } else {
                    res.status(500).send({ message: e.toString() });
                }
            }
        }
    }


    /****************GETTERS****************/

    /** The method used by the endpoint (e.g. POST, GET) */
    public get method() {
        return this._method;
    }

    /** Function runned by this endpoint */
    public get function() {
        return this._function;
    }

    /** If the endpoint should be protected by JWT validation. By default it's true */
    public get auth() {
        return this._auth;
    }

    /** The scoped-permissions required to access an endpoint. */
    public get requiredPermissions() {
        return this._requiredPermissions;
    }

    /** Runtime validators used by the endpoint to validate its input and output */
    public get validators() {
        return this._validators;
    }

    /** Middlewares runned inside of the endpoint flow */
    public get middlewares() {
        return this._middlewares;
    }

    /** API Path used by this endpoint */
    public get path() {
        return this._path;
    }

    /**
     * The basic data that can be extrapolated by an API call and that's seeded into each endpoints
    */
    public get innerData(): InnerDataI<TAccount> {
        if (!this.auth) {
            PropellerLogger.error('Invalid use of innerData: it\'s impossible to use innerData in an endpoint without auth option turned on.');
            throw new InternalAPIError('Internal error.', 500);
        } else return this._innerData;
    }

    /****************SETTERS****************/
    public set method(method: EndpointMethods) {
        this._method = method;
    }

    public set function(fn: EndpointFunction<R, S, T>) {
        this._function = fn;
    }

    public set auth(auth: boolean) {
        this._auth = auth;
    }

    public set requiredPermissions(permissions: TPermission[]) {
        this._requiredPermissions = permissions;
    }

    private set validators(validators: IEndpointValidator[]) {
        this._validators = validators;
    }

    private set middlewares(middlewares: IEndpointMiddleware[]) {
        this._middlewares = middlewares;
    }

    public set path(path: string) {
        this._path = path;
    }
}
