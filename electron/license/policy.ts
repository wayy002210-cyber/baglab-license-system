export interface DesktopCredential {version:1;licenseId:string;deviceFingerprint:string;plan:"day1"|"day3"|"day7"|"month"|"year"|"permanent";status:"active"|"disabled"|"expired";issuedAt:string;expiresAt:string|null;offlineUntil:string;minimumBuildId:string}
interface Context{now:Date;deviceFingerprint:string;buildId:string;lastObservedAt:Date|null}
type Result={allowed:true;mode:"offline"}|{allowed:false;code:string}
function buildParts(value:string){return value.split("-")[0].split(".").map(v=>Number.parseInt(v,10)||0)}
function allowedBuild(current:string,minimum:string){const a=buildParts(current),b=buildParts(minimum);for(let i=0;i<Math.max(a.length,b.length);i++){const diff=(a[i]??0)-(b[i]??0);if(diff)return diff>0}return true}
export function evaluateCredential(value:DesktopCredential,context:Context):Result{
  if(value.status==="disabled")return{allowed:false,code:"LICENSE_DISABLED"};
  if(value.status!=="active")return{allowed:false,code:"LICENSE_EXPIRED"};
  if(value.deviceFingerprint!==context.deviceFingerprint)return{allowed:false,code:"DEVICE_MISMATCH"};
  if(!allowedBuild(context.buildId,value.minimumBuildId))return{allowed:false,code:"BUILD_UNSUPPORTED"};
  if(context.lastObservedAt&&context.now.getTime()<context.lastObservedAt.getTime()-5*60_000)return{allowed:false,code:"CLOCK_ROLLBACK"};
  if(value.expiresAt&&context.now>=new Date(value.expiresAt))return{allowed:false,code:"LICENSE_EXPIRED"};
  if(context.now>=new Date(value.offlineUntil))return{allowed:false,code:"OFFLINE_EXPIRED"};
  return{allowed:true,mode:"offline"};
}
