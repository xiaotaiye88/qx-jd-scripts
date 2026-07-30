var fs = require("fs");
var up = fs.readFileSync(".upstream/jd_joypark_task.js", "utf8");
var built = fs.readFileSync("scripts/jd_joypark_task.qx.js", "utf8");
var main = built.substring(built.indexOf("// ===== 主脚本:"));

function parseArray(code) {
  // Find the PQI59lb array
  var s = code.indexOf("PQI59lb(");
  if (s < 0) return null;
  s = code.indexOf('["', s);
  if (s < 0) return null;
  
  var items = [];
  var pos = s + 1;
  var inStr = false, cur = "";
  while (pos < code.length) {
    var ch = code[pos];
    if (ch === '\\' && inStr) { cur += code[pos+1]; pos += 2; continue; }
    if (ch === '"' && inStr) { inStr = false; items.push(cur); cur = ""; }
    else if (ch === '"' && !inStr) { inStr = true; }
    else if (ch === ']' && !inStr) break;
    else if (inStr) cur += ch;
    pos++;
  }
  return items;
}

var upItems = parseArray(up);
var builtItems = parseArray(main);

console.log("Upstream array length:", upItems ? upItems.length : "null");
console.log("Built array length:", builtItems ? builtItems.length : "null");

if (upItems && builtItems && upItems.length === builtItems.length) {
  var diffCount = 0;
  for (var i = 0; i < upItems.length; i++) {
    if (upItems[i] !== builtItems[i]) {
      console.log("Diff at index " + i + ": up=[" + upItems[i].substring(0, 50) + "] built=[" + builtItems[i].substring(0, 50) + "]");
      diffCount++;
      if (diffCount > 5) break;
    }
  }
  if (diffCount === 0) console.log("All items match!");
  console.log("First:", upItems[0]);
  console.log("Last upstream:", upItems[upItems.length-1]);
  if (builtItems) console.log("Last built:", builtItems[builtItems.length-1]);
} else if (upItems && builtItems) {
  console.log("Length mismatch! Upstream=" + upItems.length + " Built=" + builtItems.length);
  // Find where they diverge
  for (var i = 0; i < Math.min(upItems.length, builtItems.length); i++) {
    if (upItems[i] !== builtItems[i]) {
      console.log("First diff at index " + i);
      console.log("  up: " + upItems[i]);
      console.log("  built: " + builtItems[i]);
      break;
    }
  }
  // Check if built is truncated
  console.log("\nUpstream has " + upItems.length + " items, built has " + builtItems.length);
  console.log("Missing items after " + builtItems.length + " in built:");
  for (var i = builtItems.length; i < Math.min(upItems.length, builtItems.length + 5); i++) {
    console.log("  [" + i + "] " + upItems[i]);
  }
}
