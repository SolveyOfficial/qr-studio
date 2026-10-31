// Builds the text stored in a QR code for each kind of content.
import { UserError } from "./errors";

/** Percent-encodes a query value, keeping characters UPI apps expect as-is. */
export const encodeQueryValue = (value: string) =>
  encodeURIComponent(value).replace(/%40/g, "@");

const trimmed = (value: string | undefined) => (value ?? "").trim();

// UPI

export interface UpiDetails {
  /** Payee UPI ID, e.g. shop@okbank. */
  payee: string;
  name: string;
  /** Amount in rupees, optional. */
  amount?: string;
  note?: string;
}

const UPI_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export const isUpiId = (value: string) => UPI_ID.test(value.trim());

/** Checks an amount in rupees and returns it with two decimals ("" if empty). */
export const normaliseAmount = (value: string | undefined) => {
  const text = trimmed(value).replace(/,/g, "");
  if (!text) {
    return "";
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new UserError("Enter the amount in rupees, for example 250 or 99.50.");
  }
  const amount = Number(text);
  if (amount <= 0) {
    throw new UserError("The amount must be more than ₹0.");
  }
  if (amount > 5_00_000) {
    throw new UserError("UPI payments are limited to ₹5,00,000.");
  }
  return amount.toFixed(2);
};

export const buildUpi = (details: UpiDetails) => {
  const payee = trimmed(details.payee);
  const name = trimmed(details.name);
  if (!payee) {
    throw new UserError("Enter the UPI ID that should receive the money.");
  }
  if (!isUpiId(payee)) {
    throw new UserError("Enter a UPI ID like name@bank.");
  }
  if (!name) {
    throw new UserError("Enter the payee name.");
  }
  const amount = normaliseAmount(details.amount);
  const note = trimmed(details.note);
  const params: [string, string][] = [
    ["pa", payee],
    ["pn", name],
    ...(amount ? [["am", amount] as [string, string]] : []),
    ["cu", "INR"],
    ...(note ? [["tn", note] as [string, string]] : []),
  ];
  return `upi://pay?${params.map(([key, value]) => `${key}=${encodeQueryValue(value)}`).join("&")}`;
};

// Website

export const buildUrl = (value: string) => {
  let text = trimmed(value);
  if (!text) {
    throw new UserError("Enter a website address.");
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    text = `https://${text}`;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UserError("That doesn't look like a website address.");
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
    throw new UserError("Enter a website address, for example solvey.in.");
  }
  // keep what the user typed (apart from the added https://)
  return text;
};

// Text

export const buildText = (value: string) => {
  if (!value.trim()) {
    throw new UserError("Enter some text.");
  }
  return value;
};

// Wi-Fi

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export interface WifiDetails {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

/** Escapes \ ; , : and " with a backslash, as the WIFI: format requires. */
export const escapeWifi = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");

export const buildWifi = (details: WifiDetails) => {
  if (!details.ssid) {
    throw new UserError("Enter the network name (SSID).");
  }
  if (details.security !== "nopass" && !details.password) {
    throw new UserError("Enter the Wi-Fi password, or choose “No password”.");
  }
  if (details.security === "WPA" && details.password.length < 8) {
    throw new UserError("WPA passwords have at least 8 characters.");
  }
  const parts = [`T:${details.security}`, `S:${escapeWifi(details.ssid)}`];
  if (details.security !== "nopass") {
    parts.push(`P:${escapeWifi(details.password)}`);
  }
  if (details.hidden) {
    parts.push("H:true");
  }
  return `WIFI:${parts.join(";")};;`;
};

// Contact card (vCard 3.0)

export interface ContactDetails {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  website: string;
  street: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

/** Escapes a vCard text value. */
export const escapeVcard = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

export const buildVcard = (contact: ContactDetails) => {
  const c = Object.fromEntries(
    Object.entries(contact).map(([key, value]) => [key, trimmed(value)]),
  ) as unknown as ContactDetails;
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
  if (!fullName && !c.company) {
    throw new UserError("Enter a name or a company.");
  }
  if (c.email && !isEmail(c.email)) {
    throw new UserError("Check the email address.");
  }
  const e = escapeVcard;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${e(c.lastName)};${e(c.firstName)};;;`,
    `FN:${e(fullName || c.company)}`,
  ];
  if (c.company) lines.push(`ORG:${e(c.company)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${cleanPhone(c.phone)}`);
  if (c.email) lines.push(`EMAIL:${e(c.email)}`);
  if (c.website) lines.push(`URL:${e(c.website)}`);
  if (c.street || c.city || c.region || c.postcode || c.country) {
    lines.push(
      `ADR:;;${[c.street, c.city, c.region, c.postcode, c.country].map(e).join(";")}`,
    );
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
};

// Email

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const buildEmail = (to: string, subject: string, body: string) => {
  const address = trimmed(to);
  if (!isEmail(address)) {
    throw new UserError("Enter an email address like name@example.com.");
  }
  const params = [
    subject.trim() && `subject=${encodeURIComponent(subject.trim())}`,
    body.trim() && `body=${encodeURIComponent(body)}`,
  ].filter(Boolean);
  return `mailto:${address}${params.length ? `?${params.join("&")}` : ""}`;
};

// Phone and SMS

/** Removes spaces, dashes, dots and brackets from a phone number. */
export const cleanPhone = (value: string) => value.trim().replace(/[\s\-().]/g, "");

const checkPhone = (value: string) => {
  const phone = cleanPhone(value);
  if (!/^\+?\d{3,15}$/.test(phone)) {
    throw new UserError(
      "Enter a phone number using digits, for example +91 98765 43210.",
    );
  }
  return phone;
};

export const buildPhone = (number: string) => `tel:${checkPhone(number)}`;

export const buildSms = (number: string, message: string) =>
  `SMSTO:${checkPhone(number)}:${message}`;

// WhatsApp

/**
 * Turns a phone number into the digits WhatsApp expects, with the country
 * code and no "+". Ten-digit Indian mobile numbers, and numbers starting
 * with 0, get the +91 country code.
 */
export const whatsappNumber = (value: string) => {
  let text = cleanPhone(value);
  if (text.startsWith("+")) {
    text = text.slice(1);
  } else if (text.startsWith("00")) {
    text = text.slice(2);
  } else if (/^0\d{10}$/.test(text)) {
    text = `91${text.slice(1)}`;
  } else if (/^[6-9]\d{9}$/.test(text)) {
    text = `91${text}`;
  }
  if (!/^[1-9]\d{7,14}$/.test(text)) {
    throw new UserError(
      "Enter a WhatsApp number with its country code, for example +91 98765 43210.",
    );
  }
  if (text.startsWith("91") && !/^91[6-9]\d{9}$/.test(text)) {
    throw new UserError("Indian mobile numbers have 10 digits after +91.");
  }
  return text;
};

export const buildWhatsapp = (number: string, message: string) => {
  const digits = whatsappNumber(number);
  return `https://wa.me/${digits}${message.trim() ? `?text=${encodeURIComponent(message)}` : ""}`;
};

// Location

const parseCoordinate = (value: string, limit: number, label: string) => {
  const text = trimmed(value);
  const number = Number(text);
  if (!text || !Number.isFinite(number) || Math.abs(number) > limit) {
    throw new UserError(`Enter the ${label} as a number between -${limit} and ${limit}.`);
  }
  return text.replace(/^\+/, "");
};

export const buildLocation = (latitude: string, longitude: string) =>
  `geo:${parseCoordinate(latitude, 90, "latitude")},${parseCoordinate(longitude, 180, "longitude")}`;
