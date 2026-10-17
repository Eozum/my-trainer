import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual} from "node:crypto";

function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw Error("Missing encryption key");
  return Buffer.from(value, "hex");
}

export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(buffer => buffer.toString("base64url")).join(".");
}

export function decrypt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw Error("Invalid encrypted token");
  const [iv, tag, data] = parts.map(part => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"));
}

export function seal(value: string) {
  return Buffer.from(value).toString("base64url") + "." + createHmac("sha256", key()).update(value).digest("base64url");
}

export function unseal(value: string) {
  const parts = value.split(".");
  if (parts.length !== 2) throw Error("Invalid OAuth cookie");
  const [encoded, signature] = parts;
  const raw = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = createHmac("sha256", key()).update(raw).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw Error("Invalid OAuth cookie");
  return JSON.parse(raw);
}
