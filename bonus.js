/* bonus.js — ежедневный бонус (минимальная реализация) */
(function(){
  const userId = window.userId || ("guest_" + Math.random().toString(36).slice(2));
  const bonusRef = db.ref("dailyBonus").child(userId);
  window.claimDailyBonus = function(){
    bonusRef.once("value").then(snap=>{
      const last = snap.val() || 0;
      const now = Date.now();
      if (now - last < 24*3600*1000){ window.notify?.("⏳ Бонус уже получен"); return; }
      bonusRef.set(now);
      // начисляем 0.1 TON как пример
      if (db.ref) db.ref("users").child(userId).child("ton").transaction(v => (Number(v)||0) + 0.1);
      window.notify?.("🎁 Бонус: +0.1 TON");
    });
  };
})();