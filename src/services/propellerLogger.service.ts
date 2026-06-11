import Environment from "../env.js";

export default class PropellerLogger {
    constructor() {

    }

    static logData() {
        const date = new Date();
        const time = `[${date.getUTCHours()}:${date.getUTCMinutes()}:${date.getUTCSeconds()}:${date.getUTCMilliseconds()}]`;
        const appName = `[${Environment.getInstance().app.name}]`;

        return time+appName;
    }

    static debug(message: string | Object) {
        console.log(`${this.logData()}[DEBUG] ${(typeof message === 'object') ? JSON.stringify(message) : message}`);
    }

    static info(message: string | Object) {
        console.log(`${this.logData()}[INFO] ${(typeof message === 'object') ? JSON.stringify(message) : message}`);
    }

    static error(message: string | Object) {
        console.log(`${this.logData()}[ERROR] ${(typeof message === 'object') ? JSON.stringify(message) : message}`);
    }
}
