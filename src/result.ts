export interface IResult<T, E> {
    is_ok(): this is Ok<T, E>;
    is_err(): this is Err<T, E>;
    map<T2>(mapper: (value: T) => T2): Result<T2, E>;
    map_err<E2>(mapper: (error: E) => E2): Result<T, E2>;
    and_then<U>(mapper: (value: T) => Result<U, E>): Result<U, E>;
    or_else<F>(mapper: (error: E) => Result<T, F>): Result<T, F>
    unwrap_or(value: T): T;
    unwrap_or_else(mapper: (error: E) => T): T;
    unwrap(): T;
    unwrap_err(): E;
    expect(message: string): T;
    iter(): Iterable<T>;
    toString(): string;
}

export class Ok<T, E> implements IResult<T, E> {
    static new<T, E>(value: T): Ok<T, E> {
        return new Ok<T, E>(value);
    }
    constructor(protected value: T) { }

    is_ok(): this is Ok<T, E> {
        return true;
    }
    is_err(): this is Err<T, E> {
        return false;
    }
    map<T2>(mapper: (value: T) => T2): Result<T2, E> {
        return new Ok<T2, E>(mapper(this.value));
    }
    map_err<E2>(mapper: (error: E) => E2): Result<T, E2> {
        return self as any;
    }
    and_then<U>(mapper: (value: T) => Result<U, E>): Result<U, E> {
        return mapper(this.value);
    }
    or_else<F>(mapper: (error: E) => Result<T, F>): Result<T, F> {
        return this as any;
    }
    unwrap_or(value: T): T {
        return this.value;
    }
    unwrap_or_else(mapper: (error: E) => T): T {
        return this.value;
    }
    unwrap(): T {
        return this.value;
    }
    unwrap_err(): E {
        throw new TypeError(`unwrap_err called on Ok result variant`);
    }
    expect(message: string): T {
        return this.value;
    }
    iter(): Iterable<T> {
        let called = false;
        const value = this.value;
        return {
            [Symbol.iterator](): Iterator<T> {
                return {
                    next(value?: any): IteratorResult<T> {
                        return called
                            ? { value: undefined as any as T, done: true }
                            : (called = true, { value, done: false });
                    }
                }
            }
        };
    }
    toString() {
        return `Ok { ${this.value} }`;
    }
}

export class Err<T, E> implements IResult<T, E> {
    static new<T, E>(error: E): Err<T, E> {
        return new Err<T, E>(error);
    }

    constructor(private error: E) { }

    is_ok(): this is Ok<T, E> {
        return false;
    }
    is_err(): this is Err<T, E> {
        return true;
    }
    map<T2>(mapper: (value: T) => T2): Result<T2, E> {
        return this as any;
    }
    map_err<E2>(mapper: (error: E) => E2): Result<T, E2> {
        return new Err<T, E2>(mapper(this.error));
    }
    and_then<U>(mapper: (value: T) => Result<U, E>): Result<U, E> {
        return this as any;
    }
    or_else<F>(mapper: (error: E) => Result<T, F>): Result<T, F> {
        return mapper(this.error);
    }
    unwrap_or(value: T): T {
        return value;
    }
    unwrap_or_else(mapper: (error: E) => T): T {
        return mapper(this.error);
    }
    unwrap(): T {
        throw new TypeError(`unwrap called on Err result variant`);
    }
    unwrap_err(): E {
        return this.error;
    }
    expect(message: string): T {
        throw new TypeError(message);
    }
    iter(): Iterable<T> {
        return {
            [Symbol.iterator](): Iterator<T> {
                return {
                    next(value?: any): IteratorResult<T> {
                        return { value: undefined as any as T, done: true };
                    }
                }
            }
        };
    }
    toString() {
        return `Err { ${this.error} }`;
    }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;
