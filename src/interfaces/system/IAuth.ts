export default interface IJWT {
    token: string;
    data: JWTData;
    metadata: IJWTMetadata;
}

export interface IJWTMetadata {
    expiresAt: number;
}

export interface JWTData {
    userId: number;
}
