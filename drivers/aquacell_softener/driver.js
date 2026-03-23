'use strict';

const Homey = require('homey');

// The Identity Pool ID is fixed for all AquaCell users.
// Extracted from the app's amplifyconfiguration.json via reverse engineering.
// Format: eu-west-1:<uuid>
// This value is the same for every user — it identifies the AquaCell app, not the user.
const AQUACELL_IDENTITY_POOL_ID = 'eu-west-1:f44120d5-bd20-4461-b282-1ed637861951';

class AquacellDriver extends Homey.Driver {

  async onInit() {
    this.log('AquaCell Driver initialized');
  }

  async onPair(session) {
    const api = this.homey.app.getApi();
    let savedTokens = {};

    // Set the identity pool ID so GetId works on first login
    if (AQUACELL_IDENTITY_POOL_ID && !AQUACELL_IDENTITY_POOL_ID.includes('TODO')) {
      api.identityPoolId = AQUACELL_IDENTITY_POOL_ID;
    }

    session.setHandler('login', async (data) => {
      const { username, password } = data; const email = username;;
      try {
        const tokens = await api.authenticate(username, password);
        savedTokens = {
          email,
          refreshToken: tokens.refreshToken,
        };
        return true;
      } catch (err) {
        this.error('Login failed:', err.message);
        throw new Error(this.homey.__('pairing.login_failed') + ': ' + err.message);
      }
    });

    session.setHandler('list_devices', async () => {
      try {
        const softeners = await api.getAllSofteners();

        // identityId is now known after getAllSofteners() — store it per device
        const identityId = api.identityId || null;

        return softeners.map(softener => ({
          name: softener.name || `AquaCell (${softener.serialNumber})`,
          data: {
            id: softener.serialNumber,
          },
          store: {
            refreshToken: savedTokens.refreshToken,
            identityId,
          },
        }));
      } catch (err) {
        this.error('Failed to list devices:', err.message);
        throw new Error(this.homey.__('pairing.fetch_failed') + ': ' + err.message);
      }
    });
  }

}

module.exports = AquacellDriver;
