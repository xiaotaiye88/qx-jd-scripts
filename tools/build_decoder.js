var fs = require("fs");
var up = fs.readFileSync(".upstream/jd_joypark_task.js", "utf8");

// Find the decoder section: yOhx3Hg, PQI59lb, H15mSqN, b5jD0L, h9j_vot
var y3pos = up.indexOf("const yOhx3Hg=[");
var funcStart = up.indexOf("function PQI59lb", y3pos);
var h9j_pos = up.indexOf("function h9j_vot");

// Get the table
var arrStart = up.indexOf('PQI59lb(["');
var inStr = false, pos;
// We need the actual table values without the confusing PQI59lb wrapper
var tableItems = [];
pos = up.indexOf('["', arrStart) + 2;
var cur = "";
while (pos < up.length) {
  var ch = up[pos];
  if (ch === '\\') { cur += up[pos+1]; pos += 2; continue; }
  else if (ch === '"') {
    if (up[pos+1] === ',') { tableItems.push(cur); cur = ""; pos += 2; }
    else if (up[pos+1] === ']') { tableItems.push(cur); break; }
    else { cur += ch; pos++; }
  } else { cur += ch; pos++; }
}

console.log("Table items:", tableItems.length);

// Write a simple self-contained JS decoder
var decoderCode = 'var kKMR2B=function(){return arguments[arguments.length-1]};var HqeX_Z=function(o){return o};var hnHAzW;var yOhx3Hg=[0x0,0x1,0x8,0xff,"length","undefined",0x3f,0x6,"fromCodePoint",0x7,0xc,"push",0x5b,0x1fff,0x58,0xd,0xe,0x3,0x2,"h",0x2d,0x2a,"e",0x4,!0x1,0x63,0x69,"a",0x24,0xc4,"f","\\n",!0x0,0x6a,0x6b,0x22,0xdf,"i",0xcc,0x4b,"d",0x70,0x4f,0x9,"g",0x79,0x7a,0x6f,0x7f,0x80,0x81,0x66,"c",0x3d,0x3c,0x96,0x98,"b",0x95,0x9b,0x84,0x18,0x3e8,"=",";",0x39,0xbd,0xbe,0xbc,"UA",0xbf,0xc1,0xc0,"\\u8D26\\u53F7"," ",0xd8,0xc7,0xdc,0xdd,0xa4,0x8f,0xd7,0xde,0x89,0xa,0x42,0xe6,0xe9,void 0x0,0xea,0xef,"id",0xf1,0xf2,0xf3,0x9c,0x6d,0x1b,0x5,null,0xfd,0x100,0x107,0x10d,0x110,0xec,"|",0x112,0x1f4,0x124,0x123,0x125,0xc8,0x127,0x10e,0x10f,0xdb,0xc3,0x64,0x131,0xb4,0x12d,0xb1,0x8a,0x9d,0x13b,0x13c,0x140,0x13d,"\\u3011",0x13f,0x142,0x155,0x151,0x152,0x7d0,0x139,0x137,0xae,0xaf,0x170,0x2000000,0x4000000,0x71,0x17f,0x184,0xa3,0x18b,0x8b,0x167,0x46,0x44,0x16d,0x16f,0x194,0x7c,"ua",0x1a8,0x1af,0x16a,0x1b9,0x1c9,0x1c3,0x1ce,0x19a,0x19b,0x19c,0x1df,0x1d8,0x19d,0x1eb,0x18f,0x1ef,0x1f6,0x191,0x196,0x199,0x1f9,0x203,0x205,0x5f5e100,0x989680,0xf4240,0x216,0x2710,0x1fd];';

// Read decoder functions from the built file (they have kKMR2B calls stripped by our no-op)
decoderCode += 'function PQI59lb(oFiTGZB,xUS_Mvm,JwKwHaL){for(JwKwHaL=0x0;JwKwHaL<xUS_Mvm;JwKwHaL++)oFiTGZB.push(oFiTGZB.shift());return oFiTGZB}\n';

// H15mSqN - from upstream
var h15raw = up.substring(up.indexOf("function H15mSqN"), up.indexOf("function b5jD0L"));
// Remove kKMR2B( calls
h15raw = h15raw.replace(/kKMR2B\(/g, '').replace(/\)\)(;|\))/g, function(m) {
  if (m === '));') return ')';
  if (m === ');') return ';';
  if (m === '))') return ')';
  return m;
});
decoderCode += h15raw + '\n';

decoderCode += 'function b5jD0L(JwKwHaL){if(typeof oFiTGZB[JwKwHaL]===yOhx3Hg[0x5]){return oFiTGZB[JwKwHaL]=H15mSqN(xUS_Mvm[JwKwHaL])}return oFiTGZB[JwKwHaL]}\n';
decoderCode += 'function h9j_vot(oFiTGZB){return String.fromCharCode.apply(null,oFiTGZB)}\n';

// Build the table
decoderCode += 'var oFiTGZB={};var xUS_Mvm=PQI59lb([';
for (var i = 0; i < tableItems.length; i++) {
  if (i > 0) decoderCode += ',';
  decoderCode += '"' + tableItems[i].replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}
decoderCode += ']);\n';

// Decode
decoderCode += 'var result={};';
decoderCode += 'result["ae"]=b5jD0L(174);result["94"]=b5jD0L(148);result["ab"]=b5jD0L(171);result["92"]=b5jD0L(146);result["93"]=b5jD0L(147);result["90"]=b5jD0L(144);result["95"]=b5jD0L(149);result["9a"]=b5jD0L(154);result["193"]=b5jD0L(403);';
decoderCode += 'result["400"]=b5jD0L(400);result["402"]=b5jD0L(402);result["403"]=b5jD0L(403);';
decoderCode += 'result["all"]={};for(var i=0;i<100;i++)result["all"][i]=b5jD0L(i);'
decoderCode += 'JSON.stringify(result);';

// Write to a temp file
fs.writeFileSync("tools/decoder_temp.js", decoderCode);
console.log("Written decoder_temp.js");
