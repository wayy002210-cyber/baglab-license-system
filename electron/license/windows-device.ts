import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { buildDeviceFingerprint } from "./device.js";

type InstallationStore={get(name:"license-installation-id"):Promise<string|null>;set(name:"license-installation-id",value:string):Promise<void>}
type Executor=(file:string,args:string[])=>Promise<string>;
const exec=promisify(execFile);
async function defaultExecutor(file:string,args:string[]){const result=await exec(file,args,{windowsHide:true,timeout:5_000,encoding:"utf8"});return result.stdout}
async function safe(executor:Executor,file:string,args:string[]){try{return (await executor(file,args)).trim()||null}catch{return null}}
export async function collectWindowsDevice(store:InstallationStore,executor:Executor=defaultExecutor){
  let installationId=await store.get("license-installation-id");if(!installationId){installationId=randomUUID();await store.set("license-installation-id",installationId)}
  const machineRaw=await safe(executor,"reg.exe",["query","HKLM\\SOFTWARE\\Microsoft\\Cryptography","/v","MachineGuid"]);
  const machineGuid=machineRaw?.match(/MachineGuid\s+REG_\w+\s+(.+)/i)?.[1]?.trim()??machineRaw;
  const boardUuid=await safe(executor,"powershell.exe",["-NoProfile","-NonInteractive","-Command","(Get-CimInstance Win32_ComputerSystemProduct).UUID"]);
  const volumeSerial=await safe(executor,"powershell.exe",["-NoProfile","-NonInteractive","-Command","(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='$env:SystemDrive'\").VolumeSerialNumber"]);
  const cpu=await safe(executor,"powershell.exe",["-NoProfile","-NonInteractive","-Command","$c=Get-CimInstance Win32_Processor|Select-Object -First 1;\"$($c.ProcessorId)|$($c.Name)\""]);
  return buildDeviceFingerprint({machineGuid,boardUuid,volumeSerial,cpu,installationId});
}
