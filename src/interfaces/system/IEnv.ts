export default interface IEnv {
    server: {
        port: number,
        database: {
            type: string,
            name: string,
            host: string,
            user: string,
            password: string,
            options: string,
            port: number,
            synchronize: boolean,
        }
    },
    config: {
        jwt: {
            secret: string,
            salt: string,
            defaultTokenExpTime: number,
        },
        routing: {
            path: string,
            baseUrl: string,
        },
        maxAllowedJsonSize: string,
        allowUrlEncodedBodies: boolean,
        verbose: boolean,
    },
    app: {
        name: string
    }
}
