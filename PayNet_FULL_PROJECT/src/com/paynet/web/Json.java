package com.paynet.web;

import com.paynet.common.Transaction;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A tiny hand-written JSON helper. No external libraries are allowed in this project,
 * so we only implement what the web API needs:
 *  - writing: escape a string and turn a Transaction into JSON text
 *  - reading: parse a FLAT object such as {"username":"alice","amount":1250}
 *    (values may be strings, numbers, true/false/null; no nested objects or arrays).
 */
public final class Json {
    private Json() {}

    // ------------------------------------------------------------------ writing

    /** Turns a Java string into a quoted JSON string, escaping quotes, backslashes and control characters. */
    public static String quote(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 2);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); // other control chars
                    else sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    /** Transaction -> {"id":..,"from":"..","to":"..","amount":cents,"timestamp":ms,"status":"..","note":".."} */
    public static String tx(Transaction t) {
        return "{\"id\":" + t.getId()
                + ",\"from\":" + quote(t.getFrom())
                + ",\"to\":" + quote(t.getTo())
                + ",\"amount\":" + t.getCents()
                + ",\"timestamp\":" + t.getTimestamp()
                + ",\"status\":" + quote(t.getStatus())
                + ",\"note\":" + quote(t.getNote()) + "}";
    }

    /** List of transactions -> JSON array text. */
    public static String txArray(List<Transaction> list) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(tx(list.get(i)));
        }
        return sb.append(']').toString();
    }

    /** Error body used for every failed request: {"error":CODE,"message":TEXT} */
    public static String error(String code, String message) {
        return "{\"error\":" + quote(code) + ",\"message\":" + quote(message) + "}";
    }

    // ------------------------------------------------------------------ reading

    /**
     * Parses a flat JSON object into a map. Every value is returned as a String
     * (numbers keep their text, e.g. "1250"; null becomes null).
     * Throws IllegalArgumentException if the text is not a valid flat object.
     */
    public static Map<String, String> parseFlat(String text) {
        Parser p = new Parser(text == null ? "" : text);
        return p.parseObject();
    }

    /** Small recursive-descent style parser (one character at a time). */
    private static final class Parser {
        private final String s;
        private int pos = 0;

        Parser(String s) { this.s = s; }

        Map<String, String> parseObject() {
            Map<String, String> map = new HashMap<>();
            skipSpaces();
            expect('{');
            skipSpaces();
            if (peek() == '}') { pos++; return finish(map); }   // empty object
            while (true) {
                skipSpaces();
                String key = parseString();
                skipSpaces();
                expect(':');
                skipSpaces();
                map.put(key, parseValue());
                skipSpaces();
                char c = next();
                if (c == '}') break;                            // end of object
                if (c != ',') throw new IllegalArgumentException("Expected ',' or '}' in JSON");
            }
            return finish(map);
        }

        private Map<String, String> finish(Map<String, String> map) {
            skipSpaces();
            if (pos != s.length()) throw new IllegalArgumentException("Extra text after JSON object");
            return map;
        }

        private String parseValue() {
            char c = peek();
            if (c == '"') return parseString();
            // number, true, false, null: read until a separator
            int start = pos;
            while (pos < s.length() && ",}] \t\r\n".indexOf(s.charAt(pos)) < 0) pos++;
            String raw = s.substring(start, pos);
            if (raw.isEmpty()) throw new IllegalArgumentException("Missing JSON value");
            if (raw.equals("null")) return null;
            if (raw.equals("true") || raw.equals("false")) return raw;
            try { new java.math.BigDecimal(raw); }              // must be a valid number
            catch (NumberFormatException e) { throw new IllegalArgumentException("Bad JSON value: " + raw); }
            return raw;
        }

        private String parseString() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') break;
                if (c == '\\') {                                // escape sequence
                    char e = next();
                    switch (e) {
                        case 'n': sb.append('\n'); break;
                        case 't': sb.append('\t'); break;
                        case 'r': sb.append('\r'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'u':
                            if (pos + 4 > s.length()) throw new IllegalArgumentException("Bad \\u escape");
                            sb.append((char) Integer.parseInt(s.substring(pos, pos + 4), 16));
                            pos += 4;
                            break;
                        default: sb.append(e);                  // \" \\ \/
                    }
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        private void skipSpaces() {
            while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++;
        }
        private char peek() {
            if (pos >= s.length()) throw new IllegalArgumentException("Unexpected end of JSON");
            return s.charAt(pos);
        }
        private char next() {
            char c = peek();
            pos++;
            return c;
        }
        private void expect(char c) {
            if (next() != c) throw new IllegalArgumentException("Expected '" + c + "' in JSON");
        }
    }
}
