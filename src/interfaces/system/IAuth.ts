export default interface IJWT {
    token: string;
    data: JWTData;
}

export interface JWTData {
    userId: number;
}
