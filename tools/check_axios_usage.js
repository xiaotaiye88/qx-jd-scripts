var fs=require("fs"),vm=require("vm");
var b=fs.readFileSync("scripts/jd_joypark_task.qx.js","utf8");

// Find dylib module definition
var dylibPos = b.indexOf('./function/dylib');
var parenIdx = b.indexOf('function() {', dylibPos);
var searchArea = b.substring(parenIdx, parenIdx + 80000);

// Check for axios patterns
var axPos = searchArea.indexOf('require("axios")');
if (axPos >= 0) {
  console.log("axios require found at offset", axPos);
  console.log("Context:", searchArea.substring(Math.max(0,axPos-100), axPos+300));
}

// Check for got.extend
var gext = searchArea.indexOf('got.extend');
if (gext >= 0) console.log("got.extend at", gext, "ctx:", searchArea.substring(Math.max(0,gext-50), gext+100));

// Check for axios.create
var acre = searchArea.indexOf('axios.create');
if (acre >= 0) console.log("axios.create at", acre, "ctx:", searchArea.substring(Math.max(0,acre-50), acre+100));

// Check for how dylib makes HTTP calls
var axReq = searchArea.indexOf('.get(');
var axReq2 = searchArea.indexOf('.post(');
if (axReq >= 0) console.log(".get at", axReq, "ctx:", searchArea.substring(Math.max(0,axReq-50), axReq+100));
if (axReq2 >= 0) console.log(".post at", axReq2, "ctx:", searchArea.substring(Math.max(0,axReq2-50), axReq2+100));
