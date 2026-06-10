export default interface IEnv {
    server: {
        port: number,
        database: {
            name: string,
            host: string,
            user: string,
            password: string,
            options: string,
            port: number,
        }
    },
    config: {
        jwt: {
            secret: string,
            salt: string
        },
        routing: {
            path: string
        }
    }
}