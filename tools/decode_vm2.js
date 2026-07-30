var fs = require("fs");

// Read upstream file
var up = fs.readFileSync(".upstream/jd_joypark_task.js", "utf8");

// Extract decoder section: from "const yOhx3Hg=[" to "function Env"
var dStart = up.indexOf("const yOhx3Hg=[");
var dEnd = up.indexOf("function Env", dStart);
var decoders = up.substring(dStart, dEnd);

// We need to make kKMR2B a no-op since it's just a function-call obfuscation trick
// Also need HqeX_Z and hnHAzW
var wrapper = `
// Decoder stubs
var kKMR2B = function() { return arguments[arguments.length-1]; };
var HqeX_Z = function(o) { return o; };
var hnHAzW;

// The original decoder definitions
${decoders}

// Now init the string table
var oFiTGZB, xUS_Mvm;
kKMR2B(oFiTGZB = {}, 
xUS_Mvm = PQI59lb(/*TABLE_PLACEHOLDER*/));

// Decode the key properties
var result = {};
result["0xae"] = b5jD0L(0xae);
result["0x94"] = b5jD0L(0x94);
result["0xab"] = b5jD0L(0xab);
result["0x92"] = b5jD0L(0x92);
result["0x93"] = b5jD0L(0x93);
result["0x90"] = b5jD0L(0x90);
result["0x18"] = b5jD0L(0x18);
result["0x95"] = b5jD0L(0x95);
result["0x9a"] = b5jD0L(0x9a);
result["0x193"] = b5jD0L(0x193);
result["0x190"] = b5jD0L(400);
result["0x192"] = b5jD0L(402);

// All decoded strings
var all = {};
for (var i = 0; i < xUS_Mvm.length; i++) {
  all[i] = b5jD0L(i);
}
result["__all"] = all;

JSON.stringify(result);
`;

// Now extract the actual table from upstream
var arrStart = up.indexOf('PQI59lb(["');
var arrEnd = arrStart;
var depth = 0;
for (var i = arrStart; i < up.length; i++) {
  if (up[i] === '[') depth++;
  else if (up[i] === ']') { depth--; if (depth <= 0) { arrEnd = i+1; break; } }
}
var tableStr = up.substring(arrStart + 10, arrEnd - 1); // inside ["..."]
wrapper = wrapper.replace("/*TABLE_PLACEHOLDER*/", "[" + tableStr + "]");

// Run in VM
var vm = require("vm");
try {
  var ctx = vm.createContext({ console: console });
  var resultStr = vm.runInContext(wrapper, ctx, { timeout: 5000 });
  var d = JSON.parse(resultStr);
  
  console.log("=== 关键属性解码 ===");
  console.log("b5jD0L(0xae)[prop1]:", JSON.stringify(d["0xae"]));
  console.log("b5jD0L(0x94)[method]:", JSON.stringify(d["0x94"]));
  console.log("b5jD0L(0xab)[JSON.parse]:", JSON.stringify(d["0xab"]));
  console.log("b5jD0L(0x92):", JSON.stringify(d["0x92"]));
  console.log("b5jD0L(0x93):", JSON.stringify(d["0x93"]));
  console.log("b5jD0L(0x90):", JSON.stringify(d["0x90"]));
  console.log("b5jD0L(0x18):", JSON.stringify(d["0x18"]));
  console.log("b5jD0L(0x95):", JSON.stringify(d["0x95"]));
  console.log("b5jD0L(0x9a):", JSON.stringify(d["0x9a"]));
  console.log("b5jD0L(0x193):", JSON.stringify(d["0x193"]));
  console.log("b5jD0L(400)[0x190]:", JSON.stringify(d["0x190"]));
  console.log("b5jD0L(402)[0x192]:", JSON.stringify(d["0x192"]));
  
  // Show all decoded strings
  console.log("\n=== 所有解码属性 ===");
  var all = d["__all"];
  for (var k in all) {
    console.log("[" + k + "]:", JSON.stringify(all[k]));
  }
} catch(e) {
  console.log("Error:", e.message);
  // Try another approach
  console.log("Trying direct script execution...");
}
