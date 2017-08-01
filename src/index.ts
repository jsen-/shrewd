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
    or(this: Skip, other: Skip): Skip;
    or(this: Parser<T>, other: Parser<T>): Parser<T>;
    or(this: Parser<T> | Skip, other: Parser<T> | Skip): Parser<T> | Skip {
        const parser = this;
        return Object.create(this, {
            parse: {
                value: function parse_or(source: Source) {
                    const pos = source.pos;
                    const self_result = parser.parse(source);
                    if (self_result.success) {
                        return self_result;
                    }
                    source.pos = pos;
                    return other.parse(source);
                }
            }
        });
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
                return new SkipSeq(self, next);
            }
            return new FollowedBy<T>(self, next);
        } else if (is_skip(self)) {
            return new Next<U>(self, next);
        }
        return new Then<T, U>(self, next);
    }
    /**
     * zero or more occurrences of "this"
     */
    many(this: Skip): Skip;
    many(this: Parser<T>): Parser<T[]>;
    many(this: Parser<T> | Skip): Parser<T[]> | Skip {
        const self = this;
        if (is_skip(self)) {
            return new SkipMany(self);
        }
        return new Many(self);
    }
    /**
     * at leat one occurrence of "this"
     */
    many1(this: Skip): Skip;
    many1(this: Parser<T>): Parser<T[]>;
    many1(this: Parser<T> | Skip): Parser<T[]> | Skip {
        const self = this;
        if (is_skip(self)) {
            return self.then(self.many());
        }
        return new Many1(self);
    }
    /**
     * if "this" succeeds, map the produced value through "mapper" function
     */
    map<U>(this: Skip, mapper: () => U): Parser<U>;
    map<U>(this: Parser<T>, mapper: (value: T) => U): Parser<U>;
    map<U>(this: Parser<T> | Skip, mapper: ((value?: T) => U) | (() => U)): Parser<U> {
        const self = this;
        if (is_skip(self)) {
            return new MapSkip(self, mapper);
        }
        return new Map(self, mapper);
    }
    retn<U>(value: U): Parser<U> {
        return this.map(() => value);
    }
    /**
     * if "this" fails, changes the error message to: `expecting "${what}"`
     */
    expect(this: Skip, what: string): Skip;
    expect(this: Parser<T>, what: string): Parser<T>;
    expect(this: Parser<T> | Skip, what: string): Parser<T> | Skip {
        const parser = this;
        return Object.create(this, {
            parse: {
                value: function parse_expect(source: Source) {
                    const result = parser.parse(source);
                    if (result.success) {
                        return result;
                    }
                    return new ParseResultFail(source, `expecting ${this.what}`);
                }
            }
        });
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
    followedBy(this: Skip, next: Parser<any>): Skip;
    followedBy(next: Parser<any>): Parser<T>;
    followedBy(this: Parser<T> | Skip, next: Parser<any>): Parser<T> | Skip {
        const self = this;
        if (is_skip(self)) {
            return new SkipSeq(self, next);
        }
        return new FollowedBy(self, next);
    }
    /**
     * discards "this"
     */
    next(next: Skip): Skip;
    next<U>(next: Parser<U>): Parser<U>;
    next<U>(next: Parser<U> | Skip): Parser<U> | Skip {
        if (is_skip(next)) {
            return new SkipSeq(this, next);
        }
        return new Next(this, next);
    }
    /**
     * matches "this" "n"-times
     */
    times(this: Skip, n: number): Skip;
    times(this: Parser<T>, times: number): Parser<T[]>;
    times(this: Parser<T> | Skip, times: number): Parser<T[]> | Skip {
        const self = this;
        if (is_skip(self)) {
            return new TimesSkip(self, times);
        }
        return new Times(self, times);
    }
    /**
     * parse this, but don't consume any input
     */
    peek(this: Skip): Skip;
    peek(this: Parser<T>): Parser<T>;
    peek(this: Parser<T> | Skip): Parser<T> | Skip {
        const self = this;
        if (is_skip(self)) {
            return new PeekSkip(self);
        }
        return new Peek(self);
    }

    optional(this: Skip): Skip;
    optional(this: Parser<T>): Parser<T | undefined>;
    optional(this: Parser<T> | Skip): Parser<T | undefined> | Skip {
        const parser = this;
        return Object.create(this, {
            parse: {
                value: function parse_optional(source: Source): ParseResultOk<T | undefined> {
                    const pos = source.pos;
                    const result = parser.parse(source);
                    if (result.success) {
                        return result;
                    }
                    source.pos = pos;
                    return new ParseResultOk(undefined);
                }
            }
        });
    }

    sepBy(this: Skip, separator: Parser<any>): Skip;
    sepBy(this: Parser<T>, separator: Parser<any>): Parser<T[]>;
    sepBy(this: Parser<T> | Skip, separator: Parser<any>): Parser<T[]> | Skip {
        const self = this;
        if (is_skip(self)) {
            return self.sepBy1(separator).or(always(undefined).skip());
        }
        return self.sepBy1(separator).or(always([]));
    }

    sepBy1(this: Skip, separator: Parser<any>): Skip;
    sepBy1(this: Parser<T>, separator: Parser<any>): Parser<T[]>;
    sepBy1(this: Parser<T> | Skip, separator: Parser<any>): Parser<T[]> | Skip {
        const self = this;
        if (is_skip(self)) {
            const x = separator.next(self).many();
            return seq(self, x);
        }
        const tail = separator.next(self).many();
        return self.then(tail)
            .map(([head, tail]) => {
                tail.unshift(head);
                return tail;
            });
    }
    /**
     * only applicable to Parser<string[]>
     */
    join(this: Parser<string[]>, separator = ""): Parser<string> {
        return new Join(this, separator);
    }

    /**
     * succeeds if "this" fails, does not consume output
     */
    not(): Skip {
        return new Not(this);
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

export function always<T>(value: T): Parser<T> {
    return new CustomParser((source: Source) => {
        return new ParseResultOk(value);
    });
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
            return result;
        }
        return new ParseResultOk(this.mapper(result.value));
    }
}

class MapSkip<U> extends Parser<U> {
    constructor(private from: Skip, private mapper: () => U) {
        super();
    }
    parse(source: Source): ParseResult<U> {
        const result = this.from.parse(source);
        if (!result.success) {
            return result;
        }
        return new ParseResultOk(this.mapper());
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

class PeekSkip extends Skip {
    constructor(parser: Skip) {
        super(parser);
    }
    parse(source: Source): ParseResult<undefined> {
        const pos = source.pos;
        const result = this.parser.parse(source);
        source.pos = pos;
        if (result.success) {
            return new ParseResultOk(undefined);
        }
        return result;
    }
}

class Times<T> extends Parser<T[]> {
    constructor(private parser: Parser<T>, private _times: number) {
        super();
    }
    parse(source: Source): ParseResult<T[]> {
        const results = [];
        for (let i = 0; i < this._times; ++i) {
            const result = this.parser.parse(source);
            if (result.success) {
                results.push(result.value);
            } else {
                return result;
            }
        }
        return new ParseResultOk(results);
    }
}

class TimesSkip extends Skip {
    constructor(parser: Parser<any>, private _times: number) {
        super(parser);
    }
    parse(source: Source): ParseResult<undefined> {
        for (let i = 0; i < this._times; ++i) {
            const result = this.parser.parse(source);
            if (!result.success) {
                return result;
            }
        }
        return new ParseResultOk(undefined);
    }
}

export namespace grammar {
    /**
     * matches a decimal digit
     */
    export function digit(): Parser<string> {
        return oneOf("0123456789").expect("digit");
    }
    const ASCII_ZERO = "0".charCodeAt(0);
    export function decimal() {
        return digit().map((digit) => digit.charCodeAt(0) - ASCII_ZERO).many1().map(numbers => {
            let number = 0;
            for (const num of numbers) {
                number = number * 10 + num;
            }
            return number;
        });
    }
}
