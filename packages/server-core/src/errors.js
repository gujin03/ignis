// The safe shape for an unexpected server error returned to the client.
// Exposes the error code (a coarse identifier such as a Node errno) but never the message, which can carry absolute paths or subprocess output.

function sanitizeError(e) {
  const code = e == null ? undefined : e.code;
  return { error: code || "internal", code };
}

module.exports = { sanitizeError };
