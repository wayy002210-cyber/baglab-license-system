export class LicenseApiError extends Error{constructor(public readonly code:string,message:string,public readonly status:number){super(message)}}
export class LicenseApiClient{
  constructor(private readonly origin:string,private readonly fetcher:typeof fetch=fetch,private readonly delay:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))){ }
  async post<T>(path:string,input:unknown):Promise<T>{
    let last:unknown;
    for(let attempt=0;attempt<3;attempt++)try{
      const response=await this.fetcher(new URL(path,this.origin),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(8_000)});
      const body=await response.json() as {ok:boolean;data?:T;error?:{code:string;message:string}};
      if(!response.ok||!body.ok)throw new LicenseApiError(body.error?.code??"SERVER_ERROR",body.error?.message??"授权服务暂时不可用",response.status);
      return body.data as T;
    }catch(error){if(error instanceof LicenseApiError)throw error;last=error;if(attempt<2)await this.delay(250*2**attempt)}
    throw new LicenseApiError("NETWORK_ERROR",last instanceof Error?last.message:"网络连接失败",0);
  }
}
