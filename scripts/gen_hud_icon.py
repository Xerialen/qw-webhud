#!/usr/bin/env python3
"""gen_hud_icon.py - generate a HUD icon locally via ComfyUI (SDXL) and cut it out with rembg.

Runs in WSL2 with the ComfyUI venv python (has requests + rembg):
  /home/xerial/tools/ComfyUI/venv/bin/python scripts/gen_hud_icon.py \
      --name quad --prompt "glowing quad damage crystal icon, ..." [--no-rembg]

Talks to ComfyUI on 127.0.0.1:8188 (mirrored WSL net -> same socket from Windows). Writes the
transparent PNG to <repo>/src/public/img/<name>.png (override with --out). The raw pre-cutout image is
kept as <name>-raw.png for debugging. Zero new deps beyond what the ComfyUI venv already has.
"""
import argparse, json, os, sys, time, urllib.request, urllib.parse

COMFY = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
HERE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.normpath(os.path.join(HERE, "..", "src", "public", "img"))


def workflow(positive, negative, width, height, steps, cfg, seed, ckpt):
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["4", 1]}},
        "3": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "dpmpp_2m",
            "scheduler": "karras", "denoise": 1.0,
            "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "hudicon", "images": ["8", 0]}},
    }


def post_json(path, obj):
    data = json.dumps(obj).encode()
    req = urllib.request.Request(COMFY + path, data=data, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get_json(path):
    return json.loads(urllib.request.urlopen(COMFY + path, timeout=30).read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True, help="output basename (-> <name>.png)")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--negative", default="text, words, watermark, signature, blurry, busy background, photo, frame, border")
    ap.add_argument("--out", default=None, help="output PNG path (default <repo>/src/public/img/<name>.png)")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--steps", type=int, default=28)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--ckpt", default="sd_xl_base_1.0.safetensors")
    ap.add_argument("--no-rembg", action="store_true", help="skip background removal")
    args = ap.parse_args()

    out = args.out or os.path.join(IMG_DIR, args.name + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)

    print(f"[gen] submitting SDXL prompt to {COMFY} ...", flush=True)
    wf = workflow(args.prompt, args.negative, args.width, args.height, args.steps, args.cfg, args.seed, args.ckpt)
    pid = post_json("/prompt", {"prompt": wf, "client_id": "qwgen"})["prompt_id"]
    print(f"[gen] prompt_id={pid}; waiting for render ...", flush=True)

    img = None
    for _ in range(180):  # up to ~3 min
        time.sleep(1)
        hist = get_json("/history/" + pid)
        if pid in hist and hist[pid].get("outputs"):
            for node in hist[pid]["outputs"].values():
                for im in node.get("images", []):
                    img = im
                    break
            if img:
                break
    if not img:
        print("[gen] ERROR: no image produced (timeout)", file=sys.stderr); sys.exit(1)

    q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "output")})
    raw = urllib.request.urlopen(COMFY + "/view?" + q, timeout=30).read()
    raw_path = os.path.join(os.path.dirname(out), args.name + "-raw.png")
    with open(raw_path, "wb") as f:
        f.write(raw)
    print(f"[gen] raw saved {raw_path} ({len(raw)//1024} KB)", flush=True)

    if args.no_rembg:
        with open(out, "wb") as f:
            f.write(raw)
    else:
        print("[gen] removing background (rembg; first run downloads the u2net model) ...", flush=True)
        from rembg import remove
        cut = remove(raw)
        with open(out, "wb") as f:
            f.write(cut)
    print(f"[gen] DONE {out} ({os.path.getsize(out)//1024} KB)", flush=True)
    print(out)


if __name__ == "__main__":
    main()
