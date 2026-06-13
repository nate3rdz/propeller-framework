import { Endpoint } from 'propeller-framework';
import type { Request, Response } from 'express';

// Generics: <RequestType, ResponseType, ReturnType, AccountType, PermissionsType>
export class GetProfileEndpoint extends Endpoint<Request, Response, { name: string }, {id: number; name: string}, 'viewer'> {

  constructor() {
    super();
    this.path = '/user/profile';
    this.method = 'get';
    this.auth = true;
    this.requiredPermissions = ['viewer'];

    this.setValidators();
  }

  public setValidators() {}

  public async handler(req: Request, res: Response) {
    return this.innerData.account;
  }
}
