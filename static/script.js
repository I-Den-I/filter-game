const filterNames = {
  "blur": "Розмиття",
  "brightness": "Яскравість",
  "contrast": "Контраст",
  "grayscale": "Чорно-біле",
  "hue-rotate": "Відтінок",
  "invert": "Інверсія",
  "saturate": "Насиченість",
  "sepia": "Сепія",
  "opacity": "Прозорість",
  "drop-shadow": "Тінь",

  "brightness-2": "Яскравість+",
  "contrast-2": "Контраст+",
  "blur-2": "Розмиття+"
};

let currentPhoto = null;

let score = 0; // глобально

function addPoints(points) {
  score += points;
  const scoreDiv = document.getElementById("score");
  scoreDiv.textContent = `Очки: ${score}`;
  scoreDiv.dataset.value = score;
}

// Зручна функція для мапінгу ключа → валідна CSS-функція
function getFilterCSS(key, val) {
  // Перетворення чисел для правильних одиниць:
  // - для brightness/contrast/saturate/... — використовуємо число (1.0 = 100%)
  // - для opacity — використовуємо 0..1
  // - для blur — px
  // - для hue-rotate — deg
  // - drop-shadow — px offset

  if (key === "blur" || key === "blur-2") {
    return `blur(${val}px)`;
  }
  if (key === "hue-rotate") {
    return `hue-rotate(${val}deg)`;
  }
  if (key === "drop-shadow") {
    // робимо помірну тінь
    return `drop-shadow(${val}px ${val}px 5px rgba(0,0,0,0.6))`;
  }
  if (key === "opacity") {
    // val приходить як 30..100 → перетворимо у 0..1
    const v = Math.max(0, Math.min(1, val / 100));
    return `opacity(${v})`;
  }

  // brightness/contrast/saturate/sepiа/grayscale/invert — використовуємо число (val/100)
  if (key === "brightness" || key === "brightness-2") {
    return `brightness(${(val/100).toFixed(2)})`;
  }
  if (key === "contrast" || key === "contrast-2") {
    return `contrast(${(val/100).toFixed(2)})`;
  }
  if (key === "saturate") {
    return `saturate(${(val/100).toFixed(2)})`;
  }
  if (key === "sepia") {
    return `sepia(${(val/100).toFixed(2)})`;
  }
  if (key === "grayscale") {
    return `grayscale(${(val/100).toFixed(2)})`;
  }
  if (key === "invert") {
    return `invert(${(val/100).toFixed(2)})`;
  }

  // fallback (на випадок інших назв)
  return `${key}(${val})`;
}


// Завантаження фото з бекенду
async function loadPhoto() {
  const res = await fetch("/next_photo");
  const data = await res.json();

  currentPhoto = data.photo;
  document.getElementById("level").textContent = `Рівень ${data.level} з ${data.total}`;

  const img = document.getElementById("photo");
  img.classList.remove("ready");
  img.src = data.photo.path;
  img.onload = () => img.classList.add("ready");

  const slidersDiv = document.getElementById("sliders");
  slidersDiv.innerHTML = "";

  // ranges: об'єкт {filter: [min,max], ...}
  const ranges = data.ranges || {};

  for (const [f, appliedVal] of Object.entries(data.filters)) {
    const range = ranges[f] || [0, appliedVal || 100];

    const wrapper = document.createElement("div");
    wrapper.className = "filter-item";

    const label = document.createElement("label");
    label.textContent = filterNames[f] || f;
    wrapper.appendChild(label);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = range[0];
    slider.max = range[1];
    slider.value = appliedVal;
    slider.dataset.filter = f;
    slider.dataset.initial = appliedVal; // зберігаємо початкове "зашумлене" значення

    // показ числового значення поруч (корисно для UX)
    const valueDisplay = document.createElement("span");
    valueDisplay.className = "val-display";
    valueDisplay.style.float = "right";
    valueDisplay.style.marginLeft = "8px";
    valueDisplay.textContent = slider.value;
    label.appendChild(valueDisplay);

    slider.oninput = () => {
      // при русі слайдера показуємо значення та оновлюємо фільтри
      valueDisplay.textContent = slider.value;
      const difficulty = document.getElementById("difficulty").value;
      if (difficulty === "hard") {
        // хаотичний режим: значення може стрибати
        const min = parseInt(slider.min, 10);
        const max = parseInt(slider.max, 10);
        slider.value = Math.floor(Math.random() * (max - min + 1)) + min;
        valueDisplay.textContent = slider.value;
      }
      updateFilters();
    };

    wrapper.appendChild(slider);
    slidersDiv.appendChild(wrapper);
  }

  updateFilters();
}


// Застосування CSS-фільтрів до картинки
function updateFilters() {
  const sliders = document.querySelectorAll("#sliders input");
  let filterStr = "";

  sliders.forEach(slider => {
    const f = slider.dataset.filter;
    const val = Number(slider.value);
    filterStr += getFilterCSS(f, val) + " ";
  });

  document.getElementById("photo").style.filter = filterStr.trim();
}


async function checkFilters() {
  const sliders = document.querySelectorAll("#sliders input");
  const filters = {};
  sliders.forEach(slider => filters[slider.dataset.filter] = parseInt(slider.value));

  const difficulty = document.getElementById("difficulty").value;

  const res = await fetch("/check_result", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({filters, difficulty})
  });

  const data = await res.json();
  const resultEl = document.getElementById("result");
  resultEl.classList.add("show");

  if (data.success) {
    // ✅ Нарахування очків
    let points = 0;
    if (difficulty === "easy") points = 100;
    if (difficulty === "medium") points = 200;
    if (difficulty === "hard") points = 500;
    addPoints(points);

    resultEl.textContent = `✅ Дуже схоже!`;

    // Чекаємо перед переходом до наступного фото
    setTimeout(async () => {
      resultEl.classList.remove("show");

      // Перевіряємо чи це був останній рівень
      const levelText = document.getElementById("level").textContent; 
      // формату "Рівень X з Y"
      const match = levelText.match(/Рівень (\d+) з (\d+)/);
      if (match) {
        const level = parseInt(match[1]);
        const total = parseInt(match[2]);

        if (level === total) {
          // 🎉 Усі рівні пройдено → зберігаємо переможця
          const name = document.getElementById("playerName").value || "Анонім";
          const score = parseInt(document.getElementById("score").dataset.value) || 0;

          await fetch("/add_winner", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({name, score})
          });

          alert(`Вітаємо, ${name}! Ви завершили гру з ${score} очками 🏆`);
        } else {
          loadPhoto(); // ще є рівні → завантажуємо наступний
        }
      }
    }, 1200);

  } else {
    resultEl.textContent = `❌ Ще не дуже схоже! Спробуй ще раз.`;
  }
}



function resetSlidersToInitial() {
  const sliders = document.querySelectorAll("#sliders input");
  sliders.forEach(slider => {
    // ✅ Це значення приходить з бекенду як початкове "зашумлене"
    if (slider.dataset.initial !== undefined) slider.value = slider.dataset.initial;
    
    const valDisplay = slider.parentElement.querySelector(".val-display");
    if (valDisplay) valDisplay.textContent = slider.value;
  });
  updateFilters();
}
// ==== Логіка модалки переможців ====
const winnersBtn = document.getElementById("winnersBtn");
const winnersModal = document.getElementById("winnersModal");
const closeBtn = document.querySelector(".modal .close");
const winnersList = document.getElementById("winnersList");

// Відкрити модалку + завантажити переможців
winnersBtn.addEventListener("click", async () => {
  winnersModal.style.display = "block";

  // Отримати список переможців з бекенду
  try {
    const res = await fetch("/winners");
    const data = await res.json();
    winnersList.innerHTML = "";

    if (data.winners.length === 0) {
      winnersList.innerHTML = "<li>Ще немає переможців 🕹️</li>";
    } else {
      data.winners.forEach(w => {
        const li = document.createElement("li");
        li.textContent = w;
        winnersList.appendChild(li);
      });
    }
  } catch (err) {
    winnersList.innerHTML = "<li>Помилка завантаження ❌</li>";
  }
});

// Закрити (хрестик)
closeBtn.addEventListener("click", () => {
  winnersModal.style.display = "none";
});

// Закрити при кліку поза вікном
window.addEventListener("click", (event) => {
  if (event.target === winnersModal) {
    winnersModal.style.display = "none";
  }
});

document.getElementById("winnersBtn").addEventListener("click", async () => {
  const res = await fetch("/winners");
  const winners = await res.json();

  // Сортуємо за очками (спадаюче)
  winners.sort((a, b) => b.score - a.score);

  const list = document.getElementById("winnersList");
  list.innerHTML = "";
  winners.forEach((w, i) => {
    const li = document.createElement("li");
    li.textContent = `${w.name} — ${w.score} очків`;
    list.appendChild(li);
  });

  document.getElementById("winnersModal").style.display = "block";
});

// Ініціалізація
window.onload = () => {
  // слухач додаємо один раз
  const diffEl = document.getElementById("difficulty");
  if (diffEl) {
    diffEl.addEventListener("change", () => {
      resetSlidersToInitial();
    });
  }

  loadPhoto();
};
