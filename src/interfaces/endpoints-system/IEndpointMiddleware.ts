export default interface IEndpointMiddleware {
    identifier: string;
    dest: 'pre' | 'post';
}
