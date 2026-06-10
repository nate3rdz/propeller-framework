import { DataSource, DataSourceOptions } from "typeorm";
import Environment from '../../env.js';

/**
 * Creates a TypeORM DataSource pre-configured from environment variables.
 * Pass your entities, subscribers and migrations — everything else is read from .env.
 * You can override any option by spreading additional properties.
 */
export function createDataSource(options: Partial<DataSourceOptions> & Pick<DataSourceOptions, 'entities'>): DataSource {
    const env = Environment.getInstance();

    return new DataSource({
        type: "mysql",
        host: env.server.database.host,
        port: env.server.database.port,
        username: env.server.database.user,
        password: env.server.database.password,
        database: env.server.database.name,
        synchronize: true,
        logging: false,
        migrations: [],
        subscribers: [],
        ...options,
    } as DataSourceOptions);
}
