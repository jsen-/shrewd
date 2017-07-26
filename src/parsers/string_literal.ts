import { char, any, Parser } from "..";

export function string_literal(boundary: Parser<string> = char("\""), escape_character: Parser<string> = char("\\")): Parser<string> {
    const escaped_character = escape_character.next(any()).or(any());
    return boundary.next(escaped_character.untilFollowedBy(boundary)).join();
}