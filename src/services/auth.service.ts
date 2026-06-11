import jwt from 'jsonwebtoken';
import IJWT, { JWTData } from "../interfaces/system/IAuth.js";
import Environment from "../env.js";

import { compareSync } from 'bcrypt';

export default class AuthService {
    constructor() {
    }

    /**
     * Authenticates a user by comparing the given password against the stored hash.
     * The account object must expose `id` and `Password` fields.
     */
    static async authenticate<T extends { id: number | string, Password: string }>(
        user: T,
        password: string
    ): Promise<{ token: string, success: boolean }> {
        const compare = compareSync(password, user.Password);
        if (compare) {
            const jwt = this.generate({ userId: Number(user.id) });
            return { token: jwt, success: true };
        } else return { token: "Unauthorized.", success: false };
    }

    /**
     * This function generates a JWT with given data
     * @param {JWTData} data
     * @returns {IJWT}
     */
    static generate(data: JWTData): string {
        const environment = Environment.getInstance();

        try {
            const token = jwt.sign({
                ...data,
                metadata: {
                    expiresAt: new Date().getTime() + environment.config.jwt.defaultTokenExpTime,
                }
            }, Environment.getInstance().config.jwt.secret); // signs the jwt
            return token;
        } catch (e) {
            console.error(e.toString());
        }
    }

    /**
     * This functions decodes the JWT payload, gives it a type and then returns it plus the token
     * @param token
     */
    static getDataByToken(token: string): IJWT {
        try {
            if (!token) throw new Error('Invalid token provided');

            if (token.match(/^(Bearer) ([a-zA-Z0-9\-_.]+)$/g))
                token = token.split(' ')[1];

            // validates and then decodes the token
            if (!AuthService.validate(token)) return null;

            const tok = jwt.decode(token);
            if (!tok || typeof tok === 'string') return null;

            const { metadata, ...data } = tok as JWTData & IJWT;

            return {
                token,
                data,
                metadata,
            };
        } catch (e) {
            console.error(e.toString());
        }
    }

    /**
     * This functions checks the validity of a given JWT token
     * @param token
     */
    static validate(token: string): boolean {
        if (token.match(/^(Bearer) ([a-zA-Z0-9\-_.]+)$/g))
            token = token.split(' ')[1];

        try {
            jwt.verify(token, Environment.getInstance().config.jwt.secret);
            return true;
        } catch (e) {
            return false;
        }
    }

}
