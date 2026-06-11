import dotenv from 'dotenv';
import IEnv from "./interfaces/system/IEnv.js";

dotenv.config(); // config .env file

export default class Environment implements IEnv {
    public server: IEnv['server'];
    public config: IEnv['config'];
    public app: IEnv['app'];

    private static instance: Environment | null = null;

    private constructor() {
        this.server = {
            port: Number(process.env.SERVER_PORT),
            database: {
                type: String(process.env.DB_TYPE || 'mysql'),
                host: String(process.env.DB_HOST),
                name: String(process.env.DB_DATABASE),
                user: String(process.env.DB_USER),
                password: String(process.env.DB_PASSWORD),
                options: String(process.env.DB_OPTIONS),
                port: Number(process.env.DB_PORT),
                synchronize: this.sanitizeBooleanVar(process.env.DB_SYNCHRONIZE || false)
            }
        };

        this.config = {
            jwt: {
                secret: String(process.env.JWT_SECRET),
                salt: String(process.env.JWT_SALT),
                defaultTokenExpTime: Number(process.env.JWT_DEFAULT_TOKEN_EXP_TIME || (60 * 60 * 1000)),
            },
            routing: {
                path: String(process.env.ROUTING_PATH || './routes'),
                baseUrl: String(process.env.ROUTING_BASE_URL || '/api/v1'),
            },
            maxAllowedJsonSize: String(process.env.MAX_ALLOWED_JSON_SIZE || '5mb'),
            verbose: this.sanitizeBooleanVar(process.env.VERBOSE_MODE || false),
            allowUrlEncodedBodies: this.sanitizeBooleanVar(process.env.ALLOW_URL_ENCODED_BODIES || false),
        };

        this.app = {
            name: String(process.env.APP_NAME || 'Propeller'),
        };
    }

    public static getInstance(): Environment {
        if (Environment.instance === null) {
            Environment.instance = new Environment();
        }
        return Environment.instance;
    }

    private sanitizeBooleanVar(input: any) {
        if (!input) {
            return false;
        } else if (input === true) {
            return true;
        }

        if (input === 'true' || input === 'yes' || input === "1") {
            return true;
        }

        if (input === 'false' || input === 'no' || input === "0") {
            return false;
        }

        return !!input;
    }  
}
