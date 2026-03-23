# AquaCell Water Softener — Homey App

Monitor your **AquaCell**, **Harvey** or **TwinTec Cobalt** water softener directly in Homey.

This app is a port of the [Home Assistant AquaCell integration](https://www.home-assistant.io/integrations/aquacell/) to the Homey platform.

---

## Supported Devices

Only softener models with an **i-Lid** are supported. These use the curved salt blocks and are managed via the mobile app:

- [AquaCell](https://www.aquacell-waterontharder.nl/aquacell) — use the **Mijn AquaCell** app
- [Harvey Arc Water Softener](https://www.harveywatersofteners.co.uk/) — use the **myHarvey** app
- [TwinTec Cobalt](https://www.twintec.com/) — use the **myHarvey** app

---

## Prerequisites

1. Set up your softener with the official mobile app first.
2. Make sure you can log in successfully in the app.

---

## Installation

### Via Homey App Store
*(Once published)* Search for **AquaCell** in the Homey App Store.

### Manual / Development
```bash
npm install -g homey
homey app run   # Test on Homey
homey app install  # Install on Homey
```

---

## Sensors / Capabilities

| Capability | Description |
|---|---|
| Salt Left Side (%) | Percentage of salt remaining on the left side |
| Salt Right Side (%) | Percentage of salt remaining on the right side |
| Days Until Empty | Estimated days until salt runs out |
| Battery (%) | i-Lid battery level |
| Signal Strength | Wi-Fi signal strength |

---

## Flow Cards

### Triggers
- **Salt level is low** — fires when salt drops below a configurable threshold (%)

### Conditions
- **Salt level is below threshold** — check left, right, or either side

### Example flow
```
WHEN  Salt level is low (threshold: 15%)
THEN  Send push notification: "Refill AquaCell salt!"
```

---

## Data Updates

The device reports to the cloud approximately **once per day**.  
The app polls every **12 hours** to stay current.

---

## Technical Details

The API is reverse engineered from the official Android app, identical to the approach used by the [aioaquacell](https://github.com/Jordi1990/aioaquacell) Python library.  
Authentication uses **AWS Cognito** with email/password. Only the **refresh token** is stored — your password is never saved.

---

## ⚠️ Important Notes

- The **AWS Cognito Client ID** and **User Pool ID** in `lib/AquacellApi.js` are placeholders.  
  You need to extract the real values from the APK: `res/raw/amplifyconfiguration.json`  
  Tools like [APKTool](https://apktool.org/) or [jadx](https://github.com/skylot/jadx) can be used for this.

- The **API endpoint URLs** may need to be verified/updated.

---

## License

MIT
