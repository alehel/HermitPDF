/**
 * True when this build is the self-hosted distribution (the Docker image).
 *
 * Read at build time: the pages that use it are statically prerendered, so
 * the value is baked into the build output. The Dockerfile sets the variable
 * for image builds; the regular `next build` used for hermitpdf.com leaves
 * it unset. Self-hosters get a trimmed UI (no marketing hero on the home
 * page — the header logo already says what the app is).
 */
export const isSelfHostedBuild = process.env.HERMITPDF_SELF_HOSTED === "1";
