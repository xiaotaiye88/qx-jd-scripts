var fs = require("fs");
var up = fs.readFileSync(".upstream/jd_joypark_task.js", "utf8");

// Get the H15mSqN function and charset - properly handle \" in the string
var h15Pos = up.indexOf("function H15mSqN");
var varDeclStart = up.indexOf("var xUS_Mvm=\"", h15Pos);
console.log("varDeclStart:", varDeclStart);

// Find the end of the string - need to handle escaped quotes
var qStart = varDeclStart + 13; // skip past 'var xUS_Mvm="'
var i = qStart;
var chars = [];
while (i < up.length) {
  var ch = up[i];
  if (ch === "\\") {
    chars.push(up[i+1]); // add the escaped char
    i += 2;
  } else if (ch === '"') {
    break; // end of string
  } else {
    chars.push(ch);
    i++;
  }
}
var charset = chars.join("");
console.log("Charset:", charset);
console.log("Charset length:", charset.length);
console.log("Charset chars:", charset.split("").map(function(c,i){return i+":"+c}).join(" "));

// H15mSqN decoder
function H15mSqN(str) {
  str = "" + (str || "");
  var out = [];
  var bits = 0;
  var width = 0;
  var carry = -1;
  for (var idx = 0; idx < str.length; idx++) {
    var cidx = charset.indexOf(str[idx]);
    if (cidx === -1) continue;
    if (carry < 0) { carry = cidx; continue; }
    carry += cidx * 19;
    bits |= carry << width;
    width += (carry & 31) > 18 ? 15 : 16;
    do { out.push(bits & 255); bits >>= 8; width -= 8; } while (width > 12);
    carry = -1;
  }
  if (carry > -1) out.push((bits | carry << width) & 255);
  return String.fromCharCode.apply(null, out);
}

// Parse the PQI59lb array
var arrStart = up.indexOf("PQI59lb([\"");
var items = [];
var pos = arrStart + 10;
var inStr = false;
var curStr = "";
while (pos < up.length) {
  var ch = up[pos];
  if (ch === '"' && !inStr) { inStr = true; curStr = ""; }
  else if (ch === "\\" && inStr) { curStr += up[pos+1]; pos += 2; continue; }
  else if (ch === '"' && inStr) { inStr = false; items.push(curStr); }
  else if (ch === "," && !inStr) { /* skip */ }
  else if (ch === "]" && !inStr) break;
  else if (inStr) curStr += ch;
  pos++;
}

console.log("\nTotal items:", items.length);

// Decode key positions
var lookups = {
  "items[174]": 174,
  "items[148]": 148,
  "items[171]": 171,
  "items[146]": 146,
  "items[147]": 147,
  "items[144]": 144,
  "items[24]": 24,
  "items[400]": 400,
  "items[402]": 402,
  "items[163]": 163,
  "items[139]": 139,
  "items[383]": 383,
  "items[399]": 399,
  "items[395]": 395,
  "items[401]": 401,
};

console.log("\n=== 关键解码 ===");
for (var name in lookups) {
  var i = lookups[name];
  if (i < items.length) {
    var decoded = H15mSqN(items[i]);
    console.log(name + ": \"" + decoded + "\"");
  }
}

// Also decode items that look like function names or property names
// Try b5jD0L(0x190) and b5jD0L(0x192) - these are direct indices, not via yOhx3Hg
// In the code: $[b5jD0L(0x190)] = ...
// b5jD0L(0x190) calls b5jD0L with 400
console.log("\n=== b5jD0L direct indices ===");
console.log("b5jD0L(0x190)=items[400]:", H15mSqN(items[400]));
console.log("b5jD0L(0x192)=items[402]:", H15mSqN(items[402]));
