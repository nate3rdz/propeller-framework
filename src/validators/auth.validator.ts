import AuthService from '../services/auth.service.js';
import z from 'zod';

export const schema = z.object({
    authorization: z.string()
}).refine(body => {
    return AuthService.validate(body.authorization);
});

