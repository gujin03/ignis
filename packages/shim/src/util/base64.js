// Base64 codec for the binary bodies exchanged with the server proxy.

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }

  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

export { arrayBufferToBase64, base64ToArrayBuffer };
