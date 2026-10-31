# VK ID SDK 2.6.1

`sdk-2.6.1.js` is the unmodified UMD distribution from
`https://unpkg.com/@vkid/sdk@2.6.1/dist-sdk/umd/index.js`, retrieved 2026-10-31.

SHA-256: `0a027e662452af50f47826fb87c0204dc8d116ffce528a4ab4b9715dc7354297`.

Official source: <https://github.com/VKCOM/vkid-web-sdk>.
The accompanying MIT license is from that repository.

Serve this fixed version from the platform's own origin. No version range,
third-party CDN permission, inline initialization, or placeholder nonce is used.
The first-party integration is in `../../vk-one-tap.js`.

The SDK's optional MyTracker script is not added to the platform CSP.
For the widget itself the proposed CSP adds only `https://id.vk.ru` to
`frame-src`, `child-src` and `connect-src`. Actual provider login and the live
headers still need verification after the separate reviewed configuration phase.
