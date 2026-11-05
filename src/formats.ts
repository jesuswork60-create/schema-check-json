/** Checks for the standard "format" names. Each one takes a string and answers yes or no. */

export type FormatCheck = (text: string) => boolean;

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return day <= (month === 2 && leap ? 29 : DAYS[month - 1]);
}

function isTime(text: string): boolean {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[zZ]|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (match === null) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  const offsetHour = Number(match[5] ?? 0);
  const offsetMinute = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 60 || offsetHour > 23 || offsetMinute > 59) return false;
  if (second === 60) {
    // A leap second only exists at the last minute of the day in UTC.
    const sign = match[4] === "-" ? 1 : -1;
    const utc = (((hour * 60 + minute + sign * (offsetHour * 60 + offsetMinute)) % 1440) + 1440) % 1440;
    return utc === 1439;
  }
  return true;
}

function isDateTime(text: string): boolean {
  const split = text.search(/[tT]/);
  return split === 10 && isDate(text.slice(0, split)) && isTime(text.slice(split + 1));
}

function isDuration(text: string): boolean {
  if (/^P\d+W$/.test(text)) return true;
  return /^P(?=\d|T)(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/.test(text);
}

function isHostname(text: string): boolean {
  if (text.length === 0 || text.length > 253) return false;
  return text.split(".").every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
}

function isIpv4(text: string): boolean {
  const parts = text.split(".");
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255);
}

function isIpv6(text: string): boolean {
  let body = text;
  if (body.includes(".")) {
    const lastColon = body.lastIndexOf(":");
    if (lastColon === -1 || !isIpv4(body.slice(lastColon + 1))) return false;
    body = `${body.slice(0, lastColon + 1)}0:0`;
  }
  const sides = body.split("::");
  if (sides.length > 2) return false;
  const groups = (side: string): string[] => (side === "" ? [] : side.split(":"));
  const all = sides.flatMap(groups);
  if (!all.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  return sides.length === 2 ? all.length <= 7 : all.length === 8;
}

function isEmail(text: string): boolean {
  const at = text.lastIndexOf("@");
  if (at < 1) return false;
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  const atoms = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
  const quoted = /^"(?:[^"\\\r\n]|\\[^\r\n])*"$/;
  if (!atoms.test(local) && !quoted.test(local)) return false;
  if (domain.startsWith("[") && domain.endsWith("]")) {
    const literal = domain.slice(1, -1);
    return /^ipv6:/i.test(literal) ? isIpv6(literal.slice(5)) : isIpv4(literal);
  }
  return isHostname(domain);
}

const URI_CHARS = /^(?:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]|%[0-9a-fA-F]{2})*$/;

function isUriReference(text: string): boolean {
  return URI_CHARS.test(text);
}

function isUri(text: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) && URI_CHARS.test(text);
}

function isUuid(text: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(text);
}

function isRegex(text: string): boolean {
  try {
    new RegExp(text, "u");
    return true;
  } catch {
    return false;
  }
}

function isJsonPointer(text: string): boolean {
  return /^(?:\/(?:[^~/]|~[01])*)*$/.test(text);
}

function isRelativeJsonPointer(text: string): boolean {
  const match = /^(0|[1-9][0-9]*)(.*)$/s.exec(text);
  return match !== null && (match[2] === "#" || isJsonPointer(match[2]));
}

export const FORMATS: Readonly<Record<string, FormatCheck>> = {
  date: isDate,
  time: isTime,
  "date-time": isDateTime,
  duration: isDuration,
  email: isEmail,
  hostname: isHostname,
  ipv4: isIpv4,
  ipv6: isIpv6,
  uri: isUri,
  "uri-reference": isUriReference,
  uuid: isUuid,
  regex: isRegex,
  "json-pointer": isJsonPointer,
  "relative-json-pointer": isRelativeJsonPointer,
};
