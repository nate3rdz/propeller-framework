import { DataSource, DataSourceOptions } from "typeorm";
import Environment from '../../env.js';
import PropellerLogger from "../../services/propellerLogger.service.js";

const EMBEDDED_DRIVERS = ['sqlite', 'better-sqlite3', 'sqljs', 'capacitor'];

export function createDataSource(options: Partial<DataSourceOptions> & Pick<DataSourceOptions, 'entities'>): DataSource {
    const env = Environment.getInstance();
    const dbType = env.server.database.type;
    const isEmbedded = EMBEDDED_DRIVERS.includes(dbType);

    // Embedded drivers (SQLite etc.) only need a database path, not host/user/password
    if (!isEmbedded) {
        const missing = (['host', 'port', 'user', 'password', 'name'] as const)
            .filter(key => !env.server.database[key]);
        if (missing.length > 0) {
            PropellerLogger.error(`Database configuration data missing (${missing.join(', ')}); database connection will be skipped. Make sure your .env file is loaded before calling createDataSource().`);
            return null;
        }
    }

    const baseConfig: Partial<DataSourceOptions> = isEmbedded
        ? {
            type: dbType as any,
            database: env.server.database.name,
            synchronize: env.server.database.synchronize,
            logging: false,
            migrations: [],
            subscribers: [],
        }
        : {
            type: dbType as any,
            host: env.server.database.host,
            port: env.server.database.port,
            username: env.server.database.user,
            password: env.server.database.password,
            database: env.server.database.name,
            synchronize: env.server.database.synchronize,
            logging: false,
            migrations: [],
            subscribers: [],
        };

    return new DataSource({ ...baseConfig, ...options } as DataSourceOptions);
}
