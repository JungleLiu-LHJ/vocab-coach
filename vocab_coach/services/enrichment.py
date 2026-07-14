import json
from typing import Any

from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

from vocab_coach.config import Settings
from vocab_coach.schemas import ExampleSentence, VocabularyDraft


class EnrichmentNotConfiguredError(RuntimeError):
    pass


class EnrichmentResponseError(RuntimeError):
    pass


class GeneratedVocabulary(BaseModel):
    translation: str | None = None
    origin_translation: str | None = None
    phonetic_us: str | None = None
    phonetic_uk: str | None = None
    examples: list[ExampleSentence] = Field(default_factory=list)


def enrich_vocabulary(
    draft: VocabularyDraft,
    settings: Settings,
    *,
    client: Any | None = None,
) -> VocabularyDraft:
    if not settings.llm_is_configured and client is None:
        raise EnrichmentNotConfiguredError(
            "Configure LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL to use enrichment"
        )

    missing_example_count = max(0, 10 - len(draft.examples))
    has_untranslated_examples = any(not example.translation for example in draft.examples)
    if (
        draft.translation
        and draft.origin_translation
        and draft.phonetic_us
        and draft.phonetic_uk
        and missing_example_count == 0
        and not has_untranslated_examples
    ):
        return draft

    client = client or OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)
    prompt = {
        "word": draft.word,
        "existing_translation_zh": draft.translation,
        "existing_definition_en": draft.origin_translation,
        "existing_phonetic_us": draft.phonetic_us,
        "existing_phonetic_uk": draft.phonetic_uk,
        "existing_examples": [example.model_dump() for example in draft.examples],
        "examples_needed": missing_example_count,
    }
    instructions = (
        "You are an expert English lexicographer creating a high-quality vocabulary card for a "
        "Chinese English learner. Complete only the missing fields. Return only one valid JSON "
        "object with exactly these keys: translation, origin_translation, phonetic_us, phonetic_uk, "
        "examples. For every definition or phonetic field already supplied by the user, return null; "
        "never rewrite user content. translation must be a concise but comprehensive Chinese "
        "definition. Group meanings by part of speech and cover the important modern senses a learner "
        "is likely to encounter; separate senses clearly and do not add rare or obsolete meanings. "
        "origin_translation must be a clear English definition covering the same parts of speech and "
        "senses. phonetic_us and phonetic_uk must each contain one primary modern pronunciation in "
        "standard IPA between slash marks. phonetic_us must use General American, rhotic conventions "
        "such as /ɝ/ and /ɚ/ where appropriate; phonetic_uk must use standard modern British, normally "
        "non-rhotic conventions. Do not represent an American vowel merely by adding r to a British "
        "IPA vowel. If the pronunciations truly are identical, return the same IPA for both. examples "
        "must be an array of objects shaped as {sentence: string, translation: string}. Include a "
        "Chinese translation for every sentence. For each existing example whose translation is empty, "
        "return the same English sentence with its Chinese translation filled in. Also return exactly "
        "examples_needed new, natural, modern, self-contained sentence objects. Every English sentence "
        "must contain the target "
        "word itself or a normal inflected form. Distribute the examples across the distinct common "
        "meanings and parts of speech instead of repeating one sense. Prefer everyday, workplace, "
        "news, travel, and study contexts. Make the intended meaning inferable from context, vary the "
        "grammar and situation, avoid proper-noun trivia, and do not duplicate existing examples."
    )
    try:
        response = client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": instructions},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        content = response.choices[0].message.content
        generated = GeneratedVocabulary.model_validate_json(content or "{}")
    except (ValidationError, json.JSONDecodeError, IndexError, AttributeError, TypeError) as exc:
        raise EnrichmentResponseError("The model returned invalid vocabulary JSON") from exc
    except Exception as exc:
        raise EnrichmentResponseError(f"Vocabulary enrichment failed: {exc}") from exc

    translation = draft.translation or generated.translation
    origin_translation = draft.origin_translation or generated.origin_translation
    phonetic_us = draft.phonetic_us or generated.phonetic_us
    phonetic_uk = draft.phonetic_uk or generated.phonetic_uk
    generated_by_sentence = {
        example.sentence.casefold(): example for example in generated.examples
    }
    examples: list[ExampleSentence] = []
    seen: set[str] = set()
    for existing in draft.examples:
        key = existing.sentence.casefold()
        generated_match = generated_by_sentence.get(key)
        examples.append(
            ExampleSentence(
                sentence=existing.sentence,
                translation=(
                    existing.translation
                    or (generated_match.translation if generated_match is not None else "")
                ),
            )
        )
        seen.add(key)
    for generated_example in generated.examples:
        key = generated_example.sentence.casefold()
        if key not in seen:
            examples.append(generated_example)
            seen.add(key)
        if len(examples) == 10:
            break
    if (
        not translation
        or not origin_translation
        or not phonetic_us
        or not phonetic_uk
        or len(examples) < 10
        or any(not example.translation for example in examples)
    ):
        raise EnrichmentResponseError("The model did not provide all missing vocabulary fields")
    return VocabularyDraft(
        word=draft.word,
        translation=translation,
        origin_translation=origin_translation,
        phonetic_us=phonetic_us,
        phonetic_uk=phonetic_uk,
        examples=examples,
    )
