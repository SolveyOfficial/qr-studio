# Solvey QR Studio

Free QR code maker and scanner that runs entirely in your browser.

Live: https://solveyofficial.github.io/qr-studio/

- **Create**: QR codes for UPI payments (UPI ID, payee name, optional amount
  in ₹ and note), website links, text, Wi-Fi networks, contact cards (vCard),
  email, phone calls, text messages (SMS), WhatsApp chats and map locations
- **Design**: code and background colours with a contrast warning, square,
  rounded or dot styles, rounded or circular corners, error correction level,
  margin, a logo in the middle (error correction is raised to High
  automatically) and a caption under the code, such as your shop name and
  "Pay with UPI"
- **Download**: PNG up to 2048 × 2048 px, SVG, copy the image, or a sign to
  print on A4 or A6 (PDF)
- **Scan**: read codes with your camera (choose the camera, torch where
  available) or from a picture; see who a UPI payment goes to and how much,
  the name and password of a Wi-Fi network, contact details and more, each
  with a copy button. Links are shown, never opened for you.

## Private by design

Your details, pictures and camera feed never leave your device. Nothing is
stored, unless you tick "Remember my UPI details on this device", which keeps
your UPI ID and name in this browser only. The app has no analytics or
tracking, and it serves its own fonts and QR reader, so it loads nothing from
other sites.

Built with [uqr](https://github.com/unjs/uqr),
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (ZXing-C++) and
[pdf-lib](https://pdf-lib.js.org). Where the browser has its own QR reader
(BarcodeDetector), it is used first.

## Development

You need Node.js 22.13 or later.

```sh
npm install
npm run dev        # development server
npm run lint       # Prettier and ESLint
npm run typecheck  # TypeScript
npm test           # unit tests
npm run build      # production build in dist/
```

Set `BASE_PATH` (for example `BASE_PATH=/qr-studio/`) when the app is served
from a sub-path. The build copies the ZXing WebAssembly reader into
`public/zxing/`, and writes `THIRD_PARTY_NOTICES.md`, listing every bundled
package, font and WebAssembly build with its licence; the app links to it as
"Licences".

When the repository is public, every push to `main` is published to GitHub
Pages.

## Licence

MIT, see LICENSE.
