const axios = require('axios');


class BambuLabAPI {
    constructor() {
        this.account = '';  
        this.password = '';  
        this.loginUrl = 'https://bambulab.com/api/sign-in/form';
        this.apiUrl = 'https://api.bambulab.com';
        this.deviceIndex = 0;
        this.accessToken = '';
    }

    async login() {
        const options = {
            url: this.loginUrl,
            method: 'POST',
            data: { 'account': this.account, 'password': this.password, 'apiError': '' }
        }

        const response = await axios(options);

        if (response.status === 200) {
            console.log('LOGIN OK!');
        } else {
            console.log('LOGIN_FAIL:', response.data);
            return;
        }
        if (response.status === 200 && response.data.tfaKey === '') {
            setTimeout(() => {
                const setCookieHeader = response.headers['set-cookie'];
                if (setCookieHeader) {
                    const cookies = setCookieHeader.map(cookie => cookie.split(';')[0]);
                    const token = cookies.find(cookie => cookie.includes('token=')).replace('token=', '');
                    this.accessToken = token;
                    this.userBindedDevice();
                }
            }, 1000)
        }
    }

    async refreshToken() {
        const options = {
            url: `${this.apiUrl}/v1/user-service/user/refreshtoken`,
            method: 'POST',
            data: { "refreshToken": this.accessToken }
        }

        const response = await axios(options);

        if (response.status === 200) {
            if (response.status !== 200) {
                console.log(response.error);
                return;
            }
            if (response.data['accessToken'] || response.data['refreshToken']) {
                this.accessToken = response.data['accessToken'];
            }
        }
    }
    
    async userBindedDevice() {
        const options = {
            url: `${this.apiUrl}/v1/iot-service/api/user/bind`,
            method: 'GET',
            headers: { authorization: `Bearer ${this.accessToken}` },
            data: {}
        }

        const response = await axios(options);

        if (response.status === 200) {
            if (response.data.devices !== null) {
                console.log('USER_BIND_DEV:', JSON.stringify(response.data.devices));
                this.serialNumber = response.data.devices[this.deviceIndex].dev_id;
                this.getDeviceVersion();
            } else {
                console.log('USER_BIND_DEV: No device')
            }
        } else {
            console.log(response.error);
        }
    }

    async getDeviceVersion() {
        const options = {
            url: `${this.apiUrl}/v1/iot-service/api/user/device/version?dev_id=${this.serialNumber}`,
            method: 'GET',
            headers: { authorization: `Bearer ${this.accessToken}` },
            data: {}
        }

        const response = await axios(options);

        if (response.status === 200) {
            console.log('PRINTER_OTA:', JSON.stringify(response.data.devices));
        } else {
            console.log(response.error);
        }
    }

}

new BambuLabAPI().login();
