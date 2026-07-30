/** Serialize an SVG element inside `root` to a PNG download / clipboard. */
export async function shareSvgAsPng(root: HTMLElement | null, filename: string): Promise<"downloaded" | "copied"> {
  if (!root) throw new Error("Nothing to share.");
  const svg = root.querySelector("svg");
  if (!svg) throw new Error("No chart found.");

  const clone = svg.cloneNode(true) as SVGElement;
  const box = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Failed to render chart."));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--color-slate-950") || "#0b1020";
    // Fallback readable dark/light background
    const dark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = dark ? "#0b1020" : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG export failed.");

    if (navigator.clipboard && "ClipboardItem" in window) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return "copied";
      } catch {
        /* fall through to download */
      }
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    return "downloaded";
  } finally {
    URL.revokeObjectURL(url);
  }
}
