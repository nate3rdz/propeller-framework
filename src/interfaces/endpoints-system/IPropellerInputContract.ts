export default interface IPropellerInputContract {
    params?: {[x: string]: any},
    query?: {[x: string]: any},
    body?: {[x: string]: any},
    headers?: {[x: string]: any},
}