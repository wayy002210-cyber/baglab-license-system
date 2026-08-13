export type LicensePlan="day1"|"day3"|"day7"|"month"|"year"|"permanent";
export type LicenseCredential={version:1;licenseId:string;deviceFingerprint:string;plan:LicensePlan;status:"active"|"disabled"|"expired";issuedAt:string;expiresAt:string|null;offlineUntil:string;minimumBuildId:string};
export type LicenseStatus={allowed:boolean;mode:"online"|"offline"|"inactive";deviceShortCode:string;credential?:LicenseCredential;code?:string;message?:string};
