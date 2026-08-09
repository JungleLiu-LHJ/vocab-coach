import json
import os
import subprocess
import sys
from pathlib import Path


VALID_CARD = [
    {
        "word": "lucid",
        "translation": "清晰的",
        "origin_translation": "Clear and easy to understand.",
        "phonetic_us": "/test/",
        "phonetic_uk": "/test/",
        "examples": [
            {"sentence": "A lucid explanation.", "translation": "一个清晰的解释。"}
        ],
    }
]


def run_cli(tmp_path: Path, *args: str, input_text: str | None = None):
    env = os.environ.copy()
    env["VOCAB_DATABASE_URL"] = f"sqlite:///{tmp_path / 'cli.db'}"
    return subprocess.run(
        [sys.executable, "-m", "vocab_coach.cli", *args],
        input=input_text,
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )


def test_cli_import_skips_existing_and_renders_cards(tmp_path):
    payload = json.dumps(VALID_CARD, ensure_ascii=False)
    first = run_cli(tmp_path, "import", "--format", "json", input_text=payload)
    second = run_cli(tmp_path, "import", "--format", "json", input_text=payload)
    cards = run_cli(tmp_path, "cards", "--count", "1", "--channel", "wechat")

    assert first.returncode == 0, first.stderr
    assert json.loads(first.stdout)["imported_count"] == 1
    assert json.loads(second.stdout)["skipped_existing_count"] == 1
    rendered = json.loads(cards.stdout)["rendered"][0]
    assert "中文：清晰的" in rendered["text"]


def test_cli_invalid_batch_is_atomic(tmp_path):
    invalid = json.dumps(VALID_CARD + [{"word": "broken"}], ensure_ascii=False)
    result = run_cli(tmp_path, "import", "--format", "json", input_text=invalid)
    cards = run_cli(tmp_path, "cards", "--count", "10")

    assert result.returncode == 2
    error_json = result.stderr[result.stderr.rfind("\n{") + 1 :]
    assert json.loads(error_json)["error"] == "import_validation"
    assert json.loads(cards.stdout)["cards"] == []
