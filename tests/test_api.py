import io
import json


VALID_CARD = {
    "word": "serendipity",
    "translation": "意外的美好发现",
    "origin_translation": "A pleasant discovery made by chance.",
    "phonetic_us": "/ˌserənˈdɪpəti/",
    "phonetic_uk": "/ˌserənˈdɪpəti/",
    "examples": [
        {
            "sentence": "Finding that book was pure serendipity.",
            "translation": "发现那本书纯属意外之喜。",
        }
    ],
}


def test_create_duplicate_and_review_flow(client):
    created = client.post("/api/vocabulary", json=VALID_CARD)
    assert created.status_code == 201
    duplicate = client.post("/api/vocabulary", json={**VALID_CARD, "word": " Serendipity "})
    assert duplicate.status_code == 409

    session = client.get("/api/sessions/cards?count=1").json()
    assert session["cards"][0]["translation"] == "意外的美好发现"
    reviewed = client.post(
        f'/api/cards/{created.json()["id"]}/reviews', json={"grade": "again"}
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["feedback_card"]["translation"] == "意外的美好发现"

    detail = client.get("/api/vocabulary/lookup?word=SERENDIPITY")
    assert detail.status_code == 200
    assert detail.json()["origin_translation"] == VALID_CARD["origin_translation"]
    assert detail.json()["phonetic_us"] == VALID_CARD["phonetic_us"]
    assert detail.json()["fsrs_state"]["review_count"] == 1
    assert detail.json()["reviews"][0]["grade"] == "again"
    assert client.get("/api/vocabulary/serendipity?history_limit=0").json()["reviews"] == []
    assert client.get("/api/vocabulary/lookup?word=missing").status_code == 404


def test_enrich_without_configuration_is_nonfatal(client):
    response = client.post("/api/vocabulary/enrich", json={"word": "lucid"})
    assert response.status_code == 503
    assert "LLM_BASE_URL" in response.json()["detail"]


def test_json_import_is_atomic_on_duplicate(client):
    rows = [VALID_CARD, {**VALID_CARD, "word": "SERENDIPITY"}]
    response = client.post(
        "/api/vocabulary/import",
        files={"file": ("words.json", json.dumps(rows).encode(), "application/json")},
    )
    assert response.status_code == 422
    assert client.get("/api/sessions/cards").json()["cards"] == []


def test_csv_import_with_json_examples(client):
    csv_content = (
        'word,translation,origin_translation,phonetic_us,phonetic_uk,examples\n'
        'lucid,清晰的,Able to think clearly,/ˈluːsɪd/,/ˈluːsɪd/,'
        '"[{""sentence"":""She gave a lucid explanation."",'
        '""translation"":""她做出了清晰的解释。""}]"\n'
    )
    response = client.post(
        "/api/vocabulary/import",
        files={"file": ("words.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert response.status_code == 201, response.text
    assert response.json()["imported_count"] == 1
