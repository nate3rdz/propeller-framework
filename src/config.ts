import type { DataSource, DataSourceOptions } from 'typeorm';

export interface PropellerConfig<TAccount = any, TPermission extends string = string> {
    permissions?: readonly TPermission[];
    accountResolver?: (userId: number) => Promise<TAccount | null>;
    permissionsResolver?: (account: TAccount) => TPermission[];
    entities?: DataSourceOptions['entities'];
    subscribers?: DataSourceOptions['subscribers'];
}

let _config: PropellerConfig<any, string> = {};
let _dataSource: DataSource | null = null;

export function configure<TAccount = any, TPermission extends string = string>(
    config: PropellerConfig<TAccount, TPermission>
): PropellerConfig<TAccount, TPermission> {
    _config = config as PropellerConfig<any, string>;
    return config;
}

export function getConfig(): PropellerConfig<any, string> {
    return _config;
}

export function setDataSource(ds: DataSource): void {
    _dataSource = ds;
}

export function getDataSource(): DataSource | null {
    return _dataSource;
}
