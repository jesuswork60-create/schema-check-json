import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FORMATS } from "../src/formats.js";

function table(name: string, good: string[], bad: string[]): void {
  describe(`format ${name}`, () => {
    const check = FORMATS[name];
    it("accepts", () => good.forEach((text) => assert.ok(check(text), `should accept ${JSON.stringify(text)}`)));
    it("refuses", () => bad.forEach((text) => assert.ok(!check(text), `should refuse ${JSON.stringify(text)}`)));
  });
}

table(
  "date",
  ["2024-02-29", "2000-02-29", "2023-12-31", "0001-01-01"],
  ["2023-02-29", "1900-02-29", "2023-13-01", "2023-00-10", "2023-01-00", "2023-04-31", "23-01-01", "2023-1-1", "2023-01-01 ", "٢٠٢٣-01-01"],
);

table(
  "time",
  ["12:30:45Z", "12:30:45z", "23:59:59.123+01:00", "00:00:00-23:59", "23:59:60Z", "22:59:60-01:00", "00:29:60+00:30"],
  ["12:30:45", "24:00:00Z", "12:60:00Z", "12:30:61Z", "12:30Z", "12:30:45+24:00", "12:30:45+01:60", "12:30:60Z", "23:59:60+01:00", "12:30:45.Z"],
);

table(
  "date-time",
  ["2024-02-29T12:00:00Z", "2024-02-29t12:00:00+05:30"],
  ["2023-02-29T12:00:00Z", "2024-02-29 12:00:00Z", "2024-02-29", "12:00:00Z", "2024-02-29T25:00:00Z"],
);

table(
  "duration",
  ["P1Y", "P1M", "P2W", "PT1H", "P1DT2H3M4S", "PT0S", "P1Y2M3D"],
  ["P", "PT", "1Y", "P1H", "P1DT", "P1W2D", "PT1D", "P1M1Y", "PT1.5S"],
);

table(
  "email",
  ["alpha@example.com", "a.b+c@sub.example.com", '"odd name"@example.com', "a@[192.0.2.1]", "a@[IPv6:2001:db8::1]", "a@localhost"],
  ["", "@example.com", "alpha", "alpha@", "a b@example.com", ".a@example.com", "a.@example.com", "a..b@example.com", "a@-bad.example.com", "a@[1.2.3]"],
);

table(
  "hostname",
  ["example.com", "a", "a-b.example", "xn--bcher-kva.example", "1.example"],
  ["", "-a.example", "a-.example", "a..b", "a_b.example", ".example", `${"a".repeat(64)}.example`, "a.".repeat(127) + "a"],
);

table(
  "ipv4",
  ["0.0.0.0", "192.0.2.1", "255.255.255.255"],
  ["256.0.0.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "1.2.3.a", "", "1.2.3.4 "],
);

table(
  "ipv6",
  ["::", "::1", "1::", "2001:db8::8a2e:370:7334", "1:2:3:4:5:6:7:8", "::ffff:192.0.2.1", "1:2:3:4:5:6:192.0.2.1", "ABCD:EF01::"],
  ["", ":", ":::", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1::2::3", "12345::", "g::", "1:2:3:4:5:6:7:192.0.2.1", "::ffff:999.0.2.1", "1:2:3:4:5:6:7:8::", "192.0.2.1"],
);

table(
  "uri",
  ["https://example.com/a?b=c#d", "mailto:a@example.com", "urn:isbn:0451450523", "a+b.c-d:x", "https://example.com/%20"],
  ["/relative", "example.com", "1http://example.com", "https://example.com/a b", "https://example.com/%zz", "", "https://example.com/é"],
);

table(
  "uri-reference",
  ["", "/relative", "a/b?c#d", "#top", "https://example.com"],
  ["a b", "%zz", "<a>"],
);

table(
  "uuid",
  ["123e4567-e89b-12d3-a456-426614174000", "123E4567-E89B-12D3-A456-426614174000"],
  ["123e4567e89b12d3a456426614174000", "123e4567-e89b-12d3-a456-42661417400", "g23e4567-e89b-12d3-a456-426614174000", "{123e4567-e89b-12d3-a456-426614174000}"],
);

table("regex", ["^a+$", "[a-z]", "\\p{L}"], ["(", "[", "a{2,1}", "\\p{Nope}"]);

table("json-pointer", ["", "/", "/a/b", "/a~0b/c~1d", "/ "], ["a", "/a~", "/a~2"]);

table("relative-json-pointer", ["0", "1/a", "0#", "12/a~0"], ["", "/a", "01", "-1", "1a", "#", "1#/a"]);
