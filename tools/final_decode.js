var fs = require("fs");
var up = fs.readFileSync(".upstream/jd_joypark_task.js", "utf8");

// Simplify: extract just the decoder parts and run them with kKMR2B as no-op
var y3pos = up.indexOf("const yOhx3Hg=[");
var b5jPos = up.indexOf("function b5jD0L");
var h9jPos = up.indexOf("function h9j_vot");
var pqiPos = up.indexOf("function PQI59lb");
var h15Pos = up.indexOf("function H15mSqN");

// Build decoder code that matches upstream exactly
var decoderSrc = up.substring(pqiPos, pqiPos + up.substring(pqiPos, pqiPos+200).length);
// Actually let's just extract pieces precisely
var pqiEnd = up.indexOf("const yOhx3Hg=");
var pqiCode = up.substring(pqiPos, pqiEnd);
var y3Code = up.substring(y3pos, h15Pos);
var h15Code = up.substring(h15Pos, b5jPos);
var b5jCode = up.substring(b5jPos, up.indexOf("kKMR2B(oFiTGZB={})", b5jPos) > 0 ? up.indexOf("kKMR2B(oFiTGZB={})", b5jPos) + 20 : h9jPos);
var h9jCode = up.substring(h9jPos, up.indexOf("function", h9jPos + 1));

// Write a clean decoder script
var code = `
// No-op stubs
var kKMR2B = function() { return arguments[0]; };
var HqeX_Z = function(o) { return o; };
var hnHAzW;
var console = { log: function() {}, error: function() {} };

// Decoder definitions
${pqiCode}
${y3Code}
${h15Code}
${b5jCode}
${h9jCode}

// The xUS_Mvm table
kKMR2B(oFiTGZB = {}, xUS_Mvm = PQI59lb([INSERT_TABLE_HERE]));

// Decode everything
var result = {};
result["0xae"] = b5jD0L(0xae);
result["0x94"] = b5jD0L(0x94);
result["0xab"] = b5jD0L(0xab);
result["0x92"] = b5jD0L(0x92);
result["0x93"] = b5jD0L(0x93);
result["0x90"] = b5jD0L(0x90);
result["0x95"] = b5jD0L(0x95);
result["0x9a"] = b5jD0L(0x9a);
result["0x193"] = b5jD0L(0x193);
result["0x91"] = b5jD0L(0x91);
result["0x98"] = b5jD0L(0x98);
result["0x99"] = b5jD0L(0x99);
result["0x9c"] = b5jD0L(0x9c);
result["0x189"] = b5jD0L(0x189);
result["0x18a"] = b5jD0L(0x18a);
result["0x18c"] = b5jD0L(0x18c);
result["0x18d"] = b5jD0L(0x18d);
result["0x18e"] = b5jD0L(0x18e);
result["0x190"] = b5jD0L(400);
result["0x192"] = b5jD0L(402);
result["0x40"] = b5jD0L(0x40);
result["0x45"] = b5jD0L(0x45);
result["0x12"] = b5jD0L(0x12);
result["0x5"] = b5jD0L(0x5);
result["0x1"] = b5jD0L(0x1);

// All properties for reference
result["all"] = {};
for (var i = 0; i < 200; i++) {
  result["all"][i] = b5jD0L(i);
}

JSON.stringify(result, null, 2);
`;

// Read the table from upstream
var arrStart = up.indexOf('PQI59lb(["');
var inStr = false;
var items = [];
var cur = "";
var pos = up.indexOf('["', arrStart) + 2;
while (pos < up.length) {
  var ch = up[pos];
  if (ch === '\\') { cur += up[pos+1]; pos += 2; continue; }
  else if (ch === '"') {
    if (up[pos+1] === ',') { items.push(cur); cur = ""; pos += 2; }
    else if (up[pos+1] === ']') { items.push(cur); break; }
    else { cur += ch; pos++; }
  } else { cur += ch; pos++; }
}

// Build table string
var tableStr = items.map(function(s) { 
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; 
}).join(',');
code = code.replace("INSERT_TABLE_HERE", tableStr);

// Run in VM
require("vm").runInNewContext(code, {}, {timeout: 5000});
