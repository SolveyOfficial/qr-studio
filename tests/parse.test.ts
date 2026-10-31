import { describe, expect, it } from "vitest";

import {
  formatRupees,
  parseCode,
  parseUpi,
  parseVcard,
  parseWifi,
  queryParams,
} from "../src/lib/parse";
import { buildUpi, buildVcard, buildWhatsapp, buildWifi } from "../src/lib/payloads";

const values = (text: string) =>
  Object.fromEntries(parseCode(text).fields.map(({ label, value }) => [label, value]));

describe("UPI", () => {
  it("reads back what the builder writes", () => {
    const text = buildUpi({
      payee: "shop@okaxis",
      name: "राम & Sons",
      amount: "1250.5",
      note: "Bill 7 = paid?",
    });
    expect(parseUpi(text)).toEqual({
      payee: "shop@okaxis",
      name: "राम & Sons",
      amount: "1250.50",
      currency: "INR",
      note: "Bill 7 = paid?",
    });
  });

  it("shows payee and amount", () => {
    const parsed = parseCode("upi://pay?pa=a%40ybl&pn=Asha+Rao&am=125000&cu=INR");
    expect(parsed.kind).toBe("upi");
    expect(values("upi://pay?pa=a%40ybl&pn=Asha+Rao&am=125000&cu=INR")).toEqual({
      "Pay to": "Asha Rao",
      "UPI ID": "a@ybl",
      Amount: "₹1,25,000",
    });
    expect(values("UPI://pay?pa=a@ybl&pn=A").Amount).toMatch(/Not set/);
  });

  it("formats rupees the Indian way", () => {
    expect(formatRupees("1234567.5")).toBe("₹12,34,567.50");
    expect(formatRupees("99")).toBe("₹99");
    expect(formatRupees("x")).toBe("x");
  });

  it("is lenient with broken encoding", () => {
    expect(queryParams("upi://pay?pa=a@b&pn=100%&x").get("pn")).toBe("100%");
    expect(queryParams("no-query").size).toBe(0);
  });
});

describe("Wi-Fi", () => {
  it("round-trips escaped values", () => {
    const network = { ssid: 'My;Net,"5G":\\', password: "p;a:s,s\\word", hidden: true };
    const text = buildWifi({ ...network, security: "WPA" });
    expect(parseWifi(text)).toEqual({ ...network, security: "WPA" });
  });

  it("shows network and password", () => {
    expect(values("WIFI:S:Cafe;T:WPA;P:secret123;;")).toEqual({
      Network: "Cafe",
      Password: "secret123",
      Security: "WPA/WPA2/WPA3",
    });
    expect(values("WIFI:T:nopass;S:Open;;")).toEqual({
      Network: "Open",
      Security: "None",
    });
    expect(parseCode("wifi:S:x;;").kind).toBe("wifi");
  });
});

describe("vCard", () => {
  it("round-trips a contact", () => {
    const text = buildVcard({
      firstName: "Asha",
      lastName: "Rao",
      phone: "+91 98765 43210",
      email: "asha@example.com",
      company: "Rao; Sons",
      website: "https://example.com",
      street: "12, MG Road",
      city: "Pune",
      region: "",
      postcode: "411001",
      country: "India",
    });
    expect(parseVcard(text)).toEqual({
      name: "Asha Rao",
      phones: ["+919876543210"],
      emails: ["asha@example.com"],
      company: "Rao; Sons",
      website: "https://example.com",
      address: "12, MG Road, Pune, 411001, India",
    });
    const parsed = parseCode(text);
    expect(parsed.kind).toBe("contact");
    expect(parsed.fields.find((f) => f.label === "Website")?.link).toBe(
      "https://example.com",
    );
  });

  it("unfolds long lines and falls back to N", () => {
    expect(
      parseVcard("BEGIN:VCARD\nVERSION:2.1\nN:Rao;Asha\nNOTE:lo\n ng\nEND:VCARD")?.name,
    ).toBe("Asha Rao");
  });
});

describe("other content", () => {
  it("recognises links without opening them", () => {
    const parsed = parseCode("https://solvey.in/tools?a=1");
    expect(parsed.kind).toBe("url");
    expect(parsed.fields[0].link).toBe("https://solvey.in/tools?a=1");
    expect(parseCode("javascript:alert(1)").kind).toBe("text");
    expect(parseCode("javascript:alert(1)").fields).toEqual([]);
  });

  it("recognises WhatsApp links", () => {
    const link = buildWhatsapp("9876543210", "Hello & welcome");
    expect(parseCode(link).kind).toBe("whatsapp");
    expect(values(link)).toMatchObject({
      Number: "+919876543210",
      Message: "Hello & welcome",
    });
    expect(values("https://api.whatsapp.com/send?phone=447700900123").Number).toBe(
      "+447700900123",
    );
  });

  it("recognises email, phone, SMS and locations", () => {
    expect(values("mailto:a@b.co?subject=Hi%20there&body=x")).toEqual({
      To: "a@b.co",
      Subject: "Hi there",
      Message: "x",
    });
    expect(values("MATMSG:TO:a@b.co;SUB:Hi;BODY:Yes\\; ok;;")).toEqual({
      To: "a@b.co",
      Subject: "Hi",
      Message: "Yes; ok",
    });
    expect(values("tel:+919876543210")).toEqual({ Number: "+919876543210" });
    expect(values("SMSTO:+9198:See you at 5:30")).toEqual({
      Number: "+9198",
      Message: "See you at 5:30",
    });
    expect(values("sms:+9198?body=Hi%20there")).toEqual({
      Number: "+9198",
      Message: "Hi there",
    });
    const geo = parseCode("geo:28.6129,77.2295");
    expect(geo.kind).toBe("location");
    expect(geo.fields[2].link).toContain("openstreetmap.org/?mlat=28.6129&mlon=77.2295");
  });

  it("treats anything else as text", () => {
    expect(parseCode("Hello\nworld").kind).toBe("text");
  });
});
