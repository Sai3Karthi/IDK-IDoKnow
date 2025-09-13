import os
import requests
import json

def run_cli_chat():

    LLAMA_SERVER_URL = "http://127.0.0.1:8080"
    
    print("Connecting to llama.cpp server...")
    
    try:
        requests.get(f"{LLAMA_SERVER_URL}/health", timeout=5)
        print("[OK] Server is responsive.")
    except requests.RequestException as e:
        print(f"[ERR] llama.cpp server not found at {LLAMA_SERVER_URL}. Please ensure it is running.")
        print(f"  > Details: {e}")
        return

    print("Type 'exit' to quit.\n")

    history = []
    system_prompt = '''Your task: Generate UNIQUE perspectivesor ways to look at that information on the given input.

Rules:
1. If input is political → generate political perspectives.  
2. If input is non-political → generate perspectives for that topic.  
3. If input is nonsense or is not an information that can be analysed (e.g. "hello", "haaaa") → output : "provide valid input".  
4. DONT REPEAT PERSPECTIVES. EACH PERSPECTIVE MUST BE UNIQUE.
Output:
- Always exactly 70 perspectives (10 per color).  
- Ordered as a gradient:  
  red (far-left) → orange (center-left) → yellow (centrist) → green (center-right) → blue → indigo → violet (far-right).  
- Each color = 10 perspectives.  
- Each perspective must be different, not rephrased.  
- Start red as pure far-left, end red as slightly less leftist.  
- Orange starts slightly less leftist, ends slightly less centrist.  
- Yellow starts slightly less centrist, ends true centrist.  
- Green starts slightly less centrist, ends slightly less right.  
- Blue continues rightward, indigo more right, violet is far-right.  

Format:
Output must ONLY be JSON (no text, no notes).  

JSON format:
{
  "perspectives": [
    {"color": "red", "view": "Perspective 1..."},
    {"color": "red", "view": "Perspective 2..."},
    ...
    {"color": "violet", "view": "Perspective 50..."}
  ]
}

'''
    export_dir = "export"
    if not os.path.exists(export_dir):
        os.makedirs(export_dir)

    while True:
        try:
            user = input("You> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye.")
            break
        if user.lower() in {"exit", "quit", "q"}:
            print("Bye.")
            break

        prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
        prompt += f"<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n"

        payload = {
            "prompt": prompt,
            "n_predict": 65536,
            "temperature": 0.7,
            "stream": True,
            "stop": ["<|im_end|>", "user:"] # Stop tokens
        }

        print("Ramsami> ", end="", flush=True)
        full_response = ""
        try:
            with requests.post(f"{LLAMA_SERVER_URL}/completion", json=payload, stream=True) as response:
                response.raise_for_status()
                for chunk in response.iter_lines():
                    if chunk:
                        decoded_chunk = chunk.decode('utf-8')
                        if decoded_chunk.startswith('data: '):
                            try:
                                data = json.loads(decoded_chunk[6:])
                                content = data.get("content", "")
                                print(content, end="", flush=True)
                                full_response += content
                                if data.get("stop"):
                                    break
                            except json.JSONDecodeError:
                                continue # Ignore malformed data chunks
        except requests.RequestException as e:
            print(f"\n[ERR] Request to llama.cpp server failed: {e}")
            break

        print()  # Newline after model output

        # Check for "provide valid input"
        if "provide valid input" in full_response.lower():
            print("[Model requested valid input. Try again.]\n")
            continue

        # Try to parse as JSON and save
        try:
            data = json.loads(full_response)
            safe_filename = "".join(c if c.isalnum() else "_" for c in user[:20])
            output_file = f"{export_dir}/{safe_filename}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"\nJSON saved to {output_file}")
            break  # End conversation after saving
        except json.JSONDecodeError:
            print("[Model did not return valid JSON. Try again.]\n")
            continue


__all__ = ["run_cli_chat"]