// РЕСУРСЫ
let silver = 0;
let gold = 0;
let diamond = 0;

// ШАХТА
let mineLevel = 1;

// ГОБЛИНЫ
let goblins = {
  basic:   { count: 1, silver: 1, gold: 0, diamond: 0 },
  gold:    { count: 0, silver: 0, gold: 1, diamond: 0 },
  diamond: { count: 0, silver: 0, gold: 0, diamond: 1 },
  engineer:{ count: 0, silver: 0, gold: 0, diamond: 0 },
  shaman:  { count: 0, silver: 0, gold: 0, diamond: 0 }
};

// ЗАГРУЗКА
if (localStorage.getItem("goblinSave")) {
  const save = JSON.parse(localStorage.getItem("goblinSave"));
  silver = save.silver;
  gold = save.gold;
  diamond = save.diamond;
  mineLevel = save.mineLevel;
  goblins = save.goblins;
}

function saveGame() {
  localStorage.setItem("goblinSave", JSON.stringify({
    silver, gold, diamond, mineLevel, goblins
  }));
}

function log(msg) {
  const logDiv = document.getElementById("log");
  const p = document.createElement("p");
  p.textContent = msg;
  logDiv.prepend(p);
}

// ДОБЫЧА
function mineTick() {
  let addSilver = 0, addGold = 0, addDiamond = 0;

  addSilver += goblins.basic.count * goblins.basic.silver;
  addGold   += goblins.gold.count * goblins.gold.gold;
  addDiamond+= goblins.diamond.count * goblins.diamond.diamond;

  // бонусы от шамана
  const shamanBonus = 1 + goblins.shaman.count * 0.1;
  addGold *= shamanBonus;
  addDiamond *= shamanBonus;

  silver += Math.floor(addSilver);
  gold   += Math.floor(addGold);
  diamond+= Math.floor(addDiamond);

  // инженеры уменьшают шанс плохих событий (учтём в randomEvent)
  updateUI();
  saveGame();
}

// РУЧНОЙ СБОР
document.getElementById("collectBtn").addEventListener("click", () => {
  silver += 2 + mineLevel;
  log("Ты лично помог гоблинам и собрал немного ресурсов!");
  updateUI();
  saveGame();
});

// МАГАЗИН
function buyGoblin(type) {
  if (type === "basic") {
    if (silver >= 50) {
      silver -= 50;
      goblins.basic.count++;
      log("Нанят обычный гоблин.");
    } else log("Не хватает серебра.");
  }

  if (type === "gold") {
    if (silver >= 100 && gold >= 20) {
      silver -= 100;
      gold -= 20;
      goblins.gold.count++;
      log("Нанят золотой гоблин.");
    } else log("Не хватает ресурсов.");
  }

  if (type === "diamond") {
    if (silver >= 200 && gold >= 50) {
      silver -= 200;
      gold -= 50;
      goblins.diamond.count++;
      log("Нанят алмазный гоблин.");
    } else log("Не хватает ресурсов.");
  }

  if (type === "engineer") {
    if (silver >= 150 && gold >= 30) {
      silver -= 150;
      gold -= 30;
      goblins.engineer.count++;
      log("Нанят инженер-гоблин.");
    } else log("Не хватает ресурсов.");
  }

  if (type === "shaman") {
    if (silver >= 100 && diamond >= 5) {
      silver -= 100;
      diamond -= 5;
      goblins.shaman.count++;
      log("Нанят шаман-гоблин.");
    } else log("Не хватает ресурсов.");
  }

  updateUI();
  saveGame();
}

// УГЛУБЛЕНИЕ ШАХТЫ
function upgradeMine() {
  const cost = mineLevel * 120;
  if (gold >= cost) {
    gold -= cost;
    mineLevel++;
    log("Шахта стала глубже. Ресурсов будет больше.");
  } else {
    log("Не хватает золота для улучшения шахты.");
  }
  updateUI();
  saveGame();
}

// СЛУЧАЙНЫЕ СОБЫТИЯ
function randomEvent() {
  let roll = Math.random();

  // инженеры снижают шанс обвала
  const engineerReduction = goblins.engineer.count * 0.01;
  if (roll < 0.06 - engineerReduction) {
    const loss = Math.min(silver, 30);
    silver -= loss;
    log("❗ Обвал! Потеряно " + loss + " серебра.");
  } else if (roll < 0.10) {
    const gain = 40 + mineLevel * 5;
    gold += gain;
    log("✨ Золотая жила! +" + gain + " золота.");
  } else if (roll < 0.13) {
    log("🎁 Найден сундук!");
    openChest();
  }

  updateUI();
  saveGame();
}

function openChest() {
  const r = Math.random();
  if (r < 0.5) {
    silver += 100;
    log("Сундук дал 100 серебра.");
  } else if (r < 0.8) {
    gold += 60;
    log("Сундук дал 60 золота.");
  } else {
    diamond += 8;
    log("Сундук дал 8 алмазов.");
  }
}

// UI
function updateUI() {
  document.getElementById("silver").textContent = Math.floor(silver);
  document.getElementById("gold").textContent = Math.floor(gold);
  document.getElementById("diamond").textContent = Math.floor(diamond);
  document.getElementById("mineLevel").textContent = mineLevel;

  document.getElementById("basicCount").textContent = goblins.basic.count;
  document.getElementById("goldCount").textContent = goblins.gold.count;
  document.getElementById("diamondCount").textContent = goblins.diamond.count;
  document.getElementById("engineerCount").textContent = goblins.engineer.count;
  document.getElementById("shamanCount").textContent = goblins.shaman.count;
}

// ТАЙМЕРЫ
setInterval(mineTick, 1000);
setInterval(randomEvent, 15000);

// ПЕРВЫЙ РЕНДЕР
updateUI();