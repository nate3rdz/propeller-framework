import PropellerLogger from "../../services/propellerLogger.service.js";
import { DataSource } from "typeorm";

/**
 * Initializes the given DataSource and logs the result.
 * Call this at startup after creating your DataSource with createDataSource().
 */
export async function dbInit(dataSource: DataSource): Promise<void> {
    await dataSource.initialize().then(() => {
        PropellerLogger.info('Successfully connected to DB');
    }).catch(e => {
        PropellerLogger.error(`Error while connecting to DB (${e.toString()}), retrying in 3s...`);

        const now = new Date().getTime();
        while ((new Date().getTime()) < now+3) {
        }

        dbInit(dataSource);
    });
}
