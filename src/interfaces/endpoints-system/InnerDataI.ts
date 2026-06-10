import IJWT from "../system/IAuth.js";

export default interface InnerDataI<TAccount = any> {
    account: TAccount;
    auth: IJWT;
    request: {
        ip: string;
    }
}
