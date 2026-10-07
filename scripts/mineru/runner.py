"""ArguMesh's private MinerU entry point. Never imports the user's Python packages."""
import json
import multiprocessing
import os
from pathlib import Path
import sys


def progress(stage, completed=0, total=0):
    print("ARGUMESH_MINERU=" + json.dumps({"stage": stage, "completed": completed, "total": total}), flush=True)


def prepare():
    from mineru.utils.enum_class import ModelPath
    from mineru.utils.models_download_utils import auto_download_and_get_model_root_path
    paths = [ModelPath.pp_doclayout_v2, ModelPath.unimernet_small, ModelPath.pytorch_paddle,
             ModelPath.slanet_plus, ModelPath.unet_structure, ModelPath.paddle_table_cls,
             ModelPath.pp_formulanet_plus_m]
    config_path = Path(os.environ["MINERU_TOOLS_CONFIG_JSON"])
    checkpoint = config_path.with_name("prepared-groups.json")
    try:
        completed = json.loads(checkpoint.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        completed = []
    # The CLI rejects an explicit 'auto' environment value; its config supports auto detection.
    os.environ.pop("MINERU_MODEL_SOURCE", None)
    for index, model in enumerate(paths):
        progress("downloading", index, len(paths))
        config = json.loads(config_path.read_text(encoding="utf-8"))
        root = config.get("models-dir", {}).get("pipeline")
        if model not in completed or not root or not (Path(root) / model).exists():
            # A cancelled directory download can leave some files behind. Force snapshot_download
            # to check the complete group rather than accepting mere directory existence.
            config.setdefault("models-dir", {}).pop("pipeline", None)
            config_path.write_text(json.dumps(config), encoding="utf-8")
            auto_download_and_get_model_root_path(model, repo_mode="pipeline")
            if model not in completed:
                completed.append(model)
            temporary = checkpoint.with_suffix(".tmp")
            temporary.write_text(json.dumps(completed), encoding="utf-8")
            temporary.replace(checkpoint)
        progress("downloading", index + 1, len(paths))
    progress("ready", len(paths), len(paths))


def main():
    mode = sys.argv[1]
    if mode == "check":
        from importlib.metadata import version
        import torch
        import torchvision
        from mineru.cli.common import ensure_backend_dependencies
        ensure_backend_dependencies("pipeline")
        from mineru.backend.pipeline import model_init  # Validate the complete inference import chain.
        assert version("mineru") == "3.4.2"
        assert "+cpu" in torch.__version__
        print(json.dumps({"mineru": version("mineru"), "torch": torch.__version__, "python": sys.version.split()[0]}))
        return
    config = Path(os.environ["MINERU_TOOLS_CONFIG_JSON"])
    config.parent.mkdir(parents=True, exist_ok=True)
    if not config.exists():
        config.write_text(json.dumps({"config_version": "1.3.2", "models-dir": {}, "model-source": "auto"}), encoding="utf-8")
    if mode == "prepare":
        prepare()
    elif mode == "parse":
        from mineru.cli.client import main as parse
        parse(args=sys.argv[2:])
    else:
        raise ValueError("Unknown parser mode")


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
