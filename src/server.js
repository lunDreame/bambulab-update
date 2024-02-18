const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());

class WebSocketServer {
    constructor(httpServer) {
        this.wss = new WebSocket.Server({ server: httpServer });
        this.mqttInstance = null;

        this.wss.on('connection', (ws) => {
            console.log('WebSocket connection established');

            ws.on('message', (message) => {
                const receivedData = JSON.parse(message);
                console.log('Received message from client:', JSON.stringify(receivedData));

                if (receivedData?.connect && Object.keys(receivedData.connect).length === 3) {
                    if (['username', 'password'].some(key => receivedData.connect.hasOwnProperty(key))) {
                        const { username, password, device_id } = receivedData.connect;
                        this.bambuInstance = new BambulabAPI(username, password, device_id, this.wss);
                        this.bambuInstance.createCloud();
                    } else {
                        const { host, access_code, device_id } = receivedData.connect;
                        this.mqttInstance = new MQTTClient(host, access_code, device_id, this.wss);
                        this.mqttInstance.createClient();
                    }
                }

                if (receivedData?.should_upgrade && this.mqttInstance) {
                    this.mqttInstance.sendPrinterRequest({ command: 1, url: receivedData.should_upgrade });
                }
            });
        });

        this.wss.on('close', () => {
            console.log('WebSocket connection closed');
        });
    }
}

class BambulabAPI {
    constructor(username, password, deviceId, wss) {
        this.username = username;
        this.password = password;
        this.deviceId = deviceId;
        this.wss = wss;
    }

    async createCloud() {
        this.connect();
    }

    sendWss(data) {
        const jsonData = JSON.stringify(data);
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonData);
            }
        });
    }

    async connect() {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const chinaPhoneRegex = /^(\+\d{2,3}\s*)?(\d{11})$/;

        if (emailRegex.test(this.username)) {
            const accessToken = await this.signin('com', this.username, this.password);
            const deviceVersion = await this.getDeviceVersion('com', this.deviceId, accessToken);
            if (deviceVersion.devices[0]) {
                this.replaceEarlierVersion(deviceVersion.devices[0].firmware[0], deviceVersion.devices[0].ams);
            }
        }

        if (chinaPhoneRegex.test(this.username)) {
            const accessToken = await this.signin('cn', this.username, this.password);
            const deviceVersion = await this.getDeviceVersion('cn', this.deviceId, accessToken);
            if (deviceVersion.devices[0]) {
                this.replaceEarlierVersion(deviceVersion.devices[0].firmware[0], deviceVersion.devices[0].ams);
            }
        }
    }

    async signin(region, username, password) {
        const options = {
            url: `https://bambulab.${region}/api/sign-in/form`,
            method: 'POST',
            data: { 'account': username, 'password': password, 'apiError': '' }
        }

        try {
            const response = await axios(options);
            const setCookieHeader = response.headers['set-cookie'];
            const cookies = setCookieHeader.map(cookie => cookie.split(';')[0]);
            const token = cookies.find(cookie => cookie.includes('token=')).replace('token=', '');

            console.log('Access Token:', token.slice(0, 10) + '*'.repeat(token.length - 20) + token.slice(-10))
            return token;
        } catch (error) {
            /**
             * Response code 400 means the account information is incorrect
            */
            console.log(`Login failed, please try again: ${error.message}`);
        }
    }

    async getDeviceVersion(region, deviceId, token) {
        const options = {
            url: `https://bambulab.${region}/api/v1/iot-service/api/user/device/version?dev_id=${deviceId}`,
            method: 'GET',
            headers: { 'authorization': `Bearer ${token}` },
            data: {},
        }

        try {
            const response = await axios(options);
            console.log('Device Version:', JSON.stringify(response.data.devices[0]));
            return response.data;
        } catch (error) {
            console.log(`Device Version faild, please try again: ${error.message}`);
        }
    }

    async replaceEarlierVersion(firmware, ams) {
        const options = {
            url: 'https://raw.githubusercontent.com/lunDreame/lundreame.github.io/main/assets/upgrade.json',
            method: 'GET',
        }

        try {
            const response = await axios(options);
            response.data[4].upgrade.firmware_optional['firmware'] = firmware;
            response.data[4].upgrade.firmware_optional['ams'] = ams;

            const addressIndex = { '01S': 0, '01P': 1, '030': 2, '039': 3 }[this.deviceId.substring(0, 3)];
            if (response.data[addressIndex].upgrade.firmware_optional.firmware.version <
                response.data[4].upgrade.firmware_optional.firmware.version
            ) {
                this.sendWss({ 'repository_upgrade': 'Check repository version! Thank you for the update information.' });
                this.createPullRequest(addressIndex, response.data[4]);
            } else {
                this.sendWss({ 'repository_upgrade': "Check repository version! It's already the latest version. Thank you" });
            }
        } catch (error) {
            console.log(`RE Earlier Version faild, please try again: ${error.message}`);
        }
    }

    createPullRequest(addressIndex, newUpgradeJson) {
        const baseUrl = 'https://api.github.com/repos/lunDreame/lundreame.github.io';
        const headers = {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json'
        };

        axios.get(`${baseUrl}/contents/assets/upgrade.json?ref=develop`, { headers })
            .then(response => {
                const content = Buffer.from(response.data.content, 'base64').toString();
                const upgradeJson = JSON.parse(content);
                upgradeJson[addressIndex] = newUpgradeJson;

                const updatedContent = JSON.stringify(upgradeJson, null, 4);
                const updateData = {
                    message: 'Update upgrade.json',
                    content: Buffer.from(updatedContent).toString('base64'),
                    sha: response.data.sha,
                    branch: 'develop'
                };

                return axios.put(`${baseUrl}/contents/assets/upgrade.json`, updateData, { headers });
            })
            .then(() => {
                const prData = {
                    title: 'Merge develop into main',
                    head: 'develop',
                    base: 'main'
                };
                return axios.post(`${baseUrl}/pulls`, prData, { headers });
            })
            .then(response => {
                console.log('PR created successfully');
            })
            .catch(error => {
                console.error('Error occurred:', error.message);
            });
    }
}

class MQTTClient {
    constructor(host, accessCode, deviceId, wss) {
        this.client = null;
        this.host = host;
        this.port = 8883;
        this.username = 'bblp';
        this.accessCode = accessCode;
        this.deviceId = deviceId;
        this.wss = wss;
    }

    connect() {
        this.client = mqtt.connect({
            host: this.host,
            port: this.port,
            username: this.username,
            password: this.accessCode,
            protocol: 'mqtts',
            rejectUnauthorized: false,
            keepalive: 60,
            //clean: true,
        });

        let reconnectAttempt = 0;

        this.client.on('connect', () => {
            console.log('Connected to MQTT broker');

            const topic = `device/${this.deviceId}/report`;
            this.client.subscribe(topic);

            this.sendWss({ 'connect': true, 'count': reconnectAttempt });
            this.sendPrinterRequest({ command: 0 });

            reconnectAttempt = 0;
        });

        this.client.on('error', (error) => {
            if (reconnectAttempt === 0) {
                console.error('Error:', error);
                this.sendWss({ 'connect': false, 'error': error.message });
            }

            console.log('Reconnecting...');
            this.client.reconnect();
            reconnectAttempt++;
        });

        this.client.on('message', (topic, message) => {
            const jsonData = JSON.parse(message.toString());
            this.handleUpgrade(jsonData);
        });
    }

    handleUpgrade(jsonData, upgradingInProgress = false) {
        const printUpgradeState = jsonData?.print?.upgrade_state;
        const isPrintUpgradeValid = this.validatePrintUpgradeState(printUpgradeState, false);

        if (isPrintUpgradeValid) {
            this.sendWss({ 'updating_state': printUpgradeState });

            if (printUpgradeState.status === 'UPGRADE_SUCCESS') {
                upgradingInProgress = false;
            }
        }

        if (jsonData?.info?.sequence_id === '0') {
            this.sendWss({ 'upgrade_state': { 'cur_ver': jsonData.info.module[0].sw_ver, 'new_ver': '-' } });
        }

        if (jsonData?.upgrade?.sequence_id === '0') {
            this.sendWss({ 'upgrade_manager': jsonData.upgrade.firmware_optional });

            if (jsonData.upgrade.result === 'success') {
                upgradingInProgress = true;
            }
        }
    }

    validatePrintUpgradeState(upgradeState, upgradingInProgress) {
        const newVerList = upgradeState?.new_ver_list?.[0];
        const hasValidKeys = upgradeState && Object.keys(upgradeState).length < 5 &&
            ['progress', 'status', 'message', 'module'].some(key => upgradeState.hasOwnProperty(key));

        if (newVerList && !upgradingInProgress) {
            this.sendWss({ 'upgrade_state': { 'cur_ver': newVerList.cur_ver, 'new_ver': newVerList.new_ver } });
        }

        return hasValidKeys;
    }

    createClient() {
        this.connect();
    }

    sendPrinterRequest({ command, url }) {
        const topic = `device/${this.deviceId}/request`;

        if (command === 0) {
            const data = [
                { "pushing": { "sequence_id": "0", "command": "pushall", "version": 1, "push_target": 1 } },
                { "info": { "sequence_id": "0", "command": "get_version" } },
                { "upgrade": { "sequence_id": "0", "command": "get_history" } },
            ];

            data.forEach((item) => {
                this.client.publish(topic, JSON.stringify(item));
            });
        } else if (command === 1) {
            this.client.publish(topic, JSON.stringify(url));
        }
    }

    sendWss(data) {
        const jsonData = JSON.stringify(data);
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonData);
            }
        });
    }
}

const httpServer = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const serverWss = new WebSocketServer(httpServer);
