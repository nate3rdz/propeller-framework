import dotenv from 'dotenv';
import IEnv from "./interfaces/system/IEnv.js";

dotenv.config(); // config .env file

export default class Environment implements IEnv {
    public server: {
        port: number,
        database: {
            name: string,
            host: string,
            user: string,
            password: string,
            options: string,
            port: number,
        }
    }
    public config: {
        jwt: {
            secret: string,
            salt: string
        },
        routing: {
            path: string
        }
    }
    public app: {
        name: string
    }
    private static instance: Environment | null = null;

    private constructor() {
        this.server = {
            port: Number(String(process.env.SERVER_PORT)),
            database: {
                host: String(process.env.DB_HOST),
                name: String(process.env.DB_DATABASE),
                user: String(process.env.DB_USER),
                password: String(process.env.DB_PASSWORD),
                options: String(process.env.DB_OPTIONS),
                port: Number(process.env.DB_PORT)
            }
        };

        this.config = {
            jwt: {
                secret: String(process.env.JWT_SECRET),
                salt: String(process.env.JWT_SALT)
            },
            routing: {
                path: String(process.env.ROUTING_PATH)
            }
        };

        this.app = {
            name: String(process.env.APP_NAME)
        };
    }

    public static getInstance(): Environment {
        if (Environment.instance === null) {
            Environment.instance = new Environment();
        }
        return Environment.instance;
    }
}