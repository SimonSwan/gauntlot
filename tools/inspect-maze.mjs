import fs from "node:fs";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";
const file = process.argv[2];
const png = await new Promise((resolve) =>
  fs.createReadStream(file).pipe(new PNG()).on("parsed", function() { resolve(this); })
);
const STAMP = 16, BORDER = 16;
function stat(x, y) {
  let r=0,g=0,b=0,n=0;
  for (let yy=y; yy<y+STAMP; yy++) for (let xx=x; xx<x+STAMP; xx++) {
    const i=(yy*png.width+xx)<<2;
    r+=png.data[i]; g+=png.data[i+1]; b+=png.data[i+2]; n++;
  }
  r/=n; g/=n; b/=n;
  let v=0;
  for (let yy=y; yy<y+STAMP; yy++) for (let xx=x; xx<x+STAMP; xx++) {
    const i=(yy*png.width+xx)<<2;
    v += (png.data[i]-r)**2 + (png.data[i+1]-g)**2 + (png.data[i+2]-b)**2;
  }
  return { r:r|0, g:g|0, b:b|0, lum:((r+g+b)/3)|0, var:(v/n)|0 };
}
console.log(file);
console.log("HEADER (top wall row):", JSON.stringify(stat(BORDER+5*STAMP, BORDER)));
console.log("CENTER:", JSON.stringify(stat(BORDER+15*STAMP, BORDER+15*STAMP)));
for (let ty=0; ty<32; ty+=4) {
  let row = "";
  for (let tx=0; tx<32; tx+=4) {
    const s = stat(BORDER+tx*STAMP, BORDER+ty*STAMP);
    row += `${s.lum},${s.var}`.padEnd(10);
  }
  console.log(row);
}
