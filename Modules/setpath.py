import requests
import tkinter as tk
from tkinter import filedialog
import time
from requests.exceptions import RequestException, ReadTimeout

SERVER_URL = "http://127.0.0.1:8000/"

def choose_paths():
    root = tk.Tk()
    root.withdraw()  # hide main window

    llama_path = filedialog.askdirectory(title="Select Llama folder")
    models_path = filedialog.askdirectory(title="Select Models folder")

    return llama_path, models_path


def setup():
  
    for retry in range(3):
        try:
            r = requests.get(SERVER_URL+"config", timeout=1)
            config = r.json()
            break
        except (requests.RequestException, requests.Timeout):
            print(f"Waiting for server... ({retry+1}/10)")
            time.sleep(1)
    else:
        print("Server not responding after 3 attempts. Exiting.")
        return

    if config.get("llama_path") and config.get("models_path"):
        print("Config already set, exiting.")
        return

    # Ask user for input
    llama_path, models_path = choose_paths()

    if llama_path and models_path:
        payload = {"llama_path": llama_path, "models_path": models_path}
        requests.post(SERVER_URL+"config", json=payload, timeout=5)
    else:
        print("User cancelled path selection.")
def main():
    setup()
  
    time.sleep(2)
   
    try:
        requests.post(SERVER_URL+"activate", timeout=2)
    except (ReadTimeout, RequestException):
        # Activation starts a background thread and may not respond in time
        pass
   

if __name__ == "__main__":
    main()
