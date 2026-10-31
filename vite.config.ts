import license from "rollup-plugin-license";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // the site is served from a sub-path on GitHub Pages
  base: process.env.BASE_PATH ?? "/",
  build: {
    target: "es2022",
    rollupOptions: {
      plugins: [
        // collect the licences of the bundled packages for
        // scripts/third-party-notices.js
        license({
          thirdParty: {
            includePrivate: false,
            output: {
              file: "node_modules/.cache/third-party-licences.json",
              template: (dependencies) =>
                JSON.stringify(
                  dependencies.map(
                    ({
                      name,
                      version,
                      license: id,
                      licenseText,
                      noticeText,
                      repository,
                    }) => ({
                      name,
                      version,
                      license: id,
                      licenseText,
                      noticeText,
                      repository:
                        typeof repository === "string" ? repository : repository?.url,
                    }),
                  ),
                  null,
                  2,
                ),
            },
          },
        }),
      ],
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
