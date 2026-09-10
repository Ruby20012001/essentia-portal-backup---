/**
 * Turn JPEGs into a single PDF.
 *
 *   node tools/jpg-to-pdf.mjs out.pdf photo1.jpg photo2.jpg
 *   node tools/jpg-to-pdf.mjs out.pdf "C:\path\to\folder"
 *
 * One page per image, full bleed, in the order given.
 *
 * NO LIBRARY, AND NOT OUT OF STUBBORNNESS. A PDF is a text format, and a JPEG
 * goes into one as-is: the file already holds DCT-compressed data, which is
 * exactly what a PDF image stream wants (/Filter /DCTDecode). So this copies
 * the bytes and writes the few hundred characters of structure around them.
 * Nothing is re-encoded, so nothing is lost — the picture in the PDF is the
 * picture that went in, byte for byte, and a hundred renders take a second.
 *
 * The alternative was a dependency that would decode every image to a bitmap
 * and re-encode it, which is slower, larger, and slightly worse-looking, to do
 * a job the format does for free.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

/**
 * A JPEG's size lives in its SOF marker, not its header, so the file has to be
 * walked segment by segment. Every segment is 0xFF, a marker byte, then a
 * two-byte length — except the SOF markers, which carry height and width right
 * after that length. C4, C8 and CC share the range and are not SOFs.
 */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

const LONG_EDGE = 842; // A4's long edge in points, so a page prints sensibly

function pageSize(width, height) {
  const scale = LONG_EDGE / Math.max(width, height);
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

function build(images) {
  // A PDF is a list of numbered objects and a table saying where each one
  // starts. The table has to be exact, so the file is assembled as byte chunks
  // and the offsets are counted as it goes.
  const chunks = [];
  const offsets = [0];
  let length = 0;

  const push = (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1");
    chunks.push(buf);
    length += buf.length;
  };
  const obj = (n, body) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");

  const pageIds = images.map((_, i) => 3 + i * 2);
  obj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  obj(
    2,
    `<< /Type /Pages /Count ${images.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`,
  );

  images.forEach((img, i) => {
    const pageId = 3 + i * 2;
    const imgId = pageId + 1;
    const contentId = 3 + images.length * 2 + i;
    const { w, h } = pageSize(img.width, img.height);

    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );

    offsets[imgId] = length;
    push(`${imgId} 0 obj\n`);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${img.data.length} >>\nstream\n`,
    );
    push(img.data);
    push("\nendstream\nendobj\n");
  });

  images.forEach((img, i) => {
    const contentId = 3 + images.length * 2 + i;
    const { w, h } = pageSize(img.width, img.height);
    // Draw the image across the whole page: scale, then place at the origin.
    const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });

  const total = 3 + images.length * 3;
  const xref = length;
  push(`xref\n0 ${total}\n`);
  push("0000000000 65535 f \n");
  for (let n = 1; n < total; n += 1) {
    push(`${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------

const [out, ...inputs] = process.argv.slice(2);

if (!out || inputs.length === 0) {
  console.log(`
  JPEGs into one PDF — one page per image.

    node tools/jpg-to-pdf.mjs out.pdf photo1.jpg photo2.jpg
    node tools/jpg-to-pdf.mjs out.pdf "C:\\Users\\me\\Desktop\\renders"

  A folder is expanded to every .jpg inside it, in name order.
`);
  process.exit(1);
}

const files = inputs.flatMap((p) => {
  if (statSync(p).isDirectory()) {
    return readdirSync(p)
      .filter((f) => [".jpg", ".jpeg"].includes(extname(f).toLowerCase()))
      .sort()
      .map((f) => join(p, f));
  }
  return [p];
});

const images = [];
for (const file of files) {
  const data = readFileSync(file);
  const size = jpegSize(data);
  if (!size) {
    // Named, not silently dropped: a page missing from a PDF nobody counted is
    // a picture the reader never knows was meant to be there.
    console.log(`  SKIP  ${basename(file)} — not a readable JPEG`);
    continue;
  }
  images.push({ ...size, data });
  console.log(`  ${basename(file).padEnd(46)} ${size.width} x ${size.height}`);
}

if (images.length === 0) {
  console.log("\n  Koi JPEG nahi mili. Kuch nahi likha.\n");
  process.exit(1);
}

writeFileSync(out, build(images));
console.log(
  `\n  Ban gayi: ${out}  —  ${images.length} page, ` +
    `${Math.round(statSync(out).size / 1024)} KB\n`,
);
