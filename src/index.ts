export class Source {
    constructor(private input: string, public pos: number) { }
    next() {
        const ch = this.input.charAt(this.pos++);
        if (ch === "") {
            this.pos--;
        }
        return ch;
    }
}

export class ParseResultOk<T> {
    success: true = true;
    constructor(public value: T) { }
}

export class ParseResultFail {
    success: false = false;
    constructor(public source: Source, public reason?: string) { }
}

export type ParseResult<T> = ParseResultOk<T> | ParseResultFail;

export abstract class Parser<T> {
    /**
     * method used for advancing the parser
     */
    abstract parse(source: Source): ParseResult<T>;
    /**
     * matches "this" or "other", both must produce value of the same type
     */
    or(other: Parser<T>): Parser<T> {
        return new Or<T>(this, other);
    }
    /**
     * "this" followed by "next", both matched values are returned in a tuple
     */
    then<U>(next: Parser<U>): Parser<[T, U]> {
        return new Then<T, U>(this, next);
    }
    /**
     * zero or more occurrences of "this"
     */
    many(): Parser<T[]> {
        return new Many<T>(this);
    }
    /**
     * at leat one occurrence of "this"
     */
    many1(): Parser<T[]> {
        return new Many1<T>(this);
    }
    /**
     * if "this" succeeds, map the produced value through "mapper" function
     */
    map<U>(mapper: (value: T) => U): Parser<U> {
        return new Map<T, U>(this, mapper);
    }
    /**
     * if "this" fails, changes the error message to: `expecting "${what}"`
     */
    expect(what: string): Parser<T> {
        return new Expect<T>(this, what);
    }
    /**
     * matches "this" zero or more times until "until" is matched, "until" does not consume any input
     * Note: "until" is being tested *before* "this", so `any().until(char("\n"))` will match anything until newline
     */
    until<U>(until: Parser<U>): Parser<T[]> {
        return new Until<T, U>(this, until);
    }
    /**
     * matches "this" zero or more times until "until" is matched, "until" is consumed and ignored
     * Note: "until" is being tested *before* "this", so `any().untilFollowedBy(char("\n"))` will match anything until newline
     */
    untilFollowedBy<U>(until: Parser<U>): Parser<T[]> {
        return new UntilFollowedBy<T, U>(this, until);
    }
    /**
     * discards "next"
     */
    followedBy<U>(next: Parser<U>): Parser<T> {
        return new FollowedBy<T, U>(this, next);
    }
    /**
     * discards "this"
     */
    next<U>(next: Parser<U>): Parser<U> {
        return new Next<T, U>(this, next);
    }
    /**
     * only applicable to Parser<string[]>
     */
    join(this: Parser<string[]>, separator: string = ""): Parser<string> {
        return new Join(this, separator);
    }
}



/**
 * matches any input character and produces it, fails on EOF
 */
export function any(): Parser<string> {
    return new CustomParser((source) => {
        const next = source.next();
        if (next !== "") {
            return new ParseResultOk(next);
        }
        return new ParseResultFail(source, `expected any character, got EOF`);
    });
}

/**
 * matches only specific character and produces it
 */
export function char(char: string): Parser<string> {
    if (char.length !== 1) {
        throw new TypeError("char is supposed to be 1 character");
    }
    return new CustomParser((source) => {
        const next = source.next();
        if (next === char) {
            return new ParseResultOk(next);
        }
        return new ParseResultFail(source, `expecting "${char}"`);
    });
}

/**
 * matches any of characters found in the input string and produces it
 */
export function oneOf(chars: string): Parser<string> {
    const char_array = chars.split("");
    return new CustomParser((source: Source) => {
        const next = source.next();
        if (char_array.includes(next)) {
            return new ParseResultOk(next);
        }
        return new ParseResultFail(source, `one of "${chars}"`);
    });
}

/**
 * matches end of input
 */
export function eof(): Parser<undefined> {
    return new CustomParser((source: Source) => {
        const next = source.next();
        return (next === "")
            ? new ParseResultOk(undefined)
            : new ParseResultFail(source, `expected "EOF", got "${next}"`);
    });
}
/**
 * matches the specified string
 */
export function string(str: string): Parser<string> {
    return new CustomParser((source: Source) => {
        const matched = [];
        for (const ch of str) {
            const next = source.next();
            matched.push(next);
            if (ch !== next) {
                return new ParseResultFail(source, `expecting "${str}", got "${matched.join("")}"`);
            }
        }
        return new ParseResultOk(str);
    });
}

class CustomParser<T> extends Parser<T> {
    constructor(private _: (source: Source) => ParseResult<T>) {
        super()
    }
    parse(source: Source): ParseResult<T> {
        return this._(source);
    }
}

class Or<T> extends Parser<T> {
    constructor(private first: Parser<T>, private second: Parser<T>) {
        super();
    }
    parse(source: Source): ParseResult<T> {
        const pos = source.pos;
        const first_result = this.first.parse(source);
        if (first_result.success) {
            return first_result;
        }
        source.pos = pos;
        return this.second.parse(source);
    }
}

class Then<T, U> extends Parser<[T, U]> {
    constructor(private first: Parser<T>, private second: Parser<U>) {
        super();
    }
    parse(source: Source): ParseResult<[T, U]> {
        const first_result = this.first.parse(source);
        if (!first_result.success) {
            return first_result as ParseResultFail;
        }
        const second_result = this.second.parse(source);
        if (!second_result.success) {
            return second_result as ParseResultFail;
        }
        return new ParseResultOk<[T, U]>([first_result.value, second_result.value]);
    }
}

class Next<T, U> extends Parser<U> {
    constructor(private first: Parser<T>, private second: Parser<U>) {
        super();
    }
    parse(source: Source): ParseResult<U> {
        const first_result = this.first.parse(source);
        if (!first_result.success) {
            return first_result as ParseResultFail;
        }
        return this.second.parse(source);
    }
}

class Many<T> extends Parser<T[]> {
    constructor(private parser: Parser<T>) {
        super();
    }
    parse(source: Source): ParseResult<T[]> {
        const ret = [];
        for (; ;) {
            const pos = source.pos;
            const res = this.parser.parse(source);
            if (!res.success) {
                source.pos = pos;
                return new ParseResultOk(ret);
            } else {
                ret.push(res.value);
            }
        }
    }
}

class Many1<T> extends Parser<T[]> {
    constructor(private parser: Parser<T>) {
        super();
    }
    parse(source: Source): ParseResult<T[]> {
        const res = this.parser.parse(source);
        if (!res.success) {
            return res as ParseResultFail;
        }
        const ret = [res.value];
        for (; ;) {
            const pos = source.pos;
            const res = this.parser.parse(source);
            if (!res.success) {
                source.pos = pos;
                return new ParseResultOk(ret);
            } else {
                ret.push(res.value);
            }
        }
    }
}

class Map<T, U> extends Parser<U> {
    constructor(private from: Parser<T>, private mapper: (value: T) => U) {
        super();
    }
    parse(source: Source): ParseResult<U> {
        const result = this.from.parse(source);
        if (!result.success) {
            return result as ParseResultFail;
        }
        const mapped_value = this.mapper(result.value);
        return new ParseResultOk(mapped_value);
    }
}

class Expect<T> extends Parser<T> {
    constructor(private parser: Parser<T>, private what: string) {
        super();
    }
    parse(source: Source): ParseResult<T> {
        const result = this.parser.parse(source);
        if (result.success) {
            return result;
        }
        return new ParseResultFail(source, `expecting ${this.what}`);
    }
}

class Until<T, U> extends Parser<T[]> {
    constructor(private _repeat: Parser<T>, private _until: Parser<U>) {
        super();
    }
    parse(source: Source): ParseResult<T[]> {
        const results: T[] = [];
        for (; ;) {
            const pos = source.pos;
            const until_res = this._until.parse(source);
            if (until_res.success) {
                source.pos = pos;
                return new ParseResultOk(results);
            }
            source.pos = pos;
            const res = this._repeat.parse(source);
            if (res.success) {
                results.push(res.value);
            } else {
                return res as ParseResultFail;
            }
        }
    }
}
class UntilFollowedBy<T, U> extends Parser<T[]> {
    constructor(private _repeat: Parser<T>, private _until: Parser<U>) {
        super();
    }
    parse(source: Source): ParseResult<T[]> {
        const results: T[] = [];
        for (; ;) {
            const pos = source.pos;
            const until_res = this._until.parse(source);
            if (until_res.success) {
                return new ParseResultOk(results);
            }
            source.pos = pos;
            const res = this._repeat.parse(source);
            if (res.success) {
                results.push(res.value);
            } else {
                return res as ParseResultFail;
            }
        }
    }
}

class FollowedBy<T, U> extends Parser<T> {
    constructor(private _first: Parser<T>, private _next: Parser<U>) {
        super();
    }
    parse(source: Source): ParseResult<T> {
        const first_res = this._first.parse(source);
        if (!first_res.success) {
            return first_res;
        }
        const second_res = this._next.parse(source);
        if (!second_res.success) {
            return second_res as ParseResultFail;
        }
        return first_res;
    }
}

class Join extends Parser<string> {
    constructor(private _parser: Parser<string[]>, private _separator: string) {
        super();
    }
    parse(source: Source): ParseResult<string> {
        const result = this._parser.parse(source);
        if (result.success) {
            return new ParseResultOk(result.value.join(this._separator));
        }
        return result as ParseResultFail;
    }
}

export namespace grammar {
    /**
     * matches a decimal digit
     */
    export function digit(): Parser<string> {
        return oneOf("0123456789").expect("digit");
    }
}