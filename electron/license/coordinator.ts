import { evaluateCredential, type DesktopCredential } from "./policy.js";

type Store={get(name:"license-credential"|"license-clock"):Promise<string|null>;set(name:"license-credential"|"license-clock",value:string):Promise<void>;delete(name:"license-credential"|"license-clock"):Promise<unknown>}
interface Dependencies{device:{fingerprint:string;installationIdHash:string;shortCode:string};buildId:string;store:Store;api:{post<T>(path:string,input:unknown):Promise<T>};verify(token:string):DesktopCredential;now?:()=>Date}
type Status={allowed:boolean;mode:"online"|"offline"|"inactive";deviceShortCode:string;credential?:DesktopCredential;code?:string;message?:string}
export class LicenseCoordinator{
  private readonly now:()=>Date;private status:Status;
  constructor(private readonly deps:Dependencies){this.now=deps.now??(()=>new Date());this.status={allowed:false,mode:"inactive",deviceShortCode:deps.device.shortCode,code:"ACTIVATION_REQUIRED"}}
  getStatus(){return this.status}
  async activate(activationCode:string){const result=await this.deps.api.post<{signedCredential:string;credential:DesktopCredential}>("/api/license/activate",{activationCode,deviceFingerprint:this.deps.device.fingerprint,installationIdHash:this.deps.device.installationIdHash,buildId:this.deps.buildId});return this.acceptOnline(result.signedCredential)}
  async initialize(){const token=await this.deps.store.get("license-credential");if(!token)return this.status;let credential:DesktopCredential;try{credential=this.deps.verify(token)}catch{return this.fail("CREDENTIAL_INVALID","本地授权凭证已损坏")}
    const local=await this.evaluate(credential);if(!local.allowed)return local;
    try{const result=await this.deps.api.post<{signedCredential:string}>("/api/license/validate",{licenseId:credential.licenseId,deviceFingerprint:this.deps.device.fingerprint,buildId:this.deps.buildId});return this.acceptOnline(result.signedCredential)}catch(error){const code=typeof error==="object"&&error&&"code" in error?String(error.code):"NETWORK_ERROR";if(code!=="NETWORK_ERROR"&&code!=="SERVER_ERROR")return this.fail(code,error instanceof Error?error.message:code);this.status={...local,mode:"offline"};return this.status}}
  async refresh(){return this.initialize()}
  assertAllowed(){if(!this.status.allowed)throw new Error(`LICENSE_${this.status.code??"REQUIRED"}`)}
  private async acceptOnline(token:string){let credential:DesktopCredential;try{credential=this.deps.verify(token)}catch{return this.fail("CREDENTIAL_INVALID","服务器凭证验证失败")};const result=await this.evaluate(credential);if(!result.allowed)return result;await this.deps.store.set("license-credential",token);await this.deps.store.set("license-clock",this.now().toISOString());this.status={allowed:true,mode:"online",deviceShortCode:this.deps.device.shortCode,credential};return this.status}
  private async evaluate(credential:DesktopCredential){const lastRaw=await this.deps.store.get("license-clock");const result=evaluateCredential(credential,{now:this.now(),deviceFingerprint:this.deps.device.fingerprint,buildId:this.deps.buildId,lastObservedAt:lastRaw?new Date(lastRaw):null});if(!result.allowed)return this.fail(result.code,result.code);return{allowed:true,mode:"offline" as const,deviceShortCode:this.deps.device.shortCode,credential}}
  private fail(code:string,message:string){this.status={allowed:false,mode:"inactive",deviceShortCode:this.deps.device.shortCode,code,message};return this.status}
}
