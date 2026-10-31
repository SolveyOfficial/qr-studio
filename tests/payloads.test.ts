import { describe, expect, it } from "vitest";

import { UserError } from "../src/lib/errors";
import {
  buildEmail,
  buildLocation,
  buildPhone,
  buildSms,
  buildText,
  buildUpi,
  buildUrl,
  buildVcard,
  buildWhatsapp,
  buildWifi,
  cleanPhone,
  escapeVcard,
  escapeWifi,
  isUpiId,
  normaliseAmount,
  whatsappNumber,
} from "../src/lib/payloads";

const contact = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  company: "",
  website: "",
  street: "",
  city: "",
  region: "",
  postcode: "",
  country: "",
};

describe("UPI", () => {
  it("builds a payment link with all fields", () => {
    expect(
      buildUpi({
        payee: "sharmastore@okicici",
        name: "Sharma General Store",
        amount: "250",
        note: "Order #12 & more",
      }),
    ).toBe(
      "upi://pay?pa=sharmastore@okicici&pn=Sharma%20General%20Store&am=250.00&cu=INR&tn=Order%20%2312%20%26%20more",
    );
  });

  it("leaves out the amount and note when empty", () => {
    expect(
      buildUpi({ payee: " a.b-c_d@ybl ", name: "Asha", amount: "", note: " " }),
    ).toBe("upi://pay?pa=a.b-c_d@ybl&pn=Asha&cu=INR");
  });

  it("encodes non-English names as UTF-8", () => {
    expect(buildUpi({ payee: "ram@sbi", name: "राम + श्याम" })).toBe(
      "upi://pay?pa=ram@sbi&pn=%E0%A4%B0%E0%A4%BE%E0%A4%AE%20%2B%20%E0%A4%B6%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%AE&cu=INR",
    );
  });

  it("checks UPI IDs", () => {
    for (const id of ["name@bank", "98765.43210@paytm", "shop-1_a@okhdfcbank"]) {
      expect(isUpiId(id)).toBe(true);
    }
    for (const id of [
      "name",
      "@bank",
      "name@",
      "na me@bank",
      "name@1bank",
      "a@b@c",
      "x@b",
    ]) {
      expect(isUpiId(id)).toBe(false);
    }
    expect(() => buildUpi({ payee: "nobank", name: "A" })).toThrow(UserError);
    expect(() => buildUpi({ payee: "", name: "A" })).toThrow(/UPI ID/);
    expect(() => buildUpi({ payee: "ab@ybl", name: " " })).toThrow(/payee name/);
  });

  it("checks amounts", () => {
    expect(normaliseAmount("")).toBe("");
    expect(normaliseAmount("99.5")).toBe("99.50");
    expect(normaliseAmount("1,250")).toBe("1250.00");
    expect(normaliseAmount(" 10 ")).toBe("10.00");
    for (const bad of ["abc", "-5", "0", "1.234", "1e3", "600000"]) {
      expect(() => normaliseAmount(bad)).toThrow(UserError);
    }
  });
});

describe("Wi-Fi", () => {
  it("escapes special characters", () => {
    expect(escapeWifi(`a\\b;c,d:e"f`)).toBe(`a\\\\b\\;c\\,d\\:e\\"f`);
    expect(escapeWifi("plain")).toBe("plain");
  });

  it("builds WPA, WEP, open and hidden networks", () => {
    expect(
      buildWifi({
        ssid: "Home;Net",
        password: 'pa:ss,"word"',
        security: "WPA",
        hidden: false,
      }),
    ).toBe('WIFI:T:WPA;S:Home\\;Net;P:pa\\:ss\\,\\"word\\";;');
    expect(
      buildWifi({ ssid: "Old", password: "12345", security: "WEP", hidden: true }),
    ).toBe("WIFI:T:WEP;S:Old;P:12345;H:true;;");
    expect(
      buildWifi({ ssid: "Cafe", password: "ignored", security: "nopass", hidden: false }),
    ).toBe("WIFI:T:nopass;S:Cafe;;");
  });

  it("requires a name and a long enough password", () => {
    expect(() =>
      buildWifi({ ssid: "", password: "", security: "nopass", hidden: false }),
    ).toThrow(UserError);
    expect(() =>
      buildWifi({ ssid: "A", password: "", security: "WPA", hidden: false }),
    ).toThrow(/password/);
    expect(() =>
      buildWifi({ ssid: "A", password: "short", security: "WPA", hidden: false }),
    ).toThrow(/8 characters/);
  });
});

describe("vCard", () => {
  it("escapes text values", () => {
    expect(escapeVcard("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("builds a full contact card with CRLF line endings", () => {
    expect(
      buildVcard({
        firstName: "Asha",
        lastName: "Rao",
        phone: "+91 98765-43210",
        email: "asha@example.com",
        company: "Rao, Sons & Co",
        website: "https://example.com",
        street: "12 MG Road; 2nd floor",
        city: "Bengaluru",
        region: "Karnataka",
        postcode: "560001",
        country: "India",
      }),
    ).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "N:Rao;Asha;;;",
        "FN:Asha Rao",
        "ORG:Rao\\, Sons & Co",
        "TEL;TYPE=CELL:+919876543210",
        "EMAIL:asha@example.com",
        "URL:https://example.com",
        "ADR:;;12 MG Road\\; 2nd floor;Bengaluru;Karnataka;560001;India",
        "END:VCARD",
      ].join("\r\n"),
    );
  });

  it("uses the company as the name when there is no person", () => {
    expect(buildVcard({ ...contact, company: "Solvey" })).toBe(
      "BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:Solvey\r\nORG:Solvey\r\nEND:VCARD",
    );
  });

  it("requires a name and a valid email", () => {
    expect(() => buildVcard(contact)).toThrow(UserError);
    expect(() => buildVcard({ ...contact, firstName: "A", email: "nope" })).toThrow(
      /email/,
    );
  });
});

describe("WhatsApp", () => {
  it("adds +91 to Indian numbers", () => {
    for (const input of [
      "9876543210",
      "98765 43210",
      "+91 98765 43210",
      "+91-98765-43210",
      "09876543210",
      "919876543210",
      "0091 98765 43210",
      "(+91) 98765.43210",
    ]) {
      expect(whatsappNumber(input)).toBe("919876543210");
    }
  });

  it("keeps other country codes", () => {
    expect(whatsappNumber("+44 7700 900123")).toBe("447700900123");
    expect(whatsappNumber("+1 (415) 555-0100")).toBe("14155550100");
  });

  it("rejects numbers that can't be right", () => {
    for (const bad of ["", "12345", "abc", "+91 12345 67890", "+91 98765 4321", "0123"]) {
      expect(() => whatsappNumber(bad)).toThrow(UserError);
    }
  });

  it("builds wa.me links", () => {
    expect(buildWhatsapp("098765 43210", "Hi! Is the shop open? 10% off & more")).toBe(
      "https://wa.me/919876543210?text=Hi!%20Is%20the%20shop%20open%3F%2010%25%20off%20%26%20more",
    );
    expect(buildWhatsapp("9876543210", "  ")).toBe("https://wa.me/919876543210");
  });
});

describe("other content", () => {
  it("adds https:// to website addresses", () => {
    expect(buildUrl("solvey.in")).toBe("https://solvey.in");
    expect(buildUrl(" http://example.com/a?b=c ")).toBe("http://example.com/a?b=c");
    expect(() => buildUrl("")).toThrow(UserError);
    expect(() => buildUrl("javascript:alert(1)")).toThrow(UserError);
    expect(() => buildUrl("localhost")).toThrow(UserError);
  });

  it("keeps text as typed", () => {
    expect(buildText("  line 1\nline 2 ")).toBe("  line 1\nline 2 ");
    expect(() => buildText("   ")).toThrow(UserError);
  });

  it("builds email links", () => {
    expect(buildEmail("a@b.co", "Hello there", "Line 1\nLine 2")).toBe(
      "mailto:a@b.co?subject=Hello%20there&body=Line%201%0ALine%202",
    );
    expect(buildEmail("a@b.co", "", "")).toBe("mailto:a@b.co");
    expect(() => buildEmail("ab.co", "", "")).toThrow(UserError);
  });

  it("builds phone and SMS codes", () => {
    expect(cleanPhone(" +91 (98765) 43-210 ")).toBe("+919876543210");
    expect(buildPhone("+91 98765 43210")).toBe("tel:+919876543210");
    expect(buildSms("98765 43210", "On my way: 5 min")).toBe(
      "SMSTO:9876543210:On my way: 5 min",
    );
    expect(() => buildPhone("call me")).toThrow(UserError);
  });

  it("builds geo: locations and checks ranges", () => {
    expect(buildLocation("28.6129", "77.2295")).toBe("geo:28.6129,77.2295");
    expect(buildLocation("-33.8568", "+151.2153")).toBe("geo:-33.8568,151.2153");
    expect(() => buildLocation("91", "0")).toThrow(/latitude/);
    expect(() => buildLocation("0", "181")).toThrow(/longitude/);
    expect(() => buildLocation("", "1")).toThrow(UserError);
  });
});
