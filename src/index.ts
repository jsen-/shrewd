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

function is_skip(parser: Parser<any> | Skip): parser is Skip {
    // TODO: is this boolean thing faster then instanceof?
    // return parser instanceof Skip;
    return (parser as any)._skip === true;
}


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
    // TODO: I'm not convinced about this "Skip + method overload" shananigans
    then<U>(this: Skip, next: Skip): Skip;
    then<U>(this: Skip, next: Parser<U>): Parser<U>;
    then<U>(this: Parser<T>, next: Skip): Parser<T>;
    then<U>(this: Parser<T>, next: Parser<U>): Parser<[T, U]>;

    then<U>(this: Parser<T> | Skip, next: Parser<U> | Skip): Parser<[T, U] | T | U> | Skip {
        const self = this;
        if (is_skip(next)) {
            if (is_skip(self)) {
                const x = self;
                const y = next;
                // when this._skip is set => T shall already be undefined
                return seq(self, next);
            }
            return new FollowedBy<T>(self, next);
        } else if (is_skip(self)) {
            return new Next<U>(self, next as Parser<U>);
        }
        return new Then<T, U>(self, next as Parser<U>);
    }
    /**
     * zero or more occurrences of "this"
     */
    many(this: Skip): Skip;
    many(this: Parser<T>): Parser<T[]>;
    many(): Parser<T[]> | Skip {
        if (is_skip(this)) {
            return new SkipMany(this);
        }
        return new Many<T>(this);
    }
    /**
     * at leat one occurrence of "this"
     */
    many1(this: Skip): Skip;
    many1(this: Parser<T>): Parser<T[]>;
    many1(this: Parser<T> | Skip): Parser<T[]> | Skip {
        const self = this;
        if (is_skip(self)) {
            return self.then(self.many()) as Skip;
        }
        return self.then(self.many()).map(([head, tail]) => {
            tail.unshift(head);
            return tail;
        });
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
    until<U>(this: Skip, until: Skip): Skip;
    until<U>(this: Skip, until: Parser<U>): Parser<U>;
    until<U>(this: Parser<T>, until: Skip): Parser<T[]>;
    until<U>(this: Parser<T>, until: Parser<U>): Parser<[T[], U]>;

    until<U>(this: Parser<T> | Skip, until: Parser<U> | Skip): Parser<[T[], U] | T[] | U> | Skip {
        // I'm leaving this here as a curiosity, the following commented code compiles without warnings
        // const self = this;
        // if(is_skip(self)) {
        //     if(is_skip(until)) {
        //         return until.not().next(self).many().then(until);
        //     }
        //     return until.not().next(self).many().then(until);
        // } else if(is_skip(until)) {
        //     return until.not().next(self).many().then(until);
        // } else {
        //     return until.not().next(self).many().then(until);
        // }
        return until.not().next(this).many().then(until) as any;
    }
    /**
     * discards "next"
     */
    followedBy<U>(next: Parser<U>): Parser<T> {
        return new FollowedBy<T>(this, next);
    }
    /**
     * discards "this"
     */
    next<U>(next: Skip): Skip;
    next<U>(next: Parser<U>): Parser<U>;

    next<U>(next: Parser<U> | Skip): Parser<U> | Skip {
        if (is_skip(next)) {
            return seq(this.skip(), next);
        }
        return new Next<U>(this, next);
    }
    /**
     * only applicable to Parser<string[]>
     */
    join(this: Parser<string[]>, separator: string = ""): Parser<string> {
        return new Join(this, separator);
    }

    /**
     * succeeds if "this" fails, does not consume output
     */
    not(): Skip {
        return new Not(this);
    }

    peek(): Parser<T> {
        return new Peek<T>(this);
    }

    skip(): Skip {
        return new Skip(this);
    }
}

export class Skip extends Parser<undefined> {
    protected _skip = true;
    constructor(protected parser: Parser<any>) {
        super();
    }
    parse(source: Source): ParseResult<undefined> {
        const result = this.parser.parse(source);
        if (result.success) {
            return new ParseResultOk(undefined);
        }
        return result;
    }
}

class SkipMany extends Skip {
    constructor(parser: Parser<any>) {
        super(parser);
    }
    parse(source: Source): ParseResult<undefined> {
        for (; ;) {
            const pos = source.pos;
            const res = this.parser.parse(source);
            if (!res.success) {
                source.pos = pos;
                return new ParseResultOk(undefined);
            }
        }
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
        return new ParseResultFail(source, `expecting "${char}", got "${next}"`);
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

/**
 * for now only seq of parsers of the same type
 * once typescript gets variadic generics (https://github.com/Microsoft/TypeScript/issues/5453) it should be doable to make seq use arbitraty types
 */
export function seq<T>(arg: Skip, ...args: Skip[]): Skip;
export function seq<T>(arg: Parser<T>, ...args: Parser<T>[]): Parser<T[]>;
export function seq<T>(arg: Parser<T> | Skip, ...args: (Parser<T> | Skip)[]): Parser<T[]> | Skip {
    if (is_skip(arg)) {
        return new SkipSeq(arg, ...args);
    }
    return new Seq(arg, ...args as Parser<T>[]);
}
class Seq<T> extends Parser<T[]> {
    private rest: Parser<T>[];
    constructor(private parser: Parser<T>, ...rest: Parser<T>[]) {
        super();
        this.rest = rest;
    }
    parse(source: Source): ParseResult<T[]> {
        const result1 = this.parser.parse(source);
        if (!result1.success) {
            return new ParseResultFail(source);
        }
        const results = [result1.value];
        for (const p of this.rest) {
            const result2 = p.parse(source);
            if (result2.success) {
                results.push(result2.value as T);
            } else {
                return result2 as ParseResultFail;
            }
        }
        return new ParseResultOk(results);
    }
}



class SkipSeq extends Skip {
    private rest: Parser<any>[];
    constructor(parser: Parser<any>, ...rest: Parser<any>[]) {
        super(parser);
        this.rest = rest;
    }
    parse(source: Source): ParseResult<undefined> {
        const result1 = this.parser.parse(source);
        if (!result1.success) {
            return new ParseResultFail(source);
        }
        for (const p of this.rest) {
            const result2 = p.parse(source);
            if (!result2.success) {
                return result2;
            }
        }
        return new ParseResultOk(undefined);
    }
}

class CustomParser<T> extends Parser<T> {
    // TODO: is it more efficient to set ```this.parse = _```?
    constructor(private _: (source: Source) => ParseResult<T>) {
        super();
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

class Next<T> extends Parser<T> {
    constructor(private first: Parser<any>, private second: Parser<T>) {
        super();
    }
    parse(source: Source): ParseResult<T> {
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

class FollowedBy<T> extends Parser<T> {
    constructor(private _first: Parser<T>, private _next: Parser<any>) {
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

class Not extends Skip {
    constructor(parser: Parser<any>) {
        super(parser.peek());
    }
    parse(source: Source): ParseResult<undefined> {
        const result = this.parser.parse(source);
        if (result.success) {
            return new ParseResultFail(source);
        } else {
            return new ParseResultOk(undefined);
        }
    }
}

class Peek<T> extends Parser<T> {
    constructor(private parser: Parser<T>) {
        super();
    }
    parse(source: Source): ParseResult<T> {
        const pos = source.pos;
        const result = this.parser.parse(source);
        source.pos = pos;
        return result;
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
