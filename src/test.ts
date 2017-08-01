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

// test then
expectEq(char("a")
    .then(char("b").skip())
    .then(char("c"))
    .then(char("d").skip()), "abcd", ["a", "c"]);

// test until
expectEq(char("a").until(char("b").peek()).followedBy(char("b")), "aab", [["a", "a"], "b"]);
expectEq(char("a").until(char("b").peek().skip()).followedBy(char("b")), "aab", ["a", "a"]);
expectEq(char("a").until(char("b")), "aab", [["a", "a"], "b"]);
expectEq(char("a").until(char("b")), "aaab", [["a", "a", "a"], "b"]);
expectEq(char("a").until(char("b").skip()), "aaab", ["a", "a", "a"]);
expectEq(char("a").skip().until(char("b")), "aaab", "b");
expectEq(char("a").skip().until(char("b").skip()), "aaab", undefined);

// test or
expectEq(char("a").or(char("b")), "a", "a");
expectEq(char("a").skip().or(char("b").skip()), "b", undefined);
expectEq(char("a").skip().or(char("b").skip()).then(char("c")), "bc", "c");

// test many1
expectEq(char("a").many1(), "a", ["a"]);
expectEq(char("a").many1(), "aaa", ["a", "a", "a"]);
expectEq(char("a").skip().many1(), "a", undefined);
expectEq(char("a").many1().skip(), "a", undefined);

// test expect
expectEq(char("a").expect("letter a"), "a", "a");
expectEq(char("a").skip().expect("letter a"), "a", undefined);
expectEq(char("a").expect("letter a").then(char("b")), "ab", ["a", "b"]);
expectEq(char("a").skip().expect("letter a").then(char("b")), "ab", "b");

// test followedBy
expectEq(char("a").followedBy(char("b")), "ab", "a");
expectEq(char("a").skip().followedBy(char("b")), "ab", undefined);

// test many1
expectEq(char("a").many1(), "a", ["a"]);
expectEq(char("a").skip().many1(), "a", undefined);
expectEq(char("a").many1().skip(), "aa", undefined);
expectEq(char("a").skip().many1().then(char("b")), "aaab", "b");

// test map
expectEq(char("a").map((a => a + "!")), "a", "a!");
expectEq(char("a").skip().map((() => "!")), "a", "!");
expectEq(char("a").map(((a) => a + "!")).then(char("b")), "ab", ["a!", "b"]);
expectEq(char("a").skip().map((() => "!")).then(char("b")), "ab", ["!", "b"]);

// test times
expectEq(char("a").times(3), "aaa", ["a", "a", "a"]);
expectEq(char("a").times(3).then(char("b")), "aaab", [["a", "a", "a"], "b"]);
expectEq(char("a").skip().times(3), "aaa", undefined);
expectEq(char("a").skip().times(3).then(char("b")), "aaab", "b");

// test peek
expectEq(char("a").peek().then(char("a")), "a", ["a", "a"]);
expectEq(char("a").peek().skip().then(char("a")), "a", "a");
expectEq(char("a").skip().peek().then(char("a")), "a", "a");

// test optional
expectEq(char("a").optional().followedBy(char("b")), "ab", "a");
expectEq(char("a").optional().followedBy(char("b")), "b", undefined);
expectEq(char("a").optional().skip().followedBy(char("b")), "ab", undefined);
expectEq(char("a").skip().optional().followedBy(char("b")), "ab", undefined);
expectEq(char("a").optional().skip().followedBy(char("b")), "b", undefined);

// test sepBy1
expectEq(char("a").sepBy1(char(",")), "a", ["a"]);
expectEq(char("a").sepBy1(char(",")), "a,a,a,a", ["a", "a", "a", "a"]);
expectEq(char("a").skip().sepBy1(char(",")), "a", undefined);
expectEq(char("a").skip().sepBy1(char(",")), "a,a,a,a", undefined);

// test sepBy
expectEq(char("a").sepBy(char(",")), "", []);
expectEq(char("a").sepBy(char(",")).then(char("b")), "b", [[] as string[], "b"]);
expectEq(char("a").sepBy(char(",")).then(char("b")), "ab", [["a"], "b"]);
expectEq(char("a").sepBy(char(",")).then(char("b")), "a,ab", [["a", "a"], "b"]);
expectEq(char("a").sepBy(char(",")).then(char("b").skip()), "a,ab", ["a", "a"]);
expectEq(char("a").skip().sepBy(char(",")), "", undefined);
expectEq(char("a").skip().sepBy(char(",")).then(char("b")), "b", "b");
