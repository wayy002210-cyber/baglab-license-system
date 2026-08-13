import { describe, expect, it, vi } from "vitest";
import { LicenseApiClient } from "../../electron/license/api-client";

describe("license API client",()=>{
  it("retries transient failures and preserves business errors",async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(JSON.stringify({ok:true,data:{value:1}}),{status:200,headers:{"Content-Type":"application/json"}}));
    const client=new LicenseApiClient("https://license.example",fetcher,async()=>{});
    await expect(client.post("/api/license/activate",{a:1})).resolves.toEqual({value:1});expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ok:false,error:{code:"LICENSE_DISABLED",message:"已禁用"}}),{status:403,headers:{"Content-Type":"application/json"}}));
    await expect(client.post("/api/license/validate",{})).rejects.toMatchObject({code:"LICENSE_DISABLED"});
  });
});
