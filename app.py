from flask import Flask, render_template, jsonify, request, session
import random
import os

app = Flask(__name__)
app.secret_key = "supersecretkey"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WINNERS_FILE = os.path.join(BASE_DIR, "winners.txt")
photos = [
    {"id": 1, "path": "/static/photos/nazar1.png", "original": "/static/photos/nazar1.png"},
    {"id": 2, "path": "/static/photos/nazar2.png", "original": "/static/photos/nazar2.png"},
    {"id": 3, "path": "/static/photos/nazar3.png", "original": "/static/photos/nazar3.png"},
    {"id": 4, "path": "/static/photos/tnt.png", "original": "/static/photos/tnt.png"},
    {"id": 5, "path": "/static/photos/mine.png", "original": "/static/photos/mine.png"},
    {"id": 6, "path": "/static/photos/roblox.png", "original": "/static/photos/roblox.png"},
    {"id": 7, "path": "/static/photos/grow.png", "original": "/static/photos/grow.png"},
    {"id": 8, "path": "/static/photos/abobus.png", "original": "/static/photos/abobus.png"},
    {"id": 9, "path": "/static/photos/chess.png", "original": "/static/photos/chess.png"},
    {"id": 10, "path": "/static/photos/venom.png", "original": "/static/photos/venom.png"},
    {"id": 11, "path": "/static/photos/dog2.png", "original": "/static/photos/dog2.png"},
    {"id": 12, "path": "/static/photos/granny.png", "original": "/static/photos/granny.png"},
    {"id": 13, "path": "/static/photos/spike.png", "original": "/static/photos/spike.png"},
    {"id": 14, "path": "/static/photos/watermelon.png", "original": "/static/photos/watermelon.png"}
]

# "руйнівні" пороги для різних фільтрів
BASE_FILTERS = {
    "blur": 0,
    "brightness": 100,
    "contrast": 100,
    "grayscale": 0,
    "hue-rotate": 0,
    "invert": 0,
    "saturate": 100,
    "sepia": 0,
    "opacity": 100,
    "drop-shadow": 0,

    "brightness-2": 100,
    "contrast-2": 100,
    "blur-2": 0
}
BAD_RANGES = {
    "brightness": (0, 5),   # занадто темно (майже чорне)
    "contrast": (0, 5),     # повна відсутність контрасту
    "saturate": (0, 10),    # повна сірість
    "grayscale": (90, 100), # повністю ч/б
    "invert": (90, 100),    # інверсія кольорів
    "sepia": (90, 100),     # занадто сильний ефект сепії
    "hue-rotate": (0, 0),   # без обертання кольору (опційно, можна прибрати)
    "blur": (5, 100),       # повністю розмите
}


filters = {
    "blur": (0, 25),
    "brightness": (20, 300),
    "contrast": (20, 300),
    "grayscale": (0, 100),
    "hue-rotate": (0, 360),
    "invert": (0, 100),
    "saturate": (0, 500),
    "sepia": (0, 100),
    "opacity": (30, 100),
    "drop-shadow": (0, 20),

    # додаткові "складні" фільтри — в бекенді лишаємо англ-ключі,
    # фронтенд буде мапити їх на валідні css-функції
    "brightness-2": (20, 500),
    "contrast-2": (20, 500),
    "blur-2": (0, 50)
}

THRESHOLDS = {
    "easy": 0.3,
    "medium": 0.15,
    "hard": 0.13
}


@app.route("/")
def index():
    session["index"] = 0
    shuffled = photos[:]
    random.shuffle(shuffled)
    session["photo_order"] = shuffled
    return render_template("index.html")


@app.route("/next_photo")
def next_photo():
    idx = session.get("index", 0)
    photo_order = session.get("photo_order", photos)

    if idx >= len(photo_order):
        session["index"] = 0
        random.shuffle(photo_order)
        session["photo_order"] = photo_order
        idx = 0

    photo = photo_order[idx]
    session["index"] = idx + 1

    # генеруємо зашумлені значення
    applied_filters = {}
    ranges = {}
    for f, (mn, mx) in filters.items():
        applied_filters[f] = random.randint(mn, mx)
        ranges[f] = [mn, mx]

    # зберігаємо правильну мішень фільтрів
    session["original_filters"] = BASE_FILTERS.copy()

    # додаємо шлях до оригінального фото
    photo_with_original = photo.copy()  # робимо копію словника
    photo_with_original["original"] = photo["path"]

    return jsonify({
        "photo": photo_with_original,
        "filters": applied_filters,
        "ranges": ranges,
        "level": idx + 1,
        "total": len(photo_order)
    })



@app.route("/check_result", methods=["POST"])
def check_result():
    data = request.get_json()
    user_filters = data.get("filters", {})
    difficulty = data.get("difficulty", "medium")

    original = session.get("original_filters", {f: 0 for f in filters})
    threshold = THRESHOLDS.get(difficulty, 0.15)

    diffs = []
    for f in filters:
        max_val = filters[f][1] or 1
        orig_val = original.get(f, 0)
        user_val = user_filters.get(f, 0)
        diff = abs(orig_val - user_val) / max_val
        diffs.append(diff)

    avg_diff = sum(diffs) / len(diffs)

    # 🚫 Перевірка руйнівних діапазонів
    looks_broken = False
    for f, (bad_min, bad_max) in BAD_RANGES.items():
        val = user_filters.get(f, 0)
        if bad_min <= val <= bad_max:
            looks_broken = True
            break

    success = (avg_diff < threshold) and not looks_broken

    return jsonify({
        "success": success,
        "avg_diff": round(avg_diff, 3),
        "threshold": threshold
    })

@app.route("/winners")
def winners():
    try:
        with open(WINNERS_FILE, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        lines = []

    # парсимо "ім’я — ХХХ очків"
    def parse_score(line):
        try:
            return int(line.split("—")[-1].split()[0])
        except:
            return 0

    # сортуємо за очками (спадання)
    lines = sorted(lines, key=parse_score, reverse=True)

    return jsonify({"winners": lines})

@app.route("/add_winner", methods=["POST"])
def add_winner():
    data = request.get_json()
    name = data.get("name", "Анонім").strip() or "Анонім"
    score = data.get("score", 0)

    entry = f"{name} — {score} очків"

    with open(WINNERS_FILE, "a", encoding="utf-8") as f:
        f.write(entry + "\n")

    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)