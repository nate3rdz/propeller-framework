export interface PropellerConfig<TAccount = any, TPermission extends string = string> {
    permissions?: readonly TPermission[];
    accountResolver?: (userId: number) => Promise<TAccount | null>;
    permissionsResolver?: (account: TAccount) => TPermission[];
    baseUrl?: string;
    appName?: string;
}

let _config: PropellerConfig<any, string> = {
    baseUrl: '/api/v1',
    appName: 'Propeller',
};

export function configure<TAccount = any, TPermission extends string = string>(
    config: PropellerConfig<TAccount, TPermission>
): PropellerConfig<TAccount, TPermission> {
    _config = config as PropellerConfig<any, string>;
    return config;
}

export function getConfig(): PropellerConfig<any, string> {
    return _config;
}
