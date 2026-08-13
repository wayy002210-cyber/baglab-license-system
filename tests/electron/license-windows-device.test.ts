import { describe,expect,it,vi } from "vitest";
import { collectWindowsDevice } from "../../electron/license/windows-device";

describe("Windows device collector",()=>{
  it("persists first installation id and tolerates failed probes",async()=>{
    const values=new Map<string,string>();const store={get:async()=>null,set:async(_n:string,v:string)=>{values.set("id",v)}};
    const execute=vi.fn().mockResolvedValueOnce("MachineGuid    REG_SZ    abc-guid").mockRejectedValueOnce(new Error("cim failed")).mockResolvedValueOnce("disk-1").mockResolvedValueOnce("cpu-1");
    const result=await collectWindowsDevice(store as never,execute);
    expect(values.get("id")).toBeTruthy();expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(execute).toHaveBeenCalledTimes(4);
  });
  it("reuses the existing installation id across upgrades",async()=>{const store={get:async()=>"existing",set:vi.fn()};const result=await collectWindowsDevice(store as never,async()=>"");expect(store.set).not.toHaveBeenCalled();expect(result.installationIdHash).toMatch(/^[a-f0-9]{64}$/)});
});
