import { describe, expect, it, vi } from "vitest";
import { createElectronLicenseApiClient, LicenseApiClient } from "../../electron/license/api-client";

describe("license API client",()=>{
  it("uses the Electron network fetcher so system proxy settings are honored",async()=>{
    const electronFetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,data:{value:2}}),{status:200,headers:{"Content-Type":"application/json"}}));
    const client=createElectronLicenseApiClient("https://license.example",electronFetch,async()=>{});
    await expect(client.post("/api/license/activate",{a:1})).resolves.toEqual({value:2});
    expect(electronFetch).toHaveBeenCalledOnce();
  });
  it("retries transient failures and preserves business errors",async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(JSON.stringify({ok:true,data:{value:1}}),{status:200,headers:{"Content-Type":"application/json"}}));
    const client=new LicenseApiClient("https://license.example",fetcher,async()=>{});
    await expect(client.post("/api/license/activate",{a:1})).resolves.toEqual({value:1});expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ok:false,error:{code:"LICENSE_DISABLED",message:"已禁用"}}),{status:403,headers:{"Content-Type":"application/json"}}));
    await expect(client.post("/api/license/validate",{})).rejects.toMatchObject({code:"LICENSE_DISABLED"});
  });
});
