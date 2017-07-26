import { Parser, Source, eof } from ".";
import { deepEqual } from "assert";

export function expectEq<T>(parser: Parser<T>, input: string, expected: T) {
    const result = parser.followedBy(eof()).parse(new Source(input, 0));
    if(!result.success) {
        console.error(result.reason);
        return false;
    }
    try {
        deepEqual(result.value, expected);
    } catch(e) {
        console.error(e.toString());
        return false;
    }
    return true;
}