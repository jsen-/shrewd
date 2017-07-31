import { Parser, Source, ParseResult, ParseResultFail, char, eof, seq } from ".";
import { deepEqual } from "assert";

import { string_literal } from "./parsers/string_literal";
import { new_line } from "./parsers/new_line";


export function expectEq<T>(parser: Parser<T>, input: string, expected: T) {
    const source = new Source(input, 0);
    const result = parser.followedBy(eof()).parse(source);
    if (!result.success) {
        const source = (result as ParseResultFail).source as Source;
        const input = (source as any).input as string;
        const pos = source.pos;

        const begin = Math.max(0, pos - 10);
        const end = Math.max(input.length, pos + 10);
        console.error(`parse error on pos ${source.pos}: ${(result as ParseResultFail).reason}
${input.substring(begin, end)}
${" ".repeat(pos - begin)}^`);
        return false;
    }
    try {
        deepEqual(result.value, expected);
    } catch (e) {
        console.error(e.toString());
        return false;
    }
    return true;
}



const r = String.raw;

// test string_literal
expectEq(string_literal(), r`"Hell\"o"`, r`Hell"o`);
//expectEq(string_literal(), r`"Hell\\o"`, r`Hell\o`);
expectEq(string_literal(), r`"Hell\o"`, r`Hello`);


expectEq(char("a").until(char("b").peek()).followedBy(char("b")), "ab", [["a"], "b"]);

expectEq(char("a").until(char("b")), "aab", [["a", "a"], "b"]);

expectEq(char("a")
    .then(char("b"))
    .then(char("c"))
    .then(char("d")), "abcd", [[["a", "b"], "c"], "d"]);


expectEq(char("a").then(char("b").skip()), "ab", "a");
expectEq(char("a").skip().then(char("b")), "ab", "b");
expectEq(char("a").skip().then(char("b").skip()), "ab", undefined);
// test NEW_LINE
expectEq(new_line(), "\r", "\r");
expectEq(new_line(), "\n", "\n");
expectEq(new_line(), "\r\n", "\r\n");
expectEq(new_line().many1(), "\r\n", ["\r\n"]);
expectEq(new_line().many1(), "\r\n\r", ["\r\n", "\r"]);
expectEq(new_line().many1(), "\n\r\n", ["\n", "\r\n"]);

// test multiple EOFs
expectEq(eof().followedBy(eof()), "", undefined);
expectEq(eof(), "", undefined);

expectEq(seq(char("a"), char("b"), char("c")), "abc", ["a", "b", "c"]);

expectEq(char("a")
    .then(char("b").skip())
    .then(char("c"))
    .then(char("d").skip()), "abcd", ["a", "c"]);

// expectEq(char("a").until(char("b")), "aaab", [["a", "a", "a"], "b"]);
// expectEq(char("a").until(char("b").skip()), "aaab", ["a", "a", "a"]);
expectEq(char("a").skip().until(char("b")), "aaab", "b");
expectEq(char("a").skip().until(char("b").skip()), "aaab", undefined);

// test or
expectEq(char("a").or(char("b")), "a", "a");
expectEq(char("a").skip().or(char("b").skip()), "b", undefined);

// test many1
expectEq(char("a").many1(), "a", ["a"]);
expectEq(char("a").many1(), "aaa", ["a", "a", "a"]);
expectEq(char("a").skip().many1(), "a", undefined);
expectEq(char("a").many1().skip(), "a", undefined);

expectEq(char("a").expect("letter a"), "a", "a");
expectEq(char("a").skip().expect("letter a"), "a", undefined);
