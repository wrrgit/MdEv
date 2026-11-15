// 生成最小合法 ICO（32x32, 32bpp, 实色）供 tauri-build 嵌入 Windows 资源。
const fs = require('fs')
const path = require('path')

const W = 32, H = 32
const dir = path.join(__dirname, 'icons')
fs.mkdirSync(dir, { recursive: true })

function buildICO(r, g, b) {
  const pixelBytes = W * H * 4
  const andMaskBytes = Math.ceil(W / 8) * H // 每行按 4 字节对齐：32/8*4=128
  const headerSize = 6 + 16
  const biSize = 40
  const total = headerSize + biSize + pixelBytes + andMaskBytes

  const buf = Buffer.alloc(total)
  let o = 0
  // ICONDIR
  buf.writeUInt16LE(0, o); o += 2      // reserved
  buf.writeUInt16LE(1, o); o += 2      // type = icon
  buf.writeUInt16LE(1, o); o += 2      // count
  // ICONDIRENTRY
  buf.writeUInt8(W, o); o += 1         // width (0 => 256, but 32 ok)
  buf.writeUInt8(H, o); o += 1         // height
  buf.writeUInt8(0, o); o += 1         // colorCount
  buf.writeUInt8(0, o); o += 1         // reserved
  buf.writeUInt16LE(1, o); o += 2      // planes
  buf.writeUInt16LE(32, o); o += 2     // bitCount
  buf.writeUInt32LE(biSize + pixelBytes + andMaskBytes, o); o += 4 // bytesInRes
  buf.writeUInt32LE(headerSize, o); o += 4 // imageOffset
  // BITMAPINFOHEADER
  buf.writeUInt32LE(biSize, o); o += 4
  buf.writeInt32LE(W, o); o += 4
  buf.writeInt32LE(H * 2, o); o += 4   // ICO 高度为实际 2 倍（含 AND mask）
  buf.writeUInt16LE(1, o); o += 2      // planes
  buf.writeUInt16LE(32, o); o += 2     // bitCount
  buf.writeUInt32LE(0, o); o += 4      // compression BI_RGB
  buf.writeUInt32LE(pixelBytes, o); o += 4
  buf.writeInt32LE(0, o); o += 4
  buf.writeInt32LE(0, o); o += 4
  buf.writeUInt32LE(0, o); o += 4
  buf.writeUInt32LE(0, o); o += 4
  // 像素（自下而上 BGRA），实色 + 中心稍亮做区分
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = x - W / 2, cy = y - H / 2
      const d = Math.sqrt(cx * cx + cy * cy)
      const k = d < 8 ? 1.25 : 1.0
      const rr = Math.min(255, Math.round(r * k))
      const gg = Math.min(255, Math.round(g * k))
      const bb = Math.min(255, Math.round(b * k))
      buf.writeUInt8(bb, o); o += 1
      buf.writeUInt8(gg, o); o += 1
      buf.writeUInt8(rr, o); o += 1
      buf.writeUInt8(255, o); o += 1
    }
  }
  // AND mask（全 0）
  buf.fill(0, o, o + andMaskBytes); o += andMaskBytes
  return buf
}

function buildPNG(r, g, b) {
  // 最小有效 PNG（256x256, RGBA, 实色），供后续 tauri build 打包使用
  const Wp = 256, Hp = 256
  function crc32(buf) {
    let c, table = []
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
    let crc = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
    return (crc ^ 0xFFFFFFFF) >>> 0
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
    const t = Buffer.from(type, 'ascii')
    const body = Buffer.concat([t, data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([len, body, crc])
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(Wp, 0); ihdr.writeUInt32BE(Hp, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc((Wp * 4 + 1) * Hp)
  let p = 0
  for (let y = 0; y < Hp; y++) { raw[p++] = 0; for (let x = 0; x < Wp; x++) { raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = 255 } }
  // zlib 压缩（定长 stored blocks，简单可靠）
  const comp = zlibStored(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))])
}

function zlibStored(data) {
  const out = []
  out.push(0x78, 0x01) // zlib header (deflate, stored)
  let i = 0
  while (i < data.length) {
    const len = Math.min(65535, data.length - i)
    out.push(len === 65535 ? 0x00 : 0x01) // BFINAL 仅末块为 1
    out.push(len & 0xFF, (len >> 8) & 0xFF)
    const nlen = (~len) & 0xFFFF
    out.push(nlen & 0xFF, (nlen >> 8) & 0xFF)
    for (let j = 0; j < len; j++) out.push(data[i + j])
    i += len
  }
  // adler32
  let a = 1, b = 0
  for (let k = 0; k < data.length; k++) { a = (a + data[k]) % 65521; b = (b + a) % 65521 }
  out.push((b >> 8) & 0xFF, b & 0xFF, (a >> 8) & 0xFF, a & 0xFF)
  return Buffer.from(out)
}

const ico = buildICO(40, 120, 200)
fs.writeFileSync(path.join(dir, 'icon.ico'), ico)
console.log('icon.ico', ico.length, 'bytes')

try {
  const png = buildPNG(40, 120, 200)
  fs.writeFileSync(path.join(dir, 'icon.png'), png)
  console.log('icon.png', png.length, 'bytes')
} catch (e) {
  console.log('icon.png skipped:', e.message)
}
