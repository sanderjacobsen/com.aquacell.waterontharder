'use strict';

const Homey = require('homey');

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

class AquacellDevice extends Homey.Device {

  async onInit() {
    this.log('AquaCell Device initialized:', this.getName());

    // Register custom capabilities if not yet present
    const caps = ['measure_salt_left', 'measure_salt_right', 'measure_salt_days_left', 'measure_last_update', 'measure_wifi_strength'];
    for (const cap of caps) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap);
        this.log('Added capability:', cap);
      }
    }

    await this._fetchAndUpdate().catch(err => this.error('Initial fetch failed:', err.message));

    this._pollInterval = this.homey.setInterval(async () => {
      await this._fetchAndUpdate().catch(err => this.error('Poll failed:', err.message));
    }, POLL_INTERVAL_MS);
  }

  async onDeleted() {
    if (this._pollInterval) this.homey.clearInterval(this._pollInterval);
  }

  async _fetchAndUpdate() {
    const api = this.homey.app.getApi();
    const { refreshToken, identityId } = this.getStore();
    const serialNumber = this.getData().id;

    if (identityId) api.setIdentityId(identityId);
    await api.authenticateWithRefreshToken(refreshToken);

    if (api.identityId && api.identityId !== identityId) {
      await this.setStoreValue('identityId', api.identityId).catch(() => {});
    }

    const softeners = await api.getAllSofteners();
    const softener = softeners.find(s => s.serialNumber === serialNumber);

    if (!softener) {
      this.setUnavailable(this.homey.__('device.not_found'));
      return;
    }

    this.setAvailable();

    // Set all capability values
    const updates = {
      measure_salt_left:      softener.saltLeftPercentage,
      measure_salt_right:     softener.saltRightPercentage,
      measure_salt_days_left: softener.saltDaysLeft,
      measure_battery:        softener.lidBatteryLevel,
      measure_wifi_strength:  softener.wifiStrength,
    };

    for (const [cap, value] of Object.entries(updates)) {
      if (value !== null && value !== undefined) {
        await this.setCapabilityValue(cap, value).catch(err =>
          this.error(`Failed to set ${cap}:`, err.message)
        );
      }
    }

    // Last update as setting
    await this.setCapabilityValue("measure_last_update", softener.lastUpdate ? new Date(softener.lastUpdate).toLocaleString("nl-NL") : "-").catch(() => {});

    if (softener.lastUpdate) {
      await this.setSettings({ last_update: softener.lastUpdate }).catch(() => {});
    }

    this.log(`Updated: L=${softener.saltLeftPercentage}% R=${softener.saltRightPercentage}% days=${softener.saltDaysLeft}`);
  }

}

module.exports = AquacellDevice;
