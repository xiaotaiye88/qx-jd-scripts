var fs = require("fs");
var up = fs.readFileSync(".upstream/jd_joypark_task.js", "utf8");
// Use the EXACT decoder from the script itself
// Extract the exact decoder functions by finding their boundaries
var sections = {
  yOhx3Hg: ["const yOhx3Hg=[", "function PQI59lb"],
  PQI59lb: ["function PQI59lb", "const yOhx3Hg="],
  H15mSqN: ["function H15mSqN", "function b5jD0L"],
  b5jD0L: ["function b5jD0L", "function h9j_vot"],
  h9j_vot: ["function h9j_vot", "function"]
};

// Actually use the built file's exact code, since we know the table is identical
var built = fs.readFileSync("scripts/jd_joypark_task.qx.js", "utf8");
var main = built.substring(built.indexOf("// ===== 主脚本:"));

// Find the exact decoder section
var codeStart = main.indexOf("const yOhx3Hg=[");
var codeEnd = main.indexOf("kKMR2B(oFiTGZB={},xUS_Mvm=PQI59lb(");
var initCode = main.substring(codeStart, codeEnd);

// Clean up kKMR2B calls - replace "kKMR2B(...)" with just the first argument
// Actually, kKMR2B is a no-op wrapper, so we can just strip the calls
// But the H15mSqN function has nested kKMR2B calls which affect variable scope...
// Let's try a simpler approach: define kKMR2B as a function that evaluates its args

var cleanCode = main.substring(0, codeEnd + 200);

// Now write a test script
var testScript = `
// Stub the vars and functions that the main script sets up before the decoder
var __QX_G = globalThis;
var kKMR2B = function() { return arguments[arguments.length-1]; };

// Include the decoder section  
${initCode}

// The h9j_vot function
${main.substring(main.indexOf("function h9j_vot"), main.indexOf("function", main.indexOf("function h9j_vot")+1))}

// Now init xUS_Mvm
kKMR2B(oFiTGZB={}, xUS_Mvm=PQI59lb([INSERT_TABLE]));

// Decode
var result = {};
for(var i = 0; i < 200; i++) {
  var val = b5jD0L(i);
  if(val && val.length > 0 && val.charCodeAt(0) >= 32) result[i] = val;
}
// Key indices
result["ae"] = b5jD0L(174);
result["94"] = b5jD0L(148);
result["ab"] = b5jD0L(171);
result["92"] = b5jD0L(146);
result["93"] = b5jD0L(147);
result["90"] = b5jD0L(144);
result["95"] = b5jD0L(149);
result["9a"] = b5jD0L(154);
result["91"] = b5jD0L(145);
result["98"] = b5jD0L(152);
result["99"] = b5jD0L(153);
result["9c"] = b5jD0L(156);
result["40"] = b5jD0L(64);
result["45"] = b5jD0L(69);
result["12"] = b5jD0L(18);
result["8c"] = b5jD0L(140);
result["0x190"] = b5jD0L(400);
result["0x192"] = b5jD0L(402);
JSON.stringify(result);
`;

// Read the full table from the built file
var tableStart = built.indexOf('xUS_Mvm=PQI59lb([');
var startI = tableStart + 17;
var depth = 1, i = startI;
while (i < built.length && depth > 0) {
  if (built[i] === "[") depth++;
  else if (built[i] === "]") depth--;
  i++;
}
var tableStr = built.substring(startI, i - 1);
testScript = testScript.replace("INSERT_TABLE", tableStr);

fs.writeFileSync("tools/decoder_final.js", testScript);
console.log("Written decoder_final.js");
console.log("testScript length:", testScript.length);
