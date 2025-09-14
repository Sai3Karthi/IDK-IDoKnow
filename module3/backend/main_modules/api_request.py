"""Vertex-only perspective generator.

Required final JSON format:
{
    "input": "<original statement>",
    "perspectives": [
         {"color":"red","bias_x":0.0,"significance_y":1.0,"text":"..."},
         ... total N perspectives ...
    ]
}

Rules:
    * Number of perspectives (N) calculated based on significance score (s) from input.json:
      N = ceiling(128 · (s^2.8) + 8) where s ∈ [0,1]
    * bias_x linearly spaced from 0 to 1 inclusive.
    * significance_y = 1 - bias_x (impact mapping).
    * Colors: 7 colors (red, orange, yellow, green, blue, indigo, violet) assigned in blocks as evenly as possible.
    * Avoid duplicates: feed previously generated perspective texts back in prompt for next batch.
    * Model asked ONLY for JSON array of new perspective objects (no wrapping braces) for each batch.
    * We concatenate batches and finally serialize single JSON object.
"""

import argparse
import os
import sys
from typing import List, Dict, Any, Set
import requests
import json

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass  # optional dependency

# Import our modular components
from modules.vertex_client import build_client, call_model
from modules.json_utils import load_input, write_output, parse_model_output
from modules.prompt_builder import build_color_prompt, build_repair_prompt
from modules.perspective_utils import (
    build_scaffold, 
    group_by_color, 
    validate_and_categorize_perspectives,
    process_repair_results
)

VERTEX_ENDPOINT_ENV = "VERTEX_ENDPOINT"


def load_config():
    """Load configuration from config.json."""
    config_path = os.path.join(os.path.dirname(__file__), "..", "config.json")
    with open(config_path, "r") as config_file:
        return json.load(config_file)


def run_pipeline(args):
    """Main pipeline for generating structured perspectives."""
    # Load and validate input
    statement, significance = load_input(args.input)
    
    # Calculate perspective count based on the formula: 128 · (s^2.8) + 8{s≥0}{s≤1}
    # The indicator functions {s≥0} and {s≤1} both equal 1 since we clamp significance to [0,1]
    import math
    perspective_count = int(math.ceil(128 * (significance ** 2.8) + 8))
    print(f"[info] Significance score: {significance}, calculated perspective count: {perspective_count}")
    
    scaffold = build_scaffold(perspective_count)
            
    # Get endpoint and build client
    endpoint = args.endpoint or os.environ.get(VERTEX_ENDPOINT_ENV) or args.model
    if not endpoint:
        raise SystemExit("No endpoint provided. Use --endpoint or set VERTEX_ENDPOINT in .env")
    
    try:
        client = build_client(endpoint)
    except Exception as e:
        print("[error] Client init failed:", e, file=sys.stderr)
        return 1
    
    # Process perspectives by color groups
    existing_texts: Set[str] = set()
    all_persp: List[Dict[str, Any]] = []
    color_groups = group_by_color(scaffold)
    
    # Optionally stream each color group via callback
    stream_callback = getattr(args, "stream_callback", None)

    for ci, group in enumerate(color_groups):
        color_name = group[0]['color']
        print(f"[info] Processing {color_name} perspectives ({len(group)} items)")

        # Generate main batch for this color
        prompt_text = build_color_prompt(statement, group, existing_texts)
        raw = call_model(client, endpoint, prompt_text, temperature=args.temperature)

        try:
            generated = parse_model_output(raw)
        except Exception as e:
            print(f"[warn] {color_name} parse failed, retrying with lower temperature")
            raw_retry = call_model(client, endpoint, prompt_text, temperature=0.2)
            generated = parse_model_output(raw_retry)

        # Validate and categorize results
        valid_perspectives, needs_repair = validate_and_categorize_perspectives(
            group, generated, existing_texts
        )

        # Batch repair if needed (max 3 items to avoid overwhelming)
        if needs_repair:
            print(f"[info] Repairing {len(needs_repair)} items for {color_name}")
            repair_batches = [needs_repair[i:i+3] for i in range(0, len(needs_repair), 3)]

            for batch in repair_batches:
                repair_items = []
                for _, slot, gen in batch:
                    repair_items.append({
                        "color": slot["color"],
                        "bias_x": slot["bias_x"],
                        "current_text": gen.get("text", ""),
                        "current_significance": gen.get("significance_y", "")
                    })

                repair_prompt = build_repair_prompt(statement, repair_items, existing_texts)

                try:
                    repair_raw = call_model(client, endpoint, repair_prompt, temperature=0.3, delay_after=1.5)
                    repair_results = parse_model_output(repair_raw)

                    # Process repair results
                    repaired = process_repair_results(batch, repair_results, existing_texts)
                    valid_perspectives.extend(repaired)

                except Exception as e:
                    print(f"[warn] Repair failed, using fallbacks")
                    # Use fallbacks for all items in this batch
                    fallback_perspectives = []
                    for orig_i, slot, gen in batch:
                        from modules.perspective_utils import create_fallback_perspective
                        fallback = create_fallback_perspective(slot)
                        existing_texts.add(fallback["text"])
                        fallback_perspectives.append(fallback)
                    valid_perspectives.extend(fallback_perspectives)

        # Sort results by bias_x to maintain order
        valid_perspectives.sort(key=lambda x: x["bias_x"])
        all_persp.extend(valid_perspectives)

        # Stream this color group if callback is provided
        if stream_callback:
            try:
                stream_callback(color_name, valid_perspectives)
            except Exception as e:
                print(f"[warn] Streaming callback failed for {color_name}: {e}")
    
    # Final sort and output
    all_persp.sort(key=lambda x: x["bias_x"])
    final_obj = {"input": statement, "perspectives": all_persp[:len(scaffold)]}
    write_output(args.output, final_obj)
    return 0


def build_arg_parser():
    """Build command line argument parser."""
    p = argparse.ArgumentParser(description="Generate structured perspectives JSON.")
    p.add_argument("--input", default="input.json", help="Input JSON file path")
    p.add_argument("--output", default="output.json", help="Output JSON file path")
    p.add_argument("--endpoint", help="Vertex endpoint path. Overrides VERTEX_ENDPOINT env")
    # Backward compatibility: allow --model but document deprecation.
    p.add_argument("--model", help="(Deprecated) Use --endpoint instead.")
    # Note: --count is removed as perspective count is now only read from config.json
    p.add_argument("--temperature", type=float, default=0.6, help="Sampling temperature")
    return p


def main():
    """Main entry point."""
    parser = build_arg_parser()
    args = parser.parse_args()
    code = run_pipeline(args)

    # Notify server after pipeline completes
    try:
        requests.post("http://127.0.0.1:8000/api/pipeline_complete", json={"status": "done"})
    except Exception as e:
        print(f"Failed to notify server: {e}")

    sys.exit(code)


if __name__ == "__main__":
    main()