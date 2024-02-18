const ws = new WebSocket('http://localhost:3000');

ws.onopen = () => {
    console.log('WebSocket connection established');
};

ws.onmessage = handleMessage;

ws.onclose = () => {
    console.log('WebSocket connection closed');
};

function handleMessage(event) {
    const data = JSON.parse(event.data);
    console.log('Received message from server:', data);

    if (data) {
        if (data.connect && data.count !== 0) {
            showErrorAlert('Connected!');
        }

        if (!data.connect && data.error) {
            showErrorAlert(`Printer connection failed: ${data.error}`);
            showFirmwareInfo(false);
            document.getElementById('upgradeSuccess').style.display = 'none';
        }

        if (data.upgrade_state) {
            handleUpgradeState(data.upgrade_state);
        }

        if (data.updating_state) {
            showFirmwareInfo(false);
            handleUpgradeProgress(data.updating_state);
        }

        if (data.upgrade_manager) {
            localStorage.setItem('previous_firmware', JSON.stringify(data.upgrade_manager));
        }

        if (data.repository_upgrade) {
            showErrorAlert(data.repository_upgrade);
        }
    }
}

function handleUpgradeState(upgradeState) {
    const { cur_ver, new_ver } = upgradeState;
    showFirmwareInfo(true, cur_ver, new_ver);
    localStorage.setItem('upgrade_firmware', JSON.stringify(upgradeState));
    if (new_ver > cur_ver) {
        handleUpgradeConfirm(upgradeState);
    } else {
        showUpdateButton();
    }
}

function showFirmwareInfo(show, cur_ver = '', new_ver = '') {
    const firmwareInfoDiv = document.getElementById('firmwareInfo');
    firmwareInfoDiv.style.display = show ? 'block' : 'none';
    if (show) {
        firmwareInfoDiv.innerHTML = `
            <h2>Printer Firmware Information</h2>
            <p>Current version: ${cur_ver}</p>
            <p>New version: ${new_ver}</p>
            <p></p>`;
    }
}

function handleUpgradeConfirm(upgradeState) {
    const { new_ver } = upgradeState;

    const previousFirmware = JSON.parse(localStorage.getItem('previous_firmware'));
    const customConfirmModal = document.getElementById('customConfirmModal');
    customConfirmModal.style.display = 'block';
    const confirmMessage = document.getElementById('customConfirmMessage');
    const confirmButton = document.getElementById('confirmButton');
    const cancelButton = document.getElementById('cancelButton');
    const closeModalButton = document.querySelector('.close');

    confirmMessage.textContent = `${new_ver} Version found. Are you sure you want to upgrade?`;

    const closeCustomConfirmModal = () => {
        customConfirmModal.style.display = 'none';
        showUpdateButton();
    };

    const handleConfirmUpgrade = async () => {
        closeCustomConfirmModal();
        await fetchUpdateData(undefined, previousFirmware);
        fetchUpdateData(previousFirmware[0], undefined);
    };

    const cancelButtonClickHandler = () => {
        closeCustomConfirmModal();
    };

    const closeModalButtonClickHandler = () => {
        closeCustomConfirmModal();
    };

    cancelButton.addEventListener('click', cancelButtonClickHandler);
    confirmButton.addEventListener('click', handleConfirmUpgrade);
    closeModalButton.addEventListener('click', closeModalButtonClickHandler);
    window.addEventListener('click', (event) => {
        if (event.target === customConfirmModal) {
            closeCustomConfirmModal();
        }
    });
}

function showUpdateButton() {
    const firmwareInfoDiv = document.getElementById('firmwareInfo');
    const firmwareInfoParagraph = firmwareInfoDiv.querySelector('p:nth-child(3)');
    if (firmwareInfoParagraph && !firmwareInfoParagraph.querySelector('.updateButton')) {
        const updateButton = document.createElement('button');
        updateButton.textContent = 'Update';
        updateButton.className = 'updateButton';
        updateButton.addEventListener('click', showFirmwarePopup);
        firmwareInfoParagraph.appendChild(updateButton);
    }
}

function handleUpgradeProgress(data) {
    const upgradeSuccessDiv = document.getElementById('upgradeSuccess');
    upgradeSuccessDiv.innerHTML = `<h2>Printer Updating... ${data.progress || '-'}%</h2>
                                 <p>STATUS: ${data.status || '-'}</p>
                                 <p>MESSAGE: ${data.message || '-'}</p>
                                 <p>MODULE: ${data.module || '-'}</p>
                                 <p></p>`;
    upgradeSuccessDiv.style.display = 'block';
}

async function showFirmwarePopup() {
    const firmwareListDiv = document.createElement('div');
    firmwareListDiv.id = 'firmwareList';
    firmwareListDiv.classList.add('popup-content');

    const selectFirmwareText = document.createElement('p');
    selectFirmwareText.textContent = 'Select firmware:';
    firmwareListDiv.appendChild(selectFirmwareText);

    const previousFirmware = JSON.parse(localStorage.getItem('previous_firmware'));
    const upgradeFirmware = JSON.parse(localStorage.getItem('upgrade_firmware'));
    await fetchUpdateData(undefined, previousFirmware);
    /**
    "firmware_optional": [
        {
            "firmware": {
                "version": "01.05.01.00",
                "force_update": false,
                "url": "https://public-cdn.bambulab.com/upgrade/device/C11/01.05.01.00/product/f7faad4e47/ota-p003_v01.05.01.00-20240104183353.json.sig",
                "description": "",
                "status": "release"
            },
            "ams": []
        },
        {}
    ]
    */
    previousFirmware?.forEach(data => {
        const firmwareOption = document.createElement('button');
        firmwareOption.textContent = data.firmware.version;
        firmwareOption.classList.add('firmware-option');
        firmwareOption.classList.add('popup-button');
        firmwareOption.addEventListener('click', () => handleFirmwareSelection(data, upgradeFirmware));
        firmwareListDiv.appendChild(firmwareOption);
    });

    showFirmwareInfo(true, upgradeFirmware.cur_ver, upgradeFirmware.new_ver);
    const firmwareInfoDiv = document.getElementById('firmwareInfo');
    firmwareInfoDiv.innerHTML = '';
    firmwareInfoDiv.appendChild(firmwareListDiv);
}

function handleFirmwareSelection(selectedFirmware, upgradeFirmware) {
    const customConfirmModal = document.getElementById('customConfirmModal');
    customConfirmModal.style.display = 'none';
    const firmwareListDiv = document.getElementById('firmwareList');
    firmwareListDiv.parentNode.removeChild(firmwareListDiv);

    const firmwareInfoDiv = document.getElementById('firmwareInfo');
    firmwareInfoDiv.innerHTML = `
        <h2>Printer Firmware Information</h2>
        <p>Current version: ${upgradeFirmware.cur_ver}</p>
        <p>New version: ${upgradeFirmware.new_ver}</p>
        <button onclick="showFirmwarePopup()" style="background-color: green; color: white; border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px;">Update</button>
    `;
    firmwareInfoDiv.style.display = 'block';

    fetchUpdateData(selectedFirmware, undefined);
}

async function fetchUpdateData(selectedFirmware, previousFirmware) {
    const url = 'https://raw.githubusercontent.com/lunDreame/lundreame.github.io/main/assets/upgrade.json';

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();

        if (!selectedFirmware) {
            const urlMap = data.reduce((map, item) => {
                const firmwareUrl = item.upgrade.firmware_optional?.firmware?.url.split('/')[5];
                map[firmwareUrl] = item.upgrade.firmware_optional;
                return map;
            }, {});

            const previousFirmwareUrl = previousFirmware[0].firmware.url.split('/')[5];
            if (urlMap[previousFirmwareUrl]) {
                previousFirmware.unshift(urlMap[previousFirmwareUrl]);
            } else {
                throw new Error('Previous firmware not found in the update data');
            }
        } else {
            data[4].upgrade.firmware_optional = selectedFirmware;
            ws.send(JSON.stringify({ 'should_upgrade': data[4] }));
        }
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
    }
}

/** 
function getUpdateAddress(deviceId) {
    const addressMap = {
        '01S': 'C11',
        '01P': 'C12',
        '030': 'N1',
        '039': 'N2S',
    };

    const prefix = deviceId.substring(0, 3);
    if (addressMap[prefix]) {
        return addressMap[prefix];
    } else {
        throw new Error("The current printer's update address could not be found.");
    }
}
*/

function showErrorAlert(message) {
    alert(message);
}

async function sendMessageToServer() {
    const host = document.getElementById('hostInput').value.trim();
    const accessCode = document.getElementById('accessCodeInput').value.trim();
    const deviceId = document.getElementById('deviceIdInput').value.trim().toUpperCase();

    if (!host && !accessCode && deviceId) {
        if (confirm('Develop update mode. Do you want to update server upgrade url?')) {
            var isValidData = isValidInputValue('192.168.1.1', '00000000', deviceId);
        }
    } else {
        var isValidData = isValidInputValue(host, accessCode, deviceId);
    }

    if (Object.keys(isValidData).length !== 0) {
        showErrorAlert(JSON.stringify(isValidData));
        return;
    }

    if (!host && !accessCode && deviceId) {
        await clearIuputSection(deviceId);
    } else {
        const data = {
            'connect': { 'host': host, 'access_code': accessCode, 'device_id': deviceId }
        };
        ws.send(JSON.stringify(data));
    }
}

function sendNewInputSection() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const deviceId = document.getElementById('deviceIdInput').value;

    const data = {
        'connect': { 'username': username, 'password': password, 'device_id': deviceId }
    };
    ws.send(JSON.stringify(data));
}

async function clearIuputSection(deviceId) {
    const inputSection = document.getElementById('inputSection');
    inputSection.innerHTML = `
            <h1>PRINTER UPDATE</h1>
            <input type="text" id="usernameInput" placeholder="Cloud Username">
            <input type="text" id="passwordInput" placeholder="Cloud Password">
            <input type="text" id="deviceIdInput" placeholder="Printer SN" value="${deviceId}">
            <button onclick="sendNewInputSection()">Send</button>
    `;
}

function isValidInputValue(host, accessCode, deviceId) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    const snRegex = /^(00[MW]|03W|01[SPT]|030|039)[a-zA-Z0-9]{12}$/;

    const isValidData = {};

    if (!ipRegex.test(host)) {
        isValidData['Host'] = 'Invalid IP address';
    }
    if (accessCode.length !== 8) {
        isValidData['AccessCode'] = 'Invalid Access Code';
    }
    if (!snRegex.test(deviceId)) {
        isValidData['SN'] = 'Invalid Serial Number';
    }

    return isValidData;
}

function handleCancelButtonClick() {
    const customConfirmModal = document.getElementById('customConfirmModal');
    customConfirmModal.style.display = 'none';
    showUpdateButton();
}
