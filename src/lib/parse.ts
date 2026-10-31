// Recognises what a scanned QR code contains.

export interface ParsedField {
  label: string;
  value: string;
  /** Set when the value is a web address the user may choose to open. */
  link?: string;
}

export interface ParsedCode {
  kind:
    | "upi"
    | "wifi"
    | "url"
    | "whatsapp"
    | "contact"
    | "email"
    | "phone"
    | "sms"
    | "location"
    | "text";
  title: string;
  fields: ParsedField[];
}

const field = (
  label: string,
  value: string | undefined,
  extra: Partial<ParsedField> = {},
) => (value ? [{ label, value, ...extra }] : []);

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Decodes a query value, where "+" also stands for a space. */
const decodeQuery = (value: string) => decode(value.replace(/\+/g, " "));

/** Reads key=value pairs from the part of a URI after "?". */
export const queryParams = (uri: string) => {
  const params = new Map<string, string>();
  const index = uri.indexOf("?");
  if (index < 0) {
    return params;
  }
  for (const pair of uri.slice(index + 1).split("&")) {
    if (!pair) continue;
    const [key, ...rest] = pair.split("=");
    params.set(decodeQuery(key).toLowerCase(), decodeQuery(rest.join("=")));
  }
  return params;
};

export interface UpiPayment {
  payee: string;
  name: string;
  amount: string;
  currency: string;
  note: string;
}

export const parseUpi = (text: string): UpiPayment | null => {
  if (!/^upi:\/\/pay\b/i.test(text.trim())) {
    return null;
  }
  const params = queryParams(text.trim());
  return {
    payee: params.get("pa") ?? "",
    name: params.get("pn") ?? "",
    amount: params.get("am") ?? "",
    currency: params.get("cu") ?? "INR",
    note: params.get("tn") ?? "",
  };
};

/** Formats a number of rupees with Indian digit grouping, e.g. ₹1,25,000.50. */
export const formatRupees = (amount: string) => {
  const number = Number(amount);
  if (!Number.isFinite(number)) {
    return amount;
  }
  return `₹${number.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Splits on separators that are not escaped with a backslash. */
const splitEscaped = (text: string, separator: string) => {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\" && i + 1 < text.length) {
      current += char + text[i + 1];
      i++;
    } else if (char === separator) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
};

const unescapeBackslashes = (value: string) => value.replace(/\\(.)/g, "$1");

export interface WifiNetwork {
  ssid: string;
  password: string;
  security: string;
  hidden: boolean;
}

export const parseWifi = (text: string): WifiNetwork | null => {
  if (!/^WIFI:/i.test(text)) {
    return null;
  }
  const network: WifiNetwork = { ssid: "", password: "", security: "", hidden: false };
  for (const part of splitEscaped(text.slice(5), ";")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const key = part.slice(0, index).toUpperCase();
    const value = unescapeBackslashes(part.slice(index + 1));
    if (key === "S") network.ssid = value;
    else if (key === "P") network.password = value;
    else if (key === "T") network.security = value;
    else if (key === "H") network.hidden = value.toLowerCase() === "true";
  }
  return network;
};

const unescapeVcard = (value: string) =>
  value.replace(/\\([\\;,nN])/g, (_, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );

export interface Contact {
  name: string;
  phones: string[];
  emails: string[];
  company: string;
  website: string;
  address: string;
}

export const parseVcard = (text: string): Contact | null => {
  if (!/^BEGIN:VCARD/i.test(text.trim())) {
    return null;
  }
  // lines that start with a space or tab continue the previous line
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
  const contact: Contact = {
    name: "",
    phones: [],
    emails: [],
    company: "",
    website: "",
    address: "",
  };
  let structuredName = "";
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    const key = line.slice(0, index).split(";")[0].toUpperCase();
    const value = line.slice(index + 1);
    const parts = splitEscaped(value, ";").map(unescapeVcard);
    if (key === "FN") contact.name = unescapeVcard(value);
    else if (key === "N") structuredName = [parts[1], parts[0]].filter(Boolean).join(" ");
    else if (key === "TEL") contact.phones.push(unescapeVcard(value));
    else if (key === "EMAIL") contact.emails.push(unescapeVcard(value));
    else if (key === "ORG") contact.company = parts.filter(Boolean).join(", ");
    else if (key === "URL") contact.website = unescapeVcard(value);
    else if (key === "ADR") contact.address = parts.filter(Boolean).join(", ");
  }
  contact.name ||= structuredName;
  return contact;
};

const isWebLink = (text: string) => /^https?:\/\/\S+$/i.test(text.trim());

/** Works out what a scanned code contains and how to show it. */
export const parseCode = (text: string): ParsedCode => {
  const raw = text.trim();

  const upi = parseUpi(raw);
  if (upi) {
    return {
      kind: "upi",
      title: "UPI payment",
      fields: [
        ...field("Pay to", upi.name),
        ...field("UPI ID", upi.payee),
        ...field(
          "Amount",
          upi.amount && (upi.currency === "INR" ? formatRupees(upi.amount) : upi.amount),
        ),
        ...(upi.amount
          ? []
          : [{ label: "Amount", value: "Not set: you choose it in the app" }]),
        ...field("Note", upi.note),
      ],
    };
  }

  const wifi = parseWifi(raw);
  if (wifi) {
    const security =
      { WPA: "WPA/WPA2/WPA3", WEP: "WEP", NOPASS: "None", "": "None" }[
        wifi.security.toUpperCase()
      ] ?? wifi.security;
    return {
      kind: "wifi",
      title: "Wi-Fi network",
      fields: [
        ...field("Network", wifi.ssid),
        ...field("Password", wifi.password),
        { label: "Security", value: security },
        ...(wifi.hidden ? [{ label: "Hidden network", value: "Yes" }] : []),
      ],
    };
  }

  const contact = parseVcard(raw);
  if (contact) {
    return {
      kind: "contact",
      title: "Contact card",
      fields: [
        ...field("Name", contact.name),
        ...field("Company", contact.company),
        ...contact.phones.flatMap((phone) => field("Phone", phone)),
        ...contact.emails.flatMap((email) => field("Email", email)),
        ...field("Website", contact.website, {
          link: isWebLink(contact.website) ? contact.website : undefined,
        }),
        ...field("Address", contact.address),
      ],
    };
  }

  const whatsapp = raw.match(/^https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)\/?(\d*)/i);
  if (whatsapp && isWebLink(raw)) {
    const params = queryParams(raw);
    const number = whatsapp[1] || params.get("phone") || "";
    return {
      kind: "whatsapp",
      title: "WhatsApp message",
      fields: [
        ...field("Number", number && `+${number}`),
        ...field("Message", params.get("text")),
        { label: "Link", value: raw, link: raw },
      ],
    };
  }

  if (isWebLink(raw)) {
    return {
      kind: "url",
      title: "Website link",
      fields: [{ label: "Link", value: raw, link: raw }],
    };
  }

  if (/^mailto:/i.test(raw)) {
    const params = queryParams(raw);
    const address = decode(raw.slice(7).split("?")[0]);
    return {
      kind: "email",
      title: "Email",
      fields: [
        ...field("To", address),
        ...field("Subject", params.get("subject")),
        ...field("Message", params.get("body")),
      ],
    };
  }

  const matmsg = raw.match(/^MATMSG:/i);
  if (matmsg) {
    const values = new Map<string, string>();
    for (const part of splitEscaped(raw.slice(7), ";")) {
      const index = part.indexOf(":");
      if (index > 0)
        values.set(
          part.slice(0, index).toUpperCase(),
          unescapeBackslashes(part.slice(index + 1)),
        );
    }
    return {
      kind: "email",
      title: "Email",
      fields: [
        ...field("To", values.get("TO")),
        ...field("Subject", values.get("SUB")),
        ...field("Message", values.get("BODY")),
      ],
    };
  }

  if (/^tel:/i.test(raw)) {
    return {
      kind: "phone",
      title: "Phone number",
      fields: field("Number", decode(raw.slice(4))),
    };
  }

  const smsto = raw.match(/^SMSTO:([^:]*):?([\s\S]*)$/i);
  if (smsto) {
    return {
      kind: "sms",
      title: "Text message (SMS)",
      fields: [...field("Number", smsto[1]), ...field("Message", smsto[2])],
    };
  }
  if (/^sms:/i.test(raw)) {
    const params = queryParams(raw);
    return {
      kind: "sms",
      title: "Text message (SMS)",
      fields: [
        ...field("Number", decode(raw.slice(4).split("?")[0])),
        ...field("Message", params.get("body")),
      ],
    };
  }

  const geo = raw.match(/^geo:(-?[\d.]+),(-?[\d.]+)/i);
  if (geo) {
    const map = `https://www.openstreetmap.org/?mlat=${geo[1]}&mlon=${geo[2]}#map=17/${geo[1]}/${geo[2]}`;
    return {
      kind: "location",
      title: "Location",
      fields: [
        { label: "Latitude", value: geo[1] },
        { label: "Longitude", value: geo[2] },
        { label: "Map", value: "Open in OpenStreetMap", link: map },
      ],
    };
  }

  return { kind: "text", title: "Text", fields: [] };
};
