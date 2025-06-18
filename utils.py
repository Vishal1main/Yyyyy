import requests

def download_file(url, custom_name=None):
    response = requests.get(url, stream=True)
    original_name = url.split("/")[-1].split("?")[0]
    file_name = custom_name if custom_name else original_name
    with open(file_name, "wb") as f:
        for chunk in response.iter_content(1024 * 1024):
            f.write(chunk)
    return file_name
