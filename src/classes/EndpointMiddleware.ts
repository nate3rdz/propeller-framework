// lets define only useful data for the input of each middleware (the request)
interface EntryRequest {
    body: {

    },
    headers: {

    },
    query: {

    },
    params: {

    }
}

// lets define only useful data for the output of each middleware (the modified request)
interface ExitRequest {
    body: {

    },
    headers: {

    },
    query: {

    },
    params: {

    }
}

export abstract class EndpointMiddleware<R extends EntryRequest, T extends ExitRequest> {
    private _function: (req: R) => Promise<T>;
    static middlewareName: string = this.constructor.name;

    public get function() {
        return this._function;
    }

    public set function(fn: (req: R) => Promise<T>) {
        this._function = fn;
    }
}