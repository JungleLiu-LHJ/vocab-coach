import json
from types import SimpleNamespace

import pytest

from vocab_coach.config import Settings
from vocab_coach.schemas import VocabularyDraft
from vocab_coach.services.enrichment import EnrichmentResponseError, enrich_vocabulary


class FakeCompletions:
    def __init__(self, content: str):
        self.content = content

    def create(self, **_kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))]
        )


def fake_client(content: str):
    return SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions(content)))


def test_enrichment_preserves_user_fields_and_adds_examples():
    settings = Settings(llm_base_url="http://local/v1", llm_api_key="x", llm_model="model")
    generated = json.dumps(
        {
            "translation": None,
            "origin_translation": "Clear and easy to understand.",
            "phonetic_us": "/ˈluːsɪd/",
            "phonetic_uk": "/ˈluːsɪd/",
            "examples": [
                {
                    "sentence": f"A lucid example number {i}.",
                    "translation": f"第 {i} 个清晰的例子。",
                }
                for i in range(9)
            ],
        }
    )
    result = enrich_vocabulary(
        VocabularyDraft(
            word="lucid",
            translation="清晰的",
            examples=[{"sentence": "Her answer was lucid.", "translation": "她的回答很清晰。"}],
        ),
        settings,
        client=fake_client(generated),
    )
    assert result.translation == "清晰的"
    assert result.origin_translation == "Clear and easy to understand."
    assert result.phonetic_us == "/ˈluːsɪd/"
    assert result.phonetic_uk == "/ˈluːsɪd/"
    assert result.examples[0].sentence == "Her answer was lucid."
    assert result.examples[0].translation == "她的回答很清晰。"
    assert len(result.examples) == 10


def test_enrichment_rejects_invalid_model_json():
    settings = Settings(llm_base_url="http://local/v1", llm_api_key="x", llm_model="model")
    with pytest.raises(EnrichmentResponseError):
        enrich_vocabulary(
            VocabularyDraft(word="lucid"), settings, client=fake_client("not json")
        )


def test_enrichment_adds_chinese_translations_to_legacy_examples():
    settings = Settings(llm_base_url="http://local/v1", llm_api_key="x", llm_model="model")
    generated_examples = [
        {
            "sentence": f"A lucid legacy sentence {i}.",
            "translation": f"第 {i} 个清晰的旧例句。",
        }
        for i in range(10)
    ]
    generated = json.dumps(
        {
            "translation": None,
            "origin_translation": None,
            "phonetic_us": "/ˈluːsɪd/",
            "phonetic_uk": "/ˈluːsɪd/",
            "examples": generated_examples,
        }
    )
    draft = VocabularyDraft(
        word="lucid",
        translation="清晰的",
        origin_translation="Clear and easy to understand.",
        examples=[
            {"sentence": example["sentence"], "translation": ""}
            for example in generated_examples
        ],
    )

    result = enrich_vocabulary(draft, settings, client=fake_client(generated))

    assert len(result.examples) == 10
    assert all(example.translation for example in result.examples)
