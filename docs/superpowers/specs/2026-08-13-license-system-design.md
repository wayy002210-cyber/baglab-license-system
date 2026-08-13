# License System Design

## Boundaries

- `license-service/` is an independent Next.js + TypeScript application deployed to Vercel and backed by Neon PostgreSQL.
- The existing Electron/Vue/Python application remains the customer desktop product. The admin UI is never included in the desktop package.
- Existing customer SQLite data, projects, media, accounts, jobs, and publish history are never deleted by license transitions.
- Desktop package management remains npm-based because the repository scripts, documentation, and release entry points use npm. Existing pnpm files remain untouched because the proven native-module packaging flow currently reads pnpm's module layout. The license service has its own npm lockfile.

## Server

PostgreSQL stores hashed activation codes, device hashes, licenses, sessions, rate-limit buckets, and append-only license events. Activation locks the code row in a transaction so only one concurrent redemption succeeds. Plain activation codes are returned once at generation and are never stored.

The API exposes activation, validation, credential refresh, administrator login/logout, code generation/query, license mutation, device query, and event query. Zod validates all inputs. Stable error codes distinguish network-independent business failures. Admin mutations require an HttpOnly secure session and same-origin CSRF token.

Ed25519 signs a canonical JSON credential containing license ID, device fingerprint, issue time, business expiry, offline deadline, status, plan, and minimum build ID. The private key and all real secrets exist only in Vercel environment variables. The public key is supplied to production desktop builds.

## Desktop

Electron derives a SHA-256 device fingerprint from normalized MachineGuid, board UUID, system-volume serial data, CPU information, and a persistent random Installation ID. Only the final hashes leave the device. Missing hardware fields are tolerated. The short device code is a display-only prefix.

Electron owns activation, online validation, retry, credential persistence, clock rollback detection, and periodic refresh. On Windows, Installation ID and credentials use the existing Credential Manager abstraction backed by Windows secure storage. Signed credentials remain usable only until the earlier of business expiry and the server-provided 72-hour offline deadline.

Vue has an activation route and protected-route guard. Electron independently guards sensitive IPC handlers. Python independently guards copywriting, voice, generation, account connection, and publishing endpoints with a short-lived local proof issued by Electron after verifying the signed server credential and device/build binding.

## Failure behavior

Transient network/server failures retry and may enter bounded offline mode. Expired, disabled, mismatched-device, invalid-signature, rolled-back-clock, and unsupported-build states fail closed with distinct user messages. License failure blocks new protected work but does not remove user data.

## Testing and delivery

Tests cover every plan duration, concurrency, administrative transitions, credential tampering/copying, offline boundaries, clock rollback, upgrade persistence, and direct bypass of each enforcement layer. Local API/desktop integration precedes external deployment and installer generation. Desktop software cannot be absolutely uncrackable; the goal is server-controlled status, sharing resistance, higher bypass cost, and remote revocation.
