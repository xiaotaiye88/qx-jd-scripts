var fs = require("fs");
var execSync = require("child_process").execSync;

var built = fs.readFileSync("scripts/jd_joypark_task.qx.js", "utf8");
var old = execSync("git show 7ed1598:scripts/jd_joypark_task.qx.js").toString();

console.log("Current size:", built.length);
console.log("Old (7ed1598) size:", old.length);

// Extract got module from old version
var gotStartOld = old.indexOf('__qxDefine("got", function');
console.log("Old got module starts at:", gotStartOld);
if (gotStartOld > 0) {
  var oldGot = old.substring(gotStartOld, Math.min(gotStartOld + 4000, old.length));
  console.log("=== Old got module (truncated to 2500 chars) ===");
  console.log(oldGot.substring(0, 2500));
}

// Extract got module from current version
var gotStartNew = built.indexOf('__qxDefine("got", function');
console.log("\n=== Current got module start:", gotStartNew, "===");
if (gotStartNew > 0) {
  var curGot = built.substring(gotStartNew, Math.min(gotStartNew + 4000, built.length));
  console.log("=== Current got module (truncated to 2500 chars) ===");
  console.log(curGot.substring(0, 2500));
}
