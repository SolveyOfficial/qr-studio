import { UserError } from "../lib/errors";
import { download } from "../lib/files";
import { formatRupees } from "../lib/parse";
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
  normaliseAmount,
  type WifiSecurity,
} from "../lib/payloads";
import {
  colourWarning,
  makeMatrix,
  toSvg,
  type CornerStyle,
  type DotStyle,
  type ErrorCorrection,
  type QrDesign,
} from "../lib/qr";
import { canvasToBlob, drawQr, measureText, readLogo } from "../lib/render";
import type { PaperSize } from "../lib/standee";
import { choice, copyButton, field, h, runTask, select, statusArea } from "../ui";

import type { Tool } from "./tool";

type Kind =
  | "upi"
  | "url"
  | "text"
  | "wifi"
  | "contact"
  | "email"
  | "phone"
  | "sms"
  | "whatsapp"
  | "location";

interface ContentForm {
  element: HTMLElement;
  /** The text to encode; throws a UserError while something is missing. */
  build(): string;
  /** Lines printed under the code on the sign. */
  signLines(): string[];
  /** A heading for the sign when there is no caption. */
  signTitle?(): string;
}

const STORAGE_KEY = "solvey-qr-studio:upi";

const storage = {
  read(): { payee: string; name: string } | null {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      return value && typeof value.payee === "string" ? value : null;
    } catch {
      return null;
    }
  },
  write(value: { payee: string; name: string } | null) {
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // storage may be turned off; nothing to do
    }
  },
};

const text = (props: Record<string, unknown> = {}) =>
  h("input", { type: "text", autocomplete: "off", ...props });

const area = (props: Record<string, unknown> = {}) =>
  h("textarea", { rows: 3, ...props }) as HTMLTextAreaElement;

const checkbox = (label: string, checked = false) => {
  const input = h("input", { type: "checkbox", checked });
  return { input, element: h("label", { class: "check" }, input, h("span", {}, label)) };
};

const grid = (...children: HTMLElement[]) =>
  h("div", { class: "form-grid" }, ...children);

const upiForm = (): ContentForm => {
  const saved = storage.read();
  const payee = text({
    placeholder: "shopname@okbank",
    spellcheck: false,
    autocapitalize: "off",
    inputMode: "email",
    value: saved?.payee ?? "",
  });
  const name = text({ placeholder: "Sharma General Store", value: saved?.name ?? "" });
  const amount = text({
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  });
  const note = text({ placeholder: "Order 1024", maxLength: 80 });
  const remember = checkbox("Remember my UPI details on this device", !!saved);
  const sync = () => {
    storage.write(
      remember.input.checked
        ? { payee: payee.value.trim(), name: name.value.trim() }
        : null,
    );
  };
  for (const input of [payee, name, remember.input]) {
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
  }
  return {
    element: h(
      "div",
      { class: "content-form" },
      grid(
        field("UPI ID", payee, "The ID that receives the money, like name@bank."),
        field("Payee name", name),
        field("Amount in ₹ (optional)", amount),
        field("Note (optional)", note),
      ),
      remember.element,
      h(
        "p",
        { class: "note" },
        "Only your UPI ID and name are saved, and only in this browser. Untick to forget them.",
      ),
    ),
    build: () =>
      buildUpi({
        payee: payee.value,
        name: name.value,
        amount: amount.value,
        note: note.value,
      }),
    signLines: () => {
      const value = normaliseAmount(amount.value);
      return [
        "Scan with any UPI app",
        `UPI ID: ${payee.value.trim()}`,
        ...(value ? [`Amount: ${formatRupees(value)}`] : []),
      ];
    },
    signTitle: () => name.value.trim(),
  };
};

const urlForm = (): ContentForm => {
  const url = text({
    type: "url",
    placeholder: "https://solvey.in",
    spellcheck: false,
    autocapitalize: "off",
  });
  return {
    element: h("div", { class: "content-form" }, field("Website address", url)),
    build: () => buildUrl(url.value),
    signLines: () => ["Scan to visit", new URL(buildUrl(url.value)).hostname],
  };
};

const textForm = (): ContentForm => {
  const value = area({ rows: 4, placeholder: "Any text, up to a few hundred words" });
  return {
    element: h("div", { class: "content-form" }, field("Your text", value)),
    build: () => buildText(value.value),
    signLines: () => ["Scan with your phone camera"],
  };
};

const wifiForm = (): ContentForm => {
  const ssid = text({
    placeholder: "Home Wi-Fi",
    spellcheck: false,
    autocapitalize: "off",
  });
  const password = text({ spellcheck: false, autocapitalize: "off" });
  const passwordField = field("Password", password);
  const security = select<WifiSecurity>(
    "Security",
    [
      { value: "WPA", label: "WPA/WPA2/WPA3 (most networks)" },
      { value: "WEP", label: "WEP (old)" },
      { value: "nopass", label: "No password" },
    ],
    "WPA",
    (value) => (passwordField.hidden = value === "nopass"),
  );
  const hidden = checkbox("Hidden network");
  return {
    element: h(
      "div",
      { class: "content-form" },
      grid(field("Network name (SSID)", ssid), passwordField, security.element),
      hidden.element,
    ),
    build: () =>
      buildWifi({
        ssid: ssid.value,
        password: password.value,
        security: security.value,
        hidden: hidden.input.checked,
      }),
    signLines: () => ["Scan to join the Wi-Fi", `Network: ${ssid.value}`],
  };
};

const contactForm = (): ContentForm => {
  const inputs = {
    firstName: text({ autocomplete: "given-name" }),
    lastName: text({ autocomplete: "family-name" }),
    phone: text({ type: "tel", placeholder: "+91 98765 43210", autocomplete: "tel" }),
    email: text({ type: "email", autocomplete: "email", spellcheck: false }),
    company: text({ autocomplete: "organization" }),
    website: text({ type: "url", spellcheck: false, autocapitalize: "off" }),
    street: text({ autocomplete: "street-address" }),
    city: text({ autocomplete: "address-level2" }),
    region: text({ autocomplete: "address-level1" }),
    postcode: text({ autocomplete: "postal-code", inputMode: "numeric" }),
    country: text({ autocomplete: "country-name", placeholder: "India" }),
  };
  const values = () =>
    Object.fromEntries(
      Object.entries(inputs).map(([key, input]) => [key, input.value]),
    ) as Record<keyof typeof inputs, string>;
  return {
    element: h(
      "div",
      { class: "content-form" },
      grid(
        field("First name", inputs.firstName),
        field("Last name", inputs.lastName),
        field("Mobile number", inputs.phone),
        field("Email address", inputs.email),
        field("Company", inputs.company),
        field("Website address", inputs.website),
        field("Street address", inputs.street),
        field("City", inputs.city),
        field("State", inputs.region),
        field("PIN code", inputs.postcode),
        field("Country", inputs.country),
      ),
    ),
    build: () => buildVcard(values()),
    signLines: () => ["Scan to save the contact"],
  };
};

const emailForm = (): ContentForm => {
  const to = text({ type: "email", placeholder: "hello@example.com", spellcheck: false });
  const subject = text();
  const body = area();
  return {
    element: h(
      "div",
      { class: "content-form" },
      grid(field("Send to", to), field("Subject (optional)", subject)),
      field("Message (optional)", body),
    ),
    build: () => buildEmail(to.value, subject.value, body.value),
    signLines: () => ["Scan to send an email", to.value.trim()],
  };
};

const phoneForm = (): ContentForm => {
  const number = text({ type: "tel", placeholder: "+91 98765 43210" });
  return {
    element: h(
      "div",
      { class: "content-form" },
      field("Phone number", number, "Include the country code for calls from abroad."),
    ),
    build: () => buildPhone(number.value),
    signLines: () => ["Scan to call", number.value.trim()],
  };
};

const smsForm = (): ContentForm => {
  const number = text({ type: "tel", placeholder: "+91 98765 43210" });
  const message = area();
  return {
    element: h(
      "div",
      { class: "content-form" },
      field("Phone number", number),
      field("Message", message),
    ),
    build: () => buildSms(number.value, message.value),
    signLines: () => ["Scan to send a text message"],
  };
};

const whatsappForm = (): ContentForm => {
  const number = text({ type: "tel", placeholder: "98765 43210" });
  const message = area({ placeholder: "Hi! I'd like to order…" });
  return {
    element: h(
      "div",
      { class: "content-form" },
      field(
        "WhatsApp number",
        number,
        "Indian numbers work with or without +91 or a leading 0.",
      ),
      field("Message (optional)", message),
    ),
    build: () => buildWhatsapp(number.value, message.value),
    signLines: () => ["Scan to chat on WhatsApp"],
  };
};

const locationForm = (): ContentForm => {
  const latitude = text({ placeholder: "28.6129", inputMode: "decimal" });
  const longitude = text({ placeholder: "77.2295", inputMode: "decimal" });
  return {
    element: h(
      "div",
      { class: "content-form" },
      grid(field("Latitude", latitude), field("Longitude", longitude)),
      h(
        "p",
        { class: "note" },
        "Tip: in most map apps, press and hold a place to see its latitude and longitude.",
      ),
    ),
    build: () => buildLocation(latitude.value, longitude.value),
    signLines: () => ["Scan to open the location in your maps app"],
  };
};

const kinds: { value: Kind; label: string; form: () => ContentForm }[] = [
  { value: "upi", label: "UPI payment", form: upiForm },
  { value: "url", label: "Website", form: urlForm },
  { value: "text", label: "Text", form: textForm },
  { value: "wifi", label: "Wi-Fi", form: wifiForm },
  { value: "contact", label: "Contact card", form: contactForm },
  { value: "email", label: "Email", form: emailForm },
  { value: "phone", label: "Phone", form: phoneForm },
  { value: "sms", label: "SMS", form: smsForm },
  { value: "whatsapp", label: "WhatsApp", form: whatsappForm },
  { value: "location", label: "Location", form: locationForm },
];

export const create: Tool = {
  id: "create",
  title: "Create",
  heading: "Create a QR code",
  description:
    "Make QR codes for UPI payments, websites, Wi-Fi, contact cards and more. Choose your colours, add a logo and a caption, then download a PNG, an SVG or a sign to print.",
  mount(container) {
    const forms = new Map<Kind, ContentForm>();
    let kind: Kind = "upi";
    let payload = "";
    let logo = "";
    const status = statusArea();

    const formHolder = h("div", { class: "form-holder" });
    const showForm = () => {
      let form = forms.get(kind);
      if (!form) {
        form = kinds.find((item) => item.value === kind)!.form();
        forms.set(kind, form);
      }
      formHolder.replaceChildren(form.element);
      upiHint.hidden = kind !== "upi";
      schedule();
    };
    const kindChoice = choice<Kind>(
      "qr-kind",
      "What should the code contain?",
      kinds.map(({ value, label }) => ({ value, label })),
      kind,
      (value) => {
        kind = value;
        showForm();
      },
    );
    kindChoice.element.classList.add("choice--compact");

    // Design

    const foreground = h("input", { type: "color", value: "#000000" });
    const background = h("input", { type: "color", value: "#ffffff" });
    const contrast = h("p", { class: "warning", role: "status" });
    const dots = select<DotStyle>(
      "Dots",
      [
        { value: "square", label: "Square" },
        { value: "rounded", label: "Rounded" },
        { value: "dots", label: "Dots" },
      ],
      "square",
      () => schedule(),
    );
    const corners = select<CornerStyle>(
      "Corners",
      [
        { value: "square", label: "Square" },
        { value: "rounded", label: "Rounded" },
        { value: "circle", label: "Circle" },
      ],
      "square",
      () => schedule(),
    );
    const levels: { value: ErrorCorrection; label: string }[] = [
      { value: "L", label: "Low (7%): smallest code" },
      { value: "M", label: "Medium (15%)" },
      { value: "Q", label: "Quartile (25%)" },
      { value: "H", label: "High (30%): survives damage" },
    ];
    const correction = select<ErrorCorrection>("Error correction", levels, "M", () =>
      schedule(),
    );
    const correctionHint = h("small", { class: "field-note" });
    let levelBeforeLogo: ErrorCorrection = "M";
    correction.element.append(correctionHint);
    const margin = h("input", {
      type: "number",
      min: 0,
      max: 10,
      step: 1,
      value: 4,
      inputMode: "numeric",
    });

    const logoInput = h("input", {
      type: "file",
      accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
      class: "visually-hidden",
      tabindex: -1,
      "aria-hidden": "true",
    });
    const logoName = h("span", { class: "logo-name" }, "No logo");
    const removeLogo = h(
      "button",
      {
        type: "button",
        hidden: true,
        on: {
          click: () => {
            logo = "";
            logoName.textContent = "No logo";
            removeLogo.hidden = true;
            correction.input.disabled = false;
            correction.value = levelBeforeLogo;
            correctionHint.textContent = "";
            schedule();
          },
        },
      },
      "Remove logo",
    );
    logoInput.addEventListener("change", async () => {
      const file = logoInput.files?.[0];
      logoInput.value = "";
      if (!file) return;
      try {
        logo = await readLogo(file);
        logoName.textContent = file.name;
        removeLogo.hidden = false;
        if (!correction.input.disabled) {
          levelBeforeLogo = correction.value;
        }
        correction.value = "H";
        correction.input.disabled = true;
        correctionHint.textContent =
          "Set to High while a logo is used, so the code still scans.";
        schedule();
      } catch (error) {
        status.error(error);
      }
    });
    const logoButton = h(
      "button",
      { type: "button", on: { click: () => logoInput.click() } },
      "Add a logo",
    );

    const caption = text({ placeholder: "Sharma General Store", maxLength: 60 });
    const subcaption = text({ placeholder: "Pay with UPI", maxLength: 80 });

    const design = (): QrDesign => ({
      foreground: foreground.value,
      background: background.value,
      dots: dots.value,
      corners: corners.value,
      errorCorrection: logo ? "H" : correction.value,
      margin: Math.min(10, Math.max(0, Math.round(Number(margin.value) || 0))),
      logo: logo || undefined,
      caption: caption.value,
      subcaption: subcaption.value,
    });

    const designPanel = h(
      "details",
      { class: "options design", open: true },
      h("summary", {}, "Design"),
      h(
        "div",
        { class: "form-grid" },
        field("Code colour", foreground),
        field("Background", background),
        dots.element,
        corners.element,
        correction.element,
        field("Margin (in dots)", margin, "4 is recommended; some scanners need it."),
      ),
      contrast,
      h(
        "div",
        { class: "logo-row" },
        h("span", { class: "logo-label" }, "Centre logo"),
        logoName,
        logoButton,
        removeLogo,
        logoInput,
      ),
      h(
        "div",
        { class: "form-grid" },
        field(
          "Caption (optional)",
          caption,
          "Shown under the code, e.g. your shop name.",
        ),
        field("Second line (optional)", subcaption),
      ),
    );

    // Preview and downloads

    const preview = h("div", { class: "preview", "aria-live": "polite" });
    const previewNote = h("p", { class: "preview__note" });
    const upiHint = h("p", { class: "upi-hint" }, "Scan with any UPI app");
    const payloadText = h("code", { class: "payload" });
    const payloadBox = h(
      "details",
      { class: "payload-box" },
      h("summary", {}, "Text in the code"),
      payloadText,
      copyButton(() => payload, "Copy text", "Copy the text in the code"),
    );
    const pngSize = select(
      "PNG size",
      [
        { value: "256", label: "256 × 256 px" },
        { value: "512", label: "512 × 512 px" },
        { value: "1024", label: "1024 × 1024 px" },
        { value: "2048", label: "2048 × 2048 px" },
      ],
      "1024",
    );
    const paper = select<PaperSize>(
      "Sign size",
      [
        { value: "A4", label: "A4 (210 × 297 mm)" },
        { value: "A6", label: "A6 (105 × 148 mm), table standee" },
      ],
      "A4",
    );
    const fileName = (extension: string) => `qr-${kind}.${extension}`;

    const pngButton = h(
      "button",
      { type: "button", class: "primary", on: { click: () => void savePng() } },
      "Download PNG",
    );
    const svgButton = h(
      "button",
      { type: "button", on: { click: () => void saveSvg() } },
      "Download SVG",
    );
    const copyImageButton = h(
      "button",
      { type: "button", on: { click: () => void copyImage() } },
      "Copy image",
    );
    const pdfButton = h(
      "button",
      { type: "button", on: { click: () => void savePdf() } },
      "Download sign (PDF)",
    );
    const buttons = [pngButton, svgButton, copyImageButton, pdfButton];

    const current = () => {
      if (!payload) {
        throw new UserError(previewNote.textContent || "Fill in the details first.");
      }
      const options = design();
      return { options, matrix: makeMatrix(payload, options.errorCorrection) };
    };

    const savePng = () =>
      runTask(status, buttons, async () => {
        const { matrix, options } = current();
        const canvas = await drawQr(matrix, options, Number(pngSize.value));
        download(await canvasToBlob(canvas), fileName("png"), "image/png");
        status.message(
          h("p", {}, `Saved ${fileName("png")} (${canvas.width} × ${canvas.height} px).`),
        );
      });

    const saveSvg = () =>
      runTask(status, buttons, async () => {
        const { matrix, options } = current();
        await document.fonts?.ready;
        const svg = toSvg(matrix, options, 1024, measureText);
        download(svg, fileName("svg"), "image/svg+xml");
        status.message(h("p", {}, `Saved ${fileName("svg")}.`));
      });

    const copyImage = () =>
      runTask(status, buttons, async () => {
        const { matrix, options } = current();
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
          throw new UserError(
            "This browser can't copy images. Download the PNG instead.",
          );
        }
        const canvas = await drawQr(matrix, options, Number(pngSize.value));
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": canvasToBlob(canvas) }),
          ]);
        } catch {
          throw new UserError(
            "The browser didn't allow copying. Download the PNG instead.",
          );
        }
        status.message(h("p", {}, "Copied the image. Paste it into a chat or document."));
      });

    const savePdf = () =>
      runTask(status, buttons, async () => {
        const { matrix, options } = current();
        status.progress("Preparing the sign…");
        const { drawStandee, standeePdf } = await import("../lib/standee");
        const form = forms.get(kind)!;
        const canvas = await drawStandee(matrix, options, {
          title: options.caption?.trim() || form.signTitle?.() || "",
          subtitle: options.subcaption?.trim() ?? "",
          footer: form.signLines().filter(Boolean),
        });
        const bytes = await standeePdf(canvas, paper.value);
        const name = `qr-${kind}-sign-${paper.value.toLowerCase()}.pdf`;
        download(bytes, name, "application/pdf");
        status.message(h("p", {}, `Saved ${name}. Print it at 100% (actual size).`));
      });

    let timer = 0;
    const update = () => {
      contrast.textContent = colourWarning(foreground.value, background.value);
      contrast.hidden = !contrast.textContent;
      const form = forms.get(kind);
      try {
        payload = form ? form.build() : "";
        const options = design();
        const matrix = makeMatrix(payload, options.errorCorrection);
        preview.innerHTML = toSvg(matrix, options, 480, measureText);
        const svg = preview.querySelector("svg")!;
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "QR code preview");
        previewNote.textContent = "";
        payloadText.textContent = payload;
        payloadBox.hidden = false;
      } catch (error) {
        payload = "";
        preview.replaceChildren(h("div", { class: "preview__empty" }, "QR"));
        previewNote.textContent =
          error instanceof UserError
            ? error.message
            : "Something went wrong drawing the code.";
        if (!(error instanceof UserError)) console.error(error);
        payloadBox.hidden = true;
      }
      for (const button of buttons) button.disabled = !payload;
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(update, 120);
    };
    for (const event of ["input", "change"]) {
      container.addEventListener(event, (e) => {
        if (e.target !== logoInput) schedule();
      });
    }

    const output = h(
      "div",
      { class: "output" },
      h("div", { class: "preview-card" }, preview, upiHint, previewNote),
      h(
        "div",
        { class: "options" },
        h("div", { class: "options--inline" }, pngSize.element),
        h("div", { class: "actions" }, pngButton, svgButton, copyImageButton),
        h("div", { class: "options--inline" }, paper.element, pdfButton),
        status.element,
        payloadBox,
      ),
    );

    container.append(
      h(
        "div",
        { class: "studio" },
        h("div", { class: "options content-box" }, kindChoice.element, formHolder),
        output,
        designPanel,
      ),
    );
    showForm();
    update();
  },
};
