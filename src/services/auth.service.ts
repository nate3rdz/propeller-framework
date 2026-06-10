import jwt from 'jsonwebtoken';
import IJWT, { JWTData } from "../interfaces/system/IAuth.js";

import { compareSync } from 'bcrypt';
import Environment from "../env.js";

const environment = Environment.getInstance();

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
            return { token: jwt.token, success: true };
        } else return { token: "Unauthorized.", success: false };
    }

    /**
     * This function generates a JWT with given data
     * @param {JWTData} data
     * @returns {IJWT}
     */
    static generate(data: JWTData): IJWT {
        try {
            const token = jwt.sign(data, environment.config.jwt.secret); // signs the jwt
            return { token, data }; // returns the JWT
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

            const tok = jwt.decode(token);
            if (typeof (tok) === 'string') return null;

            return {
                token,
                data: { ...tok as JWTData }
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

        jwt.verify(token, environment.config.jwt.secret, (err, _decoded) => {
            if (err)
                return false;
        });
        return true;
    }

}
