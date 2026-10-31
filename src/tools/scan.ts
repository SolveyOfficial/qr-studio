import { UserError } from "../lib/errors";
import { parseCode } from "../lib/parse";
import { decodeFile, decodeImageData, pixels, prepareScanner } from "../lib/scan";
import { copyButton, dropZone, h, runTask, statusArea } from "../ui";

import type { Tool } from "./tool";

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

let stopCamera = () => {};

export const scan: Tool = {
  id: "scan",
  title: "Scan",
  heading: "Scan a QR code",
  description:
    "Read a QR code with your camera or from a picture. You'll see what's inside before anything happens: links are never opened for you.",
  mount(container) {
    prepareScanner();
    const status = statusArea();
    const result = h("div", { class: "scan-result", "aria-live": "polite" });

    const show = (text: string) => {
      const parsed = parseCode(text);
      result.replaceChildren(
        h(
          "div",
          { class: "result-card" },
          h("h3", {}, parsed.title),
          parsed.fields.length > 0 &&
            h(
              "dl",
              { class: "result-fields" },
              ...parsed.fields.flatMap(({ label, value, link }) => [
                h("dt", {}, label),
                h(
                  "dd",
                  {},
                  link
                    ? h(
                        "a",
                        {
                          href: link,
                          target: "_blank",
                          rel: "noopener noreferrer nofollow",
                        },
                        value,
                      )
                    : h("span", { class: "result-value" }, value),
                  copyButton(() => link ?? value, "Copy", `Copy ${label.toLowerCase()}`),
                ),
              ]),
            ),
          parsed.fields.some((item) => item.link) &&
            h(
              "p",
              { class: "note" },
              "Links open only when you select them. Check the address first.",
            ),
          h(
            "details",
            { class: "payload-box", open: parsed.kind === "text" },
            h("summary", {}, "Full content"),
            h("pre", { class: "payload raw-content" }, text),
            copyButton(() => text, "Copy all", "Copy the full content"),
          ),
        ),
      );
      status.clear();
    };

    // Camera

    const video = h("video", {
      class: "camera__video",
      playsInline: true,
      muted: true,
      autoplay: true,
    });
    video.setAttribute("aria-label", "Camera view");
    const frame = h(
      "div",
      { class: "camera", hidden: true },
      video,
      h("div", { class: "camera__target" }),
    );
    const cameraSelect = h("select", { id: "camera-choice" });
    const cameraField = h(
      "div",
      { class: "field camera-choice", hidden: true },
      h("label", { for: "camera-choice" }, "Camera"),
      cameraSelect,
    );
    const torchButton = h(
      "button",
      { type: "button", hidden: true, "aria-pressed": "false" },
      "Torch on",
    );
    const startButton = h("button", { type: "button", class: "primary" }, "Start camera");
    const stopButton = h("button", { type: "button", hidden: true }, "Stop camera");
    const cameraNote = h(
      "p",
      { class: "note" },
      "Point the camera at a QR code. Nothing is recorded or sent anywhere.",
    );

    let stream: MediaStream | null = null;
    let running = false;
    let torch = false;
    const canvas = document.createElement("canvas");

    stopCamera = () => {
      running = false;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      frame.hidden = true;
      stopButton.hidden = true;
      torchButton.hidden = true;
      startButton.hidden = false;
    };

    const loop = async () => {
      while (running) {
        if (video.readyState >= 2 && video.videoWidth) {
          try {
            const text = await decodeImageData(
              pixels(video, video.videoWidth, video.videoHeight, 1280, canvas),
            );
            if (text !== null && running) {
              stopCamera();
              show(text);
              return;
            }
          } catch (error) {
            console.error(error);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    };

    const listCameras = async (activeId?: string) => {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput",
      );
      cameraSelect.replaceChildren(
        ...devices.map((device, index) =>
          h(
            "option",
            { value: device.deviceId, selected: device.deviceId === activeId },
            device.label || `Camera ${index + 1}`,
          ),
        ),
      );
      cameraField.hidden = devices.length < 2;
    };

    const start = (deviceId?: string) =>
      runTask(status, [startButton], async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new UserError(
            "This browser can't use the camera here. Upload a picture of the code instead.",
          );
        }
        stopCamera();
        status.progress("Starting the camera…");
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: deviceId
              ? { deviceId: { exact: deviceId } }
              : { facingMode: { ideal: "environment" } },
          });
        } catch (error) {
          const name = error instanceof DOMException ? error.name : "";
          throw new UserError(
            name === "NotAllowedError"
              ? "Camera access was blocked. Allow it in your browser's site settings, or upload a picture instead."
              : name === "NotFoundError" || name === "OverconstrainedError"
                ? "No camera was found. Upload a picture of the code instead."
                : "The camera couldn't be started. It may be in use by another app.",
          );
        }
        const track = stream.getVideoTracks()[0];
        video.srcObject = stream;
        frame.hidden = false;
        startButton.hidden = true;
        stopButton.hidden = false;
        await video.play().catch(() => {});
        await listCameras(track.getSettings().deviceId);
        const capabilities = (track.getCapabilities?.() ?? {}) as TorchCapabilities;
        torch = false;
        torchButton.textContent = "Torch on";
        torchButton.setAttribute("aria-pressed", "false");
        torchButton.hidden = !capabilities.torch;
        status.clear();
        running = true;
        void loop();
      });

    startButton.addEventListener("click", () => void start());
    stopButton.addEventListener("click", stopCamera);
    cameraSelect.addEventListener("change", () => void start(cameraSelect.value));
    torchButton.addEventListener("click", async () => {
      const track = stream?.getVideoTracks()[0];
      if (!track) return;
      try {
        await track.applyConstraints({
          advanced: [{ torch: !torch } as MediaTrackConstraintSet],
        });
        torch = !torch;
        torchButton.textContent = torch ? "Torch off" : "Torch on";
        torchButton.setAttribute("aria-pressed", String(torch));
      } catch {
        status.error(new UserError("The torch couldn't be switched on."));
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopCamera();
    });

    // Picture upload

    const drop = dropZone({
      accept: "image/*",
      multiple: false,
      label: "Choose a picture of a QR code",
      hint: "or drop it here: a photo, a screenshot, or a PNG, JPG or SVG file",
      onFiles: ([file]) =>
        runTask(status, [], async () => {
          stopCamera();
          result.replaceChildren();
          status.progress(`Reading ${file.name}…`);
          show(await decodeFile(file));
        }),
    });

    container.append(
      h(
        "div",
        { class: "scan-layout" },
        h(
          "div",
          { class: "scan-inputs" },
          h(
            "section",
            { class: "options", "aria-labelledby": "camera-heading" },
            h("h3", { id: "camera-heading" }, "Use your camera"),
            cameraNote,
            h("div", { class: "actions" }, startButton, stopButton, torchButton),
            cameraField,
            frame,
          ),
          h(
            "section",
            { class: "options", "aria-labelledby": "upload-heading" },
            h("h3", { id: "upload-heading" }, "Or upload a picture"),
            drop.element,
          ),
        ),
        h("div", { class: "scan-output" }, status.element, result),
      ),
    );
  },
  hide() {
    stopCamera();
  },
};
