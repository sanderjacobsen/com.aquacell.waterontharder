'use strict';

const https = require('https');
const crypto = require('crypto');
const { CognitoUserPool, CognitoUser, AuthenticationDetails } = require('amazon-cognito-identity-js');

const CONFIG = {
  region: 'eu-west-1',
  clientId: '64kp67l1jo9toeesan7s1sdpae',
  userPoolId: 'eu-west-1_noZbcE2Av',
  apiHost: 'y7xyrocicl.execute-api.eu-west-1.amazonaws.com',
  apiService: 'execute-api',
  identityPoolId: 'eu-west-1:f44120d5-bd20-4461-b282-1ed637861951',
};

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          else resolve(parsed);
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function hmacSha256(key, data, encoding) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(encoding);
}
function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}
function getSigningKey(secretKey, dateStamp, region, service) {
  const kDate    = hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}
function buildSignedHeaders({ method, host, path, payload, region, service, credentials }) {
  const now = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash  = sha256(payload || '');
  const headers = {
    'cache-control':        'no-store',
    'content-type':         'application/json',
    'host':                 host,
    'user-agent':           'amplify-iOS/1.31.0 iOS/26.3.1 en_NL',
    'x-amz-date':           amzDate,
    'x-amz-security-token': credentials.sessionToken,
  };
  const sortedKeys      = Object.keys(headers).sort();
  const signedHeaderStr = sortedKeys.join(';');
  const canonicalHdrs   = sortedKeys.map(k => `${k}:${headers[k]}\n`).join('');
  const canonicalReq    = [method, path, '', canonicalHdrs, signedHeaderStr, bodyHash].join('\n');
  const credScope       = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign    = ['AWS4-HMAC-SHA256', amzDate, credScope, sha256(canonicalReq)].join('\n');
  const signingKey      = getSigningKey(credentials.secretKey, dateStamp, region, service);
  const signature       = hmacSha256(signingKey, stringToSign, 'hex');
  return {
    ...headers,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credScope}, SignedHeaders=${signedHeaderStr}, Signature=${signature}`,
  };
}

class AquacellApi {
  constructor() {
    this.idToken         = null;
    this.refreshToken    = null;
    this.accessToken     = null;
    this._awsCredentials = null;
    this.identityId      = null;
    this.identityPoolId  = null;
  }

  authenticate(email, password) {
    return new Promise((resolve, reject) => {
      const userPool = new CognitoUserPool({
        UserPoolId: CONFIG.userPoolId,
        ClientId:   CONFIG.clientId,
      });
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (result) => {
          this.idToken      = result.getIdToken().getJwtToken();
          this.accessToken  = result.getAccessToken().getJwtToken();
          this.refreshToken = result.getRefreshToken().getToken();
          this._awsCredentials = null;
          resolve({ idToken: this.idToken, refreshToken: this.refreshToken });
        },
        onFailure: (err) => reject(err),
      });
    });
  }

  authenticateWithRefreshToken(refreshToken) {
    return new Promise((resolve, reject) => {
      const { CognitoRefreshToken } = require('amazon-cognito-identity-js');
      const userPool = new CognitoUserPool({
        UserPoolId: CONFIG.userPoolId,
        ClientId:   CONFIG.clientId,
      });
      const cognitoUser = new CognitoUser({ Username: 'user', Pool: userPool });
      const token = new CognitoRefreshToken({ RefreshToken: refreshToken });

      cognitoUser.refreshSession(token, (err, result) => {
        if (err) return reject(err);
        this.idToken      = result.getIdToken().getJwtToken();
        this.accessToken  = result.getAccessToken().getJwtToken();
        this.refreshToken = refreshToken;
        this._awsCredentials = null;
        resolve({ idToken: this.idToken, refreshToken: this.refreshToken });
      });
    });
  }

  async _getAwsCredentials() {
    if (this._awsCredentials && this._awsCredentials.expiration > Date.now() + 60000) {
      return this._awsCredentials;
    }
    if (!this.idToken) throw new Error('Not authenticated');
    const providerKey = `cognito-idp.${CONFIG.region}.amazonaws.com/${CONFIG.userPoolId}`;

    if (!this.identityId) {
      const poolId = this.identityPoolId || CONFIG.identityPoolId;
      const idBody = JSON.stringify({ IdentityPoolId: poolId, Logins: { [providerKey]: this.idToken } });
      const idResult = await httpsRequest({
        hostname: `cognito-identity.${CONFIG.region}.amazonaws.com`,
        path: '/', method: 'POST',
        headers: { 'X-Amz-Target': 'AWSCognitoIdentityService.GetId', 'Content-Type': 'application/x-amz-json-1.1', 'Content-Length': Buffer.byteLength(idBody) },
      }, idBody);
      this.identityId = idResult.IdentityId;
      if (!this.identityId) throw new Error('Could not get Identity ID');
    }

    const credBody = JSON.stringify({ IdentityId: this.identityId, Logins: { [providerKey]: this.idToken } });
    const credResult = await httpsRequest({
      hostname: `cognito-identity.${CONFIG.region}.amazonaws.com`,
      path: '/', method: 'POST',
      headers: { 'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity', 'Content-Type': 'application/x-amz-json-1.1', 'Content-Length': Buffer.byteLength(credBody) },
    }, credBody);

    const creds = credResult.Credentials;
    if (!creds) throw new Error('Could not get AWS credentials');
    this._awsCredentials = {
      accessKeyId:  creds.AccessKeyId,
      secretKey:    creds.SecretKey,
      sessionToken: creds.SessionToken,
      expiration:   new Date(creds.Expiration).getTime(),
    };
    return this._awsCredentials;
  }

  async getAllSofteners() {
    if (!this.idToken) throw new Error('Not authenticated');
    const credentials = await this._getAwsCredentials();
    const path = '/prod/v1/softeners/all/';
    const signedHeaders = buildSignedHeaders({ method: 'GET', host: CONFIG.apiHost, path, payload: '', region: CONFIG.region, service: CONFIG.apiService, credentials });
    const data = await httpsRequest({ hostname: CONFIG.apiHost, path, method: 'GET', headers: signedHeaders });
    const softeners = Array.isArray(data) ? data : (data.softeners || [data]);
    return softeners.map(s => this._parseSoftener(s));
  }

  _parseSoftener(data) {
    const salt = data.salt || {};
    const wifiMap = { high: 100, medium: 60, low: 30 };
    return {
      serialNumber:        data.dsn || data.ssn || 'unknown',
      name:                data.name || 'AquaCell',
      saltLeftPercentage:  data.salt ? salt.leftPercent  : null,
      saltRightPercentage: data.salt ? salt.rightPercent : null,
      saltDaysLeft:        data.salt ? salt.daysLeft     : null,
      lidBatteryLevel:     typeof data.battery === 'number' ? data.battery : null,
      wifiStrength:        typeof data.wifiLevel === 'string' ? (wifiMap[data.wifiLevel] ?? null) : null,
      lastUpdate:          data.lastUpdate ? new Date(data.lastUpdate).toISOString() : null,
      _raw: data,
    };
  }

  setIdentityId(id) { this.identityId = id; }
  _safeNumber(val) { if (val == null) return null; const n = Number(val); return isNaN(n) ? null : n; }
}

module.exports = AquacellApi;
