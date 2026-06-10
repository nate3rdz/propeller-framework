import { Request, Response, Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import InternalAPIError from '../classes/InternalAPIError.js';
import * as table from 'table';
import Endpoint from '../classes/Endpoint.js';
import EndpointValidator from '../classes/EndpointValidator.js';
import PropellerLogger from '../services/propellerLogger.service.js';
import { schema } from '../validators/auth.validator.js';
import { getConfig } from '../config.js';

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

export async function initRouting(directoryPath: string, router: Router) {
    loggerOutput.push(
        ['PROPELLER ENDPOINT ROUTER', '', '', '', ''],
        ['\x1b[1m\x1b[31mMETHOD\x1b', '\x1b[1m\x1b[31mURL\x1b', '\x1b[1m\x1b[31mAUTH\x1b', '\x1b[1m\x1b[31mLOADED MIDDLEWARES\x1b', '\x1b[1m\x1b[31mLOADED VALIDATORS\x1b']
    );

    PropellerLogger.info('Initializing Propeller Routing System...');
    await handlePath(directoryPath, router);

    console.log(table.table(loggerOutput, config));
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
        } else if ((path.extname(file) === '.js' || path.extname(file) === '.ts') && !filePath.match(/(.)+\/router.ts/)) { // else, import the class
            filePath = filePath.replace('src/routes/', './');
            filePath = filePath.replace('.ts', '.js');

            try {
                const module = await import(filePath);
                // gets the class from the module
                const className = Object.keys(module)[0];
                const Classe = module[className];

                // instanciates the class
                const instance = new Classe();

                let output = [];
                ({ router, output } = await initializeEndpoint(instance, router));
                loggerOutput.push(output);
            } catch (e) {
                console.error(`Error during routing process init at: ${filePath}: ${e.toString()}`);
            }

        }
    };
}

async function initializeEndpoint<R extends Request, S extends Response, G, T extends Endpoint<R, S, G>>(endpoint: T, router: Router) {
    const baseUrl = getConfig().baseUrl ?? '/api/v1'

    const functions = [];

    // AUTH INJECTION
    if (endpoint.auth) {
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