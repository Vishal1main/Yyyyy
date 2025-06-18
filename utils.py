import os
import requests

def download_file(url, filename="file"):
    response = requests.get(url, stream=True)
    content_disposition = response.headers.get("content-disposition")
    ext = ""
    if content_disposition and "filename=" in content_disposition:
        ext = content_disposition.split("filename=")[-1].strip('"')
    else:
        ext = url.split("/")[-1]
    final_name = f"{filename}_{ext}" if filename else ext
    with open(final_name, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    return final_name
