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
        throw new Error(e.toString());
    });
}
