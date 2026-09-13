// react-webcam hands back a canvas snapshot as a data URL, but the OCR
// pipeline takes a File. Pure and DOM-free so auth.check.mjs can exercise it.

export function dataUrlToFile(dataUrl: string, name = "snap.jpg"): File {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  if (!dataUrl.startsWith("data:") || comma === -1 || !header.includes(";base64")) {
    throw new Error("Not a base64 data URL");
  }
  const type = header.slice(5, header.indexOf(";"));
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type });
}
