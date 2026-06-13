import { Request, Response, Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import InternalAPIError from '../classes/InternalAPIError.js';
import * as table from 'table';
import Endpoint from '../classes/Endpoint.js';
import EndpointValidator from '../classes/EndpointValidator.js';
import PropellerLogger from '../services/propellerLogger.service.js';
import { schema } from '../validators/auth.validator.js';
import express from 'express';
import cors from 'cors';
import Environment from '../env.js';
import { configure, PropellerConfig, setDataSource } from '../config.js';
import morgan from 'morgan';
import { createDataSource } from '../database/data/data-source.js';
import { dbInit } from '../database/controllers/init.js';

const loggerOutput: string[][] = [];
const config = {
    border: {
        topBody: `─`,
        topJoin: `┬`,
        topLeft: `┌`,
        topRight: `┐`,

        bottomBody: `─`,
        bottomJoin: `┴`,
        bottomLeft: `└`,
        bottomRight: `┘`,

        bodyLeft: `│`,
        bodyRight: `│`,
        bodyJoin: `│`,

        joinBody: `─`,
        joinLeft: `├`,
        joinRight: `┤`,
        joinJoin: `┼`
    }
};

/**
 * Initializes all Propeller's features.
 * Returns a full configured express app that loads all the available and compatible
 * Propeller Endpoints in the given routes directory.
 * @param directoryPath 
 * @returns 
 */
export async function init(configuration?: PropellerConfig) {
    loggerOutput.push(
        ['PROPELLER ENDPOINT ROUTER', '', '', '', ''],
        ['\x1b[1m\x1b[31mMETHOD\x1b', '\x1b[1m\x1b[31mURL\x1b', '\x1b[1m\x1b[31mAUTH\x1b', '\x1b[1m\x1b[31mLOADED MIDDLEWARES\x1b', '\x1b[1m\x1b[31mLOADED VALIDATORS\x1b']
    );

    // ENVIRONMENT
    PropellerLogger.info('Initializing Propeller Env System...');
    Environment.getInstance(); // creates environment and populates it with environment variables in .env file
    configure(configuration); // loads account / permission resolver + permissions list

    // DATABASE (optional — only if entities were provided in config)
    if (configuration?.entities) {
        PropellerLogger.info('Initializing Propeller Database Manager...');
        const ds = createDataSource({
            entities: configuration.entities,
            ...(configuration.subscribers ? { subscribers: configuration.subscribers } : {}),
        });
        if (ds) {
            await dbInit(ds);
            setDataSource(ds);
        } else {
            PropellerLogger.error('Error while initializing database manager.');
        }
    }

    // ROUTING
    PropellerLogger.info('Initializing Propeller Routing System...');
    const app = await initRouting()

    // ENDPOINTS TABLE PRINT
    console.log(table.table(loggerOutput, config));
    
    return app;
}

async function initRouting() {
    const env = Environment.getInstance();

    const expressApp = express();
    const router = express.Router();

    expressApp.use(cors())
    expressApp.use(express.json({limit: env.config.maxAllowedJsonSize}));

    if (env.config.verbose) {
        expressApp.use(morgan("dev"));
    }

    if (env.config.allowUrlEncodedBodies) {
        expressApp.use(express.urlencoded({limit: env.config.maxAllowedJsonSize}));
    }

    const path = Environment.getInstance().config.routing.path;
    await handlePath(path, router);

    expressApp.use(router);
    expressApp.listen(env.server.port);
    return expressApp;
}

async function handlePath(directoryPath: string, router: Router) {
    // reads the directory
    const dir = fs.readdirSync(directoryPath);

    for (const file of dir) {
        // gets the full file path
        let filePath = path.join(directoryPath, file);

        // gets file infos
        const stat = fs.statSync(filePath);

        // if the file is a directory, recursively call the function into it
        if (stat.isDirectory()) {
            await handlePath(filePath, router);
        } else if (
            path.extname(file) === '.js' && !filePath.match(/(.)+\/router.ts/)
        ) { // else, import the class
            const fileUrl = pathToFileURL(path.resolve(filePath)).href;

            try {
                const module = await import(fileUrl);
                // gets the class from the module
                const className = Object.keys(module)[0];
                const Classe = module[className];

                // instanciates the class
                const instance = new Classe();

                let output = [];
                ({ router, output } = await initializeEndpoint(instance, router));
                loggerOutput.push(output);
            } catch (e) {
                PropellerLogger.error(`Error during routing process init at: ${filePath}: ${e.toString()}`);
            }

        }
    };
}

async function initializeEndpoint<T extends Endpoint>(endpoint: T, router: Router) {
    const env = Environment.getInstance();
    const baseUrl = env.config.routing.baseUrl;

    const functions = [];

    // AUTH INJECTION
    const secret = env.config.jwt.secret;
    const salt = env.config.jwt.salt;

    if (secret && salt && endpoint.auth) {
        const authValidator = new EndpointValidator(schema, 'endpoint-input', 'headers', 401);

        functions.push(await authValidator.generateFunction());
    }

    // ENDPOINT FUNCTION INJECTION
    functions.push(Endpoint.generate(endpoint));
    const middlewaresNumber = endpoint.middlewares.length;

    // VALIDATORS INJECTION
    let validatorsNumber = 0;
    for (let validator of endpoint.validators) {
        const Validator = new EndpointValidator(validator.schema, validator.dest, validator.target);
        const validatorFn = await Validator.generateFunction();

        if (Validator.dest === 'endpoint-output')
            functions.push(validatorFn);
        else if (Validator.dest === 'endpoint-input')
            functions.unshift(validatorFn);
        else
            throw new InternalAPIError('Invalid validator dest provided', 500);

        validatorsNumber++;
    }

    router[endpoint.method](baseUrl + endpoint.path, functions); // creates the endpoints with the provided endpoint object and path

    const output = [endpoint.method.toUpperCase(), baseUrl + endpoint.path, (endpoint.auth) ? 'YES' : 'NO', String(middlewaresNumber), String(validatorsNumber)];

    return { router, output };
}