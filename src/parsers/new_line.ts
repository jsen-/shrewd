import { char, any, Parser } from "..";

const CR = char("\r");
const LF = char("\n");

export function new_line(): Parser<string> {
    return CR.then(LF).join() // windows
        .or(CR)  // mac
        .or(LF); // unix
}