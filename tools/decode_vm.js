var fs = require("fs");
var up = fs.readFileSync(".upstream/jd_joypark_task.js", "utf8");

// Use the script's own decoder by extracting and running its functions
var initStart = up.indexOf("const yOhx3Hg=[");
var initEnd = up.indexOf("function Env", initStart);

var preInit = `
var __QX_G = {};
var kKMR2B = function() {};
var HqeX_Z = function(o) { return o; };
var hnHAzW;
`;

// Extract JUST the decoder part: yOhx3Hg, PQI59lb, H15mSqN, b5jD0L, h9j_vot
var yohMatch = up.substring(initStart, initEnd);
// Add stubs for the decoder functions that reference kKMR2B
yohMatch = yohMatch.replace(/kKMR2B\(/g, '').replace(/\)\),/g, '),\n');
// Just keep the raw definitions, the kKMR2B is a no-op stub

// Simpler approach: Execute the whole init block with kKMR2B=function(){}
var raw = `
var kKMR2B = function() { return arguments[0]; };
` + yohMatch + `
function h9j_vot(oFiTGZB) {
  // h9j_vot = String.fromCharCode.apply(null, ...)
  return String.fromCharCode.apply(null, oFiTGZB);
}
`;

var vm = require("vm");
var sandbox = {
  console: console,
};
var ctx = vm.createContext(sandbox);
try {
  vm.runInContext(raw, ctx, {timeout: 3000});
  
  // Now run the init
  var execCode = `
var oFiTGZB, xUS_Mvm;
kKMR2B(oFiTGZB={}, xUS_Mvm=PQI59lb(["SaVm}7,SdwIbK&r|~w$(4`O<lwkpe3@soHrY*nb2g","J|};)","SaAM{YA*e!\\"RUz}","a1{Yl7su","B*i;!kz8[6pb=h2T~f6RKnk!M#M","4Ua`_Vd}S","B*i;!kz8[6pb=h2T~f6RKnk!M##bD","8|ZE@7xu","B*i;d>D","))A/\\"6ZIC","ddpZI^b2g","dd=SoVSk9~","c*1feE2u","eM6m","W\\"es?6EMQ/iM+^wVx2T,p^a~qHn3fb~O`hYl8\\"MB!{h5!I#VQ/Hrl|;RW=*O%Z/k/iHxe~5/fC<xQ6rvS9P*FnY<kpKG$","?P^5m<V<n#*ix{/[#B`Yf>kSXx","/1QZ>e@6oUSOnj=)w`qR^IWgt","#M=+!&jC0@","CrtE.,K=!~A1H]B`oxKMx","W\`stNV;2pp:a1U!XQgVMuk|H}UEVH]?!s@K,<Yp16!","bc#g(oP7YK9=_c93DRP7lcgGg",")P;1gqva.U>;KeTNoBWh0jd$Il!282dX.Zh;(k$j2OeeGe^3r{L;k&0@cpD/$","Oc\\"+0?)yh}1VGP~HZwfRRCZ7lerY%0kHY1]YmIk$","/|_=r{K=U~Mjhz&3$f&51nl5S;Z\`k2Ssx1;1[(vu","mpHM]BQ2Ui=OV]H\`6@ACJ8D"]);
`;
  vm.runInContext(execCode, ctx, {timeout: 3000});
  
  // Try to decode
  var decodeCode = `
var decoded = {};
var keys = [0xae, 0x94, 0xab, 0x92, 0x93, 0x90, 0x18, 0x95, 0x9a, 0x193];
for (var k = 0; k < keys.length; k++) {
  var key = keys[k];
  decoded[key.toString(16)] = b5jD0L(key);
}
// Also get the 0x190 and 0x192
decoded["190"] = b5jD0L(400); // yOhx3Hg? No, it's b5jD0L(0x190) = b5jD0L(400)
decoded["192"] = b5jD0L(402);
JSON.stringify(decoded);
`;
  var result = vm.runInContext(decodeCode, ctx, {timeout: 3000});
  console.log("=== Decoded property names ===");
  var d = JSON.parse(result);
  for (var key in d) {
    console.log("b5jD0L(" + key + "):", JSON.stringify(d[key]));
  }
} catch(e) {
  console.log("Error:", e.message);
  console.log("Stack:", e.stack);
}
