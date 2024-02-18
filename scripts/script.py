import requests
import json
import os
import base64

# GitHub repository information
repo_owner = 'lunDreame'
repo_name = 'lundreame.github.io'
branch_name = 'main'  

# GitHub personal access token
access_token = os.environ['ACCESS_TOKEN'] 

# GitHub API endpoint
base_url = f'https://api.github.com/repos/{repo_owner}/{repo_name}/contents/'
headers = {
    'Authorization': f'token {access_token}',
    'Accept': 'application/vnd.github.v3+json'
}

def get_upgrade_data():
    file_path = 'assets/upgrade.json'
    url = base_url + file_path

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  

        content = response.json().get('content')
        if content:
            try:
                decoded_content = base64.decodebytes(content.encode('utf-8')).decode('utf-8')
                data = json.loads(decoded_content)
                return data
            except json.JSONDecodeError as e:
                print(f'Error decoding JSON content: {e}')
        else:
            print(f'Empty content returned for file: {file_path}')
    except requests.exceptions.RequestException as e:
        print(f'Error retrieving file content: {e}')

    return None

def create_file(index, content):
    file_path = f'self_mqttx/main{index}_firmware.json'
    url = base_url + file_path

    content_bytes = content.encode('utf-8')
    content_base64 = base64.b64encode(content_bytes).decode('utf-8')

    payload = {
        'message': f'Update {file_path}',
        'content': content_base64,
        'branch': branch_name
    }

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        existing_content = response.json().get('content', '')

        existing_content_bytes = base64.decodebytes(existing_content.encode('utf-8')).decode('utf-8')

        if existing_content_bytes.strip() != content.strip():
            response = requests.put(url, headers=headers, json=payload)
            response.raise_for_status()
            print(f'File {file_path} updated successfully.')
        else:
            print(f'File {file_path} already up to date. No changes made.')

    except requests.exceptions.RequestException as e:
        print(f'Failed to update file {file_path}. Error: {e}')

upgrade_data = get_upgrade_data()
if upgrade_data:
    upgrade_data.pop()
    for index, item in enumerate(upgrade_data):
        content = json.dumps(item, indent=4)
        create_file(index, content)
else:
    print('No upgrade data available.')

