import { Endpoint } from '../../../dist/index.js';

// Reads request data before and after an await, like a handler doing a DB query.
export class WhoAmIEndpoint extends Endpoint {
    setValidators() {
        this.path = '/whoami';
        this.method = 'post';
        this.auth = true;
    }

    async handler() {
        const noteBefore = this.body.note;
        await new Promise(r => setTimeout(r, 100));
        return {
            body: {
                noteBefore,
                noteAfter: this.body.note,
                account: this.innerData.account.name,
                tokenUserId: this.innerData.auth.data.userId,
            },
            headers: {},
        };
    }
}
