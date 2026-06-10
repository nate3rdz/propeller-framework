export default class InternalAPIError extends Error {
    /** The custom status that will be showed to the user */
    public status;

    /** The public message that will be sent to the user */
    public message;

    /** The message that will be written in Propeller's log */
    public log;

    constructor(message: string, status: number, log?: string) {
        super(message);

        this.message = message;
        this.status = status;
        this.log = log;
    }
}