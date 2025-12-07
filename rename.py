import os
import json

def insert_into_dict(existing, pos, key, value):
    keys = list(existing.keys())
    keys.insert(pos, key)
    return {k: existing.get(k, value) for k in keys}

for folder in os.listdir("data"):
    with open(f"data/{folder}/brand.json") as f:
        data = json.loads(f.read())

        if "id" in data:
            name = data["id"].lower().replace(" ", "_").replace("-", "_")
        else:
            name = data["name"].lower().replace(" ", "_").replace("-", "_")
        
        data = insert_into_dict(data, 0, "id", name)
        data["id"] = name
        
        os.rename(f"data/{folder}", f"data/{name}")

        with open(f"data/{name}/brand.json", "w") as f:
            f.write(json.dumps(data, indent=2))