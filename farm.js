/* farm.js — безопасная версия с userId = Telegram ID (если доступен) */
(function(){
  const tg = window.Telegram?.WebApp || null;
  try { if (tg && tg.initDataUnsafe) tg.expand(); } catch(e){}
  const userId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : "guest_" + Math.random().toString(36).slice(2);
  window.userId = userId;

  let eggs = 0, ton = 0, chickens = 0, xp = 0, farmLevel = 1, speedLevel = 1, profitLevel = 1;
  const eggTimerMax = 86; let eggTimer = eggTimerMax;
  let incubatorActive = false, incubatorProgress = 0;

  const usersRef = window.db?.ref("users");
  const limitedBuyRef = window.db?.ref("limitedBuyCount");

  function safeNumber(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }

  function saveGame(){
    if (!usersRef) return;
    usersRef.child(userId).set({
      eggs: Number(eggs), ton: Number(ton), chickens: Number(chickens),
      xp: Number(xp), farmLevel: Number(farmLevel), speedLevel: Number(speedLevel), profitLevel: Number(profitLevel)
    });
  }

  function loadGame(){
    if (!usersRef){ updateUI(); return; }
    usersRef.child(userId).once("value").then(snap=>{
      if (snap.exists()){
        const d = snap.val();
        eggs = safeNumber(d.eggs); ton = safeNumber(d.ton); chickens = safeNumber(d.chickens);
        xp = safeNumber(d.xp); farmLevel = safeNumber(d.farmLevel,1); speedLevel = safeNumber(d.speedLevel,1); profitLevel = safeNumber(d.profitLevel,1);
      }
      updateUI();
    }).catch(()=>updateUI());
  }

  function updateUI(){
    const setText=(id,v)=>{ const el=document.getElementById(id); if(el) el.innerText = (typeof v==='number' ? (Number.isFinite(v)?v:0) : v); };
    setText("eggs", eggs); setText("ton", (typeof ton==='number')?ton.toFixed(2):"0.00"); setText("chickens", chickens);
    setText("xp", xp); setText("farmLevel", farmLevel); setText("speedLevelText", speedLevel); setText("profitLevelText", profitLevel);
    setText("eggsPerHour", chickens * profitLevel * 40);
    const wt=document.getElementById("walletTon"), we=document.getElementById("walletEggs"), wc=document.getElementById("walletChickens");
    if(wt) wt.innerText = (typeof window.ton==='number')?window.ton.toFixed(2):"0.00";
    if(we) we.innerText = eggs; if(wc) wc.innerText = chickens;
  }

  function notify(text){
    const container=document.getElementById("notifyContainer"); if(!container) return;
    const div=document.createElement("div"); div.className="notify"; div.innerText=text; container.appendChild(div);
    setTimeout(()=>div.remove(),3000);
  }

  if (limitedBuyRef){
    limitedBuyRef.on("value", snap => { const count = snap.val() || 0; const el = document.getElementById("limitedBought"); if(el) el.innerText = count; });
  }

  function buyChickensLimited(){
    if (!limitedBuyRef){ notify("❌ DB not ready"); return; }
    limitedBuyRef.once("value").then(snap=>{
      const count = snap.val() || 0;
      if (count >= 100){ notify("❌ Лимит исчерпан"); return; }
      if (ton < 1){ notify("❌ Нужно 1 TON"); return; }
      ton = Number(ton) - 1; chickens = Number(chickens) + 3000;
      limitedBuyRef.set(count + 1);
      notify("🐔 Куплено 3000 кур");
      updateUI(); saveGame();
    });
  }

  setInterval(()=>{
    if (chickens <= 0) return;
    eggTimer -= speedLevel;
    if (eggTimer <= 0){
      const produced = Number(chickens) * Number(profitLevel);
      eggs = Number(eggs) + produced; xp = Number(xp) + 1;
      if (xp >= farmLevel * 10){ farmLevel++; xp = 0; notify("⬆ Уровень фермы!"); }
      eggTimer = eggTimerMax;
    }
    const percent = Math.max(0, Math.min(100, 100 - (eggTimer / eggTimerMax) * 100));
    const pf = document.getElementById("progressFill"); if (pf) pf.style.width = percent + "%";
    updateUI(); saveGame();
  }, 1000);

  function startIncubator(){
    if (incubatorActive){ notify("⏳ Инкубатор работает"); return; }
    if (eggs < 500){ notify("❌ Нужно 500 яиц"); return; }
    eggs = Number(eggs) - 500; incubatorActive = true; incubatorProgress = 0; notify("🧪 Инкубатор запущен");
    updateUI();
  }

  setInterval(()=>{
    if (!incubatorActive) return;
    incubatorProgress += 2;
    const incStatus = document.getElementById("incStatus"), incFill = document.getElementById("incubatorFill");
    if (incStatus) incStatus.innerText = incubatorProgress + "%";
    if (incFill) incFill.style.width = incubatorProgress + "%";
    if (incubatorProgress >= 100){ incubatorActive = false; chickens = Number(chickens) + 50; notify("🐣 +50 кур"); updateUI(); saveGame(); }
  }, 1000);

  function upgradeSpeed(){ if (ton < 5){ notify("❌ Нужно 5 TON"); return; } ton = Number(ton) - 5; speedLevel++; notify("⚡ Скорость +1"); updateUI(); saveGame(); }
  function upgradeProfit(){ if (ton < 5){ notify("❌ Нужно 5 TON"); return; } ton = Number(ton) - 5; profitLevel++; notify("💰 Прибыль +1"); updateUI(); saveGame(); }

  // mint timer
  let mintTime = Date.now() + 86400000;
  setInterval(()=>{
    let left = mintTime - Date.now(); if (left < 0) left = 0;
    let h = Math.floor(left/3600000), m = Math.floor((left%3600000)/60000), s = Math.floor((left%60000)/1000);
    const el = document.getElementById("globalTimer"); if (el) el.innerText = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  },1000);

  // export
  window.eggs = eggs; window.ton = ton; window.chickens = chickens; window.xp = xp;
  window.farmLevel = farmLevel; window.speedLevel = speedLevel; window.profitLevel = profitLevel;
  window.saveGame = saveGame; window.loadGame = loadGame; window.updateUI = updateUI; window.notify = notify;
  window.buyChickensLimited = buyChickensLimited; window.startIncubator = startIncubator;
  window.upgradeSpeed = upgradeSpeed; window.upgradeProfit = upgradeProfit;

  loadGame();
})();