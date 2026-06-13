import { NextFunction, Request, Response } from "express";
import PropellerLogger from "../services/propellerLogger.service.js";
import IEndpoint, { EndpointMethods } from "../interfaces/endpoints-system/IEndpoint.js";
import IPropellerOutputContract from "../interfaces/endpoints-system/IPropellerOutputContract.js";
import IEndpointMiddleware from "../interfaces/endpoints-system/IEndpointMiddleware.js";
import IEndpointValidator from "../interfaces/endpoints-system/IEndpointValidator.js";
import { MIDDLEWARES } from "../middlewares/index.js";
import InternalAPIError from "./InternalAPIError.js";
import InnerDataI from "../interfaces/endpoints-system/InnerDataI.js";
import AuthService from "../services/auth.service.js";
import PermissionsService from "../services/permissions.service.js";
import { getConfig } from "../config.js";
import IPropellerInputContract from "../interfaces/endpoints-system/IPropellerInputContract.js";

export default abstract class Endpoint<
    TAccount = any,
    TPermission extends string = never,
    TInput extends IPropellerInputContract = IPropellerInputContract,
    TOutput extends IPropellerOutputContract = IPropellerOutputContract,
> implements IEndpoint {

    constructor(middlewares?: IEndpointMiddleware[]) {
        this.setValidators();
        this.setMiddlewares(middlewares || []);
    }

    abstract handler(): Promise<TOutput>;

    private _method: EndpointMethods;
    private _auth: boolean = true;
    private _requiredPermissions: TPermission[] = [];
    private _validators: IEndpointValidator[] = [];
    private _path: string;
    private _middlewares: IEndpointMiddleware[] = [];
    private _innerData: InnerDataI<TAccount> = {
        account: null,
        auth: {
            token: null,
            data: null,
            metadata: null,
        },
        request: {
            ip: null
        }
    };
    private _request: Request<TInput['params'], any, TInput['body'], TInput['headers']>;
    private _params: TInput['params'];
    private _query: TInput['query'];
    private _body: TInput['body'];
    private _headers: TInput['headers'];

    /**This function sets the validators of the endpoint. */
    abstract setValidators(): void;

    /** This function takes an array of Endpoint Middlewares info and then is used to initialize the endpoint with its middlewares */
    private setMiddlewares(middlewares: IEndpointMiddleware[]): void {
        this.middlewares.push(...middlewares);
    };

    /** This function generates an endpoint flow. It's called inside of the router, and takes an endpoint as argument.
     * This is done to circumvent the limitation about the subclasses that implements this endpoint.
     */
    static generate<
        TPermission extends string = string, 
        TAccount = any, 
        TInput extends IPropellerInputContract = IPropellerInputContract,
        TOutput extends IPropellerOutputContract = IPropellerOutputContract
    >(
        endpoint: Endpoint<TAccount, TPermission, TInput, TOutput>
    ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
        return async (req: Request, res: Response, next: NextFunction) => {
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
                    // user permissions check via the user-provided resolver (only when auth is active and account is populated)
                    const givenPermissions = 
                        (endpoint.auth && endpoint._innerData.account && config.permissionsResolver)
                            ? config.permissionsResolver(endpoint._innerData.account)
                            : [];

                    if (!PermissionsService.validate(givenPermissions, endpoint?.requiredPermissions || []))
                        throw new InternalAPIError('Not authorized to perform this action.', 403);

                    endpoint._request = req;
                    endpoint._params = req.params;
                    endpoint._headers = req.headers;
                    endpoint._body = req.body;
                    endpoint._query = req.query;

                    let data: TOutput = null; // final result of endpoint's call.

                    for (let middleware of endpoint.middlewares || []) { // applies 'pre' middlewares, if any
                        if (middleware.dest === 'pre') {
                            data = await MIDDLEWARES[middleware.identifier](req); // todo: the typing is lost here because of the definition of the MIDDLEWARES array. Find a solution
                        }
                    }

                    // TODO: Add somesort of runtime validation here

                    data = await endpoint.handler(); // applies main function

                    // TODO: Add somesort of runtime validation here

                    for (let middleware of endpoint.middlewares || []) { // applies 'post' middlewares, if any
                        if (middleware.dest === 'post') {
                            data = await MIDDLEWARES[middleware.identifier](data as any);
                        }
                    }

                    res.send(data.body).header(data.headers); // sends the result to the user.
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

    public get originalRequest() {
        return this._request;
    }

    public get query() {
        return this._query;
    }

    public get params() {
        return this._params;
    }

    public get body() {
        return this._body;
    }

    public get headers() {
        return this._headers;
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

    public set auth(auth: boolean) {
        this._auth = auth;
    }

    public set requiredPermissions(permissions: TPermission[]) {
        this._requiredPermissions = permissions;
    }

    public set validators(validators: IEndpointValidator[]) {
        this._validators = validators;
    }

    public set middlewares(middlewares: IEndpointMiddleware[]) {
        this._middlewares = middlewares;
    }

    public set path(path: string) {
        this._path = path;
    }
}
