/**
 * Exact multipleOf. Binary floats make 0.3 % 0.1 come out non-zero, so numbers are read in their
 * shortest decimal form, which is what the JSON text said, and divided as big integers.
 */

interface Scaled {
  digits: bigint;
  /** The value is digits / 10^scale. */
  scale: number;
}

function toScaled(value: number): Scaled {
  const [mantissa, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
}

/** Whether value divided by divisor is a whole number. The divisor must not be zero. */
export function isMultipleOf(value: number, divisor: number): boolean {
  const a = toScaled(value);
  const b = toScaled(divisor);
  const scale = Math.max(a.scale, b.scale);
  const left = a.digits * 10n ** BigInt(scale - a.scale);
  const right = b.digits * 10n ** BigInt(scale - b.scale);
  return left % right === 0n;
}
